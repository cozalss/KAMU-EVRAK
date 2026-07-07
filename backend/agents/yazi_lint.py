"""Yönetmelik-2646 lint — resmî yazı taslağının MADDE-REFERANSLI format denetimi.

verify.py'nin kaba 4-bölüm kontrolünün (YAZI_ZORUNLU_BOLUMLER) üstüne kural-kimlikli,
madde-atıflı denetim katmanı: her kural {kural, madde, durum, mesaj} üretir → UI'da
"neden uyumlu/uyumsuz" şeffaflığı + risk bandına ölçülü sinyal.

Madde referansları data/mevzuat/2646_resmi_yazisma_yonetmeligi.txt (m.10-20, mevzuat.gov.tr
21.5.2646 ile çapraz doğrulanmış korpus) ile sınırlıdır — korpusta olmayan madde ANILMAZ
(CLAUDE.md §1: referans uydurma yasak).

Durum semantiği (risk bandı güvenliği):
    gecti  → kural sağlandı.
    uyari  → kesin format ihlali → risk_guard SARI sinyali alır.
    bilgi  → banda ETKİSİZ not: EBYS kayıt anında dolacak alan (ör. Sayı placeholder)
             ya da zayıf-heuristik tespit (ör. muhatap ipucu) — yanlış-pozitif SARI üretmez.

DETERMİNİSTİK (regex/dizgi) — LLM yok; mock/CI'da birebir aynı çıktı.
"""

from __future__ import annotations

import re
from typing import Any

from core.text import SAYI_UC_BILESEN_RE, tr_lower

_RE_TARIH = re.compile(r"\b\d{2}\.\d{2}\.\d{4}\b")
_MAKAM_IPUCLARI = (
    "makam", "müdürlüğü", "başkanlığı", "bakanlığı", "valiliği",
    "kaymakamlığı", "rektörlüğü", "dairesi", "kurumu", "sayın ",
)
_KONU_MAX = 100

# Makam kademe tablosu — kamuya açık devlet teşkilat yapısından derlendi (düşük sayı =
# yüksek yetki). Tablo sırası = özgüllük sırası (çakışan eşleşmelerde erken kalıp
# kazanır: "daire başkan" 6, generic "başkanlığ" 5'i ezer). Çözülemeyen makam → None →
# hiyerarşi denetimi SUSAR (yanlış-pozitif SARI üretmeme ilkesi).
_MAKAM_SEVIYE: tuple[tuple[str, int], ...] = (
    ("cumhurbaşkan", 1),
    ("büyük millet meclisi", 2), ("tbmm", 2),
    ("bakan yardımcı", 4), ("müsteşar", 4),
    ("bakanlığ", 3), ("bakanlık", 3),
    ("genel müdür yardımcı", 6), ("daire başkan", 6),
    ("dairesi", 6), ("kaymakaml", 6), ("dekanl", 6),
    ("müşavirli", 6), ("teftiş", 6), ("iç denetim", 6), ("strateji", 6),
    ("halkla ilişkiler", 6), ("cimer", 6),
    ("genel müdürlü", 5), ("genel müdür", 5), ("valili", 5), ("rektörlü", 5),
    ("başkanlığ", 5), ("başkanı", 5),
    ("şube müdürlüğü", 7), ("yazı işleri", 7),
    ("müdürlüğ", 7), ("müdürlük", 7),
    ("şefli", 8),
    # En genel kalıp EN SONDA: route_birim slug'ları ("ilgili_teknik_daire") ancak
    # daha özgül hiçbir kalıp eşleşmezse buraya düşer.
    ("daire", 6),
)

# Gerçek adlarda kademe sözcüğüyle tür sözcüğü ARAYA konu alır ("İl Milli Eğitim
# Müdürlüğü") — birebir "il müdürlüğü" kalıbı hiç eşleşmez (denetçi bulgusu). Regex
# adayları tablodan DAHA ÖZGÜL sayılır (çakışmada kazanır).
_MAKAM_REGEX: tuple[tuple[re.Pattern[str], int], ...] = (
    (re.compile(r"\bilçe\b[^,;.\n]{0,40}?müdürlüğ"), 7),
    (re.compile(r"\bil\b[^,;.\n]{0,40}?müdürlüğ"), 6),
)

# Resmî üsluba aykırı gündelik kalıplar — yalnız TARTIŞMASIZ olanlar; sözcük-sınırlı
# aranır ("hayırlı işlere vesile", "görüşmek üzere toplantı" gibi MEŞRU resmî kullanımlar
# listeden bilinçli ÇIKARILDI — denetçi kanıtlı yanlış-pozitif). Yönetmelik korpusunda
# birebir madde karşılığı ANILMAZ (uydurma yasak); kural "üslup" etiketiyle raporlanır.
_YASAK_IFADELER = ("iyi çalışmalar", "kolay gelsin", "selamlar", "sevgiler",
                   "iyi günler dilerim")
_YASAK_RE = tuple((ifade, re.compile(rf"\b{re.escape(ifade)}\b")) for ifade in _YASAK_IFADELER)


def _makam_seviyesi(metin: str) -> int | None:
    """Metindeki makam kademesini çöz; hiçbir kalıp eşleşmezse None.

    Türk kurum adları soldan sağa ana-kurum→alt-birim okunur ("Sağlık Bakanlığı …
    Genel Müdürlüğü") → EN SAĞDAKİ eşleşme en özgül birimdir; ÇAKIŞAN aralıklarda
    tablo sırası (özgül kalıp önce) kazanır ("cumhurbaşkanlığı" içindeki "başkanlığ"
    gibi iç eşleşmeler üst kalıba yenilir). Alt çizgi → boşluk (slug normalizasyonu).
    """
    low = tr_lower(metin).replace("_", " ")
    adaylar: list[tuple[int, int, int, int]] = []   # (başlangıç, bitiş, özgüllük, seviye)
    for sira, (rx, seviye) in enumerate(_MAKAM_REGEX):
        son = None
        for m in rx.finditer(low):
            son = m
        if son is not None:
            adaylar.append((son.start(), son.end(), sira - len(_MAKAM_REGEX), seviye))
    for sira, (kalip, seviye) in enumerate(_MAKAM_SEVIYE):
        poz = low.rfind(kalip)
        if poz >= 0:
            adaylar.append((poz, poz + len(kalip), sira, seviye))
    if not adaylar:
        return None
    en_sag = max(adaylar, key=lambda a: a[1])
    ortusen = [a for a in adaylar if a[0] < en_sag[1] and a[1] > en_sag[0]]
    return min(ortusen, key=lambda a: a[2])[3]


def kapanis_onerisi(gonderen_makam: str, muhatap_makam: str) -> tuple[str, str] | None:
    """Hiyerarşiye göre doğru kapanış kalıbı → (kalıp, gerekçe); makam çözülemezse None.

    Kural (m.16): eş ve üst makama "arz ederim", alt makama "rica ederim".
    """
    g = _makam_seviyesi(gonderen_makam)
    m = _makam_seviyesi(muhatap_makam)
    if g is None or m is None:
        return None
    if m <= g:
        yon = "üst" if m < g else "eş"
        return "arz ederim", f"muhatap {yon} makam → arz (m.16)"
    return "rica ederim", "muhatap alt makam → rica (m.16)"


def _kural(kural: str, madde: str, durum: str, mesaj: str) -> dict[str, str]:
    return {"kural": kural, "madde": madde, "durum": durum, "mesaj": mesaj}


def _satir_bul(taslak: str, onek: str) -> str | None:
    """Verilen önekle (tr_lower) başlayan ilk satırı döndür."""
    for satir in taslak.splitlines():
        if tr_lower(satir).lstrip().startswith(onek):
            return satir
    return None


def _etiket_satiri(taslak: str, etiket: str) -> str | None:
    """'Etiket :' biçimli satırı bul — gövdedeki 'İlgi yazıda...' gibi cümleler ETİKET
    sayılmaz (m.11/13/15 blokları ':' ile açılır)."""
    desen = re.compile(rf"^\s*{etiket}\s*:", re.IGNORECASE)
    for satir in taslak.splitlines():
        if desen.match(tr_lower(satir)):
            return satir
    return None


def _k_baslik(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    if "t.c." in low or "t.c" in low.split("\n")[0]:
        return _kural("L-M10-baslik", "m.10", "gecti", "T.C. başlığı mevcut.")
    return _kural("L-M10-baslik", "m.10", "uyari", "T.C. başlığı bulunamadı (m.10 — antet).")


def _k_sayi(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    satir = _etiket_satiri(taslak, "sayı") or _etiket_satiri(taslak, "sayi")
    if satir is None:
        return _kural("L-M11-sayi", "m.11", "uyari", "Sayı satırı bulunamadı (m.11).")
    if SAYI_UC_BILESEN_RE.search(satir):
        return _kural("L-M11-sayi", "m.11", "gecti",
                      "Sayı üç bileşenli (DETSİS-SDP-kayıt, m.11).")
    if "{{" in satir or "ebys" in tr_lower(satir) or "taslak" in tr_lower(satir):
        return _kural("L-M11-sayi", "m.11", "bilgi",
                      "Sayı EBYS kayıt anında atanır — taslakta yer tutucu (m.11).")
    return _kural("L-M11-sayi", "m.11", "uyari",
                  "Sayı satırı m.11 desenine (DETSİS-SDP-kayıt, '-' ayraçlı) uymuyor.")


def _k_tarih(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    if _RE_TARIH.search(taslak):
        return _kural("L-M12-tarih", "m.12", "gecti", "gg.aa.yyyy biçimli tarih mevcut (m.12).")
    return _kural("L-M12-tarih", "m.12", "uyari", "gg.aa.yyyy biçimli tarih bulunamadı (m.12).")


def _k_konu(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    satir = _etiket_satiri(taslak, "konu")
    if satir is None:
        return _kural("L-M13-konu", "m.13", "uyari", "Konu satırı bulunamadı (m.13).")
    metin = satir.split(":", 1)[1].strip() if ":" in satir else ""
    if metin.endswith("."):
        return _kural("L-M13-konu", "m.13", "uyari",
                      "Konunun sonuna nokta konulmaz (m.13).")
    if len(metin) > _KONU_MAX:
        return _kural("L-M13-konu", "m.13", "bilgi",
                      f"Konu özetleyici olmalı (m.13) — {len(metin)} karakter.")
    return _kural("L-M13-konu", "m.13", "gecti", "Konu satırı m.13'e uygun.")


def _k_muhatap(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu == "olur":
        return None  # olur'da muhatap yerine onay makamı bulunur (m.20 bloğu denetler)
    if "{{ muhatap" in low:
        return _kural("L-M14-muhatap", "m.14", "bilgi",
                      "Muhatap yer tutucu — gönderim öncesi doldurulmalı (m.14).")
    if any(ipucu in low for ipucu in _MAKAM_IPUCLARI):
        return _kural("L-M14-muhatap", "m.14", "gecti", "Muhatap satırı mevcut (m.14).")
    return _kural("L-M14-muhatap", "m.14", "bilgi",
                  "Muhatap ipucu bulunamadı (heuristik) — kontrol edin (m.14).")


def _k_ilgi(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu != "cevabi_yazi":
        return None
    if _etiket_satiri(taslak, "ilgi"):
        return _kural("L-M15-ilgi", "m.15", "gecti", "İlgi atfı mevcut (m.15).")
    return _kural("L-M15-ilgi", "m.15", "uyari",
                  "Cevabi yazıda İlgi zorunlu — cevaplanan yazı ilgi (a) olarak gösterilir (m.15).")


def _k_kapanis(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    if "arz ederim" in low or "rica ederim" in low:
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      "Hiyerarşiye uygun kapanış kalıbı mevcut (m.16).")
    return _kural("L-M16-kapanis", "m.16", "uyari",
                  "Kapanış kalıbı yok — alt makama 'Rica ederim', üst/eş makama 'Arz ederim' (m.16).")


def _k_imza(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    poz = low.rfind("ederim")
    if poz < 0:
        return _kural("L-M17-imza", "m.17", "bilgi",
                      "Kapanış bulunamadığı için imza bloğu değerlendirilemedi (m.17).")
    kuyruk = taslak[poz:].splitlines()[1:]
    if any(satir.strip() for satir in kuyruk):
        return _kural("L-M17-imza", "m.17", "gecti", "İmza bloğu mevcut (m.17).")
    return _kural("L-M17-imza", "m.17", "uyari",
                  "Kapanıştan sonra imza bloğu (ad-soyad/unvan) bulunamadı (m.17).")


def _k_olur(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu != "olur":
        return None
    if "OLUR" in taslak:
        return _kural("L-M20-olur", "m.20", "gecti", "OLUR bloğu mevcut (m.20).")
    return _kural("L-M20-olur", "m.20", "uyari",
                  "Olur yazısında büyük harflerle OLUR bloğu bulunamadı (m.20).")


def _k_yasak_ifade(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    # Sözcük-sınırlı arama: "iyi çalışmaların değerlendirilmesi" gibi ekli/bileşik
    # kullanımlar eşleşmez — yalnız kalıbın kendisi uyarı üretir.
    bulunan = [ifade for ifade, rx in _YASAK_RE if rx.search(low)]
    if bulunan:
        return _kural("L-USLUP-yasak", "üslup", "uyari",
                      "Resmî yazışma üslubuna aykırı ifade: " + ", ".join(f"'{b}'" for b in bulunan))
    return _kural("L-USLUP-yasak", "üslup", "gecti", "Resmî üsluba aykırı gündelik kalıp yok.")


def _kapanis_hiyerarsi(low: str, gonderen: str, muhatap: str) -> dict[str, str] | None:
    """Kapanışı makam hiyerarşisine göre değerlendir; makamlar çözülemezse None (sus).

    'Arz ve rica ederim' dağıtımlı yazı kabulüdür; 'arz/rica' bölü'lü biçim tek kalıba
    indirilmelidir (bilgi). Beklenenin tersi kalıp → kesin m.16 uyarısı.
    """
    oneri = kapanis_onerisi(gonderen, muhatap)
    if oneri is None:
        return None
    beklenen, gerekce = oneri
    # Kapanış belgenin KUYRUĞUNDA aranır — gövdede alıntılanan ilgi yazının kendi
    # "arz ederim"i gerçek kapanışı maskelemesin (denetçi bulgusu; imza bloğu payı).
    low = low[-300:]
    if "arz ve rica ederim" in low:
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      "Dağıtımlı kapanış ('arz ve rica ederim') mevcut (m.16).")
    if "arz/rica" in low:
        return _kural("L-M16-kapanis", "m.16", "bilgi",
                      f"'arz/rica' tek kalıba indirilmeli — {gerekce}: '{beklenen}'.")
    if beklenen in low:
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      f"Kapanış hiyerarşiyle doğrulandı — {gerekce}.")
    ters = "rica ederim" if beklenen == "arz ederim" else "arz ederim"
    if ters in low:
        return _kural("L-M16-kapanis", "m.16", "uyari",
                      f"Kapanış '{ters}' yanlış — {gerekce}: '{beklenen.capitalize()}' kullanılmalı.")
    return _kural("L-M16-kapanis", "m.16", "uyari",
                  f"Kapanış kalıbı yok — {gerekce}: '{beklenen.capitalize()}' eklenmeli.")


_KURALLAR = (_k_baslik, _k_sayi, _k_tarih, _k_konu, _k_muhatap, _k_ilgi, _k_kapanis,
             _k_imza, _k_olur, _k_yasak_ifade)

_ANTET_SATIR = 6  # gönderen makam taslağın kendi antetinden (ilk satırlar) çözülür


def lint_2646(taslak: str, yazi_turu: str = "", *, muhatap_makam: str = "") -> dict[str, Any]:
    """Taslağı 2646 kurallarından geçir → {kurallar, uyari, ozet} (SAF/deterministik).

    muhatap_makam verilirse (ör. route_birim'in hedef_birim'i) kapanış kuralı
    hiyerarşi-farkında çalışır: gönderen makam taslağın antetinden çözülür,
    beklenen kalıp ('arz'/'rica') muhatapla karşılaştırılır. Makamlardan biri
    çözülemezse varlık kontrolüne düşülür — yanlış-pozitif uyarı üretilmez.
    """
    low = tr_lower(taslak)
    kurallar = [k for f in _KURALLAR if (k := f(taslak, low, yazi_turu)) is not None]
    if muhatap_makam:
        antet = "\n".join(taslak.splitlines()[:_ANTET_SATIR])
        hiyerarsik = _kapanis_hiyerarsi(low, antet, muhatap_makam)
        if hiyerarsik is not None:
            kurallar = [hiyerarsik if k["kural"] == "L-M16-kapanis" else k for k in kurallar]
    uyari = [k["mesaj"] for k in kurallar if k["durum"] == "uyari"]
    ozet = {d: sum(1 for k in kurallar if k["durum"] == d) for d in ("gecti", "uyari", "bilgi")}
    return {"kurallar": kurallar, "uyari": uyari, "ozet": ozet}


__all__ = ("kapanis_onerisi", "lint_2646")
