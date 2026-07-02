"""DeepSeek listwise rerank testleri — RERANK_PROVIDER='deepseek' yolu.

LLM_MODE=mock (conftest) — gerçek DeepSeek YOK. Sahte llm_json/real_llm monkeypatch
ile üç sözleşme kanıtlanır:
  (a) sahte LLM sıralaması UYGULANIR (skorlar korunur, yalnız sıra/eleme değişir),
  (b) kapalı-küme ihlali / boş / bozuk çıktı → BM25 sırası AYNEN (None döner),
  (c) mock / RERANK_ENABLED=0 / provider='cross-encoder' → eski yollar birebir.

AAA deseni; test_mevzuat_oner.TestMevzuatOnerRerank ile aynı _DEDUP fikstür biçimi.
"""

from __future__ import annotations

from typing import ClassVar

from agents.nodes.mevzuat_oner import _maybe_rerank, mevzuat_oner_node
from retrieval.reranker import deepseek_listwise_sirala

_EXTRACT = "agents.nodes._llm_extract"
_ONER = "agents.nodes.mevzuat_oner"


def _gercek_llm_var(monkeypatch):
    """real_llm() → sahte client: 'gerçek LLM mevcut' yolu açılır (mock kapısı geçilir)."""
    monkeypatch.setattr(f"{_EXTRACT}.real_llm", lambda: object())


def _sahte_llm_json(monkeypatch, payload):
    """llm_json() → sabit sahte JSON (DeepSeek listwise cevabı simülasyonu)."""
    async def _fake(system, user, **kwargs):
        return payload

    monkeypatch.setattr(f"{_EXTRACT}.llm_json", _fake)


def _sayan_llm_json(monkeypatch):
    """llm_json çağrı sayacı — 'hiç çağrılmadı' kanıtı için (bomba yerine sayaç:
    deepseek yolu hataları graceful yuttuğundan raise tabanlı kanıt yanlış-pozitif verir)."""
    cagri = {"n": 0}

    async def _fake(system, user, **kwargs):
        cagri["n"] += 1
        return {"sira": [1]}

    monkeypatch.setattr(f"{_EXTRACT}.llm_json", _fake)
    return cagri


_ADAYLAR: list[dict] = [
    {"baslik": "3071 dilekçe hakkı kanunu m.4", "snippet": "dilekçede ad soyad imza adres zorunludur"},
    {"baslik": "4982 bilgi edinme kanunu m.11", "snippet": "başvuru on beş iş günü içinde cevaplanır"},
    {"baslik": "7201 tebligat kanunu m.10", "snippet": "tebligat bilinen en son adrese yapılır"},
]


# ---------------------------------------------------------------------------
# Birim: retrieval.reranker.deepseek_listwise_sirala — kapalı-küme doğrulaması
# ---------------------------------------------------------------------------


class TestDeepseekListwiseSirala:
    def test_sahte_siralama_uygulanir(self, monkeypatch):
        # Arrange — LLM 3. ve 1. adayı seçip 2.'yi eledi
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [3, 1]})
        # Act + Assert — 0-tabanlı indeks sırası döner
        assert deepseek_listwise_sirala("tebligat usulü", _ADAYLAR) == [2, 0]

    def test_string_numara_tolere_edilir(self, monkeypatch):
        # Arrange — LLM numaraları string döndürdü (JSON gevşekliği)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": ["2", "1"]})
        # Act + Assert
        assert deepseek_listwise_sirala("bilgi edinme", _ADAYLAR) == [1, 0]

    def test_tekrarlar_teklestirilir(self, monkeypatch):
        # Arrange — tekrar eden numara alt-küme özelliğini bozmaz → teke iner
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [2, 2, 1]})
        # Act + Assert
        assert deepseek_listwise_sirala("bilgi edinme", _ADAYLAR) == [1, 0]

    def test_kapali_kume_ihlali_none(self, monkeypatch):
        # Arrange — 99 aday kümesinde YOK → tamamı reddedilir (BM25 aynen)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [1, 99]})
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None

    def test_bos_sira_none(self, monkeypatch):
        # Arrange — LLM her şeyi eledi → boş = fallback (BM25 sırası aynen)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": []})
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None

    def test_bozuk_cikti_none(self, monkeypatch):
        # Arrange — beklenen "sira" anahtarı yok (MockLLM default şeması gibi)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"domain": "genel", "confidence": 0.5})
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None

    def test_sayi_olmayan_numara_none(self, monkeypatch):
        # Arrange — int'e çevrilemeyen numara → tamamı reddedilir
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": ["abc", 1]})
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None

    def test_llm_json_none_donerse_none(self, monkeypatch):
        # Arrange — llm_json hata/timeout'ta None döndürür (sözleşmesi)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, None)
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None

    def test_mock_modda_llm_cagrilmaz(self, monkeypatch):
        # Arrange — real_llm PATCH'siz (conftest mock) → LLM'e hiç gidilmez
        cagri = _sayan_llm_json(monkeypatch)
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", _ADAYLAR) is None
        assert cagri["n"] == 0

    def test_bos_aday_none(self, monkeypatch):
        # Arrange — aday yoksa LLM çağrılmadan None
        _gercek_llm_var(monkeypatch)
        cagri = _sayan_llm_json(monkeypatch)
        # Act + Assert
        assert deepseek_listwise_sirala("dilekçe", []) is None
        assert cagri["n"] == 0


# ---------------------------------------------------------------------------
# Bağlama: mevzuat_oner._maybe_rerank provider dağıtımı + skor koruma
# ---------------------------------------------------------------------------


class _FakeCrossEncoder:
    """Cross-encoder yolu regresyon fikstürü — adayları TERSİNE çevirir
    (test_mevzuat_oner._FakeReranker ile aynı davranış)."""

    def rerank(self, query, candidates, top_k=5):
        from retrieval.reranker import RerankResult

        out = []
        for i, c in enumerate(list(reversed(candidates))[:top_k]):
            out.append(RerankResult(
                chunk_id="", score=0.9 - i * 0.1, text=c["text"],
                source="", source_url="", domain="",
                metadata={"mevzuat": c["mevzuat"], "madde_no": c["madde_no"], "score": c["score"]},
                original_score=float(c["score"]),
            ))
        return out


class TestMaybeRerankDeepseek:
    _DEDUP: ClassVar[list] = [
        (12.0, {"mevzuat": "3071 dilekce hakki kanunu", "madde_no": 4, "text": "dilekçe unsurları"}),
        (8.0, {"mevzuat": "4982 bilgi edinme kanunu", "madde_no": 11, "text": "bilgi edinme süresi"}),
        (5.0, {"mevzuat": "7201 tebligat kanunu", "madde_no": 10, "text": "tebligat usulü"}),
    ]

    def _deepseek_acik(self, monkeypatch):
        monkeypatch.setattr(f"{_ONER}.RERANK_ENABLED", True)
        monkeypatch.setattr(f"{_ONER}.RERANK_PROVIDER", "deepseek")

    def test_siralama_ve_eleme_skorlar_korunur(self, monkeypatch):
        # Arrange — LLM 2. ve 1.'i seçti, 3.'yü eledi
        self._deepseek_acik(monkeypatch)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [2, 1]})
        # Act
        out = _maybe_rerank("dilekçe", self._DEDUP)
        # Assert — sıra/eleme LLM'den; skorlar BM25'ten AYNEN (max-normalize + ham)
        assert out is not None and len(out) == 2
        assert out[0]["baslik"].startswith("4982")
        assert out[0]["rerank"] is True
        assert out[0]["raw_score"] == 8.0
        assert out[0]["score"] == round(8.0 / 12.0, 3)   # BM25 skoru korunur
        assert out[1]["baslik"].startswith("3071")
        assert out[1]["score"] == 1.0                     # BM25 lideri normalize 1.0

    def test_kapali_kume_ihlali_bm25_fallback(self, monkeypatch):
        # Arrange — aday kümesi dışı numara → BM25 sırası aynen (None sinyali)
        self._deepseek_acik(monkeypatch)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [7]})
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_bos_sira_bm25_fallback(self, monkeypatch):
        # Arrange — boş sıra → BM25 sırası aynen
        self._deepseek_acik(monkeypatch)
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": []})
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_enabled_kapali_hic(self, monkeypatch):
        # Arrange — ana anahtar kapalı → provider'a bakılmaksızın hiç rerank yok
        monkeypatch.setattr(f"{_ONER}.RERANK_ENABLED", False)
        monkeypatch.setattr(f"{_ONER}.RERANK_PROVIDER", "deepseek")
        _gercek_llm_var(monkeypatch)
        cagri = _sayan_llm_json(monkeypatch)
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None
        assert cagri["n"] == 0

    def test_mock_modda_hic(self, monkeypatch):
        # Arrange — real_llm PATCH'siz (conftest mock) → rerank denenmez, LLM çağrılmaz
        self._deepseek_acik(monkeypatch)
        cagri = _sayan_llm_json(monkeypatch)
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None
        assert cagri["n"] == 0

    def test_zayif_retrieval_llm_cagrilmadan_fallback(self, monkeypatch):
        # Arrange — BM25 top skoru _MIN_RAW_SCORE altında → LLM'e para harcanmaz
        self._deepseek_acik(monkeypatch)
        _gercek_llm_var(monkeypatch)
        cagri = _sayan_llm_json(monkeypatch)
        zayif = [(0.4, {"mevzuat": "3071 dilekce", "madde_no": 4, "text": "x"})]
        # Act + Assert — None → BM25 yolu zaten config fallback'e düşecek
        assert _maybe_rerank("dilekçe", zayif) is None
        assert cagri["n"] == 0

    def test_llm_patlarsa_graceful_bm25(self, monkeypatch):
        # Arrange — köprü beklenmedik hata fırlatırsa BM25'e graceful düşülür
        self._deepseek_acik(monkeypatch)

        def _bomba(query, adaylar, **kwargs):
            raise RuntimeError("köprü bozuldu")

        monkeypatch.setattr("retrieval.reranker.deepseek_listwise_sirala", _bomba)
        # Act + Assert
        assert _maybe_rerank("dilekçe", self._DEDUP) is None

    def test_cross_encoder_yolu_birebir_korunur(self, monkeypatch):
        # Arrange — provider='cross-encoder' → eski yol (LLM'e hiç gidilmez)
        monkeypatch.setattr(f"{_ONER}.RERANK_ENABLED", True)
        monkeypatch.setattr(f"{_ONER}.RERANK_PROVIDER", "cross-encoder")
        monkeypatch.setattr("retrieval.reranker.get_reranker", _FakeCrossEncoder)
        _gercek_llm_var(monkeypatch)
        cagri = _sayan_llm_json(monkeypatch)
        # Act
        out = _maybe_rerank("dilekçe", self._DEDUP)
        # Assert — cross-encoder sonucu (skor 0.9 cross-encoder'dan) + LLM çağrısı yok
        assert out is not None and out[0]["baslik"].startswith("7201")
        assert out[0]["score"] == 0.9
        assert cagri["n"] == 0


# ---------------------------------------------------------------------------
# Uçtan uca: mevzuat_oner_node üzerinden sıra değişimi (gerçek korpus indeksi)
# ---------------------------------------------------------------------------


class TestNodeUzerindenDeepseekRerank:
    _STATE: ClassVar[dict] = {
        "evrak_turu": "dilekce",
        "bilgi_unsurlari": {"konu": "dilekçe hakkı başvurusu"},
        "evrak_text": (
            "Türk vatandaşları yetkili makamlara dilekçe ile başvurma hakkına "
            "sahiptir. Dilekçe sahibinin adı soyadı imzası ve adresi zorunludur."
        ),
    }

    async def test_ilk_iki_oneri_yer_degistirir(self, monkeypatch):
        # Arrange — önce baseline BM25 sırası (rerank kapalı)
        monkeypatch.setattr(f"{_ONER}.RERANK_ENABLED", False)
        baseline = (await mevzuat_oner_node(dict(self._STATE)))["mevzuat_onerileri"]
        assert len(baseline) >= 2  # ön-koşul: korpus en az 2 öneri veriyor
        # Arrange — deepseek rerank açık; sahte LLM ilk ikiyi takas edip kalanı eler
        monkeypatch.setattr(f"{_ONER}.RERANK_ENABLED", True)
        monkeypatch.setattr(f"{_ONER}.RERANK_PROVIDER", "deepseek")
        _gercek_llm_var(monkeypatch)
        _sahte_llm_json(monkeypatch, {"sira": [2, 1]})
        # Act
        out = (await mevzuat_oner_node(dict(self._STATE)))["mevzuat_onerileri"]
        # Assert — baseline'ın 2.'si başa geçti; skorlar BM25'ten taşındı
        assert len(out) == 2
        assert out[0]["baslik"] == baseline[1]["baslik"]
        assert out[1]["baslik"] == baseline[0]["baslik"]
        assert out[0]["rerank"] is True
        assert out[1]["score"] == baseline[0]["score"]  # BM25 lideri skoru korunur
