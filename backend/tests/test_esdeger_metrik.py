"""Operasyonel-eşdeğer sınıf grupları + operasyonel doğruluk metriği testleri.

config.EVRAK_ESDEGER haritası (yakın-eş-anlamlı tür grupları) + eval'deki
operational_accuracy / operational_macro_f1 metriklerinin DÜRÜST davranışı:
  - eşdeğer çiftler (talep↔dilekçe) operasyonel olarak doğru sayılır,
  - eşdeğer-OLMAYAN çiftler (bilgi_edinme≠dilekçe; ihbar≠şikayet) sayılmaz,
  - 'belirsiz' (abstention) hiçbir şeyle eşdeğer DEĞİL (sıkı kalır),
  - operasyonel skor sıkı skordan ASLA düşük olmaz.
Deterministik (ağ/GPU yok); AAA deseni.
"""

from __future__ import annotations

from agents.config import (
    EVRAK_ESDEGER,
    EVRAK_TURLERI,
    ayni_esdeger_grup,
    esdeger_grup,
)
from eval.evrak_class_eval import operational_accuracy, operational_macro_f1


class TestEvrakEsdegerHaritasi:
    """EVRAK_ESDEGER grupları kanonik türlerden oluşur + dürüst (aşırı-birleştirme yok)."""

    def test_tum_grup_uyeleri_gecerli_tur(self):
        # Arrange + Act
        uyeler = [t for turler in EVRAK_ESDEGER.values() for t in turler]
        # Assert — her grup üyesi kapalı-kümede + 'belirsiz' hiçbir grupta değil
        for t in uyeler:
            assert t in EVRAK_TURLERI
            assert t != "belirsiz"

    def test_tur_birden_fazla_gruba_ait_degil(self):
        # Arrange
        uyeler = [t for turler in EVRAK_ESDEGER.values() for t in turler]
        # Assert — disjoint gruplar (bir tür tek grupta)
        assert len(uyeler) == len(set(uyeler))

    def test_vatandas_talebi_grubu_dilekce_talep_basvuru_cimer(self):
        # Assert — held-out hata analizi çifti aynı grupta
        assert ayni_esdeger_grup("talep", "dilekce")
        assert ayni_esdeger_grup("basvuru", "dilekce")
        assert ayni_esdeger_grup("cimer", "dilekce")

    def test_resmi_yazi_grubu_muzekkere_genelge_ust_yazi(self):
        # Assert — resmî yazı ailesi karışmaları operasyonel eşdeğer
        assert ayni_esdeger_grup("muzekkere", "ust_yazi")
        assert ayni_esdeger_grup("genelge_talimat_olur", "ust_yazi")
        assert ayni_esdeger_grup("cevabi_yazi", "ust_yazi")

    def test_icra_dava_ayni_grup(self):
        # Assert — yargı-icra ailesi
        assert ayni_esdeger_grup("icra_evraki", "dava_evraki")


class TestEvrakEsdegerAyriTutulanlar:
    """Aşırı-birleştirmeye karşı: ayrı operasyonel rejimler eşdeğer SAYILMAZ."""

    def test_bilgi_edinme_dilekce_ile_esdeger_degil(self):
        # 4982 ayrı süre rejimi → dilekçe/talep ile değiştirilemez
        assert not ayni_esdeger_grup("bilgi_edinme", "dilekce")
        assert not ayni_esdeger_grup("bilgi_edinme", "talep")

    def test_ihbar_sikayet_ile_esdeger_degil(self):
        # ihbar soruşturma tetikler → şikayet'ten ayrı sonuç
        assert not ayni_esdeger_grup("ihbar", "sikayet")

    def test_fatura_singleton(self):
        # mali belge → kendi grubu; başka türle eşdeğer değil
        assert esdeger_grup("fatura") == "fatura"
        assert not ayni_esdeger_grup("fatura", "icra_evraki")

    def test_resmi_yazi_gorus_mutalaa_ile_esdeger_degil(self):
        # gorus_mutalaa resmî yazı ailesinde DEĞİL (ayrı hukuki işlem)
        assert not ayni_esdeger_grup("gorus_mutalaa", "ust_yazi")

    def test_belirsiz_hicbir_seyle_esdeger_degil(self):
        # abstention sıkı kalır: belirsiz yalnız belirsiz ile eşdeğer
        assert ayni_esdeger_grup("belirsiz", "belirsiz")
        assert not ayni_esdeger_grup("belirsiz", "dilekce")
        assert not ayni_esdeger_grup("dilekce", "belirsiz")


class TestOperasyonelMetrik:
    """operational_accuracy / operational_macro_f1 davranışı."""

    def test_esdeger_cift_operasyonel_dogru(self):
        # Arrange — sıkı YANLIŞ (talep≠dilekçe) ama operasyonel DOĞRU
        rows = [{"evrak_turu": "talep", "pred": "dilekce"}]
        # Act + Assert
        assert operational_accuracy(rows) == 1.0

    def test_esdeger_olmayan_cift_operasyonel_yanlis(self):
        # Arrange — bilgi_edinme≠dilekçe (ayrı rejim) → operasyonel da YANLIŞ
        rows = [{"evrak_turu": "bilgi_edinme", "pred": "dilekce"}]
        # Act + Assert
        assert operational_accuracy(rows) == 0.0

    def test_operasyonel_sikidan_dusuk_degil(self):
        # Arrange — karışık: 1 tam doğru, 1 eşdeğer, 1 tam yanlış
        rows = [
            {"evrak_turu": "fatura", "pred": "fatura"},          # sıkı + op doğru
            {"evrak_turu": "talep", "pred": "basvuru"},          # op doğru (eşdeğer)
            {"evrak_turu": "tutanak", "pred": "rapor"},          # ikisi de yanlış
        ]
        # Act
        strict = sum(1 for r in rows if r["pred"] == r["evrak_turu"]) / len(rows)
        op = operational_accuracy(rows)
        # Assert — operasyonel >= sıkı (gevşek tolerans)
        assert op >= strict
        assert round(op, 3) == round(2 / 3, 3)

    def test_operasyonel_macro_f1_aralikta(self):
        # Arrange
        rows = [
            {"evrak_turu": "talep", "pred": "dilekce"},
            {"evrak_turu": "ust_yazi", "pred": "muzekkere"},
            {"evrak_turu": "fatura", "pred": "fatura"},
        ]
        # Act
        mf1 = operational_macro_f1(rows)
        # Assert — geçerli aralık + bu set'te tüm tahminler eşdeğer → 1.0
        assert 0.0 <= mf1 <= 1.0
        assert mf1 == 1.0

    def test_bos_set_sifir(self):
        # Arrange + Act + Assert — boş set güvenli
        assert operational_accuracy([]) == 0.0
        assert operational_macro_f1([]) == 0.0
