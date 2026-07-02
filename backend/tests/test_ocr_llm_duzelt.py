"""OCR sonrası LLM imla/diakritik düzeltmesi testleri (DeepSeek dalgası, madde 1).

Sözleşme (CLAUDE.md fallback kuralı): LLM yok/mock/hata/red → ham OCR metni BİREBİR
korunur. Deterministik son-kontrol LLM çıktısına asla körü körüne güvenmez: rakam
dizileri kümesi değişirse veya uzunluk oranı [0.7, 1.3] dışına çıkarsa düzeltme REDDEDİLİR.
Sentetik PII: Ayşe Yılmaz / 0555-123-4567 / sahte TCKN (gerçek veri yok).
"""

from __future__ import annotations

from agents import config
from multimodal.ocr import OCRResult, _duzeltme_kabul, _llm_imla_duzelt, extract_text

# Diakritiksiz ham OCR çıktısı (RapidOCR tipik hatası) + düzeltilmiş karşılığı.
# Rakam dizileri (tarih, sahte TCKN, telefon) iki metinde AYNI — kabul edilmeli.
HAM = (
    "Sayin yetkili, dilekce sahibi Ayse Yilmaz 12.05.2025 tarihinde "
    "12345678901 kimlik numarasi ile basvurmustur. Iletisim: 0555-123-4567."
)
DUZGUN = (
    "Sayın yetkili, dilekçe sahibi Ayşe Yılmaz 12.05.2025 tarihinde "
    "12345678901 kimlik numarası ile başvurmuştur. İletişim: 0555-123-4567."
)


def _ocr_sonuc(text: str = HAM, engine: str = "rapidocr") -> OCRResult:
    return OCRResult(text=text, engine=engine, lang="tur", n_chars=len(text), elapsed_ms=0)


def _sahte_llm(monkeypatch, cikti, kayit: list | None = None) -> None:
    """agents.nodes._llm_extract.llm_text'i sahte async fonksiyonla değiştir."""

    async def sahte_llm_text(system: str, user: str, **kwargs):
        if kayit is not None:
            kayit.append(user)
        return cikti

    monkeypatch.setattr("agents.nodes._llm_extract.llm_text", sahte_llm_text)


class TestDuzeltmeKabul:
    """Deterministik son-kontrol — saf fonksiyon (LLM yok)."""

    def test_diakritik_duzeltme_kabul(self):
        assert _duzeltme_kabul(HAM, DUZGUN) is True

    def test_rakam_degisikligi_red(self):
        # LLM sahte TCKN'nin son hanesini değiştirdi → rakam kümesi farklı → red
        assert _duzeltme_kabul(HAM, DUZGUN.replace("12345678901", "12345678902")) is False

    def test_rakam_kaybi_red(self):
        # Telefon tamamen düştü → rakam kümesi eksik → red
        assert _duzeltme_kabul(HAM, DUZGUN.replace("0555-123-4567", "")) is False

    def test_uzunluk_fazla_red(self):
        # İçerik EKLEME yasağı: metin ikiye katlandı → oran > 1.3 → red
        assert _duzeltme_kabul(HAM, DUZGUN + " " + DUZGUN) is False

    def test_uzunluk_kisa_red(self):
        # Rakamlar aynı ama metin gövdesi buharlaştı → oran < 0.7 → red
        assert _duzeltme_kabul(HAM, "12.05.2025 12345678901 0555-123-4567") is False

    def test_bos_cikti_red(self):
        assert _duzeltme_kabul(HAM, "") is False
        assert _duzeltme_kabul(HAM, "   \n ") is False


class TestLlmImlaDuzelt:
    """_llm_imla_duzelt — sahte LLM ile kabul/red + bayrak/motor kapıları."""

    async def test_sahte_llm_duzeltme_kabul(self, monkeypatch):
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        _sahte_llm(monkeypatch, DUZGUN)
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == DUZGUN
        assert res.llm_duzeltildi is True

    async def test_rakam_degistiren_llm_red(self, monkeypatch):
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        _sahte_llm(monkeypatch, DUZGUN.replace("12345678901", "98765432101"))
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == HAM  # ham metin korunur
        assert res.llm_duzeltildi is False

    async def test_uzunluk_sapan_llm_red(self, monkeypatch):
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        _sahte_llm(monkeypatch, DUZGUN + " " + DUZGUN)
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == HAM
        assert res.llm_duzeltildi is False

    async def test_llm_none_ham_kalir(self, monkeypatch):
        # llm_text None döndürür (hata/timeout eşdeğeri) → sözleşme: ham metin
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        _sahte_llm(monkeypatch, None)
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == HAM
        assert res.llm_duzeltildi is False

    async def test_bayrak_kapali_llm_cagrilmaz(self, monkeypatch):
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", False)
        kayit: list = []
        _sahte_llm(monkeypatch, DUZGUN, kayit)
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == HAM
        assert res.llm_duzeltildi is False
        assert kayit == []  # LLM'e hiç gidilmedi

    async def test_uygun_olmayan_motor_llm_cagrilmaz(self, monkeypatch):
        # Dijital PDF / docx / düz metin zaten kusursuz → LLM dokunuşu yok
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        kayit: list = []
        _sahte_llm(monkeypatch, DUZGUN, kayit)
        for motor in ("pdf-text", "docx-text", "text-plain", "openai-vision"):
            res = await _llm_imla_duzelt(_ocr_sonuc(engine=motor))
            assert res.text == HAM
            assert res.llm_duzeltildi is False
        assert kayit == []

    async def test_pdf_scan_motoru_duzeltilir(self, monkeypatch):
        # Taranmış-PDF yolu (pdf-scan-*) düzeltme kapsamında
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        _sahte_llm(monkeypatch, DUZGUN)
        res = await _llm_imla_duzelt(_ocr_sonuc(engine="pdf-scan-rapidocr"))
        assert res.text == DUZGUN
        assert res.llm_duzeltildi is True

    async def test_mock_modda_ham_kalir(self, monkeypatch):
        # Gerçek llm_text mock modda None döndürür → ham metin (anahtarsız CI yolu)
        monkeypatch.setenv("LLM_MODE", "mock")
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        res = await _llm_imla_duzelt(_ocr_sonuc())
        assert res.text == HAM
        assert res.llm_duzeltildi is False


class TestExtractTextEntegrasyon:
    """extract_text uçtan uca — düzeltme yalnız OCR'lı motor yolunda devreye girer."""

    async def test_rapidocr_yolu_uctan_uca_duzeltme(self, monkeypatch):
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        monkeypatch.setattr("multimodal.ocr.OCR_PROVIDER", "local")
        monkeypatch.setattr("multimodal.ocr.rapidocr_image", lambda b: (HAM, 0.9, None))
        _sahte_llm(monkeypatch, DUZGUN)
        res = await extract_text(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, engine="rapidocr")
        assert res.engine == "rapidocr"
        assert res.text == DUZGUN
        assert res.llm_duzeltildi is True
        assert res.n_chars == len(DUZGUN)

    async def test_duz_metin_yolu_dokunulmaz(self, monkeypatch):
        # .txt yüklemesi (text-plain) kusursuz kaynak → LLM hiç çağrılmaz
        monkeypatch.setattr(config, "OCR_LLM_DUZELT", True)
        kayit: list = []
        _sahte_llm(monkeypatch, DUZGUN, kayit)
        res = await extract_text(DUZGUN.encode("utf-8"))
        assert res.engine == "text-plain"
        assert res.text == DUZGUN
        assert res.llm_duzeltildi is False
        assert kayit == []
