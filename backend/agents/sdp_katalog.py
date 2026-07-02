"""SDP (Standart Dosya Planı 2005/7) katalogu + içerik-tabanlı otomatik kod önerisi.

YENİLİKÇİLİK GEREKÇESİ: EBYS'lerde SDP konu kodu memur tarafından ELLE seçilir
(MEB/Erciyes EBYS kılavuzları). Bu modül evrak içeriğinden (konu + talep + özet)
deterministik anahtar-ifade eşlemesiyle SDP kodu ÖNERİR: aday listesi + skor +
gerekçe. LLM yok → halüsinasyon riski yok, mock/CI'da birebir çalışır.

Katalog kaynağı: data/sdp/sdp_katalog.json — 2005/7 kod aralıkları (000-099 ortak,
100-599 kuruma özgü ana hizmet, 600-999 yardımcı) + projenin EVRAK_TO_SDP kürasyonu.
Ana hizmet aralığındaki adaylar her zaman dogrula=True taşır (CLAUDE.md §1 —
kuruma özgü kod uydurulmaz, kaba kod [DOĞRULA:] ile işaretlenir).

Eşleme DETERMİNİSTİK: Türkçe-normalize alt-dizi araması (ek almış biçimleri de
yakalar: "dava"→"davası") + evrak türü uyum bonusu. Katalog yoksa graceful boş
liste → arsiv node config kaba koduna düşer (davranış regresyonu yok).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[2]
_KATALOG_YOLU = _ROOT / "data" / "sdp" / "sdp_katalog.json"

# Tür uyumu (config.EVRAK_TO_SDP eşleniği) anahtar-ifade eşleşmesinden zayıf sinyaldir:
# 1 anahtar eşleşmesi (1.0) tek başına tür bonusunu (0.5) geçer.
_TUR_UYUM_SKOR = 0.5


def _normalize(metin: str) -> str:
    """Türkçe-duyarlı küçük harfe çevir (İ→i, I→ı; str.lower tek başına yanlış çevirir)."""
    return metin.replace("İ", "i").replace("I", "ı").lower()


@lru_cache(maxsize=1)
def _katalog() -> tuple[dict[str, Any], ...]:
    """Katalogu yükle (süreç başına bir kez). Dosya yok/bozuksa boş katalog (graceful)."""
    try:
        veri = json.loads(_KATALOG_YOLU.read_text(encoding="utf-8"))
        return tuple(veri.get("kodlar", ()))
    except (OSError, ValueError) as exc:
        log.warning("sdp_katalog_yuklenemedi", yol=str(_KATALOG_YOLU), hata=str(exc))
        return ()


def katalog_kodlari() -> frozenset[str]:
    """Katalogdaki kod kümesi (kapsam testleri + doğrulama için)."""
    return frozenset(k["kod"] for k in _katalog())


def sdp_adi(kod: str) -> str:
    """SDP kodu → katalog adı. '[DOĞRULA: ...]' ekli kodların kök kodu çözülür."""
    kok = kod.split(" ")[0]
    for k in _katalog():
        if k["kod"] == kok:
            return str(k["ad"])
    return ""


def sdp_onerileri(
    parcalar: list[str], evrak_turu: str, top_k: int = 3
) -> list[dict[str, Any]]:
    """Evrak içeriğinden SDP kod adayları (skor sıralı, en fazla top_k).

    parcalar: konu/talep/özet gibi MASKELİ metin parçaları (PII güvenli girdi beklenir).
    Skor = eşleşen anahtar-ifade sayısı (her biri 1.0) + tür uyumu bonusu (0.5).
    Aday sözleşmesi: {kod, ad, skor, eslesen, tur_uyumu, dogrula}.
    """
    metin = _normalize(" ".join(p for p in parcalar if p))
    adaylar: list[dict[str, Any]] = []
    for k in _katalog():
        eslesen = [a for a in k.get("anahtar", ()) if _normalize(a) in metin]
        tur_uyumu = evrak_turu in k.get("turler", ())
        skor = float(len(eslesen)) + (_TUR_UYUM_SKOR if tur_uyumu else 0.0)
        if skor <= 0:
            continue
        adaylar.append({
            "kod": k["kod"],
            "ad": k["ad"],
            "skor": round(skor, 2),
            "eslesen": eslesen,
            "tur_uyumu": tur_uyumu,
            # Ana hizmet aralığı (100-599) HER ZAMAN kuruma özgü → doğrulama şart.
            "dogrula": bool(k.get("dogrula")) or k.get("aralik") == "ana_hizmet",
        })
    adaylar.sort(key=lambda a: (-a["skor"], a["kod"]))
    return adaylar[:top_k]


__all__ = ("katalog_kodlari", "sdp_adi", "sdp_onerileri")
