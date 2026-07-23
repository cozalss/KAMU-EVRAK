"""İstek gövde-boyutu ASGI kapısı — büyük gövde route/parse'tan ÖNCE reddedilir (early-reject).

Bug avı 2026-07-23 (MEDIUM DoS): /process_doc/stream + /multimodal/ocr (auth'suz açık uçlar)
`file: UploadFile = File(...)` kullanıyor → Starlette gövdeyi route ÇALIŞMADAN önce tamamen
ayrıştırır/diske spool eder; per-endpoint 413 kontrolü ancak SONRA gelir → GB-ölçekli yükleme
disk/bellek tüketimi DoS'u önlenmez. mobil.py'nin Content-Length kapısı desenini GLOBAL uygular
(tek yer, tüm uçlar). h11/uvicorn beyan edilen Content-Length'in aşılmasına zaten izin vermez;
beyan üstüyse gövde hiç okunmadan 413 döner. Chunked (CL'siz) istekler per-endpoint kapıya kalır.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_ZARF_PAYI = 128 * 1024
# Meşru 20 MB yükleme + multipart form zarfı geçer; GB-ölçekli gövde erken reddedilir.
MAX_BODY_BYTES = _MAX_UPLOAD_BYTES + _ZARF_PAYI


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Content-Length beyanı sınırı aşarsa gövde ayrıştırılmadan 413 (veya geçersizse 400) döner."""

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                beyan = int(cl)
            except ValueError:
                return JSONResponse({"detail": "Content-Length geçersiz."}, status_code=400)
            if beyan > MAX_BODY_BYTES:
                return JSONResponse(
                    {"detail": "İstek gövdesi çok büyük (en fazla 20 MB)."}, status_code=413)
        return await call_next(request)


__all__ = ("MAX_BODY_BYTES", "MaxBodySizeMiddleware")
