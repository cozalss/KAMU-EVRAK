"""Güvenlik başlıkları middleware'i — her yanıta savunma başlıkları ekler.

Kamu-veri sistemi → tarayıcı tabanlı saldırı yüzeyini (clickjacking, MIME-sniffing,
referrer sızıntısı) daraltır. Hafif `BaseHTTPMiddleware` (FastAPI/Starlette deseni);
ek bağımlılık yok. CSP PATH-BAZLI: API JSON döndürdüğü için varsayılan SIKI (script/style
YOK); yalnız gerçekten inline script/style render eden iki yüzey (Swagger UI + /mobil
telefon sayfası) gevşek CSP alır — 'unsafe-inline' artık tüm yanıtlara sızmıyor (ECC MEDIUM).
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Varsayılan CSP — TEK SERVİS dağıtımında aynı origin hem API'yi hem FRONTEND'i sunar.
#
# CANLI DAĞITIMDA ÖLÇÜLEN HATA (9 Ağu 2026): burası eskiden `script-src 'none';
# style-src 'none'; font-src 'none'` idi ve doğruydu — uygulama YALNIZ JSON döndürüyordu.
# Frontend backend'den sunulmaya başlayınca aynı başlık ana sayfaya da uygulandı ve
# tarayıcı bütün script/stil dosyalarını engelledi: site BEYAZ EKRAN açıldı. HTTP 200,
# varlıklar 200, hiçbir sunucu hatası yok — tamamen tarayıcı tarafında sessiz ölüm.
# Yalnız gerçek dağıtımda görülebilirdi.
#
# İzin verilenler ÖLÇÜLEREK belirlendi (dist taraması), tahminle değil:
#   · Google Fonts   → app.html/index.html <link> ile stil + font çekiyor
#   · 'unsafe-inline' (STYLE) → ZORUNLU: tüm tasarım sistemi satır-içi stil kullanıyor
#     (`style={{...}}`). Nonce'a geçmeden kaldırılamaz. SCRIPT'te YOK — asıl risk orada.
#   · worker-src blob: → react-pdf (PDF önizleme) worker açıyor
#   · blob: (img/media/connect) → dosya önizleme object-URL'leri, TTS ses çıktısı
#   · api.openai.com (connect) → sesli görüşme tarayıcıdan doğrudan bağlanır
_CSP_STRICT = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "connect-src 'self' blob: https://api.openai.com; "
    "media-src 'self' blob: data:; "
    "worker-src 'self' blob:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)

# Gevşek CSP — yalnız /docs (Swagger UI, jsdelivr CDN) + /mobil (telefon sayfası, inline
# script/style + IBM Plex marka fontu) için. Google Fonts: /mobil sayfası stil+font yükler;
# font CDN'i script çalıştıramaz, eklenen yüzey minimal.
_CSP_GEVSEK = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "img-src 'self' data: https:; "
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)
_GEVSEK_ONEK = ("/docs", "/redoc", "/openapi.json", "/mobil")

_APP_ENV_PROD = os.getenv("APP_ENV", "").strip().lower() in ("prod", "production")

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}
if _APP_ENV_PROD:
    # HSTS yalnız gerçek prod'da: TLS terminasyonu garanti değilse (yerel http:// dev)
    # tarayıcı zaten başlığı yok sayar, ama sinyali yalnız gerçek dağıtımda taşımak daha net.
    _SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

_DEMO = os.getenv("DEMO_KORUMA", "0").strip().lower() in ("1", "true", "yes", "on")
if _DEMO:
    # NOT: X-Robots-Tag KALDIRILDI (kullanıcı kararı, 9 Ağu 2026) — site arama
    # motorlarında bulunmak istiyor. Geri açmak isterseniz tek satır:
    #   _SECURITY_HEADERS["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    # Bedeli: bot trafiği günlük bütçe tavanını erken doldurabilir.
    _SECURITY_HEADERS["Cross-Origin-Opener-Policy"] = "same-origin"
    _SECURITY_HEADERS["Cross-Origin-Resource-Policy"] = "same-origin"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Tüm yanıtlara sabit güvenlik başlıkları ekler (mevcut başlığın üzerine yazmaz)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        gevsek = request.url.path.startswith(_GEVSEK_ONEK)
        response.headers.setdefault(
            "Content-Security-Policy", _CSP_GEVSEK if gevsek else _CSP_STRICT)
        return response


__all__ = ("SecurityHeadersMiddleware",)
