"""Ablasyon A/B yardımcı birim testleri — bayrak ctx-mgr + skor fn + özet + node etki.

eval/ablation_eval.py saf/birim parçaları (gold dosyası gerektirmeden): _bayrak geçici
toggle + geri-al, _skor_sinif/_skor_birim, _ab_satiri (McNemar+bootstrap özet), _crag_etki,
_verify_etki, _crag_mekanizma_kontrol (kontrollü düşük-güven state). AAA; LLM_MODE=mock.
"""

from __future__ import annotations

import agents.config as config_mod
import agents.nodes.crag as crag_mod
from eval.ablation_eval import (
    _ab_satiri,
    _bayrak,
    _crag_etki,
    _crag_mekanizma_kontrol,
    _skor_birim,
    _skor_sinif,
    _verify_etki,
)


class TestBayrakContextManager:
    """_bayrak — bir ENV bayrağını tüm consumer modüllerde geçici toggle + geri al."""

    def test_crag_acilir_ve_geri_alinir(self):
        # Arrange — başlangıç değerini kaydet
        onceki = config_mod.CRAG_ENABLED
        # Act + Assert — blok içinde True, çıkışta eski değer
        with _bayrak("CRAG_ENABLED", True):
            assert config_mod.CRAG_ENABLED is True
            assert crag_mod.CRAG_ENABLED is True
        # Assert — geri alındı
        assert config_mod.CRAG_ENABLED == onceki
        assert crag_mod.CRAG_ENABLED == onceki

    def test_verify_kapatilir_geri_alinir(self):
        # Arrange
        onceki = config_mod.VERIFY_ENABLED
        # Act
        with _bayrak("VERIFY_ENABLED", False):
            assert config_mod.VERIFY_ENABLED is False
        # Assert
        assert config_mod.VERIFY_ENABLED == onceki


class TestSkorFonksiyonlari:
    """_skor_sinif / _skor_birim — gold satırı vs pipeline çıktısı eşleşmesi."""

    def test_skor_sinif_dogru(self):
        # Act + Assert
        assert _skor_sinif({"evrak_turu": "dilekce"}, {"evrak_turu": "dilekce"}) is True

    def test_skor_sinif_yanlis(self):
        # Act + Assert
        assert _skor_sinif({"evrak_turu": "dilekce"}, {"evrak_turu": "fatura"}) is False

    def test_skor_birim_dogru(self):
        # Act + Assert
        assert _skor_birim({"beklenen_birim": "hukuk_musavirligi"},
                           {"hedef_birim": "hukuk_musavirligi"}) is True

    def test_skor_birim_yanlis(self):
        # Act + Assert
        assert _skor_birim({"beklenen_birim": "x"}, {"hedef_birim": "y"}) is False


class TestAbSatiri:
    """_ab_satiri — eşleşmiş A/B sonucundan McNemar p + bootstrap Δ özeti."""

    def test_fark_yok_anlamli_degil(self):
        # Arrange — A ve B özdeş (concordant)
        paired = [(True, True), (False, False)] * 5
        # Act
        r = _ab_satiri("test", paired)
        # Assert — acc eşit, Δ özeti 'anlamlı DEĞİL'
        assert r["acc_a"] == r["acc_b"]
        assert "anlamlı DEĞİL" in r["delta_ozet"]
        assert r["n"] == 10

    def test_b_ustun_pozitif_delta(self):
        # Arrange — B her vakada A'dan iyi
        paired = [(False, True)] * 8
        # Act
        r = _ab_satiri("test", paired)
        # Assert
        assert r["acc_b"] > r["acc_a"]

    def test_bos_paired_guvenli(self):
        # Act
        r = _ab_satiri("bos", [])
        # Assert — n=0 güvenli (sıfır bölme yok)
        assert r["n"] == 0
        assert r["acc_a"] == 0.0


class TestCragEtki:
    """_crag_etki — kaç vakada düzeltme uygulandı + güven artışı (B varyantından)."""

    def test_duzeltme_sayilir(self):
        # Arrange — B çıktılarında 1 düzeltme
        outs_b = [
            {"crag_corrected": True, "crag_guven_oncesi": 0.3, "crag_guven_sonrasi": 0.8},
            {"crag_corrected": False},
        ]
        # Act
        stat = _crag_etki([{}, {}], outs_b)
        # Assert
        assert stat["duzeltme_sayisi"] == 1
        assert stat["ort_guven_artisi"] == 0.5

    def test_duzeltme_yok_sifir_artis(self):
        # Arrange
        outs_b = [{"crag_corrected": False}, {"crag_corrected": False}]
        # Act
        stat = _crag_etki([{}, {}], outs_b)
        # Assert
        assert stat["duzeltme_sayisi"] == 0
        assert stat["ort_guven_artisi"] == 0.0


class TestVerifyEtki:
    """_verify_etki — kaç taslakta uyarı/not üretildi (B varyantı)."""

    def test_uyari_ve_not_sayilir(self):
        # Arrange
        outs_b = [
            {"verify_uyari": ["uyarı1"], "verify_notes": "not1"},
            {"verify_uyari": [], "verify_notes": ""},
        ]
        # Act
        stat = _verify_etki([{}, {}], outs_b)
        # Assert
        assert stat["uyari_uretilen"] == 1
        assert stat["not_uretilen"] == 1


class TestCragMekanizmaKontrol:
    """_crag_mekanizma_kontrol — kontrollü düşük-güven state'inde CRAG davranışı (gerçek korpus)."""

    async def test_dusuk_guven_state_calisir(self):
        # Act — kontrollü düşük-güven state'lerde mekanizma çalışır (gold dosyası gerektirmez)
        sonuc = await _crag_mekanizma_kontrol()
        # Assert — sözleşme: n + düzeltme sayısı + ort artış
        assert sonuc["n"] == 4
        assert 0 <= sonuc["duzeltme_sayisi"] <= 4
        assert "ort_guven_artisi" in sonuc
