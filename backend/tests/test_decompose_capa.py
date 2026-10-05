"""Kaynak çapası + düşünme taksonomisi kilitleri.

2026-10: decompose'un ayrı LLM segmentasyonu (ve onun çapa filtresi) KALDIRILDI — talepler
tek yerde, cikar'ın talep kümesinde çıkarılır ve kanıt çapası orada uygulanır
(bkz. tests/test_talep_kumesi.py). Burada yalnız çapanın temel özellikleri ve route_ajan'ın
düşünme kilidi kalır.
"""

from __future__ import annotations

import inspect

from agents.talep_kumesi import capa_orani, talep_kumesi_dogrula

KAYNAK = (
    "Sokağımızdaki çukurun onarılmasını talep ediyorum. Ayrıca geçen ay gelen su "
    "faturasının yanlış hesaplandığını düşünüyorum, düzeltilmesini rica ederim."
)


class TestCapaOrani:
    def test_kaynaktan_alinan_segment_tam_capali(self):
        assert capa_orani("çukurun onarılmasını talep ediyorum", KAYNAK) == 1.0

    def test_turkce_ek_farki_capayi_bozmaz(self):
        assert capa_orani("Çukur onarımı", KAYNAK) == 1.0

    def test_uydurulmus_segment_capasiz(self):
        assert capa_orani("belediye binasının boyanması gerekiyor", KAYNAK) < 0.5

    def test_bos_segment_sifir(self):
        assert capa_orani("", KAYNAK) == 0.0


class TestKanitCapasi:
    def test_kaynakta_olmayan_kanit_duser(self):
        kume = talep_kumesi_dogrula(
            [{"kanit": "çukurun onarılmasını talep ediyorum", "ozet": "Çukur onarımı"},
             {"kanit": "belediye binasının boyanmasını istiyorum", "ozet": "Bina boyası"}],
            KAYNAK)
        assert [o["ozet"] for o in kume] == ["Çukur onarımı"]

    def test_kapali_kume_disi_tur_ve_birim_duser(self):
        kume = talep_kumesi_dogrula(
            [{"kanit": "çukurun onarılmasını talep ediyorum", "ozet": "Çukur onarımı",
              "tur": "uydurma_tur", "birim_ipucu": "uzay_ajansi"}], KAYNAK)
        assert kume[0]["tur"] == "talep" and kume[0]["birim_ipucu"] is None

    def test_liste_degilse_bos(self):
        assert talep_kumesi_dogrula("metin", KAYNAK) == []


class TestKesikKurtarmaBaglantisi:
    def test_route_ajan_kesik_kurtarmaya_BAGLANMAZ(self):
        """YARGI işi: düşünme kapatmak yanlış birime resmî görünümlü havale riskidir."""
        from agents.nodes import route_ajan

        govde = inspect.getsource(route_ajan)
        assert "kesikte_dusunmesiz" not in govde, (
            "route_ajan kesik-kurtarmaya bağlanmış — yetki kararı YARGI işidir, "
            "düşünmesiz çalıştırılamaz (bkz. config LLM_DUSUNME_CIKARIMDA_KAPALI taksonomisi)"
        )
