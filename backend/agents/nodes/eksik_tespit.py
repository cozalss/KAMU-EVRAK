"""Görev 1 — Eksik bilgi tespiti node'u (tür-bağımlı zorunlu-alan + takip sorusu).

Dayanak: 3071 sayılı Kanun m.4 — dilekçede ad-soyad / imza / adres eksikse İNCELENMEZ.
Resmî yazıda (üst/cevabi) farklı zorunlular geçerlidir (sayı/tarih/konu/imza — Yön. 2646).
Zorunlu alan kümesi config.ZORUNLU_ALANLAR (docs/02 §5).

Tasarım: eksik-alan tespiti DETERMİNİSTİK (çıkarılan unsurların VARLIK kontrolü —
halüsinasyon riski yok, recall-öncelikli). Takip sorusu (clarify) ifadesi LLM ile
nazik/bağlama-özel zenginleştirilir; LLM yok/hata → sabit Türkçe şablon sorular.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import ZORUNLU_ALANLAR
from agents.nodes._llm_extract import llm_json

log = structlog.get_logger()

# Çıkarılan unsur anahtarı → zorunlu alan eşlemesi (varlık kontrolü).
_UNSUR_TO_ALAN: dict[str, str] = {
    "gonderen": "gonderen_ad_soyad",
    "tckn_maskeli": "tckn_veya_kurum",
    "kurum": "tckn_veya_kurum",
    "tarih": "tarih",
    "konu": "konu",
    "talep": "talep",
    "iletisim_adres": "iletisim_adres",
    "telefon_maskeli": "iletisim_adres",
    "imza": "imza",
}

# Tür-bağımlı zorunlu alanlar. Resmî yazılar (kurum→kurum) gönderen-vatandaş alanı
# (TCKN/adres) GEREKTİRMEZ; resmî format alanlarına (sayı/tarih/konu/imza) bakılır.
_RESMI_YAZI_TURLER = {"ust_yazi", "cevabi_yazi", "muzekkere", "genelge_talimat_olur",
                      "tebligat", "gorus_mutalaa"}
_RESMI_YAZI_ZORUNLU: tuple[str, ...] = ("konu", "tarih", "imza")

# 3071 m.4 — dilekçede ad-soyad VEYA imza VEYA adres eksikse evrak incelenmez (kritik).
_DILEKCE_KRITIK = {"gonderen_ad_soyad", "imza", "iletisim_adres"}

_ALAN_SORU: dict[str, str] = {
    "gonderen_ad_soyad": "Evrakı gönderenin adı-soyadı belirtilmemiş; ekler misiniz?",
    "tckn_veya_kurum": "Başvuranın T.C. kimlik no veya kurum bilgisi eksik.",
    "tarih": "Evrak tarihi tespit edilemedi; tarih ekleyiniz.",
    "konu": "Konu açıkça belirtilmemiş; kısa bir konu giriniz.",
    "talep": "Somut bir talep/istek tespit edilemedi.",
    "iletisim_adres": "İletişim/tebligat adresi (veya telefon) eksik.",
    "imza": "İmza bulunmuyor; 3071 m.4 gereği imzasız dilekçe incelenmez.",
}

_SYSTEM = (
    "Sen kamu kurumunda eksik evrak için vatandaşa nazik takip sorusu yazan bir asistansın. "
    "Verilen eksik alan listesi için kısa, resmî-nazik Türkçe sorular üret. Mevzuat maddesi "
    "UYDURMA. Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"clarify_questions": ["soru 1", "soru 2"]}'
)


def _zorunlu_for(turu: str) -> tuple[str, ...]:
    """Tür-bağımlı zorunlu alan kümesi (resmî yazı vs dilekçe/vatandaş evrakı)."""
    if turu in _RESMI_YAZI_TURLER:
        return _RESMI_YAZI_ZORUNLU
    return ZORUNLU_ALANLAR


def _fallback_sorular(eksik: list[str]) -> list[str]:
    """Sabit Türkçe şablon sorular (LLM yok/hata) — eski stub davranışı korunur."""
    return [_ALAN_SORU[a] for a in eksik if a in _ALAN_SORU]


async def _llm_sorular(eksik: list[str], turu: str) -> list[str] | None:
    """LLM ile bağlama-özel nazik takip soruları; geçersiz/boş → None (fallback)."""
    etiketler = ", ".join(_ALAN_SORU.get(a, a) for a in eksik)
    obj = await llm_json(_SYSTEM, f"Evrak türü: {turu}\nEksik alanlar: {etiketler}",
                         max_tokens=300)
    if obj is None:
        return None
    items = obj.get("clarify_questions")
    if not isinstance(items, list):
        return None
    sorular = [s.strip() for s in items if isinstance(s, str) and s.strip()]
    return sorular or None


async def eksik_tespit_node(state: dict[str, Any]) -> dict[str, Any]:
    """Tür-bağımlı zorunlu alanlardan eksikleri tespit et + takip sorusu üret."""
    unsurlar = state.get("bilgi_unsurlari") or {}
    turu = state.get("evrak_turu", "belirsiz")
    mevcut: set[str] = {alan for key, alan in _UNSUR_TO_ALAN.items() if unsurlar.get(key)}
    eksik = [a for a in _zorunlu_for(turu) if a not in mevcut]

    sorular = await _llm_sorular(eksik, turu) if eksik else []
    if eksik and not sorular:
        sorular = _fallback_sorular(eksik)

    kritik = sorted(_DILEKCE_KRITIK & set(eksik)) if turu == "dilekce" else []
    log.info("eksik_tespit", turu=turu, eksik=eksik, kritik=kritik)
    return {"eksik_alanlar": eksik, "clarify_questions": sorular}


__all__ = ("eksik_tespit_node",)
