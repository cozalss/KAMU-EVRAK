"""Belge tutarlılık denetçisi testleri (S2) — TCKN checksum, gelecek tarih, m.11 sayı deseni.

PII guard: uyarı mesajları HAM 11 haneli numara içermemeli (kısmi maske zorunlu).
"""

from __future__ import annotations

from datetime import date

from agents.tutarlilik import tckn_checksum_gecerli, tutarlilik_kontrol

# Checksum-GEÇERLİ bilinen test numarası (algoritmik; gerçek kişiye ait değil):
# tek=1+0+0+0+1=2, çift=0 → d10=(2*7)%10=4 ✓; d11=(1+1+4)%10=6 ✓.
_GECERLI_TCKN = "10000000146"
_GECERSIZ_11_HANE = "12345678901"
_BUGUN = date(2026, 7, 2)


class TestTcknChecksum:
    def test_gecerli_tckn_kabul(self):
        assert tckn_checksum_gecerli(_GECERLI_TCKN) is True

    def test_gecersiz_dizi_red(self):
        assert tckn_checksum_gecerli(_GECERSIZ_11_HANE) is False

    def test_sifirla_baslayan_red(self):
        # TCKN 0 ile başlayamaz (telefonlar 0'la başlar → aday bile olmaz)
        assert tckn_checksum_gecerli("01234567890") is False


class TestTutarlilikKontrol:
    def test_gecerli_tckn_uyari_uretmez(self):
        # Arrange / Act
        uyarilar = tutarlilik_kontrol(f"TCKN: {_GECERLI_TCKN}", {}, bugun=_BUGUN)
        # Assert
        assert uyarilar == []

    def test_gecersiz_11_hane_uyari_ve_maske(self):
        # Arrange / Act
        uyarilar = tutarlilik_kontrol(f"TCKN: {_GECERSIZ_11_HANE}", {}, bugun=_BUGUN)
        # Assert — uyarı var AMA ham numara mesajda YOK (kısmi maske)
        assert len(uyarilar) == 1
        assert _GECERSIZ_11_HANE not in uyarilar[0]
        assert "123****01" in uyarilar[0]

    def test_telefon_degerlendirilmez(self):
        # Arrange — 0'la başlayan 11 hane = telefon → aday değil
        uyarilar = tutarlilik_kontrol("Tel: 05551234567", {}, bugun=_BUGUN)
        # Assert
        assert uyarilar == []

    def test_gelecek_tarih_uyari(self):
        uyarilar = tutarlilik_kontrol("", {"tarih": "15.08.2026"}, bugun=_BUGUN)
        assert any("ileride" in u for u in uyarilar)

    def test_gecmis_tarih_temiz(self):
        assert tutarlilik_kontrol("", {"tarih": "25.06.2026"}, bugun=_BUGUN) == []

    def test_m11_deseni_uyan_sayi_temiz(self):
        assert tutarlilik_kontrol("", {"sayi": "E-45678257-622.03-12345"}, bugun=_BUGUN) == []

    def test_m11_disi_sayi_uyari(self):
        uyarilar = tutarlilik_kontrol("", {"sayi": "B.02.1.ABC.0.10"}, bugun=_BUGUN)
        assert any("m.11" in u for u in uyarilar)

    def test_sayi_yoksa_sessiz(self):
        # Vatandaş dilekçesinde sayı olmaz → kural hiç çalışmaz
        assert tutarlilik_kontrol("", {}, bugun=_BUGUN) == []
