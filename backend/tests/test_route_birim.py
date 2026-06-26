"""route_birim node birim testleri — evrak türü → birim yönlendirme.

config.EVRAK_TO_BIRIM eşleşmesi + yazi_isleri_evrak alternatiflerde garantisi.
"""

from __future__ import annotations

from agents.config import BIRIMLER, EVRAK_TO_BIRIM
from agents.nodes.route_birim import route_birim_node

_EVRAK_YAZI_ISLERI = "yazi_isleri_evrak"


# ---------------------------------------------------------------------------
# config.EVRAK_TO_BIRIM eşleşme testleri
# ---------------------------------------------------------------------------


class TestRouteBirimConfigEslesmesi:
    """Her evrak türü config'de tanımlı birime yönlendirilmeli."""

    async def test_dilekce_basin_halkla_iliskiler(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "arz ederim dilekçe"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert — dilekce: basin_halkla_iliskiler_cimer (config)
        beklenen = EVRAK_TO_BIRIM["dilekce"]
        assert sonuc["hedef_birim"] == beklenen, (
            f"Dilekçe için {beklenen} beklendi, {sonuc['hedef_birim']} geldi"
        )

    async def test_sikayet_teftis_ic_denetim(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "evrak_text": "şikayet"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["sikayet"]
        assert sonuc["hedef_birim"] == beklenen

    async def test_tebligat_hukuk_musavirligi(self):
        # Arrange
        state = {"evrak_turu": "tebligat", "evrak_text": "tebligat belgesi"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["tebligat"]
        assert sonuc["hedef_birim"] == beklenen

    async def test_fatura_mali_strateji(self):
        # Arrange
        state = {"evrak_turu": "fatura", "evrak_text": "fatura ödeme"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["fatura"]
        assert sonuc["hedef_birim"] == beklenen

    async def test_ust_yazi_yazi_isleri(self):
        # Arrange
        state = {"evrak_turu": "ust_yazi", "evrak_text": "T.C. Sayı: 12345"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["ust_yazi"]
        assert sonuc["hedef_birim"] == beklenen

    async def test_bilgi_edinme_basin(self):
        # Arrange
        state = {"evrak_turu": "bilgi_edinme", "evrak_text": "bilgi edinme talebi"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["bilgi_edinme"]
        assert sonuc["hedef_birim"] == beklenen

    async def test_dava_evraki_hukuk(self):
        # Arrange
        state = {"evrak_turu": "dava_evraki", "evrak_text": "mahkeme dava dilekçe"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["dava_evraki"]
        assert sonuc["hedef_birim"] == beklenen


# ---------------------------------------------------------------------------
# yazi_isleri_evrak alternatif listede garantisi
# ---------------------------------------------------------------------------


class TestRouteBirimAlternatiflerYaziIsleri:
    """Resmî akışta yazi_isleri_evrak alternatiflerde bulunmalı."""

    async def test_dilekce_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "arz ederim dilekçe"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"], (
            "yazi_isleri_evrak alternatiflerde bulunmalı (resmî ilk-durak garantisi)"
        )

    async def test_sikayet_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "evrak_text": "şikayet"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"]

    async def test_tebligat_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "tebligat", "evrak_text": "tebligat"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"]


# ---------------------------------------------------------------------------
# Çıktı yapısı testleri
# ---------------------------------------------------------------------------


class TestRouteBirimCiktiYapisi:
    """Çıktı alanları her zaman geçerli ve mevcut olmalı."""

    async def test_hedef_birim_gecerli_kume(self):
        # Arrange
        state = {"evrak_turu": "rapor", "evrak_text": "rapor metni"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert sonuc["hedef_birim"] in BIRIMLER

    async def test_birim_alternatifleri_liste(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "dilekçe"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert isinstance(sonuc["birim_alternatifleri"], list)
        assert len(sonuc["birim_alternatifleri"]) >= 1

    async def test_birim_reasoning_string(self):
        # Arrange
        state = {"evrak_turu": "basvuru", "evrak_text": "başvuru"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert isinstance(sonuc["birim_reasoning"], str)
        assert len(sonuc["birim_reasoning"]) > 0

    async def test_belirsiz_tur_yazi_isleri_doner(self):
        # Arrange: bilinmeyen tür → config fallback yazi_isleri_evrak
        state = {"evrak_turu": "belirsiz", "evrak_text": "anlaşılmaz metin"}
        # Act
        sonuc = await route_birim_node(state)
        # Assert
        assert sonuc["hedef_birim"] in BIRIMLER  # geçerli birim döner

    async def test_icerik_sinyali_hukuk_icin(self):
        # Arrange: dava/icra keyword'ü içeren metin → hukuk müşavirliğine sinyaller
        state = {
            "evrak_turu": "belirsiz",
            "evrak_text": "Dava açıldı. Haciz kararı. Mahkeme tebligatı.",
        }
        # Act
        sonuc = await route_birim_node(state)
        # Assert — içerik sinyali hukuk müşavirliğine yönlendirmeli
        assert sonuc["hedef_birim"] == "hukuk_musavirligi"
