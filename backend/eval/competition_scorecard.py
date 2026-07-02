"""TEKNOFEST 1. Senaryo — Yarışma karnesi (tek komut, tüm görevler).

Şartname §9 Puanlama: "Uygulama (35p) — sınıflandırma doğruluğu, yönlendirme
başarımı, özetleme ve yazı şablon oluşturma kalitesi, eksik bilgi tespiti" +
"Yöntem (35p)". Bu modül her iki görevin tüm metriklerini GERÇEK pipeline
(agents/graph.py) üzerinde tek koşuda toplar, jüri-hazır Markdown karne üretir →
docs/benchmark/scorecard.md ve eval/runs/competition_scorecard.json.

ÖNEMLİ: Skorlar MOCK-LLM tabanıdır (LLM_MODE=mock; siniflandir/route keyword-
heuristik fallback'i koşar). Bunlar TAVAN değil TABANDIR — gerçek LLM modu (openai/
llamacpp) bu metrikleri yükseltir. Önemli olan eval'in GERÇEK pipeline'ı ölçmesidir.

Gerçek kamu verisi YOK (§6.5) → tüm ölçüm data/synthetic gold üzerinde.

Çalıştır (PYTHONPATH=...\\backend):
    python -m eval.competition_scorecard            # konsol + docs/benchmark/scorecard.md
    python -m eval.competition_scorecard --check     # yalnız konsol (rapor yazma)
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sys
from pathlib import Path

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent
_DOC_OUT = _REPO / "docs" / "benchmark" / "scorecard.md"
_JSON_OUT = _BACKEND / "eval" / "runs" / "competition_scorecard.json"


def _fmt_judge(v: object) -> str:
    """LLM-judge alanını None-güvenli biçimle — gate kapalıyken '—' (CI deterministik)."""
    return "—" if v is None else f"{float(v):.3f}"  # type: ignore[arg-type]


def _git_sha() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(_BACKEND),
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def build_scorecard() -> dict:
    """Tüm görev metriklerini GERÇEK pipeline üzerinde koş → tek karne sözlüğü."""
    from agents.config import BIRIMLER, EVRAK_TURLERI
    from eval import (
        draft_eval,
        evrak_class_eval,
        fairness_eval,
        missing_info_eval,
        routing_eval,
        summary_eval,
    )

    cls = evrak_class_eval.evaluate(evrak_class_eval.load_gold())
    route = routing_eval.evaluate(routing_eval.load_gold())
    missing = missing_info_eval.evaluate(missing_info_eval.load_gold())
    summ = summary_eval.evaluate(summary_eval.load_gold())
    draft = draft_eval.evaluate(draft_eval.load_gold())
    fair = fairness_eval.evaluate(fairness_eval.load_gold())

    return {
        "git_sha": _git_sha(),
        "llm_mode": os.getenv("LLM_MODE", "mock").lower(),
        "evrak_turu_sayisi": len(EVRAK_TURLERI),
        "birim_sayisi": len(BIRIMLER),
        "gorev1": {
            "siniflandirma": {"accuracy": cls["accuracy"], "macro_f1": cls["macro_f1"],
                              "accuracy_ci95": cls["accuracy_ci95"],
                              "abstention_rate": cls["abstention_rate"],
                              "by_zorluk": cls["by_zorluk"]},
            "eksik_bilgi": {"precision": missing["precision"], "recall": missing["recall"],
                            "f_beta": missing["f_beta"], "beta": missing["beta"],
                            "recall_ci95": missing["recall_ci95"]},
            "ozet": {"micro_recall": summ["micro_recall"], "macro_recall": summ["macro_recall"],
                     "full_cover_rate": summ["full_cover_rate"], "avg_uzunluk": summ["avg_uzunluk"],
                     "faithfulness_rate": summ["faithfulness_rate"],
                     "faithfulness_ci95": summ["faithfulness_ci95"],
                     # LLM-judge alanları gate kapalıyken None — .get ile None-güvenli.
                     "judge_coverage": summ.get("judge_coverage")},
        },
        "gorev2": {
            "yonlendirme": {"top1": route["top1_acc"], "top3": route["top3_acc"],
                            "top1_ci95": route["top1_ci95"]},
            "yazi_taslak": {"format_uyumlu_rate": draft["format_uyumlu_rate"],
                            "compliance_rate": draft["compliance_rate"],
                            "yazi_turu_acc": draft["yazi_turu_acc"],
                            "avg_turkish_purity": draft["avg_turkish_purity"],
                            "per_component": draft["per_component"],
                            "false_veto": draft["false_veto"],
                            "false_veto_rate": draft["false_veto_rate"],
                            "veto_uyari_toplam": draft["veto_uyari_toplam"],
                            # Resmî-üslup LLM-judge (DRAFT_JUDGE_ENABLED kapalıyken None).
                            "uslup_judge": draft.get("uslup_judge")},
        },
        "etik": {
            "class_consistency": fair["class_consistency"],
            "route_consistency": fair["route_consistency"],
            "class_consistency_ci95": fair["class_consistency_ci95"],
        },
        "n": {"siniflandirma": cls["n"], "yonlendirme": route["n"], "eksik": missing["n"],
              "ozet": summ["n"], "taslak": draft["n"], "adillik": fair["n"]},
    }


def render_markdown(sc: dict) -> str:
    g1, g2 = sc["gorev1"], sc["gorev2"]
    s = g1["siniflandirma"]
    yt = g2["yazi_taslak"]
    lines: list[str] = [
        "# TEKNOFEST 2026 — 1. Senaryo Yarışma Karnesi",
        "",
        "> Kamu Evrak ve Yazışma Süreçleri · **GERÇEK pipeline** (agents/graph.py) ölçümü · "
        "`python -m eval.competition_scorecard` ile üretilir "
        f"(commit `{sc['git_sha']}`, LLM_MODE=`{sc['llm_mode']}`).",
        "",
        "> **Skorlar MOCK tabandır:** LLM_MODE=mock'ta siniflandir/route keyword-heuristik "
        "fallback'i koşar. Bu metrikler TAVAN değil TABAN — gerçek LLM modu (openai/llamacpp) "
        "yükseltir. Burada KRİTİK olan, eval'in mock taksonomiyi değil GERÇEK LangGraph "
        "pipeline'ını (siniflandir→cikar→eksik_tespit→route_birim→ozetle→yazi_taslak) ölçmesidir.",
        "",
        f"Kanonik taksonomi: **{sc['evrak_turu_sayisi']} evrak türü** "
        f"(config.EVRAK_TURLERI; 'belirsiz' abstention dahil), **{sc['birim_sayisi']} birim** "
        f"(gerçek kamu verisi YOK — şartname §6.5). "
        f"Vaka: sınıflandırma {sc['n']['siniflandirma']} · yönlendirme {sc['n']['yonlendirme']}.",
        "",
        "## Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1)",
        "",
        "| Metrik | Değer | %95 CI |",
        "|---|---|---|",
        f"| Sınıflandırma accuracy | **{s['accuracy']:.3f}** | "
        f"[{s['accuracy_ci95'][0]:.3f}, {s['accuracy_ci95'][1]:.3f}] |",
        f"| Sınıflandırma macro-F1 | **{s['macro_f1']:.3f}** | — |",
        f"| Abstention oranı (belirsiz/düşük-güven) | {s['abstention_rate']:.0%} | — |",
        f"| Eksik-bilgi recall (β=2) | **{g1['eksik_bilgi']['recall']:.3f}** | "
        f"[{g1['eksik_bilgi']['recall_ci95'][0]:.3f}, {g1['eksik_bilgi']['recall_ci95'][1]:.3f}] |",
        f"| Eksik-bilgi precision | {g1['eksik_bilgi']['precision']:.3f} | — |",
        f"| Eksik-bilgi F-beta | {g1['eksik_bilgi']['f_beta']:.3f} | — |",
        f"| Özet key-fact recall (mikro) | **{g1['ozet']['micro_recall']:.3f}** | — |",
        f"| Özet faithfulness (sadakat) | **{g1['ozet']['faithfulness_rate']:.3f}** | "
        f"[{g1['ozet']['faithfulness_ci95'][0]:.3f}, {g1['ozet']['faithfulness_ci95'][1]:.3f}] |",
        f"| Özet ort. uzunluk | {g1['ozet']['avg_uzunluk']} kelime | — |",
        "",
        "> **Faithfulness** = özetin kaynak evrakta OLMAYAN somut tarih/sayı (halüsinasyon) "
        "içermeme oranı (CLAUDE.md §1). LLM-judge kapsama opsiyonel gate'tir "
        f"(`SUMMARY_JUDGE_ENABLED`; şu an `{_fmt_judge(g1['ozet'].get('judge_coverage'))}` "
        "— kapalıyken key-fact recall raporlanır).",
        "",
        f"Zorluk kırılımı (sınıflandırma acc): {s['by_zorluk']} — "
        "stratifikasyon kanıtı (kolay→zor monoton düşüş beklenir).",
        "",
        "## Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2)",
        "",
        "| Metrik | Değer | %95 CI |",
        "|---|---|---|",
        f"| Yönlendirme Top-1 (uçtan-uca) | **{g2['yonlendirme']['top1']:.3f}** | "
        f"[{g2['yonlendirme']['top1_ci95'][0]:.3f}, {g2['yonlendirme']['top1_ci95'][1]:.3f}] |",
        f"| Yönlendirme Top-3 | {g2['yonlendirme']['top3']:.3f} | — |",
        f"| Pipeline format_uyumlu | {yt['format_uyumlu_rate']:.3f} | — |",
        f"| Yazı bileşen tam-uyum | **{yt['compliance_rate']:.3f}** | — |",
        f"| Yazı türü doğruluğu | {yt['yazi_turu_acc']:.3f} | — |",
        f"| Yazı Türkçe saflık | {yt['avg_turkish_purity']:.4f} | — |",
        f"| Uydurma-veto yanlış-pozitif | **{yt['false_veto']}/{yt['veto_uyari_toplam']}** "
        f"(oran {yt['false_veto_rate']:.3f}) | — |",
        f"| Resmî üslup (LLM-judge, `DRAFT_JUDGE_ENABLED`) | "
        f"{_fmt_judge(yt.get('uslup_judge'))} | — |",
        "",
        "> **Uydurma-veto false-positive** (docs/06 hedef **0**): verify node'unun "
        "\"kaynakta yok\" uyarısının GERÇEKTEN kaynakta var olan değeri yanlış işaretleme oranı. "
        "0 = anti-halüsinasyon kapısı sağlıklı (gerçek uydurmayı yakalar, doğruyu vetolamaz).",
        "",
        "## Etik §13.1 — Adillik (counterfactual isim/cinsiyet)",
        "",
        f"- Sınıf tutarlılığı: **{sc['etik']['class_consistency']:.4f}** "
        f"(%95 CI [{sc['etik']['class_consistency_ci95'][0]:.3f}, "
        f"{sc['etik']['class_consistency_ci95'][1]:.3f}])",
        f"- Birim tutarlılığı: **{sc['etik']['route_consistency']:.4f}** "
        "— başvuranın ismi/cinsiyeti kararı değiştirmemeli (1.0 = yanlılıksız).",
        "",
        "---",
        "",
        "> Bu karne GERÇEK LangGraph pipeline'ını ölçer (mock taksonomi değil). "
        "Mock-LLM modunda deterministik (keyword/regex/eşik) fallback koşar → her commit'te "
        "CI regresyon kapısı olabilir. **Mock skorlar tavan DEĞİL tabandır.** "
        "Wilson %95 güven aralıkları küçük-N belirsizliğini dürüstçe gösterir.",
        "",
    ]
    return "\n".join(lines)


def render_console(sc: dict) -> str:
    g1, g2 = sc["gorev1"], sc["gorev2"]
    s = g1["siniflandirma"]
    yt = g2["yazi_taslak"]
    bar = "=" * 66
    return "\n".join([
        f"\n{bar}",
        f"  TEKNOFEST 1. SENARYO KARNESİ  (commit {sc['git_sha']}, LLM_MODE={sc['llm_mode']})",
        "  [GERÇEK pipeline ölçümü — mock skorlar TABAN, tavan değil]",
        bar,
        f"  GÖREV 1 — Sınıflandırma : acc={s['accuracy']:.3f} macroF1={s['macro_f1']:.3f} "
        f"abstain={s['abstention_rate']:.0%}",
        f"           Eksik-bilgi    : recall={g1['eksik_bilgi']['recall']:.3f} "
        f"P={g1['eksik_bilgi']['precision']:.3f} Fβ={g1['eksik_bilgi']['f_beta']:.3f}",
        f"           Özet recall    : {g1['ozet']['micro_recall']:.3f} "
        f"(ort {g1['ozet']['avg_uzunluk']} kelime, "
        f"judge={_fmt_judge(g1['ozet'].get('judge_coverage'))})",
        f"  GÖREV 2 — Yönlendirme   : top1={g2['yonlendirme']['top1']:.3f} "
        f"top3={g2['yonlendirme']['top3']:.3f}",
        f"           Yazı taslağı   : fmt_uyum={yt['format_uyumlu_rate']:.3f} "
        f"bileşen={yt['compliance_rate']:.3f} yazıTür={yt['yazi_turu_acc']:.3f} "
        f"saflık={yt['avg_turkish_purity']:.4f} "
        f"üslupJudge={_fmt_judge(yt.get('uslup_judge'))}",
        f"  ETİK    — Adillik       : sınıf={sc['etik']['class_consistency']:.4f} "
        f"birim={sc['etik']['route_consistency']:.4f}",
        bar,
    ])


def main(check_only: bool = False) -> int:
    sc = build_scorecard()
    print(render_console(sc))
    if not check_only:
        _DOC_OUT.parent.mkdir(parents=True, exist_ok=True)
        _DOC_OUT.write_text(render_markdown(sc), encoding="utf-8")
        _JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
        _JSON_OUT.write_text(json.dumps(sc, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  Jüri raporu -> {_DOC_OUT}")
        print(f"  JSON        -> {_JSON_OUT}")
    return 0


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="TEKNOFEST 1. Senaryo yarışma karnesi")
    ap.add_argument("--check", action="store_true", help="Yalnız konsol (rapor yazma)")
    args = ap.parse_args()
    sys.exit(main(check_only=args.check))
