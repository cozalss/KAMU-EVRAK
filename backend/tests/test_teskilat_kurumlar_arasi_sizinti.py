"""Teşkilatı bilinen kurum, başka kurumun birimini ÖNERMEZ.

Ölçülen hata (2026-08-06): Emniyet Genel Müdürlüğüne "polis memuru atama ve özlük işlemi"
sorulduğunda EGM'nin 29 doğrulanmış birimi BM25'te 0 puan aldı (görev metinleri birim adıyla
sınırlı, "atama"/"özlük" sözcükleri geçmiyor) ve arama kurum tipine göre jenerik havuza
düşerek bir BELEDİYENİN "İnsan Kaynakları ve Eğitim Müdürlüğü"nü önerdi.

Jenerik havuz korpusta karşılığı OLMAYAN kurumlar için bir köprüdür. Teşkilatı doğrulanmış
bir kurumda "eşleşme yok" demek, başka kurumun birimini önermekten dürüsttür: memur boş
liste görünce kendi bildiği birime havale eder, yanlış KURUM adı gördüğünde ise yanlış yere
yönlendirilebilir.

Bu dosya üç şeyi birden kilitler — biri diğerini bozmadan değiştirilemesin:
  1. Doğrulanmış kurumda eşleşme yoksa sonuç BOŞ (sızıntı yok).
  2. Korpusta olmayan kurum jenerik köprüyü HÂLÂ alır (kapı fazla geniş kapanmadı).
  3. Doğrulanmamış kurum + mevzuat şablonu yolu bozulmadı.
"""
from __future__ import annotations

from agents.nodes.teskilat_ara import teskilat_birim_ara

# Doğrulanmış teşkilatı olan kurum + o teşkilatta karşılığı olmayan konu.
DOGRULANMIS_KURUM = "emniyet-genel-mudurlugu"
ESLESMEYEN_KONU = "polis memuru atama ve özlük işlemi"


class TestSizintiKapisi:
    def test_dogrulanmis_kurumda_eslesme_yoksa_bos_doner(self) -> None:
        adaylar = teskilat_birim_ara(DOGRULANMIS_KURUM, ESLESMEYEN_KONU, top_k=5)
        assert adaylar == [], [(a["birim_ad"], a["kaynak_tipi"]) for a in adaylar]

    def test_dogrulanmis_kurum_baska_kurumun_birimini_dondurmez(self) -> None:
        """Ne dönerse dönsün kaynak_tipi 'jenerik' OLMAMALI — jenerik = başka kurumun havuzu."""
        for konu in (ESLESMEYEN_KONU, "emlak vergisi tahakkuku", "öğrenci kayıt işlemi",
                     "kanalizasyon bağlantı talebi"):
            adaylar = teskilat_birim_ara(DOGRULANMIS_KURUM, konu, top_k=5)
            assert all(a["kaynak_tipi"] != "jenerik" for a in adaylar), (konu, adaylar)

    def test_kendi_teskilatiyla_eslesince_normal_calisir(self) -> None:
        """Kapı, gerçek eşleşmeleri engellemiyor."""
        adaylar = teskilat_birim_ara(DOGRULANMIS_KURUM, "siber suç ihbarı", top_k=1)
        assert adaylar
        assert adaylar[0]["birim_ad"] == "Siber Suçlarla Mücadele Daire Başkanlığı"


class TestKapiFazlaGenisDegil:
    def test_korpusta_olmayan_kurum_jenerik_kopruyu_alir(self) -> None:
        """Kapı yalnız DOĞRULANMIŞ teşkilatı olan kurumda kapanır; diğerlerinde açık kalır."""
        adaylar = teskilat_birim_ara("bilinmeyen-kurum-xyz", "imar ruhsatı", top_k=3)
        assert adaylar, "korpusta olmayan kuruma öneri üretilemedi"
        assert any(a["kaynak_tipi"] == "jenerik" for a in adaylar)

    def test_dogrulanmamis_kurum_mevzuat_sablonunu_alir(self) -> None:
        """Kaynaksız kendi dosyası + 5393 şablonu olan belediyede yol bozulmadı."""
        # Fikstür hâlâ KAYNAKSIZ bir belediye olmalı; Çankaya 2026-08-06'da doğrulandı
        # (bkz. test_mevzuat_belediye_universite.TestGuvenSiralamasi notu).
        adaylar = teskilat_birim_ara("kecioren-belediyesi", "meclis kararı ve evrak kayıt", top_k=5)
        assert any(a["kaynak_tipi"] == "mevzuat_teskilat" for a in adaylar), adaylar
        assert any(a["kaynak_tipi"] == "aday" for a in adaylar), "F8: kurumun kendi kaydı düştü"
