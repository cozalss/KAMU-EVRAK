"""Resmî tatil takvimi — iş günü (SLA) hesabında hafta sonuna EK olarak hariç tutulur.

İŞ GÜNÜ süreli türlerinde (4982 bilgi edinme = 15 iş günü) sayımdan hariç tutulur.
TAKVİM günü süreleri (3071 dilekçe = 30 gün) sayımda tatilleri İÇERİR, ancak her iki
türde de sürenin SON GÜNÜ tatile/hafta sonuna rastlarsa süre izleyen ilk iş gününe
uzar (2429 m.3 / HMK m.93 — `sonraki_calisma_gunu`).

İki kaynak:
  1. `_SABIT_TATILLER` — 2429 sayılı Ulusal Bayram ve Genel Tatiller Hk. Kanun'un
     her yıl AYNI (ay, gün)'e denk gelen resmî tatilleri (data/mevzuat/2429...txt ile
     çapraz — uydurma yok).
  2. `DINI_TATILLER` — Ramazan/Kurban Bayramı KAMERÎ takvimle her yıl KAYAR → sabit
     (ay, gün) değildir; resmî (Diyanet) takvimden yıl-yıl girilir. Aşağıdaki 2026
     değerleri [DOĞRULA: Diyanet resmî takvim] işaretlidir; kesinleşince güncellenir.
     Doğrulanmamış tarih ŞİŞİRME riski taşır (fazla tatil = son tarih ileri kayar =
     memura olduğundan çok süre gösterir) → bilinçli olarak açık işaretli tutulur.

Saf/deterministik: ağ yok, LLM yok — CI'da tekrar-üretilebilir.
"""

from __future__ import annotations

from datetime import date, timedelta

# 2429 s.K. — her yıl sabit (ay, gün) resmî/ulusal tatiller (tam gün).
# 28 Ekim (yarım gün, 13:00 sonrası) kasıtlı DIŞARIDA: gün-bazlı hesapta yarım günü
# tam tatil saymak süreyi haksız uzatır; muhafazakâr kalınır (yalnız tam-gün tatiller).
_SABIT_TATILLER: frozenset[tuple[int, int]] = frozenset({
    (1, 1),    # Yılbaşı
    (4, 23),   # Ulusal Egemenlik ve Çocuk Bayramı
    (5, 1),    # Emek ve Dayanışma Günü
    (5, 19),   # Atatürk'ü Anma, Gençlik ve Spor Bayramı
    (7, 15),   # Demokrasi ve Millî Birlik Günü
    (8, 30),   # Zafer Bayramı
    (10, 29),  # Cumhuriyet Bayramı
})

# Kamerî (kayan) dini bayramlar — resmî takvimden yıl-yıl girilir. [DOĞRULA: Diyanet]
# 2026 tahmini; jüri/üretim öncesi resmî takvimle teyit edilmeli.
DINI_TATILLER: frozenset[date] = frozenset({
    date(2026, 3, 20), date(2026, 3, 21), date(2026, 3, 22),                    # Ramazan Bayramı 2026 [DOĞRULA]
    date(2026, 5, 27), date(2026, 5, 28), date(2026, 5, 29), date(2026, 5, 30),  # Kurban Bayramı 2026 [DOĞRULA]
})


def is_resmi_tatil(d: date) -> bool:
    """d bir resmî tatil mi (2429 sabit VEYA girilmiş dini bayram)."""
    return (d.month, d.day) in _SABIT_TATILLER or d in DINI_TATILLER


def is_calisma_gunu(d: date) -> bool:
    """d bir iş günü mü — hafta içi (Pzt-Cuma) VE resmî tatil değil."""
    return d.weekday() < 5 and not is_resmi_tatil(d)


def sonraki_calisma_gunu(d: date) -> date:
    """d dahil ilk çalışma günü (d zaten iş günüyse d döner)."""
    cur = d
    while not is_calisma_gunu(cur):
        cur += timedelta(days=1)
    return cur


__all__ = ("DINI_TATILLER", "is_calisma_gunu", "is_resmi_tatil", "sonraki_calisma_gunu")
