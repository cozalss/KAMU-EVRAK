"""Doğrulanmamış kuruma evrak gelince canlı kaynak bulur — katmanları birleştiren yer.

AKIŞ (ucuzdan pahalıya, ilk tutan kazanır):
    0. ÖNBELLEK      — bu kurum daha önce bulunduysa hiç dışarı çıkma      [0 sn, 0 $]
    1. ALAN KALIBI   — sicil türünden adres türet (kurumların %69,8'i)     [~1 sn, 0 $]
    2. SAYFA KEŞFİ   — o sitede "birimler/teşkilat" sayfasını bul          [~1 sn, 0 $]
    3. WEB ARAMASI   — 1-2 tutmazsa; resmî alanlara kilitli, bütçe tavanlı [~8 sn, ~$0,002]
    4. KİMLİK KAPISI — sayfa GERÇEKTEN bu kuruma mı ait? değilse REDDET    [0 sn, 0 $]
    5. BİRİM ÇIKARIM — sayfadan unvan ekiyle biten adları topla            [0 sn, 0 $]

KİMLİK KAPISI NEDEN ZORUNLU: alan adı kalıptan türetildiği için kısaltma çakışması
mümkün. Ölçümde `ttk` (Türkiye Taşkömürü Kurumu) için ttk.gov.tr açıldı — o adres
**Türk Tarih Kurumu**na ait. Kapı olmasaydı yanlış kurumun birimleri, resmî görünümlü
bir linkle önerilecekti. Kapı `kurum_kimligi.kurum_sayfasi_mi`dir ve gerçek sayfalarda
ölçülmüştür: 29 kurum, 0 yanlış-pozitif, 0 etkin yanlış-negatif.

NEDEN ÇIKARIMDA LLM YOK: birimler zaten SAYFADAN geliyor, yani "kaynakta birebir geçme"
şartı yapısı gereği sağlanıyor. Ölçüldü (2026-08-06): mevcut regex çıkarıcı Kayseri
Valiliğinden 26, Selçuklu Belediyesinden 37 gerçek birim adı çıkardı. LLM eklemek maliyet
ve gecikme getirir, doğruluk getirmez — konuyla eşleştirmeyi zaten BM25 yapıyor.

SONUÇ KORPUSA YAZILMAZ. Dönen şey memura gösterilecek bir ÖNERİ + KAYNAK LİNKİdir.
"Doğrulanmış" damgası manifest + SHA-256 + insan incelemesi gerektirir; canlı bulunan
sayfa bunlardan geçmemiştir. Ayrım UI'da da korunmalı (sarı, yeşil değil).

GÖZLENEN SINIR: valilik sitelerinin "hizmet birimleri" sayfası valiliğin KENDİ birimlerini
değil ildeki AYRI KURUMLARI listeliyor (İl Emniyet Müdürlüğü vb.). Bu yüzden öneri her
zaman memur onayına gider; otomatik havale bu yoldan ASLA yapılmaz.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import contextlib
import functools
import json
import os
import re
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import structlog

from core.kurum_alan import aday_alanlar
from core.kurum_kimligi import kurum_sayfasi_mi
from core.sayfa_kesif import birim_sayfasi_bul, izinli_mi

log = structlog.get_logger()

_ONBELLEK_DOSYASI = Path(__file__).resolve().parents[2] / "data" / "canli_kaynak_onbellek.json"
# Kurum siteleri sık değişmez; bir ay sonra yeniden bakmak makul bir denge.
ONBELLEK_OMRU_SN = 30 * 24 * 3600
AZAMI_BIRIM = 60
# ÇIKARIM SÜRÜMÜ — birim adlarının nasıl çıkarıldığı değişince ARTIRILIR.
# Önbellek 30 gün yaşadığı için, çıkarıcı düzeltilse bile eski KAYITLAR eski (gürültülü)
# adları taşımaya devam ediyordu; ölçüldü: `_adayi_kirp` eklendikten sonra bile önbellekte
# "Bakanlığı tarafindan personele yönelik … Müdürlüğü" gibi cümle artıkları duruyordu ve
# konu eşleşmesinde gerçek birimlerin önüne geçebiliyordu. Sürüm uyuşmayan kayıt YOK sayılır.
CIKARIM_SURUMU = 2
# Önbellek oku-değiştir-yaz kritik bölgesi. Kilitsizken iki eşzamanlı yazım (SSE akışı +
# ikinci istek) SABİT ".tmp" adında buluşuyor ve tüm önbelleği bozabiliyordu; bozuk JSON
# sessizce {} okunduğu için yüzlerce kurumun kaydı log basmadan yok oluyordu.
_ONBELLEK_KILIDI = threading.Lock()

# Birim adı unvanları — doğrulayıcıyla AYNI tanım kullanılmalı, yoksa bir araç "birim"
# derken diğeri demez. Tek kaynak: teskilat_kaynak_dogrula._SON_EKLER.
_SON_EKLER = (
    "Dairesi Başkanlığı", "Daire Başkanlığı", "Kurulu Başkanlığı", "Birimi Başkanlığı",
    "Şube Müdürlüğü", "Müdürlüğü", "Müşavirliği", "Başkanlığı", "Koordinatörlüğü",
    "Uzmanlığı", "Birimi",
)
_ADAY_RE = re.compile(
    r"[A-ZÇĞİÖŞÜ0-9][^<>\n\r\t|•]{2,75}?(?:" + "|".join(map(re.escape, _SON_EKLER)) + ")"
)

# ---- Aday temizleme -------------------------------------------------------------------
# Regex, unvan ekinden ÖNCEKİ her şeyi yutabiliyor: "Vatandaşlarımız gürültü şikayetlerini
# Zabıta Müdürlüğü" tek bir "birim adı" olarak çıkıyordu — hem ad çöp, hem `en_uygun_birim`
# yanlış birimi seçiyordu (ölçüldü). Aday SAĞDAN SOLA, yalnız birim adı grameri kadar
# kırpılır: büyük harfle başlayan sözcükler + "ve/ile" bağlaçları.
_BAGLAC = frozenset({"ve", "ile", "ila"})
# Menü/gezinme sözcükleri birim adının parçası olamaz — sınır sayılır.
_GEZINME = frozenset({
    "anasayfa", "ana", "sayfa", "iletişim", "iletisim", "duyurular", "haberler",
    "kurumsal", "başkan", "baskan", "meclis", "yönetim", "yonetim", "hakkımızda",
    "hakkimizda", "belgelerimiz", "galeri", "menü", "menu", "arama", "giriş", "giris",
})
# Ölçülen en uzun gerçek birim adı 6 sözcük ("İklim Değişikliği ve Sıfır Atık Müdürlüğü").
AZAMI_SOZCUK = 6


def _adayi_kirp(ham: str) -> str:
    """Aday adı, birim adı gramerine uyan EN SAĞDAKİ parçaya indir. Uymazsa boş."""
    tutulan: list[str] = []
    for sozcuk in reversed(ham.split()):
        # ÜÇ AYRI BİÇİM, üçü de gerekli:
        #  · `sinav`   — noktalamasız ama BÜYÜK/KÜÇÜK korunmuş; harf sınavı bunda yapılır.
        #    Ham sözcüğe bakmak yanlıştı: bitişik "(" ilk karakter olunca `isupper()` False
        #    döner ve döngü erken kırılırdı ("(Fen İşleri) Müdürlüğü" → "İşleri) Müdürlüğü").
        #    Küçültülmüş biçime bakmak da yanlış olurdu — o zaman hiçbir sözcük geçmez.
        #  · `yalin`   — küçük harfli; gezinme/bağlaç sözlükleriyle karşılaştırma için.
        #  · `gorunen` — çıktıya giren biçim. Parantez/tırnak atılır ama VİRGÜL KORUNUR:
        #    virgül gerçek birim adlarının parçasıdır ("Kültür, Sanat ve Sosyal İşler Md.").
        sinav = sozcuk.strip("().,:;\"'")
        yalin = sinav.lower()
        gorunen = sozcuk.strip("()\"'")
        if yalin in _GEZINME:
            break
        if yalin in _BAGLAC:
            # Bağlaç yalnız ORTADA olabilir; adın başında duramaz.
            if not tutulan:
                break
            tutulan.append(gorunen)
            continue
        if not sinav[:1].isupper() and not sinav[:1].isdigit():
            break
        tutulan.append(gorunen)
        if len(tutulan) >= AZAMI_SOZCUK:
            break
    return " ".join(reversed(tutulan)).strip("().,:;\"'")


@dataclass(frozen=True)
class CanliKaynak:
    """Canlı bulunan kaynak. DOĞRULANMIŞ DEĞİLDİR — memur onayına gider."""

    kurum_slug: str
    url: str
    birimler: tuple[str, ...]
    yol: str            # hangi katman buldu: "onbellek" | "kalip" | "web_arama"
    bulundu_ts: float

    def kunye(self) -> dict[str, Any]:
        """UI'ya gidecek künye. `dogrulanmis` alanı BİLEREK sabit False."""
        return {
            "url": self.url,
            "birim_sayisi": len(self.birimler),
            "yol": self.yol,
            "dogrulanmis": False,
            "uyari": "Bu kaynak canlı bulundu; insan incelemesinden GEÇMEDİ.",
        }


def _onbellek_yukle() -> dict[str, Any]:
    try:
        veri = json.loads(_ONBELLEK_DOSYASI.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except OSError as exc:
        log.warning("canli_kaynak.onbellek_okunamadi", hata=str(exc))
        return {}
    except ValueError:
        # Sessiz veri kaybı kabul edilemez: burada {} dönmek "önbellek boş" gibi görünür
        # ve yüzlerce kurum yeniden ağa çıkar; sebebi kimse bilmez.
        log.warning("canli_kaynak.onbellek_bozuk_sifirlandi")
        return {}
    return veri if isinstance(veri, dict) else {}


def _onbellek_yaz(veri: dict[str, Any]) -> None:
    """Atomik yaz. Geçici ad SÜREÇ+ÇAĞRI BENZERSİZ olmalı — sabit ".tmp" adında iki
    eşzamanlı yazıcı buluşup birbirinin dosyasını bozuyordu."""
    gecici = _ONBELLEK_DOSYASI.with_suffix(f".{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        _ONBELLEK_DOSYASI.parent.mkdir(parents=True, exist_ok=True)
        gecici.write_text(json.dumps(veri, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8", newline="\n")
        gecici.replace(_ONBELLEK_DOSYASI)
    except OSError as exc:
        log.warning("canli_kaynak.onbellek_yazilamadi", hata=str(exc))
        with contextlib.suppress(OSError):
            gecici.unlink(missing_ok=True)      # yarım kalan artığı bırakma


def birimleri_cikar(metin: str) -> tuple[str, ...]:
    """Sayfa metninden unvan ekiyle biten aday birim adları (sıra korunur, tekil).

    Her aday `_adayi_kirp` ile cümle/menü gürültüsünden arındırılır; unvan ekinin kendisi
    tek başına kalırsa ("Müdürlüğü") atılır — bilgi taşımaz.
    """
    bulunan: list[str] = []
    for m in _ADAY_RE.finditer(metin):
        temiz = _adayi_kirp(re.sub(r"\s+", " ", m.group(0)).strip())
        if temiz and temiz not in _SON_EKLER and len(temiz.split()) >= 2:
            bulunan.append(temiz)
    return tuple(dict.fromkeys(bulunan))[:AZAMI_BIRIM]


def onbellekten(kurum_slug: str) -> CanliKaynak | None:
    kayit = _onbellek_yukle().get(kurum_slug)
    if not isinstance(kayit, dict):
        return None
    if int(kayit.get("surum") or 1) != CIKARIM_SURUMU:
        # Çıkarıcı değişti; bu kaydın birim adları eski mantıkla üretilmiş — güvenilmez.
        log.info("canli_kaynak.onbellek_surumu_eski", kurum=kurum_slug)
        return None
    if time.time() - float(kayit.get("bulundu_ts") or 0) > ONBELLEK_OMRU_SN:
        return None
    if not izinli_mi(str(kayit.get("url") or "")):
        return None      # önbellek dosyası elle bozulmuş olabilir; adres yine sınanır
    return CanliKaynak(
        kurum_slug=kurum_slug, url=str(kayit["url"]),
        birimler=tuple(kayit.get("birimler") or ()), yol="onbellek",
        bulundu_ts=float(kayit["bulundu_ts"]),
    )


def _onbellege_koy(kaynak: CanliKaynak) -> None:
    kayit = asdict(kaynak)
    kayit["birimler"] = list(kaynak.birimler)
    kayit["surum"] = CIKARIM_SURUMU
    kayit.pop("kurum_slug", None)
    # Oku-değiştir-yaz TEK kritik bölge: kilitsizken iki yazıcıdan birinin kaydı kayboluyordu.
    with _ONBELLEK_KILIDI:
        veri = _onbellek_yukle()
        veri[kaynak.kurum_slug] = kayit
        _onbellek_yaz(veri)


def canli_kaynak_bul(
    kayit: dict[str, Any], *, web_aramasi: bool = True
) -> CanliKaynak | None:
    """Kurum sicil kaydından canlı kaynak bul. Bulamazsa None.

    `web_aramasi=False` ile ücretli katman tamamen devre dışı bırakılabilir (test ve
    çevrimdışı çalışma). Ücretli katman ayrıca kendi bütçe tavanıyla da korunur.
    """
    slug = str(kayit.get("slug") or "")
    if not slug:
        return None

    onbellek = onbellekten(slug)
    if onbellek is not None:
        log.info("canli_kaynak.onbellekten", kurum=slug, url=onbellek.url)
        return onbellek

    # 1-2. katman: kalıptan adres + site içi sayfa keşfi (ücretsiz)
    bulgu = birim_sayfasi_bul(aday_alanlar(kayit))
    yol = "kalip"

    # 3. katman: yalnız ücretsiz yol tutmazsa (ücretli)
    if bulgu is None and web_aramasi:
        from core.kaynak_web_arama import kaynak_sayfasi_ara
        sonuc = kaynak_sayfasi_ara(str(kayit.get("ad") or slug))
        if sonuc is not None:
            bulgu = birim_sayfasi_bul([sonuc.url], azami_sayfa=2)
            yol = "web_arama"

    if bulgu is None:
        log.info("canli_kaynak.bulunamadi", kurum=slug)
        return None

    # KİMLİK KAPISI — sayfa gerçekten bu kuruma mı ait? Alan adı kalıptan türetiliyor ve
    # kısaltmalar ÇAKIŞABİLİYOR: ölçümde `ttk` (Türkiye Taşkömürü Kurumu) için açılan
    # ttk.gov.tr, Türk Tarih Kurumu'na aitti. Kapı olmasaydı taşkömürü evrakına tarih
    # kurumunun birimleri, üstelik resmî görünümlü bir linkle önerilecekti.
    # Yanlış kuruma GÜVENLE yönlendirmek, hiç öneri vermemekten kötüdür (INV-6 mantığı).
    ad = str(kayit.get("ad") or "")
    if not kurum_sayfasi_mi(ad, bulgu.metin):
        log.warning("canli_kaynak.kurum_kimligi_tutmadi", kurum=slug, url=bulgu.url)
        return None

    birimler = birimleri_cikar(bulgu.metin)
    if not birimler:
        # Sayfa açıldı ama birim adı çıkmadı — link göstermenin memura faydası yok.
        log.info("canli_kaynak.birim_cikmadi", kurum=slug, url=bulgu.url)
        return None

    kaynak = CanliKaynak(kurum_slug=slug, url=bulgu.url, birimler=birimler,
                         yol=yol, bulundu_ts=time.time())
    _onbellege_koy(kaynak)
    log.info("canli_kaynak.bulundu", kurum=slug, url=bulgu.url,
             birim=len(birimler), yol=yol)
    return kaynak


_TOKEN_RE = re.compile(r"[0-9a-zçğıöşü]+")
# Evrak zarfı sözcükleri ayırt edici değildir; birim seçiminde sayılmaz.
_ZAYIF = frozenset({
    "ve", "ile", "için", "hakkında", "konulu", "talep", "talebi", "başvuru", "başvurusu",
    "şikayet", "şikâyet", "ihbar", "dilekçe", "evrak", "yazı", "konu", "sayın",
    "müdürlüğü", "başkanlığı", "birimi", "daire", "dairesi", "şube", "genel",
})


def _tokenlar(s: str) -> set[str]:
    from core.text import tr_lower
    return {t for t in _TOKEN_RE.findall(tr_lower(s)) if len(t) >= 3 and t not in _ZAYIF}


def en_uygun_birim(birimler: tuple[str, ...], konu: str) -> str:
    """Konuya en çok token'ı örtüşen birim adı. Örtüşme yoksa boş.

    Kasten BASİT: bu bir ÖNERİdir ve memur onayına gider. Karmaşık bir skorlayıcı,
    doğrulanmamış bir kaynağın üzerine sahte bir kesinlik katmanı eklerdi.
    """
    kt = _tokenlar(konu)
    if not kt or not birimler:
        return ""
    en_iyi, en_skor = "", 0
    for ad in birimler:
        skor = len(kt & _tokenlar(ad))
        if skor > en_skor:
            en_iyi, en_skor = ad, skor
    return en_iyi


def kurum_icin_oneri(
    kurum_slug: str, konu: str, *, web_aramasi: bool = False
) -> dict[str, Any] | None:
    """Doğrulanmamış kurum için canlı kaynak + konuya uygun birim önerisi.

    `web_aramasi` RUNTIME'DA VARSAYILAN KAPALI: ücretsiz katmanlar ~1,2 sn sürerken
    web araması ~8 sn sürüyor ve memuru ekranda bekletmek kabul edilemez. Ücretli
    katman toplu zenginleştirmede (çevrimdışı) açılır.

    Dönen künye HER ZAMAN `dogrulanmis=False` taşır. Bu sözleşme kırılırsa
    doğrulanmamış bir kaynak doğrulanmış görünür — deponun en temel kuralı budur.
    """
    from core.sicil import sicil_cozumle

    kayit = sicil_cozumle(kurum_slug)
    if not kayit:
        return None
    kaynak = canli_kaynak_bul(dict(kayit), web_aramasi=web_aramasi)
    if kaynak is None:
        return None
    kunye = kaynak.kunye()
    kunye["kurum_slug"] = kaynak.kurum_slug
    kunye["birim_oneri"] = en_uygun_birim(kaynak.birimler, konu)
    kunye["birim_ornekleri"] = list(kaynak.birimler[:8])
    return kunye


"""Aşağıdaki asenkron sarmalayıcı, keşfin evrak akışını ASMASINI engeller.

İki ayrı koruma, ikisi de gerekli:
  · AYRILMIŞ HAVUZ — `asyncio.to_thread` paylaşımlı varsayılan executor'ı kullanır.
    Zaman aşımı yalnız AWAIT'i iptal eder; Python'da çalışan thread durdurulamaz, alttaki
    httpx çağrısı worker'ı bırakmaz. Paylaşımlı havuzda birkaç yavaş kurum sitesi giriş
    (argon2), mevzuat önerisi ve mobil QR dâhil tüm `to_thread` çağrılarını açlığa
    düşürüyordu. Depo aynı hatayı OCR'da bir kez yaşamış ve `multimodal/ocr.py`de bu
    deseni kurmuştu; burada tekrarlanıyor. Thread sızıntısını bitirmez, YAYILMA ALANINI
    keşifle sınırlar.
  · TOPLAM ZAMAN AŞIMI — `sayfa_kesif` kendi bütçesini uygular ama modül dışı bir asılma
    (DNS, TLS el sıkışması) yine mümkün; dış sınır memuru ekranda tutmamayı garanti eder.
"""

_KESIF_MAX_WORKERS = int(os.getenv("KESIF_MAX_WORKERS", "2"))
_kesif_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=_KESIF_MAX_WORKERS, thread_name_prefix="kesif-worker")
# sayfa_kesif.TOPLAM_BUTCE_SN (6 sn) + el sıkışma payı.
KESIF_TOPLAM_SN = float(os.getenv("KESIF_TOPLAM_SN", "8"))


async def kurum_icin_oneri_async(
    kurum_slug: str, konu: str, *, web_aramasi: bool = False
) -> dict[str, Any] | None:
    """`kurum_icin_oneri`nin evrak akışında kullanılacak güvenli biçimi.

    Hata VE zaman aşımı yutulur: canlı keşif bir EK'tir, evrak işlemenin şartı değildir.
    """
    dongu = asyncio.get_running_loop()
    is_ = dongu.run_in_executor(
        _kesif_executor,
        functools.partial(kurum_icin_oneri, kurum_slug, konu, web_aramasi=web_aramasi),
    )
    try:
        return await asyncio.wait_for(is_, timeout=KESIF_TOPLAM_SN)
    except TimeoutError:
        log.warning("canli_kaynak.zaman_asimi", kurum=kurum_slug, sinir=KESIF_TOPLAM_SN)
        return None
    except Exception as exc:
        log.warning("canli_kaynak.hata", kurum=kurum_slug, hata=type(exc).__name__)
        return None


__all__ = ("AZAMI_BIRIM", "KESIF_TOPLAM_SN", "CanliKaynak", "birimleri_cikar",
           "canli_kaynak_bul", "en_uygun_birim", "kurum_icin_oneri",
           "kurum_icin_oneri_async", "onbellekten")
