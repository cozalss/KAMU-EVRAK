"""SLA'nın METİNDEN okunan girdileri — başlangıç tarihi, metinde yazılı süre, ivedilik ibaresi.

NEDEN (2026-10-05 gerçek-LLM ölçümü, 59 belge):
  * Başlangıç tarihi `bilgi_unsurlari.tarih`'ten okunuyordu; o alan LLM'in gövdeden seçtiği
    HERHANGİ bir tarih olabiliyor (rapor başlangıcı, olay günü, yürüyüş tarihi) → sahte
    "GECİKMİŞ, 75 gün". Belgenin KENDİ tarihi etiketli okuyucudadır
    (`yazi.gelen_evrak.etiketli_tarih` → `bilgi_unsurlari.gelen_evrak.tarih`); İlgi satırı da
    oradan okur, SLA da artık oradan okur (bir pakette iki farklı evrak tarihi olmaz).
  * Süreli evrakta süre METİNDE yazılıdır ("15 gün içinde … gönderilmesi", "… tarihine
    kadar"); tür tablosu bunu bilmez → müzekkere / üst yazı "tanımsız" kalıyordu. 2646
    Yönetmeliği m.26 (data/mevzuat/2646_resmi_yazisma_yonetmeligi.txt) lafzı: "'GÜNLÜDÜR'
    ibaresi taşıyan belgelere cevap verilmesi gereken süre ya da tarih metin içinde
    belirtilir." → metinde cevap süresi/tarihi olan yazı süreli yazışmadır.

Hepsi DETERMİNİSTİK (LLM yok); bulunamayan değer uydurulmaz → None.
"""

from __future__ import annotations

import calendar
import re
from datetime import date, timedelta
from typing import Any

_TARIH_RE = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b")

# Türkçe sayı sözcükleri (1-99) — "on beş gün", "otuz gün". Birler + onlar birleşimi.
_BIRLER = {"bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, "yedi": 7,
           "sekiz": 8, "dokuz": 9}
_ONLAR = {"on": 10, "yirmi": 20, "otuz": 30, "kırk": 40, "elli": 50, "altmış": 60,
          "yetmiş": 70, "seksen": 80, "doksan": 90}
_SAYI_SOZ = "|".join(sorted([*_BIRLER, *_ONLAR], key=len, reverse=True))
_SAYI = rf"(?P<sayi>\d{{1,3}}|(?:(?:{_SAYI_SOZ})\s*){{1,2}})"

# "15 (on beş) gün içinde", "on beş iş günü içerisinde", "7 gün zarfında".
_SURE_RE = re.compile(
    rf"\b{_SAYI}\s*(?:\([^)\n]{{1,30}}\)\s*)?(?P<is>iş\s+)?gün(?:ü)?\s+"
    r"(?:içinde|içerisinde|zarfında)",
    re.IGNORECASE)
# "… tarihine kadar" / "en geç dd.mm.yyyy".
_SON_TARIH_RE = re.compile(
    r"(?:en\s+geç\s+(?P<a>\d{1,2}[./]\d{1,2}[./]\d{4}))|"
    r"(?P<b>\d{1,2}[./]\d{1,2}[./]\d{4})\s+tarihine\s+kadar", re.IGNORECASE)
_AYLAR = ("ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos",
          "eylül", "ekim", "kasım", "aralık")
_AY_SONU_RE = re.compile(
    rf"\b(?P<ay>{'|'.join(_AYLAR)})\s+ayı(?:nın)?\s+sonuna\s+kadar", re.IGNORECASE)
# Süre yalnız MUHATABA yöneltilmiş bir iş için sayılır: aynı cümlede istem fiili şart.
# (Kapalı fiil kökleri — "kira 3 gün içinde ödenmezse" gibi koşul cümleleri ölçüm dışı.)
_ISTEM_RE = re.compile(
    r"gönderil|bildiril|iletil|cevap|yanıt|iade|sunul|yapılma|tamamlan|teslim|ibraz|"
    r"gereğin|karşılan|verilme",
    re.IGNORECASE)
_KOSUL_RE = re.compile(r"\w+(?:mezse|mazsa|dığı\s+takdirde|diği\s+takdirde)\b", re.IGNORECASE)
# Cümle sınırı: noktalama + BOŞLUK (tarih içindeki "15.10.2026" noktaları bölmez) ya da satır.
# Tek satır sonu cümleyi bölmez (resmî yazıda satır kayar); boş satır paragraf sonudur.
_CUMLE_RE = re.compile(r"(?<=[.!?])\s+|\n\s*\n")
# Gelen belgenin kendi ivedilik ibaresi — m.26 kalıbı: tek başına BÜYÜK HARF satır/sözcük.
_IVEDILIK_RE = re.compile(r"(?<![\wÇĞİÖŞÜçğıöşü])(ACELE|GÜNLÜDÜR)(?![\wÇĞİÖŞÜçğıöşü])")

M26 = "2646 sayılı Resmî Yazışma Yönetmeliği m.26 (süreli yazışma)"


def _tr_kucuk(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def _sayi_coz(s: str) -> int | None:
    s = s.strip()
    if s.isdigit():
        return int(s)
    toplam = 0
    for parca in _tr_kucuk(s).split():
        deger = _ONLAR.get(parca) or _BIRLER.get(parca)
        if deger is None:
            return None
        toplam += deger
    return toplam or None


def _tarih(s: str) -> date | None:
    m = _TARIH_RE.search(s or "")
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def tarih_sayisi(metin: str) -> int:
    """Metindeki AYRIK geçerli tarih sayısı (aynı tarih iki kez yazıldıysa bir sayılır)."""
    return len({d for m in _TARIH_RE.finditer(metin or "") if (d := _tarih(m.group(0)))})


def baslangic_sec(unsurlar: dict[str, Any], metin: str) -> tuple[str, str]:
    """SLA başlangıcı: (tarih_str, kaynak). Kaynak: 'gelen_evrak' | 'cikarim' | ''.

    Öncelik belgenin kendi etiketli tarihidir. Yalnız o yoksa ve metinde başka bir tarih
    adayı YOKSA (çıkarılan tarih tek tarihse) çıkarım kabul edilir; birden çok tarih varken
    hangisinin evrak tarihi olduğu bilinemez → '' (compute_sla 'tarih_yok' + [DOĞRULA]).
    """
    gelen = unsurlar.get("gelen_evrak")
    gelen_tarih = gelen.get("tarih") if isinstance(gelen, dict) else None
    if _tarih(str(gelen_tarih or "")):
        return str(gelen_tarih), "gelen_evrak"
    cikarim = str(unsurlar.get("tarih") or "")
    if _tarih(cikarim) and tarih_sayisi(metin) <= 1:
        return cikarim, "cikarim"
    return "", ""


def _istem_cumlesi(cumle: str) -> bool:
    return bool(_ISTEM_RE.search(cumle)) and not _KOSUL_RE.search(cumle)


def _ay_sonu(ay_adi: str, baslangic: date) -> date:
    ay = _AYLAR.index(_tr_kucuk(ay_adi)) + 1
    yil = baslangic.year + (1 if ay < baslangic.month else 0)
    return date(yil, ay, calendar.monthrange(yil, ay)[1])


def _cumle_suresi(cumle: str, baslangic: date) -> tuple[int, bool] | date | None:
    if (m := _SURE_RE.search(cumle)) and (n := _sayi_coz(m.group("sayi"))):
        return n, bool(m.group("is"))
    if m := _SON_TARIH_RE.search(cumle):
        return _tarih(m.group("a") or m.group("b"))
    if m := _AY_SONU_RE.search(cumle):
        return _ay_sonu(m.group("ay"), baslangic)
    return None


def metinden_sure(metin: str, baslangic: date) -> dict[str, Any] | None:
    """Metinde yazılı cevap süresi/tarihi → {'gun', 'is_gunu', 'son', 'alinti'} | None.

    Yalnız istem fiili taşıyan ve koşul kipinde olmayan cümleler sayılır. Birden çok aday
    varsa EN ERKEN son tarih alınır (tutucu: memur erken uyarılır).
    """
    adaylar: list[tuple[date, dict[str, Any]]] = []
    for cumle in _CUMLE_RE.split(metin or ""):
        if not cumle.strip() or not _istem_cumlesi(cumle):
            continue
        sonuc = _cumle_suresi(cumle, baslangic)
        alinti = " ".join(cumle.split())[:160]
        if isinstance(sonuc, tuple):
            gun, is_gunu = sonuc
            adaylar.append((baslangic + timedelta(days=gun),
                            {"gun": gun, "is_gunu": is_gunu, "son": None, "alinti": alinti}))
        elif isinstance(sonuc, date) and sonuc >= baslangic:
            adaylar.append((sonuc, {"gun": None, "is_gunu": False, "son": sonuc,
                                    "alinti": alinti}))
    return min(adaylar, key=lambda x: x[0])[1] if adaylar else None


def ivedilik_ibaresi(metin: str) -> str:
    """Gelen belgenin taşıdığı ivedilik ibaresi (ACELE/GÜNLÜDÜR); yoksa ''."""
    m = _IVEDILIK_RE.search(metin or "")
    return m.group(1) if m else ""


__all__ = ("M26", "baslangic_sec", "ivedilik_ibaresi", "metinden_sure", "tarih_sayisi")
