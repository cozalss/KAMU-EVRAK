"""Mevzuat retrieval eval testleri — kanun-no eşleşme + Recall@k/MRR (GERÇEK node, mock).

eval/retrieval_eval.py: saf yardımcılar (_kanun_nolari isim-köprüsü, _beklenen_nolar,
_ilk_dogru_rank) + degerlendir (mevzuat_oner_node ile, ağsız) + _gold_satirlari.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

from eval.retrieval_eval import (
    _beklenen_nolar,
    _ilk_dogru_rank,
    _kanun_nolari,
    degerlendir,
)


class TestKanunNolari:
    """_kanun_nolari — numara çıkarımı + isim köprüsü."""

    def test_dort_hane_kanun(self):
        # Act + Assert
        assert "3071" in _kanun_nolari("3071 sayılı Dilekçe Hakkı Kanunu")

    def test_2005_7_sdp_oncelikli(self):
        # Arrange — \d{3,4} 2005'i yutmadan 2005-7 yakalanır
        nolar = _kanun_nolari("2005/7 SDP genelgesi")
        # Assert
        assert "2005-7" in nolar

    def test_numara_yoksa_isim_koprusu(self):
        # Arrange — yalnız isim ("yazışma") → 2646 köprüsü
        nolar = _kanun_nolari("Resmî Yazışma Yönetmeliği m.15")
        # Assert
        assert "2646" in nolar

    def test_bos_metin_bos_set(self):
        # Act + Assert
        assert _kanun_nolari("") == set()


class TestBeklenenNolar:
    """_beklenen_nolar — beklenen_mevzuat listesinden kanun no birleşimi."""

    def test_birden_fazla_mevzuat(self):
        # Arrange
        row = {"beklenen_mevzuat": ["3071 sayılı Kanun", "4982 Bilgi Edinme"]}
        # Act
        nolar = _beklenen_nolar(row)
        # Assert
        assert nolar == {"3071", "4982"}

    def test_bos_liste(self):
        # Act + Assert
        assert _beklenen_nolar({"beklenen_mevzuat": []}) == set()


class TestIlkDogruRank:
    """_ilk_dogru_rank — ilk doğru önerinin 1-tabanlı sırası (yoksa 0)."""

    def test_top1_dogru_rank1(self):
        # Arrange — ilk öneri doğru kanunu içerir
        oneriler = [{"baslik": "3071 sayılı Kanun m.4"}]
        # Act + Assert
        assert _ilk_dogru_rank(oneriler, {"3071"}) == 1

    def test_ucuncu_sirada_dogru(self):
        # Arrange — doğru 3. sırada
        oneriler = [{"baslik": "2646 m.1"}, {"baslik": "5690 m.2"}, {"baslik": "4982 m.3"}]
        # Act + Assert
        assert _ilk_dogru_rank(oneriler, {"4982"}) == 3

    def test_hic_dogru_yok_sifir(self):
        # Arrange
        oneriler = [{"baslik": "2646 m.1"}]
        # Act + Assert
        assert _ilk_dogru_rank(oneriler, {"3071"}) == 0


class TestDegerlendir:
    """degerlendir — GERÇEK mevzuat_oner node ile Recall@k + MRR (in-memory satırlar)."""

    async def test_recall_mrr_sozlesmesi(self):
        # Arrange — küçük in-memory altın set (dilekçe→3071)
        rows = [
            {"metin": "Mahalle parkına aydınlatma talebimi arz ederim.",
             "evrak_turu": "dilekce", "beklenen_mevzuat": ["3071 sayılı Dilekçe Hakkı Kanunu"]},
            {"metin": "Kurumda mevcut kayıtların suretini istiyorum.",
             "evrak_turu": "bilgi_edinme", "beklenen_mevzuat": ["4982 Bilgi Edinme Kanunu"]},
        ]
        # Act
        res = await degerlendir(rows)
        # Assert — metrik sözleşmesi + geçerli aralık
        assert res["n"] == 2
        assert 0.0 <= res["recall_1"] <= 1.0
        assert 0.0 <= res["recall_3"] <= 1.0
        assert 0.0 <= res["mrr"] <= 1.0

    async def test_beklenen_yoksa_atlanir(self):
        # Arrange — değerlendirilebilir kanun-no yok → n=0 (atlanır)
        rows = [{"metin": "x", "evrak_turu": "belirsiz", "beklenen_mevzuat": []}]
        # Act
        res = await degerlendir(rows)
        # Assert
        assert res["n"] == 0
        assert res["recall_1"] == 0.0
