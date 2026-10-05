"""Görev 1 — Eksik bilgi tespiti node'u (tür-bağımlı zorunlu-alan + takip sorusu).

Dayanak (korpustan doğrulandı, data/mevzuat/3071_dilekce_hakki_kanunu.txt): 3071 s.K. m.4
dilekçede "adı-soyadı ve imzası ile iş veya ikametgâh adresi"ni şart koşar; m.6/c bu
şartlardan birini taşımayan dilekçenin İNCELENEMEYECEĞİNİ söyler. Kurumdan gelen resmî yazı
(icra/mahkeme/genelge dahil) dilekçe değildir → 3071 şartları ona UYGULANMAZ; resmî format
alanlarına bakılır. Zorunlu alan kümesi config.ZORUNLU_ALANLAR (docs/02 §5).

İMZA DÜRÜSTLÜĞÜ (teşhis 2026-10-05): düz metin/OCR'dan ıslak imzanın YOKLUĞU kanıtlanamaz.
cikar 'imza_durumu'nu 'var' | 'dogrulanamadi' olarak verir; 'dogrulanamadi' eksik SAYILMAZ
(vatandaşa "imzasız" denmez, clarifier durmaz) — memura bilgi notu düşülür.

Tasarım: eksik-alan tespiti DETERMİNİSTİK (çıkarılan unsurların VARLIK kontrolü —
halüsinasyon riski yok, recall-öncelikli). Takip sorusu (clarify) ifadesi LLM ile
nazik/bağlama-özel zenginleştirilir; AYNI tek çağrıda evrak metnindeki İÇERİK eksikleri
(işleme için gereken somut bilgi: adres/dönem/tutar vb.) de istenir ve clarify_questions'a
EK madde olur — eksik_alanlar listesi bundan ASLA etkilenmez (risk_guard/clarifier
sözleşmesi). LLM yok/hata → sabit Türkçe şablon sorular.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import LLM_DUSUNME_CIKARIMDA_KAPALI, ZORUNLU_ALANLAR
from agents.nodes._llm_extract import llm_json
from api.pii import mask_for_llm
from yazi.gelen_evrak import GelenEvrak

log = structlog.get_logger()

# Çıkarılan unsur anahtarı → zorunlu alan eşlemesi (varlık kontrolü).
_UNSUR_TO_ALAN: dict[str, str] = {
    "gonderen": "gonderen_ad_soyad",
    "tckn_maskeli": "tckn_veya_kurum",
    "tarih": "tarih",
    "konu": "konu",
    "talep": "talep",
    # Telefon adres DEĞİLDİR: m.4 "iş veya ikametgâh adresi" ister. İmza ve kurum kimliği
    # (tckn_veya_kurum) _mevcut_alanlar'da gelen evrak modeliyle ayrıca değerlendirilir.
    "iletisim_adres": "iletisim_adres",
}

# Tür-bağımlı zorunlu alanlar. Resmî yazılar (kurum→kurum) gönderen-vatandaş alanı
# (TCKN/adres) GEREKTİRMEZ; resmî format alanlarına (sayı/tarih/konu/imza) bakılır.
_RESMI_YAZI_TURLER = {"ust_yazi", "cevabi_yazi", "muzekkere", "genelge_talimat_olur",
                      "tebligat", "gorus_mutalaa", "icra_evraki", "dava_evraki"}
_RESMI_YAZI_ZORUNLU: tuple[str, ...] = ("konu", "tarih", "imza")

# 3071 m.4 — dilekçede ad-soyad VEYA imza VEYA adres eksikse evrak incelenmez (kritik).
_DILEKCE_KRITIK = {"gonderen_ad_soyad", "imza", "iletisim_adres"}

_ALAN_SORU: dict[str, str] = {
    "gonderen_ad_soyad": "Evrakı gönderenin adı-soyadı belirtilmemiş; ekler misiniz?",
    "tckn_veya_kurum": "Başvuranın T.C. kimlik no veya kurum bilgisi eksik.",
    "tarih": "Evrak tarihi tespit edilemedi; tarih ekleyiniz.",
    "konu": "Konu açıkça belirtilmemiş; kısa bir konu giriniz.",
    "talep": "Somut bir talep/istek tespit edilemedi.",
    "iletisim_adres": "İş veya ikametgâh adresi eksik; telefon numarası adres yerine geçmez.",
    "imza": ("İmza bulunmuyor; 3071 sayılı Kanun m.4 ve m.6/c uyarınca imzası bulunmayan "
             "dilekçe incelenemez."),
}

_IMZA_NOTU = ("İmza metinden doğrulanamadı: ıslak veya elektronik imzayı asıl evrak üzerinde "
              "kontrol ediniz (3071 sayılı Kanun m.4; imzasız dilekçe m.6/c uyarınca "
              "incelenemez).")

# İçerik-eksik maddeleri üst sınırı — taşkın LLM listesi soru listesini boğmasın (UI).
_MAX_ICERIK = 3

_SYSTEM = (
    "Sen kamu kurumunda eksik evrak için vatandaşa nazik takip sorusu yazan bir asistansın. "
    "Verilen eksik alan listesi için kısa, resmî-nazik Türkçe sorular üret ('sorular'). "
    "Ayrıca evrak METNİNİ incele: bu evrak türünü işleme almak için içerikte eksik kalan "
    "SOMUT bilgiler varsa (ör. olay yeri/adresi, dönem, tutar, başvuru numarası) bunları "
    "'icerik_eksikleri' altında kısa nazik istek cümleleri olarak yaz; yoksa boş liste döndür. "
    "Sorularda kanun/madde numarası YAZMA (atıf sistemce eklenir). Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"sorular": ["soru 1"], "icerik_eksikleri": ["istek 1"]}'
)


def _gelen(unsurlar: dict[str, Any]) -> GelenEvrak | None:
    veri = unsurlar.get("gelen_evrak")
    return GelenEvrak.from_dict(veri) if isinstance(veri, dict) else None


def _zorunlu_for(turu: str, gelen: GelenEvrak | None = None) -> tuple[str, ...]:
    """Tür + belge cinsi bağımlı zorunlu alan kümesi (tek kural tablosu).

    Resmî yazışma (tür ya da gelen evrakın kendisi kurum yazısıysa) → resmî format alanları.
    CİMER başvurusu → kimlik e-Devlet girişiyle doğrulanır, ıslak imza aranmaz.
    """
    if turu in _RESMI_YAZI_TURLER or (gelen is not None and gelen.resmi):
        return _RESMI_YAZI_ZORUNLU
    if gelen is not None and gelen.elektronik_kanal:
        return tuple(a for a in ZORUNLU_ALANLAR if a != "imza")
    return ZORUNLU_ALANLAR


def _mevcut_alanlar(unsurlar: dict[str, Any], gelen: GelenEvrak | None) -> set[str]:
    """Varlık kontrolü. İmza 'dogrulanamadi' eksik sayılmaz (yokluğu kanıtlanmadı)."""
    mevcut = {alan for key, alan in _UNSUR_TO_ALAN.items() if unsurlar.get(key)}
    # Başvuranın kimliği: gerçek kişide TCKN; tüzel kişi / kamu idaresinde unvanın kendisi.
    # (Eskiden muhatap kurumun adı da bunu karşılıyordu → TCKN eksiği hiç yakalanmıyordu.)
    if gelen is not None:
        if gelen.gonderen_turu != "gercek_kisi":
            mevcut.add("tckn_veya_kurum")
    elif unsurlar.get("kurum"):
        mevcut.add("tckn_veya_kurum")  # eski durum (gelen evrak modeli yok)
    durum = unsurlar.get("imza_durumu")
    if durum in ("var", "dogrulanamadi") or (durum is None and unsurlar.get("imza")):
        mevcut.add("imza")
    return mevcut


def _fallback_sorular(eksik: list[str]) -> list[str]:
    """Sabit Türkçe şablon sorular (LLM yok/hata) — eski stub davranışı korunur."""
    return [_ALAN_SORU[a] for a in eksik if a in _ALAN_SORU]


def _icerik_eksikleri(obj: dict[str, Any]) -> list[str]:
    """LLM'in içerik-eksik önerileri: yalnız temiz string'ler, üst sınırlı (additive)."""
    items = obj.get("icerik_eksikleri")
    if not isinstance(items, list):
        return []
    temiz = [s.strip() for s in items if isinstance(s, str) and s.strip()]
    return temiz[:_MAX_ICERIK]


async def _llm_sorular(eksik: list[str], turu: str, metin: str) -> list[str] | None:
    """LLM ile nazik takip soruları + içerik-eksik EK maddeleri (AYNI tek çağrı).

    'sorular' geçersiz/boşsa çıktının TAMAMI güvensiz sayılır → None (şablon fallback;
    içerik önerileri de düşer — bozuk çıktıya kısmi güven yok). Eski 'clarify_questions'
    anahtarı tolerans için kabul edilir (geriye uyum).
    """
    etiketler = ", ".join(_ALAN_SORU.get(a, a) for a in eksik)
    # KVKK: LLM'e ham sayısal PII gitmez (eksik-alan tespiti değerlere değil varlığa bakar).
    user = f"Evrak türü: {turu}\nEksik alanlar: {etiketler}\nEvrak metni:\n{mask_for_llm(metin, None)[:2000]}"
    obj = await llm_json(_SYSTEM, user, max_tokens=400,
                         dusunme_kapali=LLM_DUSUNME_CIKARIMDA_KAPALI)
    if obj is None:
        return None
    items = obj.get("sorular")
    if not isinstance(items, list):
        items = obj.get("clarify_questions")
    if not isinstance(items, list):
        return None
    sorular = [s.strip() for s in items if isinstance(s, str) and s.strip()]
    if not sorular:
        return None
    return sorular + _icerik_eksikleri(obj)


async def eksik_tespit_node(state: dict[str, Any]) -> dict[str, Any]:
    """Tür-bağımlı zorunlu alanlardan eksikleri tespit et + takip sorusu üret."""
    unsurlar = state.get("bilgi_unsurlari") or {}
    turu = state.get("evrak_turu", "belirsiz")
    metin = state.get("evrak_text", "") or ""
    gelen = _gelen(unsurlar)
    zorunlu = _zorunlu_for(turu, gelen)
    eksik = [a for a in zorunlu if a not in _mevcut_alanlar(unsurlar, gelen)]
    notlar = ([_IMZA_NOTU] if "imza" in zorunlu
              and unsurlar.get("imza_durumu") == "dogrulanamadi" else [])

    sorular = await _llm_sorular(eksik, turu, metin) if eksik else []
    if eksik and not sorular:
        sorular = _fallback_sorular(eksik)

    kritik = sorted(_DILEKCE_KRITIK & set(eksik)) if turu == "dilekce" else []
    log.info("eksik_tespit", turu=turu, eksik=eksik, kritik=kritik, notlar=len(notlar))
    return {"eksik_alanlar": eksik, "clarify_questions": sorular,
            "eksik_bilgi_notlari": notlar}


__all__ = ("eksik_tespit_node",)
