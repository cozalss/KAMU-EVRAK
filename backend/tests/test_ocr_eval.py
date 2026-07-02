"""OCR mini-eval saf fonksiyon testleri (S8) — CER/WER doğruluğu (OCR motoru YOK)."""

from __future__ import annotations

from eval.ocr_eval import _levenshtein, cer, wer


class TestLevenshtein:
    def test_ozdes_sifir(self):
        assert _levenshtein(list("dilekçe"), list("dilekçe")) == 0

    def test_tek_degisim(self):
        assert _levenshtein(list("kanun"), list("konun")) == 1

    def test_bos_referans(self):
        assert _levenshtein([], list("ab")) == 2


class TestCerWer:
    def test_ozdes_metin_sifir_hata(self):
        # Arrange / Act / Assert
        assert cer("Dilekçe Hakkı", "Dilekçe Hakkı") == 0.0
        assert wer("Dilekçe Hakkı", "Dilekçe Hakkı") == 0.0

    def test_buyuk_kucuk_ve_bosluk_normalize(self):
        # OCR çıktısında kasıtlı büyük/küçük + fazla boşluk → normalize sonrası hata 0
        assert cer("Bilgi Edinme", "BİLGİ   EDİNME") == 0.0

    def test_tek_kelime_hatasi_wer(self):
        # 4 kelimeden 1'i yanlış → WER 0.25
        assert wer("dört kelimelik örnek cümle", "dört kelimelik örnek tümce") == 0.25

    def test_cer_orani(self):
        # 5 karakter referans, 1 değişim → 0.2
        assert cer("kanun", "konun") == 0.2

    def test_bos_tahmin_tam_hata(self):
        assert cer("abc", "") == 1.0
        assert wer("a b c", "") == 1.0
