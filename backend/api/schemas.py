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


class YaziRenderRequest(BaseModel):
    """Düzenlenmiş taslak metnini DOĞRUDAN PDF/DOCX'e render etme isteği (pipeline YOK).

    TaslaklarView 'DOCX indir' — memurun elle düzenlediği gövde olduğu gibi indirilir.
    """

    text: str = Field(..., max_length=MAX_EVRAK_CHARS, min_length=1)
    title: str = Field("", max_length=255)


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
    # B2 — şeffaflık (kaynak göstermeyen öneri = güven kaybı). Hepsi türetilmiş/doğrulanabilir.
    dayanak: str = ""              # "hangi talebe dayanıyor" (evrak konusu)
    guven: str = ""               # "yüksek" | "orta" | "düşük"
    inceleme_oner: bool = False    # düşük güven / [DOĞRULA] → insan incelemesi önerilir
    dogrula: bool = False         # başlık/snippet'te [DOĞRULA] işareti
    nli_etiket: str = ""          # NLI açıksa: "destekleniyor" / "[DOĞRULA: anlamsal destek zayıf]"
    yururluk: str = ""            # başlıkta zaten var olan sürüm/yürürlük (uydurma yok)


class AltTalepSchema(BaseModel):
    """Çok-konulu evrak alt-talebi (decompose) — her istek ayrı tür+birim+yasal süre.

    Tek dilekçedeki birden çok istek ayrıştırılır → otomatik havale önerisi. Özet PII-maskeli.
    """

    ozet: str
    tur: str = "belirsiz"
    tur_tr: str = ""
    birim: str = ""
    birim_tr: str = ""
    yazi_turu: str = ""
    cevap_suresi: str = ""        # "30 gün (3071 s.K. m.7)" vb.
    sla_durum: str = ""           # NORMAL | GECIKMIS | KRITIK | tanimsiz | tarih_yok


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
    # Yenilikçilik — Çok-konulu evrak ayrıştırma (decompose): tek dilekçe → N alt-talep,
    # her biri ayrı tür+birim+yasal süre. Boş liste = tek-konulu (frontend kartı gizler).
    alt_talepler: list[AltTalepSchema] = Field(default_factory=list)
    # Yenilikçilik — Risk bandı (trafik ışığı): {bant: yesil|sari|kirmizi, skor, gerekceler, oneri}.
    # yeşil=yayın-hazır, sarı=memur incelesin, kırmızı=uydurma şüphesi (koşullu HITL tetiği).
    risk_metadata: dict = Field(default_factory=dict)
    # Yenilikçilik — HITL memur onay kapısı (varsa). onay_bekliyor=True → frontend onay
    # panelini açar; thread_id ile /process_doc/resume çağrılır. onay_durumu resume sonrası dolar.
    islem_id: str = ""           # DB persistence açıksa kalıcı işlem id'si
    onay_bekliyor: bool = False
    thread_id: str = ""
    onay_durumu: str = ""        # onaylandı | düzenlendi | reddedildi
    onay_gerekce: str = ""
    # OCR meta (dosya yüklendiyse)
    ocr_engine: str | None = None
    page_count: int | None = None
    # OCR güven skoru (0-1) — OCRResponse.confidence'tan taşınır (dosya yolu); metin yolunda None.
    ocr_confidence: float | None = None


class OCRResponse(BaseModel):
    """Salt-OCR çıktısı (/multimodal/ocr)."""

    text: str
    engine: str
    n_chars: int
    page_count: int = 1
    confidence: float | None = None
    error: str | None = None


__all__ = ("MAX_EVRAK_CHARS", "AltTalepSchema", "MevzuatOneriSchema", "OCRResponse",
           "OnayResumeRequest", "ProcessRequest", "ProcessResponse", "YaziRenderRequest",
           "YaziTaslakRequest")
