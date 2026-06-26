"""Karne render fonksiyon testleri — competition_scorecard + scorecard markdown/console.

ÜRETİM KODU değişmez (scorecard/competition_scorecard.py'a DOKUNULMAZ — yalnız test).
render_markdown / render_console / _count_jsonl / _dataset_coverage / _git_sha SAF
fonksiyonlardır; sahte karne sözlüğüyle çıktı sözleşmesi (jüri-hazır markdown başlık/
tablo + console bar) doğrulanır. build_scorecard ÇAĞRILMAZ (ağır pipeline / eksik dep).
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

from eval import competition_scorecard as comp
from eval import scorecard as sc_mod

# competition_scorecard.render_* için minimal-tam sahte karne sözlüğü.
_FAKE_COMP = {
    "git_sha": "abc1234",
    "llm_mode": "mock",
    "evrak_turu_sayisi": 19,
    "birim_sayisi": 9,
    "gorev1": {
        "siniflandirma": {"accuracy": 0.85, "macro_f1": 0.80,
                          "accuracy_ci95": [0.75, 0.92], "abstention_rate": 0.1,
                          "by_zorluk": {"kolay": 0.95, "orta": 0.85, "zor": 0.70}},
        "eksik_bilgi": {"precision": 0.9, "recall": 0.88, "f_beta": 0.88,
                        "beta": 2.0, "recall_ci95": [0.8, 0.95]},
        "ozet": {"micro_recall": 0.82, "macro_recall": 0.80, "full_cover_rate": 0.6,
                 "avg_uzunluk": 35.0, "faithfulness_rate": 1.0,
                 "faithfulness_ci95": [0.9, 1.0], "judge_coverage": None},
    },
    "gorev2": {
        "yonlendirme": {"top1": 0.78, "top3": 0.92, "top1_ci95": [0.68, 0.86]},
        "yazi_taslak": {"format_uyumlu_rate": 0.9, "compliance_rate": 0.85,
                        "yazi_turu_acc": 0.88, "avg_turkish_purity": 0.999,
                        "per_component": {"tc_baslik": 1.0, "sayi": 0.9},
                        "false_veto": 0, "false_veto_rate": 0.0, "veto_uyari_toplam": 5},
    },
    "etik": {"class_consistency": 1.0, "route_consistency": 1.0,
             "class_consistency_ci95": [0.9, 1.0]},
    "n": {"siniflandirma": 50, "yonlendirme": 50, "eksik": 50,
          "ozet": 50, "taslak": 50, "adillik": 30},
}

# scorecard.render_* için minimal-tam sahte kalkan karnesi.
_FAKE_SHIELD = {
    "git_sha": "def5678",
    "shield_pass": True,
    "hallucination_shield": {
        "n": 40, "n_clean": 32, "n_risky": 8,
        "micro_precision": 1.0, "micro_recall": 1.0, "hallucination_recall": 1.0,
        "hallucination_recall_ci95": [0.67, 1.0],
        "false_veto_count": 0, "false_veto_rate": 0.0, "false_veto_rate_upper95": 0.1,
        "per_type": {"fabricated_law": {"precision": 1.0, "recall": 1.0, "f1": 1.0}},
    },
    "fabricated_threshold": {
        "n": 20, "precision": 1.0, "recall": 0.95, "f1": 0.97, "accuracy": 0.96,
        "precision_ci95": [0.8, 1.0], "recall_ci95": [0.75, 0.99],
    },
    "dataset_coverage": [{"set": "x.jsonl", "label": "Test seti", "n": 10}],
}


class TestCompetitionScorecardRender:
    """competition_scorecard.render_markdown / render_console — jüri karnesi çıktısı."""

    def test_markdown_baslik_ve_tablolar(self):
        # Act
        md = comp.render_markdown(_FAKE_COMP)
        # Assert — başlık + Görev 1/2 tabloları + metrik değerleri
        assert "TEKNOFEST 2026" in md
        assert "Görev 1" in md
        assert "Görev 2" in md
        assert "0.850" in md  # accuracy
        assert "abc1234" in md  # git sha

    def test_console_bar_metrikler(self):
        # Act
        out = comp.render_console(_FAKE_COMP)
        # Assert
        assert "KARNESİ" in out
        assert "acc=0.850" in out
        assert "top1=0.780" in out

    def test_markdown_string_doner(self):
        # Act + Assert — render asla None döndürmez
        assert isinstance(comp.render_markdown(_FAKE_COMP), str)


class TestScorecardRender:
    """scorecard.render_markdown / render_console — kalkan karnesi (deterministik)."""

    def test_markdown_gecti_isareti(self):
        # Act
        md = sc_mod.render_markdown(_FAKE_SHIELD)
        # Assert — shield_pass True → GEÇTİ
        assert "GEÇTİ" in md
        assert "Kalkanı Karnesi" in md
        assert "Yanlış-veto" in md

    def test_markdown_kaldi_isareti(self):
        # Arrange — başarısız kalkan
        fail = {**_FAKE_SHIELD, "shield_pass": False}
        # Act
        md = sc_mod.render_markdown(fail)
        # Assert
        assert "KALDI" in md

    def test_console_pass_mark(self):
        # Act
        out = sc_mod.render_console(_FAKE_SHIELD)
        # Assert
        assert "GEÇTİ" in out
        assert "def5678" in out


class TestScorecardHelpers:
    """scorecard saf yardımcıları — _git_sha / _count_jsonl / _dataset_coverage."""

    def test_git_sha_string(self):
        # Act — git repo'da kısa SHA veya 'unknown'
        sha = sc_mod._git_sha()
        # Assert
        assert isinstance(sha, str)
        assert sha

    def test_count_jsonl_yok_sifir(self):
        # Act — var olmayan dosya → 0
        assert sc_mod._count_jsonl("var_olmayan_dosya_12345.jsonl") == 0

    def test_dataset_coverage_liste(self):
        # Act
        cov = sc_mod._dataset_coverage()
        # Assert — her giriş set/label/n taşır
        assert isinstance(cov, list)
        assert all("set" in c and "n" in c for c in cov)


class TestCompetitionScorecardHelpers:
    """competition_scorecard._git_sha — git SHA okuma (güvenli)."""

    def test_git_sha_string(self):
        # Act + Assert
        assert isinstance(comp._git_sha(), str)
