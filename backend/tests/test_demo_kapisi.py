"""api/middleware/demo_kapisi.py — saf ASGI demo kapısı (gerçek ASGI yığınıyla).

En önemli test `test_koruma_KAPALIYKEN_davranis_birebir_ayni`: bayrak yokken hiçbir
Set-Cookie basılmaz, hiçbir 402/429 üretilmez, hiçbir defter dosyası oluşmaz. Demo
katmanının varlığı normal kullanımı ETKİLEMEZ.

Kota sayımı ucuz yoldan sınanır: kapı route'tan ÖNCE koştuğu için geçersiz gövdeli bir
istek 422 alır ama hakkı YAKMIŞ olur (bilinçli sözleşme — akış ortasında kopan istemci
sayılmasaydı sonsuz ücretsiz döngü açılırdı).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.demo_butce as demo_butce
import core.demo_kota as demo_kota
import core.gun_indeksi as gi
import main
from core.butce_defteri import ButceDefteri, DefterAyari


@pytest.fixture
def defter_yolu(tmp_path: Path) -> Path:
    return tmp_path / "demo.json"


@pytest.fixture(autouse=True)
def _izole(monkeypatch, defter_yolu):
    gi.sifirla_test_icin()
    monkeypatch.setattr(gi, "_simdi", lambda: 7000 * 86_400.0 + 1.0)
    monkeypatch.setattr(demo_butce, "DEFTER", ButceDefteri(DefterAyari(
        ad="demo-test", dosya=defter_yolu,
        tavan_env="DEMO_AZAMI_GUNLUK_USD", gunluk=True,
    )))
    demo_kota.kotayi_sifirla()
    monkeypatch.setenv("DEMO_KOTA_SECRET", "test-anahtar")
    monkeypatch.delenv("DEMO_KORUMA", raising=False)
    monkeypatch.delenv("DEMO_AZAMI_GUNLUK_USD", raising=False)
    yield
    demo_kota.kotayi_sifirla()
    gi.sifirla_test_icin()


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def cerezli_istemci() -> TestClient:
    """Çerezi ÖNCEDEN kurulmuş istemci — ziyaretçi kotasını saf hâlde ölçer.

    Çerezsiz ilk istek ağ kovasından sayılır (curl döngüsü sınırsız hak almasın diye);
    ziyaretçi kotasını sınamak için çerez baştan verilir. Bkz. api/demo_kimlik.py
    "+1" notu.
    """
    from api.demo_kimlik import CEREZ_ADI, cerez_uret
    c = TestClient(main.app)
    c.cookies.set(CEREZ_ADI, cerez_uret())
    return c


@pytest.fixture
def demo_acik(monkeypatch):
    monkeypatch.setenv("DEMO_KORUMA", "1")
    monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")


class TestKorumaKapali:
    """Bayrak yokken uygulama BUGÜNKÜ hâliyle davranmalı."""

    def test_koruma_KAPALIYKEN_davranis_birebir_ayni(self, client, defter_yolu):
        # Act
        y = client.post("/process_doc", json={})
        # Assert — kapı hiç devreye girmedi
        assert y.status_code == 422           # normal doğrulama hatası
        assert "set-cookie" not in {k.lower() for k in y.headers}
        assert not defter_yolu.exists()       # tek satır bile yazılmadı

    def test_koruma_kapaliyken_sinirsiz_istek(self, client):
        for _ in range(10):
            assert client.post("/process_doc", json={}).status_code == 422


class TestKota:
    def test_kota_dolunca_429_ve_Retry_After(self, demo_acik):
        # Arrange — çerezli istemci: tam 3 hak
        c = cerezli_istemci()
        for i in range(3):
            assert c.post("/process_doc", json={}).status_code == 422, f"{i}. istek"
        # Act
        y = c.post("/process_doc", json={})
        # Assert
        assert y.status_code == 429
        assert y.headers.get("retry-after") == "3600"
        assert "detail" in y.json()

    def test_cerezsiz_ilk_istek_AG_kovasindan_sayilir(self, demo_acik):
        """curl döngüsü (çerez kavanozu yok) ziyaretçi kotasına takılır, 12'ye çıkmaz."""
        # Arrange — her istekte çerezi at
        gecen = 0
        for _ in range(10):
            c = TestClient(main.app)          # taze kavanoz = çerezsiz
            if c.post("/process_doc", json={}).status_code == 422:
                gecen += 1
        # Assert — ağ kovası ziyaretçi anahtarı olarak paylaşıldı → 3
        assert gecen == 3

    def test_serbest_uclar_kota_YAKMAZ(self, client, demo_acik):
        # Arrange — /yazi/render LLM'siz (deterministik render)
        for _ in range(10):
            client.post("/yazi/render", json={})
        # Assert — ücretli uç hâlâ açık
        assert client.post("/process_doc", json={}).status_code == 422

    def test_GET_istekleri_kota_yakmaz(self, client, demo_acik):
        for _ in range(10):
            client.get("/health")
        assert client.post("/process_doc", json={}).status_code == 422

    def test_yazi_taslak_da_kota_yakar(self, demo_acik):
        c = cerezli_istemci()
        for _ in range(3):
            c.post("/yazi/taslak", json={})
        assert c.post("/process_doc", json={}).status_code == 429

    def test_multimodal_ocr_da_kota_yakar(self, demo_acik):
        c = cerezli_istemci()
        for _ in range(3):
            c.post("/multimodal/ocr")
        assert c.post("/process_doc", json={}).status_code == 429

    def test_process_doc_resume_da_kota_yakar(self, demo_acik):
        c = cerezli_istemci()
        for _ in range(3):
            c.post("/process_doc/resume", json={})
        assert c.post("/process_doc", json={}).status_code == 429


class TestButce:
    def test_tavan_tanimsizsa_402(self, client, monkeypatch):
        # Arrange — tavan yok → fail-closed
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.delenv("DEMO_AZAMI_GUNLUK_USD", raising=False)
        # Act
        y = client.post("/process_doc", json={})
        # Assert
        assert y.status_code == 402
        assert "kapasite" in y.json()["detail"].lower()

    def test_defter_bozuksa_402(self, client, demo_acik, defter_yolu):
        # Arrange
        defter_yolu.parent.mkdir(parents=True, exist_ok=True)
        defter_yolu.write_text("BOZUK\n", encoding="utf-8")
        # Assert
        assert client.post("/process_doc", json={}).status_code == 402

    def test_402_KOTA_YAKMAZ(self, client, monkeypatch, demo_acik, defter_yolu):
        # Arrange — önce bütçeyi kapat
        defter_yolu.parent.mkdir(parents=True, exist_ok=True)
        defter_yolu.write_text("BOZUK\n", encoding="utf-8")
        c = TestClient(main.app)
        for _ in range(5):
            assert c.post("/process_doc", json={}).status_code == 402
        # Act — bütçe düzeldi
        defter_yolu.unlink()
        demo_butce.DEFTER.sifirla_test_icin()
        # Assert — haklar duruyor (402 bir belge hakkını harcamamalı)
        assert c.post("/process_doc", json={}).status_code == 422

    def test_rezervasyon_deftere_yazilir_sonra_MUTABAKAT(self, client, demo_acik, defter_yolu):
        # Act — 422 alan istek hiç LLM cagirmaz
        client.post("/process_doc", json={})
        # Assert — once rezervasyon, sonra iade: iki satir, net 0
        satirlar = [s for s in defter_yolu.read_text(encoding="utf-8").splitlines() if s.strip()]
        assert len(satirlar) == 2, satirlar
        assert demo_butce.DEFTER.harcanan() == pytest.approx(0.0, abs=1e-9)


class TestCerez:
    def test_ilk_istekte_cerez_basilir(self, client, demo_acik):
        # Act
        y = client.post("/process_doc", json={})
        # Assert
        cerez = y.headers.get("set-cookie", "")
        assert "ke_ziyaretci=" in cerez
        assert "HttpOnly" in cerez
        assert "SameSite=Lax" in cerez

    def test_http_semasinda_Secure_BASILMAZ(self, client, demo_acik):
        """LAN/QR telefon yolu http'dir; koşulsuz Secure çerezi sessizce attırırdı."""
        y = client.post("/process_doc", json={})
        assert "Secure" not in y.headers.get("set-cookie", "")

    def test_cerezli_istemci_AYRI_kova_alir(self, demo_acik):
        # Arrange — iki ayrı çerez = iki ayrı ziyaretçi kovası
        a, b = cerezli_istemci(), cerezli_istemci()
        for _ in range(3):
            a.post("/process_doc", json={})
        # Act — a tükendi
        assert a.post("/process_doc", json={}).status_code == 429
        # Assert — b'nin hakkı duruyor (çerezler ayrı)
        assert b.post("/process_doc", json={}).status_code == 422

    def test_serbest_ucta_da_cerez_basilir(self, client, demo_acik):
        y = client.post("/yazi/render", json={})
        assert "ke_ziyaretci=" in y.headers.get("set-cookie", "")


class TestMiddlewareSirasi:
    def test_413_kotayi_YAKMAZ(self, client, demo_acik):
        """MaxBodySize kapıdan DIŞTA olmalı — büyük gövde hak harcamamalı."""
        # Arrange — 25 MB Content-Length beyanı
        c = cerezli_istemci()
        y = c.post("/process_doc", content=b"x" * 100,
                   headers={"content-length": str(25 * 1024 * 1024)})
        # Assert — 413 geldi
        assert y.status_code == 413
        # Assert — üç hak da duruyor
        for _ in range(3):
            assert c.post("/process_doc", json={}).status_code == 422

    def test_402_yaniti_GUVENLIK_basliklarini_tasir(self, client, monkeypatch):
        """Kapı SecurityHeaders'ın İÇİNDE olmalı."""
        # Arrange
        monkeypatch.setenv("DEMO_KORUMA", "1")
        monkeypatch.delenv("DEMO_AZAMI_GUNLUK_USD", raising=False)
        # Act
        y = client.post("/process_doc", json={})
        # Assert
        assert y.status_code == 402
        assert y.headers.get("x-content-type-options") == "nosniff"
        assert y.headers.get("x-frame-options") == "DENY"

    def test_429_yaniti_GUVENLIK_basliklarini_tasir(self, demo_acik):
        c = cerezli_istemci()
        for _ in range(3):
            c.post("/process_doc", json={})
        y = c.post("/process_doc", json={})
        assert y.status_code == 429
        assert y.headers.get("x-content-type-options") == "nosniff"


class TestUcretliMi:
    def test_yalniz_POST(self):
        from api.middleware.demo_kapisi import ucretli_mi
        assert ucretli_mi("/process_doc", "POST") is True
        assert ucretli_mi("/process_doc", "GET") is False

    def test_sondaki_slash_toleransli(self):
        from api.middleware.demo_kapisi import ucretli_mi
        assert ucretli_mi("/process_doc/", "POST") is True

    def test_bilinmeyen_yol_ucretsiz(self):
        from api.middleware.demo_kapisi import ucretli_mi
        assert ucretli_mi("/hic-olmayan", "POST") is False
