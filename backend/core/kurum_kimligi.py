"""İndirilen sayfa GERÇEKTEN o kuruma mı ait? — canlı keşfin kimlik kapısı (ağ YOK).

NEDEN VAR (ölçülmüş olay, 2026-08-06): merkezî kurumlarda `<slug>.gov.tr` kalıbı sınanırken
sicildeki `ttk` (**Türkiye Taşkömürü Kurumu**) için `ttk.gov.tr` açıldı — ama o adres
**Türk Tarih Kurumu**na aittir. Aynı kısaltma, iki ayrı kurum. Kimlik kapısı olmasaydı
taşkömürü evrakına tarih kurumunun birimleri, üstelik "resmî kaynak" görünümlü bir linkle
önerilecekti. Yanlış kuruma GÜVENLE yönlendirmek, hiç öneri vermemekten kötüdür.

KURAL: kurum adının AYIRT EDİCİ kelimeleri sayfa metninde geçmeli. Geçmiyorsa sayfa
reddedilir ve kurum önerisiz kalır — güvenli yön budur.

TÜRKÇE ÇEKİM: sayfa "Taşkömürü" yerine "Taşkömürünün" yazabilir. Bu yüzden tam kelime
değil KÖK eşleşmesi aranır (uzun kelimelerde ilk 6 harf). Aşırı gevşemesin diye kök en az
4 harf olmalı.

ZAYIF KELİMELER: "genel", "müdürlüğü", "başkanlığı", "Türkiye" gibi kelimeler yüzlerce
kurumun adında ve neredeyse her kamu sayfasında geçer; ayırt edici değildir ve sayılmaz.
Ayırt edici kelime hiç kalmıyorsa (ör. adı yalnız 3 harfli bir kısaltmadan ibaret kurum)
kapı KAPALI sayılır — kanıtlayamadığımız kimliği kabul etmeyiz.
"""
from __future__ import annotations

import re

from core.text import tr_lower

# Kurum adlarında ve kamu sayfalarının her yerinde geçen, ayırt etmeyen kelimeler.
ZAYIF_KELIMELER = frozenset({
    "türkiye", "turkiye", "cumhuriyeti", "genel", "müdürlüğü", "mudurlugu", "müdürlük",
    "başkanlığı", "baskanligi", "başkanlık", "bakanlığı", "bakanligi", "kurumu", "kurum",
    "kurulu", "kurul", "daire", "dairesi", "dairesi̇", "şube", "sube", "birimi", "birim",
    "anonim", "şirketi", "sirketi", "işletmesi", "isletmesi", "idaresi", "idare",
    "müsteşarlığı", "musteslarligi", "milli", "millî", "ulusal", "merkezi", "merkez",
    "belediyesi", "belediye", "başkanlığı̇", "valiliği", "valiligi", "kaymakamlığı",
    "kaymakamligi", "üniversitesi", "universitesi", "hizmetleri", "hizmet",
})

_TOKEN_RE = re.compile(r"[0-9a-zçğıöşü]+")
ASGARI_KOK = 4          # 3 harfli kısaltmalar ("ttk", "spk") ayırt edici sayılmaz
KOK_UZUNLUGU = 6        # çekim eklerini atmak için uzun kelimelerde ilk 6 harf


def ayirt_edici_tokenlar(ad: str) -> frozenset[str]:
    """Kurum adının ayırt edici kelimeleri (zayıflar ve kısa kısaltmalar atılmış)."""
    return frozenset(
        t for t in _TOKEN_RE.findall(tr_lower(ad))
        if len(t) >= ASGARI_KOK and t not in ZAYIF_KELIMELER
    )


def _kok(token: str) -> str:
    return token[:KOK_UZUNLUGU] if len(token) > KOK_UZUNLUGU else token


def eslesen_tokenlar(ad: str, sayfa_metni: str) -> tuple[str, ...]:
    """Kurum adının sayfada KÖK olarak geçen ayırt edici kelimeleri (sıralı)."""
    metin = tr_lower(sayfa_metni)
    return tuple(sorted(t for t in ayirt_edici_tokenlar(ad) if _kok(t) in metin))


def kurum_sayfasi_mi(ad: str, sayfa_metni: str) -> bool:
    """Sayfa bu kuruma ait görünüyor mu?

    Ayırt edici kelimelerin EN AZ YARISI (asgari 1) sayfada geçmeli. Ayırt edici kelime
    yoksa False — kimliği kanıtlanamayan sayfa kabul edilmez.
    """
    istenen = ayirt_edici_tokenlar(ad)
    if not istenen:
        return False
    return len(eslesen_tokenlar(ad, sayfa_metni)) >= max(1, len(istenen) // 2)


__all__ = ("ASGARI_KOK", "KOK_UZUNLUGU", "ZAYIF_KELIMELER", "ayirt_edici_tokenlar",
           "eslesen_tokenlar", "kurum_sayfasi_mi")
