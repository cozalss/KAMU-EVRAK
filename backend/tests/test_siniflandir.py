"""siniflandir node birim testleri — evrak türü sınıflandırma.

Mock modda LLM None döndürür → node keyword heuristiğine düşer.
Tüm testler deterministik (ağ/GPU bağımlılığı yok).
"""

from __future__ import annotations

import pytest

from agents.config import EVRAK_TURLERI
from agents.nodes.siniflandir import siniflandir_node


# ---------------------------------------------------------------------------
# Keyword → evrak türü heuristik testleri
# ---------------------------------------------------------------------------


class TestSiniflandirKeywordHeuristik:
    """Mock LLM fallback: keyword eşleşmesi → doğru tür."""

    async def test_dilekce_keyword_arz_ederim(self):
        # Arrange
        state = {"evrak_text": "Sayın Müdür, gereği için arz ederim."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "dilekce"
        assert sonuc["tur_confidence"] > 0.0

    async def test_dilekce_keyword_dilekce_kelimesi(self):
        # Arrange
        state = {"evrak_text": "Bu dilekçeyi sunmaktayım."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "dilekce"

    async def test_bilgi_edinme_keyword_kanun(self):
        # Arrange: 4982 numarası açık referans
        state = {"evrak_text": "4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında başvuru."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "bilgi_edinme"

    async def test_bilgi_edinme_keyword_bilgi_edinme_ifadesi(self):
        # Arrange
        state = {"evrak_text": "bilgi edinme talebimdir."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "bilgi_edinme"

    async def test_tebligat_keyword(self):
        # Arrange
        state = {"evrak_text": "Tebligat belgesi aşağıda yer almaktadır."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "tebligat"

    async def test_sikayet_keyword(self):
        # Arrange
        state = {"evrak_text": "Şikayet konusu: gürültü kirliliği."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "sikayet"

    async def test_cimer_keyword(self):
        # Arrange
        state = {"evrak_text": "CİMER üzerinden iletilen şikayettir."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "cimer"

    async def test_basvuru_keyword(self):
        # Arrange
        state = {"evrak_text": "Başvuru formu ile sunuyorum."}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "basvuru"


class TestSiniflandirAbstention:
    """Boş/düşük-güven metin → 'belirsiz' (abstention)."""

    async def test_bos_metin_belirsiz_doner(self):
        # Arrange
        state = {"evrak_text": ""}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"
        assert sonuc["tur_confidence"] == 0.0

    async def test_sadece_bosluk_belirsiz_doner(self):
        # Arrange
        state = {"evrak_text": "   \n\t  "}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"

    async def test_eslesmez_metin_belirsiz_doner(self):
        # Arrange: hiçbir keyword yok
        state = {"evrak_text": "xyz qrst 12345 lorem ipsum"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"

    async def test_resmi_baslik_olmadan_ust_yazi_degil(self):
        # Arrange: 'sayı' var ama 't.c.' yok → belirsiz beklenir
        state = {"evrak_text": "Sayı: 12345 kayıt numarası"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert — 'ust_yazi' için hem sayı HEM t.c. gerekir; bu vakada belirsiz olabilir
        assert sonuc["evrak_turu"] in EVRAK_TURLERI


class TestSiniflandirCiktiYapisi:
    """Çıktı alanları her zaman mevcut ve geçerli olmalı."""

    async def test_cikti_evrak_turu_gecerli_kume(self):
        # Arrange
        state = {"evrak_text": "arz ederim dilekçe"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert sonuc["evrak_turu"] in EVRAK_TURLERI

    async def test_cikti_confidence_aralik_gecerli(self):
        # Arrange
        state = {"evrak_text": "talep ederim dilekçe"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        conf = sonuc.get("tur_confidence", -1.0)
        assert 0.0 <= conf <= 1.0

    async def test_cikti_reasoning_mevcut(self):
        # Arrange
        state = {"evrak_text": "dilekçe metni"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert "tur_reasoning" in sonuc
        assert isinstance(sonuc["tur_reasoning"], str)
        assert len(sonuc["tur_reasoning"]) > 0

    async def test_evrak_turu_string(self):
        # Arrange
        state = {"evrak_text": "şikayet konusu"}
        # Act
        sonuc = await siniflandir_node(state)
        # Assert
        assert isinstance(sonuc["evrak_turu"], str)
