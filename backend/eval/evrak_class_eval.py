"""Görev 1 — Evrak sınıflandırma değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("evrakın türünü belirleme") + §9 Uygulama ("sınıflandırma doğruluğu").

ÖLÇÜM HEDEFİ (kritik): GERÇEK pipeline (agents/graph.py) koşulur — mock taksonomi
DEĞİL. Her gold satırının metni `build_graph().ainvoke(make_initial_state(text))`
ile işlenir; `out['evrak_turu']` (config.EVRAK_TURLERI kapalı-kümesi) gold ile
karşılaştırılır. LLM_MODE=mock'ta siniflandir_node keyword-heuristik fallback'e
düşer (gerçek pipeline yine tür üretir) → offline/CI'da deterministik koşar.

Ölçer:
  - accuracy (mikro doğruluk) + %95 Wilson CI (stats.py)
  - macro-F1 (sınıf-dengesiz korpus için adil; stdlib — sklearn opsiyonel)
  - per-class precision/recall/F1
  - confusion (en sık karışan tür çiftleri)
  - abstention oranı ('belirsiz' veya düşük güven = dürüst belirsizlik)

Çalıştır (PYTHONPATH=...\\backend): python -m eval.evrak_class_eval
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

from agents.config import EVRAK_TURLERI, ayni_esdeger_grup, esdeger_grup  # noqa: E402
from agents.graph import build_graph  # noqa: E402
from agents.state import make_initial_state  # noqa: E402
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "evrak_class_gold.jsonl"
ABSTAIN_CLASS = "belirsiz"     # kapalı-küme abstention etiketi (config)
ABSTAIN_CONF_FLOOR = 0.45      # güven < bu = abstain sayılır (siniflandir eşiği ile uyumlu)
ZORLUK = ("kolay", "orta", "zor")


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce `python scripts/gen_synthetic.py` koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK LangGraph pipeline'ı her satıra koş → r['pred'], r['conf'] doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["pred"] = out.get("evrak_turu", ABSTAIN_CLASS)
            r["conf"] = float(out.get("tur_confidence", 0.0) or 0.0)

    asyncio.run(_run())


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


def operational_accuracy(rows: list[dict]) -> float:
    """Operasyonel doğruluk: tahmin, gerçeğin EŞDEĞER-grubunda mı (config.EVRAK_ESDEGER)?

    Sıkı doğruluğun YERİNE değil YANINDA raporlanır. talep↔dilekçe gibi insan
    etiketleyicinin bile karıştırdığı bulanık-sınır çiftleri 'eşdeğer' sayılır
    (çoğu aynı birime havale → operasyonel olarak doğru); 'belirsiz' (abstention)
    hiçbir şeyle eşdeğer değildir → sıkı kalır.
    """
    n = len(rows)
    if not n:
        return 0.0
    ok = sum(1 for r in rows if ayni_esdeger_grup(r["pred"], r["evrak_turu"]))
    return ok / n


def operational_macro_f1(rows: list[dict]) -> float:
    """Eşdeğer-grup düzeyinde macro-F1 (tür yerine grup etiketiyle).

    Sınıfları operasyonel-eşdeğer gruba indirger, sonra aynı macro_f1 mantığını
    grup-etiketi üzerinde koşar → taksonomi-belirsizliğinden arındırılmış adil skor.
    """
    grouped = [
        {"evrak_turu": esdeger_grup(r["evrak_turu"]), "pred": esdeger_grup(r["pred"])}
        for r in rows
    ]
    mf1, _ = macro_f1(grouped)
    return mf1


def evaluate(rows: list[dict]) -> dict:
    """GERÇEK pipeline ile tahmin et + tüm metrikleri hesapla."""
    run_pipeline(rows)
    n = len(rows)
    correct = sum(1 for r in rows if r["pred"] == r["evrak_turu"])
    acc = correct / n if n else 0.0
    mf1, per = macro_f1(rows)
    abstain = sum(1 for r in rows if r["conf"] < ABSTAIN_CONF_FLOOR or r["pred"] == ABSTAIN_CLASS)
    by_zorluk = {z: {"n": 0, "ok": 0} for z in ZORLUK}
    for r in rows:
        z = r.get("zorluk", "orta")
        if z in by_zorluk:
            by_zorluk[z]["n"] += 1
            by_zorluk[z]["ok"] += int(r["pred"] == r["evrak_turu"])
    op_correct = sum(1 for r in rows if ayni_esdeger_grup(r["pred"], r["evrak_turu"]))
    op_acc = operational_accuracy(rows)
    op_mf1 = operational_macro_f1(rows)
    lo, hi = wilson_interval(correct, n)
    op_lo, op_hi = wilson_interval(op_correct, n)
    return {
        "n": n, "correct": correct, "accuracy": round(acc, 4),
        "accuracy_ci95": [round(lo, 3), round(hi, 3)], "macro_f1": mf1,
        "operational_accuracy": round(op_acc, 4),
        "operational_accuracy_ci95": [round(op_lo, 3), round(op_hi, 3)],
        "operational_correct": op_correct, "operational_macro_f1": op_mf1,
        "per_class": per, "abstention_rate": round(abstain / n, 3) if n else 0.0,
        "abstention_count": abstain, "confusion": confusion_pairs(rows),
        "n_classes": len(EVRAK_TURLERI),
        "by_zorluk": {z: round(v["ok"] / v["n"], 3) if v["n"] else 0.0
                      for z, v in by_zorluk.items()},
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 1 — EVRAK SINIFLANDIRMA (GERÇEK pipeline, mock-LLM)\n{bar}")
    print(f"  Vaka: {res['n']} · doğru: {res['correct']} · kapalı-küme: {res['n_classes']} sınıf")
    print("  --- SIKI metrik (tam tür eşleşmesi) ---")
    print(f"  Accuracy : {res['accuracy']:.3f}  (%95 CI {fmt_ci(res['correct'], res['n'])})")
    print(f"  Macro-F1 : {res['macro_f1']:.3f}")
    print("  --- OPERASYONEL metrik (eşdeğer-grup; config.EVRAK_ESDEGER) ---")
    print(f"  Op-Accuracy: {res['operational_accuracy']:.3f}  "
          f"(%95 CI {fmt_ci(res['operational_correct'], res['n'])})")
    print(f"  Op-Macro-F1: {res['operational_macro_f1']:.3f}")
    print(f"  Abstention: {res['abstention_count']}/{res['n']} "
          f"({res['abstention_rate']:.0%})  (belirsiz / düşük-güven)")
    print(f"  Zorluk acc: {res['by_zorluk']}")
    print("\n  En sık karışmalar (gerçek → tahmin):")
    for a, b, k in res["confusion"]:
        print(f"    {a:20s} → {b:20s} : {k}")
    print("\n  En zayıf 5 sınıf (F1):")
    weak = sorted((kv for kv in res["per_class"].items() if kv[1]["support"] > 0),
                  key=lambda kv: kv[1]["f1"])[:5]
    for lab, m in weak:
        print(f"    {lab:20s} P={m['precision']:.2f} R={m['recall']:.2f} "
              f"F1={m['f1']:.2f} (n={m['support']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
