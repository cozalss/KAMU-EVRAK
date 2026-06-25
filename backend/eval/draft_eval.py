"""Görev 2 — Resmî yazı taslağı değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.2 ("uygun bir taslak oluşturma", "resmî üsluba uygun olması")
+ §9 ("yazı şablon oluşturma kalitesi").

LLM'siz ölçer (deterministik format-uyum):
  - format-compliance rate: taslak, resmî yazının ZORUNLU bileşenlerini içeriyor mu
    (T.C. başlık / Sayı / Konu / İlgi / imza bloku / EK satırı) — checklist.
  - turkish_purity: yabancı-harf sızıntısı yok (eval.draft_quality'den; resmî üslup
    Türkçe saflığı gerektirir).
  - per-component coverage: hangi zorunlu bileşen en sık eksik.

Mock modda gen_synthetic.mock_draft ile koşar (offline).

Çalıştır (cd backend): python -m eval.draft_eval
"""

from __future__ import annotations

import contextlib
import json
import re
import sys
from pathlib import Path

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_SCRIPTS = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import gen_synthetic as gs  # noqa: E402

from eval.draft_quality import turkish_purity  # noqa: E402  (mevcut yardımcıyı yeniden kullan)
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "yazi_taslak_gold.jsonl"
PURITY_MIN = 0.98  # resmî üslup: neredeyse saf Türkçe (yabancı-harf sızıntısı yok)

# Zorunlu bileşen → tespit regex'i (resmî yazışma usul ve esasları minimum seti).
_COMPONENT_PATTERNS: dict[str, re.Pattern] = {
    "tc_baslik": re.compile(r"\bT\.?\s?C\.?\b"),
    "sayi": re.compile(r"Sayı\s*[:：]", re.IGNORECASE),
    "konu": re.compile(r"Konu\s*[:：]", re.IGNORECASE),
    "ilgi": re.compile(r"İlgi\s*[:：]", re.IGNORECASE),
    "imza_bloku": re.compile(r"e-imza|imza|Başkan|Müdür", re.IGNORECASE),
    "ek_satiri": re.compile(r"\bEK\s*[:：]", re.IGNORECASE),
}


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def check_components(taslak: str) -> dict[str, bool]:
    """Her zorunlu bileşen taslakta var mı → {bileşen: bool}."""
    return {name: bool(pat.search(taslak)) for name, pat in _COMPONENT_PATTERNS.items()}


def evaluate(rows: list[dict]) -> dict:
    """Format-compliance (tam-uyum oranı) + per-component + turkish_purity."""
    n_components = len(_COMPONENT_PATTERNS)
    fully_compliant = 0
    comp_hits: dict[str, int] = {k: 0 for k in _COMPONENT_PATTERNS}
    purities: list[float] = []
    purity_ok = 0
    for r in rows:
        taslak = gs.mock_draft(r["evrak_turu"], r.get("alanlar", {}))
        comp = check_components(taslak)
        fully_compliant += int(all(comp.values()))
        for k, v in comp.items():
            comp_hits[k] += int(v)
        pur = turkish_purity(taslak)
        purities.append(pur)
        purity_ok += int(pur >= PURITY_MIN)
    n = len(rows)
    lo, hi = wilson_interval(fully_compliant, n)
    return {
        "n": n, "n_components": n_components,
        "compliance_rate": round(fully_compliant / n, 4) if n else 0.0,
        "fully_compliant": fully_compliant,
        "compliance_ci95": [round(lo, 3), round(hi, 3)],
        "per_component": {k: round(v / n, 3) if n else 0.0 for k, v in comp_hits.items()},
        "avg_turkish_purity": round(sum(purities) / n, 4) if n else 0.0,
        "purity_ok": purity_ok, "purity_ok_rate": round(purity_ok / n, 4) if n else 0.0,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 2 — RESMÎ YAZI TASLAĞI (format-uyum, deterministik)\n{bar}")
    print(f"  Vaka: {res['n']}  ·  zorunlu bileşen sayısı: {res['n_components']}")
    print(f"  Tam format-uyum : {res['compliance_rate']:.3f}  "
          f"(%95 CI {fmt_ci(res['fully_compliant'], res['n'])})")
    print(f"  Türkçe saflık   : ort {res['avg_turkish_purity']:.4f}  "
          f"(≥{PURITY_MIN}: {res['purity_ok']}/{res['n']})")
    print("\n  Bileşen kapsamı (oran):")
    for k, v in res["per_component"].items():
        print(f"    {k:14s} {v:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
