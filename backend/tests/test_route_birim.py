"""route_birim DETERMİNİSTİK motoru birim testleri — evrak türü → birim (config eşleşmesi).

Kaynak-doğrulamalı ajan (ROUTE_AJAN) geldikten sonra `route_birim_node` çıktısı ya
kaynak-doğrulanmış GERÇEK birim adı ya da (fallback) None + hedef_kategori'dir. Bu testler
ise alttaki DETERMİNİSTİK motoru (`_route_deterministik`) doğrular — o motor artık dürüst
fallback'in kategori köprüsü ve ROUTE_AJAN=0 tam-geri-dönüş yoludur. Ajan sözleşmesi ayrı
test edilir (test_route_ajan.py). `_route_deterministik` senkron saf fonksiyondur.
"""

from __future__ import annotations

from agents.config import BIRIMLER, EVRAK_TO_BIRIM
from agents.nodes.route_birim import _route_deterministik

_EVRAK_YAZI_ISLERI = "yazi_isleri_evrak"


# ---------------------------------------------------------------------------
# config.EVRAK_TO_BIRIM eşleşme testleri
# ---------------------------------------------------------------------------


class TestRouteBirimConfigEslesmesi:
    """Her evrak türü config'de tanımlı birime yönlendirilmeli."""

    def test_dilekce_basin_halkla_iliskiler(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "arz ederim dilekçe"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert — dilekce: basin_halkla_iliskiler_cimer (config)
        beklenen = EVRAK_TO_BIRIM["dilekce"]
        assert sonuc["hedef_birim"] == beklenen, (
            f"Dilekçe için {beklenen} beklendi, {sonuc['hedef_birim']} geldi"
        )

    def test_sikayet_konuya_gore_ana_hizmete_gider(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "evrak_text": "şikayet"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["sikayet"]
        assert sonuc["hedef_birim"] == beklenen

    def test_personel_usulsuzlugu_teftise_gider(self):
        state = {
            "evrak_turu": "sikayet",
            "evrak_text": (
                "Belediye personeli olan kamu görevlisi hakkında görevi kötüye kullanma, "
                "rüşvet, yolsuzluk ve usulsüz işlem nedeniyle soruşturma talep ediyorum."
            ),
        }
        sonuc = _route_deterministik(state)
        assert sonuc["hedef_birim"] == "teftis_ic_denetim"

    def test_tebligat_hukuk_musavirligi(self):
        # Arrange
        state = {"evrak_turu": "tebligat", "evrak_text": "tebligat belgesi"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["tebligat"]
        assert sonuc["hedef_birim"] == beklenen

    def test_fatura_mali_strateji(self):
        # Arrange
        state = {"evrak_turu": "fatura", "evrak_text": "fatura ödeme"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["fatura"]
        assert sonuc["hedef_birim"] == beklenen

    def test_ust_yazi_yazi_isleri(self):
        # Arrange
        state = {"evrak_turu": "ust_yazi", "evrak_text": "T.C. Sayı: 12345"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["ust_yazi"]
        assert sonuc["hedef_birim"] == beklenen

    def test_bilgi_edinme_basin(self):
        # Arrange
        state = {"evrak_turu": "bilgi_edinme", "evrak_text": "bilgi edinme talebi"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["bilgi_edinme"]
        assert sonuc["hedef_birim"] == beklenen

    def test_dava_evraki_hukuk(self):
        # Arrange
        state = {"evrak_turu": "dava_evraki", "evrak_text": "mahkeme dava dilekçe"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        beklenen = EVRAK_TO_BIRIM["dava_evraki"]
        assert sonuc["hedef_birim"] == beklenen


# ---------------------------------------------------------------------------
# yazi_isleri_evrak alternatif listede garantisi
# ---------------------------------------------------------------------------


class TestRouteBirimAlternatiflerYaziIsleri:
    """Resmî akışta yazi_isleri_evrak alternatiflerde bulunmalı."""

    def test_dilekce_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "arz ederim dilekçe"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"], (
            "yazi_isleri_evrak alternatiflerde bulunmalı (resmî ilk-durak garantisi)"
        )

    def test_sikayet_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "evrak_text": "şikayet"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"]

    def test_tebligat_alternatiflerde_yazi_isleri_var(self):
        # Arrange
        state = {"evrak_turu": "tebligat", "evrak_text": "tebligat"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert _EVRAK_YAZI_ISLERI in sonuc["birim_alternatifleri"]


# ---------------------------------------------------------------------------
# Çıktı yapısı testleri
# ---------------------------------------------------------------------------


class TestRouteBirimCiktiYapisi:
    """Çıktı alanları her zaman geçerli ve mevcut olmalı."""

    def test_hedef_birim_gecerli_kume(self):
        # Arrange
        state = {"evrak_turu": "rapor", "evrak_text": "rapor metni"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert sonuc["hedef_birim"] in BIRIMLER

    def test_birim_alternatifleri_liste(self):
        # Arrange
        state = {"evrak_turu": "dilekce", "evrak_text": "dilekçe"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert isinstance(sonuc["birim_alternatifleri"], list)
        assert len(sonuc["birim_alternatifleri"]) >= 1

    def test_birim_reasoning_string(self):
        # Arrange
        state = {"evrak_turu": "basvuru", "evrak_text": "başvuru"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert isinstance(sonuc["birim_reasoning"], str)
        assert len(sonuc["birim_reasoning"]) > 0

    def test_belirsiz_tur_yazi_isleri_doner(self):
        # Arrange: bilinmeyen tür → config fallback yazi_isleri_evrak
        state = {"evrak_turu": "belirsiz", "evrak_text": "anlaşılmaz metin"}
        # Act
        sonuc = _route_deterministik(state)
        # Assert
        assert sonuc["hedef_birim"] in BIRIMLER  # geçerli birim döner

    def test_icerik_sinyali_hukuk_icin(self):
        # Arrange: dava/icra keyword'ü içeren metin → hukuk müşavirliğine sinyaller
        state = {
            "evrak_turu": "belirsiz",
            "evrak_text": "Dava açıldı. Haciz kararı. Mahkeme tebligatı.",
        }
        # Act
        sonuc = _route_deterministik(state)
        # Assert — içerik sinyali hukuk müşavirliğine yönlendirmeli
        assert sonuc["hedef_birim"] == "hukuk_musavirligi"


# ---------------------------------------------------------------------------
# M1 — config MUTLAK-otoriter DEĞİL: BASKIN içerik yanlış-türü ezebilir,
# ama gürültü (1-2 sözcük) config'i devirmez (petisyon koruması).
# ---------------------------------------------------------------------------


class TestRouteBirimIcerikBaskinOverride:
    """Tür yanlış sınıflandırıldığında güçlü içerik sinyali doğru birime taşır."""

    def test_baskin_icerik_yanlis_turu_ezer(self):
        # Arrange: tür 'dilekce' (config→basın/CİMER) AMA metin BASKIN hukuk sinyali
        # (≥3 kök: dava, haciz, mahkeme, icra, borçlu) ve hiç dilekçe/cimer sözcüğü yok.
        state = {
            "evrak_turu": "dilekce",
            "tur_confidence": 0.55,
            "evrak_text": "Dava açıldı, haciz kondu, mahkeme kararı var, icra takibi "
                          "başladı, borçlu tarafa müzekkere yazıldı.",
        }
        # Act
        sonuc = _route_deterministik(state)
        # Assert — baskın içerik (hukuk) yanlış olabilecek türü ezer
        assert sonuc["hedef_birim"] == "hukuk_musavirligi", (
            f"Baskın hukuk içeriği bekleniyordu, {sonuc['hedef_birim']} geldi"
        )

    def test_gurultu_config_i_devirmez(self):
        # Arrange: tür 'dilekce' + yalnız 1 gürültü sözcüğü ('sistem' → bilgi_islem).
        # 1 < eşik(3) → config OTORİTER kalmalı, dilekçe doğru ilk-birime gitmeli.
        state = {
            "evrak_turu": "dilekce",
            "tur_confidence": 0.55,
            "evrak_text": "Dilekçemle başvuruyorum; sistemde küçük bir aksaklık fark ettim.",
        }
        # Act
        sonuc = _route_deterministik(state)
        # Assert — gürültü config'i devirmez → dilekce config birimi
        assert sonuc["hedef_birim"] == EVRAK_TO_BIRIM["dilekce"], (
            f"Gürültü config'i devirmemeli; {EVRAK_TO_BIRIM['dilekce']} beklendi, "
            f"{sonuc['hedef_birim']} geldi"
        )
