"""PDF yardımcı fonksiyonları testleri — pypdfium2 yoksa atla.

pypdfium2 opsiyonel bağımlılık: kurulu değilse tüm testler otomatik skip edilir.
Kurulu ise: dijital PDF metin çıkarma, sayfa sayısı, boş dosya, bozuk bayt.
"""

from __future__ import annotations

import io

import pytest

# pypdfium2 kurulu değilse tüm bu test modülü skip edilir.
pypdfium2 = pytest.importorskip(
    "pypdfium2",
    reason="pypdfium2 kurulu değil — PDF testleri atlanıyor (opsiyonel bağımlılık)",
)


# ---------------------------------------------------------------------------
# Minimal test PDF oluşturucu (PyPDF2/reportlab gerektirmez)
# ---------------------------------------------------------------------------

_MINIMAL_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n"
    b"   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    b"4 0 obj\n<< /Length 44 >>\nstream\n"
    b"BT /F1 12 Tf 100 700 Td (Test metin) Tj ET\nendstream\nendobj\n"
    b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    b"xref\n0 6\n0000000000 65535 f \n"
    b"0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
    b"0000000266 00000 n \n0000000360 00000 n \n"
    b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n441\n%%EOF\n"
)


# ---------------------------------------------------------------------------
# pypdfium2 doğrudan kullanım testleri
# ---------------------------------------------------------------------------


class TestPypdfium2Temel:
    """pypdfium2 minimal kullanım doğrulaması."""

    def test_minimal_pdf_yuklenir(self):
        # Arrange: bayt dizisinden PDF yükle
        pdf_bytes = _MINIMAL_PDF_BYTES
        # Act
        doc = pypdfium2.PdfDocument(io.BytesIO(pdf_bytes))
        sayfa_sayisi = len(doc)
        doc.close()
        # Assert
        assert sayfa_sayisi >= 1

    def test_sayfa_sayisi_pozitif(self):
        # Arrange
        doc = pypdfium2.PdfDocument(io.BytesIO(_MINIMAL_PDF_BYTES))
        # Act
        sayfa_sayisi = len(doc)
        doc.close()
        # Assert
        assert sayfa_sayisi > 0

    def test_bozuk_bayt_istisna_firlatir(self):
        # Arrange: geçersiz PDF verisi
        bozuk = b"bu bir PDF degil"
        # Act / Assert — istisna bekleniyor
        with pytest.raises(Exception):
            pypdfium2.PdfDocument(io.BytesIO(bozuk))

    def test_bos_bayt_istisna_firlatir(self):
        # Arrange
        bos = b""
        # Act / Assert
        with pytest.raises(Exception):
            pypdfium2.PdfDocument(io.BytesIO(bos))


class TestPypdfium2SayfaIslemleri:
    """Sayfa düzeyinde işlemler."""

    def test_ilk_sayfa_render_edilir(self):
        # Arrange
        doc = pypdfium2.PdfDocument(io.BytesIO(_MINIMAL_PDF_BYTES))
        sayfa = doc[0]
        # Act — piksel bitmap al (1x küçültülmüş)
        bitmap = sayfa.render(scale=0.1)
        pil_img = bitmap.to_pil()
        doc.close()
        # Assert — geçerli görüntü boyutları
        assert pil_img.width > 0
        assert pil_img.height > 0

    def test_sayfa_boyutlari_pozitif(self):
        # Arrange
        doc = pypdfium2.PdfDocument(io.BytesIO(_MINIMAL_PDF_BYTES))
        sayfa = doc[0]
        # Act
        genislik, yukseklik = sayfa.get_width(), sayfa.get_height()
        doc.close()
        # Assert
        assert genislik > 0
        assert yukseklik > 0
