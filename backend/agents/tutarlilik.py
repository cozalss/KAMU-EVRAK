"""Belge tutarlılık denetçisi — kaynak evrakta veri-düzeyi çapraz kontroller.

2025-2026 belge-sahteciliği pratiğinin hafif, deterministik uyarlaması: piksel analizi
değil VERİ tutarlılığı — (1) TCKN checksum (yanlış yazım / şüpheli numara), (2) gelecek
tarihli evrak, (3) evrak sayısının 2646 m.11 desenine uygunluğu. Uyarılar risk bandına
(SARI) beslenir; hiçbir mesaj HAM PII içermez (numara kısmi maskeli gösterilir).

TCKN checksum algoritması (iki aşamalı mod-10) repo'nun test-edilmiş üreteciyle aynıdır
(scripts/gen_heldout.fake_tckn ↔ tests/test_gen_heldout._checksum_gecerli):
    10. hane = (tek konumlar toplamı × 7 − çift konumlar toplamı) mod 10
    11. hane = ilk 10 hanenin toplamı mod 10 · ilk hane 0 olamaz.
0 ile başlayan 11 haneli diziler TELEFON olabilir → hiç değerlendirilmez (yanlış-pozitif
koruması: TCKN 0 ile başlayamaz).
"""

from __future__ import annotations

import re
from datetime import date, datetime

from core.text import SAYI_UC_BILESEN_RE

# TCKN 0 ile başlayamaz → 0'la başlayan 11 hane (telefon) baştan elenir.
_RE_TCKN_ADAYI = re.compile(r"\b[1-9]\d{10}\b")
_TARIH_BICIMLERI = ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y")


def tckn_checksum_gecerli(tckn: str) -> bool:
    """11 haneli dizi TCKN checksum'ını geçiyor mu (iki aşamalı mod-10)?"""
    if len(tckn) != 11 or not tckn.isdigit() or tckn[0] == "0":
        return False
    d = [int(c) for c in tckn]
    tek = d[0] + d[2] + d[4] + d[6] + d[8]
    cift = d[1] + d[3] + d[5] + d[7]
    return d[9] == (tek * 7 - cift) % 10 and d[10] == sum(d[:10]) % 10


def _tarih_coz(metin: str) -> date | None:
    for bicim in _TARIH_BICIMLERI:
        try:
            return datetime.strptime(metin.strip(), bicim).date()
        except ValueError:
            continue
    return None


def tutarlilik_kontrol(
    evrak_text: str, unsurlar: dict, *, bugun: date | None = None
) -> list[str]:
    """Kaynak evrak veri-tutarlılık uyarıları (PII-güvenli mesajlar; SAF/deterministik)."""
    bugun = bugun or date.today()
    uyarilar: list[str] = []

    for aday in sorted(set(_RE_TCKN_ADAYI.findall(evrak_text or ""))):
        if not tckn_checksum_gecerli(aday):
            # Maske, belge panelindeki PII maskesiyle bit-aynı format (uzunluk korunur):
            # 11 hane → 3 açık + 6 yıldız + 2 açık. Farklı formatlar tutarsızlık okunuyordu.
            maske = f"{aday[:3]}{'*' * (len(aday) - 5)}{aday[-2:]}"
            uyarilar.append(
                f"11 haneli kimlik-benzeri numara ({maske}) TCKN "
                "doğrulamasını (checksum) geçmiyor — yazım hatası ya da şüpheli olabilir."
            )

    tarih = _tarih_coz(str(unsurlar.get("tarih") or ""))
    if tarih and tarih > bugun:
        uyarilar.append(
            f"Evrak tarihi ({tarih.strftime('%d.%m.%Y')}) bugünden ileride — tarih tutarsız."
        )

    sayi = str(unsurlar.get("sayi") or "").strip()
    if sayi and not SAYI_UC_BILESEN_RE.search(sayi):
        uyarilar.append(
            "Evrak sayısı 2646 m.11 desenine (DETSİS-SDP-kayıt) uymuyor — "
            "eski/dış format olabilir, kontrol edin."
        )
    return uyarilar


__all__ = ("tckn_checksum_gecerli", "tutarlilik_kontrol")
