"""Held-out (DÜRÜST, dairesel-OLMAYAN) değerlendirme — sınıflandırma + yönlendirme.

NEDEN: in-domain gold (`evrak_class_eval`/`routing_eval`) skoru DAİRESELDİR — gold
şablonları heuristiğin baktığı tür-imzası keyword'lerini taşır → ezber-tavanı (~0.92).
Bu harness FARKLI şablon/sözlükle üretilen held-out seti (`data/synthetic/heldout_gold.jsonl`,
`scripts/gen_heldout.py`) üzerinde GERÇEK pipeline'ı (agents/graph.py) koşar →
GENELLEME ölçümü. Aynı kod, FARKLI dağılım → dürüst skor.

BEKLENTİ (kritik dürüstlük notu): LLM_MODE=mock'ta keyword-heuristik fallback,
held-out'un dolaylı/örtük anlatımında çok daha DÜŞÜK skor verir — bu BEKLENİR ve
DÜRÜSTTÜR. Gerçek-mod (LLM_MODE=openai/llamacpp; few-shot güçlendirildi) semantik
anlamla çözerek held-out skorunu yükseltir. Skor farkı (in-domain − held-out) =
keyword sızıntısının yarattığı GENELLEME AÇIĞIDIR; bu rapora "held-out (honest)"
diye yazılır.

Ölçer:
  - Sınıflandırma: macro-F1 + accuracy + %95 Wilson CI + abstention oranı
  - Yönlendirme: Top-1 (+ Wilson CI) + Top-3 (uçtan-uca; sınıf hatası yansır)
  - in-domain vs held-out karşılaştırma satırı (genelleme açığı görünür)

Çalıştır (PYTHONPATH=...\\backend): python -m eval.heldout_eval
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from agents.config import EVRAK_TURLERI  # noqa: E402
from agents.graph import build_graph  # noqa: E402
from agents.state import make_initial_state  # noqa: E402
from eval.evrak_class_eval import confusion_pairs, macro_f1  # noqa: E402 (DRY: aynı metrik)
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "heldout_gold.jsonl"
ABSTAIN_CLASS = "belirsiz"
ABSTAIN_CONF_FLOOR = 0.45  # güven < bu = abstain (siniflandir eşiği ile uyumlu)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"Held-out gold yok: {path} — önce `python scripts/gen_heldout.py` koşun."
        )
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK LangGraph pipeline'ı her satıra koş → sınıf + yönlendirme tahminleri doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["pred"] = out.get("evrak_turu", ABSTAIN_CLASS)
            r["conf"] = float(out.get("tur_confidence", 0.0) or 0.0)
            r["pred_birim"] = out.get("hedef_birim", "")
            r["alts"] = list(out.get("birim_alternatifleri") or [])

    asyncio.run(_run())


def evaluate(rows: list[dict]) -> dict:
    """Held-out üzerinde GERÇEK pipeline ile sınıflandırma + yönlendirme metrikleri."""
    run_pipeline(rows)
    n = len(rows)
    correct = sum(1 for r in rows if r["pred"] == r["evrak_turu"])
    acc = correct / n if n else 0.0
    mf1, per = macro_f1(rows)
    abstain = sum(1 for r in rows if r["conf"] < ABSTAIN_CONF_FLOOR or r["pred"] == ABSTAIN_CLASS)

    top1 = sum(1 for r in rows if r["pred_birim"] == r["beklenen_birim"])
    top3 = sum(1 for r in rows if r["beklenen_birim"] in r["alts"][:3])

    lo, hi = wilson_interval(correct, n)
    r1_lo, r1_hi = wilson_interval(top1, n)
    return {
        "n": n, "correct": correct, "accuracy": round(acc, 4),
        "accuracy_ci95": [round(lo, 3), round(hi, 3)], "macro_f1": mf1,
        "per_class": per, "abstention_rate": round(abstain / n, 3) if n else 0.0,
        "abstention_count": abstain, "confusion": confusion_pairs(rows),
        "n_classes": len(EVRAK_TURLERI),
        "route_top1": top1, "route_top1_acc": round(top1 / n, 4) if n else 0.0,
        "route_top1_ci95": [round(r1_lo, 3), round(r1_hi, 3)],
        "route_top3": top3, "route_top3_acc": round(top3 / n, 4) if n else 0.0,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 70
    print(f"\n{bar}\n  HELD-OUT (DÜRÜST, dairesel-OLMAYAN) — SINIFLANDIRMA + YÖNLENDİRME\n{bar}")
    print(f"  Vaka: {res['n']} · doğru: {res['correct']} · kapalı-küme: {res['n_classes']} sınıf")
    print("  --- Görev 1: sınıflandırma ---")
    print(f"  Accuracy : {res['accuracy']:.3f}  (%95 CI {fmt_ci(res['correct'], res['n'])})")
    print(f"  Macro-F1 : {res['macro_f1']:.3f}")
    print(f"  Abstention: {res['abstention_count']}/{res['n']} ({res['abstention_rate']:.0%})")
    print("  --- Görev 2: yönlendirme (uçtan-uca) ---")
    print(f"  Top-1    : {res['route_top1_acc']:.3f}  (%95 CI {fmt_ci(res['route_top1'], res['n'])})")
    print(f"  Top-3    : {res['route_top3_acc']:.3f}")
    print("\n  En sık karışmalar (gerçek → tahmin):")
    for a, b, k in res["confusion"]:
        print(f"    {a:20s} → {b:20s} : {k}")
    print("\n  NOT (dürüstlük): mock-modda DÜŞÜK skor BEKLENİR — held-out gövdesi DOLAYLI/")
    print("  ÖRTÜK; heuristik keyword'leri yok. Gerçek-mod (LLM) semantik çözer.")
    print("  in-domain − held-out farkı = keyword sızıntısı genelleme açığı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
