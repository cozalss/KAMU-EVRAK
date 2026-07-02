"""extract_text düz-metin (.txt) dalı testleri (L1 — örnek evrakların SSE akışı önkoşulu).

Sniff güvenliği: görüntü/binary UTF-8 decode'da düşer → OCR yolu bozulmaz; yalnız
gerçek düz metin OCR'sız 'text-plain' motoruyla geçer.
"""

from __future__ import annotations

from multimodal.ocr import _try_plain_text, extract_text


class TestTryPlainText:
    def test_turkce_utf8_metin_kabul(self):
        assert _try_plain_text("Merhaba dünya, İzmir'den şikâyet.".encode()) is not None

    def test_bom_lu_metin_kabul(self):
        # Windows Not Defteri UTF-8 BOM ekler → kullanıcı .txt'leri böyle gelir
        assert _try_plain_text(b"\xef\xbb\xbfDilek\xc3\xa7e metni") == "Dilekçe metni"

    def test_png_magic_red(self):
        assert _try_plain_text(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32) is None

    def test_bos_ve_bosluk_red(self):
        assert _try_plain_text(b"") is None
        assert _try_plain_text(b"   \n  ") is None


class TestExtractTextPlain:
    async def test_txt_ocr_suz_gecer(self):
        # Arrange
        metin = "T.C. ANKARA VALİLİĞİ\nKonu: Bilgi edinme başvurusu\n4982 kapsamında."
        # Act
        res = await extract_text(metin.encode("utf-8"))
        # Assert — OCR motoru HİÇ devreye girmez, metin birebir korunur
        assert res.engine == "text-plain"
        assert res.text == metin
        assert res.error is None
