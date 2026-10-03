"""Görev 2 — Birim yönlendirme değerlendirmesi.

Şartname §6.4.2 ("doğru birime yönlendirme") + §9 ("yönlendirme başarımı").

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur. Her gold metni için
`out['hedef_birim']` (Top-1) ve `out['birim_alternatifleri']` (Top-3 aday)
config.BIRIMLER key'i olarak gold `beklenen_birim` ile karşılaştırılır.
Yönlendirme, gerçek siniflandir→route_birim zincirinden beslenir → sınıf hatası
yönlendirmeye yansır (uçtan-uca gerçekçilik; izole tablo doğruluğu değil).

Ölçer:
  - Top-1 accuracy: hedef_birim == beklenen_birim + %95 Wilson CI
  - Top-3 accuracy: beklenen_birim, birim_alternatifleri ilk 3'ünde mi

Çalıştır (PYTHONPATH=...\\backend): python -m eval.routing_eval
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

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "routing_gold.jsonl"


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK pipeline'ı koş → r['pred_birim'], r['alts'] doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            # Type-bazlı gold ile karşılaştırma hedef_kategori (deterministik 9-set köprüsü)
            # üzerinden; ROUTE_AJAN=0'da hedef_birim koddur. Doğrulanmış birim ADI ayrı ölçülür.
            r["pred_birim"] = out.get("hedef_kategori") or out.get("hedef_birim") or ""
            r["alts"] = list(out.get("birim_alternatifleri") or [])
            r["pred_turu"] = out.get("evrak_turu", "belirsiz")

    asyncio.run(_run())


def evaluate(rows: list[dict]) -> dict:
    """Yönlendirme metrikleri — gerçek pipeline hedef_birim + birim_alternatifleri."""
    run_pipeline(rows)
    top1 = top3 = 0
    for r in rows:
        beklenen = r["beklenen_birim"]
        top1 += int(r["pred_birim"] == beklenen)
        top3 += int(beklenen in r["alts"][:3])
    n = len(rows)
    lo1, hi1 = wilson_interval(top1, n)
    return {
        "n": n,
        "top1": top1, "top1_acc": round(top1 / n, 4) if n else 0.0,
        "top1_ci95": [round(lo1, 3), round(hi1, 3)],
        "top3": top3, "top3_acc": round(top3 / n, 4) if n else 0.0,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 2 — BİRİM YÖNLENDİRME (GERÇEK pipeline)\n{bar}")
    print(f"  Vaka: {res['n']}")
    print(f"  Top-1 (uçtan-uca): {res['top1_acc']:.3f}  "
          f"(%95 CI {fmt_ci(res['top1'], res['n'])})")
    print(f"  Top-3            : {res['top3_acc']:.3f}")
    print("\n  Not: yönlendirme siniflandir→route_birim zincirinden beslenir; "
          "düşük Top-1 sıklıkla SINIFLANDIRMA hatasından gelir (mock-LLM tabanı).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
