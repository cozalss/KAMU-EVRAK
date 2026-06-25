"""API güvenlik denetimi testleri — boyut cap (413), güvenlik başlıkları, dosya-adı sanitize.

Güvenlik denetimi bulgularını (HIGH-1 OOM/DoS, HIGH-3/MEDIUM-5 başlıklar, MEDIUM-7
Content-Disposition) regrese karşı kilitler. TestClient gerçek ASGI hattını koşar.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import main
from api.routes import multimodal
from api.routes.yazi import _safe_attachment_name


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# HIGH-1 — büyük dosya boyut cap'i (OOM/DoS guard)
# ---------------------------------------------------------------------------


class TestUploadBoyutCap:
    """MAX_UPLOAD_BYTES üstü yükleme 413 dönmeli (tüm dosya belleğe alınmadan)."""

    def test_buyuk_dosya_ocr_413(self, client: TestClient):
        # Arrange — sınırı 1 bayt aşan sahte yük
        buyuk = b"x" * (multimodal.MAX_UPLOAD_BYTES + 1)
        # Act
        resp = client.post(
            "/multimodal/ocr",
            files={"file": ("buyuk.bin", io.BytesIO(buyuk), "application/octet-stream")},
        )
        # Assert
        assert resp.status_code == 413

    def test_buyuk_dosya_process_stream_413(self, client: TestClient):
        # Arrange
        buyuk = b"x" * (multimodal.MAX_UPLOAD_BYTES + 1)
        # Act
        resp = client.post(
            "/process_doc/stream",
            files={"file": ("buyuk.bin", io.BytesIO(buyuk), "application/octet-stream")},
        )
        # Assert
        assert resp.status_code == 413

    def test_bos_dosya_400(self, client: TestClient):
        # Arrange — boş yük
        resp = client.post(
            "/multimodal/ocr",
            files={"file": ("bos.bin", io.BytesIO(b""), "application/octet-stream")},
        )
        # Assert
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# HIGH-3 / MEDIUM-5 — güvenlik başlıkları her yanıtta
# ---------------------------------------------------------------------------


class TestGuvenlikBasliklari:
    """Tüm yanıtlara nosniff / DENY / Referrer-Policy / CSP eklenmeli."""

    def test_health_basliklari_iceriyor(self, client: TestClient):
        # Act
        resp = client.get("/health")
        # Assert
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in resp.headers

    def test_csp_frame_ancestors_none(self, client: TestClient):
        # Act
        resp = client.get("/")
        # Assert — clickjacking koruması CSP'de de var
        assert "frame-ancestors 'none'" in resp.headers.get("Content-Security-Policy", "")


# ---------------------------------------------------------------------------
# MEDIUM-7 — Content-Disposition dosya adı sanitize (header injection guard)
# ---------------------------------------------------------------------------


class TestDosyaAdiSanitize:
    """_safe_attachment_name CRLF/`;`/tırnak enjeksiyonunu temizlemeli."""

    def test_crlf_enjeksiyon_temizlenir(self):
        # Arrange — CRLF + ek başlık enjeksiyonu denemesi
        state = {"yazi_taslak_pdf_filename": "evrak.pdf\r\nSet-Cookie: x=1"}
        # Act
        ad = _safe_attachment_name(state, "pdf", "fallback.pdf")
        # Assert — \r \n ve : kaybolmalı
        assert "\r" not in ad and "\n" not in ad
        assert ":" not in ad and ";" not in ad

    def test_noktali_virgul_ve_tirnak_temizlenir(self):
        # Arrange
        state = {"yazi_taslak_docx_filename": 'a";b.docx'}
        # Act
        ad = _safe_attachment_name(state, "docx", "fallback.docx")
        # Assert
        assert '"' not in ad and ";" not in ad

    def test_uzunluk_64_ile_sinirli(self):
        # Arrange — çok uzun ad
        state = {"yazi_taslak_pdf_filename": "a" * 200 + ".pdf"}
        # Act
        ad = _safe_attachment_name(state, "pdf", "fallback.pdf")
        # Assert
        assert len(ad) <= 64

    def test_bos_ve_ayrac_only_fallback(self):
        # Arrange — yalnız ayraç → anlamlı ad yok
        state = {"yazi_taslak_pdf_filename": "...___"}
        # Act
        ad = _safe_attachment_name(state, "pdf", "fallback.pdf")
        # Assert
        assert ad == "fallback.pdf"

    def test_gecerli_ad_korunur(self):
        # Arrange
        state = {"yazi_taslak_pdf_filename": "resmi-yazi_2026.pdf"}
        # Act
        ad = _safe_attachment_name(state, "pdf", "fallback.pdf")
        # Assert — geçerli karakterler değişmez
        assert ad == "resmi-yazi_2026.pdf"
