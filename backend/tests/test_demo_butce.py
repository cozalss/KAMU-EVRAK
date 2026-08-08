"""core/demo_butce.py — fiyatlandırma, istek sayacı, ContextVar yayılımı.

En kritik test `test_paralel_dallarin_harcamasi_KAYBOLMAZ`: ContextVar mutable NESNE
yerine float tutsaydı, LangGraph'ın paralel dallarında (PARALEL_ANLAMA) ve OCR'ın
thread havuzunda yapılan harcamalar kopyaya yazılır, ana sayaç onları görmezdi —
tam da fan-out'un belgeyi pahalılaştırdığı yerde sessiz fail-open.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

import core.demo_butce as db
import core.gun_indeksi as gi
from core.butce_defteri import ButceDefteri, DefterAyari


@pytest.fixture(autouse=True)
def _izole(monkeypatch, tmp_path: Path):
    """Defteri tmp_path'e al, demo'yu aç, saati sabitle."""
    gi.sifirla_test_icin()
    monkeypatch.setattr(gi, "_simdi", lambda: 5000 * 86_400.0 + 1.0)
    monkeypatch.setattr(db, "DEFTER", ButceDefteri(DefterAyari(
        ad="demo-test", dosya=tmp_path / "demo.json",
        tavan_env="DEMO_AZAMI_GUNLUK_USD", gunluk=True,
    )))
    monkeypatch.setenv("DEMO_KORUMA", "1")
    monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.50")
    monkeypatch.delenv("DEMO_BELGE_REZERVASYON_USD", raising=False)
    db._ISTEK.set(None)
    # Canlı istek kümesi süreç-global: temizlenmezse önceki testin sayacı bu testin
    # uçuştaki toplamına eklenir ve bütçe sahte biçimde dolu görünür.
    with db._CANLI_KILIT:
        db._CANLI.clear()
    yield
    db._ISTEK.set(None)
    with db._CANLI_KILIT:
        db._CANLI.clear()
    gi.sifirla_test_icin()


class TestDemoAcik:
    def test_bayrak_yoksa_kapali(self, monkeypatch):
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        assert db.demo_acik() is False

    def test_tolerant_parse(self, monkeypatch):
        for deger in ("1", "true", "TRUE", "yes", "on"):
            monkeypatch.setenv("DEMO_KORUMA", deger)
            assert db.demo_acik() is True
        monkeypatch.setenv("DEMO_KORUMA", "hayir")
        assert db.demo_acik() is False

    def test_koruma_kapaliyken_acik_mi_engellemez(self, monkeypatch):
        # Arrange — koruma kapalı, tavan da tanımsız
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        monkeypatch.delenv("DEMO_AZAMI_GUNLUK_USD", raising=False)
        # Assert — normal kullanım hiç etkilenmez
        assert db.acik_mi() is True
        assert db.acik_mi_istek() is True


class TestFiyatlandirma:
    def test_bilinen_model(self):
        # 1M girdi + 1M çıktı, deepseek-v4-flash (0.30 / 1.20)
        assert db.cagri_maliyeti("deepseek-v4-flash", 1_000_000, 1_000_000) == pytest.approx(1.50)

    def test_bilinmeyen_model_EN_PAHALI_sayilir(self):
        # Arrange — kayıtsız model
        ucuz = db.cagri_maliyeti("deepseek-v4-flash", 1_000_000, 0)
        bilinmeyen = db.cagri_maliyeti("hic-duyulmamis-model", 1_000_000, 0)
        # Assert — pahalı yönde asimetri
        assert bilinmeyen > ucuz

    def test_usage_sifirsa_ASGARI_bedel(self):
        # Arrange — sıfır yazmak defteri "hiç harcanmadı"da tutar, tavanı sonsuz açar
        assert db.cagri_maliyeti("deepseek-v4-flash", 0, 0) == db._ASGARI_CAGRI_USD

    def test_goruntu_asgarisi_daha_yuksek(self):
        assert db.goruntu_maliyeti("gpt-4o-mini", 0, 0) == db._ASGARI_GORUNTU_USD
        assert db._ASGARI_GORUNTU_USD > db._ASGARI_CAGRI_USD

    def test_env_ile_fiyat_ezilebilir(self, monkeypatch):
        monkeypatch.setenv("DEMO_FIYAT_DEEPSEEK_V4_FLASH", "10,20")
        assert db.cagri_maliyeti("deepseek-v4-flash", 1_000_000, 0) == pytest.approx(10.0)

    def test_bozuk_fiyat_ezmesi_varsayilana_duser(self, monkeypatch):
        monkeypatch.setenv("DEMO_FIYAT_DEEPSEEK_V4_FLASH", "bozuk")
        assert db.cagri_maliyeti("deepseek-v4-flash", 1_000_000, 0) == pytest.approx(0.30)

    def test_negatif_token_sifir_sayilir(self):
        assert db.cagri_maliyeti("deepseek-v4-flash", -5, -5) == db._ASGARI_CAGRI_USD


class TestIstekYasamDongusu:
    def test_rezervasyon_deftere_yazilir(self):
        # Act
        sayaci = db.istek_ac()
        # Assert
        assert sayaci is not None
        assert db.gunluk_harcanan() == pytest.approx(db.rezervasyon_usd())

    def test_butce_yetmezse_istek_acilmaz(self, monkeypatch):
        # Arrange — tavan rezervasyondan küçük
        monkeypatch.setenv("DEMO_AZAMI_GUNLUK_USD", "0.001")
        # Assert
        assert db.istek_ac() is None

    def test_kapatinca_TEK_delta_satiri_yazilir(self):
        # Arrange
        sayaci = db.istek_ac()
        sayaci.ekle(0.10)
        onceki = db.gunluk_harcanan()
        # Act
        db.istek_kapat(sayaci)
        # Assert — rezervasyon + delta = gerçek harcama
        assert db.gunluk_harcanan() == pytest.approx(0.10)
        assert db.gunluk_harcanan() > onceki

    def test_tahminden_UCUZ_gelirse_negatif_delta(self):
        # Arrange — rezervasyon 0.03, gerçek 0.005
        sayaci = db.istek_ac()
        sayaci.ekle(0.005)
        # Act
        db.istek_kapat(sayaci)
        # Assert — defter bir TOPLAMDIR, negatif satır meşrudur
        assert db.gunluk_harcanan() == pytest.approx(0.005)

    def test_baglamsiz_mutabakat_HEMEN_yazar(self):
        # Arrange — arka plan görevi / eval yolu: sayaç yok
        db._ISTEK.set(None)
        # Act
        db.cagri_mutabakati("deepseek-v4-flash", 1_000_000, 0)
        # Assert — harcama ASLA düşmez
        assert db.gunluk_harcanan() == pytest.approx(0.30)

    def test_koruma_kapaliyken_mutabakat_yazmaz(self, monkeypatch):
        monkeypatch.delenv("DEMO_KORUMA", raising=False)
        db.cagri_mutabakati("deepseek-v4-flash", 1_000_000, 0)
        assert db.gunluk_harcanan() == 0.0


class TestUcustakiAsim:
    def test_acik_mi_istek_UCUSTAKI_harcamayi_sayar(self):
        # Arrange — rezervasyon 0.03 yazıldı, ama istek 0.60 harcadı
        sayaci = db.istek_ac()
        token = db.istek_baglami_kur(sayaci)
        try:
            sayaci.ekle(0.60)
            # Assert — defter hâlâ 0.03 gösterir; uçuştaki fark olmadan kapı AÇIK kalırdı
            assert db.gunluk_harcanan() == pytest.approx(0.03)
            assert db.acik_mi_istek() is False
        finally:
            db.istek_baglami_coz(token)

    def test_butce_kapisi_tavan_dolunca_yukseltir(self):
        # Arrange
        sayaci = db.istek_ac()
        token = db.istek_baglami_kur(sayaci)
        try:
            sayaci.ekle(1.0)
            # Act + Assert
            with pytest.raises(db.ButceTukendiError):
                db.butce_kapisi("deepseek-v4-flash")
            assert sayaci.kisitlandi is True
        finally:
            db.istek_baglami_coz(token)

    def test_ButceTukendi_RuntimeError_alt_sinifi(self):
        """_llm_extract fallback kümesi RuntimeError yakalar → belge yedekle TAMAMLANIR."""
        assert issubclass(db.ButceTukendiError, RuntimeError)

    def test_butce_kapisi_musaitken_gecer(self):
        sayaci = db.istek_ac()
        token = db.istek_baglami_kur(sayaci)
        try:
            db.butce_kapisi("deepseek-v4-flash")  # raise etmemeli
        finally:
            db.istek_baglami_coz(token)


class TestContextVarYayilimi:
    """ContextVar MUTABLE NESNE tutar — kopyalanan bağlamda harcama kaybolmamalı."""

    @pytest.mark.asyncio
    async def test_paralel_dallarin_harcamasi_KAYBOLMAZ(self):
        # Arrange
        sayaci = db.istek_ac()
        token = db.istek_baglami_kur(sayaci)
        try:
            async def dal(n: int):
                # asyncio.create_task bağlamı KOPYALAR; float olsaydı bu yazım kaybolurdu
                db.cagri_mutabakati("deepseek-v4-flash", n, 0)

            # Act — üç paralel dal
            await asyncio.gather(dal(1_000_000), dal(1_000_000), dal(1_000_000))
            # Assert — üçünün harcaması da ANA sayaçta
            assert sayaci.harcanan == pytest.approx(0.90)
        finally:
            db.istek_baglami_coz(token)

    @pytest.mark.asyncio
    async def test_to_thread_icindeki_harcama_KAYBOLMAZ(self):
        # Arrange — OCR sayfa döngüsü thread havuzunda koşar
        sayaci = db.istek_ac()
        token = db.istek_baglami_kur(sayaci)
        try:
            def is_parcaciginda():
                db.goruntu_mutabakati("gpt-4o-mini", 0, 0)

            # Act
            await asyncio.to_thread(is_parcaciginda)
            # Assert
            assert sayaci.harcanan == pytest.approx(db._ASGARI_GORUNTU_USD)
        finally:
            db.istek_baglami_coz(token)


class TestRezervasyonAyari:
    def test_varsayilan_en_kotu_hale_gore(self):
        # Metin yolu ~0.002 USD; taranmış yol bir mertebe pahalı → varsayılan onu karşılar
        assert db.rezervasyon_usd() >= 0.02

    def test_bozuk_env_varsayilana_duser(self, monkeypatch):
        monkeypatch.setenv("DEMO_BELGE_REZERVASYON_USD", "0,03")
        assert db.rezervasyon_usd() == 0.03
