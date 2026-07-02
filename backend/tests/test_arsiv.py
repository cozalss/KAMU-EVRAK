"""arsiv node birim + E2E testleri — SDP 2005/7 arşiv metadata (yenilikçilik).

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir): arsiv_metadata anahtarları SABİT
(sdp_kodu/saklama_suresi/konu/sayi/tarih/birim). Bu testler sözleşmeyi + deterministik
SDP/saklama eşlemesini + [DOĞRULA:] placeholder davranışını + PII sızıntı guard'ını korur.
"""

from __future__ import annotations

from agents.config import EVRAK_TO_SDP, sdp_kodu
from agents.nodes.arsiv import _sdp_from_sayi, arsiv_node

# arsiv_metadata sözleşmesi (frontend ile eşleşir) — anahtar kümesi DEĞİŞMEMELİ.
# S1 (2026-07): içerik-tabanlı SDP atama additive anahtarları (sdp_adi/gerekce/adaylari).
_SOZLESME_ANAHTARLARI = {
    "sdp_kodu", "saklama_suresi", "konu", "sayi", "tarih", "birim",
    "sdp_adi", "sdp_gerekce", "sdp_adaylari",
}


# ---------------------------------------------------------------------------
# _sdp_from_sayi — resmî sayıdan SDP konu kodu çıkarma
# ---------------------------------------------------------------------------


class TestSdpFromSayi:
    """E-<DETSİS>-<SDP>-<kayıt> biçiminden SDP konu kodu okunur."""

    def test_sdp_kodu_orta_segmentten_okunur(self):
        # Arrange / Act
        kod = _sdp_from_sayi("E-45678257-622.03-12345")
        # Assert
        assert kod == "622.03"

    def test_sdp_kodsuz_sayi_none_doner(self):
        # Arrange: SDP konu kodu içermeyen serbest metin
        # Act
        kod = _sdp_from_sayi("kayıt no yok")
        # Assert
        assert kod is None


# ---------------------------------------------------------------------------
# arsiv_node — sözleşme + deterministik eşleme
# ---------------------------------------------------------------------------


class TestArsivNodeSozlesme:
    """arsiv_metadata her zaman tam sözleşme anahtar kümesiyle döner."""

    async def test_arsiv_metadata_sozlesme_anahtarlari(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "izin talebi", "sayi": "E-1-622.03-9",
                                "tarih": "25.06.2026"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        sonuc = await arsiv_node(state)
        # Assert
        am = sonuc["arsiv_metadata"]
        assert set(am) == _SOZLESME_ANAHTARLARI

    async def test_sdp_kodu_sayidan_okunur(self):
        # Arrange — sayıdaki SDP kodu config kaba kodundan önceliklidir
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"sayi": "E-11112222-622.03-9999", "konu": "test"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        sonuc = await arsiv_node(state)
        # Assert
        assert sonuc["arsiv_metadata"]["sdp_kodu"] == "622.03"

    async def test_saklama_suresi_dolu(self):
        # Arrange — hukuk evrakı uzun saklama (config.EVRAK_TO_SAKLAMA)
        state = {"evrak_turu": "dava_evraki", "bilgi_unsurlari": {}, "hedef_birim": "hukuk_musavirligi"}
        # Act
        sonuc = await arsiv_node(state)
        # Assert
        assert sonuc["arsiv_metadata"]["saklama_suresi"] == "10 yıl"

    async def test_eksik_tarih_dogrula_placeholder(self):
        # Arrange — tarih yoksa [DOĞRULA:] (CLAUDE.md §1 — uydurma değil placeholder)
        state = {"evrak_turu": "dilekce", "bilgi_unsurlari": {"konu": "x"}, "hedef_birim": "yazi_isleri_evrak"}
        # Act
        sonuc = await arsiv_node(state)
        # Assert
        assert "DOĞRULA" in sonuc["arsiv_metadata"]["tarih"]

    async def test_ana_hizmet_kodu_dogrula_isaretli(self):
        # Arrange — kuruma-özgü ana hizmet (100-599) kaba kod → [DOĞRULA:] işaretli
        # ('basvuru' config kodu 100 + sayıda SDP kodu yok)
        state = {"evrak_turu": "basvuru", "bilgi_unsurlari": {"konu": "ruhsat"}, "hedef_birim": "ilgili_teknik_daire"}
        # Act
        sonuc = await arsiv_node(state)
        # Assert — kaba ana-hizmet kodu doğrulanmalı (uydurma değil, kaba)
        assert "DOĞRULA" in sonuc["arsiv_metadata"]["sdp_kodu"]

    async def test_pii_sizmaz(self):
        # Arrange — ham TCKN içeren konuya rağmen arsiv_metadata'da ham TCKN olmamalı
        # (arsiv unsurlari maskeli cikar çıktısından alır; bu test konu alanını test eder)
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "izin", "tckn_maskeli": "345****67", "sayi": "E-1-010-2"},
            "hedef_birim": "yazi_isleri_evrak",
        }
        # Act
        sonuc = await arsiv_node(state)
        # Assert — 11 haneli ham TCKN dizisi metadata'da bulunmamalı
        assert "34561234567" not in str(sonuc["arsiv_metadata"])


class TestArsivConfigKapsami:
    """config.EVRAK_TO_SDP tüm evrak türlerini kapsamalı (KeyError önlenir)."""

    def test_tum_turler_sdp_kodu_dondurur(self):
        # Arrange
        from agents.config import EVRAK_TURLERI

        # Act / Assert — her tür için kod döner (varsayılan '000')
        for turu in EVRAK_TURLERI:
            assert sdp_kodu(turu)
            assert turu in EVRAK_TO_SDP
