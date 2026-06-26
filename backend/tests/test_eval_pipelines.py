"""Eval harness uçtan-uca testleri — GERÇEK pipeline (mock) ile evaluate + render fonksiyonları.

Gerçek gold (data/synthetic/*.jsonl) küçük alt-örneğiyle her görev harness'inin
evaluate()/run_pipeline() gövdesini koşar (LLM_MODE=mock → deterministik). Ayrıca
scorecard/competition_scorecard render fonksiyonlarını sahte karne sözlüğüyle test eder
(ÜRETİM KODU değişmez — yalnız test). Performans için ilk N satır kullanılır.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from eval import (
    draft_eval,
    evrak_class_eval,
    fairness_eval,
    heldout_eval,
    missing_info_eval,
    routing_eval,
    summary_eval,
)

# Hız için her gold setinden ilk N satır (evaluate gövdesini kapsar, tüm seti koşmaz).
_N = 6


def _alt_ornek(load_fn, n: int = _N) -> list[dict]:
    """Gerçek gold'u yükle, ilk N satırı al (FileNotFound → testi atla, kırma)."""
    try:
        rows = load_fn()
    except FileNotFoundError:
        pytest.skip("gold dosyası yok — gen_synthetic.py koşulmamış")
    return rows[:n]


class TestEvrakClassEvaluate:
    """evrak_class_eval.evaluate — GERÇEK pipeline sınıflandırma metrikleri."""

    def test_evaluate_metrik_sozlesmesi(self):
        # Arrange
        rows = _alt_ornek(evrak_class_eval.load_gold)
        # Act
        res = evrak_class_eval.evaluate(rows)
        # Assert — metrik anahtarları + geçerli aralık
        assert res["n"] == len(rows)
        assert 0.0 <= res["accuracy"] <= 1.0
        assert 0.0 <= res["macro_f1"] <= 1.0
        assert "operational_accuracy" in res
        assert "confusion" in res


class TestRoutingEvaluate:
    """routing_eval.evaluate — GERÇEK pipeline yönlendirme Top-1/Top-3."""

    def test_evaluate_top1_top3(self):
        # Arrange
        rows = _alt_ornek(routing_eval.load_gold)
        # Act
        res = routing_eval.evaluate(rows)
        # Assert
        assert res["n"] == len(rows)
        assert 0.0 <= res["top1_acc"] <= 1.0
        assert 0.0 <= res["top3_acc"] <= 1.0


class TestMissingInfoEvaluate:
    """missing_info_eval.evaluate — set-P/R + F-beta."""

    def test_evaluate_set_metrikleri(self):
        # Arrange
        rows = _alt_ornek(missing_info_eval.load_gold)
        # Act
        res = missing_info_eval.evaluate(rows)
        # Assert
        assert res["n"] == len(rows)
        assert 0.0 <= res["precision"] <= 1.0
        assert 0.0 <= res["recall"] <= 1.0
        assert res["beta"] == 2.0


class TestSummaryEvaluate:
    """summary_eval.evaluate — key-fact recall + faithfulness."""

    def test_evaluate_ozet_metrikleri(self):
        # Arrange
        rows = _alt_ornek(summary_eval.load_gold)
        # Act
        res = summary_eval.evaluate(rows)
        # Assert
        assert res["n"] == len(rows)
        assert 0.0 <= res["micro_recall"] <= 1.0
        assert 0.0 <= res["faithfulness_rate"] <= 1.0


class TestDraftEvaluate:
    """draft_eval.evaluate — format-uyum + bileşen + false-veto."""

    def test_evaluate_format_metrikleri(self):
        # Arrange
        rows = _alt_ornek(draft_eval.load_gold)
        # Act
        res = draft_eval.evaluate(rows)
        # Assert
        assert res["n"] == len(rows)
        assert 0.0 <= res["compliance_rate"] <= 1.0
        assert 0.0 <= res["format_score"] <= 1.0
        # false-veto hedef 0 (kamu evrakta kritik)
        assert res["false_veto"] >= 0


class TestFairnessEvaluate:
    """fairness_eval.evaluate — counterfactual isim/cinsiyet tutarlılığı."""

    def test_evaluate_tutarlilik(self):
        # Arrange
        rows = _alt_ornek(fairness_eval.load_gold)
        # Act
        res = fairness_eval.evaluate(rows)
        # Assert — isim-taşıyan evrak tutarlılığı (0..1)
        assert 0.0 <= res["class_consistency"] <= 1.0
        assert 0.0 <= res["route_consistency"] <= 1.0
        assert res["variants"] == ["kadin", "erkek", "notr"]

    def test_swap_name_zaten_test_edildi(self):
        # Arrange — _swap_name birim testi test_eval_helpers'ta; burada entegrasyon
        # Act — Ad-Soyad taşımayan metin değişmez
        metin = "Ad-Soyad satırı olmayan evrak"
        # Assert
        assert fairness_eval._swap_name(metin, "X Y") == metin


class TestHeldoutEvaluate:
    """heldout_eval.evaluate — held-out (dürüst) sınıflandırma + yönlendirme."""

    def test_evaluate_genelleme_metrikleri(self):
        # Arrange
        rows = _alt_ornek(heldout_eval.load_gold)
        # Act
        res = heldout_eval.evaluate(rows)
        # Assert
        assert res["n"] == len(rows)
        assert 0.0 <= res["accuracy"] <= 1.0
        assert "route_top1_acc" in res

    def test_resolve_gold_path_varsayilan(self):
        # Act — set/gold yok → varsayılan heldout
        p = heldout_eval.resolve_gold_path(None, None)
        # Assert
        assert p == heldout_eval.GOLD

    def test_resolve_gold_path_set(self):
        # Act — isimli set
        p = heldout_eval.resolve_gold_path("heldout2", None)
        # Assert
        assert "heldout2" in p.name

    def test_resolve_gold_path_acik_yol_oncelikli(self):
        # Act — --gold --set'i ezer
        p = heldout_eval.resolve_gold_path("heldout", "/custom/path.jsonl")
        # Assert
        assert p == Path("/custom/path.jsonl")

    def test_resolve_gold_path_bilinmeyen_set(self):
        # Act + Assert — geçersiz set → SystemExit
        with pytest.raises(SystemExit):
            heldout_eval.resolve_gold_path("yok", None)
