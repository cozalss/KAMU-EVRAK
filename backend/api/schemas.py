"""Pydantic şemaları — kamu-evrak API giriş/çıkış sözleşmeleri.

ADALET-AGENT api/schemas.py deseninden ADAPT: zarf + DoS guard (max uzunluk) KEEP;
hukuk şemaları (Citation/Claim/Prediction) → evrak şemaları (tür/birim/yazı/eksik).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# Girdi DoS guard — aşırı uzun metin reddi (ADALET deseni).
MAX_EVRAK_CHARS = 50_000


class ProcessRequest(BaseModel):
    """Hazır metinle pipeline çalıştırma (OCR'sız; test/entegrasyon)."""

    evrak_text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    filename: str = Field("", max_length=255)


class YaziTaslakRequest(BaseModel):
    """Resmî yazı taslağını PDF/DOCX olarak indirme isteği (Görev 2)."""

    evrak_text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    filename: str = Field("", max_length=255)


class MevzuatOneriSchema(BaseModel):
    baslik: str
    snippet: str | None = None
    url: str | None = None
    score: float = 0.0


class ProcessResponse(BaseModel):
    """Uçtan-uca pipeline çıktısı (Görev 1 + Görev 2)."""

    evrak_turu: str
    tur_confidence: float = 0.0
    bilgi_unsurlari: dict = Field(default_factory=dict)
    eksik_alanlar: list[str] = Field(default_factory=list)
    clarify_questions: list[str] = Field(default_factory=list)
    mevzuat_onerileri: list[MevzuatOneriSchema] = Field(default_factory=list)
    ozet: str = ""
    hedef_birim: str = ""
    birim_alternatifleri: list[str] = Field(default_factory=list)
    yazi_turu: str = ""
    yazi_taslak_md: str = ""
    bilgilendirme: str = ""
    # OCR meta (dosya yüklendiyse)
    ocr_engine: str | None = None
    page_count: int | None = None


class OCRResponse(BaseModel):
    """Salt-OCR çıktısı (/multimodal/ocr)."""

    text: str
    engine: str
    n_chars: int
    page_count: int = 1
    confidence: float | None = None
    error: str | None = None


__all__ = ("MAX_EVRAK_CHARS", "MevzuatOneriSchema", "OCRResponse",
           "ProcessRequest", "ProcessResponse", "YaziTaslakRequest")
