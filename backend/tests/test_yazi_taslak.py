"""yazi_taslak node birim testleri — resmî yazı taslak üretimi.

Mock modda render altyapısı (yazi.renderer) import edilemez → _fallback_taslak() çağrılır.
Tüm testler deterministik: ağ/GPU/jinja2/reportlab bağımlılığı yok.

Kontrol edilen özellikler:
- yazi_turu doğru şekilde belirlenir (EVRAK_TO_YAZI config'den)
- yazi_taslak_md alanı T.C., Konu (veya {{ }} placeholder) içerir
- Eksik unsur alanları {{ }} placeholder olarak taslakta yer alır
- format_uyumlu bool döner (fallback → False)
"""

from __future__ import annotations

import pytest

from agents.config import EVRAK_TO_YAZI
from agents.nodes.yazi_taslak import yazi_taslak_node, _fallback_taslak


# ---------------------------------------------------------------------------
# _fallback_taslak() birim testleri
# ---------------------------------------------------------------------------


class TestFallbackTaslak:
    """Render motoru yokken güvenli iskelet döner."""

    def test_yazi_turu_aktarilir(self):
        # Arrange
        yazi_turu = "dilekce_cevabi"
        konu = "İzin talebi"
        # Act
        sonuc = _fallback_taslak(yazi_turu, konu)
        # Assert
        assert sonuc["yazi_turu"] == yazi_turu

    def test_taslak_t_c_icerir(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "Test konusu")
        # Assert
        assert "T.C." in sonuc["yazi_taslak_md"]

    def test_taslak_konu_satirini_icerir(self):
        # Arrange
        konu = "Personel izin başvurusu"
        # Act
        sonuc = _fallback_taslak("cevabi_yazi", konu)
        # Assert — konu metnin içinde geçmeli
        assert konu in sonuc["yazi_taslak_md"] or "Konu" in sonuc["yazi_taslak_md"]

    def test_konu_bos_ise_placeholder_konu(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "")
        # Assert — boş konu → placeholder
        assert "{{ KONU }}" in sonuc["yazi_taslak_md"]

    def test_format_uyumlu_false(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "Test")
        # Assert — fallback her zaman format_uyumlu=False
        assert sonuc["format_uyumlu"] is False

    def test_placeholder_gövde_var(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("cevabi_yazi", "")
        # Assert — metin gövdesi boş bırakılmamalı; en az bir {{ }} placeholder olmalı
        assert "{{" in sonuc["yazi_taslak_md"]


# ---------------------------------------------------------------------------
# yazi_taslak_node() birim testleri — EVRAK_TO_YAZI eşlemesi
# ---------------------------------------------------------------------------


class TestYaziTuruEslesmesi:
    """EVRAK_TO_YAZI config'den doğru yazi_turu seçilmeli."""

    async def test_dilekce_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "İzin talebi"},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("dilekce", "cevabi_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_sikayet_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "sikayet",
            "bilgi_unsurlari": {},
            "evrak_text": "şikayet",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("sikayet", "cevabi_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_ust_yazi_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {"konu": "Resmi bilgilendirme"},
            "evrak_text": "T.C. Sayı:",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("ust_yazi", "ust_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_belirsiz_tur_cevabi_yazi_fallback(self):
        # Arrange: bilinmeyen tür → EVRAK_TO_YAZI.get() None → default "cevabi_yazi"
        state = {
            "evrak_turu": "belirsiz",
            "bilgi_unsurlari": {},
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert isinstance(sonuc["yazi_turu"], str)
        assert len(sonuc["yazi_turu"]) > 0


# ---------------------------------------------------------------------------
# yazi_taslak_node() — çıktı yapısı + T.C./Konu içerik testleri
# ---------------------------------------------------------------------------


class TestYaziTaslakCiktiYapisi:
    """Çıktı her zaman gerekli anahtarları içermeli."""

    async def test_yazi_taslak_md_mevcut(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "Test"},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "yazi_taslak_md" in sonuc
        assert isinstance(sonuc["yazi_taslak_md"], str)
        assert len(sonuc["yazi_taslak_md"]) > 0

    async def test_yazi_turu_anahtari_mevcut(self):
        # Arrange
        state = {"evrak_turu": "basvuru", "bilgi_unsurlari": {}, "evrak_text": ""}
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "yazi_turu" in sonuc

    async def test_format_uyumlu_bool(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "bilgi_unsurlari": {}, "evrak_text": ""}
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "format_uyumlu" in sonuc
        assert isinstance(sonuc["format_uyumlu"], bool)

    async def test_taslak_t_c_icerir(self):
        # Arrange: fallback taslak T.C. ile başlar
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "T.C." in sonuc["yazi_taslak_md"]

    async def test_taslak_konu_basligi_icerir(self):
        # Arrange
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {"konu": "Personel izni"},
            "evrak_text": "T.C. Sayı:",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — taslakta "Konu" etiketi veya "Konu :" olmalı
        assert "Konu" in sonuc["yazi_taslak_md"] or "KONU" in sonuc["yazi_taslak_md"]


# ---------------------------------------------------------------------------
# Eksik alan → {{ }} placeholder testleri
# ---------------------------------------------------------------------------


class TestYaziTaslakPlaceholder:
    """Eksik unsur alanları {{ }} placeholder olarak taslakta kalmalı."""

    async def test_bos_bilgi_unsurlari_placeholder_icerir(self):
        # Arrange: hiç bilgi unsuru yok → fallback iskelet
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {},
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — en az bir {{ }} placeholder olmalı
        assert "{{" in sonuc["yazi_taslak_md"], (
            "Eksik alanlarda {{ }} placeholder bekleniyor"
        )

    async def test_konu_eksik_placeholder_konu_var(self):
        # Arrange: konu bilgi_unsurlari'nda yok
        state = {
            "evrak_turu": "cevabi_yazi",
            "bilgi_unsurlari": {"imza": True},  # konu yok
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        taslak = sonuc["yazi_taslak_md"]
        # Assert — konu olmadığında ya "{{ KONU }}" placeholder ya da boş Konu satırı olmalı
        assert "KONU" in taslak or "Konu" in taslak

    async def test_evrak_turu_yok_state_cokmuyor(self):
        # Arrange: evrak_turu state'de hiç yok → KeyError olmamalı
        state = {
            "bilgi_unsurlari": {},
            "evrak_text": "test",
        }
        # Act — istisna fırlatmamalı
        try:
            sonuc = await yazi_taslak_node(state)
            assert "yazi_turu" in sonuc
        except KeyError as e:
            pytest.fail(f"KeyError fırlatıldı: {e} — state eksik alana toleranslı olmalı")
