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

import argparse
import asyncio
import contextlib
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from agents.config import EVRAK_TURLERI, ayni_esdeger_grup
from agents.graph import build_graph
from agents.state import make_initial_state
from api.pii import mask_pii
from eval.evrak_class_eval import (
    confusion_pairs,
    macro_f1,
    operational_accuracy,
    operational_macro_f1,
)
from eval.stats import bootstrap_bca_ci, fmt_ci, wilson_interval

_DATA = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic"
GOLD = _DATA / "heldout_gold.jsonl"  # 1. held-out (varsayılan; geri uyum)
# İsimli set kısayolları (CLI --set). Yeni bir set eklemek = bir satır eklemek.
GOLD_SETS: dict[str, Path] = {
    "heldout": GOLD,
    "heldout2": _DATA / "heldout2_gold.jsonl",  # 2. held-out (çapraz-doğrulama)
}
ABSTAIN_CLASS = "belirsiz"
ABSTAIN_CONF_FLOOR = 0.45  # güven < bu = abstain (siniflandir eşiği ile uyumlu)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        # Hangi üreteç koşulmalı? heldout2 → gen_heldout2.py, diğeri gen_heldout.py.
        uretec = "gen_heldout2.py" if "heldout2" in path.name else "gen_heldout.py"
        raise FileNotFoundError(
            f"Held-out gold yok: {path} — önce `python scripts/{uretec}` koşun."
        )
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def resolve_gold_path(set_adi: str | None, gold: str | None) -> Path:
    """CLI seçimini gold yoluna çevir. --gold (açık yol) --set'ten önceliklidir.

    --gold yoksa --set kısayolu (heldout|heldout2); ikisi de yoksa varsayılan 1. set
    (geri uyum: parametresiz çağrı eski davranışı korur).
    """
    if gold:
        return Path(gold)
    if set_adi:
        if set_adi not in GOLD_SETS:
            secenek = ", ".join(GOLD_SETS)
            raise SystemExit(f"Bilinmeyen --set '{set_adi}'. Seçenekler: {secenek}")
        return GOLD_SETS[set_adi]
    return GOLD


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK LangGraph pipeline'ı her satıra koş → sınıf + yönlendirme tahminleri doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["pred"] = out.get("evrak_turu", ABSTAIN_CLASS)
            r["conf"] = float(out.get("tur_confidence", 0.0) or 0.0)
            # Kaynak-doğrulamalı ajan: type-bazlı gold ile karşılaştırma hedef_kategori
            # (deterministik 9-set köprüsü) üzerinden yapılır; ROUTE_AJAN=0'da hedef_birim koddur.
            # (Doğrulanmış birim ADI ayrı içerik-bazlı gold ile ölçülür — bu eval type-bazlı.)
            r["pred_birim"] = out.get("hedef_kategori") or out.get("hedef_birim") or ""
            r["alts"] = list(out.get("birim_alternatifleri") or [])

    asyncio.run(_run())


def evaluate(rows: list[dict]) -> dict:
    """Held-out üzerinde GERÇEK pipeline ile sınıflandırma + yönlendirme metrikleri."""
    run_pipeline(rows)
    n = len(rows)
    correct = sum(1 for r in rows if r["pred"] == r["evrak_turu"])
    acc = correct / n if n else 0.0
    mf1, per = macro_f1(rows)
    # Macro-F1 BCa %95 CI (Wilson oran metriklerinde; macro-F1 oran DEĞİL → bootstrap-BCa).
    _, mf1_lo, mf1_hi = bootstrap_bca_ci(rows, lambda rs: macro_f1(rs)[0], n_resamples=2000)
    abstain = sum(1 for r in rows if r["conf"] < ABSTAIN_CONF_FLOOR or r["pred"] == ABSTAIN_CLASS)

    top1 = sum(1 for r in rows if r["pred_birim"] == r["beklenen_birim"])
    top3 = sum(1 for r in rows if r["beklenen_birim"] in r["alts"][:3])

    op_correct = sum(1 for r in rows if ayni_esdeger_grup(r["pred"], r["evrak_turu"]))
    op_acc = operational_accuracy(rows)
    op_mf1 = operational_macro_f1(rows)
    lo, hi = wilson_interval(correct, n)
    op_lo, op_hi = wilson_interval(op_correct, n)
    r1_lo, r1_hi = wilson_interval(top1, n)
    return {
        "n": n, "correct": correct, "accuracy": round(acc, 4),
        "accuracy_ci95": [round(lo, 3), round(hi, 3)], "macro_f1": mf1,
        "macro_f1_ci95_bca": [round(mf1_lo, 3), round(mf1_hi, 3)],
        "operational_accuracy": round(op_acc, 4),
        "operational_accuracy_ci95": [round(op_lo, 3), round(op_hi, 3)],
        "operational_correct": op_correct, "operational_macro_f1": op_mf1,
        "per_class": per, "abstention_rate": round(abstain / n, 3) if n else 0.0,
        "abstention_count": abstain, "confusion": confusion_pairs(rows),
        "n_classes": len(EVRAK_TURLERI),
        "route_top1": top1, "route_top1_acc": round(top1 / n, 4) if n else 0.0,
        "route_top1_ci95": [round(r1_lo, 3), round(r1_hi, 3)],
        "route_top3": top3, "route_top3_acc": round(top3 / n, 4) if n else 0.0,
    }


def _artifact_row(r: dict[str, Any]) -> dict[str, Any]:
    """Tek tahmin satırı — metin PII-MASKELİ (set sentetik olsa da TCKN/telefon deseni
    secret-scanner tetiklemesin; projenin api.pii.mask_pii yardımcısıyla, DRY)."""
    metin = (r.get("metin", "") or "")[:200]
    return {
        "metin": mask_pii(metin).masked_text,
        "gercek": r.get("evrak_turu"),
        "tahmin": r.get("pred"),
        "conf": round(float(r.get("conf", 0.0) or 0.0), 3),
        "beklenen_birim": r.get("beklenen_birim"),
        "tahmin_birim": r.get("pred_birim"),
        "dogru": r.get("pred") == r.get("evrak_turu"),
    }


def dump_artifact(
    path: str | os.PathLike[str],
    gold_path: Path,
    set_etiketi: str,
    res: dict[str, Any],
    rows: list[dict[str, Any]],
) -> None:
    """Reprodüksiyon artefaktı yaz — metrikler + per-satır tahmin/gold + meta.

    NEDEN (jüri-güveni): gerçek-LLM (gpt-4o) held-out skoru markdown'a ELLE yazılırsa
    bağımsız doğrulanamaz. Bu artefakt (tahmin/gold + model + LLM_MODE + tarih) commit'lenince
    jüri sayıları reprodüke edebilir; .md tabloları da bundan üretilebilir (drift biter).
    PII: per-satır metin `mask_pii` ile maskelenir (sentetik desen scanner tetiklemesin);
    API anahtarı ASLA yazılmaz (yalnız LLM_MODE + model adı).
    """
    mode = os.getenv("LLM_MODE", "mock")
    model = os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini") if mode == "openai" else "—"
    artefakt = {
        "set": set_etiketi,
        "gold_dosya": gold_path.name,
        "tarih": datetime.datetime.now(tz=datetime.UTC).isoformat(),
        "llm_mode": mode,
        "model": model,
        "metrikler": res,
        "tahminler": [_artifact_row(r) for r in rows],
    }
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        out.write_text(
            json.dumps(artefakt, ensure_ascii=False, indent=2), encoding="utf-8",
        )
    except OSError as exc:
        raise SystemExit(f"Artefakt yazılamadı ({out}): {exc}") from exc
    print(f"\n  ✓ Artefakt yazıldı: {out} ({len(rows)} tahmin, model={model})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Held-out (dürüst, dairesel-olmayan) sınıflandırma + yönlendirme değerlendirmesi")
    ap.add_argument("--set", dest="set_adi", choices=tuple(GOLD_SETS), default=None,
                    help="isimli held-out seti (heldout=1. set varsayılan, heldout2=çapraz-doğrulama)")
    ap.add_argument("--gold", type=str, default=None,
                    help="açık gold JSONL yolu (--set'i ezer; varsayılan 1. held-out)")
    ap.add_argument("--dump", type=str, default=None,
                    help="reprodüksiyon artefaktı JSON yolu (metrik + per-satır tahmin/gold + meta)")
    args = ap.parse_args(argv)

    gold_path = resolve_gold_path(args.set_adi, args.gold)
    set_etiketi = args.set_adi or ("heldout2" if "heldout2" in gold_path.name else "heldout")
    rows = load_gold(gold_path)
    res = evaluate(rows)
    bar = "=" * 70
    print(f"\n{bar}\n  HELD-OUT [{set_etiketi}] (DÜRÜST, dairesel-OLMAYAN) — "
          f"SINIFLANDIRMA + YÖNLENDİRME\n{bar}")
    print(f"  Set dosyası: {gold_path.name}")
    print(f"  Vaka: {res['n']} · doğru: {res['correct']} · kapalı-küme: {res['n_classes']} sınıf")
    print("  --- Görev 1: sınıflandırma (SIKI — tam tür eşleşmesi) ---")
    print(f"  Accuracy : {res['accuracy']:.3f}  (%95 CI {fmt_ci(res['correct'], res['n'])})")
    _mf1ci = res.get("macro_f1_ci95_bca", [0.0, 0.0])
    print(f"  Macro-F1 : {res['macro_f1']:.3f}  (BCa %95 CI [{_mf1ci[0]:.3f}, {_mf1ci[1]:.3f}])")
    print("  --- Görev 1: OPERASYONEL (eşdeğer-grup; config.EVRAK_ESDEGER) ---")
    print(f"  Op-Accuracy: {res['operational_accuracy']:.3f}  "
          f"(%95 CI {fmt_ci(res['operational_correct'], res['n'])})")
    print(f"  Op-Macro-F1: {res['operational_macro_f1']:.3f}")
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
    if args.dump:
        dump_artifact(args.dump, gold_path, set_etiketi, res, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
