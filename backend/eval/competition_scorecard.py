"""TEKNOFEST 1. Senaryo — Yarışma karnesi (tek komut, tüm görevler).

Şartname §9 Puanlama: "Uygulama (35p) — sınıflandırma doğruluğu, yönlendirme
başarımı, özetleme ve yazı şablon oluşturma kalitesi, eksik bilgi tespiti" +
"Yöntem (35p)". Bu modül her iki görevin tüm DETERMİNİSTİK (LLM'siz) metriklerini
tek koşuda toplar, jüri-hazır Markdown karne üretir → docs/benchmark/scorecard.md
ve eval/runs/competition_scorecard.json.

Gerçek kamu verisi YOK (§6.5) → tüm ölçüm data/synthetic gold üzerinde. Mock ajan
boru hattı offline koşar (LLM/GPU/ağ gerekmez) → her commit'te CI regresyon kapısı.

Çalıştır (cd backend):
    python -m eval.competition_scorecard            # konsol + docs/benchmark/scorecard.md
    python -m eval.competition_scorecard --check     # yalnız konsol (rapor yazma)
"""

from __future__ import annotations

import contextlib
import json
import subprocess
import sys
from pathlib import Path

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent
_SYNTH = _REPO / "data" / "synthetic"
_DOC_OUT = _REPO / "docs" / "benchmark" / "scorecard.md"
_JSON_OUT = _BACKEND / "eval" / "runs" / "competition_scorecard.json"

_SCRIPTS = _REPO / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))


def _git_sha() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(_BACKEND),
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def build_scorecard() -> dict:
    """Tüm görev metriklerini koş → tek karne sözlüğü (saf, LLM'siz)."""
    import gen_synthetic as gs

    from eval import (
        draft_eval, evrak_class_eval, fairness_eval,
        missing_info_eval, routing_eval, summary_eval,
    )

    cls = evrak_class_eval.evaluate(evrak_class_eval.load_gold())
    route = routing_eval.evaluate(routing_eval.load_gold(), use_classified=True)
    missing = missing_info_eval.evaluate(missing_info_eval.load_gold())
    summ = summary_eval.evaluate(summary_eval.load_gold())
    draft = draft_eval.evaluate(draft_eval.load_gold())
    fair = fairness_eval.evaluate(fairness_eval.load_gold())

    return {
        "git_sha": _git_sha(),
        "evrak_turu_sayisi": len(gs.EVRAK_TURLERI),
        "birim_sayisi": len(gs.BIRIMLER),
        "gorev1": {
            "siniflandirma": {"accuracy": cls["accuracy"], "macro_f1": cls["macro_f1"],
                              "accuracy_ci95": cls["accuracy_ci95"],
                              "abstention_rate": cls["abstention_rate"],
                              "by_zorluk": cls["by_zorluk"]},
            "eksik_bilgi": {"precision": missing["precision"], "recall": missing["recall"],
                            "f_beta": missing["f_beta"], "beta": missing["beta"],
                            "recall_ci95": missing["recall_ci95"]},
            "ozet": {"micro_recall": summ["micro_recall"], "macro_recall": summ["macro_recall"],
                     "full_cover_rate": summ["full_cover_rate"], "avg_uzunluk": summ["avg_uzunluk"]},
        },
        "gorev2": {
            "yonlendirme": {"top1": route["top1_acc"], "top3": route["top3_acc"],
                            "soft": route["soft_acc"], "top1_ci95": route["top1_ci95"]},
            "yazi_taslak": {"compliance_rate": draft["compliance_rate"],
                            "avg_turkish_purity": draft["avg_turkish_purity"],
                            "per_component": draft["per_component"]},
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
    lines: list[str] = [
        "# TEKNOFEST 2026 — 1. Senaryo Yarışma Karnesi",
        "",
        "> Kamu Evrak ve Yazışma Süreçleri · DETERMİNİSTİK (LLM'siz) ölçüm · "
        "`cd backend && python -m eval.competition_scorecard` ile üretilir "
        f"(commit `{sc['git_sha']}`).",
        "",
        f"Sentetik korpus: **{sc['evrak_turu_sayisi']} evrak türü**, "
        f"**{sc['birim_sayisi']} birim** (gerçek kamu verisi YOK — şartname §6.5). "
        f"Vaka: sınıflandırma {sc['n']['siniflandirma']} · yönlendirme {sc['n']['yonlendirme']}.",
        "",
        "## Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1)",
        "",
        "| Metrik | Değer | %95 CI |",
        "|---|---|---|",
        f"| Sınıflandırma accuracy | **{s['accuracy']:.3f}** | "
        f"[{s['accuracy_ci95'][0]:.3f}, {s['accuracy_ci95'][1]:.3f}] |",
        f"| Sınıflandırma macro-F1 | **{s['macro_f1']:.3f}** | — |",
        f"| Abstention oranı (dürüst belirsizlik) | {s['abstention_rate']:.0%} | — |",
        f"| Eksik-bilgi recall (β=2) | **{g1['eksik_bilgi']['recall']:.3f}** | "
        f"[{g1['eksik_bilgi']['recall_ci95'][0]:.3f}, {g1['eksik_bilgi']['recall_ci95'][1]:.3f}] |",
        f"| Eksik-bilgi F-beta | {g1['eksik_bilgi']['f_beta']:.3f} | — |",
        f"| Özet key-fact recall (mikro) | **{g1['ozet']['micro_recall']:.3f}** | — |",
        f"| Özet ort. uzunluk | {g1['ozet']['avg_uzunluk']} kelime | — |",
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
        f"| Yönlendirme soft-match | {g2['yonlendirme']['soft']:.3f} | — |",
        f"| Yazı taslağı format-uyum | **{g2['yazi_taslak']['compliance_rate']:.3f}** | — |",
        f"| Yazı Türkçe saflık | {g2['yazi_taslak']['avg_turkish_purity']:.4f} | — |",
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
        "> Bu karne YALNIZ deterministik (kural/regex/eşik-tabanlı) mock-ajan boru hattını "
        "ölçer — LLM/GPU/ağ gerektirmez, her commit'te CI'da koşabilir. Mock skorları "
        "tavan DEĞİL taban: gerçek LLM ajanları (üretim modu) bu metrikleri yükseltir. "
        "Wilson %95 güven aralıkları küçük-N belirsizliğini dürüstçe gösterir.",
        "",
    ]
    return "\n".join(lines)


def render_console(sc: dict) -> str:
    g1, g2 = sc["gorev1"], sc["gorev2"]
    s = g1["siniflandirma"]
    bar = "=" * 66
    return "\n".join([
        f"\n{bar}",
        f"  TEKNOFEST 1. SENARYO KARNESİ  (commit {sc['git_sha']})",
        bar,
        f"  GÖREV 1 — Sınıflandırma : acc={s['accuracy']:.3f} macroF1={s['macro_f1']:.3f} "
        f"abstain={s['abstention_rate']:.0%}",
        f"           Eksik-bilgi    : recall={g1['eksik_bilgi']['recall']:.3f} "
        f"Fβ={g1['eksik_bilgi']['f_beta']:.3f}",
        f"           Özet recall    : {g1['ozet']['micro_recall']:.3f} "
        f"(ort {g1['ozet']['avg_uzunluk']} kelime)",
        f"  GÖREV 2 — Yönlendirme   : top1={g2['yonlendirme']['top1']:.3f} "
        f"top3={g2['yonlendirme']['top3']:.3f} soft={g2['yonlendirme']['soft']:.3f}",
        f"           Yazı taslağı   : uyum={g2['yazi_taslak']['compliance_rate']:.3f} "
        f"saflık={g2['yazi_taslak']['avg_turkish_purity']:.4f}",
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
