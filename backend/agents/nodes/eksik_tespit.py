"""Görev 1 — Eksik bilgi tespiti node'u.

Dayanak: 3071 sayılı Kanun m.4 — ad-soyad / imza / adres eksikse dilekçe İNCELENMEZ.
Zorunlu alan kümesi config.ZORUNLU_ALANLAR (docs/02).

# TODO(kamu-evrak): STUB, çıkarılan unsurların VARLIĞINA bakar. Üretimde:
#   - tür-bağımlı zorunlu-alan şeması (dilekçe vs üst yazı farklı),
#   - recall-öncelikli (F-beta β=2 — kamuda eksik-kaçırma maliyeti yüksek),
#   - ADALET clarify_slots.py CLAM round-1/2 deseni ile takip sorusu üretimi.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import ZORUNLU_ALANLAR

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


async def eksik_tespit_node(state: dict[str, Any]) -> dict[str, Any]:
    """Zorunlu alanlardan eksik olanları tespit et + takip sorusu üret (STUB)."""
    unsurlar = state.get("bilgi_unsurlari") or {}
    mevcut: set[str] = {alan for key, alan in _UNSUR_TO_ALAN.items() if unsurlar.get(key)}
    eksik = [a for a in ZORUNLU_ALANLAR if a not in mevcut]

    sorular: list[str] = []
    _ALAN_SORU = {
        "gonderen_ad_soyad": "Evrakı gönderenin adı-soyadı belirtilmemiş; ekler misiniz?",
        "tckn_veya_kurum": "Başvuranın T.C. kimlik no veya kurum bilgisi eksik.",
        "tarih": "Evrak tarihi tespit edilemedi; tarih ekleyiniz.",
        "konu": "Konu açıkça belirtilmemiş; kısa bir konu giriniz.",
        "talep": "Somut bir talep/istek tespit edilemedi.",
        "iletisim_adres": "İletişim/tebligat adresi (veya telefon) eksik.",
        "imza": "İmza bulunmuyor; 3071 m.4 gereği imzasız dilekçe incelenmez.",
    }
    for a in eksik:
        if a in _ALAN_SORU:
            sorular.append(_ALAN_SORU[a])

    log.info("eksik_tespit", eksik=eksik)
    return {"eksik_alanlar": eksik, "clarify_questions": sorular}


__all__ = ("eksik_tespit_node",)
