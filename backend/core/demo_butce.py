"""Demo günlük para tavanı — gerçek token'larla ölçülen harcama muhasebesi.

NEDEN GEREKLİ: halka açık demoda tek belge ~15-20 LLM çağrısı yapar; taranmış PDF'de
buna SAYFA BAŞINA bulut vision OCR eklenir (multimodal/ocr.py sayfa döngüsü). Ana LLM
yolunda bugüne kadar HİÇBİR harcama muhasebesi yoktu — tek defter `kaynak_web_arama`'da
ve belge yolundan hiç çağrılmıyor.

İKİ KADEMELİ KORUMA:
  1. İSTEK SINIRINDA rezervasyon (`istek_ac`) — belge işlenmeye BAŞLAMADAN önce en kötü
     hâl kadar para deftere yazılır. Sonradan ücretlendirme fail-open'dır: 20 çağrılık
     bir fan-out, tek satır yazılmadan tavanı katlayabilir.
  2. ÇAĞRI BAŞINA mutabakat (`cagri_mutabakati`) — `LLMResponse.tokens_in/out` GERÇEK
     değerleriyle. İstek bitince tek delta satırı yazılır (`istek_kapat`).

`_ISTEK` NEDEN MUTABLE NESNE TUTAR (float değil): `asyncio.create_task` ve
`asyncio.to_thread` çağıran bağlamı KOPYALAR. ContextVar'da float tutulsaydı, LangGraph'ın
paralel dallarında (PARALEL_ANLAMA: sınıflandır ∥ çıkar; mevzuat_oner ∥ özetle) ve OCR'ın
thread havuzunda yapılan harcamalar kopyaya yazılır, ana sayaç onları hiç görmezdi —
tam da fan-out'un belgeyi pahalılaştırdığı yerde sessiz bir fail-open. Referans kopyalanınca
her dal AYNI sayacı günceller.

FİYATLAR TAHMİNDİR, FATURA DEĞİL. Sağlayıcı fiyat listesi değişir; buradaki değerler
bilinçli olarak YÜKSEK tutulmuştur (fazla saymak bütçeyi erken kapatır — güvenli yön) ve
`DEMO_FIYAT_<MODEL>` ile ezilebilir. Bilinmeyen model en pahalı bilinen fiyattan sayılır.
"""

from __future__ import annotations

import os
import threading
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from core.butce_defteri import ButceDefteri, DefterAyari

log = structlog.get_logger()

# (USD / 1M girdi token, USD / 1M çıktı token) — tahmini üst sınırlar, bkz. modül notu.
_FIYAT: dict[str, tuple[float, float]] = {
    "deepseek-v4-flash": (0.30, 1.20),
    "deepseek-v4-pro": (1.00, 4.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
}
# Bilinmeyen model → pahalı say. Yanlış tahminin bedeli erken kapanan demo;
# ucuz saymanın bedeli ödenen fatura. Asimetri pahalı yönde.
_VARSAYILAN_FIYAT = (5.00, 20.00)

# Bir çağrı bundan ucuz SAYILMAZ. usage=0 gelen (ya da hiç gelmeyen) çağrıya sıfır yazmak,
# defteri "hiç harcanmadı" durumunda tutar ve tavanı sonsuza kadar açık bırakır.
_ASGARI_CAGRI_USD = 0.0002
# Bir vision-OCR sayfası bundan ucuz sayılmaz (görüntü token'ları prompt_tokens'a girer).
_ASGARI_GORUNTU_USD = 0.002
# TTS 1000 karakter başı USD (tahmini üst sınır; gerçek liste değişir, yön güvenli).
_SES_USD_1K_KARAKTER = 0.030

def _defter_yolu() -> Path:
    """Harcama defterinin yolu. `DEMO_DEFTER_YOLU` ile EZİLEBİLİR.

    NEDEN ENV GEREKLİ (konteyner koşumunda ölçüldü): göreli hesap
    `parents[2]/data` yerel ağaçta `<depo>/data` verir, ama imajda backend içeriği
    doğrudan `/app`'e kopyalandığı için `/data`'ya düşer — orası yok ve app kullanıcısı
    yazamaz. Sonuç: ilk yazımda `Permission denied` → defter KALICI OLARAK kapanır →
    her ücretli istek 402 alır ve demo tamamen ölür. Sessiz değil gürültülü bir çöküştü,
    ama yine de yalnız gerçek konteyner koşumunda görülüyordu.
    """
    acik = os.getenv("DEMO_DEFTER_YOLU", "").strip()
    if acik:
        return Path(acik)
    return Path(__file__).resolve().parents[2] / "data" / "demo_harcama.json"


DEFTER = ButceDefteri(DefterAyari(
    ad="demo",
    dosya=_defter_yolu(),
    tavan_env="DEMO_AZAMI_GUNLUK_USD",
    gunluk=True,
))


class ButceTukendiError(RuntimeError):
    """Günlük tavan doldu — çağrı yapılmadan yükseltilir.

    `RuntimeError` alt sınıfı olması BİLİNÇLİ: `agents/nodes/_llm_extract.py`'nin
    fallback istisna kümesi zaten RuntimeError'ı yakalar, dolayısıyla uçuştaki belge
    deterministik yedekle TAMAMLANIR — memur 20 node'un 14'ünde 500 görmez.
    """


@dataclass(eq=False)
class IstekSayaci:
    """Tek isteğin para durumu. ContextVar bunun REFERANSINI taşır (bkz. modül notu).

    `eq=False` ZORUNLU: varsayılan dataclass alan-bazlı `__eq__` üretir ve bu `__hash__`'i
    None yapar → nesne `_CANLI` kümesine giremez. Kimlik-eşitliği zaten doğru semantiktir:
    aynı tutarları taşıyan iki AYRI istek aynı sayaç değildir.
    """

    rezerve: float
    harcanan: float = 0.0
    kisitlandi: bool = False
    _kilit: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def ekle(self, tutar: float) -> None:
        with self._kilit:
            self.harcanan += tutar

    def isaretle_kisitli(self) -> None:
        with self._kilit:
            self.kisitlandi = True


_ISTEK: ContextVar[IstekSayaci | None] = ContextVar("_demo_istek", default=None)

# UÇUŞTAKİ TÜM istekler. `_ISTEK` yalnız ÇAĞIRAN isteğin sayacını verir; bu küme diğer
# eşzamanlı isteklerin henüz deftere yazılmamış harcamasını da görünür kılar.
#
# NEDEN ZORUNLU (adversarial doğrulama, 8 Ağu 2026): yalnız kendi sayacına bakan bir kapı,
# N eşzamanlı isteğin her birine KALAN BÜTÇENİN TAMAMINI verir. Ölçülen en kötü hâl
# tavan 0,50 · rezervasyon 0,03 için N=9'da 2,34 USD — tavanın 4,7 katı. Küme ile her
# istek diğerlerinin aşımını da görür ve toplam tavanda durur.
_CANLI_KILIT = threading.Lock()
_CANLI: set[IstekSayaci] = set()


def _ucustaki_toplam() -> float:
    """Deftere HENÜZ yazılmamış toplam aşım (tüm canlı istekler)."""
    with _CANLI_KILIT:
        canlilar = tuple(_CANLI)
    return sum(max(0.0, s.harcanan - s.rezerve) for s in canlilar)


def demo_acik() -> bool:
    """DEMO_KORUMA açık mı? Tolerant parse (`RATE_LIMIT_ENABLED` ile aynı disiplin)."""
    return os.getenv("DEMO_KORUMA", "0").strip().lower() in ("1", "true", "yes", "on")


def azami_gunluk_usd() -> float:
    return DEFTER.azami_harcama()


def gunluk_harcanan() -> float:
    return DEFTER.harcanan()


def _fiyat(model: str) -> tuple[float, float]:
    """Model fiyatı. `DEMO_FIYAT_<MODEL>` = "girdi,cikti" ile ezilebilir."""
    ad = (model or "").strip().lower()
    ezme = os.getenv(f"DEMO_FIYAT_{ad.upper().replace('-', '_')}", "").strip()
    if ezme:
        try:
            g, c = (float(x) for x in ezme.split(","))
            return (max(0.0, g), max(0.0, c))
        except ValueError:
            log.error("demo.fiyat_ezmesi_okunamadi", model=ad, ham=ezme[:20])
    return _FIYAT.get(ad, _VARSAYILAN_FIYAT)


def cagri_maliyeti(model: str, girdi: int, cikti: int, *, asgari: float | None = None) -> float:
    """Token sayılarından USD. Asgari bedelin altına inmez."""
    g_fiyat, c_fiyat = _fiyat(model)
    tutar = (max(0, girdi) * g_fiyat + max(0, cikti) * c_fiyat) / 1_000_000.0
    return max(tutar, _ASGARI_CAGRI_USD if asgari is None else asgari)


def goruntu_maliyeti(model: str, girdi: int, cikti: int) -> float:
    """Bir vision-OCR sayfasının bedeli (asgari sayfa bedelinin altına inmez)."""
    return cagri_maliyeti(model, girdi, cikti, asgari=_ASGARI_GORUNTU_USD)


# ------------------------------------------------------------------ durum kapıları
def acik_mi() -> bool:
    """Katman genel durumu: demo açık, defter sağlam, günlük tavan aşılmamış."""
    if not demo_acik():
        return True          # koruma kapalıysa hiçbir şeyi engelleme
    return DEFTER.acik_mi()


def acik_mi_istek() -> bool:
    """Genel durum + UÇUŞTAKİ aşım.

    Uçuştaki terim olmadan tek bir belge, defterde hâlâ küçük rezervasyonu görünürken
    tavanın çok üstünü harcayabilirdi: rezervasyon 0,02 USD yazılıyken 20 çağrı toplam
    0,50 USD harcasa da `harcanan()` 0,02 gösterir. Fark (harcanan − rezerve) burada
    hesaba katılır.
    """
    if not demo_acik():
        return True
    # TÜM canlı isteklerin aşımı — yalnız kendi sayacına bakmak, N eşzamanlı isteğin
    # her birine kalan bütçenin tamamını verirdi (ölçüldü: 4,7× tavan).
    return DEFTER.harcanan() + _ucustaki_toplam() < DEFTER.azami_harcama()


def butce_kapisi(model: str = "") -> None:
    """Ağa çıkmadan ÖNCE çağrılır. Tavan doluysa `ButceTukendiError` yükseltir."""
    if acik_mi_istek():
        return
    sayaci = _ISTEK.get()
    if sayaci is not None:
        sayaci.isaretle_kisitli()
    log.error("demo.butce_tukendi", model=model or "?",
              harcanan=round(DEFTER.harcanan(), 4), tavan=DEFTER.azami_harcama())
    raise ButceTukendiError("Demo günlük bütçe tavanı doldu")


# ------------------------------------------------------------------ istek yaşam döngüsü
def rezervasyon_usd() -> float:
    """Belge başına önden düşülen tutar — EN KÖTÜ hâl için ölçeklenir.

    Varsayılan, 10 sayfalık taranmış PDF (sayfa başı vision) + imla düzeltme +
    ~20 pipeline çağrısı üst sınırına göre seçildi. CLAUDE.md'deki "$0,001-0,002/belge"
    METİN yolunun rakamıdır; taranmış yol bir mertebe pahalıdır.
    """
    try:
        return max(0.0, float(os.getenv("DEMO_BELGE_REZERVASYON_USD", "0.03")))
    except ValueError:
        return 0.03


def istek_ac(rezervasyon: float | None = None) -> IstekSayaci | None:
    """İstek için parayı ÖNDEN rezerve et. Bütçe yetmezse None."""
    tutar = rezervasyon_usd() if rezervasyon is None else rezervasyon
    if not DEFTER.rezerve_et(tutar):
        return None
    sayaci = IstekSayaci(rezerve=tutar)
    with _CANLI_KILIT:
        _CANLI.add(sayaci)
    return sayaci


def istek_baglami_kur(sayaci: IstekSayaci):
    """ContextVar token'ı döndürür — çağıran `_ISTEK.reset(token)` yapmalı."""
    return _ISTEK.set(sayaci)


def istek_baglami_coz(token) -> None:
    _ISTEK.reset(token)


def cagri_mutabakati(model: str, girdi: int, cikti: int) -> None:
    """Bir LLM çağrısının GERÇEK bedelini işle.

    İstek bağlamı varsa sayaca eklenir (tek delta satırı istek sonunda yazılır — 20 çağrı
    × fsync hem ağır olur hem pipeline'ı tek dosya kilidinden geçirirdi). Bağlam yoksa
    (arka plan görevi, eval, auth'lu /sohbet) satır HEMEN yazılır: harcama asla düşmez.
    """
    if not demo_acik():
        return
    tutar = cagri_maliyeti(model, girdi, cikti)
    sayaci = _ISTEK.get()
    if sayaci is None:
        DEFTER.deftere_ekle(tutar)
        return
    sayaci.ekle(tutar)


def goruntu_mutabakati(model: str, girdi: int, cikti: int) -> None:
    """Bir vision-OCR sayfasının bedelini işle."""
    if not demo_acik():
        return
    tutar = goruntu_maliyeti(model, girdi, cikti)
    sayaci = _ISTEK.get()
    if sayaci is None:
        DEFTER.deftere_ekle(tutar)
        return
    sayaci.ekle(tutar)


def ses_mutabakati(model: str, karakter: int) -> None:
    """TTS harcaması — KARAKTER üzerinden (TTS token değil karakter ile faturalanır)."""
    if not demo_acik():
        return
    tutar = max(_ASGARI_CAGRI_USD, max(0, karakter) * _SES_USD_1K_KARAKTER / 1000.0)
    sayaci = _ISTEK.get()
    if sayaci is None:
        DEFTER.deftere_ekle(tutar)
        return
    sayaci.ekle(tutar)


def istek_kapat(sayaci: IstekSayaci) -> None:
    """İstek bitti — gerçek harcama ile rezervasyon arasındaki farkı TEK satır yaz.

    Fark negatif olabilir (belge tahminden ucuz geldi); defter bir TOPLAMDIR, negatif
    satır meşrudur. Rezervasyon hata/timeout hâlinde GERİ ALINMAZ — geri alma, çöken bir
    isteğin bütçeyi yeniden açmasının ta kendisidir.
    """
    try:
        fark = round(sayaci.harcanan - sayaci.rezerve, 6)
        if fark:
            DEFTER.deftere_ekle(fark)
    finally:
        # Kümeden ÇIKARMA garanti: sızan bir sayaç, tavanı kalıcı olarak olduğundan
        # dolu gösterir ve demoyu süreç ömrü boyunca kapatırdı.
        with _CANLI_KILIT:
            _CANLI.discard(sayaci)


async def kalici_tohumla() -> None:
    """Açılışta: kalıcı katmandan bugünkü toplamı oku, dosya defterinin tabanına yaz.

    Render ücretsiz katmanında dosya sistemi yeniden başlatmada silinir; bu çağrı olmadan
    tavan konteyner ömrü başına sıfırlanırdı.
    """
    if not demo_acik():
        return
    from core.demo_harcama_kalici import gunluk_oku
    from core.gun_indeksi import bugun_indeksi

    gun = bugun_indeksi()
    toplam = await gunluk_oku(gun)
    if toplam is None:
        return                      # DB yok → dosya defteri tek başına devam (fail-open)
    DEFTER.tabani_tohumla(gun, toplam)
    log.info("demo.kalici_tohumlandi", gun=gun, toplam_usd=round(toplam, 6))


async def kalici_senkronize() -> None:
    """İstek sonunda: günün toplamını kalıcı katmana yaz (belge başına BİR yazım)."""
    if not demo_acik():
        return
    from core.demo_harcama_kalici import gunluk_yaz
    from core.gun_indeksi import bugun_indeksi

    await gunluk_yaz(bugun_indeksi(), DEFTER.harcanan())


def sifirla_test_icin() -> None:
    DEFTER.sifirla_test_icin()
    _ISTEK.set(None)
    with _CANLI_KILIT:
        _CANLI.clear()


__all__ = (
    "DEFTER",
    "ButceTukendiError",
    "IstekSayaci",
    "acik_mi",
    "acik_mi_istek",
    "azami_gunluk_usd",
    "butce_kapisi",
    "cagri_maliyeti",
    "cagri_mutabakati",
    "demo_acik",
    "goruntu_maliyeti",
    "goruntu_mutabakati",
    "gunluk_harcanan",
    "istek_ac",
    "istek_baglami_coz",
    "istek_baglami_kur",
    "istek_kapat",
    "rezervasyon_usd",
    "sifirla_test_icin",
)
