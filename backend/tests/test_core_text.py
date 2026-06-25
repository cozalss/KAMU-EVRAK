"""core/text.py birim testleri — tr_lower ve sanitize_text.

Düzenli test isimleri: davranış-açıklayıcı Türkçe.
AAA (Arrange-Act-Assert) deseni.
"""

from __future__ import annotations

import pytest

from core.text import sanitize_text, tr_lower


# ---------------------------------------------------------------------------
# tr_lower testleri
# ---------------------------------------------------------------------------


class TestTrLower:
    """Türkçe-doğru küçük harf dönüşümü."""

    def test_buyuk_i_noktali_kucuk_i_olur(self):
        # Arrange
        girdi = "İstanbul"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "istanbul"

    def test_buyuk_i_noktas_kucuk_i_olmali(self):
        # Arrange: Türkçe'de I → ı (nokta olmayan küçük i)
        girdi = "IQRAR"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc[0] == "ı", "Büyük 'I' Türkçe'de 'ı' olmalı, 'i' değil"

    def test_karisik_turkce_karakterler(self):
        # Arrange
        girdi = "İLGİ"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "ilgi"

    def test_buyuk_i_ve_i_baslayan_kelime(self):
        # Arrange
        girdi = "IŞIK"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "ışık"

    def test_latin_karakterler_korunur(self):
        # Arrange
        girdi = "ABC"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "abc"

    def test_bos_metin_bos_doner(self):
        # Arrange
        girdi = ""
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == ""

    def test_kucuk_harf_degismez(self):
        # Arrange — zaten küçük harf
        girdi = "istanbul"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "istanbul"

    def test_cok_dilli_karisik(self):
        # Arrange: İngilizce + Türkçe karışık
        girdi = "ADALET AGENT İçin"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert "i̇" not in sonuc, "Combining-noktalı i üretilmemeli"
        assert sonuc.startswith("adalet")

    def test_sadece_buyuk_i_noktali(self):
        # Arrange
        girdi = "İİİ"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "iii"

    def test_sadece_buyuk_i_noktas(self):
        # Arrange
        girdi = "III"
        # Act
        sonuc = tr_lower(girdi)
        # Assert
        assert sonuc == "ıı­ı".replace("\xad", ""), "Her I → ı olmalı"
        # Alternatif doğrulama — len ve içerik kontrolü
        assert len(sonuc) == 3
        assert all(ch == "ı" for ch in sonuc)


# ---------------------------------------------------------------------------
# sanitize_text testleri
# ---------------------------------------------------------------------------


class TestSanitizeText:
    """OCR/PDF/Word kaynaklı metin temizleme."""

    def test_bos_metin_aynen_doner(self):
        # Arrange
        girdi = ""
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert sonuc == ""

    def test_None_benzeri_bos_string(self):
        # Arrange — None doğrudan API olmayan; boş string'i test et
        girdi = ""
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert sonuc == ""

    def test_mojibake_c_cedilla_duzeltilir(self):
        # Arrange: PDF'ten gelen Latin-1-in-UTF-8 mojibake
        girdi = "eleman Ã§alıştırıldı"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ç" in sonuc
        assert "Ã§" not in sonuc

    def test_mojibake_g_breve_duzeltilir(self):
        # Arrange
        girdi = "baÄŸlantı"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ğ" in sonuc
        assert "ÄŸ" not in sonuc

    def test_mojibake_s_cedilla_duzeltilir(self):
        # Arrange
        girdi = "ÅŸikâyet"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ş" in sonuc

    def test_mojibake_i_dotless_duzeltilir(self):
        # Arrange
        girdi = "baÄ±lat"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ı" in sonuc

    def test_mojibake_o_umlaut_duzeltilir(self):
        # Arrange
        girdi = "Ã¶zel"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ö" in sonuc

    def test_mojibake_u_umlaut_duzeltilir(self):
        # Arrange
        girdi = "Ã¼niforma"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "ü" in sonuc

    def test_nfc_normalizasyon_uygulanir(self):
        # Arrange: NFD formu (bileşik olmayan combining karakter)
        import unicodedata
        nfd_c = unicodedata.normalize("NFD", "ç")  # c + combining cedilla
        # Act
        sonuc = sanitize_text(nfd_c)
        # Assert
        assert unicodedata.is_normalized("NFC", sonuc)

    def test_kontrol_karakterleri_silinir(self):
        # Arrange: BEL (0x07) + NULL (0x00) + satır içi
        girdi = "metin\x00\x07arası\x1bkontrol"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "\x00" not in sonuc
        assert "\x07" not in sonuc
        assert "\x1b" not in sonuc

    def test_satir_sonu_ve_tab_korunur(self):
        # Arrange
        girdi = "satır1\nsatır2\tsekme"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "\n" in sonuc
        assert "\t" in sonuc

    def test_normal_metin_degismez(self):
        # Arrange
        girdi = "Dilekçe metni, tarih: 25.06.2026."
        # Act
        sonuc = sanitize_text(girdi)
        # Assert — PII/mojibake olmayan metin bozulmamalı
        assert "Dilekçe" in sonuc
        assert "25.06.2026" in sonuc

    def test_nbsp_bosluga_cevirilir(self):
        # Arrange: \xa0 (non-breaking space)
        girdi = "ad\xa0soyad"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "\xa0" not in sonuc
        assert " " in sonuc

    def test_tirnak_mojibake_duzeltilir(self):
        # Arrange: akıllı tırnak mojibake
        girdi = "â€œtestâ€"
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert "â€" not in sonuc

    def test_uzun_metin_islenir(self):
        # Arrange: 10 000 karakter (performans sınır testi)
        girdi = "normal metin. " * 700
        # Act
        sonuc = sanitize_text(girdi)
        # Assert
        assert len(sonuc) > 0
        assert "normal metin" in sonuc
