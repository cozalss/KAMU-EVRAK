"""İstek gövde-boyutu ASGI kapısı — büyük gövde route/parse'tan ÖNCE reddedilir (early-reject).

Bug avı 2026-07-23 (MEDIUM DoS): /process_doc/stream + /multimodal/ocr (auth'suz açık uçlar)
`file: UploadFile = File(...)` kullanıyor → Starlette gövdeyi route ÇALIŞMADAN önce tamamen
ayrıştırır/diske spool eder; per-endpoint 413 kontrolü ancak SONRA gelir → GB-ölçekli yükleme
disk/bellek tüketimi DoS'u önlenmez. mobil.py'nin Content-Length kapısı desenini GLOBAL uygular
(tek yer, tüm uçlar). h11/uvicorn beyan edilen Content-Length'in aşılmasına zaten izin vermez;
beyan üstüyse gövde hiç okunmadan 413 döner. Chunked (CL'siz) istekler per-endpoint kapıya kalır.

DEMO MODU (1 MiB) — bu sayı yuvarlak bir tahmin DEĞİL, yapısal bir garantidir:
Starlette'in `MultiPartParser.spool_max_size` değeri tam 1 MiB'dır. TÜM gövde bu eşiğin
altında tutulursa dosya parçası da zorunlu olarak altında kalır → `SpooledTemporaryFile`
asla diske taşmaz → yabancının belgesinden tek bayt bile diske yazılmaz. "2 MiB, yeter
de artar" demek bu özelliği kaybettirirdi.
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_ZARF_PAYI = 128 * 1024
# Meşru 20 MB yükleme + multipart form zarfı geçer; GB-ölçekli gövde erken reddedilir.
MAX_BODY_BYTES = _MAX_UPLOAD_BYTES + _ZARF_PAYI

# Starlette MultiPartParser.spool_max_size — üstündeki parça gerçek tempfile'a taşar.
_SPOOL_ESIGI = 1024 * 1024

# Gövde taşıyabilen metotlar — Content-Length zorunluluğu YALNIZ bunlara uygulanır.
# GET/HEAD/OPTIONS gövdesiz gelir ve 411 vermek onları kırardı (CORS preflight dâhil).
_GOVDELI_METOTLAR = frozenset({"POST", "PUT", "PATCH"})


def _hesapla(env=None) -> int:
    """Etkin gövde tavanı. Saf fonksiyon (düz sözlükle test edilebilir)."""
    e = os.environ if env is None else env
    demo = (e.get("DEMO_KORUMA", "0") or "").strip().lower() in ("1", "true", "yes", "on")
    return _SPOOL_ESIGI if demo else MAX_BODY_BYTES


def _mb_metni(bayt: int) -> str:
    mb = bayt / (1024 * 1024)
    return f"{mb:.0f} MB" if mb >= 1 else f"{bayt // 1024} KB"


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Content-Length beyanı sınırı aşarsa gövde ayrıştırılmadan 413 (veya geçersizse 400) döner."""

    async def dispatch(self, request: Request, call_next):
        tavan = _hesapla()
        cl = request.headers.get("content-length")
        if cl is None:
            # ÖLÇÜLEN AÇIK (adversarial doğrulama, 8 Ağu 2026): `Transfer-Encoding: chunked`
            # isteğinde Content-Length YOKTUR, dolayısıyla eski kod bu kapıyı tamamen
            # atlatıyordu. Starlette gövdeyi route ÇALIŞMADAN parse eder ve dosya parçasını
            # `SpooledTemporaryFile(max_size=1 MiB)`'e yazar; eşiği aşınca GERÇEK bir disk
            # dosyasına taşar. Ölçüm: 1,2 MiB chunked → 200 + 1.200.176 baytlık temp dosya;
            # 25 MiB chunked → tepe 22,9 MiB disk, ANCAK ondan sonra 413. Yani hem "diske
            # tek bayt yazılmaz" garantisi hem de boyut tavanı düşüyordu.
            # Çözüm depoda zaten vardı (`api/routes/mobil.py:279-281`, 411) — genele taşındı.
            if request.method in _GOVDELI_METOTLAR:
                return JSONResponse(
                    {"detail": "Content-Length zorunlu (parçalı/chunked gövde kabul edilmez)."},
                    status_code=411)
            return await call_next(request)
        try:
            beyan = int(cl)
        except ValueError:
            return JSONResponse({"detail": "Content-Length geçersiz."}, status_code=400)
        if beyan > tavan:
            # Mesaj GERÇEK tavandan üretilir — sabit "20 MB" metni demo modunda yalan olurdu.
            return JSONResponse(
                {"detail": f"İstek gövdesi çok büyük (en fazla {_mb_metni(tavan)})."},
                status_code=413)
        return await call_next(request)


__all__ = ("MAX_BODY_BYTES", "MaxBodySizeMiddleware", "_hesapla")
