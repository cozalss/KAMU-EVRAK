"""Görev 1 — Evrak sınıflandırma değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("evrakın türünü belirleme") + §9 Uygulama ("sınıflandırma doğruluğu").

Ölçer:
  - accuracy (mikro doğruluk) + %95 Wilson CI (stats.py)
  - macro-F1 (sınıf-dengesiz korpus için adil; stdlib — sklearn opsiyonel)
  - per-class precision/recall/F1
  - confusion (en sık karışan tür çiftleri)
  - abstention oranı (düşük-güvende 'genel_evrak'a düşme = dürüst belirsizlik)

Mock modda (LLM yok) gen_synthetic.mock_classify ile koşar → offline/CI. Skor 1.0
değil, gerçekçi (zor örneklerde örtük metin kaçar) — önemli olan HARNESS çalışsın.

Çalıştır (cd backend): python -m eval.evrak_class_eval
"""

from __future__ import annotations

import contextlib
import json
import sys
from pathlib import Path

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

# scripts/gen_synthetic.py = yarışma domain modeli + mock ajan (ortak kaynak).
_SCRIPTS = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import gen_synthetic as gs  # noqa: E402

from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "evrak_class_gold.jsonl"
ABSTAIN_CLASS = "genel_evrak"      # düşük-güvende buraya düşülür (dürüst belirsizlik)
ABSTAIN_CONF_FLOOR = 0.45          # güven < bu = abstain sayılır (mock_classify ile uyumlu)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce `python ../scripts/gen_synthetic.py` koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def macro_f1(rows: list[dict]) -> tuple[float, dict[str, dict]]:
    """Sınıf-bazlı P/R/F1 + makro ortalama (stdlib; sklearn gerekmez)."""
    labels = sorted({r["evrak_turu"] for r in rows} | {r["pred"] for r in rows})
    per: dict[str, dict] = {}
    for lab in labels:
        tp = sum(1 for r in rows if r["pred"] == lab and r["evrak_turu"] == lab)
        fp = sum(1 for r in rows if r["pred"] == lab and r["evrak_turu"] != lab)
        fn = sum(1 for r in rows if r["pred"] != lab and r["evrak_turu"] == lab)
        p = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * p * rec / (p + rec) if (p + rec) else 0.0
        per[lab] = {"precision": round(p, 3), "recall": round(rec, 3),
                    "f1": round(f1, 3), "support": tp + fn}
    present = [lab for lab in labels if per[lab]["support"] > 0]
    mf1 = sum(per[lab]["f1"] for lab in present) / len(present) if present else 0.0
    return round(mf1, 4), per


def confusion_pairs(rows: list[dict], top: int = 6) -> list[tuple[str, str, int]]:
    """En sık (gerçek → tahmin) karışma çiftleri (doğru olanlar hariç)."""
    cnt: dict[tuple[str, str], int] = {}
    for r in rows:
        if r["pred"] != r["evrak_turu"]:
            key = (r["evrak_turu"], r["pred"])
            cnt[key] = cnt.get(key, 0) + 1
    return sorted(((a, b, n) for (a, b), n in cnt.items()), key=lambda x: -x[2])[:top]


def evaluate(rows: list[dict]) -> dict:
    """mock_classify ile tahmin et + tüm metrikleri hesapla."""
    for r in rows:
        pred, conf = gs.mock_classify(r["metin"])
        r["pred"], r["conf"] = pred, conf
    n = len(rows)
    correct = sum(1 for r in rows if r["pred"] == r["evrak_turu"])
    acc = correct / n if n else 0.0
    mf1, per = macro_f1(rows)
    abstain = sum(1 for r in rows if r["conf"] < ABSTAIN_CONF_FLOOR or r["pred"] == ABSTAIN_CLASS)
    # zorluk kırılımı (jüri: stratifikasyon kanıtı)
    by_zorluk = {z: {"n": 0, "ok": 0} for z in gs.ZORLUK}
    for r in rows:
        z = r.get("zorluk", "orta")
        if z in by_zorluk:
            by_zorluk[z]["n"] += 1
            by_zorluk[z]["ok"] += int(r["pred"] == r["evrak_turu"])
    lo, hi = wilson_interval(correct, n)
    return {
        "n": n, "correct": correct, "accuracy": round(acc, 4),
        "accuracy_ci95": [round(lo, 3), round(hi, 3)], "macro_f1": mf1,
        "per_class": per, "abstention_rate": round(abstain / n, 3) if n else 0.0,
        "abstention_count": abstain, "confusion": confusion_pairs(rows),
        "by_zorluk": {z: round(v["ok"] / v["n"], 3) if v["n"] else 0.0
                      for z, v in by_zorluk.items()},
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 1 — EVRAK SINIFLANDIRMA (mock, deterministik)\n{bar}")
    print(f"  Vaka: {res['n']} · doğru: {res['correct']}")
    print(f"  Accuracy : {res['accuracy']:.3f}  (%95 CI {fmt_ci(res['correct'], res['n'])})")
    print(f"  Macro-F1 : {res['macro_f1']:.3f}")
    print(f"  Abstention: {res['abstention_count']}/{res['n']} "
          f"({res['abstention_rate']:.0%})  (düşük-güven → genel_evrak)")
    print(f"  Zorluk acc: {res['by_zorluk']}")
    print("\n  En sık karışmalar (gerçek → tahmin):")
    for a, b, k in res["confusion"]:
        print(f"    {a:18s} → {b:18s} : {k}")
    print("\n  En zayıf 5 sınıf (F1):")
    weak = sorted(res["per_class"].items(), key=lambda kv: kv[1]["f1"])[:5]
    for lab, m in weak:
        print(f"    {lab:18s} P={m['precision']:.2f} R={m['recall']:.2f} "
              f"F1={m['f1']:.2f} (n={m['support']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
