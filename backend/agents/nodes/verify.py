"""Görev 2 — Doğrulama (verify) node'u: format-uyum + uydurma veto.

Şartname Görev 2 kalite kapısı: üretilen resmî yazı taslağı (1) zorunlu bölümleri
(T.C./Sayı/Konu/imza — Yön. 2646) içermeli ve (2) kaynak evrakta OLMAYAN somut
kurum/tarih/sayı UYDURMAMALI (CLAUDE.md §1 — hukuki/somut referans uydurma yasağı).

Tasarım (anti-halüsinasyon): tespit DETERMİNİSTİK regex/heuristik — tarih ve evrak
sayısı taslakta görünüyor ama `bilgi_unsurlari`'nda (doğrulanmış kaynak) ya da ham
evrak metninde YOKSA "uydurulmuş" sayılır ve veto uyarısı eklenir. Placeholder
(`{{ ... }}`) ve şablon ifadeleri muaf (henüz doldurulmamış → uydurma değil).

ADDITIVE / passthrough: state'i ASLA bozmaz; yalnız `verify_notes` + `verify_uyari`
+ (varsa) `format_uyumlu` günceller. VERIFY_ENABLED=0 → no-op (boş dict döner).
LLM opsiyoneldir; varsayılan saf-deterministik (anahtarsız demo deterministik kalır).
"""

from __future__ import annotations

import asyncio
import os
import re
from datetime import date
from typing import Any

import structlog

from agents.config import (
    BIRIMLER,
    KARAR_GROUNDING_ENABLED,
    LINT_AUTOFIX,
    MAKAM_LLM,
    VERIFY_ENABLED,
    VERIFY_GROUNDING_LLM,
    VERIFY_PARALEL,
    YAZI_ZORUNLU_BOLUMLER,
    birim_tr,
)
from agents.karar_grounding import karar_grounding_veto
from agents.kurum_kimlik import antet_idare_adi, kurum_uyusmazligi
from agents.nodes._llm_extract import llm_json, real_llm
from agents.servis_birim import SERVIS_BIRIM_TR
from agents.tutarlilik import tutarlilik_kontrol
from agents.yazi_lint import _makam_seviyesi, kurum_gorunumlu, lint_2646
from api.pii import mask_pii
from core.text import tr_lower
from yazi.models import sablon_iskelet_degerleri

log = structlog.get_logger()

# Madde 6 — grounding uyarı sanite sınırları (LLM çıktısına körü körüne güvenilmez).
_GROUNDING_MAX_IDDIA = 5
_GROUNDING_MAX_KARAKTER = 200

# Madde 6 — grounding YANLIŞ-POZİTİF süzgeci (SOMUT-ANCHOR modeli).
# Gerçek-LLM demosunda: grounding LLM, render'ın DETERMİNİSTİK koyduğu placeholder'ı
# (bugün tarihi, EBYS-TASLAK, KAMU KURUMU antet, imza bloğu), KAYNAKTA ZATEN geçen
# içeriği (LLM'in kendi hatası) ve standart resmî üslup kalıplarını "kaynakta yok →
# uydurma" sanıp risk_guard'ı KIRMIZI'ya çeviriyor → TEMİZ taslak jüri önünde damgalanıyor.
# Model (yüzey kelimeye değil somut çekirdeğe bakar → verbose/değişken LLM ifadelerine sağlam):
# bir iddia YALNIZ "somut, kaynağa DAYANMAYAN anchor" (sayı/tarih VEYA özel ad) taşıyorsa
# gerçek uydurmadır. Anchor kaynakta geçiyorsa / bugünün tarihiyse / şablon değeriyse
# GROUNDED'dır. Deterministik tarih/sayı vetosu (aşağıda) her durumda ayrıca korunur.
_ISKELET_KAPANIS: frozenset[str] = frozenset({
    "t.c.", "işlem tesis edilmiştir",
    "gereğini rica ederim", "gereğini arz ederim", "bilgilerinize arz ederim",
    "bilgilerine arz olunur", "olurlarınıza arz ederim", "bilgilerinize arz olunur",
    "bilgi ve gereğini arz ederim", "bilgilerinize sunulur",
    "bilgilerini ve gereğini arz ve rica ederim",
    "mevcut mevzuat hükümleri çerçevesinde", "gerekli değerlendirme yapılmıştır",
    "ebys onayı öncesinde oluşturulmuştur", "yukarıda arz edilen",
    "uygun görülmesini olurlarınıza arz ederim",
})


def _dinamik_antet_muaf(state: dict[str, Any]) -> set[str]:
    """Dinamik antet/muhatap değerleri — kaynak-doğrulamalı sistem künyesi.

    yazi_taslak `antet_meta`ya idare/birim/muhatap yazar: kurum kimliği evraktan
    deterministik regex'le VEYA kaynak-doğrulamalı LLM yedeğiyle gelir
    (kurum_kimlik._llm_kurum_grounded: ayırt-edici token'ı kaynakta geçmeyen LLM kurumu
    REDDEDİLİR — adversarial V1); birim kaynak-doğrulanmış teşkilattan gelir. Kanonik ek
    ("Belediyesi", "BAŞKANLIĞINA") kaynakta birebir geçmeyebilir → uydurma sayılmamalı
    (Sayı satırı / servis-birimi muafiyetiyle aynı güvence). muhatap_kurum/yetkili_kurum/
    hedef_birim aynı nedenle muaftır.
    """
    out: set[str] = set()
    meta = state.get("antet_meta") or {}
    if isinstance(meta, dict):
        out |= {str(v) for v in meta.values() if v}
    for anahtar in ("muhatap_kurum", "yetkili_kurum"):
        kurum = state.get(anahtar) or {}
        ad = str(kurum.get("ad", "") or "") if isinstance(kurum, dict) else ""
        if ad:
            out |= {ad, antet_idare_adi({"ad": ad})}
    hedef = state.get("hedef_birim")
    if isinstance(hedef, str) and hedef.strip():
        out.add(hedef.strip())
    return out


# Çevreleyen tırnak/noktalama (tek kaynak — _norm_ws + özel-ad kırpma aynı kümeyi kullanır).
_STRIP_CH = " '\"‘’“”«».,:;()"
# LLM işaretlediği ifadeyi TIRNAKLA gösterir. Tırnak SÖZCÜK SINIRINDA olmalı (açılış öncesi
# boşluk/başlangıç, kapanış sonrası boşluk/noktalama) → Türkçe iyelik kesmesi ('Kaya'nın)
# yanlışlıkla ayraç sayılmaz (aksi halde gerçek ad kaçırılırdı — regex-hijack).
_RE_ALINTI = re.compile(
    r"(?:(?<=\s)|^)['‘\"“«]([^'‘’\"“”«»\n]{2,150}?)['’\"”»](?=\s|[.,;:)]|$)")
_RE_SAYISAL = re.compile(r"\d[\d.\-/]*\d|\d")
# Türkçe kesme işareti varyantları — özel ad kökünü ekten ayırır ('Kaya'nın' → 'Kaya').
_RE_KESME = re.compile(r"['‘’`´]")
# Türkçe büyük harfler — özel ad (baş-harf) tespiti için (i̇→İ, ı→I ayrımı korunur).
_TR_BUYUK = frozenset("ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ")


def _norm_ws(s: str) -> str:
    """tr_lower + boşluk sıkıştır + çevreleyen tırnak/noktalama kırp (kaynak/ifade eşleme)."""
    return re.sub(r"\s+", " ", tr_lower(s)).strip(_STRIP_CH)


def _kaynakta_var(token: str, kaynak_norm: str) -> bool:
    """token kaynakta SÖZCÜK-SINIRLI geçiyor mu? Substring değil sınır eşleşmesi — 'aydın'
    fabrikasyonu kaynaktaki 'aydınlatma' içinde YANLIŞLIKLA grounded sayılmasın (\\w Unicode:
    Türkçe harf + rakam sınırı doğru çeker). Boş token güvenli tarafta grounded (True)."""
    if not token:
        return True
    return re.search(rf"(?<!\w){re.escape(token)}(?!\w)", kaynak_norm) is not None


def _ifade_gercek_uydurma(ifade: str, kaynak_norm: str, kaynak_sayilar: frozenset[str],
                          iskelet_sirali: list[str], bugunler: tuple[str, ...]) -> bool:
    """İşaretlenen ifade GERÇEK uydurma mı — somut, kaynağa DAYANMAYAN anchor taşır mı?

    Anchor = sayı/tarih VEYA özel ad (baş-harfi büyük). Anchor kaynakta SÖZCÜK-SINIRLI
    geçiyorsa / bugünün tarihiyse / şablon değeriyse GROUNDED sayılır. Somut un-grounded
    anchor yoksa → uydurma DEĞİL (False). İLK-SÖZCÜK: yalnız ÇOK-sözcüklü ifadede atlanır —
    orada baş-harf büyüklüğü cümle-başı olabilir ('Gelişmelerden ayrıca...' register kalıbı);
    TEK-sözcüklü ifadede sözcük çekirdeğin kendisidir ('Öztürk' → yakalanır). Somut-çekirdeğe
    baktığı için LLM'in verbose/değişken ifadelerine sağlamdır. SINIR: yalnız-niteliksel uydurma
    (ad/sayı içermeyen soyut taahhüt) burada yakalanmaz — node kapsamı somut kurum/tarih/sayı;
    HITL memur onayı yedek katmandır."""
    sl = _norm_ws(ifade)
    if not sl or _kaynakta_var(sl, kaynak_norm):
        return False  # boş ya da kaynakta birebir (sınırlı) → grounded
    # Bu iddiada GERÇEKTEN geçen şablon öbeklerinin sözcükleri grounded sayılır (TAM-öbek:
    # 'Dairesi'/'Müdürlüğü' gibi ortak son ek tek başına muaf OLMAZ — yalnız tam birim/şablon
    # adı geçerse). Öbek ayrıca sayı taraması için artık metinden çıkarılır (longest-first).
    r = sl
    grounded_kelimeler: set[str] = set()
    for dl in iskelet_sirali:
        if dl in r:
            grounded_kelimeler.update(dl.split())
            r = r.replace(dl, " ")
    for b in bugunler:  # giden yazı tarihi (birden çok format) → grounded
        r = r.replace(b, " ")
    # Sayı/tarih anchor: TAM token eşleşmesi (substring değil) — fabrikasyon '2026' kaynaktaki
    # '01.03.2026' içine sızıp grounded görünmesin; gerçek fabrike tutar/sayı yakalanır.
    for num in _RE_SAYISAL.findall(r):
        if len(num) >= 2 and num not in kaynak_sayilar:
            return True
    kelimeler = ifade.split()
    # CÜMLE-BAŞI sözcükleri özel ad anchor'ı sayma — Türkçe her cümle başını büyük harfle
    # yazar ('Söz konusu...', 'Bu husus...'), bunlar özel ad değildir. Cümle başı = ilk sözcük
    # VEYA önceki sözcük cümle sonlandırıcıyla biten sözcük. (Tek sözcüklü ifade çekirdektir → tutulur.)
    atla = set()
    if len(kelimeler) > 1:
        atla.add(0)
        for i in range(1, len(kelimeler)):
            if kelimeler[i - 1].rstrip("\"'’»)").endswith((".", "!", "?", ":")):
                atla.add(i)
    for i, w in enumerate(kelimeler):  # özel ad anchor
        if i in atla:
            continue
        wc = w.strip(_STRIP_CH)
        if len(wc) < 2 or wc[0] not in _TR_BUYUK:
            continue
        wl = tr_lower(wc)
        # Türkçe özel adlar eki apostroftan SONRA alır ('Kaya'nın', 'Ankara'da') → kökü
        # (apostrof öncesi) de kaynakla karşılaştır; kaynaktaki 'Kaya' suffikslenince kaçmasın.
        kok = _RE_KESME.split(wl, 1)[0]
        if (_kaynakta_var(wl, kaynak_norm) or wl in grounded_kelimeler
                or (kok != wl and len(kok) >= 2 and _kaynakta_var(kok, kaynak_norm))):
            continue  # kaynağa/şablona dayanıyor → grounded
        return True  # kaynağa dayanmayan özel ad → uydurma
    return False  # somut un-grounded anchor yok → register/grounded → yanlış-pozitif


def _grounding_yanlis_pozitif_mi(iddia: str, iskelet_sirali: list[str],
                                 kaynak_norm: str, kaynak_sayilar: frozenset[str],
                                 bugunler: tuple[str, ...]) -> bool:
    """İddia tamamen yanlış-pozitif mi (→ düş)? Tırnaklı ifade(ler) varsa YALNIZ onlar
    değerlendirilir (ifade = işaretlenen çekirdek); tırnak yoksa/regex ayıramazsa (Türkçe
    iyelik kesmesi vb.) tüm iddia değerlendirilir. Hiçbir aday gerçek uydurma değilse yanlış-pozitiftir."""
    adaylar = _RE_ALINTI.findall(iddia) or [iddia]
    return not any(
        _ifade_gercek_uydurma(p, kaynak_norm, kaynak_sayilar, iskelet_sirali, bugunler)
        for p in adaylar)

# Taslaktaki somut tarih / evrak-sayısı (cikar.py ile aynı desen — tutarlı tespit).
_RE_TARIH = re.compile(r"\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")
# Henüz doldurulmamış jinja/şablon placeholder'ları — uydurma DEĞİL, muaf.
_RE_PLACEHOLDER = re.compile(r"\{\{.*?\}\}", re.DOTALL)


def _eksik_bolumler(taslak_lower: str) -> list[str]:
    """Zorunlu format bölümlerinden taslakta bulunmayanların etiketlerini döndür."""
    eksik: list[str] = []
    for etiket, anahtarlar in YAZI_ZORUNLU_BOLUMLER:
        if not any(a in taslak_lower for a in anahtarlar):
            eksik.append(etiket)
    return eksik


def _kaynak_tokenlar(state: dict[str, Any]) -> tuple[set[str], set[str]]:
    """Doğrulanmış kaynaktan (bilgi_unsurlari + ham evrak) tarih/sayı token kümeleri.

    Taslaktaki somut değerler bu kümelerde yoksa "uydurma" sayılır. Ham evrak da
    dahildir: çıkarımda kaçan ama belgede gerçekten var olan değerler veto'lanmasın.
    Ayrıca taslağın üretildiği günün tarihi giden yazı tarihi olarak meşrudur; kaynak
    evrakta bulunması beklenmez.
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""
    kaynak = f"{evrak_text} {unsurlar.get('tarih', '')} {unsurlar.get('sayi', '')}"
    tarihler = set(_RE_TARIH.findall(kaynak))
    tarihler.add(date.today().strftime("%d.%m.%Y"))
    sayilar = set(_RE_SAYI.findall(kaynak))
    return tarihler, sayilar


def _uydurma_veto(taslak: str, state: dict[str, Any]) -> list[str]:
    """Taslakta olup kaynakta olmayan somut tarih/sayı → uydurma uyarısı listesi."""
    # Placeholder bloklarını çıkar — boş şablon alanı uydurma sayılmaz.
    govde = _RE_PLACEHOLDER.sub(" ", taslak)
    kaynak_tarih, kaynak_sayi = _kaynak_tokenlar(state)
    uyarilar: list[str] = []
    for tarih in set(_RE_TARIH.findall(govde)):
        if tarih not in kaynak_tarih:
            uyarilar.append(f"Taslaktaki '{tarih}' tarihi kaynak evrakta yok (doğrulayın).")
    for sayi in set(_RE_SAYI.findall(govde)):
        if sayi not in kaynak_sayi:
            uyarilar.append(f"Taslaktaki '{sayi}' sayısı kaynak evrakta yok (doğrulayın).")
    return uyarilar


async def _lint_autofix(taslak: str, lint: dict[str, Any],
                        state: dict[str, Any]) -> str | None:
    """Madde 2 — lint ihlalleri için LLM düzeltme önerisi (deterministik doğrulamalı).

    Kabul zinciri (LLM'e güvenilmez): (1) çıktı boş-olmayan string; (2) yeniden-lint
    uyarı sayısı AZALMALI; (3) düzeltme kaynakta olmayan YENİ tarih/sayı içermemeli
    (_uydurma_veto boş). Herhangi biri tutmazsa öneri sessizce düşürülür — mevcut
    davranış birebir. Mevcut taslak hiçbir durumda otomatik değişmez (yalnız öneri).
    """
    cevap = await llm_json(
        "Resmî Yazışma Yönetmeliği (CB 2646/2020) format düzelticisisin. Sana bir resmî "
        "yazı taslağı ve tespit edilmiş format ihlalleri verilecek. YALNIZ işaretli format "
        "ihlallerini düzelt; içerik/tarih/sayı EKLEME ve DEĞİŞTİRME; yeni bilgi uydurma. "
        'YALNIZ şu JSON\'u döndür: {"duzeltilmis_taslak": "<düzeltilmiş tam taslak>"}',
        "TASLAK:\n" + taslak + "\n\nFORMAT İHLALLERİ:\n"
        + "\n".join(f"- {u}" for u in lint.get("uyari", [])),
        max_tokens=900,
    )
    if not isinstance(cevap, dict):
        return None
    duzeltme = cevap.get("duzeltilmis_taslak")
    if not isinstance(duzeltme, str) or not duzeltme.strip():
        return None
    yeni_lint = lint_2646(duzeltme, state.get("yazi_turu", "") or "",
                          muhatap_makam=_lint_muhatabi(state))
    if len(yeni_lint.get("uyari", [])) >= len(lint.get("uyari", [])):
        return None  # iyileşme yok → öneri değersiz
    if _uydurma_veto(duzeltme, state):
        return None  # düzeltme yeni somut veri uydurdu → reddet
    return duzeltme


async def _makam_seviye_llm(makam_adi: str) -> int | None:
    """Katman B — tablo çözemeyen makam adının kademesini LLM'den kapalı-küme (1-8) al.

    Mock/anahtar yok/parse hatası/aralık dışı → None (katman tamamen susar). Sonuç
    lint'te YALNIZ 'bilgi' üretir — bu yardımcı hiçbir koşulda banda dokunamaz.
    """
    if not MAKAM_LLM or real_llm() is None:
        return None
    cevap = await llm_json(
        "Türk kamu idaresi makam kademesi sınıflandırıcısısın. Verilen birim/kurum "
        "adının hiyerarşi kademesini döndür: 1=Cumhurbaşkanlığı, 2=TBMM, 3=Bakanlık, "
        "4=Bakan Yardımcılığı/Müsteşarlık, 5=Genel Müdürlük/Valilik/Başkanlık/Rektörlük, "
        "6=Daire/İl Müdürlüğü/Kaymakamlık/Belediye, 7=İlçe-Şube Müdürlüğü, 8=Şeflik. "
        'YALNIZ şu JSON\'u döndür: {"kademe": <1-8>}; emin değilsen {"kademe": 0}.',
        f"MAKAM ADI: {makam_adi}",
        max_tokens=30,
    )
    if not isinstance(cevap, dict):
        return None
    kademe = cevap.get("kademe")
    return kademe if isinstance(kademe, int) and 1 <= kademe <= 8 else None


def _lint_muhatabi(state: dict[str, Any]) -> str:
    """m.16 hiyerarşi denetimi için muhatap — render'ın muhatap mantığının aynası.

    ust_yazi kurum-içi iletimdir → muhatap hedef birim; cevabi_yazi gelen yazıya
    cevaptır → muhatap evrakın GÖNDERENİ (vatandaşsa makam çözülmez, denetim susar).
    Diğer türlerde muhatap makamı belirsiz → boş dön (yanlış karşılaştırma sahte
    m.16 uyarısı üretir — runtime'da yakalanan yön hatasının düzeltmesi).
    """
    turu = state.get("yazi_turu", "") or ""
    if turu == "ust_yazi":
        # render'la birebir aynı kaynak (yazi_taslak: birim_tr) — HAM slug makam
        # çözücünün kalıplarını taşımaz, 9 birimin 8'inde denetimi sessizce söndürür.
        return birim_tr(state.get("hedef_birim", "") or "")
    if turu == "cevabi_yazi":
        unsur = state.get("bilgi_unsurlari") or {}
        return str(unsur.get("gonderen", "") or "")
    return ""


async def _grounding_iddialar(taslak: str, state: dict[str, Any]) -> list[str]:
    """Madde 6 — iddia-düzeyi grounding: taslakta kaynağa dayanmayan somut iddialar.

    GÜVENLİK ASİMETRİSİ: dönen iddialar verify_uyari'ye 'kaynak evrakta yok' imzasıyla
    EKLENİR (risk_guard otomatik KIRMIZI'ya çevirir); deterministik regex veto hiçbir
    durumda silinmez/yumuşatılmaz. Girdi maskeli metin (PII sızmaz); çıktı sanite
    süzgecinden geçer (yalnız string, ≤5 iddia, ≤200 karakter).

    YANLIŞ-POZİTİF SÜZGECİ: render'ın deterministik koyduğu placeholder'lar (bugünün tarihi,
    EBYS-TASLAK, KAMU KURUMU/YAZI İŞLERİ BİRİMİ antet, Yetkili İmza/Birim Yetkilisi, demo
    muhatap), KAYNAKTA zaten geçen içerik ve standart resmî kalıplar UYDURMA DEĞİLDİR; hem
    prompt'ta yasaklanır hem de somut-anchor modeliyle deterministik süzülür
    (`_grounding_yanlis_pozitif_mi`) — LLM prompt'u dinlemese de temiz taslak KIRMIZI olmaz.
    """
    kaynak_maskeli = mask_pii(state.get("evrak_text", "") or "").masked_text
    # Memurun kutucukla eklediği DAYANAK bloğu (yazi.dayanak) LLM'e GÖSTERİLMEZ: bu bloktaki
    # atıflar LLM üretimi değil, memurun korpustan SEÇTİĞİ referanslardır (insan-küreli, HITL) →
    # anti-halüsinasyon denetimi LLM üretimi GÖVDEyi hedefler. Blok ayrıştırılınca meşru atıf
    # 'uydurma' sayılmaz VE istemci-kontrollü hiçbir metin grounding'e girmez (güvenli; bkz.
    # dayanak_blogunu_cikar). Deterministik uydurma-veto (6+ hane/tarih) taslağın TAMAMINA uygulanır.
    from yazi.dayanak import dayanak_blogunu_cikar
    taslak_govde = dayanak_blogunu_cikar(taslak)
    cevap = await llm_json(
        "Kamu evrak doğrulama denetçisisin. Taslaktaki her SOMUT iddiayı (kurum adı, kişi, "
        "mevzuat madde numarası, tutar, taahhüt) kaynak evrakla karşılaştır. YALNIZ kaynakta "
        "hiçbir biçimde dayanağı olmayan iddiaları listele; biçim farkı (ayraç/format) iddia "
        "DEĞİLDİR. Şablon iskeleti UYDURMA DEĞİLDİR, LİSTELEME: T.C. başlığı; giden yazının "
        "tarihi (bugünün tarihi); jenerik/placeholder kurum-birim-sayı-imza-makam ('KAMU "
        "KURUMU', 'YAZI İŞLERİ BİRİMİ', 'EBYS-TASLAK', 'Yetkili İmza', 'Birim Yetkilisi', "
        "'İlgili Makama'); ve standart resmî kapanış/işlem kalıpları ('gereğini arz ederim', "
        "'işlem tesis edilmiştir' vb.). YALNIZ kaynaktaki bir kişi/kurum/olayla ÇELİŞEN veya "
        'kaynakta hiç olmayan SOMUT bir olgu uydurulduysa listele. Şu JSON\'u döndür: '
        '{"desteklenmeyen_iddialar": ["..."]}',
        "KAYNAK EVRAK:\n" + kaynak_maskeli[:3000] + "\n\nTASLAK:\n" + taslak_govde[:3000],
        max_tokens=400,
    )
    if not isinstance(cevap, dict) or not isinstance(cevap.get("desteklenmeyen_iddialar"), list):
        return []
    # Yanlış-pozitif süzgeci — somut-anchor modeli (tek kaynak: yazi.models). Şablon
    # değerleri longest-first sıralı (fragman bırakmaz); eşit uzunlukta ikincil alfabetik
    # anahtar → PYTHONHASHSEED'den TAM bağımsız (deterministik). Kaynak grounding için HAM
    # evrak metni kullanılır (maskeli değil — yalnız karşılaştırma, emit edilmez).
    # Grounded küme = şablon iskeleti + kapanış kalıpları + KAPALI-KÜME birim adları +
    # bu belgenin deterministik Sayı satırı (yönlendirme/SDP kararı — kaynakta olmasa da
    # uydurma değil; 'E-[DETSİS No]-930-[Kayıt No]' tümüyle şablon mobilyasıdır).
    sayi_str = str((state.get("ust_veri") or {}).get("sayi") or "")
    # Antet birimi (servis_birimi → "Fen İşleri Müdürlüğü") sistem-tespitli meşru değerdir,
    # kaynakta geçmese de UYDURMA DEĞİL → grounding muafiyetine eklenir (9-birim ile aynı desen).
    iskelet_kaynak = (sablon_iskelet_degerleri() | _ISKELET_KAPANIS
                      | {birim_tr(k) for k in BIRIMLER} | set(SERVIS_BIRIM_TR.values())
                      | ({sayi_str} if sayi_str else set())
                      | _dinamik_antet_muaf(state))
    # İddialarla AYNI normalizasyon (_norm_ws) → 'Başvurunuz.' sondaki nokta uyuşmazlığı olmaz.
    iskelet_sirali = sorted({n for d in iskelet_kaynak if d and (n := _norm_ws(d))},
                            key=lambda s: (-len(s), s))
    kaynak_norm = _norm_ws(state.get("evrak_text", "") or "")
    kaynak_sayilar = frozenset(_RE_SAYISAL.findall(kaynak_norm))  # tam-token grounding
    # NOT: SDP kodu (ör. '930') kaynak_sayilar'a EKLENMEZ — eklenirse claim'de geçen HERHANGİ
    # bir '930' (fabrike tutar/madde) yanlışlıkla grounded sayılıp gerçek uydurma DÜŞERdi
    # (güvenlik asimetrisi ihlali). Sayı satırı zaten TÜM-ÖBEK olarak iskelet_kaynak'ta muaf.
    # Giden yazı tarihi = BUGÜN → tam tarih (iki format) + bare YIL grounded. LLM bazen
    # tarihi tırnaksız + yıla ayrı atıfla işaretliyor ('...2026 tarihi kaynakla çelişiyor');
    # yıl da giden-yazı tarihinin meşru bileşeni → sayı-anchor'ında uydurma sayılmamalı.
    _bugun = date.today()
    bugunler = (_bugun.strftime("%d.%m.%Y"), _bugun.strftime("%Y-%m-%d"), _bugun.strftime("%Y"))
    temiz = [i.strip()[:_GROUNDING_MAX_KARAKTER]
             for i in cevap["desteklenmeyen_iddialar"]
             if isinstance(i, str) and i.strip()
             and not _grounding_yanlis_pozitif_mi(
                 i, iskelet_sirali, kaynak_norm, kaynak_sayilar, bugunler)]
    return [f"Taslaktaki iddia kaynak evrakta yok (LLM grounding): {i}"
            for i in temiz[:_GROUNDING_MAX_IDDIA]]


# Kurum uyuşmazlığı sinyalinin imzası — risk_guard bunu KIRMIZI'ya çevirir (uydurma ile
# AYNI band-zorlama gücü; taksonomi tipi risk_agirlik.KURUM_UYUSMAZLIK). Metin makine
# sözleşmesidir: değişirse risk_agirlik._TAKSONOMI ve risk_guard._UYUSMAZLIK_IMZA birlikte güncellenir.
_UYUSMAZLIK_IMZA = "Kurum uyuşmazlığı"


def _kurum_uyusmazlik_uyari(state: dict[str, Any]) -> list[str]:
    """TEK-KURUM modeli (19 Tem): gelen evrak, aktif kurumdan FARKLI TÜRDE bir kuruma
    hitaben düzenlenmişse KIRMIZI uyarı üret (deterministik; taslaktan bağımsız).

    aktif kurum = env KURUM_ADI (yazi/models._DEMO_DEFAULTS ile aynı kaynak). Boşsa
    (test/baseline) veya uyuşmazlık yoksa → boş liste. Antet DEĞİŞTİRİLMEZ; bu yalnız
    risk sinyalidir → risk bandı KIRMIZI → onay kapısı gönderimi kilitler.
    """
    aktif = os.getenv("KURUM_ADI", "").strip()
    if not aktif:
        return []
    yabanci = kurum_uyusmazligi(
        state.get("evrak_text", "") or "", state.get("bilgi_unsurlari") or {}, aktif)
    if not yabanci:
        return []
    return [
        f"{_UYUSMAZLIK_IMZA}: gelen belge '{yabanci['ad']}' kurumuna hitaben düzenlenmiş; "
        f"işlemi yapan aktif kurum farklı ({aktif}). Antet aktif kuruma göre düzenlendi — "
        "bu belge büyük olasılıkla yanlış kuruma ulaştı; gönderim onay olmadan yapılamaz."
    ]


async def verify_node(state: dict[str, Any]) -> dict[str, Any]:
    """Taslak format-uyumu + uydurma veto — additive passthrough (state bozmaz)."""
    if not VERIFY_ENABLED:
        return {}  # no-op: grafta var ama kapalı (baseline davranış korunur)

    # S2 — kaynak evrak veri-tutarlılığı taslaktan bağımsız denetlenir (TCKN checksum,
    # gelecek tarih, m.11 sayı deseni); taslak yoksa da raporlanır.
    # PII güvenliği (CRITICAL guard): uyarı metinleri TCKN-şekilli ham sayı taşıyabilir
    # ve /process_doc/stream ara SSE event'leri _to_response maskesini ATLAR → maskeleme
    # state'e girmeden BURADA yapılır (risk_guard.gerekceler ile aynı desen) — REST, SSE,
    # DB persist ve her gelecek tüketici otomatik korunur.
    tutarlilik = [mask_pii(u).masked_text for u in tutarlilik_kontrol(
        state.get("evrak_text", "") or "", state.get("bilgi_unsurlari") or {}
    )]

    # Kurum uyuşmazlığı taslaktan BAĞIMSIZ (gelen evrak vs aktif kurum) → taslak yoksa da raporlanır.
    uyusmazlik = _kurum_uyusmazlik_uyari(state)

    taslak = state.get("yazi_taslak_md", "") or ""
    if not taslak:
        return {"verify_notes": "Taslak bulunamadı — doğrulama atlandı.",
                "verify_uyari": uyusmazlik, "tutarlilik_uyari": tutarlilik}

    eksik = _eksik_bolumler(tr_lower(taslak))
    uydurma = _uydurma_veto(taslak, state)
    # Karar/inceleme grounding — soyut taahhüt uydurması (incelenmiştir/uygun bulunmuştur/
    # reddedilmiştir kaynakta yokken). _uydurma_veto ile AYNI imza ("kaynak evrakta yok")
    # → risk_guard KIRMIZI → HITL onayı zorunlu. Deterministik (mock/CI'da da çalışır).
    if KARAR_GROUNDING_ENABLED:
        uydurma += karar_grounding_veto(taslak, state.get("evrak_text", "") or "")
    # NOT: belirsiz_makam_uyari (agents.karar_grounding) tanımlı + test edildi ama verify'a
    # BAĞLANMADI — mevcut render kurum/imza yapılandırması olmadığında "KAMU KURUMU"/"Yetkili
    # İmza" placeholder'larını DOĞAL olarak basıyor (§4 yapılandırılmış girdi boşluğu), her
    # taslağı uyarıyla işaretlerdi. §4 (kullanıcıdan kurum/imza girişi) eklenince etkinleşmeli.
    # Uydurma-veto mesajları taslaktaki HAM tarih/sayı token'ını içerir (TCKN-şekilli
    # olabilir) → SSE'ye maskesiz gitmesin diye state'e girmeden maskelenir.
    uyarilar = ([mask_pii(u).masked_text for u in uydurma]
                + uyusmazlik + [f"Eksik bölüm: {e}" for e in eksik])
    # S2 — madde-referanslı 2646 lint raporu (kural-kimlikli; risk'e yalnız 'uyari' gider).
    # muhatap: render'ın muhatap mantığıyla AYNI (yön hatası = sahte m.16 uyarısı üretir).
    # Katman B: muhatap KURUM görünümlü ama tablo çözemiyorsa LLM kademe tahmini
    # (yalnız 'bilgi' üretebilir) — tablo çözüyorsa hiç sorulmaz (maliyet + öncelik).
    async def _lint_zinciri() -> tuple[dict[str, Any], str | None]:
        """makam-kademe → lint → autofix zinciri (grounding'den bağımsız dal)."""
        muhatap = _lint_muhatabi(state)
        seviye_llm = None
        # LLM'e YALNIZ kurum-görünümlü ama tablo-çözümsüz adlar sorulur (vatandaş adına
        # boşa çağrı yok; tablo çözüyorsa öncelik zaten deterministik katmanda).
        if muhatap and _makam_seviyesi(muhatap) is None and kurum_gorunumlu(muhatap):
            seviye_llm = await _makam_seviye_llm(muhatap)
        lint = lint_2646(taslak, state.get("yazi_turu", "") or "",
                         muhatap_makam=muhatap, muhatap_seviye_llm=seviye_llm)
        # Madde 2 — lint auto-fix önerisi: yalnız ihlal VARSA çağrılır (maliyet disiplini).
        duzeltme: str | None = None
        if LINT_AUTOFIX and lint.get("uyari"):
            duzeltme = await _lint_autofix(taslak, lint, state)
        return lint, duzeltme

    # Madde 6 — LLM grounding: yalnız uyarı EKLER (bandı sertleştirme yönü serbest;
    # deterministik veto her durumda üstte kalır). LLM yok/mock/bozuk → hiçbir ek yok.
    if VERIFY_PARALEL and VERIFY_GROUNDING_LLM:
        # Hız 15d: grounding ∥ lint zinciri — iki dal birbirinin çıktısını okumaz
        # (grounding taslak+kaynak; lint taslak+muhatap). Uyarı sırası seri yolla aynı.
        (lint, lint_duzeltme), grounding = await asyncio.gather(
            _lint_zinciri(), _grounding_iddialar(taslak, state))
        uyarilar += [mask_pii(u).masked_text for u in grounding]
    else:
        lint, lint_duzeltme = await _lint_zinciri()
        if VERIFY_GROUNDING_LLM:
            uyarilar += [mask_pii(u).masked_text
                         for u in await _grounding_iddialar(taslak, state)]

    notlar = (
        "Doğrulama tamam — format zorunlu bölümleri mevcut, uydurma somut veri yok."
        if not uyarilar
        else f"Doğrulama {len(uyarilar)} uyarı buldu: " + " | ".join(uyarilar)
    )
    if lint["uyari"] or tutarlilik:
        notlar += (f" 2646 lint: {lint['ozet']['gecti']} kural geçti, "
                   f"{len(lint['uyari'])} uyarı; tutarlılık: {len(tutarlilik)} uyarı.")
    out: dict[str, Any] = {"verify_notes": notlar, "verify_uyari": uyarilar,
                           "lint_2646": lint, "tutarlilik_uyari": tutarlilik}
    if lint_duzeltme:
        out["lint_duzeltme_md"] = lint_duzeltme
    # format_uyumlu yalnız ZAYIFLATMA yönünde güncellenir (eksik bölüm → False).
    if eksik:
        out["format_uyumlu"] = False
    log.info("verify", eksik=eksik, uydurma=len(uydurma),
             lint_uyari=len(lint["uyari"]), tutarlilik=len(tutarlilik),
             lint_duzeltme=bool(lint_duzeltme))
    return out


__all__ = ("verify_node",)
