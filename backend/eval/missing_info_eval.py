"""Görev 1 — Eksik bilgi tespiti değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("bulunması gereken ancak eksik olan bilgileri tespit edebilme")
+ §9 Uygulama ("eksik bilgi tespiti").

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur; `out['eksik_alanlar']`
(eksik_tespit_node çıktısı) gold ground-truth `eksik_alanlar` ile SET olarak
karşılaştırılır. Gold = insan-doğrulanabilir gerçek; pipeline'ın bu gerçeğe
yakınsaması ölçülür (mismatch = pipeline'ın gerçek tespit hatası).

Eksik-alan tespiti SET problemidir (bir evrakta 0+ eksik alan). Ölçer:
  - micro set precision / recall (tüm vakaların eksik-alan birleşimi üzerinden)
  - F-beta (β=2): RECALL-ÖNCELİKLİ. Bir eksik alanı KAÇIRMAK (vatandaş eksik
    evrakla bekletilir) fazladan işaretlemeden daha maliyetli → β=2 recall'ı 2× ağırlıklar.
  - exact-match: vakanın eksik kümesi TAM bilindi mi
  - %95 Wilson CI (recall) — küçük-N dürüstlüğü

NOT (mock taban): LLM_MODE=mock'ta cikar gönderen adını regex ile çıkaramaz →
gold'da mevcut olan 'gonderen_ad_soyad' eksik işaretlenebilir (dürüst recall açığı;
gerçek LLM modunda kapanır). Eval bunu olduğu gibi raporlar.

Çalıştır (PYTHONPATH=...\\backend): python -m eval.missing_info_eval
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

from agents.graph import build_graph
from agents.state import make_initial_state
from eval.stats import fmt_ci, wilson_interval

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "eksik_bilgi_gold.jsonl"
BETA = 2.0  # recall-öncelikli (eksik kaçırmak > fazla işaretlemek)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK pipeline'ı koş → r['pred_eksik'] doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["pred_eksik"] = set(out.get("eksik_alanlar") or [])

    asyncio.run(_run())


def f_beta(precision: float, recall: float, beta: float = BETA) -> float:
    b2 = beta * beta
    denom = b2 * precision + recall
    return (1 + b2) * precision * recall / denom if denom else 0.0


def evaluate(rows: list[dict]) -> dict:
    """Mikro set-P/R + F-beta + exact-match. TP/FP/FN tüm vakalar üzerinde toplanır."""
    run_pipeline(rows)
    tp = fp = fn = exact = 0
    for r in rows:
        gold = set(r["eksik_alanlar"])
        pred = set(r["pred_eksik"])
        tp += len(gold & pred)
        fp += len(pred - gold)
        fn += len(gold - pred)
        exact += int(gold == pred)
    n = len(rows)
    p = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    lo, hi = wilson_interval(tp, tp + fn)  # recall CI
    return {
        "n": n, "tp": tp, "fp": fp, "fn": fn,
        "precision": round(p, 4), "recall": round(rec, 4),
        "f_beta": round(f_beta(p, rec), 4), "beta": BETA,
        "recall_ci95": [round(lo, 3), round(hi, 3)],
        "exact_match": exact, "exact_match_rate": round(exact / n, 4) if n else 0.0,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 1 — EKSİK BİLGİ TESPİTİ (GERÇEK pipeline, set-P/R β={res['beta']})\n{bar}")
    print(f"  Vaka: {res['n']}  ·  TP={res['tp']} FP={res['fp']} FN={res['fn']}")
    print(f"  Set precision : {res['precision']:.3f}")
    print(f"  Set recall    : {res['recall']:.3f}  "
          f"(%95 CI {fmt_ci(res['tp'], res['tp'] + res['fn'])})")
    print(f"  F-beta (β=2)  : {res['f_beta']:.3f}  ← recall-öncelikli skor")
    print(f"  Exact-match   : {res['exact_match']}/{res['n']} "
          f"({res['exact_match_rate']:.0%})  (eksik küme TAM bilindi)")
    print("\n  Not: β=2 → eksik alanı KAÇIRMAK fazla-işaretlemeden 2× cezalı "
          "(vatandaşı eksik evrakla bekletmemek).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
