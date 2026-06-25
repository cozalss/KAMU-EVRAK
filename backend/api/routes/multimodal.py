"""POST /multimodal/ocr — yüklenen evrakı (PDF/görsel/Word) metne çevir.

ADALET-AGENT api/routes/multimodal.py'dan ADAPT (minimal): magic-byte/boyut guard KEEP;
hukuk-spesifik mantık DROP. OCR motoru multimodal/ocr.py (KEEP — çok-motorlu hat).

# TODO(kamu-evrak): ADALET'teki tam guard seti (zip-bomb, attachment prompt-injection
# sanitize, rate-limit) production'da geri eklenir (api/middleware/* KEEP kopyalandı).
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from api.schemas import OCRResponse
from multimodal.ocr import extract_text

log = structlog.get_logger()
router = APIRouter(prefix="/multimodal", tags=["multimodal"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB DoS guard


@router.post("/ocr", response_model=OCRResponse)
async def ocr_upload(file: UploadFile = File(...)) -> OCRResponse:
    """Yüklenen belgeden metin çıkar (PDF dijital/tarama, görsel, Word)."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Boş dosya")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Dosya çok büyük (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    result = await extract_text(data)
    log.info("ocr_upload", filename=file.filename, engine=result.engine, n=result.n_chars)
    return OCRResponse(
        text=result.text, engine=result.engine, n_chars=result.n_chars,
        page_count=result.page_count, confidence=result.confidence, error=result.error,
    )


__all__ = ("router",)
