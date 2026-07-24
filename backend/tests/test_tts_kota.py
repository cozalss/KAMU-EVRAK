"""core/tts_kota.py testleri — TTS harcamasının KULLANICI BAŞINA tavanı.

Neden gerekli: /sohbet/seslendir'in slowapi limiti IP başınadır (api/middleware/ratelimit.py
key_func=get_remote_address). Aynı NAT/kurum ağındaki memurlar tek bütçeyi paylaşır ve tek
kimlik istek sayısını IP değiştirerek çoğaltabilir. Maliyet KARAKTERLE orantılı olduğu için
kota da karakter üzerinden ve kullanıcı kimliğine bağlı tutulur (slowapi kurulu olmasa da çalışır).
"""

from __future__ import annotations

import pytest

from core.tts_kota import KOTA_KARAKTER_DAKIKA, kota_dus, kotayi_sifirla


@pytest.fixture(autouse=True)
def _temiz():
    kotayi_sifirla()
    yield
    kotayi_sifirla()


class TestKotaDus:
    def test_ilk_istek_gecer(self):
        assert kota_dus("kullanici-1", 200) is True

    def test_kota_altinda_ard_arda_gecer(self):
        for _ in range(5):
            assert kota_dus("kullanici-1", 300) is True

    def test_kota_asilinca_reddedilir(self):
        assert kota_dus("kullanici-1", KOTA_KARAKTER_DAKIKA) is True
        assert kota_dus("kullanici-1", 1) is False

    def test_kullanicilar_BIRBIRINI_ETKILEMEZ(self):
        # Asıl kusur buydu: paylaşılan IP'de bir kullanıcı diğerlerini aç bırakıyordu.
        assert kota_dus("kullanici-1", KOTA_KARAKTER_DAKIKA) is True
        assert kota_dus("kullanici-1", 1) is False
        assert kota_dus("kullanici-2", 500) is True

    def test_pencere_kayinca_yeniden_acilir(self, monkeypatch):
        import core.tts_kota as kota_mod

        saat = {"t": 1000.0}
        monkeypatch.setattr(kota_mod, "_simdi", lambda: saat["t"])
        assert kota_dus("k", KOTA_KARAKTER_DAKIKA) is True
        assert kota_dus("k", 1) is False
        saat["t"] += 61.0                      # pencere geçti
        assert kota_dus("k", 1) is True

    def test_eski_kayitlar_temizlenir_bellek_sismez(self, monkeypatch):
        import core.tts_kota as kota_mod

        saat = {"t": 1000.0}
        monkeypatch.setattr(kota_mod, "_simdi", lambda: saat["t"])
        for i in range(50):
            kota_dus(f"kullanici-{i}", 10)
            saat["t"] += 5.0
        # 50 kullanıcı × 5 sn = 250 sn geçti; 60 sn penceresi dışındakiler düşmeli.
        assert len(kota_mod._pencere) < 50

    def test_sifir_karakter_kotayi_yakmaz(self):
        assert kota_dus("k", 0) is True
        assert kota_dus("k", KOTA_KARAKTER_DAKIKA) is True
