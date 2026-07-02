"""SDP katalog + içerik-tabanlı otomatik kod önerisi testleri (S1 yenilikçilik).

Kapsam: katalog-config tutarlılığı, Türkçe normalizasyon, skor/sıralama, ana-hizmet
[DOĞRULA] disiplini, arsiv_node entegrasyonu (gerekçe + aday listesi + sayı önceliği).
"""

from __future__ import annotations

from agents.config import EVRAK_TO_SDP
from agents.nodes.arsiv import arsiv_node
from agents.sdp_katalog import katalog_kodlari, sdp_adi, sdp_onerileri

# ---------------------------------------------------------------------------
# Katalog kapsamı ve tutarlılık
# ---------------------------------------------------------------------------


class TestKatalogKapsam:
    """Katalog, config.EVRAK_TO_SDP kürasyonuyla senkron kalmalı (drift guard)."""

    def test_config_kodlarinin_tamami_katalogda(self):
        # Arrange
        config_kodlari = set(EVRAK_TO_SDP.values())
        # Act / Assert — config'e kod eklenirse katalog da güncellenmeli
        eksik = config_kodlari - katalog_kodlari()
        assert not eksik, f"Katalogda eksik SDP kodları: {eksik}"

    def test_sdp_adi_dogrula_ekli_kodu_cozer(self):
        # Arrange / Act — arsiv çıktısındaki '100 [DOĞRULA: ...]' biçimi ad'a çözülmeli
        ad = sdp_adi("100 [DOĞRULA: kuruma-özgü ana hizmet kodu]")
        # Assert
        assert "ana hizmet" in ad.lower()


# ---------------------------------------------------------------------------
# sdp_onerileri — eşleme, skor, sıralama
# ---------------------------------------------------------------------------


class TestSdpOnerileri:
    def test_bilgi_edinme_metni_622_03(self):
        # Arrange / Act
        adaylar = sdp_onerileri(["4982 kapsamında bilgi edinme başvurumdur"], "bilgi_edinme")
        # Assert — anahtar eşleşme + tür uyumu → 622.03 birinci aday
        assert adaylar[0]["kod"] == "622.03"
        assert adaylar[0]["tur_uyumu"] is True
        assert "bilgi edinme" in adaylar[0]["eslesen"]

    def test_buyuk_harf_turkce_normalizasyon(self):
        # Arrange — 'İ' içeren TAM BÜYÜK metin (str.lower tek başına 'İ'yi bozar)
        # Act
        adaylar = sdp_onerileri(["BİLGİ EDİNME TALEBİM HAKKINDA"], "belirsiz")
        # Assert
        assert adaylar[0]["kod"] == "622.03"

    def test_hukuk_metni_640_birinci(self):
        # Arrange — icra metni: 640 iki anahtar + tür uyumu ile 841'in önüne geçmeli
        # Act
        adaylar = sdp_onerileri(
            ["icra müdürlüğü ödeme emrine itiraz ve haciz işlemi"], "icra_evraki"
        )
        # Assert
        assert adaylar[0]["kod"] == "640"

    def test_eslesme_yoksa_bos_liste(self):
        # Arrange — katalogda karşılığı olmayan tür + nötr metin
        # Act / Assert
        assert sdp_onerileri(["hava durumu raporu değil nötr metin"], "bilinmeyen_tur") == []

    def test_ana_hizmet_adayi_dogrula_isaretli(self):
        # Arrange / Act — 100-599 aralığı HER ZAMAN kuruma özgü → dogrula=True
        adaylar = sdp_onerileri(["ruhsat başvurusu hakkında"], "basvuru")
        # Assert
        assert adaylar[0]["kod"] == "100"
        assert adaylar[0]["dogrula"] is True

    def test_tur_uyumu_siralamayi_belirler(self):
        # Arrange — anahtar eşleşmesi olmayan nötr metin; yalnız tür sinyali var
        # Act
        adaylar = sdp_onerileri(["sayın yetkili"], "cimer")
        # Assert — tür uyumundan 622.04 tek aday olmalı
        assert adaylar[0]["kod"] == "622.04"
        assert adaylar[0]["eslesen"] == []


# ---------------------------------------------------------------------------
# arsiv_node entegrasyonu — gerekçe + adaylar + öncelik sırası
# ---------------------------------------------------------------------------


class TestArsivSdpEntegrasyon:
    async def test_icerikten_kod_ad_gerekce(self):
        # Arrange — sayı YOK → içerik eşlemesi kazanmalı
        state = {
            "evrak_turu": "bilgi_edinme",
            "bilgi_unsurlari": {"konu": "bilgi edinme başvurusu"},
            "hedef_birim": "basin_halkla_iliskiler_cimer",
        }
        # Act
        am = (await arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "622.03"
        assert am["sdp_adi"]
        assert "bilgi edinme" in am["sdp_gerekce"]
        assert 1 <= len(am["sdp_adaylari"]) <= 3

    async def test_sayidan_okunan_kod_oncelikli_ve_gerekceli(self):
        # Arrange — sayıdaki SDP kodu içerik eşleşmesini ezmeli
        state = {
            "evrak_turu": "sikayet",
            "bilgi_unsurlari": {"konu": "şikayet", "sayi": "E-11112222-020-9999"},
            "hedef_birim": "teftis_ic_denetim",
        }
        # Act
        am = (await arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "020"
        assert "sayısından" in am["sdp_gerekce"]

    async def test_ana_hizmet_secimi_dogrula_tasir(self):
        # Arrange — içerik 100'ü seçse bile [DOĞRULA:] işareti korunmalı (CLAUDE.md §1)
        state = {
            "evrak_turu": "basvuru",
            "bilgi_unsurlari": {"konu": "imar ruhsat başvurusu"},
            "hedef_birim": "ilgili_teknik_daire",
        }
        # Act
        am = (await arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"].startswith("100")
        assert "DOĞRULA" in am["sdp_kodu"]

    async def test_ozet_alani_eslemeye_katilir(self):
        # Arrange — konu boş; sinyal maskeli ÖZETTEN gelmeli
        state = {
            "evrak_turu": "belirsiz",
            "bilgi_unsurlari": {},
            "ozet": "İcra dairesinin haciz işlemine ilişkin mahkeme evrakı.",
            "hedef_birim": "hukuk_musavirligi",
        }
        # Act
        am = (await arsiv_node(state))["arsiv_metadata"]
        # Assert
        assert am["sdp_kodu"] == "640"
