"""retrieval_eval harness testleri — Recall@k/MRR eşleşme mantığı + uçtan-uca.

Saf yardımcılar (kanun-no çıkarımı, rank, isim köprüsü) deterministik test edilir;
`degerlendir` küçük in-memory altın set + gerçek korpus üzerinde çalıştırılır.
AAA deseni.
"""

from __future__ import annotations

from eval.retrieval_eval import (
    _beklenen_nolar,
    _ilk_dogru_rank,
    _kanun_nolari,
    degerlendir,
)


class TestKanunNoCikarimi:
    def test_uc_dort_haneli_kanun_no(self):
        # Arrange + Act + Assert
        assert _kanun_nolari("3071 sayılı Dilekçe Hakkı Kanunu m.4") == {"3071"}
        assert "4982" in _kanun_nolari("4982 Bilgi Edinme m.11")

    def test_sdp_2005_7_ozel_bicim(self):
        # Arrange + Act + Assert — 2005/7 SDP genelgesi normalize edilir
        assert "2005-7" in _kanun_nolari("Standart Dosya Planı 2005/7")

    def test_numarasiz_yonetmelik_isim_koprusu_2646(self):
        # Arrange + Act — numara yok ama "yazışma" geçer → 2646 köprüsü
        nolar = _kanun_nolari("Resmî Yazışma Yönetmeliği m.15 (İlgi atfı)")
        # Assert
        assert nolar == {"2646"}

    def test_iki_basamakli_madde_no_kanun_sayilmaz(self):
        # Arrange + Act — "m.4" tek başına kanun değil (2-3 hane sınırı)
        # Assert — yalnız 4982 yakalanır, "11" madde no kanun olarak alınmaz
        assert _kanun_nolari("4982 m.11") == {"4982"}


class TestRankHesabi:
    def test_dogru_oneri_birinci_sirada(self):
        # Arrange
        oneriler = [{"baslik": "3071 dilekce m.4"}, {"baslik": "2646 m.16"}]
        # Act + Assert
        assert _ilk_dogru_rank(oneriler, {"3071"}) == 1

    def test_dogru_oneri_ucuncu_sirada(self):
        # Arrange
        oneriler = [{"baslik": "2646 m.16"}, {"baslik": "2646 m.11"}, {"baslik": "7201 m.7"}]
        # Act + Assert
        assert _ilk_dogru_rank(oneriler, {"7201"}) == 3

    def test_dogru_oneri_yok_sifir(self):
        # Arrange
        oneriler = [{"baslik": "2646 m.16"}]
        # Act + Assert — beklenen kanun listede yok → rank 0 (miss)
        assert _ilk_dogru_rank(oneriler, {"3071"}) == 0


class TestBeklenenNolar:
    def test_beklenen_mevzuat_listesinden_no_cikar(self):
        # Arrange
        row = {"beklenen_mevzuat": ["3071 sayılı ... m.4", "4982 ... m.11"]}
        # Act + Assert
        assert _beklenen_nolar(row) == {"3071", "4982"}


class TestDegerlendirUctanUca:
    async def test_dilekce_ve_tebligat_dogru_getirilir(self):
        # Arrange — gerçek korpus üzerinde minik altın set
        rows = [
            {"evrak_turu": "dilekce", "metin":
             "Dilekçe ile başvurma hakkı; ad soyad imza adres zorunlu.",
             "beklenen_mevzuat": ["3071 m.4"]},
            {"evrak_turu": "tebligat", "metin":
             "Elektronik tebligat beşinci günün sonunda yapılmış sayılır.",
             "beklenen_mevzuat": ["7201 m.7/a"]},
        ]
        # Act
        res = await degerlendir(rows)
        # Assert — her iki tür de top-3'te doğru kanunu getirir
        assert res["n"] == 2
        assert res["recall_3"] == 1.0
        assert 0.0 <= res["mrr"] <= 1.0
