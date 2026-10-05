"""Görev 1 (yenilikçilik) — Yasal süre / SLA triyaj node'u.

Kamu gerçeği: vatandaş başvurularının yasal cevap süresi vardır (dilekçe 30 gün —
3071 s.K. m.7; bilgi edinme 15 iş günü — 4982 s.K. m.11). Süre kaçarsa = hak ihlali
+ idari sorumluluk. Bu node evrak türü + evrak tarihinden son cevap tarihini hesaplar
ve {GECİKMİŞ / KRİTİK / NORMAL} bandı üretir → demo'da kırmızı "GECİKMİŞ" rozeti.

Tasarım: DETERMİNİSTİK (config.EVRAK_TO_SURE tablosu + tarih aritmetiği) — LLM yok,
halüsinasyon yok. Süreler yalnız mevzuatta AÇIKÇA tanımlı olanlar (CLAUDE.md §1);
tanımsız tür → "tanımsız" (uydurma süre üretilmez). İş günü hesabı hafta sonuna EK
olarak resmî tatilleri (2429 sabit + Diyanet dini bayram) de atlar (agents.resmi_tatil
tek kaynak). Takvim-günü türleri (3071 dilekçe 30 gün) sayımda tatilleri İÇERİR, ANCAK
son günü tatile/hafta sonuna denk gelirse izleyen ilk iş gününe uzar (2429 m.3 / HMK m.93).

`compute_sla` SAF + test-edilebilir (bugün enjekte edilir); node `date.today()` verir.

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir — anahtarlar SABİT):
    sla_metadata = {
        "durum": "GECIKMIS"|"KRITIK"|"NORMAL"|"tanimsiz"|"tarih_yok",
        "etiket": str,           # UI rozeti metni (Türkçe)
        "son_tarih": str,        # "dd.mm.yyyy" (hesaplanabildiyse)
        "kalan_gun": int|None,   # bugüne göre kalan gün (negatif = gecikmiş)
        "baslangic": str,        # evrak tarihi
        "sure": str,             # "30 gün" / "15 iş günü"
        "mevzuat": str,          # dayanak referansı (metin süresinde: alıntı)
        # additive (2026-10-05): "sure_kaynagi": "metin"|"tur"|None,
        # "baslangic_kaynagi": "gelen_evrak"|"cikarim"|None, "ivedilik": "ACELE"|"GÜNLÜDÜR"|"",
        # "ivedilik_dayanak": str
    }
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

import structlog

from agents.config import EVRAK_TO_SURE
from agents.resmi_tatil import is_calisma_gunu, sonraki_calisma_gunu
from agents.sla_metin import M26, baslangic_sec, ivedilik_ibaresi, metinden_sure

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
# KRİTİK eşiği: son tarihe ≤ bu kadar gün kala "acil" (kırmızıya yakın turuncu).
_KRITIK_GUN = 2

# NOT: etiketlerde EMOJI YOK (proje "emoji→SVG" konvansiyonu) — UI kartta SVG ikon basar.
_DURUM_ETIKET: dict[str, str] = {
    "GECIKMIS": "GECİKMİŞ — yasal süre doldu",
    "KRITIK": "KRİTİK — süre bitmek üzere",
    "NORMAL": "Süre içinde",
    "tanimsiz": "[DOĞRULA: cevap süresi — türe göre yasal süre yok, metinde süre yazılı değil]",
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
    """baslangic + n iş günü — hafta sonu VE resmî tatil (2429 + dini bayram) atlanır.

    4982 m.11 "on beş iş günü" hesabı: tatile denk gelen günler sayılmaz → son tarih
    ileri kayar (agents.resmi_tatil tek kaynak; takvim-günü türleri bundan etkilenmez).
    """
    cur = baslangic
    eklenen = 0
    while eklenen < n:
        cur += timedelta(days=1)
        if is_calisma_gunu(cur):
            eklenen += 1
    return cur


def _bant(son: date, bugun: date) -> tuple[str, int]:
    kalan = (son - bugun).days
    if kalan < 0:
        return "GECIKMIS", kalan
    return ("KRITIK" if kalan <= _KRITIK_GUN else "NORMAL"), kalan


def _bos(durum: str, sure: str | None = None, ref: str = "—") -> dict[str, Any]:
    return {"durum": durum, "etiket": _DURUM_ETIKET[durum], "son_tarih": None,
            "kalan_gun": None, "baslangic": None, "sure": sure, "mevzuat": ref}


def _metin_son(ms: dict[str, Any], baslangic: date) -> tuple[date, str]:
    """Metinde yazılı süre → (son tarih, süre metni). Gönderenin yazdığı TARİH aynen alınır
    (ileri kaydırılmaz — tutucu); 'N gün içinde' süresi 2429 m.3 ile son günü kaydırır."""
    if ms["son"] is not None:
        return ms["son"], f"{ms['son'].strftime('%d.%m.%Y')} tarihine kadar"
    gun, is_gunu = ms["gun"], ms["is_gunu"]
    son = _add_is_gunu(baslangic, gun) if is_gunu else baslangic + timedelta(days=gun)
    return sonraki_calisma_gunu(son), (f"{gun} iş günü" if is_gunu else f"{gun} gün")


def _tur_suresi(turu: str, baslangic: date) -> tuple[date, str, str, str] | None:
    sure = EVRAK_TO_SURE.get(turu)
    if sure is None:
        return None
    gun, is_gunu, ref = sure
    son = _add_is_gunu(baslangic, gun) if is_gunu else baslangic + timedelta(days=gun)
    # 2429 m.3 + HMK m.93 (data/mevzuat/2429...txt): sürenin SON GÜNÜ hafta tatili/resmî
    # tatile rastlarsa süre izleyen ilk iş günü mesai bitiminde biter → son ileri kayar.
    return sonraki_calisma_gunu(son), (f"{gun} iş günü" if is_gunu else f"{gun} gün"), ref, "tur"


def _sure_sec(turu: str, metin: str, baslangic: date) -> tuple[date, str, str, str] | None:
    """(son, süre metni, dayanak, kaynak). Metinde yazılı süre tür tablosu olmayan evrakı
    süreli yapar; ikisi birden varsa ERKEN olan alınır (yasal süreyi metin uzatamaz)."""
    tur = _tur_suresi(turu, baslangic)
    ms = metinden_sure(metin, baslangic) if metin else None
    if ms is None:
        return tur
    son, sure_str = _metin_son(ms, baslangic)
    if tur is not None and tur[0] <= son:
        return tur
    return son, sure_str, f"Evrak metni: “{ms['alinti']}”", "metin"


def _ivedilik(metin: str, sure_kaynagi: str | None) -> dict[str, str]:
    """Gelen belgenin ibaresi; yoksa metinde cevap süresi/tarihi varsa GÜNLÜDÜR (m.26 lafzı)."""
    ibare = ivedilik_ibaresi(metin) or ("GÜNLÜDÜR" if sure_kaynagi == "metin" else "")
    return {"ivedilik": ibare, "ivedilik_dayanak": M26 if ibare else ""}


def compute_sla(turu: str, tarih_str: str, bugun: date, *, metin: str = "") -> dict[str, Any]:
    """Evrak türü + tarihten yasal son tarih + durum bandı (SAF — bugün enjekte edilir).

    `metin` verilirse içinde yazılı cevap süresi/tarihi tür tablosunun önüne geçer
    (agents.sla_metin). Süre hiçbir yerden çıkmazsa 'tanimsiz' (uydurma süre yok, etiket
    [DOĞRULA]). Tarih okunamazsa → 'tarih_yok'.
    """
    baslangic = _parse_tarih(tarih_str)
    if baslangic is None:
        sure = EVRAK_TO_SURE.get(turu)
        if sure is None:
            return {**_bos("tanimsiz"), **_ivedilik(metin, None), "sure_kaynagi": None}
        sure_str = f"{sure[0]} iş günü" if sure[1] else f"{sure[0]} gün"
        return {**_bos("tarih_yok", sure_str, sure[2]), **_ivedilik(metin, None),
                "sure_kaynagi": "tur"}
    secim = _sure_sec(turu, metin, baslangic)
    if secim is None:
        return {**_bos("tanimsiz"), **_ivedilik(metin, None), "sure_kaynagi": None}
    son, sure_str, ref, kaynak = secim
    durum, kalan = _bant(son, bugun)
    return {
        "durum": durum,
        "etiket": _DURUM_ETIKET[durum],
        "son_tarih": son.strftime("%d.%m.%Y"),
        "kalan_gun": kalan,
        "baslangic": baslangic.strftime("%d.%m.%Y"),
        "sure": sure_str,
        "mevzuat": ref,
        "sure_kaynagi": kaynak,
        **_ivedilik(metin, kaynak),
    }


def sla_tazele(meta: dict[str, Any] | None, bugun: date) -> dict[str, Any]:
    """Kayıtlı sla_metadata'yı BUGÜNE göre tazele (saf). `kalan_gun` işleme anında dondurulur;
    ertesi gün okunduğunda bir gün eskir → Panel (canlı /sla) "65 gün", asistan (DB) "64 gün"
    diyordu (tur4 bulgusu). Son tarih değişmez; yalnız kalan gün + bant yeniden hesaplanır.
    Son tarihi olmayan kayıt (tanımsız/tarih_yok) olduğu gibi döner."""
    m = dict(meta or {})
    son = _parse_tarih(str(m.get("son_tarih") or ""))
    if son is None:
        return m
    durum, kalan = _bant(son, bugun)
    return {**m, "kalan_gun": kalan, "durum": durum, "etiket": _DURUM_ETIKET[durum]}


async def sla_triyaj_node(state: dict[str, Any]) -> dict[str, Any]:
    """Yasal cevap süresi triyajı (additive, deterministik) — GECİKMİŞ/KRİTİK rozeti."""
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    metin = str(state.get("evrak_text") or "")
    # Başlangıç = belgenin KENDİ etiketli tarihi (İlgi satırıyla aynı alan). Gövdedeki olay/
    # rapor/yürüyüş tarihi başlangıç olamaz → yoksa 'tarih_yok' + [DOĞRULA] (agents.sla_metin).
    tarih_str, kaynak = baslangic_sec(unsurlar, metin)
    meta = {**compute_sla(turu, tarih_str, date.today(), metin=metin),
            "baslangic_kaynagi": kaynak or None}
    log.info("sla_triyaj", turu=turu, durum=meta["durum"], kalan=meta.get("kalan_gun"),
             sure_kaynagi=meta.get("sure_kaynagi"), baslangic_kaynagi=kaynak or None)
    return {"sla_metadata": meta}


__all__ = ("compute_sla", "sla_tazele", "sla_triyaj_node")
