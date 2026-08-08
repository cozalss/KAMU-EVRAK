"""core/gun_indeksi.py + core/butce_defteri.py — günlük bütçe tabanı.

Bu iki modül DEMONUN PARA GARANTİSİDİR: kota adalet aracıdır, aşılabilir; defter
aşılamaz. O yüzden testler "mutlu yol"dan çok BOZULMA yollarını kovalar — bozuk satır,
silinen dosya, geri alınan saat, salt-okunur dizin, eşzamanlı burst.

Desen `tests/test_kaynak_web_arama.py`'den: defter tmp_path'e izole edilir, saat
monkeypatch'lenir, ortam değişkeni test başına set edilir.
"""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import core.gun_indeksi as gi
from core.butce_defteri import ButceDefteri, DefterAyari

TAVAN_ENV = "TEST_AZAMI_GUNLUK_USD"


@pytest.fixture(autouse=True)
def _temiz(monkeypatch):
    """Her testte gün indeksi sıfır, tavan tanımsız."""
    gi.sifirla_test_icin()
    monkeypatch.delenv(TAVAN_ENV, raising=False)
    yield
    gi.sifirla_test_icin()


@pytest.fixture
def defter(tmp_path: Path) -> ButceDefteri:
    return ButceDefteri(DefterAyari(
        ad="test", dosya=tmp_path / "harcama.json", tavan_env=TAVAN_ENV, gunluk=True,
    ))


def _saati_sabitle(monkeypatch, gun: int) -> None:
    """Gün indeksini verilen güne çiviler."""
    monkeypatch.setattr(gi, "_simdi", lambda: gun * 86_400.0 + 1.0)


class TestGunIndeksi:
    """UTC gün indeksi — geri gitmez."""

    def test_gun_ileri_gidince_artar(self, monkeypatch):
        # Arrange
        _saati_sabitle(monkeypatch, 100)
        assert gi.bugun_indeksi() == 100
        # Act
        _saati_sabitle(monkeypatch, 101)
        # Assert
        assert gi.bugun_indeksi() == 101

    def test_saat_GERI_alinirsa_gun_geri_GITMEZ(self, monkeypatch):
        # Arrange — gün 200 görüldü
        _saati_sabitle(monkeypatch, 200)
        assert gi.bugun_indeksi() == 200
        # Act — saat geriye alındı (NTP/elle/snapshot)
        _saati_sabitle(monkeypatch, 150)
        # Assert — yüksek su seviyesi tutuyor, dolmuş kota geri açılmaz
        assert gi.bugun_indeksi() == 200

    def test_sifirlama_test_icin_calisir(self, monkeypatch):
        _saati_sabitle(monkeypatch, 300)
        gi.bugun_indeksi()
        gi.sifirla_test_icin()
        _saati_sabitle(monkeypatch, 250)
        assert gi.bugun_indeksi() == 250


class TestTavanOkuma:
    """azami_harcama — her bozuk girdi KAPALI'ya düşer."""

    def test_tanimsizsa_kapali(self, defter):
        # Assert — tavan yoksa harcama yapılmaz (sözleşme)
        assert defter.azami_harcama() == 0.0
        assert defter.acik_mi() is False

    def test_turkce_ondalik_VIRGUL_kapali(self, defter, monkeypatch):
        # Arrange — en olası operatör hatası
        monkeypatch.setenv(TAVAN_ENV, "0,50")
        # Assert — sessizce yorumlanmaz, kapanır
        assert defter.azami_harcama() == 0.0
        assert defter.acik_mi() is False

    def test_birimli_yazim_kapali(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "0.50 USD")
        assert defter.azami_harcama() == 0.0

    def test_negatif_kapali(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "-5")
        assert defter.azami_harcama() == 0.0

    def test_gecerli_tavan_acar(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "0.50")
        assert defter.azami_harcama() == 0.50
        assert defter.acik_mi() is True


class TestHarcananFailClosed:
    """harcanan — okuma yollarının tamamı fail-closed."""

    def test_dosya_yoksa_sifir(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        assert defter.harcanan() == 0.0

    def test_bozuk_satir_sonsuz_ve_kapali(self, defter, monkeypatch):
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        defter.ayar.dosya.parent.mkdir(parents=True, exist_ok=True)
        defter.ayar.dosya.write_text('{"usd": 0.01, "gun": 1}\nBOZUK SATIR\n', encoding="utf-8")
        # Assert
        assert defter.harcanan() == float("inf")
        assert defter.acik_mi() is False

    def test_gun_alani_YOKSA_bozuk_sayilir(self, defter, monkeypatch):
        # Arrange — "herhalde bugündür" varsayımı tavanı sessizce açardı
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        defter.ayar.dosya.parent.mkdir(parents=True, exist_ok=True)
        defter.ayar.dosya.write_text('{"usd": 0.01}\n', encoding="utf-8")
        # Assert
        assert defter.harcanan() == float("inf")

    def test_okunamiyorsa_sonsuz(self, defter, monkeypatch):
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "1.0")

        def patla(*_a, **_k):
            raise OSError("izin yok")

        monkeypatch.setattr(Path, "read_text", patla)
        # Assert
        assert defter.harcanan() == float("inf")

    def test_DUNKU_satirlar_bugunu_etkilemez(self, defter, monkeypatch):
        # Arrange — günlük pencere sözleşmesi (kesif defterinde YOK olan davranış)
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        _saati_sabitle(monkeypatch, 500)
        defter.deftere_ekle(0.90)
        assert defter.harcanan() == pytest.approx(0.90)
        # Act — gün döndü
        _saati_sabitle(monkeypatch, 501)
        # Assert — dünkü harcama bugünü bağlamaz
        assert defter.harcanan() == 0.0
        assert defter.acik_mi() is True

    def test_defter_SILINIRSE_tavan_geri_ACILMAZ(self, defter, monkeypatch):
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "0.10")
        _saati_sabitle(monkeypatch, 600)
        defter.deftere_ekle(0.20)
        assert defter.acik_mi() is False
        # Act — dosya silindi (git clean / disk temizliği / log rotasyonu)
        defter.ayar.dosya.unlink()
        # Assert — süreç-içi yüksek su seviyesi tavanı kapalı tutar
        assert defter.harcanan() == pytest.approx(0.20)
        assert defter.acik_mi() is False


class TestYazma:
    def test_satir_ekle_yalniz(self, defter, monkeypatch):
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        _saati_sabitle(monkeypatch, 700)
        # Act
        defter.deftere_ekle(0.01)
        defter.deftere_ekle(0.02)
        # Assert — iki ayrı satır, üzerine yazma yok
        satirlar = [json.loads(s) for s in
                    defter.ayar.dosya.read_text(encoding="utf-8").splitlines() if s.strip()]
        assert len(satirlar) == 2
        assert satirlar[0]["gun"] == 700
        assert defter.harcanan() == pytest.approx(0.03)

    def test_yazilamazsa_defter_KAPANIR(self, defter, monkeypatch):
        # Arrange — dosyanın yerine dizin koy → open(...,"a") OSError
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        defter.ayar.dosya.parent.mkdir(parents=True, exist_ok=True)
        defter.ayar.dosya.mkdir()
        # Act
        assert defter.deftere_ekle(0.01) is False
        # Assert — kalıcı kapalı: harcamayı kaydedemiyorsak harcama yapmayız
        assert defter.acik_mi() is False

    def test_gun_donunce_surec_sayaci_sifirlanir(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "1.0")
        _saati_sabitle(monkeypatch, 800)
        defter.deftere_ekle(0.50)
        _saati_sabitle(monkeypatch, 801)
        # Assert — yeni günde süreç-içi taban 0
        assert defter._surec_ici_taban(801) == 0.0


class TestRezervasyon:
    def test_sigmayan_rezervasyon_REDDEDILIR(self, defter, monkeypatch):
        """Tavanı bir rezervasyon kadar aşma (kesif deseninin bilinen davranışı) KAPALI."""
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "0.05")
        _saati_sabitle(monkeypatch, 900)
        # Act
        assert defter.rezerve_et(0.04) is True     # 0.04 <= 0.05 → sığar
        # Assert — 0.04 + 0.04 = 0.08 > 0.05 → tavan AŞILMAZ
        assert defter.rezerve_et(0.04) is False
        assert defter.harcanan() == pytest.approx(0.04)

    def test_tavana_TAM_oturan_rezervasyon_gecer(self, defter, monkeypatch):
        # Arrange — sınır eşitlikte açık olmalı (<=), yoksa tavan hiç kullanılamaz
        monkeypatch.setenv(TAVAN_ENV, "0.05")
        _saati_sabitle(monkeypatch, 910)
        # Act + Assert
        assert defter.rezerve_et(0.05) is True
        assert defter.rezerve_et(0.001) is False

    def test_tavan_tanimsizken_rezerve_edilmez(self, defter):
        assert defter.rezerve_et(0.01) is False

    def test_ESZAMANLI_rezervasyon_tavani_korur(self, defter, monkeypatch):
        """TOCTOU: kontrol+yaz tek kritik bölge olmazsa tavan aşılır (ölçülmüş bulgu)."""
        # Arrange
        monkeypatch.setenv(TAVAN_ENV, "0.10")
        _saati_sabitle(monkeypatch, 1000)
        rez = 0.01
        gecen = []
        kilit = threading.Lock()

        def dene(_i):
            if defter.rezerve_et(rez):
                with kilit:
                    gecen.append(1)

        # Act — 20 iş parçacığı × 10 deneme
        with ThreadPoolExecutor(max_workers=20) as ex:
            list(ex.map(dene, range(200)))

        # Assert — tavan ASLA aşılmaz (sığma kontrolü + tek kritik bölge)
        assert len(gecen) == round(0.10 / rez)
        assert defter.harcanan() <= 0.10

    def test_kalan_negatif_olmaz(self, defter, monkeypatch):
        monkeypatch.setenv(TAVAN_ENV, "0.05")
        _saati_sabitle(monkeypatch, 1100)
        defter.deftere_ekle(0.20)
        assert defter.kalan() == 0.0
