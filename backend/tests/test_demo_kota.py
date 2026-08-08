"""core/demo_kota.py — iki eksenli günlük belge kotası.

Ölçülen sözleşmeler: çerez silmek sınırsız hak vermez (ağ kovası sayar) · NAT arkasındaki
ofis aç kalmaz (ziyaretçi kovası ayrı) · ağ kovası dolduğunda ziyaretçi hakkı YANMAZ ·
eşzamanlı burst kotayı aşamaz · saat geri alınarak hak yenilenemez.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

import core.demo_kota as kota
import core.gun_indeksi as gi

AG = "ag:203.0.113.0/24"


@pytest.fixture(autouse=True)
def _temiz(monkeypatch):
    kota.kotayi_sifirla()
    gi.sifirla_test_icin()
    monkeypatch.setattr(gi, "_simdi", lambda: 6000 * 86_400.0 + 1.0)
    monkeypatch.delenv("DEMO_KOTA_BELGE_GUN", raising=False)
    monkeypatch.delenv("DEMO_KOTA_AG_GUN", raising=False)
    yield
    kota.kotayi_sifirla()
    gi.sifirla_test_icin()


def _gun(monkeypatch, g: int) -> None:
    monkeypatch.setattr(gi, "_simdi", lambda: g * 86_400.0 + 1.0)


class TestZiyaretciKotasi:
    def test_ucuncu_gecer_dorduncu_reddedilir(self):
        # Act + Assert
        for i in range(3):
            sonuc = kota.kota_dus("z:ali", AG)
            assert sonuc.izin is True, f"{i}. belge geçmeliydi"
        dorduncu = kota.kota_dus("z:ali", AG)
        assert dorduncu.izin is False
        assert dorduncu.sebep == "ziyaretci"
        assert dorduncu.kalan_ziyaretci == 0

    def test_kalan_sayaci_azalir(self):
        assert kota.kota_dus("z:ali", AG).kalan_ziyaretci == 2
        assert kota.kota_dus("z:ali", AG).kalan_ziyaretci == 1
        assert kota.kota_dus("z:ali", AG).kalan_ziyaretci == 0

    def test_bak_hak_YAKMAZ(self):
        # Arrange
        kota.kota_dus("z:ali", AG)
        # Act — üç kez bak
        for _ in range(3):
            durum = kota.kota_bak("z:ali", AG)
        # Assert — sayaç değişmedi
        assert durum.kalan_ziyaretci == 2

    def test_env_ile_ayarlanabilir(self, monkeypatch):
        monkeypatch.setenv("DEMO_KOTA_BELGE_GUN", "1")
        assert kota.kota_dus("z:ali", AG).izin is True
        assert kota.kota_dus("z:ali", AG).izin is False

    def test_bozuk_env_varsayilana_duser(self, monkeypatch):
        monkeypatch.setenv("DEMO_KOTA_BELGE_GUN", "uc")
        assert kota.gunluk_ziyaretci() == 3


class TestAgKotasi:
    def test_cerez_degisince_AG_kotasi_hala_sayar(self):
        """Çerez silmek 3 → 12 yapar, SINIRSIZ değil."""
        # Act — her belgede yeni çerez (temizleme saldırısı)
        gecen = 0
        for i in range(30):
            if kota.kota_dus(f"z:taze{i}", AG).izin:
                gecen += 1
        # Assert — ağ tavanında durur
        assert gecen == kota.gunluk_ag()

    def test_NAT_arkasindaki_ofis_ac_kalmaz(self):
        """Dört kişi ayrı çerezle 3'er hak alır — biri diğerini aç bırakmaz."""
        # Act
        for kisi in ("z:a", "z:b", "z:c", "z:d"):
            for _ in range(3):
                assert kota.kota_dus(kisi, AG).izin is True
        # Assert — 4 × 3 = 12 = ağ tavanı
        assert kota.kota_dus("z:e", AG).izin is False

    def test_ag_dolunca_ZIYARETCI_hakki_YANMAZ(self, monkeypatch):
        # Arrange — ağ tavanı 2, ziyaretçi tavanı 3
        monkeypatch.setenv("DEMO_KOTA_AG_GUN", "2")
        kota.kota_dus("z:baskasi", AG)
        kota.kota_dus("z:baskasi2", AG)
        # Act — taze ziyaretçi ağ tavanına takılır
        sonuc = kota.kota_dus("z:ali", AG)
        # Assert — reddedildi AMA hakkı duruyor (başkasının davranışı cezalandırmaz)
        assert sonuc.izin is False
        assert sonuc.sebep == "ag"
        assert kota.kota_bak("z:ali", AG).kalan_ziyaretci == 3

    def test_farkli_ag_ayri_kova(self):
        for i in range(12):
            kota.kota_dus(f"z:x{i}", AG)
        assert kota.kota_dus("z:yeni", "ag:198.51.100.0/24").izin is True


class TestCerezsizIstek:
    def test_cerezsizler_TEK_kovayi_paylasir(self):
        """curl döngüsü istek başına 3 değil, TOPLAM 3 alır."""
        # Arrange — çerezsizde iki anahtar aynıdır (ziyaretci_kimligi sözleşmesi)
        gecen = sum(1 for _ in range(20) if kota.kota_dus(AG, AG).izin)
        # Assert
        assert gecen == kota.gunluk_ziyaretci()

    def test_ayni_anahtar_CIFT_saymaz(self):
        # Act
        sonuc = kota.kota_dus(AG, AG)
        # Assert — tek artış: ziyaretçi 2 kaldıysa ağ da 11 kalmalı
        assert sonuc.kalan_ziyaretci == 2
        assert sonuc.kalan_ag == kota.gunluk_ag() - 1


class TestGunDonusu:
    def test_gun_donunce_hak_yenilenir(self, monkeypatch):
        # Arrange
        for _ in range(3):
            kota.kota_dus("z:ali", AG)
        assert kota.kota_dus("z:ali", AG).izin is False
        # Act — ertesi gün
        _gun(monkeypatch, 6001)
        # Assert
        assert kota.kota_dus("z:ali", AG).izin is True

    def test_saat_GERI_alinirsa_hak_yenilenmez(self, monkeypatch):
        # Arrange
        for _ in range(3):
            kota.kota_dus("z:ali", AG)
        # Act — saldırgan/işletim sistemi saati geri aldı
        _gun(monkeypatch, 5990)
        # Assert — gün indeksi yüksek-su seviyesinde kalır
        assert kota.kota_dus("z:ali", AG).izin is False

    def test_eski_gun_anahtarlari_supurulur(self, monkeypatch):
        # Arrange
        for i in range(50):
            kota.kota_dus(f"z:{i}", f"ag:10.0.{i}.0/24")
        assert len(kota._SAYAC) > 0
        # Act — gün döndü, bir istek geldi
        _gun(monkeypatch, 6002)
        kota.kota_dus("z:yeni", AG)
        # Assert — eski anahtarlar temizlendi
        assert len(kota._SAYAC) == 2


class TestEszamanlilik:
    def test_ESZAMANLI_istek_kotayi_ASMAZ(self):
        # Arrange
        gecen = []
        kilit = threading.Lock()

        def dene(_i):
            if kota.kota_dus("z:ali", AG).izin:
                with kilit:
                    gecen.append(1)

        # Act — 20 iş parçacığı × 50 deneme
        with ThreadPoolExecutor(max_workers=20) as ex:
            list(ex.map(dene, range(1000)))

        # Assert — tam olarak tavan kadar
        assert len(gecen) == kota.gunluk_ziyaretci()


class TestBellekTavani:
    def test_tavan_asilinca_yeni_anahtar_REDDEDILIR(self, monkeypatch):
        # Arrange — sözlük büyütme saldırısı
        monkeypatch.setattr(kota, "_AZAMI_ANAHTAR", 4)
        monkeypatch.setenv("DEMO_KOTA_AG_GUN", "9999")
        kota.kota_dus("z:a", "ag:1.1.1.0/24")   # 2 anahtar
        kota.kota_dus("z:b", "ag:2.2.2.0/24")   # 4 anahtar → dolu
        # Act
        sonuc = kota.kota_dus("z:c", "ag:3.3.3.0/24")
        # Assert — fail-closed
        assert sonuc.izin is False
        assert sonuc.sebep == "bellek"

    def test_MEVCUT_anahtar_tavan_dolu_olsa_da_calisir(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(kota, "_AZAMI_ANAHTAR", 2)
        kota.kota_dus("z:a", "ag:1.1.1.0/24")
        # Act — aynı anahtarlar yeni yer istemez
        sonuc = kota.kota_dus("z:a", "ag:1.1.1.0/24")
        # Assert
        assert sonuc.izin is True
