"""Yönetmelik-2646 lint — resmî yazı taslağının MADDE-REFERANSLI format denetimi.

verify.py'nin kaba 4-bölüm kontrolünün (YAZI_ZORUNLU_BOLUMLER) üstüne kural-kimlikli,
madde-atıflı denetim katmanı: her kural {kural, madde, durum, mesaj [, dayanak, oneri]}
üretir → UI'da "neden uyumlu/uyumsuz" şeffaflığı + risk bandına ölçülü sinyal.
`dayanak` = yönetmeliğin İLGİLİ MADDE LAFZI (korpustan — uydurma imkânsız);
`oneri` = ihlalde somut düzeltme adımı (ESLint "why + how to fix" deseni).

Madde referansları data/mevzuat/2646_resmi_yazisma_yonetmeligi.txt (m.10-26) ile
sınırlıdır — korpusta olmayan madde ANILMAZ (CLAUDE.md §1: referans uydurma yasak).
Kural lafızları mevzuat.gov.tr 21.5.2646 PDF'i doğrudan okunarak doğrulanmıştır
(2026-07 araştırması): E/Z/O öneki m.11 f.1 · her noktalama yasak m.13 f.1 · kurum
muhataba "Sayın" yazılmaz m.14 f.2-3 · ilgide tarih+sayı m.15 f.6 · "arz/rica ederim"
GEÇERLİ dağıtımlı kapanış m.16 f.12-b · ad-SOYAD m.17 f.2 · Ek m.18 · Dağıtım m.19 ·
ACELE/GÜNLÜDÜR m.26.

Durum semantiği (risk bandı güvenliği):
    gecti  → kural sağlandı.
    uyari  → KESİN format ihlali (belge-içi çelişki dahil) → risk_guard SARI sinyali.
    bilgi  → banda ETKİSİZ not: EBYS kayıt anında dolacak alan, zayıf-heuristik tespit
             ya da çıkarımsal eksik — yanlış-pozitif SARI üretmez.

DETERMİNİSTİK (regex/dizgi) — LLM yok; mock/CI'da birebir aynı çıktı.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from core.text import SAYI_UC_BILESEN_RE, tr_lower

# --- Yönetmelik lafzı (dayanak) — korpustan, tek kaynak -----------------------
_KORPUS_YOLU = (Path(__file__).resolve().parents[2]
                / "data" / "mevzuat" / "2646_resmi_yazisma_yonetmeligi.txt")
_MADDE_BASLIK_RE = re.compile(r"^Madde (\d+) — (.+)$")
_DAYANAK_MAX = 300  # UI açılır satırında okunur uzunluk; kelime sınırında kırpılır


@lru_cache(maxsize=1)
def _madde_metinleri() -> dict[str, str]:
    """Korpus → {"m.NN": "Başlık — lafız"} haritası; okunamazsa boş (lint yine çalışır).

    NOT: süreç ömrü boyunca cache'lenir — korpus .txt'si düzenlenirse dayanak metni
    ancak süreç yeniden başlayınca tazelenir (uvicorn --reload .txt izlemez).
    """
    try:
        ham = _KORPUS_YOLU.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        # Bozuk/eksik korpus dayanak özelliğini söndürür, lint'i ASLA düşürmez —
        # bu fonksiyon her kuraldan çağrılır ve verify pipeline'ının içindedir.
        return {}
    out: dict[str, str] = {}
    no, parcalar = None, []
    for satir in ham.splitlines():
        m = _MADDE_BASLIK_RE.match(satir)
        if m:
            if no is not None:
                out[no] = " ".join(parcalar).strip()
            no, parcalar = f"m.{m.group(1)}", [f"{m.group(2)} —"]
        elif no is not None and satir.strip():
            parcalar.append(satir.strip())
    if no is not None:
        out[no] = " ".join(parcalar).strip()
    return out


def _dayanak_metni(madde: str) -> str:
    """Kuralın yönetmelik lafzı (kırpılmış); korpusta yoksa boş — dayanak UYDURULMAZ."""
    metin = _madde_metinleri().get(madde, "")
    if len(metin) <= _DAYANAK_MAX:
        return metin
    return metin[:_DAYANAK_MAX].rsplit(" ", 1)[0] + "…"

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
    ("büyükşehir belediye başkan", 5), ("büyükşehir belediye", 5),
    ("genel müdür yardımcı", 6), ("daire başkan", 6), ("belediye başkan", 6),
    ("dairesi", 6), ("kaymakaml", 6), ("dekanl", 6),
    ("müşavirli", 6), ("teftiş", 6), ("iç denetim", 6), ("strateji", 6),
    ("halkla ilişkiler", 6), ("cimer", 6),
    ("bölge müdürlüğü", 6), ("başhekiml", 6), ("genel sekreterl", 6),
    ("enstitü", 6), ("fakülte", 6), ("müftülü", 6),
    ("genel müdürlü", 5), ("genel müdür", 5), ("valili", 5), ("rektörlü", 5),
    ("başkanlığ", 5), ("başkanı", 5),
    ("şube müdürlüğü", 7), ("yazı işleri", 7),
    ("müdürlüğ", 7), ("müdürlük", 7),
    ("şefli", 8),
    # En genel kalıplar EN SONDA: yalnız daha özgül hiçbir kalıp eşleşmezse düşer.
    ("belediye", 6), ("daire", 6),
)

# Gerçek adlarda kademe sözcüğüyle tür sözcüğü ARAYA konu alır ("İl Milli Eğitim
# Müdürlüğü") — birebir "il müdürlüğü" kalıbı hiç eşleşmez (denetçi bulgusu). Regex
# adayları tablodan DAHA ÖZGÜL sayılır (çakışmada kazanır). Müftülük de aynı desende.
_MAKAM_REGEX: tuple[tuple[re.Pattern[str], int], ...] = (
    (re.compile(r"\bilçe\b[^,;.\n]{0,40}?m(?:üdürlüğ|üftülüğ)"), 7),
    (re.compile(r"\bil\b[^,;.\n]{0,40}?m(?:üdürlüğ|üftülüğ)"), 6),
)

# Katman C (şeffaflık) ipuçları: muhatap KURUM görünümlüyse ama kademesi çözülemediyse
# "elle doğrula" bilgi notu üretilir; kişi adında (vatandaş) sessiz kalınır.
_KURUM_IPUCLARI = (
    *(i for i in _MAKAM_IPUCLARI if i != "sayın "),
    "kurul", "belediye", "üniversite", "enstitü", "ajans", "komutanlığ",
    "başsavcılığ", "mahkeme", "müftülü",
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


def _beklenen_kalip(g: int, m: int) -> tuple[str, str]:
    """Kademe çiftinden beklenen kapanış → (kalıp, gerekçe). m.16: eş/üst arz, alt rica."""
    if m <= g:
        yon = "üst" if m < g else "eş"
        return "arz ederim", f"muhatap {yon} makam → arz (m.16)"
    return "rica ederim", "muhatap alt makam → rica (m.16)"


def kapanis_onerisi(gonderen_makam: str, muhatap_makam: str) -> tuple[str, str] | None:
    """Hiyerarşiye göre doğru kapanış kalıbı → (kalıp, gerekçe); makam çözülemezse None.

    Kural (m.16): eş ve üst makama "arz ederim", alt makama "rica ederim".
    """
    g = _makam_seviyesi(gonderen_makam)
    m = _makam_seviyesi(muhatap_makam)
    if g is None or m is None:
        return None
    return _beklenen_kalip(g, m)


def _kural(kural: str, madde: str, durum: str, mesaj: str,
           oneri: str = "") -> dict[str, str]:
    k = {"kural": kural, "madde": madde, "durum": durum, "mesaj": mesaj}
    # dayanak yalnız gerçek madde referansında ("üslup" gibi etiketlerde uydurulmaz).
    dayanak = _dayanak_metni(madde) if madde.startswith("m.") else ""
    if dayanak:
        k["dayanak"] = dayanak
    if oneri:
        k["oneri"] = oneri
    return k


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
    return _kural("L-M10-baslik", "m.10", "uyari", "T.C. başlığı bulunamadı (m.10 — antet).",
                  oneri="Belgenin en üstüne ortalanmış 'T.C.' satırı ve altına idare adını "
                        "büyük harflerle ekleyin.")


def _k_sayi(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    satir = _etiket_satiri(taslak, "sayı") or _etiket_satiri(taslak, "sayi")
    if satir is None:
        return _kural("L-M11-sayi", "m.11", "uyari", "Sayı satırı bulunamadı (m.11).",
                      oneri="Başlığın altına, sayfanın solundan 'Sayı:' satırı ekleyin "
                            "(önek-DETSİS-SDP-kayıt, '-' ayraçlı).")
    if SAYI_UC_BILESEN_RE.search(satir):
        # m.11 f.1: hazırlama süreci öneki E (elektronik) / Z (zorunlu hâl) / O (olağanüstü).
        if re.search(r"\b[EZO]-\d", satir):
            return _kural("L-M11-sayi", "m.11", "gecti",
                          "Sayı m.11 desenine uygun (önek-DETSİS-SDP-kayıt).")
        return _kural("L-M11-sayi", "m.11", "bilgi",
                      "Sayı bileşenleri tam ancak hazırlama-süreci öneki yok — elektronik "
                      "belgede başına 'E-' eklenir (m.11).",
                      oneri="Belge EBYS'de üretilecekse sayının başına 'E-' ibaresini ekleyin.")
    # Taslak yer tutucu Sayı: köşeli placeholder ('E-[DETSİS No]-903-[Kayıt No]', SDP
    # konu-kodlu — arşivin tek SDP motoru), jinja ya da 'ebys/taslak' → EBYS kayıtta dolar (uyari değil).
    # Köşeli parantez '[...]' TAM placeholder aranır (tek başına stray '[' desen ihlalini
    # sessizce bilgi'ye düşürmesin — review LOW bulgusu).
    yer_tutucu = ("{{" in satir or re.search(r"\[[^\]]+\]", satir)
                  or "ebys" in tr_lower(satir) or "taslak" in tr_lower(satir))
    if yer_tutucu:
        # SDP yapısı (E-…-<konu kodu>-…) varsa m.11-yapılı olduğunu POZİTİF vurgula.
        if re.search(r"e-.+-\d{2,3}(?:\.\d+)?-", tr_lower(satir)):
            return _kural("L-M11-sayi", "m.11", "bilgi",
                          "Sayı m.11 yapısında (E-DETSİS-dosya kodu-kayıt); DETSİS ve kayıt "
                          "numarası EBYS kayıt anında atanır — taslakta yer tutucu (m.11).")
        return _kural("L-M11-sayi", "m.11", "bilgi",
                      "Sayı EBYS kayıt anında atanır — taslakta yer tutucu (m.11).")
    return _kural("L-M11-sayi", "m.11", "uyari",
                  "Sayı satırı m.11 desenine (DETSİS-SDP-kayıt, '-' ayraçlı) uymuyor.",
                  oneri="Sayıyı 'E-12345678-622.03-1234' örneğindeki biçimde düzenleyin.")


def _k_tarih(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    if _RE_TARIH.search(taslak):
        return _kural("L-M12-tarih", "m.12", "gecti", "gg.aa.yyyy biçimli tarih mevcut (m.12).")
    return _kural("L-M12-tarih", "m.12", "uyari", "gg.aa.yyyy biçimli tarih bulunamadı (m.12).",
                  oneri="Sayı satırının sağ kenarına gg.aa.yyyy biçiminde tarih ekleyin.")


# m.13 f.1: "sonuna HERHANGİ BİR noktalama işareti konulmaksızın" → Unicode P* kategorisi
# (nokta/virgül gibi sabit liste değil — parantez, tire, tırnak da noktalamadır).
def _noktalama_mi(ch: str) -> bool:
    return unicodedata.category(ch).startswith("P")


def _k_konu(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    satir = _etiket_satiri(taslak, "konu")
    if satir is None:
        return _kural("L-M13-konu", "m.13", "uyari", "Konu satırı bulunamadı (m.13).",
                      oneri="Sayının bir satır altına 'Konu:' satırı ekleyin.")
    metin = satir.split(":", 1)[1].strip() if ":" in satir else ""
    if metin and _noktalama_mi(metin[-1]):
        return _kural("L-M13-konu", "m.13", "uyari",
                      "Konunun sonuna noktalama işareti konulmaz (m.13).",
                      oneri="Konu satırının sonundaki noktalama işaretini kaldırın.")
    if len(metin) > _KONU_MAX:
        return _kural("L-M13-konu", "m.13", "bilgi",
                      f"Konu özetleyici olmalı (m.13) — {len(metin)} karakter.",
                      oneri="Konuyu yazı alanının dikey orta hizasını geçmeyecek biçimde kısaltın.")
    return _kural("L-M13-konu", "m.13", "gecti", "Konu satırı m.13'e uygun.")


def _muhatap_bolgesi(taslak: str) -> list[str]:
    """Muhatabın YAPISAL konumu (m.14: konudan sonra 2-4 satır) — gövde alıntıları
    ('Başvurunuzda: Sayın X Valiliği ...') bu pencerenin DIŞINDA kalır; tüm belgeyi
    taramak yanlış-pozitif SARI üretiyordu (adversarial review bulgusu)."""
    satirlar = taslak.splitlines()
    for i, s in enumerate(satirlar):
        if re.match(r"^\s*konu\s*:", tr_lower(s)):
            return satirlar[i + 1 : i + 7]
    return satirlar[:10]  # Konu yoksa belge başı (antet + kimlik bölgesi)


def _k_muhatap(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu == "olur":
        return None  # olur'da muhatap yerine onay makamı bulunur (m.20 bloğu denetler)
    if "{{ muhatap" in low:
        return _kural("L-M14-muhatap", "m.14", "bilgi",
                      "Muhatap yer tutucu — gönderim öncesi doldurulmalı (m.14).")
    # m.14 f.2-3: "Sayın" YALNIZ gerçek kişiye; idare/makam adına yazılmaz (kesin ihlal).
    # Yalnız muhatap bölgesinde aranır — gövde alıntısı bandı etkileyemez.
    sayin_satir = next((s for s in _muhatap_bolgesi(taslak)
                        if tr_lower(s).strip().startswith("sayın ")), None)
    if sayin_satir is not None and kurum_gorunumlu(sayin_satir):
        return _kural("L-M14-muhatap", "m.14", "uyari",
                      "Muhatap idare/makam adına 'Sayın' yazılmaz — 'Sayın' yalnız gerçek "
                      "kişi muhatapta kullanılır (m.14).",
                      oneri="'Sayın' ibaresini kaldırın; idare adını büyük harflerle ve yönelme "
                            "ekiyle yazın (ör. '… VALİLİĞİNE').")
    if any(ipucu in low for ipucu in _MAKAM_IPUCLARI):
        return _kural("L-M14-muhatap", "m.14", "gecti", "Muhatap satırı mevcut (m.14).")
    return _kural("L-M14-muhatap", "m.14", "bilgi",
                  "Muhatap ipucu bulunamadı (heuristik) — kontrol edin (m.14).",
                  oneri="Konudan sonra sayfa ortalanmış muhatap satırı ekleyin.")


def _k_ilgi(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu != "cevabi_yazi":
        return None
    satir = _etiket_satiri(taslak, "ilgi")
    if satir is None:
        return _kural("L-M15-ilgi", "m.15", "uyari",
                      "Cevabi yazıda İlgi zorunlu — cevaplanan yazı ilgi (a) olarak "
                      "gösterilir (m.15).",
                      oneri="Muhataptan sonra 'İlgi:' satırı ekleyip cevaplanan belgenin tarihi "
                            "ve sayısını belirtin.")
    # m.15 f.6: ilgide belgenin tarihi ve sayısı belirtilir. Vatandaş dilekçesinin kayıt
    # sayısı olmayabilir → yalnız İKİSİ de yoksa kesin ihlal; sayı eksikse bilgi notu.
    satir_low = tr_lower(satir)
    tarih_var = bool(_RE_TARIH.search(satir))
    sayi_var = bool(SAYI_UC_BILESEN_RE.search(satir)) or "sayılı" in satir_low
    if not tarih_var and not sayi_var:
        return _kural("L-M15-ilgi", "m.15", "uyari",
                      "İlgide cevaplanan belgenin tarihi ve sayısı belirtilmeli (m.15).",
                      oneri="İlgi satırına belgenin tarihini (gg.aa.yyyy) ve sayısını ekleyin.")
    if not sayi_var:
        return _kural("L-M15-ilgi", "m.15", "bilgi",
                      "İlgide tarih var, belge sayısı görünmüyor — kayıt sayısı biliniyorsa "
                      "eklenir (m.15).",
                      oneri="Cevaplanan belgenin kayıt sayısı biliniyorsa ilgiye ekleyin.")
    return _kural("L-M15-ilgi", "m.15", "gecti", "İlgi atfı tarih ve sayıyla mevcut (m.15).")


# m.16/12 tüm meşru kapanış aileleri: arz/rica (a) + dağıtımlı arz ve rica (b) + gerçek-kişi
# "Bilgilerinize sunulur./Saygılarımla./İyi dileklerimle." (e) + görüş "arz olunur/bilgilerine
# arz". "sunulur" tek başına ("bilgilerinize sunulur") gerçek-kişi kapanışıdır (m.16/12-e).
_KAPANIS_KALIP = (
    "arz ederim", "rica ederim", "arz olunur", "rica olunur",
    "arz ve rica ederim", "bilgilerinize sunulur", "bilgilerine arz",
    "saygılarımla", "iyi dileklerimle",
)


def _k_kapanis(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    if any(k in low for k in _KAPANIS_KALIP):
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      "Hiyerarşiye uygun kapanış kalıbı mevcut (m.16).")
    return _kural("L-M16-kapanis", "m.16", "uyari",
                  "Kapanış kalıbı yok — alt makama 'Rica ederim', üst/eş makama 'Arz ederim' (m.16).",
                  oneri="Metnin son paragrafını hiyerarşiye uygun 'Arz ederim.' / 'Rica ederim.' "
                        "kalıbıyla bitirin.")


# m.17 f.2: ad ilk harfi büyük diğerleri küçük, SOYAD büyük harflerle ("Ayşe YILMAZ");
# f.10: vekâleten imzada sona "V." eklenebilir ("Ayşe YILMAZ V.").
_AD_SOYAD_RE = re.compile(
    r"^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)*\s+[A-ZÇĞİÖŞÜ]{2,}(?:\s+V\.)?$")


def _k_imza(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    # Kapanış = m.16'nın TÜM meşru aileleri (_KAPANIS_KALIP) — eskiden yalnız "ederim"
    # aranıyordu; "Bilgilerinize sunulur." / "arz olunur" kapanışlı taslakta imza bloğu
    # varken "kapanış bulunamadı" deniyordu (tur4 yanlış-pozitifi). Bant etkisi yok (bilgi).
    poz = max([low.rfind("ederim"), *(low.rfind(k) for k in _KAPANIS_KALIP)])
    if poz < 0:
        return _kural("L-M17-imza", "m.17", "bilgi",
                      "Kapanış bulunamadığı için imza bloğu değerlendirilemedi (m.17).")
    kuyruk = [s.strip() for s in taslak[poz:].splitlines()[1:] if s.strip()]
    if not kuyruk:
        return _kural("L-M17-imza", "m.17", "uyari",
                      "Kapanıştan sonra imza bloğu (ad-soyad/unvan) bulunamadı (m.17).",
                      oneri="Kapanıştan sonra sağa hizalı ad Soyad-BÜYÜK ve altına unvan ekleyin.")
    if _AD_SOYAD_RE.match(kuyruk[0]):
        return _kural("L-M17-imza", "m.17", "gecti",
                      "İmza bloğu mevcut — ad Soyad-BÜYÜK biçimi uygun (m.17).")
    # Biçim heuristik: yer tutucu/unvan-önce dizilimler meşru olabilir → asla uyari.
    return _kural("L-M17-imza", "m.17", "bilgi",
                  "İmza bloğu var — ad ilk harfi büyük, soyadı BÜYÜK yazılır (m.17); "
                  "biçimi kontrol edin.",
                  oneri="İmza satırını 'Ayşe YILMAZ' örneğindeki ad Soyad-BÜYÜK biçimine getirin.")


def _k_ek(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    """m.18 — koşullu: belge ek'ten söz etmiyorsa ve blok yoksa kural hiç üretilmez.

    'ekte/ekli/ekinde' geçişi bu belgenin KENDİ eki olmayabilir (vatandaşın dilekçe eki
    alıntısı, başka belgenin eki) → kesin çelişki İDDİA EDİLMEZ; bilgi notu (bant
    güvenliği — adversarial review bulgusu). 'ek-N' deseni hiç aranmaz: mevzuat ekidir
    ("Kanunun ek-3 maddesi"), belge eki değil.
    """
    blok = _etiket_satiri(taslak, "ek")
    referans = re.search(r"\bekte\b|\bekli\b|\bekinde\b", low)
    if blok is not None:
        return _kural("L-M18-ek", "m.18", "gecti", "Ek bloğu mevcut (m.18).")
    if referans:
        return _kural("L-M18-ek", "m.18", "bilgi",
                      "Gövde ek'ten söz ediyor ancak 'Ek:' bloğu görünmüyor — bu belgeye ek "
                      "konacaksa 'Ek:' başlığı gerekir (m.18).",
                      oneri="Belgeye ek eklenecekse imza bölümünün altına 'Ek:' başlığıyla ek "
                            "listesini (adı + sayfa sayısı) ekleyin.")
    return None


def _k_dagitim(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    """m.19 — koşullu: dağıtımlı kapanış çok-muhatap ÇIKARIMIDIR → eksikte yalnız bilgi."""
    blok = _etiket_satiri(taslak, "dağıtım") or _etiket_satiri(taslak, "dagitim")
    dagitimli = "arz ve rica ederim" in low or "arz/rica ederim" in low
    if blok is not None:
        return _kural("L-M19-dagitim", "m.19", "gecti", "Dağıtım bölümü mevcut (m.19).")
    if dagitimli:
        return _kural("L-M19-dagitim", "m.19", "bilgi",
                      "Kapanış dağıtımlı ('arz ve rica') ancak 'Dağıtım:' bölümü görünmüyor — "
                      "birden fazla muhatap varsa eklenir (m.19).",
                      oneri="İmzanın (Ek varsa Ek'in) altına 'Dağıtım:' bölümü ekleyip 'Gereği:' "
                            "ve 'Bilgi:' başlıklarıyla muhatapları listeleyin.")
    return None


# m.26: süreli yazışma ibareleri — yalnız ibare belgede geçiyorsa yerleşim hatırlatması.
_SURELI_RE = re.compile(r"\b(ACELE|GÜNLÜDÜR|KİŞİYE ÖZEL)\b")


def _k_sureli(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    m = _SURELI_RE.search(taslak)
    if m is None:
        return None
    return _kural("L-M26-sureli", "m.26", "bilgi",
                  f"'{m.group(1)}' ibaresi tespit edildi — yazı alanının sağ üst köşesinde "
                  "kırmızı renkli yer alır; GÜNLÜDÜR'de cevap süresi metinde belirtilir (m.26).",
                  oneri="İbarenin sağ üst köşede kırmızı yazıldığını ve (GÜNLÜDÜR ise) cevap "
                        "süresinin metinde belirtildiğini kontrol edin.")


def _k_olur(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    if yazi_turu != "olur":
        return None
    if "OLUR" in taslak:
        return _kural("L-M20-olur", "m.20", "gecti", "OLUR bloğu mevcut (m.20).")
    return _kural("L-M20-olur", "m.20", "uyari",
                  "Olur yazısında büyük harflerle OLUR bloğu bulunamadı (m.20).",
                  oneri="Metnin bitiminden sonra yazı alanının ortasına büyük harflerle 'OLUR' "
                        "yazıp altına tarih ve onay makamı imza bloğunu ekleyin.")


# m.22 — koordinasyon/iş birliği ipuçları (gövdede geçerse 'Koordinasyon:' bloğu beklenir).
_KOORD_RE = re.compile(r"\bkoordinasyon\b|\biş ?birliği\b|\bgörüş alınarak\b|\bmüştereken\b")
# m.25 — geçerli gizlilik dereceleri (UZUN-ÖNCE: 'HİZMETE ÖZEL' 'ÖZEL'den, 'ÇOK GİZLİ'
# 'GİZLİ'den önce denensin). Büyük harf konvansiyonu yanlış-eşleşmeyi azaltır. 'ÖZEL' negatif
# ileri-bakışı: 'ÖZEL İDARE(Sİ)' (İl Özel İdaresi — yaygın kurum adı) gizlilik derecesi
# sanılmaz (review bulgusu; yalnız 'gecti' mesajını yanlış kurar, banda etkisiz ama yanıltıcı).
_GIZLILIK_RE = re.compile(r"\b(ÇOK GİZLİ|HİZMETE ÖZEL|GİZLİ|ÖZEL(?!\s*İDARE))\b")
# str.title() Türkçe İ'yi bozar (combining nokta) → sabit görüntü eşlemesi (4 kapalı-küme derece).
_GIZLILIK_TR = {"ÇOK GİZLİ": "Çok Gizli", "HİZMETE ÖZEL": "Hizmete Özel",
                "GİZLİ": "Gizli", "ÖZEL": "Özel"}


def _k_paraf(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    """m.21 — Paraf. Elektronik belgede paraf/onay zinciri EBYS'de tutulur → taslakta ayrı
    paraf bölümü BEKLENMEZ; bu e-belge için DOĞRU durumdur (geçti). Fiziksel 'Paraf:' bloğu
    varsa da geçti. Hiçbir koşulda 'uyari' üretmez (bant güvenliği)."""
    if _etiket_satiri(taslak, "paraf") is not None:
        return _kural("L-M21-paraf", "m.21", "gecti", "Paraf bölümü mevcut (m.21).")
    return _kural("L-M21-paraf", "m.21", "gecti",
                  "Elektronik belgede paraf/onay zinciri EBYS'de tutulur — taslakta ayrı "
                  "paraf bölümü gerekmez (m.21).")


def _k_koordinasyon(taslak: str, low: str, yazi_turu: str) -> dict[str, str] | None:
    """m.22 — koşullu: 'Koordinasyon:' bloğu varsa geçti; gövde iş birliğinden söz edip blok
    yoksa bilgi; hiçbiri yoksa kural üretilmez (çoğu yazıda koordinasyon yoktur — m.18/19 deseni)."""
    if _etiket_satiri(taslak, "koordinasyon") is not None:
        return _kural("L-M22-koordinasyon", "m.22", "gecti", "Koordinasyon bölümü mevcut (m.22).")
    if _KOORD_RE.search(low):
        return _kural("L-M22-koordinasyon", "m.22", "bilgi",
                      "Gövde iş birliği/koordinasyondan söz ediyor ancak 'Koordinasyon:' bölümü "
                      "görünmüyor — imza öncesi başka birimle hazırlandıysa eklenir (m.22).",
                      oneri="Belge başka birimle iş birliğiyle hazırlandıysa parafın altına "
                            "'Koordinasyon:' başlığıyla ilgili personelin unvan-ad-soyadını ekleyin.")
    return None


def _k_gizlilik(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    """m.25 — Gizlilik derecesi. Geçerli derece (Çok Gizli/Gizli/Özel/Hizmete Özel) belgede
    işaretliyse geçti; yoksa belge TASNİF DIŞIDIR (gizlilik derecesi taşımaz) → yine geçti.
    Her iki durum da kurala UYGUN (m.25) → 'uyari' üretmez (bant güvenliği)."""
    m = _GIZLILIK_RE.search(taslak)
    if m is not None:
        return _kural("L-M25-gizlilik", "m.25", "gecti",
                      f"Gizlilik derecesi belirtilmiş: {_GIZLILIK_TR[m.group(1)]} (m.25).")
    return _kural("L-M25-gizlilik", "m.25", "gecti",
                  "Belge tasnif dışı — gizlilik derecesi taşımıyor (m.25).")


def _k_yasak_ifade(taslak: str, low: str, yazi_turu: str) -> dict[str, str]:
    # Sözcük-sınırlı arama: "iyi çalışmaların değerlendirilmesi" gibi ekli/bileşik
    # kullanımlar eşleşmez — yalnız kalıbın kendisi uyarı üretir.
    bulunan = [ifade for ifade, rx in _YASAK_RE if rx.search(low)]
    if bulunan:
        return _kural("L-USLUP-yasak", "üslup", "uyari",
                      "Resmî yazışma üslubuna aykırı ifade: " + ", ".join(f"'{b}'" for b in bulunan),
                      oneri="Gündelik kalıbı kaldırın veya resmî karşılığıyla değiştirin.")
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
    # m.16 f.12-b: dağıtımlı yazışma "… arz ve rica ederim." VEYA "… arz/rica ederim."
    # ibaresiyle bitirilir — her iki biçim de yönetmelikçe geçerlidir (mevzuat.gov.tr
    # PDF doğrulaması; eski 'tek kalıba indir' bilgisi yanlıştı).
    if "arz ve rica ederim" in low or "arz/rica ederim" in low:
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      "Dağıtımlı kapanış mevcut — üst/eş ve alt makamlara birlikte (m.16).")
    if beklenen in low:
        return _kural("L-M16-kapanis", "m.16", "gecti",
                      f"Kapanış hiyerarşiyle doğrulandı — {gerekce}.")
    ters = "rica ederim" if beklenen == "arz ederim" else "arz ederim"
    if ters in low:
        return _kural("L-M16-kapanis", "m.16", "uyari",
                      f"Kapanış '{ters}' yanlış — {gerekce}: '{beklenen.capitalize()}' kullanılmalı.")
    return _kural("L-M16-kapanis", "m.16", "uyari",
                  f"Kapanış kalıbı yok — {gerekce}: '{beklenen.capitalize()}' eklenmeli.")


def _kapanis_llm_bilgi(low: str, antet: str, muhatap: str,
                       seviye_llm: int | None) -> dict[str, str] | None:
    """Katman B — tablo çözemedi, LLM kademe tahmini var: YALNIZ 'bilgi' üretir.

    Bant güvenliği asimetrisi: LLM tahmini hiçbir koşulda 'uyari' (SARI) yaratamaz —
    yanlış tahmin en kötü ihtimalle yanlış bir NOT olur, yanlış bir bant olmaz.
    """
    g = _makam_seviyesi(antet)
    if g is None or seviye_llm is None or not 1 <= seviye_llm <= 8:
        return None
    beklenen, gerekce = _beklenen_kalip(g, seviye_llm)
    kuyruk = low[-300:]
    ters = "rica ederim" if beklenen == "arz ederim" else "arz ederim"
    if beklenen in kuyruk and ters not in kuyruk:
        mesaj = f"Kapanış LLM kademe tahminiyle uyumlu — {gerekce} (banda etkisiz)."
    else:
        mesaj = (f"Kapanış beklenenle uyuşmuyor olabilir — {gerekce}: "
                 f"'{beklenen.capitalize()}' önerilir (kademe LLM tahmini; banda etkisiz).")
    return _kural("L-M16-kapanis", "m.16", "bilgi", mesaj)


def kurum_gorunumlu(ad: str) -> bool:
    """Ad bir KURUM/makam gibi mi görünüyor? (vatandaş kişi adlarını dışarıda bırakır)
    Katman C notu ve verify'ın LLM-çağrı guard'ı aynı ölçütü paylaşır."""
    low = tr_lower(ad)
    return any(ipucu in low for ipucu in _KURUM_IPUCLARI)


def _kapanis_belirsiz_notu(low: str, muhatap: str) -> dict[str, str] | None:
    """Katman C — muhatap KURUM görünümlü ama kademesi çözülemedi: sessiz sönme yerine
    'elle doğrula' bilgi notu. Kişi adında (vatandaş) None → eski davranış sürer."""
    if not kurum_gorunumlu(muhatap):
        return None
    varlik = "mevcut" if ("arz ederim" in low[-300:] or "rica ederim" in low[-300:]) else "eksik"
    return _kural("L-M16-kapanis", "m.16", "bilgi",
                  f"Muhatap makamın kademesi çözülemedi — kapanış {varlik}; "
                  "arz/rica seçimini elle doğrulayın (m.16).")


_KURALLAR = (_k_baslik, _k_sayi, _k_tarih, _k_konu, _k_muhatap, _k_ilgi, _k_kapanis,
             _k_imza, _k_ek, _k_dagitim, _k_olur, _k_paraf, _k_koordinasyon,
             _k_gizlilik, _k_sureli, _k_yasak_ifade)

_ANTET_SATIR = 6  # gönderen makam taslağın kendi antetinden (ilk satırlar) çözülür


def lint_2646(taslak: str, yazi_turu: str = "", *, muhatap_makam: str = "",
              muhatap_seviye_llm: int | None = None) -> dict[str, Any]:
    """Taslağı 2646 kurallarından geçir → {kurallar, uyari, ozet} (SAF/deterministik).

    muhatap_makam verilirse kapanış kuralı üç katmanla çalışır (öncelik sırasıyla):
      1) TABLO — deterministik kademe çözümü; ihlalde 'uyari' yetkisi YALNIZ bu katmanda.
      2) LLM tahmini (muhatap_seviye_llm) — yalnız 'bilgi' üretir, asla 'uyari'.
      3) Şeffaflık — kurum görünümlü ama çözümsüz muhatapta 'elle doğrula' bilgi notu.
    Hiçbiri tutmazsa (ör. vatandaş muhatap) varlık kontrolüne düşülür — sessiz ve doğru.
    """
    low = tr_lower(taslak)
    kurallar = [k for f in _KURALLAR if (k := f(taslak, low, yazi_turu)) is not None]
    if muhatap_makam:
        antet = "\n".join(taslak.splitlines()[:_ANTET_SATIR])
        yeni = (_kapanis_hiyerarsi(low, antet, muhatap_makam)
                or _kapanis_llm_bilgi(low, antet, muhatap_makam, muhatap_seviye_llm)
                or _kapanis_belirsiz_notu(low, muhatap_makam))
        if yeni is not None:
            kurallar = [yeni if k["kural"] == "L-M16-kapanis" else k for k in kurallar]
    uyari = [k["mesaj"] for k in kurallar if k["durum"] == "uyari"]
    ozet = {d: sum(1 for k in kurallar if k["durum"] == d) for d in ("gecti", "uyari", "bilgi")}
    return {"kurallar": kurallar, "uyari": uyari, "ozet": ozet}


__all__ = ("kapanis_onerisi", "lint_2646")
