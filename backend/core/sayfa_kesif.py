"""Bir kurumun sitesinde "birimler/teşkilat" sayfasını bulur (ağ ÇAĞRISI yapar).

`kurum_alan.aday_alanlar` nereye bakılacağını söyler; bu modül o sitede DOĞRU SAYFAYI
arar. İkisi birlikte, doğrulanmamış bir kuruma evrak geldiğinde memura gösterilecek
kaynak linkini üretir.

NEDEN ARAMA MOTORU DEĞİL: kurumun kendi sitesinde gezinmek hem ücretsiz hem de kaynağı
YAPISI GEREĞİ resmî. Arama motoru üçüncü bir tarafın sıralamasına güvenmek demektir.
LLM araması ancak burası tutmazsa devreye girer (bkz. docs/14).

GÜVENLİK — bu modül dış girdiyle ağa çıkar, beş kural (2026-08-06 denetiminde sertleşti):
  · Yalnız İZİNLİ alan adı soneklerine gidilir (.gov.tr/.bel.tr/.edu.tr/.pol.tr/.tsk.tr).
  · YÖNLENDİRME ELLE İZLENİR ve HER SIÇRAMA ayrı ayrı sınanır. Eskiden httpx zinciri
    kendisi takip ediyor, kod yalnız NİHAİ adrese bakıyordu — yani izinsiz ara adrese
    (127.0.0.1, 169.254.169.254 gibi) istek FİİLEN ATILIYOR, sadece sonucu atılıyordu.
    Kör SSRF buydu; artık izinsiz sıçramaya istek hiç gitmez.
  · Çözülen IP özel/loopback/link-local aralıktaysa reddedilir. (DNS rebinding'e karşı
    tam koruma değildir — bunun için bağlantı anında IP sabitlemek gerekir; bu katman
    yalnız GET yaptığı ve içeriği doğrulanmadan kullanmadığı için kabul edilen risk.)
  · TLS doğrulaması KAPATILAMAZ.
  · Yalnız GET; gövde AKIŞLA indirilir ve sınır İNDİRME SIRASINDA uygulanır. Eskiden
    `len(yanit.content)` ile indirme BİTTİKTEN sonra bakılıyordu; 3 MB tavanı belleği
    hiç korumuyordu (sıkıştırma bombası / dev PDF → OOM). Ayrıca HTML olmayan içerik
    hiç indirilmez.

ZAMAN: `ZAMAN_ASIMI` istek başınadır; toplam iş için ayrıca `TOPLAM_BUTCE_SN` vardır.
İkisi olmadan tek bir evrak dakikalarca asılı kalabiliyordu (ölçülen senaryo: 4 ölü aday
alan × 12 sn + 4 yavaş iç sayfa × 12 sn ≈ 96 sn).

BULUNAN SAYFA KAYNAK DEĞİLDİR: burada dönen şey bir ADRES ve o adresin METNİdir.
Birim adlarının o metinde birebir geçtiğini doğrulamak çağıranın işidir.
"""
from __future__ import annotations

import html
import ipaddress
import re
import socket
import time
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
# Blok düzeyi etiketler METİN SINIRIDIR (hücre/öğe/paragraf); boşluğa değil satır sonuna
# çevrilirler ki komşu hücrelerin metni birbirine yapışmasın.
_BLOK_ETIKET_RE = re.compile(
    r"</?(?:td|th|tr|li|p|div|br|h[1-6]|option|dt|dd|section|article|table|ul|ol)\b[^>]*>",
    re.I,
)
_BASLIK = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "tr-TR,tr;q=0.9",
}
AZAMI_GOVDE = 3_000_000   # 3 MB; kurumsal siteler bunu aşmaz, aşan sayfa okunmaz
# İstek başına sınırlar. connect ayrı ve KISA tutulur: ölü/güvenlik duvarlı alan adları
# ölçümde en çok burada vakit yiyordu (kurum_alan._OLCUM_NOTU'ndaki ConnectTimeout'lar).
ZAMAN_ASIMI = httpx.Timeout(8.0, connect=3.0)
# Tüm keşif işinin ÜST SINIRI. Memuru ekranda bekletmemek bir güvenlik değil kullanılabilirlik
# şartı ama sözleşme F ("akış düşmez") açısından kritik: süresiz asılma hatadan kötüdür.
TOPLAM_BUTCE_SN = 6.0
AZAMI_YONLENDIRME = 3
# HTML olmayan içerik hiç indirilmez — birim adları HTML sayfalarda yaşar.
_KABUL_TIPLERI = ("text/html", "application/xhtml", "text/plain")
# Bağlantı ipucu taşısa bile indirilmeyecek uzantılar (dev dosya + ikili içerik).
_YASAK_UZANTI = (".pdf", ".zip", ".rar", ".doc", ".docx", ".xls", ".xlsx", ".ppt",
                 ".pptx", ".mp4", ".mp3", ".iso", ".exe", ".jpg", ".png", ".gif")


@dataclass(frozen=True)
class Bulgu:
    """Bulunan sayfa. `metin` düz metindir; birim doğrulaması ÇAĞIRANA aittir."""

    url: str
    metin: str
    ipucu: str          # sayfayı hangi bağlantı ipucu getirdi (denetlenebilirlik)


def izinli_mi(url: str) -> bool:
    """Adres izinli resmî sonekli, standart portlu bir HTTPS alanında mı?"""
    try:
        parca = urlsplit(url)
    except ValueError:
        return False
    if parca.scheme != "https" or not parca.hostname:
        return False
    # PORT: yalnız 443. Serbest bırakıldığında bir sayfadaki
    # <a href="https://hedef.gov.tr:22/x">Müdürlükler</a> bağlantısı kapıdan geçiyor ve
    # sunucu resmî altyapıya karşı kör bir port sondasına dönüşüyordu.
    if parca.port not in (None, 443):
        return False
    # USERINFO: "https://kullanici@ornek.gov.tr/" biçimini reddet. Python konağı doğru
    # ayrıştırdığı için burada güvenlik açığı değildi, ama istemci tarafı kapı
    # (frontend guvenliKaynakAdresi) bunu REDDEDİYOR — ikisi ayrışırsa backend indirip
    # künyeye koyduğu bir kaynağı arayüz sessizce göstermez. İki kapı aynı olmalı.
    if parca.username or parca.password:
        return False
    ana = parca.hostname.lower().rstrip(".")
    return any(ana == s.lstrip(".") or ana.endswith(s) for s in IZINLI_SONEKLER)


def ic_ag_mi(konak: str) -> bool:
    """Konak özel/loopback/link-local bir adrese mi çözülüyor?

    `.gov.tr` bir ad da iç bir IP'ye çözülebilir; alan adı sonekine bakmak yetmez.
    Çözülemeyen ad "iç" sayılmaz — bağlantı zaten kurulamayacaktır.
    """
    try:
        adresler = {bilgi[4][0] for bilgi in socket.getaddrinfo(konak, 443, proto=socket.IPPROTO_TCP)}
    except (OSError, UnicodeError):
        return False
    for ham in adresler:
        try:
            ip = ipaddress.ip_address(ham)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    return False


def _guvenli_hedef(url: str) -> bool:
    """İstek atılmadan ÖNCE uygulanan tam kapı: izinli sonek + iç ağ değil."""
    if not izinli_mi(url):
        return False
    konak = (urlsplit(url).hostname or "").lower()
    if ic_ag_mi(konak):
        log.warning("sayfa_kesif.ic_ag_adresi_reddedildi", url=url)
        return False
    return True


def _duz_metin(govde: str) -> str:
    """HTML → düz metin. BLOK sınırları satır sonuna çevrilir.

    Neden önemli: birim çıkarıcı `\\n`'i sınır sayar. Tüm etiketleri boşluğa çevirmek
    tablo hücrelerini ve liste öğelerini birbirine yapıştırıyordu — bir personel
    tablosunda `<td>Ayşe Yılmaz</td><td>Fen İşleri Müdürlüğü</td>` "Ayşe Yılmaz Fen
    İşleri Müdürlüğü" adında bir "birim" üretiyor ve kişi adı önbelleğe yazılıyordu.
    """
    metin = _BLOK_ETIKET_RE.sub("\n", govde)
    return html.unescape(_ETIKET_RE.sub(" ", metin))


def _okunabilir_mi(yanit: httpx.Response) -> bool:
    """İçerik türü ve bildirilen boyut kabul edilebilir mi (gövde okunmadan ÖNCE)."""
    tip = (yanit.headers.get("content-type") or "").lower()
    # FAIL-CLOSED (9 Ağu 2026 güvenlik denetimi): eskiden koşul `if tip and not ...` idi;
    # yani sunucu Content-Type'ı HİÇ göndermezse kapı tamamen atlanıyor ve gövde
    # indiriliyordu — oysa modülün kendi sözleşmesi "HTML olmayan içerik hiç indirilmez"
    # diyor. Başlığı atlamak sunucunun (dolayısıyla saldırganın) tercihidir; eksik başlık
    # artık "bilinmiyor" değil "kabul edilmez" sayılır. Meşru kurum siteleri Content-Type
    # gönderir; göndermeyeni atlamanın bedeli yalnız o kaynağın keşfedilmemesidir.
    if not tip or not any(k in tip for k in _KABUL_TIPLERI):
        log.info("sayfa_kesif.icerik_turu_reddedildi", tip=(tip[:40] or "(başlık yok)"))
        return False
    bildirilen = yanit.headers.get("content-length")
    if bildirilen and bildirilen.isdigit() and int(bildirilen) > AZAMI_GOVDE:
        log.info("sayfa_kesif.govde_cok_buyuk_bildirildi", boyut=bildirilen)
        return False
    return True


def _getir(istemci: httpx.Client, url: str, bitis: float | None = None) -> str | None:
    """Sayfayı indir. İzinsiz alan / iç ağ / hata / aşırı boyut → None.

    Yönlendirme ELLE izlenir: her sıçrama `_guvenli_hedef` kapısından ayrı ayrı geçer,
    böylece izinsiz adrese istek HİÇ atılmaz. Gövde akışla okunur ve sınır indirme
    SIRASINDA uygulanır.
    """
    for _ in range(AZAMI_YONLENDIRME + 1):
        if bitis is not None and time.monotonic() > bitis:
            log.info("sayfa_kesif.butce_doldu", url=url)
            return None
        if not _guvenli_hedef(url):
            return None
        try:
            with istemci.stream("GET", url) as yanit:
                if yanit.status_code in (301, 302, 303, 307, 308):
                    hedef = urljoin(url, yanit.headers.get("location", ""))
                    if hedef == url:
                        return None
                    url = hedef
                    continue      # bir sonraki turda hedef YENİDEN sınanır
                yanit.raise_for_status()
                if not _okunabilir_mi(yanit):
                    return None
                parcalar: list[bytes] = []
                toplam = 0
                for parca in yanit.iter_bytes():
                    toplam += len(parca)
                    if toplam > AZAMI_GOVDE:
                        # Sınır indirme SIRASINDA uygulanır: bağlantı burada kesilir,
                        # 10 GB'a açılan bir sıkıştırma bombası belleğe alınmaz.
                        log.warning("sayfa_kesif.govde_sinirini_asti", url=url)
                        return None
                    parcalar.append(parca)
                govde = b"".join(parcalar)
                return govde.decode(yanit.encoding or "utf-8", errors="replace")
        except Exception as exc:
            log.info("sayfa_kesif.erisilemedi", url=url, hata=type(exc).__name__)
            return None
    log.warning("sayfa_kesif.cok_fazla_yonlendirme", url=url)
    return None


def _aday_baglantilar(govde: str, temel: str) -> list[tuple[int, str, str]]:
    """(ağırlık, mutlak URL, ipucu) — güçlü ipucu önce, tekilleştirilmiş."""
    bulunan: dict[str, tuple[int, str]] = {}
    for ham_href, ham_metin in _BAG_RE.findall(govde):
        href = html.unescape(ham_href).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        etiket = re.sub(r"\s+", " ", _duz_metin(ham_metin)).strip().lower()
        hedef = urljoin(temel, href)
        # "Müdürlükler" bağlantısı çoğu zaman bir PDF/şema dosyasına gider; ikili içerik
        # indirmek hem boşuna hem risklidir (uzantı kapısı, tür kapısından önce ucuz).
        if urlsplit(hedef).path.lower().endswith(_YASAK_UZANTI):
            continue
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
    alan_adaylari: list[str], *, azami_sayfa: int = 4, butce_sn: float = TOPLAM_BUTCE_SN
) -> Bulgu | None:
    """Aday alan adlarını sırayla dene; ilkinde açılan sitede birim sayfasını ara.

    `azami_sayfa` bir sitede denenecek iç sayfa sayısını sınırlar — kurum sitesini
    gezmek amacımız değil, tek bir sayfayı bulmak. Bulunamazsa None döner ve çağıran
    LLM aramasına düşebilir.

    `butce_sn` TOPLAM iştir. İstek başına zaman aşımı tek başına yetmiyordu: 4 ölü aday
    alan + 4 yavaş iç sayfa ≈ 96 sn ediyor ve memur o kadar bekliyordu. Bütçe dolunca
    elde ne varsa onunla dönülür (ya da None).

    `follow_redirects=False` ZORUNLU: yönlendirmeyi `_getir` elle, her sıçramayı
    sınayarak izler. httpx'e bırakılırsa izinsiz ara adrese istek fiilen atılır.
    """
    bitis = time.monotonic() + max(0.5, butce_sn)
    with httpx.Client(
        follow_redirects=False, timeout=ZAMAN_ASIMI, headers=_BASLIK, verify=True
    ) as istemci:
        for alan in alan_adaylari:
            if time.monotonic() > bitis:
                log.info("sayfa_kesif.butce_doldu_aday_atlandi", kalan_aday=alan)
                break
            ana_sayfa = _getir(istemci, alan, bitis)
            if ana_sayfa is None:
                continue
            for _agirlik, url, ipucu in _aday_baglantilar(ana_sayfa, alan)[:azami_sayfa]:
                if time.monotonic() > bitis:
                    break
                govde = _getir(istemci, url, bitis)
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


__all__ = ("AZAMI_GOVDE", "AZAMI_YONLENDIRME", "IZINLI_SONEKLER", "TOPLAM_BUTCE_SN",
           "Bulgu", "birim_sayfasi_bul", "ic_ag_mi", "izinli_mi")
