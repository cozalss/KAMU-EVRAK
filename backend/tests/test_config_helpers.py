"""config taksonomi yardımcı testleri — sdp_kodu / saklama_suresi / *_tr + bütünlük.

agents/config.py saf eşleme yardımcıları. Coverage boşluğunu kapatır + taksonomi
bütünlüğünü (her tür için SDP kodu/saklama/etiket tanımlı) regrese karşı kilitler.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import pytest

from agents.config import (
    BIRIM_TR,
    EVRAK_TO_SAKLAMA,
    EVRAK_TO_SDP,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    birim_tr,
    evrak_turu_tr,
    saklama_suresi,
    sdp_kodu,
)


class TestSdpKodu:
    """sdp_kodu — evrak türü → kaba SDP konu kodu (2005/7)."""

    def test_bilinen_tur_kod(self):
        # Act + Assert
        assert sdp_kodu("dilekce") == "010"
        assert sdp_kodu("fatura") == "841"

    def test_bilinmeyen_tur_genel(self):
        # Act + Assert — varsayılan '000'
        assert sdp_kodu("rastgele_tur") == "000"

    def test_belirsiz_genel_kod(self):
        # Act + Assert
        assert sdp_kodu("belirsiz") == "000"


class TestSaklamaSuresi:
    """saklama_suresi — tür → tipik muhafaza kategorisi."""

    def test_hukuk_evraki_uzun(self):
        # Act + Assert — dava/icra 10 yıl
        assert saklama_suresi("dava_evraki") == "10 yıl"

    def test_genel_yazisma_orta(self):
        # Act + Assert — dilekçe 5 yıl
        assert saklama_suresi("dilekce") == "5 yıl"

    def test_duzenleyici_suresiz(self):
        # Act + Assert
        assert "Süresiz" in saklama_suresi("genelge_talimat_olur")

    def test_bilinmeyen_tur_varsayilan(self):
        # Act + Assert — _SAKLAMA_VARSAYILAN = 5 yıl
        assert saklama_suresi("rastgele") == "5 yıl"


class TestTrEtiketler:
    """evrak_turu_tr / birim_tr — anahtar → Türkçe etiket (fallback anahtar)."""

    def test_evrak_turu_etiket(self):
        # Act + Assert
        assert evrak_turu_tr("dilekce") == "Dilekçe"
        assert evrak_turu_tr("cimer") == "CİMER Başvurusu"

    def test_evrak_turu_bilinmeyen_anahtar(self):
        # Act + Assert — fallback: anahtarın kendisi
        assert evrak_turu_tr("yok") == "yok"

    def test_birim_etiket(self):
        # Act + Assert
        assert birim_tr("hukuk_musavirligi") == "Hukuk Müşavirliği"

    def test_birim_bilinmeyen_anahtar(self):
        # Act + Assert
        assert birim_tr("yok") == "yok"


class TestTaksonomiButunlugu:
    """Her kanonik tür için SDP kodu + saklama + TR etiket tanımlı (kapsama garantisi)."""

    @pytest.mark.parametrize("turu", EVRAK_TURLERI)
    def test_her_tur_sdp_kodu_var(self, turu: str):
        # Assert — eksik tür yok
        assert turu in EVRAK_TO_SDP

    @pytest.mark.parametrize("turu", EVRAK_TURLERI)
    def test_her_tur_saklama_var(self, turu: str):
        # Assert
        assert turu in EVRAK_TO_SAKLAMA

    @pytest.mark.parametrize("turu", EVRAK_TURLERI)
    def test_her_tur_tr_etiket_var(self, turu: str):
        # Assert
        assert turu in EVRAK_TURU_TR

    def test_birim_tr_tam(self):
        # Arrange — BIRIM_TR tüm BIRIMLER'i kapsar
        from agents.config import BIRIMLER
        # Assert
        assert set(BIRIM_TR) == set(BIRIMLER)
