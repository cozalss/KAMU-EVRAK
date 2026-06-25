"""eksik_tespit node birim testleri — tür-bağımlı zorunlu alan kontrolü.

Mock modda LLM None döndürür → sabit Türkçe şablon sorular (fallback).
"""

from __future__ import annotations

import pytest

from agents.nodes.eksik_tespit import eksik_tespit_node


# ---------------------------------------------------------------------------
# Dilekçede eksik alan tespiti
# ---------------------------------------------------------------------------


class TestEksikTespitDilekce:
    """3071 m.4: dilekçede ad-soyad + imza + adres zorunlu."""

    async def test_dilekce_gonderen_eksik_tespit_edilir(self):
        # Arrange: bilgi_unsurlari'nda gonderen yok
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "tarih": "25.06.2026",
                "konu": "İzin talebi",
                "talep": True,
                "iletisim_adres": True,
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert — gonderen_ad_soyad eksik olmalı
        assert "gonderen_ad_soyad" in sonuc["eksik_alanlar"]

    async def test_dilekce_imza_eksik_tespit_edilir(self):
        # Arrange: imza yok
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "gonderen": "Ayşe Yılmaz",
                "tarih": "25.06.2026",
                "konu": "Şikayet",
                "talep": True,
                "iletisim_adres": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert "imza" in sonuc["eksik_alanlar"]

    async def test_dilekce_adres_eksik_tespit_edilir(self):
        # Arrange: adres/telefon yok
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "gonderen": "Ayşe Yılmaz",
                "tarih": "25.06.2026",
                "konu": "İzin",
                "talep": True,
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert "iletisim_adres" in sonuc["eksik_alanlar"]

    async def test_dilekce_tam_eksik_yok(self):
        # Arrange: tüm zorunlu alanlar mevcut (gonderen + tckn_maskeli/kurum + tarih +
        # konu + talep + iletisim_adres + imza)
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "gonderen": "Ayşe Yılmaz",
                "tckn_maskeli": "345***01",
                "tarih": "25.06.2026",
                "konu": "Personel izni",
                "talep": True,
                "iletisim_adres": True,
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert sonuc["eksik_alanlar"] == [], (
            f"Tam dilekçede eksik alan beklenmiyordu: {sonuc['eksik_alanlar']}"
        )

    async def test_dilekce_bos_bilgi_unsurlar_cok_eksik(self):
        # Arrange: hiç bilgi yok
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {},
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert — çok sayıda eksik alan olmalı
        assert len(sonuc["eksik_alanlar"]) >= 3


# ---------------------------------------------------------------------------
# Resmî yazı (üst yazı) eksik alan tespiti
# ---------------------------------------------------------------------------


class TestEksikTespitResmiYazi:
    """Resmî yazılar (ust_yazi/cevabi_yazi): farklı zorunlu alan kümesi."""

    async def test_ust_yazi_konu_eksik_tespit_edilir(self):
        # Arrange: konu yok
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {
                "tarih": "25.06.2026",
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert "konu" in sonuc["eksik_alanlar"]

    async def test_ust_yazi_tarih_eksik_tespit_edilir(self):
        # Arrange
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {
                "konu": "Bilgilendirme",
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert "tarih" in sonuc["eksik_alanlar"]

    async def test_ust_yazi_tckn_adres_zorunlu_degil(self):
        # Arrange: resmî yazıda TCKN/adres gerekmez
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {
                "tarih": "25.06.2026",
                "konu": "Bilgilendirme",
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert — TCKN/adres resmî yazı için eksik sayılmamalı
        eksik = sonuc["eksik_alanlar"]
        assert "tckn_veya_kurum" not in eksik
        assert "iletisim_adres" not in eksik


# ---------------------------------------------------------------------------
# clarify_questions testi
# ---------------------------------------------------------------------------


class TestClarifyQuestions:
    """Eksik alan olduğunda clarify_questions üretilmeli."""

    async def test_eksik_varsa_soru_uretilir(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {},
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert len(sonuc["clarify_questions"]) > 0

    async def test_eksik_yoksa_soru_uretilmez(self):
        # Arrange: tam dilekçe
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "gonderen": "Ayşe Yılmaz",
                "tckn_maskeli": "345***01",
                "tarih": "25.06.2026",
                "konu": "İzin",
                "talep": True,
                "iletisim_adres": True,
                "imza": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert sonuc["clarify_questions"] == []

    async def test_her_eksik_alan_icin_soru_var(self):
        # Arrange: yalnız gonderen ve imza eksik
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {
                "tarih": "25.06.2026",
                "konu": "Test",
                "talep": True,
                "iletisim_adres": True,
            },
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        eksik = sonuc["eksik_alanlar"]
        sorular = sonuc["clarify_questions"]
        # Assert — en az eksik kadar soru olmalı
        assert len(sorular) >= 1, "Eksik alan var ama soru üretilmedi"

    async def test_sorular_string_listesi(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {},
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        sorular = sonuc["clarify_questions"]
        assert isinstance(sorular, list)
        assert all(isinstance(s, str) for s in sorular)

    async def test_cikti_anahtarlari_mevcut(self):
        # Arrange
        state = {
            "evrak_turu": "basvuru",
            "bilgi_unsurlari": {},
        }
        # Act
        sonuc = await eksik_tespit_node(state)
        # Assert
        assert "eksik_alanlar" in sonuc
        assert "clarify_questions" in sonuc
