"""resmi_tatil modülü testleri — 2429 sabit + dini bayram (kayan) tatil takvimi.

Saf/deterministik: sabit tarihler kullanılır (bugün enjeksiyonu gerekmez). AAA deseni.
"""

from __future__ import annotations

from datetime import date

from agents.resmi_tatil import (
    is_calisma_gunu,
    is_resmi_tatil,
    sonraki_calisma_gunu,
)


class TestResmiTatil:
    def test_2429_sabit_tatil_tanindi(self):
        # 23 Nisan her yıl sabit resmî tatil (2429)
        assert is_resmi_tatil(date(2026, 4, 23)) is True
        assert is_resmi_tatil(date(2027, 4, 23)) is True  # yıldan bağımsız
        assert is_resmi_tatil(date(2026, 10, 29)) is True  # Cumhuriyet Bayramı

    def test_dini_bayram_girilmis_tarih(self):
        # Ramazan Bayramı 2026 [DOĞRULA] — girilmiş kayan tarih
        assert is_resmi_tatil(date(2026, 3, 21)) is True
        # Aynı (ay, gün) başka yılda dini bayram DEĞİL (kayar) → tatil değil
        assert is_resmi_tatil(date(2027, 3, 21)) is False

    def test_sıradan_gun_tatil_degil(self):
        assert is_resmi_tatil(date(2026, 4, 22)) is False


class TestCalismaGunu:
    def test_hafta_ici_normal_gun_calisma(self):
        # 22 Nisan 2026 Çarşamba (tatil değil) → çalışma günü
        assert is_calisma_gunu(date(2026, 4, 22)) is True

    def test_hafta_sonu_calisma_degil(self):
        # 25 Nisan 2026 Cumartesi
        assert is_calisma_gunu(date(2026, 4, 25)) is False

    def test_resmi_tatil_hafta_ici_olsa_bile_calisma_degil(self):
        # 23 Nisan 2026 hafta içi ama resmî tatil
        assert date(2026, 4, 23).weekday() < 5  # hafta içi (koşul ön-kanıtı)
        assert is_calisma_gunu(date(2026, 4, 23)) is False


class TestSonrakiCalismaGunu:
    def test_calisma_gununde_ayni_gun_doner(self):
        assert sonraki_calisma_gunu(date(2026, 4, 22)) == date(2026, 4, 22)

    def test_tatil_ve_hafta_sonu_atlanir(self):
        # 23 Nisan (tatil, Per) → 24 Cuma çalışma günü
        assert sonraki_calisma_gunu(date(2026, 4, 23)) == date(2026, 4, 24)
