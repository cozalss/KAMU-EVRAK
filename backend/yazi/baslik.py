"""Resmî yazı başlık alanları — TEK çözücü (Yön. 2646 m.10 antet, m.13 konu, m.14 muhatap,
m.15 ilgi).

Neden tek çözücü: başlık alanlarını dört ayrı çağrı noktası (tek talepli yol, çok talepli
yol, devir yolu, /yazi API'si) kendi başına kuruyordu; bir yolda düzeltilen kural öbüründe
kalıyordu (teşhis 2026-10-05: dilekçeye 'Belediye Başkanlığının yazısı' ilgisi, konu satırına
ham dilekçe cümlesi, CİMER başvuru no'sunun '-1234567' diye kesilmesi). Artık her yol buradan
geçer.

Gelen evrak modeli (`gelen_evrak_coz`): Akış T'nin `bilgi_unsurlari['gelen_evrak']` alanı
varsa TABAN odur; yoksa (ya da alan eksikse) eski düz alanlardan + evrakın kendi ETİKETLİ
satırlarından (Sayı:, Tarih:, Başvuru No:, Başvuru Sahibi:, Esas No:) güvenli türetilir.
Etiketli kanıt LLM tahmininden üstündür. Belge cinsi sınıflandırıcının KAPALI KÜME türünden
eşlenir; anahtar kelime listesi yoktur.

İlgi kuralı (m.15/6): ilgi tutulan belge muhatabın kendi belgesiyse 2. şahıs iyelik
('dilekçeniz', 'yazınız'); değilse belgenin SAHİBİ adıyla anılır ('Ayşe Yılmaz'ın … dilekçesi',
'Ankara Valiliğinin … yazısı'). Sahip HER ZAMAN gönderendir; yazıyı alan kurum (muhatap
idare) asla ilgi sahibi olamaz.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from core.text import tr_lower, tr_upper

BELGE_CINSLERI: tuple[str, ...] = (
    "dilekce", "basvuru", "cimer_basvurusu", "bilgi_edinme_basvurusu", "resmi_yazi",
    "muzekkere", "icra_yazisi", "genelge", "diger",
)
GONDEREN_TURLERI: tuple[str, ...] = ("gercek_kisi", "tuzel_kisi", "kamu_idaresi")
ROLLER: tuple[str, ...] = ("cevap", "havale", "devir", "devir_bilgi", "dagitim", "olur")

# Sınıflandırıcının kapalı küme türü → gelen belgenin cinsi (eşleme, kelime listesi değil).
_TUR_CINS: dict[str, str] = {
    "dilekce": "dilekce", "sikayet": "dilekce", "ihbar": "dilekce", "talep": "dilekce",
    "basvuru": "basvuru", "cimer": "cimer_basvurusu", "bilgi_edinme": "bilgi_edinme_basvurusu",
    "muzekkere": "muzekkere", "icra_evraki": "icra_yazisi", "genelge_talimat_olur": "genelge",
    "ust_yazi": "resmi_yazi", "cevabi_yazi": "resmi_yazi", "tebligat": "resmi_yazi",
    "dava_evraki": "resmi_yazi", "gorus_mutalaa": "resmi_yazi", "rapor": "resmi_yazi",
    "tutanak": "resmi_yazi",
}
_VATANDAS_CINSLERI = frozenset(
    {"dilekce", "basvuru", "cimer_basvurusu", "bilgi_edinme_basvurusu"})

# Belge cinsi → (muhatabın kendi belgesi: 2. şahıs, başkasının belgesi: 3. şahıs iyelik).
_CINS_ILGI: dict[str, tuple[str, str]] = {
    "dilekce": ("dilekçeniz", "dilekçesi"),
    "basvuru": ("başvurunuz", "başvurusu"),
    "cimer_basvurusu": ("CİMER başvurunuz", "CİMER başvurusu"),
    "bilgi_edinme_basvurusu": ("bilgi edinme başvurunuz", "bilgi edinme başvurusu"),
    "resmi_yazi": ("yazınız", "yazısı"),
    "muzekkere": ("müzekkereniz", "müzekkeresi"),
    "icra_yazisi": ("yazınız", "yazısı"),
    "genelge": ("yazınız", "yazısı"),
}
# Gövde kalıbında belgeye atıf ('Söz konusu dilekçe …') — teşhis ADIM 6.
CINS_TR: dict[str, str] = {
    "dilekce": "dilekçe", "basvuru": "başvuru", "cimer_basvurusu": "CİMER başvurusu",
    "bilgi_edinme_basvurusu": "bilgi edinme başvurusu", "resmi_yazi": "yazı",
    "muzekkere": "müzekkere", "icra_yazisi": "yazı", "genelge": "yazı", "diger": "evrak",
}

_TARIH = r"\d{1,2}[./]\d{1,2}[./]\d{4}"
_RE_TARIH = re.compile(_TARIH)
_RE_SALT_TARIH = re.compile(rf"^\s*(?:tarih\s*[:.]?\s*)?({_TARIH})\s*$", re.IGNORECASE)
_ETIKET_KALIP = r"^\s*{etiket}\s*:\s*(?P<deger>.+?)\s*$"


def _etiket(metin: str, etiket: str) -> str | None:
    """Satır başındaki 'Etiket : değer' satırının değeri (çok satırlı metin, ilk eşleşme)."""
    m = re.search(_ETIKET_KALIP.format(etiket=etiket), metin or "",
                  re.IGNORECASE | re.MULTILINE)
    return m.group("deger").strip() if m else None


def _tarih_norm(t: str | None) -> str | None:
    if not t:
        return None
    m = _RE_TARIH.search(t)
    if not m:
        return None
    g, a, y = re.split(r"[./]", m.group(0))
    return f"{int(g):02d}.{int(a):02d}.{y}"


def _etiketli_tarih(metin: str) -> str | None:
    """Gelen belgenin KENDİ tarihi: 'Tarih:' / 'Başvuru Tarihi:' etiketi → Sayı satırındaki
    tarih → yalnız tarihten oluşan satır (dilekçe imza tarihi). Gövde içindeki olay tarihleri
    ('18.10.2026 Pazar günü') ve gelen yazının kendi İlgi satırı ASLA seçilmez."""
    for etiket in (r"tarih", r"ba[şs]vuru\s+tarihi"):
        if (t := _tarih_norm(_etiket(metin, etiket))):
            return t
    if (t := _tarih_norm(_etiket(metin, r"say[ıi]"))):
        return t
    for satir in (metin or "").splitlines():
        if (m := _RE_SALT_TARIH.match(satir)):
            return _tarih_norm(m.group(1))
    return None


def _etiketli_sayi(metin: str) -> str | None:
    """Yalnız 'Sayı :' etiketinden (sondaki tarih atılır); yoksa yargı/icra dosya numarası."""
    if (ham := _etiket(metin, r"say[ıi]")):
        sayi = _RE_TARIH.sub("", ham).strip(" ,;")
        if sayi:
            return sayi
    for etiket in (r"esas\s+no", r"dosya\s+no"):
        if (ham := _etiket(metin, etiket)):
            return f"{ham} Esas" if "esas" in etiket and "esas" not in tr_lower(ham) else ham
    return None


def _etiketli_basvuru_no(metin: str) -> str | None:
    ham = _etiket(metin, r"(?:\w+\s+)?ba[şs]vuru\s+(?:no|numaras[ıi])")
    return ham.split()[0].strip(" ,;") if ham else None


def _parantez_at(ad: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*", " ", ad or "").strip(" ,;")


_HITAP_SON = re.compile(r"(?:na|ne|ya|ye)$")
_META = re.compile(r"^\s*(say[ıi]|tarih|konu|ilgi|esas|dosya|ba[şs]vuru)\b", re.IGNORECASE)


def tr_baslik(s: str) -> str:
    """'ANKARA 5. ASLİYE HUKUK MAHKEMESİ' → 'Ankara 5. Asliye Hukuk Mahkemesi' (TR kasası)."""
    kucuk = {"ve", "ile"}
    out = []
    for k in (s or "").split():
        lk = tr_lower(k)
        out.append(lk if lk in kucuk else tr_upper(lk[:1]) + lk[1:])
    return " ".join(out)


def antet_idaresi(metin: str) -> str | None:
    """Gelen RESMÎ yazının gönderen idaresi: 'T.C.' satırını izleyen, hitap eki taşımayan,
    büyük harfli ilk satır (Yön. m.10 antet düzeni). Hitaplı ('…BAŞKANLIĞINA') satır
    muhataptır, gönderen değildir."""
    satirlar = [s.strip() for s in (metin or "").splitlines()[:8] if s.strip()]
    tc = next((i for i, s in enumerate(satirlar[:3])
               if tr_lower(s).replace(" ", "").startswith("t.c")), None)
    if tc is None or tc + 1 >= len(satirlar):
        return None
    aday = satirlar[tc + 1]
    harfler = [c for c in aday if c.isalpha()]
    if (not harfler or _META.match(aday) or _HITAP_SON.search(tr_lower(aday))
            or sum(c.isupper() for c in harfler) < 0.8 * len(harfler)):
        return None
    return tr_baslik(aday)


def _kurum_gorunumlu(ad: str) -> bool:
    from yazi.yazi_render import _kurum_adi_mi
    return bool(ad) and _kurum_adi_mi(ad)


def _cins_coz(evrak_turu: str, metin: str, taban: dict[str, Any]) -> str:
    cins = str(taban.get("belge_cinsi") or "")
    if cins in BELGE_CINSLERI and cins != "diger":
        return cins
    cins = _TUR_CINS.get(evrak_turu or "", "diger")
    # Yapısal düzeltme: 'Sayı:' etiketli antetli belge resmî yazıdır (sınıflandırıcı
    # vatandaş türü dese bile) — CİMER/BİE başvuru etiketi taşımıyorsa.
    if (cins in ("dilekce", "basvuru") and _etiket(metin, r"say[ıi]")
            and antet_idaresi(metin)):
        return "resmi_yazi"
    return cins


def gelen_evrak_coz(
    evrak_text: str, unsurlar: dict[str, Any] | None, evrak_turu: str = "",
    muhatap_idare: str = "",
) -> dict[str, Any]:
    """Gelen evrak modeli (akışlar arası sözleşme şekliyle). Taban: unsurlar['gelen_evrak']
    (Akış T); boş alanlar deterministik etiketli okumadan ve eski düz alanlardan doldurulur.
    Etiketli kanıt (Sayı/Tarih/Başvuru No) LLM değerinin ÜSTÜNDEDİR."""
    u = unsurlar or {}
    taban = dict(u.get("gelen_evrak") or {})
    metin = evrak_text or ""
    cins = _cins_coz(evrak_turu, metin, taban)
    sahip = _etiket(metin, r"ba[şs]vuru\s+sahibi") or _etiket(metin, r"ad[ıi]?\s*soyad[ıi]?")
    gonderen_ad = _parantez_at(sahip or taban.get("gonderen_ad") or u.get("gonderen") or "")
    gonderen_idare = taban.get("gonderen_idare") or antet_idaresi(metin)
    if cins in _VATANDAS_CINSLERI:
        gonderen_idare = taban.get("gonderen_idare")  # CİMER anteti BİZİM kurumumuzdur
        tur = "tuzel_kisi" if _kurum_gorunumlu(gonderen_ad) else "gercek_kisi"
    elif not gonderen_idare:
        # Antet yok: gönderen adı kurum görünümlüyse idare, değilse kişi (iç rapor vb.).
        tur = "kamu_idaresi" if _kurum_gorunumlu(gonderen_ad) else (
            "gercek_kisi" if gonderen_ad else ("kamu_idaresi" if cins != "diger" else ""))
        if tur == "kamu_idaresi" and gonderen_ad:
            gonderen_idare = gonderen_ad
    else:
        tur = "kamu_idaresi"
    tur = taban.get("gonderen_turu") if taban.get("gonderen_turu") in GONDEREN_TURLERI else tur
    return {
        "belge_cinsi": cins,
        "gonderen_turu": tur or None,
        "gonderen_ad": gonderen_ad or None,
        "gonderen_idare": gonderen_idare or None,
        # Eski 'kurum' alanı iki anlamlıdır (gönderen/muhatap); yalnız vatandaş belgesinde
        # muhatap anlamı kesindir (dilekçe kişiden gelir, kurum ona yazılan idaredir).
        "muhatap_idare": taban.get("muhatap_idare") or muhatap_idare or (
            u.get("kurum") if cins in _VATANDAS_CINSLERI else None) or None,
        "tarih": _etiketli_tarih(metin) or _tarih_norm(taban.get("tarih"))
        or _tarih_norm(str(u.get("tarih") or "")) or None,
        "sayi": _etiketli_sayi(metin) or taban.get("sayi")
        or (str(u.get("sayi") or "") or None if not metin else None),
        "basvuru_no": _etiketli_basvuru_no(metin) or taban.get("basvuru_no"),
        "konu_satiri": _etiket(metin, "konu") or taban.get("konu_satiri"),
    }


# ------------------------------------------------------------------ ilgi (m.15)
_UNLU = "aıoueiöü"
_GEN_EK = {"a": "ın", "ı": "ın", "o": "un", "u": "un", "e": "in", "i": "in",
           "ö": "ün", "ü": "ün"}


def kisi_iyelik(ad: str) -> str:
    """Özel ada kesme işaretli tamlayan eki: 'Ayşe Yılmaz' → "Ayşe Yılmaz'ın"."""
    ad = (ad or "").strip()
    son_unlu = next((c for c in reversed(tr_lower(ad)) if c in _UNLU), "")
    if not son_unlu:
        return ad
    ek = _GEN_EK[son_unlu]
    return f"{ad}'{'n' + ek if tr_lower(ad[-1]) in _UNLU else ek}"


def _ilgi_sahibi(gelen: dict[str, Any]) -> str:
    """İlgi belgesinin sahibi = gönderen (kişi ya da idare); muhatap idare ASLA."""
    if gelen.get("gonderen_turu") == "kamu_idaresi":
        aday = gelen.get("gonderen_idare") or ""
    else:
        aday = gelen.get("gonderen_ad") or ""
    muhatap = tr_lower(gelen.get("muhatap_idare") or "")
    return "" if (aday and muhatap and tr_lower(aday) == muhatap) else aday


def _ilgi_cinsi(gelen: dict[str, Any]) -> str:
    cins = gelen.get("belge_cinsi") or "diger"
    if cins in _CINS_ILGI:
        return cins
    # Cinsi bilinmeyen belge: sayılı ise resmî yazı, değilse başvuru (eski davranış).
    return "resmi_yazi" if gelen.get("sayi") else "basvuru"


def ilgi_satiri(gelen: dict[str, Any], rol: str) -> str:
    """Tek ilgi satırı. rol 'cevap'/'devir_bilgi' → muhatap belgenin sahibidir (2. şahıs);
    diğer roller → sahip adıyla 3. şahıs iyelik."""
    cins = _ilgi_cinsi(gelen)
    no = gelen.get("sayi") or gelen.get("basvuru_no") or ""
    tarih = gelen.get("tarih") or ""
    parca = " ".join(p for p in (
        f"{tarih} tarihli" if tarih else "", "ve" if tarih and no else "",
        f"{no} sayılı" if no else "") if p)
    ikinci, ucuncu = _CINS_ILGI[cins]
    if rol in ("cevap", "devir_bilgi"):
        govde = f"{parca} {ikinci}".strip()
        return govde[:1].upper() + govde[1:] + "."
    sahip = _ilgi_sahibi(gelen)
    if sahip:
        if gelen.get("gonderen_turu") == "kamu_idaresi":
            from agents.kurum_kimlik import iyelik_eki
            sahip_g = iyelik_eki(sahip)
            if sahip_g == sahip:
                sahip_g = f"{sahip} tarafından gönderilen"
                ucuncu = "yazı" if cins in ("resmi_yazi", "icra_yazisi", "genelge") else ucuncu
        else:
            sahip_g = kisi_iyelik(sahip)
        return f"{sahip_g} {parca} {ucuncu}.".replace("  ", " ")
    govde = f"{parca} ilgi {CINS_TR.get(cins, 'evrak')}".strip()
    return govde[:1].upper() + govde[1:] + "."


# ------------------------------------------------------------------ muhatap (m.14)
def kategori_etiketi_mi(ad: str) -> bool:
    """Kaba 9'lu kategori etiketi (ör. 'İlgili Teknik / Ana Hizmet Dairesi') bir birim
    ADI değildir; resmî yazının muhatabı olamaz."""
    from agents.config import BIRIM_TR
    n = tr_lower((ad or "").strip())
    if not n:
        return False
    # Kategori etiketi: 9'lu kümeden olup bileşik ('A / B') ya da jenerik ('İlgili …') olan.
    # 'Hukuk Müşavirliği' gibi gerçek birim adı olan üyeler ad sayılır.
    kategoriler = {tr_lower(v) for v in BIRIM_TR.values() if "/" in v or v.startswith("İlgili")}
    return n in kategoriler or n in BIRIM_TR or "/" in n or n.startswith("ilgili ")


BELIRSIZ_BIRIM_MUHATAP = "[İlgili birim — havalede seçilecek]"


def kategori_yer_tutucu(kategori: str) -> str:
    """Kaba kategori yalnız ÖNERİ olarak, açıkça doldurulacak yer tutucu içinde görünür."""
    return f"[Birim seçilecek — öneri: {kategori}]" if kategori else BELIRSIZ_BIRIM_MUHATAP


def muhatap_bicimle(ad: str, tur: str) -> str:
    """m.14 tek kapı. gercek_kisi → 'Sayın Ad'; idare/birim → BÜYÜK + yönelme eki
    (zaten ekliyse yalnız büyük harf); tuzel_kisi → ad aynen. Kategori etiketi reddedilir."""
    from agents.kurum_kimlik import _hitap_idempotent
    ad = _parantez_at(ad)
    if not ad:
        return ""
    if tur == "gercek_kisi":
        return ad if ad.startswith("Sayın ") else f"Sayın {ad}"
    if tur == "tuzel_kisi":
        return ad
    if kategori_etiketi_mi(ad):
        return kategori_yer_tutucu(ad)
    return _hitap_idempotent(ad)


def gonderen_muhatabi(gelen: dict[str, Any]) -> str:
    """Cevap yazısının muhatabı = gelen belgenin göndereni (m.14), biçimiyle."""
    tur = gelen.get("gonderen_turu") or ""
    if tur == "kamu_idaresi":
        return muhatap_bicimle(gelen.get("gonderen_idare") or gelen.get("gonderen_ad") or "",
                               "kamu_idaresi")
    return muhatap_bicimle(gelen.get("gonderen_ad") or "", tur or "gercek_kisi")


# ------------------------------------------------------------------ konu (m.13)
KONU_AZAMI_KELIME = 10
KONU_AZAMI_KARAKTER = 80
_HAM_KOPYA_NGRAM = 6
_RE_YUKLEM = re.compile(
    r"(?:[ıiuü]yor|yor)(?:um|uz|sun|lar)?$|(?:er|ar)(?:ım|im|ız|iz)$"
    r"|(?:m[ae]kt[ae]d[ıi]r|m[ıiuü][şs]t[ıiuü]r|m[ae]kt[ae])$")
_RE_BIRINCI_IYELIK = re.compile(r"[^aıoueiöü][ıiuü]m[ıiuü]z\w{0,4}$")


def _kelimeler(s: str) -> list[str]:
    return re.findall(r"\w+", tr_lower(s or ""))


def _ham_kopya(konu: str, kaynak: str) -> bool:
    k = _kelimeler(konu)
    if len(k) < _HAM_KOPYA_NGRAM or not kaynak:
        return False
    govde = "\n".join(s for s in kaynak.splitlines() if not re.match(r"^\s*konu\s*:", s, re.I))
    g = _kelimeler(govde)
    kaynak_ng = {tuple(g[i:i + _HAM_KOPYA_NGRAM]) for i in range(len(g) - _HAM_KOPYA_NGRAM + 1)}
    return any(tuple(k[i:i + _HAM_KOPYA_NGRAM]) in kaynak_ng
               for i in range(len(k) - _HAM_KOPYA_NGRAM + 1))


def konu_dogrula(konu: str, kaynak: str = "") -> list[str]:
    """m.13 'özetleyici' konu kuralı → ihlal nedenleri (boş liste = geçerli).
    İsim öbeği olmalı: kısa, cümle değil, çekimli yüklem/1. şahıs iyelik yok, kaynak
    gövdesinin ham kopyası değil."""
    k = (konu or "").strip().rstrip(".")
    if not k:
        return ["bos"]
    neden = []
    kel = _kelimeler(k)
    if len(kel) > KONU_AZAMI_KELIME or len(k) > KONU_AZAMI_KARAKTER:
        neden.append("uzun")
    if re.search(r"[.!?;]\s|[!?;]$", k):
        neden.append("cumle_noktalama")
    if any(_RE_YUKLEM.search(w) for w in kel[-2:]) or any(
            w in ("ederim", "ediyorum", "ederiz", "rica", "arz") for w in kel):
        neden.append("yuklem")
    if any(len(w) > 5 and _RE_BIRINCI_IYELIK.search(w) for w in kel):
        neden.append("birinci_sahis")
    if _ham_kopya(k, kaynak):
        neden.append("ham_kopya")
    if kel and kel[-1].isdigit():
        neden.append("kesik")  # "Eryaman 4" — sıra sayısı noktasında kesilmiş öbek
    return neden


def konu_sec(adaylar: list[str | None], kaynak: str = "", yedek: str = "") -> str:
    """Aday sırasıyla İLK geçerli konu; hiçbiri geçmezse kısaltılmış ilk aday, o da
    geçmezse `yedek` (ör. 'Dilekçe hk.'). Sondaki nokta atılır (m.13)."""
    temiz = [str(a).strip().rstrip(".") for a in adaylar if a and str(a).strip()]
    if not temiz:
        return ""
    for a in temiz:
        if not konu_dogrula(a, kaynak):
            return a
    from agents.nodes.cikar import _konu_kisa
    for a in temiz:
        kisa = _konu_kisa(a)
        # Kısaltma ancak anlamlı bir öbek bırakıyorsa (≥3 sözcük) kabul edilir.
        if len(_kelimeler(kisa)) >= 3 and not konu_dogrula(kisa, kaynak):
            return kisa
    return yedek or (temiz[0] if temiz else "")


# ------------------------------------------------------------------ çözücü
@dataclass(frozen=True)
class YaziBasligi:
    """Bir yazının başlık alanları (render'a girer)."""

    rol: str
    konu: str
    muhatap: str
    ilgi_satirlari: tuple[str, ...] = field(default_factory=tuple)


def rol_tahmin(yazi_turu: str, muhatap: str, gelen: dict[str, Any]) -> str:
    """Rol verilmediyse yazı türü + muhataptan çıkar (eski çağıranlar için)."""
    if yazi_turu == "olur":
        return "olur"
    if yazi_turu == "ust_yazi":
        return "havale"
    if yazi_turu == "bilgilendirme":
        return "cevap" if muhatap.startswith("Sayın ") else "dagitim"
    return "cevap"


def baslik_coz(
    gelen: dict[str, Any], yazi_turu: str, *, rol: str | None = None,
    muhatap: str | None = None, konu_adaylari: list[str | None] | None = None,
    kaynak_metin: str = "",
) -> YaziBasligi:
    """Tek çözücü: rol + muhatap + konu + ilgi. muhatap verilmezse cevap rolünde
    gönderen (m.14 biçimli) kullanılır."""
    if muhatap is None:
        muhatap = gonderen_muhatabi(gelen) if (rol or "cevap") in ("cevap", "devir_bilgi") \
            and yazi_turu not in ("ust_yazi", "olur") else ""
    rol = rol or rol_tahmin(yazi_turu, muhatap, gelen)
    var_mi = gelen.get("tarih") or gelen.get("sayi") or gelen.get("basvuru_no")
    ilgi: tuple[str, ...] = ()
    if (rol != "olur" and var_mi) or (rol in ("cevap", "devir_bilgi") and gelen.get("belge_cinsi") in _CINS_ILGI):
        ilgi = (ilgi_satiri(gelen, rol),)
    cins_ad = CINS_TR.get(gelen.get("belge_cinsi") or "diger", "evrak")
    yedek = f"{cins_ad[:1].upper()}{cins_ad[1:]} hk"
    konu = konu_sec(list(konu_adaylari or []), kaynak_metin, yedek)
    return YaziBasligi(rol=rol, konu=konu, muhatap=muhatap, ilgi_satirlari=ilgi)


__all__ = (
    "BELGE_CINSLERI",
    "BELIRSIZ_BIRIM_MUHATAP",
    "CINS_TR",
    "GONDEREN_TURLERI",
    "ROLLER",
    "YaziBasligi",
    "antet_idaresi",
    "baslik_coz",
    "gelen_evrak_coz",
    "gonderen_muhatabi",
    "ilgi_satiri",
    "kategori_etiketi_mi",
    "kategori_yer_tutucu",
    "kisi_iyelik",
    "konu_dogrula",
    "konu_sec",
    "muhatap_bicimle",
    "rol_tahmin",
    "tr_baslik",
)
