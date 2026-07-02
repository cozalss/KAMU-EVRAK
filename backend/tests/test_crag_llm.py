"""CRAG LLM güçlendirme testleri — retrieval-evaluator (grader) + mevzuat-dili sorgu yeniden yazımı.

agents/nodes/crag.py CRAG_LLM dalı: düşük-güven dalında (1) grader her adaya
correct/ambiguous/incorrect verir — hepsi correct ise düzeltme gereksiz (erken çık);
(2) incorrect/ambiguous varsa mevzuat-dili terimler DETERMİNİSTİK sorguya EKLENİR
(değiştirmez). Deterministik fallback sözleşmesi: LLM yok/mock/bozuk çıktı → mevcut
sorgu-genişletme birebir. AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

from typing import Any

import pytest

from agents.nodes import crag as crag_mod


def _dusuk_guven_state() -> dict[str, Any]:
    """Düşük retrieval güveni (raw_score'suz score=0.3 < CRAG_CONF_ESIK) üreten state."""
    return {
        "evrak_turu": "dilekce",
        "bilgi_unsurlari": {"konu": "park aydınlatma talebi"},
        "evrak_text": "Mahalle parkına aydınlatma direği talebimi arz ederim. Ayşe Yılmaz",
        "mevzuat_onerileri": [{"baslik": "genel", "snippet": "girizgâh", "score": 0.3}],
    }


def _iyi_sonuc(query: str, turu: str = "") -> list[dict[str, Any]]:
    """Düzeltmenin uygulanmasını garantileyen güçlü (raw_score'lu) sahte korpus sonucu."""
    return [{"baslik": "3071 m.4", "snippet": "...", "score": 1.0, "raw_score": 30.0}]


def _fake_llm_json(yanitlar: list[Any], cagrilar: list[str]):
    """Sıralı sahte llm_json — çağrı user içeriğini kaydeder, kuyruktakini döndürür.

    Kuyruk biterse test hatası (beklenmeyen fazladan LLM çağrısı yakalanır).
    """

    async def _sahte(system: str, user: str, **kwargs: Any) -> Any:
        cagrilar.append(user)
        assert len(cagrilar) <= len(yanitlar), "beklenmeyen fazladan LLM çağrısı"
        return yanitlar[len(cagrilar) - 1]

    return _sahte


def _llm_yasak(monkeypatch: pytest.MonkeyPatch) -> None:
    """llm_json çağrılırsa testi patlat — 'LLM yolu hiç açılmadı' kanıtı."""

    async def _patla(*args: Any, **kwargs: Any) -> Any:  # pragma: no cover — çağrılmamalı
        raise AssertionError("llm_json çağrılmamalıydı")

    monkeypatch.setattr(crag_mod, "llm_json", _patla)


class TestSorguYenidenYazim:
    """(2) incorrect/ambiguous → mevzuat-dili terimler deterministik sorguya eklenir."""

    async def test_sahte_llm_terimleri_sorguya_eklenir(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — grader incorrect der → yeniden yazım terimleri gelir
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        cagrilar: list[str] = []
        monkeypatch.setattr(crag_mod, "llm_json", _fake_llm_json([
            {"kararlar": ["incorrect"]},
            {"terimler": ["dilekçe hakkı", "3071 sayılı kanun", "idari başvuru"]},
        ], cagrilar))
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        beklenen_det = crag_mod._genisletilmis_sorgu(state)
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — deterministik sorgu DEĞİŞMEDEN başta, terimler sonuna EKLENDİ
        assert sorgular, "_from_corpus çağrılmalıydı"
        assert sorgular[0].startswith(beklenen_det)
        assert "dilekçe hakkı" in sorgular[0]
        assert "idari başvuru" in sorgular[0]
        assert out["crag_corrected"] is True
        assert len(cagrilar) == 2  # grader + yeniden yazım (iki hafif adım)

    async def test_aday_yoksa_grader_atlanir_yeniden_yazim_calisir(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        # Arrange — hiç öneri yok (güven 0.0): değerlendirilecek aday yok → tek LLM çağrısı
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        cagrilar: list[str] = []
        monkeypatch.setattr(crag_mod, "llm_json", _fake_llm_json([
            {"terimler": ["tebligat usulü", "bilgi edinme hakkı"]},
        ], cagrilar))
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        state["mevzuat_onerileri"] = []
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — grader çağrılmadı (kuyrukta tek yanıt), terimler sorguda
        assert len(cagrilar) == 1
        assert "tebligat usulü" in sorgular[0]
        assert out["crag_corrected"] is True

    async def test_terim_listesi_temizlenir_ve_sinirlanir(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — boş/uzun terimler elenir, en fazla _MAX_TERIM terim eklenir
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        fazla = [f"terim{i}" for i in range(10)]
        monkeypatch.setattr(crag_mod, "llm_json", _fake_llm_json([
            {"kararlar": ["ambiguous"]},
            {"terimler": ["", "   ", "x" * 200, *fazla]},
        ], []))
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        # Act
        await crag_mod.crag_node(_dusuk_guven_state())
        # Assert — geçersizler yok; ilk 8 geçerli terim var, 9-10 kırpıldı
        assert "x" * 200 not in sorgular[0]
        assert "terim0" in sorgular[0]
        assert "terim7" in sorgular[0]
        assert "terim8" not in sorgular[0]
        assert "terim9" not in sorgular[0]


class TestGraderErkenCikis:
    """(1) grader hepsi-correct → düzeltme gereksiz, genişletme/yeniden-BM25 atlanır."""

    async def test_hepsi_correct_genisletme_atlanir(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — tek aday, grader 'correct' der → erken çık
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        cagrilar: list[str] = []
        monkeypatch.setattr(
            crag_mod, "llm_json", _fake_llm_json([{"kararlar": ["correct"]}], cagrilar)
        )

        def _patla(query: str, turu: str = "") -> list[dict[str, Any]]:  # pragma: no cover
            raise AssertionError("_from_corpus çağrılmamalıydı (erken çıkış)")

        monkeypatch.setattr(crag_mod, "_from_corpus", _patla)
        # Act
        out = await crag_mod.crag_node(_dusuk_guven_state())
        # Assert — düzeltme yok; yeniden yazım da çağrılmadı (tek LLM adımı)
        assert out["crag_corrected"] is False
        assert len(cagrilar) == 1


class TestDeterministikFallback:
    """LLM yok/mock/bozuk çıktı → mevcut deterministik genişletme BİREBİR korunur."""

    async def test_real_llm_none_eski_yol(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — LLM yok (real_llm None) + llm_json yasak
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: None)
        _llm_yasak(monkeypatch)
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — sorgu deterministik genişletmenin BİREBİR aynısı
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]
        assert out["crag_corrected"] is True

    async def test_mock_modda_eski_yol(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — real_llm PATCH'LENMEZ: conftest LLM_MODE=mock → gerçek LLM yok
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        _llm_yasak(monkeypatch)
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — mock'ta LLM yolu hiç açılmaz, davranış eski yolun aynısı
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]
        assert out["crag_corrected"] is True

    async def test_crag_llm_kapali_eski_yol(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — bayrak kapalı: gerçek LLM olsa bile yol açılmaz
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", False)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        _llm_yasak(monkeypatch)
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        await crag_mod.crag_node(state)
        # Assert
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]

    async def test_bozuk_grader_ciktisi_deterministik(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — grader mock-şeması/bozuk JSON döndürür → yeniden yazım da atlanır
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        cagrilar: list[str] = []
        monkeypatch.setattr(crag_mod, "llm_json", _fake_llm_json([
            {"domain": "x", "confidence": 0.5},  # tanınmayan şema (MockLLM default'u)
        ], cagrilar))
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — sorgu birebir deterministik; tek LLM denemesi yapıldı
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]
        assert out["crag_corrected"] is True
        assert len(cagrilar) == 1

    async def test_gecersiz_karar_etiketi_deterministik(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — kapalı-küme dışı etiket ("harika") → grader çıktısı geçersiz
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        monkeypatch.setattr(
            crag_mod, "llm_json", _fake_llm_json([{"kararlar": ["harika"]}], [])
        )
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        await crag_mod.crag_node(state)
        # Assert
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]

    async def test_karar_sayisi_uyusmazsa_deterministik(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — 1 aday var ama LLM 2 karar döndürür → geçersiz (aday-karar hizası şart)
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        monkeypatch.setattr(
            crag_mod, "llm_json",
            _fake_llm_json([{"kararlar": ["correct", "incorrect"]}], []),
        )
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        await crag_mod.crag_node(state)
        # Assert — "hepsi correct" YANLIŞ okunup erken çıkılmadı; sorgu deterministik
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]

    async def test_bozuk_terim_ciktisi_deterministik_sorgu(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — grader ambiguous der ama terimler liste değil → ekleme yapılmaz
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(crag_mod, "CRAG_LLM", True)
        monkeypatch.setattr(crag_mod, "real_llm", lambda: object())
        monkeypatch.setattr(crag_mod, "llm_json", _fake_llm_json([
            {"kararlar": ["ambiguous"]},
            {"terimler": "dilekçe hakkı"},  # string — liste bekleniyordu
        ], []))
        sorgular: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            sorgular.append(query)
            return _iyi_sonuc(query, turu)

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = _dusuk_guven_state()
        # Act
        out = await crag_mod.crag_node(state)
        # Assert
        assert sorgular == [crag_mod._genisletilmis_sorgu(state)]
        assert out["crag_corrected"] is True
