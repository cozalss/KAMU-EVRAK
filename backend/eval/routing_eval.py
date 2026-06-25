"""Görev 2 — Birim yönlendirme değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.2 ("doğru birime yönlendirme") + §9 ("yönlendirme başarımı").

Ölçer:
  - Top-1 accuracy: tahmin == beklenen_birim + %95 Wilson CI
  - Top-3 accuracy: beklenen_birim, tahminin ilk 3 alternatifi içinde mi
  - soft-match: tahmin, kabul_edilebilir_birimler kümesinde mi (jüri esnek kabul)

Mock route gerçek evrak_turu'ndan değil, ÖNCE mock_classify(metin) tahmininden
beslenir → yanlış sınıflandırma yönlendirmeyi de bozar (uçtan-uca gerçekçilik).

Çalıştır (cd backend): python -m eval.routing_eval
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

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "routing_gold.jsonl"


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def evaluate(rows: list[dict], *, use_classified: bool = True) -> dict:
    """Yönlendirme metrikleri. use_classified=True → mock_classify(metin) tahminini
    kullan (uçtan-uca: sınıf hatası yönlendirmeye yansır); False → gold evrak_turu."""
    top1 = top3 = soft = 0
    for r in rows:
        turu = gs.mock_classify(r["metin"])[0] if use_classified else r["evrak_turu"]
        pred_birim, alts = gs.mock_route(turu)
        beklenen = r["beklenen_birim"]
        kabul = set(r.get("kabul_edilebilir_birimler", [beklenen]))
        r["pred_birim"] = pred_birim
        top1 += int(pred_birim == beklenen)
        top3 += int(beklenen in alts[:3])
        soft += int(pred_birim in kabul)
    n = len(rows)
    lo1, hi1 = wilson_interval(top1, n)
    return {
        "n": n, "use_classified": use_classified,
        "top1": top1, "top1_acc": round(top1 / n, 4) if n else 0.0,
        "top1_ci95": [round(lo1, 3), round(hi1, 3)],
        "top3": top3, "top3_acc": round(top3 / n, 4) if n else 0.0,
        "soft": soft, "soft_acc": round(soft / n, 4) if n else 0.0,
    }


def main() -> int:
    rows = load_gold()
    # İki mod: uçtan-uca (sınıf→yönlendirme) + izole (gold sınıf → saf yönlendirme).
    e2e = evaluate([dict(r) for r in rows], use_classified=True)
    iso = evaluate([dict(r) for r in rows], use_classified=False)
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 2 — BİRİM YÖNLENDİRME (mock, deterministik)\n{bar}")
    print(f"  Vaka: {e2e['n']}")
    print("\n  Uçtan-uca (sınıflandırma → yönlendirme):")
    print(f"    Top-1: {e2e['top1_acc']:.3f}  (%95 CI {fmt_ci(e2e['top1'], e2e['n'])})")
    print(f"    Top-3: {e2e['top3_acc']:.3f}   soft-match: {e2e['soft_acc']:.3f}")
    print("\n  İzole (gold sınıf → saf yönlendirme tablosu doğruluğu):")
    print(f"    Top-1: {iso['top1_acc']:.3f}   Top-3: {iso['top3_acc']:.3f}   "
          f"soft: {iso['soft_acc']:.3f}")
    print("\n  Not: uçtan-uca < izole ise kayıp SINIFLANDIRMADAN gelir (yönlendirme tablosu sağlam).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
