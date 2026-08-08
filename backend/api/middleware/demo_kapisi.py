"""Demo kapısı — halka açık demoda para ve kota koruması (saf ASGI middleware).

NEDEN `BaseHTTPMiddleware` DEĞİL (bu tercih işlevsel, üslup değil):
`BaseHTTPMiddleware`'de `call_next` yanıt BAŞLIKLARI hazır olur olmaz döner; oysa
`/process_doc/stream` bir SSE akışıdır ve gövdesi ondan SONRA akar. `finally` bloğu tek
LLM çağrısı koşmadan ateşlenir, mutabakat sıfır delta yazar ve pipeline 0,30 USD harcarken
defter rezervasyonu görmeye devam ederdi. Saf ASGI'de `await self.app(scope, receive, send)`
akış bitene kadar DÖNMEZ; ayrıca istemci bağlantıyı koparınca `CancelledError` yolunda da
`finally` çalışır.

MIDDLEWARE SIRASI (main.py'de bu kapı SecurityHeaders'tan ÖNCE eklenir):
Starlette `add_middleware`'i 0. indekse sokar ve yığını `reversed()` kurar → ilk eklenen
EN İÇTE kalır. Sonuç: kapı, `MaxBodySizeMiddleware`'in 413'ünden SONRA koşar (büyük gövde
kota yakmaz) ve `SecurityHeadersMiddleware`'in İÇİNDE kalır (402/429 gövdesi de
nosniff/CSP başlıklarını taşır).

SIRA İÇİNDEKİ MANTIK ve gerekçeleri:
  1. koruma kapalı            → geç        (bayrak yokken davranış birebir bugünkü)
  2. yol ücretli değil        → geç
  3. bütçe kapalı             → 402        KOTA YAKILMADAN (402 bir hakkı harcamamalı)
  4. kota dolu                → 429        PARA AYRILMADAN
  5. rezervasyon başarısız    → 402
  6. bağlamı kur, uygulamayı çağır, `finally`de tek delta satırı yaz
"""

from __future__ import annotations

import contextlib
import json
from typing import Any

import structlog

from api.demo_kimlik import cerez_basligi, ziyaretci_kimligi
from core import demo_butce, demo_kota

log = structlog.get_logger()

# LLM/bulut-OCR harcayan, kimlik istemeyen uçlar. Hepsi LİTERAL yol (path parametresi yok).
UCRETLI_YOLLAR: frozenset[str] = frozenset({
    "/process_doc",              # tam pipeline
    "/process_doc/resume",       # HITL devamı — her tekrar yeni para harcar
    "/process_doc/stream",       # tam pipeline (SSE)
    "/multimodal/ocr",           # bulut vision OCR (sayfa başına ücret)
    "/yazi/taslak",              # tam pipeline
    "/yazi/taslak-turu",         # LLM
    "/yazi/dogrula",             # LLM
    "/yazi/kurul",               # LLM (kurul müzakeresi)
    "/yazi/kurul/akis",          # LLM (çift tur)
    "/yazi/eyp",                 # taslak_md yoksa TAM pipeline koşar
})

# Ücretsiz ya da auth'lu uçlar — `tests/test_demo_kapsam.py` bu iki kümenin TÜM POST
# yollarını kapsadığını doğrular; sınıflandırılmamış yeni uç CI'ı kırar.
SERBEST_YOLLAR: frozenset[str] = frozenset({
    "/yazi/render",                                   # deterministik render, LLM yok
    "/yazi/dayanak",                                  # deterministik, LLM yok
    "/sla/onizleme",                                  # saf aritmetik
    "/mobil/oturum",                                  # LLM yok; kendi MAX_AKTIF_OTURUM tavanı
    "/mobil/{oturum_id}/yukle",                       # LLM yok; dosya /process_doc'a gider
    "/sohbet", "/sohbet/stream", "/sohbet/seslendir",  # hepsi CurrentUser (auth'lu)
    "/sohbet/veri", "/sohbet/realtime/anahtar",
    "/islem/{islem_id}/onayla",                       # auth'lu
    "/islem/{islem_id}/alt-talep/{sira}/onayla",      # auth'lu
    "/auth/kayit", "/auth/giris", "/auth/yenile", "/auth/cikis",
})


def ucretli_mi(yol: str, metot: str) -> bool:
    """Bu istek para harcayabilir mi? (yalnız POST + ücretli liste)."""
    if metot.upper() != "POST":
        return False
    return yol.rstrip("/") in UCRETLI_YOLLAR or yol in UCRETLI_YOLLAR


def _https_mi(scope: dict[str, Any]) -> bool:
    if scope.get("scheme") in ("https", "wss"):
        return True
    for ad, deger in scope.get("headers") or []:
        if ad == b"x-forwarded-proto" and deger.decode("latin-1").strip().lower() == "https":
            return True
    return False


async def _yanit_gonder(send: Any, kod: int, mesaj: str, ek: list[tuple[bytes, bytes]]) -> None:
    """Elle JSON yanıt — gövde şekli `{"detail": ...}` (depo sözleşmesi)."""
    govde = json.dumps({"detail": mesaj}, ensure_ascii=False).encode("utf-8")
    basliklar = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(govde)).encode("latin-1")),
        *ek,
    ]
    await send({"type": "http.response.start", "status": kod, "headers": basliklar})
    await send({"type": "http.response.body", "body": govde})


class DemoKapisiMiddleware:
    """Saf ASGI demo koruma kapısı."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or not demo_butce.demo_acik():
            await self.app(scope, receive, send)
            return

        yol = scope.get("path", "")
        metot = scope.get("method", "GET")
        kimlik = ziyaretci_kimligi(scope)
        cerez_ek: list[tuple[bytes, bytes]] = []
        if kimlik.taze_cerez:
            cerez_ek.append(
                (b"set-cookie", cerez_basligi(kimlik.taze_cerez, https=_https_mi(scope))),
            )

        if not ucretli_mi(yol, metot):
            await self._cerezli_gecir(scope, receive, send, cerez_ek)
            return

        # 3) Para kapısı ÖNCE — 402 bir belge hakkını harcamamalı.
        if not demo_butce.acik_mi():
            log.warning("demo.402_butce", yol=yol)
            await _yanit_gonder(
                send, 402,
                "Demo günlük bütçesi doldu. Yarın tekrar deneyebilirsiniz.", cerez_ek)
            return

        # 4) Kota — para AYRILMADAN.
        sonuc = demo_kota.kota_dus(kimlik.anahtar, kimlik.ag_anahtari)
        if not sonuc.izin:
            log.info("demo.429_kota", yol=yol, sebep=sonuc.sebep)
            mesaj = (
                "Günlük demo hakkınız doldu (bugün için 3 belge). Yarın yenilenir."
                if sonuc.sebep == "ziyaretci" else
                "Bu ağdan bugünkü demo hakkı doldu. Yarın yenilenir."
            )
            await _yanit_gonder(
                send, 429, mesaj,
                [*cerez_ek, (b"retry-after", b"3600")])
            return

        # 5) Rezervasyon — belge işlenmeye başlamadan en kötü hâl kadar para düşülür.
        sayaci = demo_butce.istek_ac()
        if sayaci is None:
            log.warning("demo.402_rezervasyon", yol=yol)
            await _yanit_gonder(
                send, 402,
                "Demo günlük bütçesi doldu. Yarın tekrar deneyebilirsiniz.", cerez_ek)
            return

        # 6) Bağlamı kur → uygulama → tek delta satırı.
        token = demo_butce.istek_baglami_kur(sayaci)
        try:
            await self._cerezli_gecir(scope, receive, send, cerez_ek)
        finally:
            demo_butce.istek_baglami_coz(token)
            demo_butce.istek_kapat(sayaci)
            # Kalıcı katmana TEK yazım (belge başına). Başarısızlığı isteği düşürmez —
            # koruma dosya defterinde zaten uygulandı, bu yalnız restart dayanıklılığı.
            with contextlib.suppress(Exception):
                await demo_butce.kalici_senkronize()
            log.info("demo.istek_bitti", yol=yol,
                     harcanan=round(sayaci.harcanan, 6),
                     rezerve=sayaci.rezerve, kisitlandi=sayaci.kisitlandi)

    async def _cerezli_gecir(self, scope: Any, receive: Any, send: Any,
                             cerez_ek: list[tuple[bytes, bytes]]) -> None:
        """Uygulamayı çağır; taze çerez varsa yanıt başlıklarına ekle."""
        if not cerez_ek:
            await self.app(scope, receive, send)
            return

        async def sarmal(mesaj: dict[str, Any]) -> None:
            if mesaj.get("type") == "http.response.start":
                mesaj = {**mesaj, "headers": [*(mesaj.get("headers") or []), *cerez_ek]}
            await send(mesaj)

        await self.app(scope, receive, sarmal)


__all__ = ("SERBEST_YOLLAR", "UCRETLI_YOLLAR", "DemoKapisiMiddleware", "ucretli_mi")
