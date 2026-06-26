"""cikar node birim testleri — bilgi unsuru çıkarma + PII maskeleme.

KRİTİK: Ham TCKN / telefon ÇIKTI'DA OLMAMALI (sızıntı guard).
Testler deterministik (mock modda LLM None döndürür → regex fallback).
"""

from __future__ import annotations

import re

from agents.nodes.cikar import _mask, _regex_unsurlar, _scrub_pii, cikar_node

# TCKN formatı: 11 haneli, ilk rakam 1-9
_TCKN_RE = re.compile(r"\b[1-9]\d{10}\b")
_TEL_RE = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")


# ---------------------------------------------------------------------------
# _mask() birim testi
# ---------------------------------------------------------------------------


class TestMask:
    """PII maskeleme yardımcısı."""

    def test_11_haneli_tckn_maskelenir(self):
        # Arrange
        girdi = "12345678901"
        # Act
        sonuc = _mask(girdi)
        # Assert — ilk 3 + son 2 görünür, orta *
        assert sonuc[:3] == "123"
        assert sonuc[-2:] == "01"
        assert "*" in sonuc

    def test_kisa_deger_tamamen_yildiz(self):
        # Arrange
        girdi = "123"
        # Act
        sonuc = _mask(girdi)
        # Assert
        assert sonuc == "***"

    def test_bos_deger_bos_doner(self):
        # Arrange
        girdi = ""
        # Act
        sonuc = _mask(girdi)
        # Assert
        assert sonuc == ""

    def test_mask_orijinal_rakamlar_kalmaz(self):
        # Arrange
        tckn = "34561234567"
        # Act
        sonuc = _mask(tckn)
        # Assert — ortadaki 5-9 rakam kaldırılmalı
        assert "456123" not in sonuc  # ortası görünmemeli


# ---------------------------------------------------------------------------
# _scrub_pii() birim testi
# ---------------------------------------------------------------------------


class TestScrubPii:
    """Serbest-metin alanında PII temizleme."""

    def test_tckn_maskelenir(self):
        # Arrange
        metin = "Başvuran: 34561234567 numaralı kişi"
        # Act
        sonuc = _scrub_pii(metin)
        # Assert — ham TCKN kalmamış olmalı
        assert not _TCKN_RE.search(sonuc), "Ham TCKN hâlâ mevcut — sızıntı var!"

    def test_telefon_maskelenir(self):
        # Arrange
        metin = "Telefon: 0532 123 45 67 numarasından ulaşabilirsiniz"
        # Act
        sonuc = _scrub_pii(metin)
        # Assert
        assert not _TEL_RE.search(sonuc), "Ham telefon hâlâ mevcut — sızıntı var!"

    def test_pii_olmayan_metin_degismez(self):
        # Arrange
        metin = "Ankara Adliyesi, 25.06.2026 tarihli dilekçe"
        # Act
        sonuc = _scrub_pii(metin)
        # Assert — PII içermiyorsa içerik korunmalı
        assert "Ankara" in sonuc
        assert "25.06.2026" in sonuc


# ---------------------------------------------------------------------------
# _regex_unsurlar() birim testleri
# ---------------------------------------------------------------------------


class TestRegexUnsurlar:
    """Deterministik regex çıkarma — tarih, sayı, konu, PII varlık/maskeleme."""

    def test_tarih_cikartilir(self):
        # Arrange
        metin = "Tarih: 15.06.2026 dilekçe"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert "tarih" in unsurlar
        assert "2026" in unsurlar["tarih"]

    def test_tarih_cizgi_ayirici(self):
        # Arrange
        metin = "Tarih: 15-06-2026"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert "tarih" in unsurlar

    def test_sayi_cikartilir(self):
        # Arrange
        metin = "Sayı: E-45678257-622.03-12345"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert "sayi" in unsurlar

    def test_konu_cikartilir(self):
        # Arrange
        metin = "Konu: Personel izin talebi"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert "konu" in unsurlar
        assert "Personel" in unsurlar["konu"] or "personel" in unsurlar["konu"].lower()

    def test_talep_tespit_edilir(self):
        # Arrange
        metin = "Gereğini bilgilerinize arz ederim."
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert unsurlar.get("talep") is True

    def test_imza_tespit_edilir(self):
        # Arrange
        metin = "İmza: Ahmet Yılmaz (e-imza)"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert unsurlar.get("imza") is True

    def test_adres_tespit_edilir(self):
        # Arrange
        metin = "Adres: Kızılay Mahalle Atatürk Cadde No:5 Ankara"
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert unsurlar.get("iletisim_adres") is True

    def test_bos_metin_bos_dict(self):
        # Arrange
        metin = ""
        # Act
        unsurlar = _regex_unsurlar(metin)
        # Assert
        assert isinstance(unsurlar, dict)


# ---------------------------------------------------------------------------
# PII SIZDIRMA GUARD — KRİTİK GÜVENLIK TESTLERİ
# ---------------------------------------------------------------------------


class TestPiiSizintiGuard:
    """Ham TCKN/telefon node çıktısında ASLA bulunmamalı."""

    async def test_ham_tckn_cikti_bilgi_unsurlari_icinde_olmaz(self):
        # Arrange
        ham_tckn = "34561234567"
        state = {
            "evrak_text": (
                f"Başvuran: {ham_tckn} kimlik numaralı Ayşe Yılmaz\n"
                "Konu: İzin talebi\nArs ederim."
            )
        }
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]

        # Assert — ham TCKN hiçbir alanda string olarak geçmemeli
        bilgi_str = str(bilgi)
        assert ham_tckn not in bilgi_str, (
            f"TCKN SIZINTI: '{ham_tckn}' bilgi_unsurlari çıktısında görünüyor!"
        )

    async def test_tckn_maskeli_alan_var_pii_var_true(self):
        # Arrange: TCKN içeren metin
        state = {
            "evrak_text": "TCKN: 34561234567 başvuru sahibi"
        }
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        # Assert — maskeleme kaydı var, varlık işaretlendi
        assert bilgi.get("pii_var") is True
        assert "tckn_maskeli" in bilgi
        # Maskeli değerde ham TCKN olmamalı
        assert "34561234567" not in bilgi["tckn_maskeli"]

    async def test_ham_telefon_cikti_icinde_olmaz(self):
        # Arrange
        ham_tel = "05321234567"
        state = {
            "evrak_text": (
                f"İletişim: {ham_tel} numarasından ulaşabilirsiniz.\n"
                "Konu: Şikayet\nArs ederim."
            )
        }
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        bilgi_str = str(bilgi)
        # Assert
        assert ham_tel not in bilgi_str, (
            f"TELEFON SIZINTI: '{ham_tel}' bilgi_unsurlari çıktısında görünüyor!"
        )

    async def test_pii_olmayan_metinde_pii_var_olmaz(self):
        # Arrange
        state = {
            "evrak_text": "Konu: İzin talebi. Tarih: 25.06.2026. Arz ederim."
        }
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        # Assert
        assert not bilgi.get("pii_var"), "PII olmayan metinde pii_var True döndü"

    async def test_hem_tckn_hem_telefon_maskelenir(self):
        # Arrange
        state = {
            "evrak_text": (
                "TCKN: 12345678901 Telefon: 0532 111 22 33\n"
                "Konu: Başvuru. Arz ederim."
            )
        }
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        bilgi_str = str(bilgi)
        # Assert — her ikisi de ham çıktıda olmamalı
        assert "12345678901" not in bilgi_str
        assert "053211122" not in bilgi_str.replace(" ", "").replace("-", "")


# ---------------------------------------------------------------------------
# Genel çıktı yapısı testleri
# ---------------------------------------------------------------------------


class TestCikarCiktiYapisi:
    """cikar_node her zaman bilgi_unsurlari dict döndürmeli."""

    async def test_cikti_bilgi_unsurlari_dict(self):
        # Arrange
        state = {"evrak_text": "Konu: Dilekçe. Arz ederim."}
        # Act
        sonuc = await cikar_node(state)
        # Assert
        assert "bilgi_unsurlari" in sonuc
        assert isinstance(sonuc["bilgi_unsurlari"], dict)

    async def test_bos_metin_bos_dict_doner(self):
        # Arrange
        state = {"evrak_text": ""}
        # Act
        sonuc = await cikar_node(state)
        # Assert
        assert isinstance(sonuc["bilgi_unsurlari"], dict)

    async def test_tarih_cikartilir_node_uzerinden(self):
        # Arrange
        state = {"evrak_text": "Tarih: 01.01.2025 başvuru metni arz ederim."}
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        # Assert
        assert "tarih" in bilgi

    async def test_konu_cikartilir_node_uzerinden(self):
        # Arrange
        state = {"evrak_text": "Konu: İdari izin talebi\nArs ederim."}
        # Act
        sonuc = await cikar_node(state)
        bilgi = sonuc["bilgi_unsurlari"]
        # Assert
        assert "konu" in bilgi
