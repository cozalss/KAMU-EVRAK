"""LLM-as-Judge + Ragas shim testleri — saf parse/clamp/sampling + MockLLM evaluate.

eval/judge.py: deterministik yardımcılar (_parse_judge_json, _clamp01, should_sample,
JudgeScore.overall) + LLMJudge.evaluate (MockLLM ile, ağsız). Mock dispatch judge
prompt'unu tanır ({"faithful":..., "complete":..., "tone":...}).
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import pytest

from eval.judge import (
    JudgeScore,
    LLMJudge,
    _clamp01,
    _parse_judge_json,
    ragas_faithfulness,
    should_sample,
)


class TestJudgeScore:
    """JudgeScore ağırlıklı ortalama + dict serileştirme."""

    def test_overall_agirlikli_ortalama(self):
        # Arrange — faithful 0.5x, complete 0.3x, tone 0.2x
        score = JudgeScore(faithful=1.0, complete=0.0, tone=0.0, notes="")
        # Act + Assert — overall = 0.5
        assert score.overall() == 0.5

    def test_overall_tum_kusursuz_bir(self):
        # Arrange + Act + Assert
        assert JudgeScore(1.0, 1.0, 1.0, "").overall() == 1.0

    def test_to_dict_overall_icerir(self):
        # Arrange
        d = JudgeScore(0.8, 0.6, 0.4, "test").to_dict()
        # Assert — tüm alanlar + türetilmiş overall
        assert d["faithful"] == 0.8
        assert d["notes"] == "test"
        assert "overall" in d


class TestParseJudgeJson:
    """_parse_judge_json — fence-strip + tolerant + güvenli default."""

    def test_temiz_json_parse(self):
        # Arrange
        raw = '{"faithful": 0.9, "complete": 0.8, "tone": 0.7, "notes": "iyi"}'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert s.faithful == 0.9
        assert s.notes == "iyi"

    def test_markdown_fence_temizlenir(self):
        # Arrange — ```json ... ``` çitli çıktı
        raw = '```json\n{"faithful": 0.5, "complete": 0.5, "tone": 0.5, "notes": "x"}\n```'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert s.faithful == 0.5

    def test_gecersiz_json_sifir_default(self):
        # Arrange — parse edilemez
        s = _parse_judge_json("bu json değil {{{")
        # Assert — tüm skorlar 0.0, açıklayıcı not
        assert s.faithful == 0.0
        assert "parse" in s.notes.lower()

    def test_notlar_200_char_sinirli(self):
        # Arrange — çok uzun not
        uzun = "a" * 500
        raw = f'{{"faithful": 1, "complete": 1, "tone": 1, "notes": "{uzun}"}}'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert len(s.notes) <= 200

    def test_eksik_alan_sifira_dusur(self):
        # Arrange — tone yok
        raw = '{"faithful": 0.6, "complete": 0.4, "notes": "kismi"}'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert s.tone == 0.0


class TestClamp01:
    """_clamp01 — [0,1] kırpma + tür-güvenliği."""

    @pytest.mark.parametrize(
        ("girdi", "beklenen"),
        [(1.5, 1.0), (-0.3, 0.0), (0.5, 0.5), ("0.7", 0.7), ("abc", 0.0), (None, 0.0)],
    )
    def test_kirpma_ve_tur_guvenligi(self, girdi: object, beklenen: float):
        # Act + Assert
        assert _clamp01(girdi) == beklenen


class TestShouldSample:
    """should_sample — deterministik SHA-256 tabanlı örnekleme."""

    def test_oran_sifir_asla(self):
        # Act + Assert
        assert should_sample("vaka-1", rate=0.0) is False

    def test_oran_bir_her_zaman(self):
        # Act + Assert
        assert should_sample("vaka-1", rate=1.0) is True

    def test_ayni_call_id_deterministik(self):
        # Act — aynı id her zaman aynı bucket
        r1 = should_sample("vaka-deterministik", rate=0.5)
        r2 = should_sample("vaka-deterministik", rate=0.5)
        # Assert
        assert r1 == r2

    def test_bool_doner(self):
        # Act + Assert — tip sözleşmesi
        assert isinstance(should_sample("x", rate=0.5), bool)


class TestLLMJudgeEvaluate:
    """LLMJudge.evaluate — MockLLM ile (ağsız); boş girdi guard + mock judge skoru."""

    async def test_bos_soru_sifir_skor(self):
        # Arrange
        judge = LLMJudge()
        # Act
        s = await judge.evaluate("", ["kaynak"], "cevap")
        # Assert — LLM çağrılmadan guard
        assert s.faithful == 0.0
        assert "boş" in s.notes.lower()

    async def test_bos_cevap_sifir_skor(self):
        # Arrange
        judge = LLMJudge()
        # Act
        s = await judge.evaluate("soru?", ["kaynak"], "")
        # Assert
        assert s.complete == 0.0

    async def test_mock_judge_skoru_doner(self):
        # Arrange — mock dispatch 'faithful'+'complete' system prompt'unu tanır
        judge = LLMJudge()
        # Act
        s = await judge.evaluate("Soru?", ["[1] kaynak metni"], "Bu bir cevap.")
        # Assert — mock skor parse edilir (0.85/0.75/0.80)
        assert 0.0 <= s.faithful <= 1.0
        assert s.overall() > 0.0

    async def test_kaynaksiz_baglam_calisir(self):
        # Arrange — boş kaynak listesi → "(kaynak yok)" placeholder
        judge = LLMJudge()
        # Act
        s = await judge.evaluate("Soru?", [], "Cevap.")
        # Assert — yine de skor döner (LLM çağrısı yapılır)
        assert isinstance(s, JudgeScore)


class TestRagasFaithfulness:
    """ragas_faithfulness shim — ragas kurulu değilse None (graceful)."""

    async def test_ragas_yoksa_none(self):
        # Arrange + Act — ragas paketi yüklü değil (varsayım) → None
        # NOT: ragas kurulu OLABİLİR; o durumda float döner. İki dalı da kabul et.
        sonuc = await ragas_faithfulness("Soru?", ["kaynak"], "Cevap.")
        # Assert — None (yok) veya 0..1 float (kuruluysa MockLLM faithful)
        assert sonuc is None or (0.0 <= sonuc <= 1.0)
