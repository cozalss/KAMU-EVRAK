"""POST /multimodal/ocr — yüklenen evrakı (PDF/görsel/Word) metne çevir.

ADALET-AGENT api/routes/multimodal.py'dan ADAPT (minimal): magic-byte/boyut guard KEEP;
hukuk-spesifik mantık DROP. OCR motoru multimodal/ocr.py (KEEP — çok-motorlu hat).

# TODO(kamu-evrak): ADALET'teki tam guard seti (zip-bomb, attachment prompt-injection
# sanitize, rate-limit) production'da geri eklenir (api/middleware/* KEEP kopyalandı).
"""

from __future__ import annotations

import hashlib

import structlog
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from api.middleware.ratelimit import rate_limit
from api.schemas import OCRResponse
from multimodal.ocr import extract_text

log = structlog.get_logger()
router = APIRouter(prefix="/multimodal", tags=["multimodal"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB DoS guard


def _file_ref(filename: str | None) -> str:
    """Log için PII'siz dosya referansı — gerçek ad yerine kısa hash (8 hane)."""
    digest = hashlib.sha256((filename or "").encode("utf-8")).hexdigest()[:8]
    return f"sha256:{digest}"


@router.post("/ocr", response_model=OCRResponse)
@rate_limit("30/minute")  # IP-başı yükleme limiti (slowapi yoksa etkisiz)
async def ocr_upload(request: Request, file: UploadFile = File(...)) -> OCRResponse:
    """Yüklenen belgeden metin çıkar (PDF dijital/tarama, görsel, Word)."""
    # DoS guard: üst sınır + 1 bayt oku → dosyanın tamamını belleğe almadan büyük dosyayı yakala.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Boş dosya")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Dosya çok büyük (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    result = await extract_text(data)
    # Log'da ham dosya adı yerine PII'siz hash referansı (gizlilik).
    log.info("ocr_upload", file_ref=_file_ref(file.filename), engine=result.engine, n=result.n_chars)
    return OCRResponse(
        text=result.text, engine=result.engine, n_chars=result.n_chars,
        page_count=result.page_count, confidence=result.confidence, error=result.error,
    )


__all__ = ("router",)
