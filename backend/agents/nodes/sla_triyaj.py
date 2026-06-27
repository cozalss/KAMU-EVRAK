"""Görev 1 (yenilikçilik) — Yasal süre / SLA triyaj node'u.

Kamu gerçeği: vatandaş başvurularının yasal cevap süresi vardır (dilekçe 30 gün —
3071 s.K. m.7; bilgi edinme 15 iş günü — 4982 s.K. m.11). Süre kaçarsa = hak ihlali
+ idari sorumluluk. Bu node evrak türü + evrak tarihinden son cevap tarihini hesaplar
ve {GECİKMİŞ / KRİTİK / NORMAL} bandı üretir → demo'da kırmızı "GECİKMİŞ" rozeti.

Tasarım: DETERMİNİSTİK (config.EVRAK_TO_SURE tablosu + tarih aritmetiği) — LLM yok,
halüsinasyon yok. Süreler yalnız mevzuatta AÇIKÇA tanımlı olanlar (CLAUDE.md §1);
tanımsız tür → "tanımsız" (uydurma süre üretilmez). İş günü hesabı hafta sonunu atlar;
resmî/dini tatiller süreyi daha da uzatabilir (not düşülür, uydurulmaz).

`compute_sla` SAF + test-edilebilir (bugün enjekte edilir); node `date.today()` verir.

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir — anahtarlar SABİT):
    sla_metadata = {
        "durum": "GECIKMIS"|"KRITIK"|"NORMAL"|"tanimsiz"|"tarih_yok",
        "etiket": str,           # UI rozeti metni (Türkçe)
        "son_tarih": str,        # "dd.mm.yyyy" (hesaplanabildiyse)
        "kalan_gun": int|None,   # bugüne göre kalan gün (negatif = gecikmiş)
        "baslangic": str,        # evrak tarihi
        "sure": str,             # "30 gün" / "15 iş günü"
        "mevzuat": str,          # dayanak referansı
    }
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

import structlog

from agents.config import EVRAK_TO_SURE

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
# KRİTİK eşiği: son tarihe ≤ bu kadar gün kala "acil" (kırmızıya yakın turuncu).
_KRITIK_GUN = 2

# NOT: etiketlerde EMOJI YOK (proje "emoji→SVG" konvansiyonu) — UI kartta SVG ikon basar.
_DURUM_ETIKET: dict[str, str] = {
    "GECIKMIS": "GECİKMİŞ — yasal süre doldu",
    "KRITIK": "KRİTİK — süre bitmek üzere",
    "NORMAL": "Süre içinde",
    "tanimsiz": "Yasal süre türe göre tanımlı değil",
    "tarih_yok": "[DOĞRULA: evrak tarihi okunamadı]",
}


def _parse_tarih(s: str) -> date | None:
    """'dd.mm.yyyy' / 'dd-mm-yyyy' / 'dd/mm/yyyy' → date (geçersiz → None)."""
    m = _RE_TARIH.search(s or "")
    if not m:
        return None
    gun, ay, yil = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(yil, ay, gun)
    except ValueError:
        return None


def _add_is_gunu(baslangic: date, n: int) -> date:
    """baslangic + n iş günü (hafta sonu atlanır). Resmî tatil hariç (not: süreyi uzatır)."""
    cur = baslangic
    eklenen = 0
    while eklenen < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:  # Pzt-Cuma
            eklenen += 1
    return cur


def compute_sla(turu: str, tarih_str: str, bugun: date) -> dict[str, Any]:
    """Evrak türü + tarihten yasal son tarih + durum bandı (SAF — bugün enjekte edilir).

    Tablo dışı tür → 'tanimsiz' (uydurma süre yok). Tarih okunamazsa → 'tarih_yok'.
    """
    sure = EVRAK_TO_SURE.get(turu)
    if sure is None:
        return {"durum": "tanimsiz", "etiket": _DURUM_ETIKET["tanimsiz"],
                "son_tarih": None, "kalan_gun": None, "baslangic": None,
                "sure": None, "mevzuat": "—"}
    gun, is_gunu, ref = sure
    sure_str = f"{gun} iş günü" if is_gunu else f"{gun} gün"
    baslangic = _parse_tarih(tarih_str)
    if baslangic is None:
        return {"durum": "tarih_yok", "etiket": _DURUM_ETIKET["tarih_yok"],
                "son_tarih": None, "kalan_gun": None, "baslangic": None,
                "sure": sure_str, "mevzuat": ref}
    son = _add_is_gunu(baslangic, gun) if is_gunu else baslangic + timedelta(days=gun)
    kalan = (son - bugun).days
    if kalan < 0:
        durum = "GECIKMIS"
    elif kalan <= _KRITIK_GUN:
        durum = "KRITIK"
    else:
        durum = "NORMAL"
    return {
        "durum": durum,
        "etiket": _DURUM_ETIKET[durum],
        "son_tarih": son.strftime("%d.%m.%Y"),
        "kalan_gun": kalan,
        "baslangic": baslangic.strftime("%d.%m.%Y"),
        "sure": sure_str,
        "mevzuat": ref,
    }


async def sla_triyaj_node(state: dict[str, Any]) -> dict[str, Any]:
    """Yasal cevap süresi triyajı (additive, deterministik) — GECİKMİŞ/KRİTİK rozeti."""
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    # Yalnız çıkarılan/doğrulanan tarih; tüm evrak metnini GEÇİRME (gövdedeki rastgele
    # tarihi yakalayıp yanlış SLA hesaplama riski). Tarih yoksa compute_sla 'tarih_yok' üretir.
    tarih_str = str(unsurlar.get("tarih") or "")
    meta = compute_sla(turu, tarih_str, date.today())
    log.info("sla_triyaj", turu=turu, durum=meta["durum"], kalan=meta.get("kalan_gun"))
    return {"sla_metadata": meta}


__all__ = ("compute_sla", "sla_triyaj_node")
