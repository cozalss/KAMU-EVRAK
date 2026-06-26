"""Güvenlik başlıkları middleware'i — her yanıta savunma başlıkları ekler.

Kamu-veri sistemi → tarayıcı tabanlı saldırı yüzeyini (clickjacking, MIME-sniffing,
referrer sızıntısı) daraltır. Hafif `BaseHTTPMiddleware` (FastAPI/Starlette deseni);
ek bağımlılık yok. CSP, /docs (Swagger UI) çalışsın diye gerekli kaynaklara izin verir.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Basit CSP — Swagger UI (jsdelivr CDN) + inline stil/script için gerekli minimum.
# API JSON döndürdüğü için sıkı; /docs'u kırmamak adına CDN'e izin verilir.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https:; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": _CSP,
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Tüm yanıtlara sabit güvenlik başlıkları ekler (mevcut başlığın üzerine yazmaz)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response


__all__ = ("SecurityHeadersMiddleware",)
