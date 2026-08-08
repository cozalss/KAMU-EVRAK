"""Demo dağıtım sertleştirmesi — gövde tavanı + arama motoru görünmezliği.

İki modül de ortam değişkenini MODÜL IMPORT ANINDA okuyor (deponun yerleşik deseni:
`agents/config.py` sabitleri, `security_headers._APP_ENV_PROD`). Bu yüzden testler
`importlib.reload` ile yeniden yükler — `monkeypatch.setenv` tek başına etkisizdir.
"""

from __future__ import annotations

import importlib

import pytest

from api.middleware import body_size


class TestGovdeTavani:
    """1 MiB rastgele değil: Starlette spool eşiği tam 1 MiB."""

    def test_demo_KAPALIYKEN_20MB_tavani(self):
        # Assert — bugünkü davranış
        assert body_size._hesapla({}) == body_size.MAX_BODY_BYTES
        assert body_size._hesapla({"DEMO_KORUMA": "0"}) == body_size.MAX_BODY_BYTES

    def test_demo_ACIKKEN_tam_1MiB(self):
        # Arrange + Act
        tavan = body_size._hesapla({"DEMO_KORUMA": "1"})
        # Assert — spool eşiğiyle BİREBİR: gövde altındaysa dosya parçası da altındadır
        assert tavan == 1024 * 1024
        assert tavan == body_size._SPOOL_ESIGI

    def test_tolerant_parse(self):
        for deger in ("1", "true", "TRUE", "yes", "on"):
            assert body_size._hesapla({"DEMO_KORUMA": deger}) == body_size._SPOOL_ESIGI

    def test_413_mesaji_GERCEK_tavandan_uretilir(self):
        # Sabit "20 MB" metni demo modunda yalan olurdu
        assert body_size._mb_metni(20 * 1024 * 1024 + 128 * 1024) == "20 MB"
        assert body_size._mb_metni(1024 * 1024) == "1 MB"

    @pytest.mark.parametrize("bayt", [1024 * 1024 + 1, 5 * 1024 * 1024])
    def test_demo_da_spool_esigi_ustu_reddedilir(self, bayt):
        assert bayt > body_size._hesapla({"DEMO_KORUMA": "1"})


class TestAramaMotoruGorunmezligi:
    def test_demo_KAPALIYKEN_X_Robots_Tag_YOK(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        mod = importlib.reload(importlib.import_module("api.middleware.security_headers"))
        try:
            # Assert — normal kurulumda başlık basılmaz
            assert "X-Robots-Tag" not in mod._SECURITY_HEADERS
        finally:
            importlib.reload(mod)

    def test_demo_ACIKKEN_noindex_basilir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        mod = importlib.reload(importlib.import_module("api.middleware.security_headers"))
        try:
            # Assert — JSON/PDF/DOCX dâhil HER yanıtı kapsayan taşıyıcı katman
            deger = mod._SECURITY_HEADERS["X-Robots-Tag"]
            assert "noindex" in deger
            assert "nofollow" in deger
            assert mod._SECURITY_HEADERS["Cross-Origin-Opener-Policy"] == "same-origin"
        finally:
            monkeypatch.delenv("DEMO_KORUMA", raising=False)
            importlib.reload(mod)

    def test_mevcut_guvenlik_basliklari_KORUNUR(self, monkeypatch):
        # Arrange — demo açıkken de eski başlıklar yerinde
        monkeypatch.setenv("DEMO_KORUMA", "1")
        mod = importlib.reload(importlib.import_module("api.middleware.security_headers"))
        try:
            assert mod._SECURITY_HEADERS["X-Content-Type-Options"] == "nosniff"
            assert mod._SECURITY_HEADERS["X-Frame-Options"] == "DENY"
        finally:
            monkeypatch.delenv("DEMO_KORUMA", raising=False)
            importlib.reload(mod)


class TestStatikDosyalar:
    def test_robots_txt_var_ve_kapali(self):
        # Arrange
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "public" / "robots.txt"
        # Assert
        assert yol.exists(), "frontend/public/robots.txt yok — Vite dist'e kopyalayamaz"
        icerik = yol.read_text(encoding="utf-8")
        assert "User-agent: *" in icerik
        assert "Disallow: /" in icerik

    def test_app_html_noindex_meta(self):
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "app.html"
        icerik = yol.read_text(encoding="utf-8")
        assert 'name="robots"' in icerik
        assert "noindex" in icerik

    def test_landing_sayfasina_DOKUNULMADI(self):
        """index.html + src/portfolio/** proje kuralınca dokunulmaz (CLAUDE.md)."""
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "index.html"
        icerik = yol.read_text(encoding="utf-8")
        # Assert — landing'e robots etiketi EKLENMEDİ; başlık + robots.txt katmanları kapsar
        assert 'name="robots"' not in icerik
