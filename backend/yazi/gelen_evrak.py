"""Gelen evrak modeli (GelenEvrak) — gelen belgenin kimliği tek, tipli bir yapıda.

NEDEN (teşhis 2026-10-05, "Resmî yazı taslağı" ADIM 1): eski `kurum` alanı belirsizdi —
gönderen idare mi, bize hitap edilen idare mi, ayırt edilmiyordu; sayı açgözlü bir
regex'le (etiketsiz) yakalanıyor, CİMER/BİE başvuru numarası hiç tutulmuyordu. Sonuç:
ilgi satırında "ilgi sahibi" olarak muhatap kurum yazılıyor, icra/mahkeme yazısına dilekçe
kuralları uygulanıyordu.

Kaynaklar ve öncelik:
  * ETİKETLİ kanıt (deterministik): 'Sayı:', 'Başvuru No:', 'Konu:', 'Tarih:' satırları.
    LLM ile çelişirse etiket kazanır.
  * YAPISAL kanıt (deterministik): antet satırı (yalın hâl, BÜYÜK) → gönderen idare;
    hitap satırı (yönelme eki: -NA/-NE) → muhatap idare.
  * Anlam (LLM, cikar'ın TEK çağrısında): belge_cinsi + gonderen_turu kapalı kümeden.
    LLM yoksa yapısal kanıttan makul yedek.

bilgi_unsurlari['gelen_evrak'] dict olarak tutulur (JSON/SSE/DB); kod içinde
`GelenEvrak.from_dict(...)` ile tipli okunur. Akış B (`yazi/baslik.py`) aynı adı bekler.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from core.text import tr_lower, tr_upper

BELGE_CINSLERI: tuple[str, ...] = (
    "dilekce", "basvuru", "cimer_basvurusu", "bilgi_edinme_basvurusu", "resmi_yazi",
    "muzekkere", "icra_yazisi", "genelge", "diger",
)
GONDEREN_TURLERI: tuple[str, ...] = ("gercek_kisi", "tuzel_kisi", "kamu_idaresi")
# Kurumdan kuruma yazışma: 3071 dilekçe şartları (ad-soyad/imza/adres) UYGULANMAZ.
RESMI_CINSLER = frozenset({"resmi_yazi", "muzekkere", "icra_yazisi", "genelge"})
# Kimliği kanalın kendisi doğrulayan başvurular (CİMER e-Devlet girişiyle alınır).
ELEKTRONIK_CINSLER = frozenset({"cimer_basvurusu"})

_AD_AZAMI = 160


@dataclass(frozen=True)
class GelenEvrak:
    """Gelen evrakın kimliği (değişmez)."""

    belge_cinsi: str = "diger"
    gonderen_turu: str = "gercek_kisi"
    gonderen_ad: str | None = None
    gonderen_idare: str | None = None
    muhatap_idare: str | None = None
    tarih: str | None = None
    sayi: str | None = None
    basvuru_no: str | None = None
    konu_satiri: str | None = None

    @property
    def resmi(self) -> bool:
        """Kurumdan gelen resmî yazışma mı (dilekçe kuralları uygulanmaz)."""
        return self.belge_cinsi in RESMI_CINSLER or self.gonderen_turu == "kamu_idaresi"

    @property
    def elektronik_kanal(self) -> bool:
        return self.belge_cinsi in ELEKTRONIK_CINSLER

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, veri: Any) -> GelenEvrak:
        """Toleranslı okuma: bilinmeyen anahtar atılır, kapalı küme dışı değer varsayılana düşer."""
        if isinstance(veri, GelenEvrak):
            return veri
        if not isinstance(veri, dict):
            return cls()
        cinsi = veri.get("belge_cinsi")
        turu = veri.get("gonderen_turu")
        metin = {k: _metin(veri.get(k)) for k in (
            "gonderen_ad", "gonderen_idare", "muhatap_idare", "tarih", "sayi",
            "basvuru_no", "konu_satiri")}
        return cls(
            belge_cinsi=cinsi if cinsi in BELGE_CINSLERI else "diger",
            gonderen_turu=turu if turu in GONDEREN_TURLERI else "gercek_kisi",
            **metin,
        )


def _metin(deger: Any) -> str | None:
    if not isinstance(deger, str):
        return None
    d = re.sub(r"\s+", " ", deger).strip()
    return d[:_AD_AZAMI] or None


# ---------------------------------------------------------------------------
# Deterministik çıkarım (etiketli + yapısal kanıt)
# ---------------------------------------------------------------------------
_RE_SAYI = re.compile(r"^[ \t]*Sayı[ \t]*[:：][ \t]*(\S[^\n]*?)[ \t]*$", re.MULTILINE)
_RE_BASVURU_NO = re.compile(
    r"Başvuru[ \t]+(?:No|Numarası|Numarasi)[ \t]*[:：][ \t]*([A-Za-z0-9][A-Za-z0-9\-/.]*)")
# Yargı/icra yazışmasında yazının numarası 'Dosya No' / 'Esas No' etiketindedir.
_RE_DOSYA_NO = re.compile(
    r"^[ \t]*(?:Dosya|Esas)[ \t]+No[ \t]*[:：][ \t]*(\S[^\n]*?)[ \t]*$", re.MULTILINE)
_RE_BASVURU_SAHIBI = re.compile(
    r"Başvuru[ \t]+Sahibi[ \t]*[:：][ \t]*"
    r"([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:[ \t]+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)")
_RE_KONU = re.compile(r"^[ \t]*Konu[ \t]*[:：][ \t]*(\S[^\n]*?)[ \t]*$", re.MULTILINE)
_RE_TUZEL = re.compile(
    r"\b(?:Ltd\.?\s*Şti|A\.\s?Ş\.|Anonim Şirketi|Limited Şirketi|Derneği|Vakfı|Kooperatifi)")
_UST_SATIR = 12   # antet/hitap belgenin başında aranır
_IMZA_SATIR = 6   # imza bloğu belgenin sonundadır


# --- Etiketli okuma (TEK kaynak; yazi.baslik de bunu kullanır) -------------------------
_TARIH_KALIP = r"\d{1,2}[./]\d{1,2}[./]\d{4}"
_RE_TARIH_DUZ = re.compile(_TARIH_KALIP)
_RE_SALT_TARIH = re.compile(
    rf"^\s*(?:tarih\s*[:.]?\s*)?({_TARIH_KALIP})\s*$", re.IGNORECASE)
_ETIKET_KALIP = r"^\s*{etiket}\s*:\s*(?P<deger>.+?)\s*$"


def _etiket(metin: str, etiket: str) -> str | None:
    """Satır başındaki 'Etiket : değer' satırının değeri (çok satırlı metin, ilk eşleşme)."""
    m = re.search(_ETIKET_KALIP.format(etiket=etiket), metin or "",
                  re.IGNORECASE | re.MULTILINE)
    return m.group("deger").strip() if m else None


def _tarih_norm(t: str | None) -> str | None:
    if not t:
        return None
    m = _RE_TARIH_DUZ.search(t)
    if not m:
        return None
    g, a, y = re.split(r"[./]", m.group(0))
    return f"{int(g):02d}.{int(a):02d}.{y}"


def etiketli_tarih(metin: str) -> str | None:
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


def etiketli_sayi(metin: str) -> str | None:
    """Yalnız 'Sayı :' etiketinden (sondaki tarih atılır); yoksa yargı/icra dosya numarası."""
    if (ham := _etiket(metin, r"say[ıi]")):
        sayi = _RE_TARIH_DUZ.sub("", ham).strip(" ,;")
        if sayi:
            return sayi
    for etiket in (r"esas\s+no", r"dosya\s+no"):
        if (ham := _etiket(metin, etiket)):
            return f"{ham} Esas" if "esas" in etiket and "esas" not in tr_lower(ham) else ham
    return None


def etiketli_basvuru_no(metin: str) -> str | None:
    ham = _etiket(metin, r"(?:\w+\s+)?ba[şs]vuru\s+(?:no|numaras[ıi])")
    return ham.split()[0].strip(" ,;") if ham else None


def _buyuk_satir(satir: str) -> bool:
    harf = [c for c in satir if c.isalpha()]
    return len(harf) >= 4 and sum(c.isupper() for c in harf) / len(harf) > 0.8


def _baslik_bicimi(ad: str) -> str:
    """'KEÇİÖREN BELEDİYE BAŞKANLIĞI' → 'Keçiören Belediye Başkanlığı' (Türkçe büyük/küçük)."""
    kucuk = {"ve", "ile"}
    out = []
    for k in ad.split():
        kk = tr_lower(k)
        out.append(kk if kk in kucuk else tr_upper(kk[:1]) + kk[1:])
    return " ".join(out)


def _idare_satiri(satir: str) -> bool:
    """Antet satırı: BÜYÜK harfli ya da her sözcüğü büyük harfle başlayan kısa idare adı."""
    if _buyuk_satir(satir):
        return True
    kelimeler = satir.split()
    return 2 <= len(kelimeler) <= 8 and ":" not in satir and all(
        k[:1].isupper() or k in ("ve", "ile") or k[:1].isdigit() for k in kelimeler)


def _antet_ve_hitap(metin: str) -> tuple[str | None, str | None]:
    """Belgenin başı: İLK bloktaki idare satırları = antet (gönderen); yönelme ekli BÜYÜK
    satır (-NA/-NE/-YA/-YE) = hitap (muhatap). Hitapla aynı bloktaki üst satırlar hitabın
    parçasıdır ('SOSYAL GÜVENLİK KURUMU / ANKARA ... MÜDÜRLÜĞÜNE'), antet sayılmaz."""
    bloklar: list[list[str]] = [[]]
    for satir in metin.splitlines()[:_UST_SATIR * 2]:
        s = satir.strip()
        if not s or re.match(r"^[^:]{1,25}:", s):
            if bloklar[-1]:
                bloklar.append([])
            continue
        bloklar[-1].append(s)
    hitap: str | None = None
    hitap_blok = -1
    for i, blok in enumerate(bloklar):
        for s in blok:
            govde = s.rstrip(" .,:")
            if _buyuk_satir(govde) and re.search(r"(?:N[AE]|Y[AE])$", govde)                     and len(govde.split()) >= 2:
                hitap, hitap_blok = re.sub(r"(?:N[AE]|Y[AE])$", "", govde), i
                break
        if hitap:
            break
    antet: list[str] = []
    if hitap_blok != 0 and bloklar[0]:
        for s in bloklar[0]:
            if re.fullmatch(r"T\.\s*C\.?", s):
                continue
            if not _idare_satiri(s) or len(antet) >= 3:
                break
            antet.append(s.rstrip(" .,:"))
    gonderen = _baslik_bicimi(" ".join(antet)) if antet else None
    return gonderen, (_baslik_bicimi(hitap) if hitap else None)


def _cinsi_yedek(metin: str, kamu: bool, hitap_var: bool) -> str:
    """LLM yokken belge cinsi: yalnız belgenin kendi beyanı/yapısı (kapalı küme)."""
    t = tr_lower(metin)
    if "cimer" in t:
        return "cimer_basvurusu"
    if "4982" in t or "bilgi edinme" in t:
        return "bilgi_edinme_basvurusu"
    if kamu and re.search(r"icra (?:dairesi|müdürlüğü)", t):
        return "icra_yazisi"
    if kamu and ("müzekkere" in t or "mahkemesi" in t):
        return "muzekkere"
    if kamu and "genelge" in t:
        return "genelge"
    if kamu:
        return "resmi_yazi"
    return "dilekce" if hitap_var else "diger"


def _imza_blogu(metin: str) -> str:
    """Belgenin son satırları (imza/künye bloğu) — tüzel kişi unvanı burada aranır."""
    return "\n".join([s for s in metin.splitlines() if s.strip()][-_IMZA_SATIR:])


def _gonderen_turu(metin: str, llm: dict[str, Any], kamu_yapisal: bool, cimer: bool) -> str:
    turu = llm.get("gonderen_turu")
    if turu in GONDEREN_TURLERI:
        return turu
    if kamu_yapisal and not cimer:   # CİMER çıktısının anteti ALAN idarenindir
        return "kamu_idaresi"
    return "tuzel_kisi" if _RE_TUZEL.search(_imza_blogu(metin)) else "gercek_kisi"


def gelen_evrak_cikar(metin: str, llm: dict[str, Any] | None = None,
                      gonderen_ad: str | None = None) -> GelenEvrak:
    """Gelen evrak modelini kur: etiketli/yapısal kanıt + (varsa) LLM'in kapalı-küme anlamı."""
    metin = metin or ""
    llm = llm if isinstance(llm, dict) else {}
    antet, hitap = _antet_ve_hitap(metin)
    sayi = _RE_SAYI.search(metin) or _RE_DOSYA_NO.search(metin)
    cimer = llm.get("belge_cinsi") == "cimer_basvurusu" or "cimer" in tr_lower(metin)
    turu = _gonderen_turu(metin, llm, bool(antet) or bool(sayi), cimer)
    kamu = turu == "kamu_idaresi"
    cinsi = llm.get("belge_cinsi")
    if cinsi not in BELGE_CINSLERI:
        cinsi = _cinsi_yedek(metin, kamu, bool(hitap))
    if not kamu and antet and not hitap:
        hitap, antet = antet, None          # başvuru çıktısı: antet = başvurulan idare
    sahibi = _RE_BASVURU_SAHIBI.search(metin)
    konu = _RE_KONU.search(metin)
    bno = _RE_BASVURU_NO.search(metin)
    return GelenEvrak(
        belge_cinsi=cinsi,
        gonderen_turu=turu,
        gonderen_ad=None if kamu else _metin(gonderen_ad or (sahibi and sahibi.group(1))),
        gonderen_idare=(antet or _metin(llm.get("gonderen_idare"))) if kamu else None,
        muhatap_idare=hitap or _metin(llm.get("muhatap_idare")),
        tarih=etiketli_tarih(metin),
        sayi=_metin(etiketli_sayi(metin)),
        basvuru_no=etiketli_basvuru_no(metin) or (bno.group(1).rstrip(".") if bno else None),
        konu_satiri=_metin(konu.group(1)) if konu else None,
    )


__all__ = ("BELGE_CINSLERI", "GONDEREN_TURLERI", "GelenEvrak", "etiketli_basvuru_no",
           "etiketli_sayi", "etiketli_tarih", "gelen_evrak_cikar")
