"""Görev 1 — Eksik bilgi tespiti değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("bulunması gereken ancak eksik olan bilgileri tespit edebilme")
+ §9 Uygulama ("eksik bilgi tespiti").

Eksik-alan tespiti SET problemidir (bir evrakta 0+ eksik alan olabilir). Ölçer:
  - micro set precision / recall (tüm vakaların eksik-alan birleşimi üzerinden)
  - F-beta (β=2): RECALL-ÖNCELİKLİ. Bir eksik alanı KAÇIRMAK (vatandaş eksik
    evrakla bekletilir) fazladan işaretlemeden daha maliyetli → β=2 recall'ı 2× ağırlıklar.
  - exact-match: vakanın eksik kümesi TAM bilindi mi
  - %95 Wilson CI (recall) — küçük-N dürüstlüğü

Mock modda gen_synthetic.mock_missing_fields ile koşar (offline).

Çalıştır (cd backend): python -m eval.missing_info_eval
"""

from __future__ import annotations

import contextlib
import json
import sys
from pathlib import Path

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_SCRIPTS = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import gen_synthetic as gs  # noqa: E402

from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "eksik_bilgi_gold.jsonl"
BETA = 2.0  # recall-öncelikli (eksik kaçırmak > fazla işaretlemek)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def f_beta(precision: float, recall: float, beta: float = BETA) -> float:
    b2 = beta * beta
    denom = b2 * precision + recall
    return (1 + b2) * precision * recall / denom if denom else 0.0


def evaluate(rows: list[dict]) -> dict:
    """Mikro set-P/R + F-beta + exact-match. TP/FP/FN tüm vakalar üzerinde toplanır."""
    tp = fp = fn = exact = 0
    for r in rows:
        gold = set(r["eksik_alanlar"])
        pred = set(gs.mock_missing_fields(r["metin"], r["evrak_turu"]))
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
    print(f"\n{bar}\n  GÖREV 1 — EKSİK BİLGİ TESPİTİ (set-P/R, β={res['beta']})\n{bar}")
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
