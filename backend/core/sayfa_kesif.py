"""Bir kurumun sitesinde "birimler/teşkilat" sayfasını bulur (ağ ÇAĞRISI yapar).

`kurum_alan.aday_alanlar` nereye bakılacağını söyler; bu modül o sitede DOĞRU SAYFAYI
arar. İkisi birlikte, doğrulanmamış bir kuruma evrak geldiğinde memura gösterilecek
kaynak linkini üretir.

NEDEN ARAMA MOTORU DEĞİL: kurumun kendi sitesinde gezinmek hem ücretsiz hem de kaynağı
YAPISI GEREĞİ resmî. Arama motoru üçüncü bir tarafın sıralamasına güvenmek demektir.
LLM araması ancak burası tutmazsa devreye girer (bkz. docs/14).

GÜVENLİK — bu modül dış girdiyle ağa çıkar, üç kural:
  · Yalnız İZİNLİ alan adı soneklerine gidilir (.gov.tr/.bel.tr/.edu.tr/.pol.tr).
    Yönlendirme başka alana çıkarsa izlenmez — SSRF ve alan kaçırma koruması.
  · TLS doğrulaması KAPATILAMAZ.
  · Yalnız GET, gövde boyutu sınırlı, zaman aşımı kısa.

BULUNAN SAYFA KAYNAK DEĞİLDİR: burada dönen şey bir ADRES ve o adresin METNİdir.
Birim adlarının o metinde birebir geçtiğini doğrulamak çağıranın işidir.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx
import structlog

log = structlog.get_logger()

# İzinli resmî sonekler. Liste DAR tutulur: bir kurumun sitesi bunların dışındaysa
# (ör. belediye şirketi .com.tr) canlı kaynak üretilmez — yanlış siteye gitmektense
# hiç gitmemek doğrudur.
IZINLI_SONEKLER = (".gov.tr", ".bel.tr", ".edu.tr", ".pol.tr", ".tsk.tr")

# Sayfayı "birim listesi" yapan bağlantı ipuçları ve AĞIRLIKLARI. Türkçe karakterler hem
# tam hem ASCII biçimde aranır: siteler adresi ASCII yazarken bağlantı metnini Türkçe
# yazıyor. Güçlü ipucu önce denenir; "kurumsal" zayıftır (çoğu sitede genel menü başlığı,
# altında birim listesi olmayabilir).
_AGIRLIK = {"mudurlukler": 5, "müdürlükler": 5, "birimler": 5, "birimlerimiz": 5,
            "hizmet-birimleri": 5, "hizmet birimleri": 5, "daire-baskanliklari": 5,
            "daire başkanlıkları": 5, "sube-mudurlukleri": 4, "şube müdürlükleri": 4,
            "teskilat": 3, "teşkilat": 3, "organizasyon": 3, "kurumsal": 1}

_BAG_RE = re.compile(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)
_ETIKET_RE = re.compile(r"<[^>]+>")
_BASLIK = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "tr-TR,tr;q=0.9",
}
AZAMI_GOVDE = 3_000_000   # 3 MB; kurumsal siteler bunu aşmaz, aşan sayfa okunmaz
ZAMAN_ASIMI = 12.0


@dataclass(frozen=True)
class Bulgu:
    """Bulunan sayfa. `metin` düz metindir; birim doğrulaması ÇAĞIRANA aittir."""

    url: str
    metin: str
    ipucu: str          # sayfayı hangi bağlantı ipucu getirdi (denetlenebilirlik)


def izinli_mi(url: str) -> bool:
    """Adres izinli resmî sonekli bir HTTPS alanında mı?"""
    try:
        parca = urlsplit(url)
    except ValueError:
        return False
    if parca.scheme != "https" or not parca.hostname:
        return False
    ana = parca.hostname.lower().rstrip(".")
    return any(ana == s.lstrip(".") or ana.endswith(s) for s in IZINLI_SONEKLER)


def _duz_metin(govde: str) -> str:
    return html.unescape(_ETIKET_RE.sub(" ", govde))


def _getir(istemci: httpx.Client, url: str) -> str | None:
    """Sayfayı indir. İzinsiz alan / hata / aşırı boyut → None."""
    if not izinli_mi(url):
        return None
    try:
        yanit = istemci.get(url)
        yanit.raise_for_status()
    except Exception as exc:
        log.info("sayfa_kesif.erisilemedi", url=url, hata=type(exc).__name__)
        return None
    # Yönlendirme izinli alandan ÇIKTIYSA içeriği kullanma (alan kaçırma koruması).
    if not izinli_mi(str(yanit.url)):
        log.warning("sayfa_kesif.yonlendirme_izinsiz_alana", url=url, hedef=str(yanit.url))
        return None
    if len(yanit.content) > AZAMI_GOVDE:
        return None
    return yanit.text


def _aday_baglantilar(govde: str, temel: str) -> list[tuple[int, str, str]]:
    """(ağırlık, mutlak URL, ipucu) — güçlü ipucu önce, tekilleştirilmiş."""
    bulunan: dict[str, tuple[int, str]] = {}
    for ham_href, ham_metin in _BAG_RE.findall(govde):
        href = html.unescape(ham_href).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        etiket = re.sub(r"\s+", " ", _duz_metin(ham_metin)).strip().lower()
        hedef = urljoin(temel, href)
        if not izinli_mi(hedef):
            continue
        aranan = f"{href.lower()} {etiket}"
        for ipucu, agirlik in _AGIRLIK.items():
            if ipucu in aranan:
                onceki = bulunan.get(hedef)
                if onceki is None or agirlik > onceki[0]:
                    bulunan[hedef] = (agirlik, ipucu)
                break
    return sorted(
        ((a, u, i) for u, (a, i) in bulunan.items()), key=lambda x: (-x[0], x[1])
    )


def birim_sayfasi_bul(
    alan_adaylari: list[str], *, azami_sayfa: int = 4
) -> Bulgu | None:
    """Aday alan adlarını sırayla dene; ilkinde açılan sitede birim sayfasını ara.

    `azami_sayfa` bir sitede denenecek iç sayfa sayısını sınırlar — kurum sitesini
    gezmek amacımız değil, tek bir sayfayı bulmak. Bulunamazsa None döner ve çağıran
    LLM aramasına düşebilir.
    """
    with httpx.Client(
        follow_redirects=True, timeout=ZAMAN_ASIMI, headers=_BASLIK, verify=True
    ) as istemci:
        for alan in alan_adaylari:
            ana_sayfa = _getir(istemci, alan)
            if ana_sayfa is None:
                continue
            for _agirlik, url, ipucu in _aday_baglantilar(ana_sayfa, alan)[:azami_sayfa]:
                govde = _getir(istemci, url)
                if govde is None:
                    continue
                metin = _duz_metin(govde)
                log.info("sayfa_kesif.bulundu", url=url, ipucu=ipucu, uzunluk=len(metin))
                return Bulgu(url=url, metin=metin, ipucu=ipucu)
            # Ana sayfa açıldı ama birim sayfası bulunamadı — ana sayfanın kendisi de
            # bazen listeyi taşır (küçük belediyeler). Son çare olarak onu döndür.
            log.info("sayfa_kesif.ana_sayfaya_dusuldu", url=alan)
            return Bulgu(url=alan, metin=_duz_metin(ana_sayfa), ipucu="ana-sayfa")
    return None


__all__ = ("IZINLI_SONEKLER", "Bulgu", "birim_sayfasi_bul", "izinli_mi")
