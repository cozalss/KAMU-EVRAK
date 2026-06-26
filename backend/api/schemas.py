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


class OnayResumeRequest(BaseModel):
    """HITL memur onay kararı — duraklamış pipeline'ı sürdürür (Görev 2 yenilikçilik)."""

    thread_id: str = Field(..., min_length=1, max_length=128)
    secim: str = Field("onayla", pattern="^(onayla|duzenle|reddet)$")
    metin: str = Field("", max_length=MAX_EVRAK_CHARS)   # düzenle: yeni gövde
    gerekce: str = Field("", max_length=2000)            # reddet: gerekçe


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
    # Yenilikçilik — NLI atıf-gerekçelendirme (her öneri için entailment işareti).
    mevzuat_nli: list = Field(default_factory=list)
    ozet: str = ""
    hedef_birim: str = ""
    birim_alternatifleri: list[str] = Field(default_factory=list)
    yazi_turu: str = ""
    yazi_taslak_md: str = ""
    format_uyumlu: bool = False
    verify_uyari: list[str] = Field(default_factory=list)
    verify_notes: str = ""
    bilgilendirme: str = ""
    # Yenilikçilik — Arşivleme (SDP 2005/7) metadata (frontend bununla eşleşir).
    arsiv_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — Yasal süre / SLA triyaj metadata (GECİKMİŞ/KRİTİK rozeti).
    sla_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — Tamper-evident SHA-256 denetim izi (Sayıştay/KVKK).
    denetim_izi: dict = Field(default_factory=dict)
    # Yenilikçilik — Kanıt bağlama (maskeli metin + çıkarım span'ları, sarı vurgu).
    kanit_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — HITL memur onay kapısı (varsa). onay_bekliyor=True → frontend onay
    # panelini açar; thread_id ile /process_doc/resume çağrılır. onay_durumu resume sonrası dolar.
    onay_bekliyor: bool = False
    thread_id: str = ""
    onay_durumu: str = ""        # onaylandı | düzenlendi | reddedildi
    onay_gerekce: str = ""
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


__all__ = ("MAX_EVRAK_CHARS", "MevzuatOneriSchema", "OCRResponse", "OnayResumeRequest",
           "ProcessRequest", "ProcessResponse", "YaziTaslakRequest")
