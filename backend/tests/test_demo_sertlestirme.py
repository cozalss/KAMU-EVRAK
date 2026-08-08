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


class TestAramaMotoruGorunurlugu:
    """Site arama motorlarına AÇIK (kullanıcı kararı, 9 Ağu 2026).

    Önceki sürüm `X-Robots-Tag: noindex` basıyordu ("hayalet gibi olsun" isteği).
    Karar değişti: site bulunmak istiyor. Bu testler kararın KAZARA geri alınmadığını
    korur — biri noindex'i geri koyarsa test söyler ve bilinçli mi diye sorar.
    Bedeli belgelenmiştir: bot trafiği günlük işlem kapasitesini erken doldurabilir.
    """

    def test_noindex_BASILMAZ(self, monkeypatch):
        # Arrange — demo koruma AÇIKKEN bile
        monkeypatch.setenv("DEMO_KORUMA", "1")
        mod = importlib.reload(importlib.import_module("api.middleware.security_headers"))
        try:
            # Assert
            assert "X-Robots-Tag" not in mod._SECURITY_HEADERS
        finally:
            monkeypatch.delenv("DEMO_KORUMA", raising=False)
            importlib.reload(mod)

    def test_mevcut_guvenlik_basliklari_KORUNUR(self, monkeypatch):
        # Arrange — görünürlük açıldı diye güvenlik başlıkları düşmemeli
        monkeypatch.setenv("DEMO_KORUMA", "1")
        mod = importlib.reload(importlib.import_module("api.middleware.security_headers"))
        try:
            assert mod._SECURITY_HEADERS["X-Content-Type-Options"] == "nosniff"
            assert mod._SECURITY_HEADERS["X-Frame-Options"] == "DENY"
            assert mod._SECURITY_HEADERS["Cross-Origin-Opener-Policy"] == "same-origin"
        finally:
            monkeypatch.delenv("DEMO_KORUMA", raising=False)
            importlib.reload(mod)


class TestStatikDosyalar:
    def test_robots_txt_taramaya_ACIK_ama_agir_uclar_kapali(self):
        # Arrange
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "public" / "robots.txt"
        # Assert
        assert yol.exists(), "frontend/public/robots.txt yok — Vite dist'e kopyalayamaz"
        icerik = yol.read_text(encoding="utf-8")
        assert "Allow: /" in icerik
        # Para harcayan uçlar bota kapalı — bot trafiği günlük kapasiteyi yemesin.
        for uc in ("/process_doc", "/multimodal", "/yazi"):
            assert f"Disallow: {uc}" in icerik

    def test_app_html_noindex_ICERMEZ(self):
        """Görünürlük kararı: çalışma alanı da dizine düşebilir."""
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "app.html"
        assert "noindex" not in yol.read_text(encoding="utf-8")

    def test_landing_sayfasina_DOKUNULMADI(self):
        """index.html + src/portfolio/** proje kuralınca dokunulmaz (CLAUDE.md)."""
        from pathlib import Path
        yol = Path(__file__).resolve().parents[2] / "frontend" / "index.html"
        assert 'name="robots"' not in yol.read_text(encoding="utf-8")


class TestFrontendCSP:
    """CANLI DAĞITIMDA ÖLÇÜLEN HATA — bu testler beyaz ekranın geri gelmesini engeller.

    Varsayılan CSP `script-src 'none'` idi (uygulama yalnız JSON döndürürken doğruydu).
    Frontend aynı servisten sunulmaya başlayınca tarayıcı bütün script/stil dosyalarını
    engelledi: HTTP 200, varlıklar 200, sunucu hatası YOK — site beyaz açıldı.
    """

    def _csp(self):
        from api.middleware.security_headers import _CSP_STRICT
        return _CSP_STRICT

    def test_script_ENGELLENMEZ(self):
        # Arrange + Act
        csp = self._csp()
        # Assert — 'none' beyaz ekran demekti
        assert "script-src 'none'" not in csp
        assert "script-src 'self'" in csp

    def test_stil_ve_font_ENGELLENMEZ(self):
        csp = self._csp()
        assert "style-src 'none'" not in csp
        assert "font-src 'none'" not in csp
        # Google Fonts app.html/index.html'de <link> ile yükleniyor
        assert "https://fonts.googleapis.com" in csp
        assert "https://fonts.gstatic.com" in csp

    def test_satir_ici_stil_serbest_ama_satir_ici_SCRIPT_degil(self):
        """Tasarım sistemi style={{...}} kullanıyor → stil için zorunlu.
        Script'te 'unsafe-inline' YOK: asıl XSS riski orada."""
        csp = self._csp()
        stil = next(p for p in csp.split(";") if p.strip().startswith("style-src"))
        script = next(p for p in csp.split(";") if p.strip().startswith("script-src"))
        assert "'unsafe-inline'" in stil
        assert "'unsafe-inline'" not in script

    def test_pdf_worker_ve_blob_serbest(self):
        """react-pdf worker açar; dosya önizleme ve TTS sesi blob: URL kullanır."""
        csp = self._csp()
        assert "worker-src 'self' blob:" in csp
        assert "blob:" in next(p for p in csp.split(";") if p.strip().startswith("img-src"))

    def test_clickjacking_ve_object_korumasi_DURUYOR(self):
        """Gevşetme yalnız gereken yerde — temel korumalar aynen."""
        csp = self._csp()
        assert "frame-ancestors 'none'" in csp
        assert "object-src 'none'" in csp
        assert "base-uri 'self'" in csp
