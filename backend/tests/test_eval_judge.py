"""LLM-as-Judge (kamu-evrak ÖZET hakemliği) testleri — parse/clamp/sampling + evaluate.

eval/judge.py: (kısaltılmış evrak metni, üretilen özet) → {"kapsama","sadakat","kisalik",
"notlar"} JSON skoru. Deterministik yardımcılar (_parse_judge_json, _clamp01, should_sample,
JudgeScore.overall) + LLMJudge.evaluate üç yolla kanıtlanır: sahte LLM (iyi çıktı),
sahte LLM (hata/bozuk JSON → güvenli sıfır), MockLLM (ağsız, deterministik).
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import pytest

from agents.llm import LLMResponse
from eval import judge as judge_mod
from eval.judge import (
    JudgeScore,
    LLMJudge,
    _clamp01,
    _parse_judge_json,
    should_sample,
)


class _SahteLLM:
    """Kayıt tutan sahte LLM — iyi/bozuk çıktı ve hata yolunu simüle eder."""

    def __init__(self, content: str = "", exc: Exception | None = None) -> None:
        self.content = content
        self.exc = exc
        self.cagri = 0
        self.son_kwargs: dict = {}

    async def chat(self, messages, **kwargs):
        self.cagri += 1
        self.son_kwargs = kwargs
        if self.exc is not None:
            raise self.exc
        return LLMResponse(content=self.content)


_IYI_JSON = '{"kapsama": 0.9, "sadakat": 0.8, "kisalik": 0.7, "notlar": "iyi özet"}'


class TestJudgeScore:
    """JudgeScore ağırlıklı ortalama + dict serileştirme (sadakat en ağır eksen)."""

    def test_overall_sadakat_en_agir(self):
        # Arrange — sadakat 0.5x (kamu evrakta halüsinasyon kritik)
        score = JudgeScore(kapsama=0.0, sadakat=1.0, kisalik=0.0, notlar="")
        # Act + Assert
        assert score.overall() == 0.5

    def test_overall_kapsama_agirligi(self):
        # Arrange — kapsama 0.3x
        score = JudgeScore(kapsama=1.0, sadakat=0.0, kisalik=0.0, notlar="")
        # Act + Assert
        assert score.overall() == 0.3

    def test_overall_tum_kusursuz_bir(self):
        # Arrange + Act + Assert
        assert JudgeScore(1.0, 1.0, 1.0, "").overall() == 1.0

    def test_to_dict_tum_alanlar_ve_overall(self):
        # Arrange
        d = JudgeScore(0.8, 0.6, 0.4, "test").to_dict()
        # Assert — tüm eksenler + türetilmiş overall
        assert d["kapsama"] == 0.8
        assert d["sadakat"] == 0.6
        assert d["kisalik"] == 0.4
        assert d["notlar"] == "test"
        assert "overall" in d


class TestParseJudgeJson:
    """_parse_judge_json — fence-strip + tolerant + güvenli default + kapalı-küme."""

    def test_temiz_json_parse(self):
        # Arrange + Act
        s = _parse_judge_json(_IYI_JSON)
        # Assert
        assert s.kapsama == 0.9
        assert s.sadakat == 0.8
        assert s.kisalik == 0.7
        assert s.notlar == "iyi özet"

    def test_markdown_fence_temizlenir(self):
        # Arrange — ```json ... ``` çitli çıktı
        raw = f"```json\n{_IYI_JSON}\n```"
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert s.kapsama == 0.9

    def test_gecersiz_json_sifir_default(self):
        # Arrange — parse edilemez
        s = _parse_judge_json("bu json değil {{{")
        # Assert — tüm skorlar 0.0, açıklayıcı not
        assert s.kapsama == 0.0
        assert s.sadakat == 0.0
        assert "parse" in s.notlar.lower()

    def test_sema_disi_json_sifir_default(self):
        # Arrange — geçerli JSON ama beklenen eksenlerden HİÇBİRİ yok (MockLLM default'u)
        s = _parse_judge_json('{"domain": "kira", "confidence": 0.85}')
        # Assert — LLM çıktısına körü körüne güvenilmez (kapalı-küme doğrulama)
        assert s.kapsama == 0.0
        assert s.sadakat == 0.0
        assert "şema" in s.notlar.lower()

    def test_notlar_200_char_sinirli(self):
        # Arrange — çok uzun not
        uzun = "a" * 500
        raw = f'{{"kapsama": 1, "sadakat": 1, "kisalik": 1, "notlar": "{uzun}"}}'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert len(s.notlar) <= 200

    def test_eksik_alan_sifira_dusur(self):
        # Arrange — kisalik yok (diğer eksenler var → şema geçerli)
        raw = '{"kapsama": 0.6, "sadakat": 0.4, "notlar": "kismi"}'
        # Act
        s = _parse_judge_json(raw)
        # Assert
        assert s.kisalik == 0.0
        assert s.kapsama == 0.6


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
    """LLMJudge.evaluate — boş girdi guard + sahte LLM (iyi/hata/bozuk) + mock yolu."""

    async def test_bos_evrak_sifir_skor_llm_cagrilmaz(self, monkeypatch):
        # Arrange — boş evrak metni; LLM çağrılırsa sahte sayaç artar
        sahte = _SahteLLM(content=_IYI_JSON)
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act
        s = await LLMJudge().evaluate("", "özet var")
        # Assert — guard LLM'e gitmeden döner
        assert s.kapsama == 0.0
        assert "boş" in s.notlar.lower()
        assert sahte.cagri == 0

    async def test_bos_ozet_sifir_skor(self):
        # Arrange + Act
        s = await LLMJudge().evaluate("evrak metni", "")
        # Assert
        assert s.sadakat == 0.0

    async def test_sahte_llm_iyi_json_parse_edilir(self, monkeypatch):
        # Arrange — sahte LLM geçerli judge JSON'u döndürür
        sahte = _SahteLLM(content=_IYI_JSON)
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act
        s = await LLMJudge().evaluate("Evrak metni: kira yardımı dilekçesi.", "Kira yardımı özeti.")
        # Assert — yeni yol çalışır
        assert s.kapsama == 0.9
        assert s.sadakat == 0.8
        assert s.kisalik == 0.7
        assert sahte.cagri == 1

    async def test_hakem_modeli_json_mode_temp_sifir(self, monkeypatch):
        # Arrange — çağrı parametre sözleşmesi (yapılandırılan hakem modeli, json_mode, temp 0).
        # Model adı SABİT DEĞİL: "deepseek-chat" API'den kaldırıldığında bu test kırılmıştı;
        # sözleşme "JUDGE_MODEL neyse o gönderilir" olmalı (2026-07-24).
        yakalanan: dict = {}
        sahte = _SahteLLM(content=_IYI_JSON)

        def _fake_get(model):
            yakalanan["model"] = model
            return sahte

        monkeypatch.setattr(judge_mod, "get_llm_for_model", _fake_get)
        # Act
        await LLMJudge().evaluate("evrak", "özet")
        # Assert
        assert yakalanan["model"] == judge_mod.JUDGE_MODEL
        assert "deepseek-chat" not in judge_mod.JUDGE_MODEL, "kaldırılmış model adı"
        assert "deepseek-reasoner" not in judge_mod.JUDGE_MODEL, "kaldırılmış model adı"
        assert sahte.son_kwargs["json_mode"] is True
        assert sahte.son_kwargs["temperature"] == 0.0

    async def test_llm_hatasi_sifir_skor(self, monkeypatch):
        # Arrange — LLM patlar → güvenli sıfır (fallback sözleşmesi)
        sahte = _SahteLLM(exc=RuntimeError("bağlantı yok"))
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act
        s = await LLMJudge().evaluate("evrak", "özet")
        # Assert
        assert s.kapsama == 0.0
        assert "hata" in s.notlar.lower()

    async def test_bozuk_json_sifir_skor(self, monkeypatch):
        # Arrange — LLM bozuk çıktı döndürür → parse güvenli sıfır
        sahte = _SahteLLM(content="özür dilerim, JSON üretemedim {{{")
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act
        s = await LLMJudge().evaluate("evrak", "özet")
        # Assert
        assert s.kapsama == 0.0
        assert s.overall() == 0.0

    async def test_mock_modda_gecerli_skor_doner(self):
        # Arrange — LLM_MODE=mock (conftest): ağsız, deterministik; MockLLM şema-dışı
        # JSON döndürse bile evaluate JudgeScore sözleşmesini korur (çökmez).
        s = await LLMJudge().evaluate("Evrak metni.", "Özet metni.")
        # Assert
        assert isinstance(s, JudgeScore)
        assert 0.0 <= s.kapsama <= 1.0
        assert 0.0 <= s.overall() <= 1.0
