"""Sohbet asistanı — POST /sohbet (auth-korumalı, araç-çağıran chatbot arkayüzü).

Akış (spec: docs/09-sohbet-asistani.md):
  1) Niyet tespiti  — LLM (llm_json) birincil; yok/mock/hata → fallback_niyet (regex).
  2) Araç yürütme   — sorgu_repo / panel_istatistik / hybrid_ara (hepsi owner-scoped).
  3) Yanıt kompoz.  — LLM (llm_text) doğal cevap; yok → sablon_yanit (deterministik).

Sohbet geçmişi oturumluktur (frontend state) — DB'ye yazılmaz. Kayıtlar DB'den maskeli
gelir; asistan ham evrak metni döndürmez. Mevzuat maddesi uydurulmaz (bilgi tabanı yalnız
site anlatır; mevzuat cevapları BM25 arama sonucuna dayanır).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from agents import config as _cfg
from agents.llm import ChatMessage
from agents.nodes._llm_extract import (
    LLM_NODE_TIMEOUT_S,
    dusunme_marjli,
    llm_json,
    llm_text,
    real_llm,
)
from agents.sohbet_niyet import (
    KAYIT_TURU,
    LIMIT_VARSAYILAN,
    NIYETLER,
    bilgi_yaniti,
    fallback_niyet,
    onay_teyit,
    sablon_yanit,
    talimat_cikar,
)
from api.middleware.ratelimit import rate_limit
from api.pii import mask_for_llm
from api.routes import mevzuat as mevzuat_katalog_mod
from api.routes.sohbet_araclar import arac_dongusu
from auth.deps import _ROL_HIYERARSI, CurrentUser
from core.sesli_brifing import karsilama_metni
from core.tts_kota import kota_dus
from core.tts_openai import tts_enabled, tts_media_type, tts_openai
from db.repositories import KararError, dogrula_denetim, onayla_ve_gonder
from db.repositories.mevzuat_repo import hybrid_ara
from db.repositories.sorgu_repo import (
    gelen_evrak_listele,
    giden_evrak_listele,
    islem_detay,
    islem_listele,
    panel_istatistik,
    taslak_listele,
)
from db.session import get_session

log = structlog.get_logger()
router = APIRouter(tags=["sohbet"])

Session = Annotated[AsyncSession, Depends(get_session)]

_GECMIS_MAX = 8
_DURUMLAR = {"", "gonderildi", "duzenlendi", "reddedildi"}
_RISKLER = {"", "yesil", "sari", "kirmizi"}

_NIYET_SYSTEM = (
    "Sen bir kamu evrak yönetim sisteminin asistanısın. Kullanıcı mesajından niyet çıkar.\n"
    "intent şunlardan biri: gelen_evrak (gelen evrak kuyruğu) | giden_evrak (gönderilen/"
    "reddedilen yazılar) | taslaklar | islem_gecmisi (işlenen evrak geçmişi) | islem_detay "
    "(TEK bir işlemin ayrıntısı; q'ya evrak adı) | denetim_dogrula (denetim izi/hash "
    "doğrulama) | panel_ozet (sayılar/istatistik) | mevzuat_ara (kanun/yönetmelik araması; "
    "q'ya yalın arama sorgusu) | mevzuat_katalog (tüm mevzuat listesi/kategoriler) | "
    "mevzuat_icerik (belirli bir kanunun tam metni; mevzuat_no'ya kanun numarası, q'ya adı) | "
    "taslak_onayla (kullanıcı taslağı ONAYLAyıp göndermek istiyor) | taslak_reddet (taslağı "
    "REDDETmek istiyor) | taslak_revize (taslağı doğal dille DEĞİŞTİR/DÜZELT/revize et; onay "
    "değil) | kurula_sun (taslağı AI Bürokrasi KURULU müzakeresine sun; onaylama değil) | "
    "sla_durum (yasal süresi geçmiş/kritik/vadesi yaklaşan evrak sorgusu) | brifing (bugün "
    "neye bakmalıyım / dikkat gerektirenlerin proaktif özeti) | site_yardim (sistemin "
    "işleyişi/ekranları hakkında soru) | selamlama | genel.\n"
    "durum ∈ ''|gonderildi|duzenlendi|reddedildi; risk ∈ ''|yesil|sari|kirmizi; "
    "limit 1-20 arası tamsayı; mevzuat_no rakam ya da ''.\n"
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"intent": "...", "durum": "", "risk": "", "limit": 5, "q": "", "mevzuat_no": ""}'
)

_KOMPOZ_SYSTEM = (
    "Sen bir kamu evrak yönetim sisteminin asistanısın. Sana kullanıcı sorusu ve sistemden "
    "çekilen GERÇEK veriler (JSON) verilecek. Kısa, resmî-samimi Türkçe bir cevap yaz.\n"
    "Kurallar: YALNIZ verilen veriye dayan — kayıt/sayı/mevzuat maddesi UYDURMA. Veri boşsa "
    "kayıt bulunamadığını söyle. En fazla 5-6 satır; hafif markdown (**kalın**, • madde) "
    "kullanabilirsin. Kayıtları tek tek listele (ad + önemli alanlar)."
)

# Sesli görüşme persona'sı — SESLİ mod (SesliGorusme sahnesi) `sesli=true` gönderince kullanılır.
# Metin sohbetten AYRI: yanıt yüksek sesle okunacağı için KISA, konuşma-dili, markdown'sız olmalı;
# aksi halde madde listeleri/uzun paragraflar sesli okununca robotik/kötü duyulur. İsim env ile
# değiştirilebilir (SESLI_PERSONA_ADI). Grounding (uydurma yasağı) metin moduyla AYNI sıkılıkta.
SESLI_PERSONA_ADI = (os.getenv("SESLI_PERSONA_ADI", "").strip() or "Kamu Evrak")
_SESLI_SYSTEM = (
    # Ad, "Sen {ad}," kalıbıyla YAZILMAZ: canlı ölçümde model bu kalıbı adın parçası sanıp
    # "Ben Sen Kamu Evrak…" diye tanıttı kendini (sesli okununca fena). Ad ayrı cümlede.
    f"Adın {SESLI_PERSONA_ADI}. Bir Türk kamu kurumunun evrak ve yazışma işlerinde UZMAN, "
    f"deneyimli ve yardımsever bir asistansın; kendini tanıtırken 'Ben {SESLI_PERSONA_ADI}' de. "
    "Kullanıcı (bir memur) seninle SESLİ konuşuyor; cevabın yüksek sesle okunacak.\n\n"
    "ÜSLUP: Sıcak, saygılı, kendinden emin — deneyimli bir meslektaş gibi. ÖNCE doğrudan cevap, "
    "sonra gerekçe. UZUNLUK SORUYA GÖRE: kayıt/sayı sorusunda iki-üç kısa cümle; 'neden, nasıl, "
    "hangi durumda' türü açıklama isteyen soruda en fazla beş-altı cümle — kısa tutacağım diye "
    "eksik bırakma, ama dolgu cümle de kurma. Cümleleri KISA ve tek nefeste okunur yap; uzun "
    "bağlaç zincirleri sesli okunduğunda takip edilemez. Markdown, madde işareti, liste, başlık, "
    "yıldız veya emoji ASLA kullanma — yalnız akıcı konuşma cümleleri. 'JSON', 'sistem verisi', "
    "'intent' gibi teknik terimleri KULLANMA. Uygunsa cevabın sonunda bir sonraki adımı öner "
    "('istersen taslak hazırlayayım', 'ilgili birime yönlendirmemi ister misin' gibi).\n\n"
    "İKİ TÜR SORU — İKİ KURAL:\n"
    "1) VERİ sorusu (kullanıcının kayıtları, sayıları; sana gerçek veri verilir): YALNIZ verilen "
    "veriye dayan. Kayıt, sayı, tarih, evrak numarası UYDURMA; veri boşsa 'kaydı bulamadım' de.\n"
    "2) BİLGİ / NASIL sorusu (mevzuat, resmî yazışma, süreç, bu sistemin kullanımı; veri verilmez): "
    "Aşağıdaki uzmanlığından yararlanıp GÜVENLE cevapla — 'veri yok' deyip geçme.\n\n"
    "UZMANLIĞIN (doğrulanmış — 'genel kural' diyerek güvenle söyleyebilirsin):\n"
    "• Dilekçeye cevap süresi 3071 sayılı Kanun'a göre genel olarak otuz gündür.\n"
    "• Bilgi edinme başvurusu (4982) genel olarak on beş iş günü; başka birim ya da kurumun görüşü "
    "gerekiyorsa otuz iş günü.\n"
    "• Elektronik tebligat (7201), adrese ulaştığı tarihi izleyen beşinci günün sonunda yapılmış sayılır.\n"
    "• Güvenli elektronik imza (5070), elle atılan imzayla aynı hukuki sonucu doğurur; ayrıca ıslak "
    "imza gerekmez.\n"
    "• Resmî yazıda kapanış hiyerarşiye göredir: üst ya da eşit makama 'arz ederim', alt makama 'rica "
    "ederim', karma dağıtımda 'arz ve rica ederim'.\n"
    "• İlgi satırı, atıf yapılan önceki yazının tarih ve sayısıyla yazılır. Sayı alanı 'E-DETSİS kodu-"
    "dosya kodu-kayıt numarası' biçimindedir. 'Sayın' hitabı gerçek kişiye kullanılır.\n"
    "• Belge unsurları sırası: başlık, sayı ve tarih, konu, ilgi, gövde, kapanış, imza, ek, dağıtım.\n"
    "• Üst yazı bir belgeyi ileten kısa yazıdır; olur bir onay belgesidir; müzekkere bilgi ya da belge "
    "istemidir; tebligat hukuki sonuç doğuran resmî bildirimdir.\n"
    "• SDP (Standart Dosya Planı) konuya göre standart dosyalama kodudur; kişisel veriler KVKK gereği "
    "gerekmedikçe maskelenir.\n"
    "• BU SİSTEM ne yapar: evrakı okur, türünü sınıflar, bilgi çıkarır, eksikleri bulur, mevzuat önerir "
    "ve özetler; sonra resmî yazı taslağı üretir, ilgili birime yönlendirir ve seni bilgilendirir. Risk "
    "bandı yeşil-sarı-kırmızı bir güven göstergesidir; yasal süreler takip edilir; nihai karar daima "
    "yetkili memurundadır (sistem yalnız önerir, otomatik göndermez).\n\n"
    "ASLA UYDURMA — şunlarda doğrulamaya yönlendir: 2646 sayılı Resmî Yazışma Yönetmeliği'nin SPESİFİK "
    "madde numaraları, kuruma özel SDP ya da DETSİS kodları, belirli bir dosyaya özel istisna, kişiye "
    "özel hukuki görüş ya da karar. Bunlarda 'kesin madde ya da kod için mevzuat ekranından ya da "
    "kurumundan doğrula' de; nihai kararı sen verme, yetkili amire ya da hukuk birimine bırak.\n"
    "Sayıları konuşma diline uygun ver ('otuz gün'). Emin değilsen dürüstçe söyle, uydurma. Kullanıcı "
    "seninle yeni tanışıyorsa kendini tek cümleyle tanıtabilirsin, ama her cevapta tekrarlama."
)


# Sesli yanıt bütçesi — SABİT DEĞİL, soruya göre. Eskiden her sesli tur 150 token'a
# sıkıştırılıyordu; "neden/nasıl/hangi durumda" türü uzmanlık sorularında bu, cümlenin
# ortasında kesilen ya da yüzeysel kalan cevaplar üretiyordu. Veri sorusu (kayıt say/oku)
# kısa kalmalı — sesli okunan liste uzarsa dinlenemez.
# NOT: derinlik MODEL DEĞİŞTİREREK değil BÜTÇE açarak sağlanır; sesli modda gecikme
# birincil kalite ölçüsüdür ve güçlü model (reasoning) turu saniyelerce uzatırdı.
_SESLI_BUTCE_KISA = 150
_SESLI_BUTCE_DERIN = 380

# Kelime BAŞI (\b) zorunlu; sonek serbest bırakılır (Türkçe çekim: "süreniz", "zorunludur").
# Serbest sonek kaçınılmaz olarak birkaç yakın-yazımlı kelimeyi de yakalıyordu — bu alanda
# gerçekten geçenler hedefli olarak elenir (şartname ≠ şart, sürekli/süreç ≠ süre).
_DERIN_SORU = re.compile(
    r"\b(neden|niçin|niye|nasıl|açıkla|anlat|fark[ıi]?|karşılaştır|hangi durum|ne zaman|"
    r"gerekçe|mevzuat|kanun|yönetmelik|madde|süre(?!kli|ç)|zorunlu|şart(?!name)|"
    r"gerekir|olur mu)",
    re.IGNORECASE)


def _sesli_butce(mesaj: str, intent: str) -> int:
    """Sesli turun token bütçesi — veri sorusunda kısa, uzmanlık sorusunda geniş."""
    if intent in KAYIT_TURU:
        return _SESLI_BUTCE_KISA
    return _SESLI_BUTCE_DERIN if _DERIN_SORU.search(mesaj or "") else _SESLI_BUTCE_KISA


class SohbetMesaj(BaseModel):
    rol: Literal["kullanici", "asistan"]
    icerik: str = Field(..., max_length=4000)


# --------------------------------------------------------------------------
# Ekran bağlamı — "asistan ekranı takip etsin". Kullanıcı "bu evrak ne?", "buradaki
# risk neden kırmızı?" dediğinde asistan DB'ye gidip aramak yerine ekrandakini bilir:
# bir turdan araç çağrısı + niyet turu KADAR gecikme siler.
#
# GÜVENLİK: bu blok İSTEMCİDEN gelir — yani KULLANICI GİRDİSİDİR, sunucu gerçeği değil.
# Üç kural: (1) her alan şemada uzunluk-sınırlı (prompt şişmesi/maliyet DoS'u yok),
# (2) prompt'a girmeden ÖNCE mask_for_llm'den geçer (KVKK: dış modele ham PII gitmez),
# (3) yalnız SUNUM bağlamıdır — yetki/karar için ASLA kullanılmaz (kayıt okuma hâlâ
# kullanıcının kendi owner_id'siyle DB'den yapılır).
# --------------------------------------------------------------------------
class EkranSecili(BaseModel):
    ad: str | None = Field(None, max_length=200)
    tur: str | None = Field(None, max_length=80)
    birim: str | None = Field(None, max_length=200)
    bant: str | None = Field(None, max_length=40)
    ozet: str | None = Field(None, max_length=800)
    durum: str | None = Field(None, max_length=80)


class EkranListe(BaseModel):
    adet: int = Field(0, ge=0, le=1_000_000)
    ilkler: list[str] = Field(default_factory=list, max_length=8)


class EkranBaglam(BaseModel):
    gorunum: str = Field("", max_length=60)
    secili: EkranSecili | None = None
    liste: EkranListe | None = None
    notlar: str | None = Field(None, max_length=200)


class SohbetIstek(BaseModel):
    mesaj: str = Field(..., min_length=1, max_length=1000)
    gecmis: list[SohbetMesaj] = Field(default_factory=list, max_length=_GECMIS_MAX)
    # HITL teyit el sıkışması: bir önceki yanıtın onay_bekleyen'i aynen geri gönderilir.
    onay_baglam: dict[str, Any] | None = None
    # Sesli görüşme modu — açıksa yanıt kompozisyonu SESLİ persona (kısa, konuşma-dili) kullanır.
    sesli: bool = False
    # Kullanıcının O AN gördüğü ekranın özeti (opsiyonel; yoksa davranış birebir eskisi).
    ekran: EkranBaglam | None = None


# Ekran bloğunun prompt'taki toplam tavanı — şema alan-alan sınırlıyor, bu son emniyet.
_EKRAN_MAX = 1200
# Liste başlıklarının tek tek tavanı (şema listenin UZUNLUĞUNU sınırlar, eleman boyunu değil).
_EKRAN_BASLIK_MAX = 160


def _ekran_metni(ekran: EkranBaglam | None) -> str:
    """Ekran bağlamı → prompt satırları. Maskelenmiş ve tavanlı; bağlam yoksa boş dize."""
    if ekran is None:
        return ""
    satirlar: list[str] = []
    if ekran.gorunum:
        satirlar.append(f"Açık ekran: {ekran.gorunum}")
    if ekran.secili:
        alanlar = {k: v for k, v in ekran.secili.model_dump().items() if v}
        if alanlar:
            satirlar.append("Seçili/açık evrak: " + ", ".join(f"{k}: {v}" for k, v in alanlar.items()))
    if ekran.liste and ekran.liste.adet:
        basliklar = ", ".join(b[:_EKRAN_BASLIK_MAX] for b in ekran.liste.ilkler if b)
        satirlar.append(f"Ekrandaki liste: {ekran.liste.adet} kayıt"
                        + (f" (ilk birkaçı: {basliklar})" if basliklar else ""))
    if ekran.notlar:
        satirlar.append(f"Not: {ekran.notlar}")
    if not satirlar:
        return ""
    # KVKK: ekranda maskesiz bir ad görünüyor olabilir — dış modele gitmeden maskelenir.
    return mask_for_llm("\n".join(satirlar))[:_EKRAN_MAX]


class SohbetYanit(BaseModel):
    yanit: str
    intent: str
    kayitlar: list[dict[str, Any]] | None = None
    kayit_turu: str | None = None
    oneri_gorunum: str | None = None
    onay_bekleyen: dict[str, Any] | None = None
    kaynak: Literal["llm", "fallback"]
    # Mevzuat kaynak çipleri: [{dosya, no, baslik, madde_no}] — UI tıklayınca
    # /mevzuat/icerik/{dosya} okuma modalını ilgili maddede açar (additive alan).
    mevzuat_kaynaklari: list[dict[str, Any]] | None = None


def _gecmis_metni(gecmis: list[SohbetMesaj]) -> str:
    """Kompozisyon/döngü bağlamı için sohbet geçmişi — son 6 mesaj, satır başına ≤300
    karakter kırpma (bağlam şişmesin; 'peki bunların kaçı kırmızı?' takipleri bağlam kazansın)."""
    return "\n".join(f"{m.rol}: {m.icerik[:300]}" for m in gecmis[-6:])


def _parametre_temizle(obj: dict[str, Any], mesaj: str) -> dict[str, Any]:
    """LLM'in döndürdüğü parametreleri güvenli aralığa indir (şema dışı değer sızmasın)."""
    try:
        limit = int(obj.get("limit") or LIMIT_VARSAYILAN)
    except (TypeError, ValueError):
        limit = LIMIT_VARSAYILAN
    durum = str(obj.get("durum") or "")
    risk = str(obj.get("risk") or "")
    q = str(obj.get("q") or mesaj)[:200]
    no = str(obj.get("mevzuat_no") or "")
    return {
        "durum": durum if durum in _DURUMLAR else "",
        "risk": risk if risk in _RISKLER else "",
        "limit": max(1, min(limit, 20)),
        "q": q,
        "mevzuat_no": no if no.isdigit() else "",
    }


async def _niyet_tespit(
    mesaj: str, gecmis: list[SohbetMesaj], hizli: bool = False,
) -> tuple[dict[str, Any], bool]:
    """(niyet, llm_kullanildi) — LLM birincil, deterministik fallback garantili.

    hizli=True (sesli mod): LLM turu HİÇ yapılmaz, doğrudan deterministik sınıflandırıcı.
    Gerekçe ölçüldü: niyet çağrısı reasoning modeline gider (düşünme token'ları) ve sesli
    turun BAŞINDA, kullanıcı sessizliği dinlerken 1-3 saniye harcar. Deterministik niyet
    zaten her yolda fallback olarak kurulu ve aynı NIYETLER kümesini üretir; sesli modda
    kompozisyon LLM'i ekran bağlamı + araç verisiyle cevabı zaten toparlıyor.
    """
    if hizli:
        return fallback_niyet(mesaj), False
    baglam = "\n".join(f"{m.rol}: {m.icerik[:200]}" for m in gecmis[-4:])
    user = (f"Önceki konuşma:\n{baglam}\n\n" if baglam else "") + f"Kullanıcı mesajı: {mesaj}"
    obj = await llm_json(_NIYET_SYSTEM, user, max_tokens=150)
    if obj is not None and obj.get("intent") in NIYETLER:
        return {"intent": obj["intent"], "parametreler": _parametre_temizle(obj, mesaj)}, True
    return fallback_niyet(mesaj), False


def _sesli_dusunme_kapali() -> bool:
    """Sesli turda modelin düşünme aşaması kapatılsın mı? (SESLI_DUSUNME_KAPALI, varsayılan açık)

    Ölçüldü: sesli kompozisyonda ilk token 3,4-4,8 sn ve bunun çoğu düşünme. Konuşma-dili,
    iki-üç cümlelik cevap derin muhakeme istemiyor. Kalite kaygısı olursa ENV ile kapatılır;
    parametreyi yalnız DeepSeek v4 tanır (agents/llm._dusunme_destekli_mi), diğer sağlayıcıda
    alan hiç gönderilmez.
    """
    return (os.getenv("SESLI_DUSUNME_KAPALI", "1").strip().lower()
            not in ("0", "false", "hayir", "hayır", "off"))


def _hizli_yol_mu(istek: SohbetIstek) -> bool:
    """Sesli tur düşük gecikme yolunu kullansın mı? ENV ile kapatılabilir (SESLI_HIZLI_YOL=0
    → davranış birebir eski hâline döner; deterministik-fallback deseninin kapatma anahtarı)."""
    if not istek.sesli:
        return False
    return (os.getenv("SESLI_HIZLI_YOL", "1").strip().lower()
            not in ("0", "false", "hayir", "hayır", "off"))


def _mevzuat_katalog_araci(q: str) -> dict[str, Any]:
    """Dosya-tabanlı mevzuat kataloğu özeti (api/routes/mevzuat._katalog paylaşımı; DB'siz)."""
    kayitlar = mevzuat_katalog_mod._katalog()
    kategoriler = sorted({k["kategori"] for k in kayitlar})
    ornekler = [k for k in kayitlar if q and (q in k["baslik"].lower() or q in k["dosya"])] or list(kayitlar)
    return {"adet": len(kayitlar), "kategoriler": kategoriler,
            "ornekler": [dict(o) for o in ornekler[:5]]}


def _mevzuat_icerik_araci(no: str, q: str) -> dict[str, Any] | None:
    """Kanun no ya da ad eşleşmesiyle tek mevzuatın metni (ilk ~700 karakter özet)."""
    kayitlar = mevzuat_katalog_mod._katalog()
    secilen = next((k for k in kayitlar if no and k["no"] == no), None)
    if secilen is None and q:
        ql = q.lower()
        secilen = next((k for k in kayitlar if ql in k["baslik"].lower() or ql in k["dosya"]), None)
    if secilen is None:
        return None
    yol = mevzuat_katalog_mod._MEVZUAT_DIR / f"{secilen['dosya']}.txt"
    try:
        metin = yol.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    return {**secilen, "metin_ozet": " ".join(metin.split())[:700]}


async def _islem_bul(session: AsyncSession, owner_id: Any, q: str) -> dict[str, Any] | None:
    """Ada göre (yoksa en son) işlem kaydı — detay/denetim/onay araçlarının ortak çözümleyicisi."""
    rows = await islem_listele(session, owner_id=owner_id, limit=10)
    if q:
        ql = q.lower()
        for r in rows:
            if ql in (r.get("name") or "").lower():
                return r
    return rows[0] if rows else None


async def _islem_detay_araci(session: AsyncSession, owner_id: Any, q: str) -> dict[str, Any] | None:
    r = await _islem_bul(session, owner_id, q)
    if r is None:
        return None
    res = r.get("result") or {}
    return {
        "islem_id": res.get("islem_id"), "name": r.get("name"), "bant": r.get("bant"),
        "evrak_turu": r.get("evrak_turu"), "hedef_birim": r.get("hedef_birim"),
        "ozet": (res.get("ozet") or "")[:400], "eksik_alanlar": res.get("eksik_alanlar") or [],
        "sla_durum": (res.get("sla_metadata") or {}).get("durum", ""),
        # "Neden KIRMIZI / neden bu birim" — gerekçeler zaten üretiliyor, sohbete taşınır (grounded).
        "risk_aciklama": (res.get("risk_metadata") or {}).get("aciklama", ""),
        "birim_gerekce": res.get("birim_reasoning", ""),
        # Kanıt şeffaflığı: her çıkarılan değerin KAYNAK metindeki yeri (kanit_baglama span'ları)
        # → "bu bilgiyi nereden çıkardın" sorusuna grounded cevap (uydurma değil, bulundu).
        "kanitlar": [{"label": s.get("label") or s.get("alan") or "", "deger": s.get("deger") or ""}
                     for s in ((res.get("kanit_metadata") or {}).get("spanlar") or [])][:8],
        "onay_durumu": res.get("onay_durumu", ""),
    }


# sla_triyaj bandı: süresi geçmiş / son gün yaklaşan işlemler (chat SLA sorgusu).
_SLA_KRITIK = ("GECIKMIS", "KRITIK")


async def _sla_araci(
    session: AsyncSession, owner_id: Any, limit: int,
) -> list[dict[str, Any]]:
    """Yasal süresi geçmiş/kritik işlemler — en acil önce (sla_metadata zaten üretiliyor)."""
    rows = await islem_listele(session, owner_id=owner_id, limit=max(limit, 20))
    out: list[dict[str, Any]] = []
    for r in rows:
        meta = (r.get("result") or {}).get("sla_metadata") or {}
        if meta.get("durum") in _SLA_KRITIK:
            out.append({
                "name": r.get("name"), "evrak_turu": r.get("evrak_turu"),
                "hedef_birim": r.get("hedef_birim"),
                "sla_durum": meta.get("durum"), "kalan_gun": meta.get("kalan_gun"),
            })
    # kalan gün artan (en çok geciken/en az kalan en üstte); None sona.
    out.sort(key=lambda x: (x.get("kalan_gun") is None, x.get("kalan_gun") or 0))
    return out[:limit]


async def _brifing_araci(session: AsyncSession, owner_id: Any) -> dict[str, Any]:
    """Proaktif brifing — dikkat gerektiren işlerin sayımı (SLA kritik + kırmızı taslak + bekleyen onay)."""
    sla = await _sla_araci(session, owner_id, limit=50)
    rows = await islem_listele(session, owner_id=owner_id, limit=50)
    bekleyen = [r for r in rows
                if (r.get("result") or {}).get("yazi_taslak_md")
                and not (r.get("result") or {}).get("onay_durumu")]
    kirmizi = [r for r in bekleyen if r.get("bant") == "kirmizi"]
    en_acil = (sla[0]["name"] if sla
               else (bekleyen[0].get("name") if bekleyen else ""))
    return {"sla_kritik": len(sla), "bekleyen_onay": len(bekleyen),
            "kirmizi_taslak": len(kirmizi), "en_acil": en_acil}


async def _denetim_araci(session: AsyncSession, owner_id: Any, q: str) -> dict[str, Any] | None:
    r = await _islem_bul(session, owner_id, q)
    if r is None or not (r.get("result") or {}).get("islem_id"):
        return None
    islem_id = (r.get("result") or {})["islem_id"]
    sonuc = await dogrula_denetim(session, islem_id=uuid.UUID(islem_id))
    return {"name": r.get("name"), **(sonuc or {})}


async def araci_calistir(
    session: AsyncSession, owner_id: Any, intent: str, parametreler: dict[str, Any],
) -> list[dict[str, Any]] | dict[str, Any] | None:
    """Niyeti owner-scoped DB sorgusuna çevir (modül-global: test monkeypatch noktası)."""
    limit = parametreler.get("limit") or LIMIT_VARSAYILAN
    q = (parametreler.get("q") or "").strip().lower()
    if intent == "mevzuat_katalog":
        return _mevzuat_katalog_araci(q)
    if intent == "mevzuat_icerik":
        return _mevzuat_icerik_araci(parametreler.get("mevzuat_no", ""), q)
    if intent == "islem_detay":
        return await _islem_detay_araci(session, owner_id, q)
    if intent == "sla_durum":
        return await _sla_araci(session, owner_id, limit)
    if intent == "brifing":
        return await _brifing_araci(session, owner_id)
    if intent == "denetim_dogrula":
        return await _denetim_araci(session, owner_id, q)
    if intent == "gelen_evrak":
        return await gelen_evrak_listele(session, owner_id=owner_id, limit=limit)
    if intent == "giden_evrak":
        rows = await giden_evrak_listele(
            session, owner_id=owner_id, limit=limit,
            durum=parametreler.get("durum", ""), risk=parametreler.get("risk", ""))
        # Sohbet kartı için sadeleştir: taslak gövdesi + hash taşınmaz (payload küçük kalsın).
        return [{k: r[k] for k in (
            "giden_no", "konu", "durum", "risk", "alici_birim",
            "evrak_turu", "kaynak_evrak_adi", "gonderim_tarihi") if k in r} for r in rows]
    if intent == "taslaklar":
        return await taslak_listele(session, owner_id=owner_id, limit=limit)
    if intent == "islem_gecmisi":
        rows = await islem_listele(session, owner_id=owner_id, limit=limit)
        return [{
            "name": r.get("name"), "evrak_turu": r.get("evrak_turu"),
            "hedef_birim": r.get("hedef_birim"), "bant": r.get("bant"),
            "ozet": (r.get("result") or {}).get("ozet", "")[:200],
        } for r in rows]
    if intent == "panel_ozet":
        return await panel_istatistik(session, owner_id=owner_id)
    if intent == "mevzuat_ara":
        q_ham = parametreler.get("q", "")
        try:
            rows = await hybrid_ara(session, q=q_ham, limit=min(limit, 5))
        except Exception as exc:  # DB yok/koptu → dosya-tabanlı BM25 (demo ayakta kalır)
            log.warning("sohbet_mevzuat_db_fallback", error=type(exc).__name__)
            rows = []
        return rows or mevzuat_katalog_mod.derin_ara(q_ham, limit=min(limit, 5))
    return None


def _mevzuat_kaynaklari(intent: str, veri: Any) -> list[dict[str, Any]] | None:
    """Yanıtın mevzuat kaynak çipleri — hem derin_ara (dosya'lı) hem hybrid_ara
    (kanun_no'lu) şekli katalog dosyasına bağlanır; katalogda olmayan atlanır."""
    if intent == "mevzuat_icerik" and isinstance(veri, dict) and veri.get("dosya"):
        return [{"dosya": veri["dosya"], "no": veri.get("no", ""),
                 "baslik": veri.get("baslik", ""), "madde_no": None}]
    if intent != "mevzuat_ara" or not isinstance(veri, list):
        return None
    no_katalog: dict[str, dict] = {}
    for k in mevzuat_katalog_mod._katalog():
        if k["no"]:
            no_katalog.setdefault(k["no"], k)
    kaynaklar: list[dict[str, Any]] = []
    gorulen: set[tuple[str, Any]] = set()
    for r in veri:
        if r.get("dosya"):
            kayit = {"dosya": r["dosya"], "no": r.get("no", ""),
                     "baslik": r.get("baslik", ""), "madde_no": r.get("madde_no")}
        else:
            k = no_katalog.get(str(r.get("kanun_no") or ""))
            if k is None:
                continue
            kayit = {"dosya": k["dosya"], "no": k["no"],
                     "baslik": k["baslik"], "madde_no": r.get("madde_no")}
        anahtar = (kayit["dosya"], kayit["madde_no"])
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        kaynaklar.append(kayit)
    return kaynaklar[:5] or None


def _kompoz_user(mesaj: str, veri: Any, gecmis_metni: str = "", ekran_metni: str = "") -> str:
    """Kompozisyon LLM'ine giden kullanıcı içeriği — geçmiş + EKRAN + soru + araç verisi.
    Madde 13: geçmiş dahil → takip soruları ('peki bunların kaçı kırmızı?') bağlam kazanır.
    Ekran bloğu 'bu/burada/şu evrak' gibi işaret eden soruları DB turu olmadan çözer."""
    veri_json = json.dumps(veri, ensure_ascii=False, default=str)[:4000] if veri else "[]"
    onek = f"Önceki konuşma:\n{gecmis_metni}\n\n" if gecmis_metni else ""
    ekran = (
        "Kullanıcının ŞU AN gördüğü ekran (kullanıcı 'bu', 'burada', 'şu evrak', 'ekrandaki' "
        f"derse bunu kastediyor):\n{ekran_metni}\n\n" if ekran_metni else "")
    return f"{onek}{ekran}Kullanıcı sorusu: {mesaj}\n\nSistem verisi (JSON):\n{veri_json}"


def _kompoze_edilir(intent: str, sesli: bool) -> bool:
    """Bu niyet LLM ile mi kompoze edilecek (yoksa konserve bilgi/şablon metni mi)?

    SESLİ modda site_yardim da kompoze edilir — iki sebeple ölçüldü:
    · Konserve yardım metni markdown'lı ve uzundur; yüksek sesle okununca tam da kullanıcının
      istemediği robotik cevabı verir.
    · Deterministik niyet (hızlı yol) 'panelde durum nedir' gibi soruları site_yardim'a
      koyabiliyor; konserve metin bu durumda EKRANDAKİ gerçek sayıları göremezdi.
    Kompozisyon yolunda persona uzmanlığı + ekran bağlamı birlikte çalışır; LLM yoksa
    aşağıdaki fallback yine bilgi_yaniti/şablon üretir (davranış kaybı yok).
    """
    return intent in KAYIT_TURU or intent == "genel" or (sesli and intent == "site_yardim")


async def _yanit_kompoze(
    mesaj: str, intent: str, veri: Any, gecmis_metni: str = "", sesli: bool = False,
    ekran_metni: str = "",
) -> tuple[str, bool]:
    """(yanit, llm_kullanildi) — bilgi tabanı > LLM > şablon sırasıyla.
    sesli=True → SESLİ persona sistem prompt'u (kısa, konuşma-dili, markdown'sız)."""
    if intent == "site_yardim" and not sesli:
        return bilgi_yaniti(mesaj) or sablon_yanit(intent, None), False
    if intent == "selamlama":
        return sablon_yanit(intent, None), False
    if _kompoze_edilir(intent, sesli):
        txt = await llm_text(
            _SESLI_SYSTEM if sesli else _KOMPOZ_SYSTEM,
            _kompoz_user(mesaj, veri, gecmis_metni, ekran_metni),
            # Bütçe donanımsal güvence (sadece prompt değil): sesli modda soruya göre uyarlanır.
            max_tokens=_sesli_butce(mesaj, intent) if sesli else 400)
        if txt:
            return txt, True
        # Sesli site_yardim kompozisyonu boş döndüyse konserve bilgi metni hâlâ devrede
        # (deterministik fallback deseni: LLM yoksa/boşsa yetenek kaybolmaz).
        if intent == "site_yardim":
            return bilgi_yaniti(mesaj) or sablon_yanit(intent, None), False
    return sablon_yanit(intent, veri), False


async def _veri_getir(
    istek: SohbetIstek, user: Any, session: AsyncSession, intent: str,
    parametreler: dict[str, Any], hizli: bool = False,
) -> tuple[str, Any, bool]:
    """(intent, veri, dongu_llm) — Madde 13 araç döngüsü birincil, klasik tek-tur fallback.

    SOHBET_ARAC_DONGUSU açıkken LLM güdümlü döngü denenir; protokole uymayan LLM
    (mock/bozuk) ya da araçsız dönüş → klasik araci_calistir yolu BİREBİR. Döngü
    farklı bir araç seçtiyse intent onunla güncellenir (kart/görünüm tutarlılığı).

    hizli=True (sesli mod): döngü ATLANIR. Döngü her turda 1-3 EK LLM çağrısı demek;
    sesli görüşmede kullanıcı cevabı BEKLERKEN sessizlik oluşur ve gecikme birincil
    kalite ölçüsüdür. Tek-tur araç yolu aynı veriyi deterministik parametrelerle getirir.
    """
    if _cfg.SOHBET_ARAC_DONGUSU and not hizli:
        async def _cal(arac: str, parametreler_ham: dict[str, Any]) -> Any:
            # LLM parametreleri mevcut doğrulamadan geçer (şema dışı değer sızmaz).
            return await araci_calistir(
                session, user.id, arac, _parametre_temizle(parametreler_ham, istek.mesaj))

        dongu = await arac_dongusu(
            istek.mesaj, _gecmis_metni(istek.gecmis), _cal, _cfg.SOHBET_MAX_TUR)
        if dongu is not None:
            return dongu[0], dongu[1], True
    return intent, await araci_calistir(session, user.id, intent, parametreler), False


def _kart_kayitlari(intent: str, veri: Any) -> list[dict[str, Any]] | None:
    """UI kartı için kayıt listesi — tekil detay dict'i tek elemanlı karta çevrilir."""
    if isinstance(veri, list):
        return veri
    if intent in ("islem_detay", "mevzuat_icerik") and isinstance(veri, dict):
        return [{k: v for k, v in veri.items() if k != "metin_ozet"}]
    return None


# --------------------------------------------------------------------------
# HITL aksiyonları — sohbetten onay/ret (iki adımlı teyit; buton akışıyla aynı kurallar)
# --------------------------------------------------------------------------
# Mesajdan hedef taslak ADI ipucu — komut/dolgu kelimelerini at, kalan (ad parçası) döner.
# "Park dilekçesini onayla" → "park dilekçesini"; böylece kullanıcının adını andığı taslak
# 'en yeni' yerine seçilir (bug avı 2026-07-23: yanlış-taslak onayı/gönderimi riski).
_HEDEF_TEMIZLE = re.compile(
    r"\b(onayla\w*|reddet\w*|revize\s*et\w*|revize|düzelt\w*|değiştir\w*|güncelle\w*|kurula\s*sun\w*"
    r"|kurula\s*getir\w*|kurula|kurul|müzakere\w*|sun|gönder\w*|taslağ?ı\w*|taslak\w*|yazıyı|yazı"
    r"|belge\w*|evrağ?ı\w*|evrak\w*|bu|şu|son|en|lütfen)\b",
    re.IGNORECASE)


def _hedef_ipucu(mesaj: str) -> str:
    """Hedef taslak adı ipucu (revize'de ':' ÖNCESİ — talimat sonrada kalır)."""
    once = (mesaj or "").split(":", 1)[0]
    kalan = _HEDEF_TEMIZLE.sub(" ", once)
    kalan = re.sub(r"[:\-–—]", " ", kalan)
    return re.sub(r"\s+", " ", kalan).strip().lower()[:80]


async def onay_hedefi_bul(session: AsyncSession, owner_id: Any, q: str = "") -> dict[str, Any] | None:
    """Onaylanabilir işlem — q verilirse ADA göre, yoksa en yeni (taslaklı, kararsız). Monkeypatch noktası."""
    rows = await islem_listele(session, owner_id=owner_id, limit=10)
    adaylar = [r for r in rows
               if (r.get("result") or {}).get("yazi_taslak_md")
               and (r.get("result") or {}).get("islem_id")
               and not (r.get("result") or {}).get("onay_durumu")]
    if q:  # kullanıcının andığı ada göre seç (substring); yoksa en yeniye düş
        for r in adaylar:
            if q in (r.get("name") or "").lower():
                res = r["result"]
                return {"islem_id": res["islem_id"], "name": r.get("name"), "bant": r.get("bant")}
    if adaylar:
        res = adaylar[0]["result"]
        return {"islem_id": res["islem_id"], "name": adaylar[0].get("name"), "bant": adaylar[0].get("bant")}
    return None


async def onayi_uygula(
    session: AsyncSession, kullanici: Any, islem_id: str, secim: str,
) -> dict[str, Any]:
    """Teyit edilmiş kararı uygula (onayla_ve_gonder). Monkeypatch noktası."""
    return await onayla_ve_gonder(
        session, islem_id=uuid.UUID(islem_id), kullanici_id=kullanici.id,
        secim=secim, gerekce="Sohbet asistanı üzerinden teyitle", owner_id=kullanici.id)


async def _onay_teyidini_isle(
    istek: SohbetIstek, user: Any, session: AsyncSession,
) -> SohbetYanit | None:
    """onay_baglam taşıyan mesajı sonuçlandır — teyit/iptal/yetki/hata. Bağlam yoksa None."""
    b = istek.onay_baglam or {}
    eylem, islem_id = str(b.get("eylem") or ""), str(b.get("islem_id") or "")
    ad = str(b.get("ad") or "taslak")
    if eylem not in ("onayla", "reddet") or not islem_id:
        return None
    intent = "taslak_onayla" if eylem == "onayla" else "taslak_reddet"
    if not onay_teyit(istek.mesaj):
        return SohbetYanit(yanit=f"Anlaşıldı — **{ad}** için eylem iptal edildi, vazgeçildi.",
                           intent=intent, kaynak="fallback")
    try:
        uuid.UUID(islem_id)
    except ValueError:
        return SohbetYanit(yanit="Onay bağlamı geçersiz — lütfen eylemi yeniden başlatın.",
                           intent=intent, kaynak="fallback")
    if _ROL_HIYERARSI.get(getattr(user, "rol", ""), 0) < _ROL_HIYERARSI["memur"]:
        return SohbetYanit(yanit="Bu eylem için yetkiniz bulunmuyor.", intent=intent, kaynak="fallback")
    # IDOR koruması: kayitlar.py'deki REST onay rotasıyla BİREBİR aynı sahiplik kontrolü —
    # onayla_ve_gonder işlemin sahibini doğrulamaz, bu kontrol çağıran tarafın sorumluluğunda.
    if await islem_detay(session, uuid.UUID(islem_id), owner_id=user.id) is None:
        return SohbetYanit(yanit="İşlem bulunamadı.", intent=intent, kaynak="fallback")
    try:
        await onayi_uygula(session, user, islem_id, eylem)
    except KararError as e:
        return SohbetYanit(yanit=f"Eylem uygulanamadı: {e.mesaj}", intent=intent, kaynak="fallback")
    except Exception as exc:
        log.warning("sohbet_onay_hatasi", error=type(exc).__name__)
        return SohbetYanit(yanit="Eylem şu an uygulanamadı — lütfen ekrandaki butonları kullanın.",
                           intent=intent, kaynak="fallback")
    sonuc = ("onaylandı ve **Giden Evrak**'a gönderildi" if eylem == "onayla"
             else "reddedildi (denetim iziyle kaydedildi)")
    return SohbetYanit(yanit=f"✔ **{ad}** {sonuc}.", intent=intent,
                       oneri_gorunum="giden", kaynak="fallback")


async def _onay_baslat(intent: str, user: Any, session: AsyncSession, q: str = "") -> SohbetYanit:
    """Aksiyon niyetini teyit sorusuna çevir (eylem HEMEN uygulanmaz — HITL)."""
    try:
        hedef = await onay_hedefi_bul(session, user.id, q)
    except Exception as exc:
        log.warning("sohbet_onay_hedef_hatasi", error=type(exc).__name__)
        hedef = None
    if hedef is None:
        return SohbetYanit(
            yanit="Onaylanabilir bir taslak bulamadım — önce Gelen Evrak'tan bir evrak işleyin.",
            intent=intent, oneri_gorunum="gelen", kaynak="fallback")
    eylem = "onayla" if intent == "taslak_onayla" else "reddet"
    fiil = "onaylamak" if eylem == "onayla" else "reddetmek"
    return SohbetYanit(
        yanit=(f"**{hedef.get('name') or 'taslak'}** taslağını {fiil} üzeresiniz "
               f"(risk bandı: {hedef.get('bant') or '—'}). Onaylıyor musunuz?"),
        intent=intent,
        onay_bekleyen={"eylem": eylem, "islem_id": hedef["islem_id"],
                       "ad": hedef.get("name") or "taslak"},
        kaynak="fallback")


# --------------------------------------------------------------------------
# Doğal-dil taslak revizyonu — grounded, NON-MUTATING önizleme (yazi_render motoru)
# --------------------------------------------------------------------------
async def revize_hedefi_bul(
    session: AsyncSession, owner_id: Any, q: str = "",
) -> dict[str, Any] | None:
    """Revize edilecek taslak — ada göre (yoksa en yeni taslaklı işlem). Monkeypatch noktası."""
    rows = await islem_listele(session, owner_id=owner_id, limit=10)
    yeni: dict[str, Any] | None = None
    for r in rows:
        res = r.get("result") or {}
        if not res.get("yazi_taslak_md"):
            continue
        aday = {"name": r.get("name"), "taslak_md": res["yazi_taslak_md"],
                "evrak_ozet": res.get("ozet") or ""}
        if q and q in (r.get("name") or "").lower():
            return aday
        if yeni is None:
            yeni = aday
    return yeni


async def revize_uygula(
    taslak_md: str, talimat: str, evrak_ozet: str,
) -> dict[str, Any] | None:
    """revize_taslak_yapili sarmalayıcı (grounded; LLM yok/mock → None). Monkeypatch noktası."""
    from yazi.yazi_render import revize_taslak_yapili
    return await revize_taslak_yapili(taslak_md, talimat, evrak_ozet=evrak_ozet)


async def _revize_isle(istek: SohbetIstek, user: Any, session: AsyncSession) -> SohbetYanit:
    """Doğal-dil talimatıyla taslağı revize et — kaynaksız değişikliği reddeder, KAYDETMEZ."""
    intent = "taslak_revize"
    talimat = talimat_cikar(istek.mesaj)
    if len(talimat) < 4:
        return SohbetYanit(
            yanit=("Taslakta neyi nasıl değiştireyim? Örn. \"taslağı revize et: kapanışı "
                   "'arz ederim' yap\"."),
            intent=intent, oneri_gorunum="taslaklar", kaynak="fallback")
    try:
        hedef = await revize_hedefi_bul(session, user.id, _hedef_ipucu(istek.mesaj))
    except Exception as exc:  # DB hatası sohbeti düşürmesin
        log.warning("sohbet_revize_hedef_hatasi", error=type(exc).__name__)
        hedef = None
    if hedef is None:
        return SohbetYanit(
            yanit="Revize edilecek bir taslak bulamadım — önce Gelen Evrak'tan bir evrak işleyin.",
            intent=intent, oneri_gorunum="taslaklar", kaynak="fallback")
    try:
        yapili = await revize_uygula(hedef["taslak_md"], talimat, hedef["evrak_ozet"])
    except Exception as exc:
        log.warning("sohbet_revize_hatasi", error=type(exc).__name__)
        yapili = None
    ad = hedef.get("name") or "Taslak"
    yeni_metin = (yapili or {}).get("metin", "").strip()
    if not yeni_metin or yeni_metin == hedef["taslak_md"].strip():
        return SohbetYanit(
            yanit=(f"**{ad}** için revizyon uygulanamadı — talimat kaynakta karşılık bulmadı "
                   "ya da gerçek LLM gerekiyor. Taslağı **Taslaklar** ekranından elle "
                   "düzenleyebilirsiniz."),
            intent=intent, oneri_gorunum="taslaklar", kaynak="fallback")
    parcalar = [f"**{ad}** için önerilen revizyon (henüz kaydedilmedi):"]
    if degis := (yapili.get("degisiklikler") or []):
        parcalar.append("\n".join(f"• {d}" for d in degis[:5]))
    if uygulanamayan := (yapili.get("uygulanamayan") or ""):
        parcalar.append(f"⚠ Uygulanamayan (kaynakta yok, uydurulmadı): {uygulanamayan}")
    parcalar.append(f"\n---\n{yeni_metin}")
    parcalar.append("\nOnaylarsan **Taslaklar** ekranından kaydedip gönderebilirsin.")
    return SohbetYanit(yanit="\n".join(parcalar), intent=intent,
                       oneri_gorunum="taslaklar", kaynak="llm")


# --------------------------------------------------------------------------
# AI Bürokrasi Kurulu — taslağı çok-ajanlı müzakereden geçir (yazi.kurul reuse)
# --------------------------------------------------------------------------
_KURUL_KARAR_TR = {
    "sevk": "Sevk (yüksek risk — dikkatli onay)",
    "serhli": "Şerhli (çözülmemiş itiraz var)",
    "uzlasti": "Uzlaşı (kurul mutabık)",
}


async def kurul_uygula(taslak_md: str, evrak_ozet: str = "") -> dict[str, Any] | None:
    """Sunucu sinyalleri (verify+risk_guard) + kurul_muzakere. LLM yok/mock → None. Monkeypatch noktası."""
    from agents.nodes.risk_guard import risk_guard_node
    from agents.nodes.verify import verify_node
    from yazi.kurul import kurul_muzakere

    state: dict[str, Any] = {
        "yazi_taslak_md": taslak_md, "evrak_text": (evrak_ozet or "")[:2000],
        "bilgi_unsurlari": {}, "yazi_turu": "", "evrak_turu": "belirsiz", "hedef_birim": "",
    }
    v = await verify_node(state)
    state.update(v)
    r = await risk_guard_node(state)
    sinyaller = {
        "verify_uyari": v.get("verify_uyari", []), "lint_2646": v.get("lint_2646") or {},
        "tutarlilik_uyari": v.get("tutarlilik_uyari", []),
        "risk_metadata": r.get("risk_metadata") or {},
    }
    meta = {"yazi_turu": "", "evrak_turu": "belirsiz", "hedef_birim": "",
            "bilgi_unsurlari": {}, "evrak_text": state["evrak_text"], "mevzuat": [], "nli": []}
    return await kurul_muzakere(taslak_md, meta=meta, sinyaller=sinyaller)


async def _kurul_isle(istek: SohbetIstek, user: Any, session: AsyncSession) -> SohbetYanit:
    """Taslağı Bürokrasi Kurulu'na sun — karar + öne çıkan öneriler; LLM yoksa dürüst yönlendirme."""
    intent = "kurula_sun"
    try:
        hedef = await revize_hedefi_bul(session, user.id, _hedef_ipucu(istek.mesaj))
    except Exception as exc:
        log.warning("sohbet_kurul_hedef_hatasi", error=type(exc).__name__)
        hedef = None
    if hedef is None:
        return SohbetYanit(
            yanit="Kurula sunulacak bir taslak bulamadım — önce Gelen Evrak'tan bir evrak işleyin.",
            intent=intent, oneri_gorunum="taslaklar", kaynak="fallback")
    try:
        kurgu = await kurul_uygula(hedef["taslak_md"], hedef.get("evrak_ozet", ""))
    except Exception as exc:
        log.warning("sohbet_kurul_hatasi", error=type(exc).__name__)
        kurgu = None
    ad = hedef.get("name") or "Taslak"
    if not kurgu:
        return SohbetYanit(
            yanit=(f"**{ad}** için Bürokrasi Kurulu müzakeresi gerçek LLM gerektirir. "
                   "**Taslaklar** ekranındaki taslağın **Kurul** düğmesiyle deterministik "
                   "önizlemeyi (çok-ajanlı müzakere) görebilirsiniz."),
            intent=intent, oneri_gorunum="taslaklar", kaynak="fallback")
    karar = _KURUL_KARAR_TR.get(kurgu.get("karar", ""), kurgu.get("karar", "—"))
    parcalar = [f"**{ad}** — AI Bürokrasi Kurulu kararı: **{karar}**."]
    oneriler = [o.get("metin", "") for o in (kurgu.get("oneriler") or []) if o.get("metin")][:3]
    if oneriler:
        parcalar.append("Öne çıkan itiraz/öneriler:")
        parcalar += [f"• {o}" for o in oneriler]
    if kurgu.get("uzlasi_degisti"):
        parcalar.append("\nKurul revize önerdi — **Taslaklar > Kurul**'dan uygulayabilirsiniz.")
    return SohbetYanit(yanit="\n".join(parcalar), intent=intent,
                       oneri_gorunum="taslaklar", kaynak="llm")


@router.post("/sohbet")
@rate_limit("20/minute")  # LLM niyet+yanıt+araç döngüsü — diğer LLM uçlarıyla aynı desen (slowapi yoksa etkisiz)
async def sohbet(request: Request, istek: SohbetIstek, user: CurrentUser, session: Session) -> SohbetYanit:
    """Chatbot mesajı → (teyit | aksiyon | niyet + araç + yanıt). Mock modda deterministik."""
    teyit = await _onay_teyidini_isle(istek, user, session)
    if teyit is not None:
        return teyit
    hizli = _hizli_yol_mu(istek)
    niyet, llm_niyet = await _niyet_tespit(istek.mesaj, istek.gecmis, hizli)
    intent = niyet["intent"]
    if intent in ("taslak_onayla", "taslak_reddet"):
        return await _onay_baslat(intent, user, session, _hedef_ipucu(istek.mesaj))
    if intent == "taslak_revize":
        return await _revize_isle(istek, user, session)
    if intent == "kurula_sun":
        return await _kurul_isle(istek, user, session)

    veri: Any = None
    dongu_llm = False
    if intent in KAYIT_TURU:
        try:
            intent, veri, dongu_llm = await _veri_getir(
                istek, user, session, intent, niyet["parametreler"], hizli)
        except Exception as exc:  # DB/arama hatası sohbeti düşürmesin (500 yerine özürlü yanıt)
            log.warning("sohbet_arac_hatasi", intent=intent, error=type(exc).__name__)
            return SohbetYanit(
                yanit="Kayıtlara şu an ulaşamadım — lütfen biraz sonra tekrar deneyin.",
                intent=intent, kaynak="fallback")

    yanit, llm_kompoz = await _yanit_kompoze(
        istek.mesaj, intent, veri, _gecmis_metni(istek.gecmis), istek.sesli,
        _ekran_metni(istek.ekran))
    kart, gorunum = KAYIT_TURU.get(intent, (None, None))
    kayitlar = _kart_kayitlari(intent, veri)
    log.info("sohbet", intent=intent, llm=llm_niyet or llm_kompoz or dongu_llm,
             n_kayit=len(kayitlar) if kayitlar else None)
    return SohbetYanit(
        yanit=yanit,
        intent=intent,
        kayitlar=kayitlar,
        kayit_turu=kart if kayitlar else None,
        oneri_gorunum=gorunum,
        kaynak="llm" if (llm_niyet or llm_kompoz or dongu_llm) else "fallback",
        mevzuat_kaynaklari=_mevzuat_kaynaklari(intent, veri),
    )


# --------------------------------------------------------------------------
# SSE akışı — meta (kayıtlar/niyet) → delta (token'lar) → done (kaynak + tam yanıt)
# --------------------------------------------------------------------------
def _sse(payload: dict[str, Any]) -> str:
    """JSON → SSE 'data:' satırı (process_doc deseni)."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _kompoz_akisi(
    mesaj: str, intent: str, veri: Any, gecmis_metni: str = "", sesli: bool = False,
    ekran_metni: str = "",
) -> AsyncIterator[tuple[str, str]]:
    """('delta'|'kaynak', metin) akışı — gerçek LLM token-token, yoksa tek parça şablon.
    sesli=True → SESLİ persona (kısa, konuşma-dili) kullanılır."""
    if not _kompoze_edilir(intent, sesli):  # bilgi tabanı/şablon yolları tek parça
        yanit, _ = await _yanit_kompoze(mesaj, intent, veri, gecmis_metni, sesli, ekran_metni)
        yield "delta", yanit
        yield "kaynak", "fallback"
        return
    llm = real_llm()
    if llm is None or not hasattr(llm, "chat_stream"):
        yanit, llm_kompoz = await _yanit_kompoze(
            mesaj, intent, veri, gecmis_metni, sesli, ekran_metni)
        yield "delta", yanit
        yield "kaynak", "llm" if llm_kompoz else "fallback"
        return
    kuyruk: asyncio.Queue[str] = asyncio.Queue()
    task = asyncio.create_task(llm.chat_stream(
        messages=[ChatMessage(role="system", content=_SESLI_SYSTEM if sesli else _KOMPOZ_SYSTEM),
                  ChatMessage(role="user",
                              content=_kompoz_user(mesaj, veri, gecmis_metni, ekran_metni))],
        temperature=0.2, on_token=kuyruk.put_nowait,
        # Sesli turda düşünmeyi kapat — ilk token gecikmesinin ana kalemi (bkz. _sesli_dusunme_kapali).
        dusunme_kapali=sesli and _sesli_dusunme_kapali(),
        # DÜŞÜNME MARJI ZORUNLU: düşünme AÇIK kaldığında (metin modu ya da ENV ile geri açılınca)
        # düşünme token'ları bütçeden düşer. Marjsız gönderilen 150 token'lık sesli bütçe BOŞ akış
        # üretiyordu → her sesli veri sorusu markdown şablona düşüyordu (canlı ölçümde yakalandı).
        max_tokens=dusunme_marjli(llm, _sesli_butce(mesaj, intent) if sesli else 400)))
    akti, son = False, time.monotonic() + LLM_NODE_TIMEOUT_S
    while True:
        if time.monotonic() > son:  # bütçe doldu — kısmi metinle bitir (demo asılı kalmaz)
            task.cancel()
            break
        if task.done() and kuyruk.empty():  # akış bitti (normal/iptal/istisna) → akti belirler
            break
        try:
            parca = await asyncio.wait_for(kuyruk.get(), timeout=0.25)
        except TimeoutError:
            continue
        akti = True
        yield "delta", parca
    if not akti:  # hiç token akmadı (hata VEYA boş/whitespace completion) → deterministik şablon
        yield "delta", sablon_yanit(intent, veri)
        yield "kaynak", "fallback"
    else:
        yield "kaynak", "llm"


@router.post("/sohbet/stream")
@rate_limit("20/minute")  # LLM akışı (niyet+yanıt+araç döngüsü) — diğer LLM uçlarıyla aynı desen
async def sohbet_stream(request: Request, istek: SohbetIstek, user: CurrentUser, session: Session) -> StreamingResponse:
    """SSE'li sohbet — kayıtlar meta'da hemen iner, yanıt token-token akar (canlı demo)."""
    hazir = await _onay_teyidini_isle(istek, user, session)
    llm_niyet = False
    hizli = _hizli_yol_mu(istek)
    if hazir is None:
        niyet, llm_niyet = await _niyet_tespit(istek.mesaj, istek.gecmis, hizli)
        intent = niyet["intent"]
        if intent in ("taslak_onayla", "taslak_reddet"):
            hazir = await _onay_baslat(intent, user, session, _hedef_ipucu(istek.mesaj))
        elif intent == "taslak_revize":
            hazir = await _revize_isle(istek, user, session)
        elif intent == "kurula_sun":
            hazir = await _kurul_isle(istek, user, session)
    dongu_llm = False
    if hazir is None:
        veri: Any = None
        if intent in KAYIT_TURU:
            try:
                intent, veri, dongu_llm = await _veri_getir(
                    istek, user, session, intent, niyet["parametreler"], hizli)
            except Exception as exc:
                log.warning("sohbet_arac_hatasi", intent=intent, error=type(exc).__name__)
                hazir = SohbetYanit(
                    yanit="Kayıtlara şu an ulaşamadım — lütfen biraz sonra tekrar deneyin.",
                    intent=intent, kaynak="fallback")

    if hazir is not None:  # tek parça yanıt (teyit/aksiyon/araç hatası) — aynı SSE sözleşmesi
        sabit = hazir

        async def tek() -> AsyncIterator[str]:
            yield _sse({"event": "meta", **sabit.model_dump(exclude={"yanit", "kaynak"})})
            yield _sse({"event": "delta", "t": sabit.yanit})
            yield _sse({"event": "done", "kaynak": sabit.kaynak, "yanit": sabit.yanit})
        return StreamingResponse(tek(), media_type="text/event-stream")

    kart, gorunum = KAYIT_TURU.get(intent, (None, None))
    kayitlar = _kart_kayitlari(intent, veri)

    async def gen() -> AsyncIterator[str]:
        yield _sse({"event": "meta", "intent": intent, "kayitlar": kayitlar,
                    "kayit_turu": kart if kayitlar else None,
                    "oneri_gorunum": gorunum, "onay_bekleyen": None,
                    "mevzuat_kaynaklari": _mevzuat_kaynaklari(intent, veri)})
        parcalar: list[str] = []
        kaynak = "fallback"
        async for tur, icerik in _kompoz_akisi(
                istek.mesaj, intent, veri, _gecmis_metni(istek.gecmis), istek.sesli,
                _ekran_metni(istek.ekran)):
            if tur == "delta":
                parcalar.append(icerik)
                yield _sse({"event": "delta", "t": icerik})
            else:
                kaynak = icerik
        yield _sse({"event": "done",
                    "kaynak": "llm" if (llm_niyet or dongu_llm or kaynak == "llm") else "fallback",
                    "yanit": "".join(parcalar)})
    return StreamingResponse(gen(), media_type="text/event-stream")


# --------------------------------------------------------------------------
# Sesli mod — asistan yanıtını OpenAI TTS ile sese çevir (opt-in, push-to-talk).
# DeepSeek'in TTS'i YOK — core/tts_openai.py bağımsız OPENAI_TTS_API_KEY kullanır (agents/
# config.py'nin DeepSeek'e yönlendirdiği OPENAI_API_KEY'den AYRI). Anahtar yoksa/hata olursa
# 503 — frontend sessizce metne düşer, sohbet asla bozulmaz.
# --------------------------------------------------------------------------
class SeslendirIstek(BaseModel):
    metin: str = Field(..., min_length=1, max_length=4000)


@router.post("/sohbet/seslendir")
# Cümle-cümle boru hattı (frontend lib/sesKuyrugu.js) bir yanıtı 2-4 parçaya böler → tur başına
# istek sayısı arttı, parça boyu küçüldü. Toplam karakter (dolayısıyla maliyet) AYNI; limit buna
# göre yükseltildi, yoksa normal bir görüşme birkaç turda 429'a çarpardı.
@rate_limit("60/minute")
async def sohbet_seslendir(request: Request, istek: SeslendirIstek, user: CurrentUser) -> Response:
    """Metni OpenAI TTS ile sese çevirir. TTS kapalıysa/hata verirse 503 (frontend sessiz düşer).

    Media type SABİT DEĞİL: format env ile değişebilir (varsayılan wav — en düşük gecikme).
    Yanlış media type'la gönderilen ses bazı tarayıcılarda hiç çalmaz, o yüzden tek kaynaktan
    (core.tts_openai.tts_media_type) türetilir.
    """
    if not tts_enabled():
        raise HTTPException(status_code=503, detail="Sesli yanıt şu an devre dışı (TTS anahtarı yok).")
    # Kullanıcı başına karakter kotası: yukarıdaki slowapi limiti IP başınadır (paylaşılan
    # kurum ağında tek bütçe) ve İSTEK sayar — oysa TTS maliyeti KARAKTERLE orantılıdır.
    # 429: frontend sesi atlar, görüşme metinle sürer (sesGetir null döner).
    if not kota_dus(str(user.id), len(istek.metin)):
        log.warning("sohbet_seslendir_kota_asildi", kullanici=str(user.id))
        raise HTTPException(status_code=429, detail="Sesli yanıt kotası doldu — birazdan tekrar deneyin.")
    try:
        audio = await tts_openai(istek.metin, timeout_s=LLM_NODE_TIMEOUT_S)
    except Exception as exc:
        log.warning("sohbet_seslendir_hata", error=type(exc).__name__)
        raise HTTPException(status_code=503, detail="Sesli yanıt üretilemedi.") from exc
    return Response(content=audio, media_type=tts_media_type())


@router.get("/sohbet/karsilama")
@rate_limit("30/minute")
async def sohbet_karsilama(request: Request, user: CurrentUser, session: Session) -> dict[str, str]:
    """Sesli sahnenin açılış cümlesi — kullanıcının GERÇEK kuyruk durumuna göre.

    Deterministik (LLM yok): sahne açılışında sessiz bekleme olmasın ve ilk cümlede sayı
    uydurma riski sıfır olsun diye. Sorgu başarısız olursa nötr karşılamaya düşer.
    """
    try:
        # _brifing_araci: "karar bekleyen" ve "kırmızı" ALT KÜME ilişkisini koruyarak hesaplar
        # (panel_istatistik'in ham sayıları bu cümle için yanlış iddia üretiyordu).
        istatistik = await _brifing_araci(session, user.id)
    except Exception as exc:
        # BİLEREK geniş: sesli sahne, istatistik hangi sebeple gelmezse gelmesin açılmalı
        # (DB kapalı, persist yok, beklenmedik regresyon). Ama sessiz bozulma görünür olsun
        # diye mesaj + stack loglanır — yoksa "hep nötr karşılama" bir kusuru gizleyebilir.
        log.warning("sohbet_karsilama_istatistik_hatasi",
                    error=type(exc).__name__, mesaj=str(exc), exc_info=True)
        istatistik = {}
    return {"metin": karsilama_metni(SESLI_PERSONA_ADI, istatistik)}


__all__ = ("router",)
