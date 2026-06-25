"""Görev 2 — Resmî yazı taslağı değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.2 ("uygun bir taslak oluşturma", "resmî üsluba uygun olması")
+ §9 ("yazı şablon oluşturma kalitesi").

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur; `out['yazi_taslak_md']`,
`out['format_uyumlu']`, `out['yazi_turu']` (yazi_taslak_node çıktısı) ölçülür.

LLM'siz deterministik metrikler:
  - format_uyumlu rate: pipeline'ın kendi format-uyum bayrağı (resmî zorunlu alan checklist)
  - component-compliance: taslak metni resmî zorunlu bileşenleri içeriyor mu
    (T.C. / Sayı / Konu / İlgi / imza bloku) — bağımsız regex çapraz-kontrol
  - yazi_turu accuracy: pipeline yazı türü == gold beklenen_yazi_turu (EVRAK_TO_YAZI)
  - turkish_purity: resmî üslup Türkçe saflığı (yabancı-harf sızıntısı yok)

Çalıştır (PYTHONPATH=...\\backend): python -m eval.draft_eval
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import re
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from agents.graph import build_graph  # noqa: E402
from agents.state import make_initial_state  # noqa: E402
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "yazi_taslak_gold.jsonl"
PURITY_MIN = 0.98  # resmî üslup: neredeyse saf Türkçe (yabancı-harf sızıntısı yok)

# Zorunlu bileşen → tespit regex'i (resmî yazışma usul ve esasları minimum seti).
_COMPONENT_PATTERNS: dict[str, re.Pattern] = {
    "tc_baslik": re.compile(r"\bT\.?\s?C\.?\b"),
    "sayi": re.compile(r"Sayı\s*[:：]", re.IGNORECASE),
    "konu": re.compile(r"Konu\s*[:：]", re.IGNORECASE),
    "ilgi": re.compile(r"İlgi\s*[:：]|İlgi'", re.IGNORECASE),
    # İmza/unvan bloğu — dolu (e-imza/Başkan/Müdür) VEYA resmî şablon placeholder
    # slotu ({{ AD SOYAD }}/{{ UNVAN }}). Yapısal slot mevcudiyeti ölçülür; alanın
    # doldurulup doldurulmadığını ayrıca pipeline.format_uyumlu raporlar.
    "imza_bloku": re.compile(
        r"e-imza|imza|Başkan|Müdür|Vali|\{\{\s*AD SOYAD\s*\}\}|\{\{\s*UNVAN\s*\}\}",
        re.IGNORECASE),
}

# Türkçe saflık — resmî yazıda olması beklenen karakter kümesi (ASCII + Türkçe).
_TR_ALLOWED = set("abcçdefgğhıijklmnoöprsştuüvyzqwxABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX")


def turkish_purity(text: str) -> float:
    """Metnin harf karakterlerinin Türkçe-uyumlu (ASCII+TR) oranı → [0,1].

    Yabancı alfabe (Yunan/Kiril/Arap) sızıntısı saflığı düşürür. Yalnız harf
    karakterleri sayılır (rakam/noktalama/boşluk yok sayılır). Boş/harfsiz → 1.0.
    """
    harfler = [c for c in text if c.isalpha()]
    if not harfler:
        return 1.0
    ok = sum(1 for c in harfler if c in _TR_ALLOWED)
    return ok / len(harfler)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK pipeline'ı koş → r['taslak'], r['format_uyumlu'], r['yazi_turu'] doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["taslak"] = out.get("yazi_taslak_md", "") or ""
            r["format_uyumlu"] = bool(out.get("format_uyumlu", False))
            r["yazi_turu"] = out.get("yazi_turu", "")

    asyncio.run(_run())


def check_components(taslak: str) -> dict[str, bool]:
    """Her zorunlu bileşen taslakta var mı → {bileşen: bool}."""
    return {name: bool(pat.search(taslak)) for name, pat in _COMPONENT_PATTERNS.items()}


def evaluate(rows: list[dict]) -> dict:
    """Pipeline format_uyumlu + component-compliance + yazi_turu acc + turkish_purity."""
    run_pipeline(rows)
    n_components = len(_COMPONENT_PATTERNS)
    fmt_uyumlu = 0           # pipeline'ın kendi format_uyumlu bayrağı
    comp_fully = 0           # bağımsız component checklist tam-uyum
    comp_hits: dict[str, int] = {k: 0 for k in _COMPONENT_PATTERNS}
    yazi_turu_ok = 0
    purities: list[float] = []
    purity_ok = 0
    for r in rows:
        taslak = r["taslak"]
        comp = check_components(taslak)
        comp_fully += int(all(comp.values()))
        for k, v in comp.items():
            comp_hits[k] += int(v)
        fmt_uyumlu += int(r["format_uyumlu"])
        yazi_turu_ok += int(r["yazi_turu"] == r.get("beklenen_yazi_turu"))
        pur = turkish_purity(taslak)
        purities.append(pur)
        purity_ok += int(pur >= PURITY_MIN)
    n = len(rows)
    lo, hi = wilson_interval(comp_fully, n)
    return {
        "n": n, "n_components": n_components,
        "format_uyumlu_rate": round(fmt_uyumlu / n, 4) if n else 0.0,
        "format_uyumlu": fmt_uyumlu,
        "compliance_rate": round(comp_fully / n, 4) if n else 0.0,
        "fully_compliant": comp_fully,
        "compliance_ci95": [round(lo, 3), round(hi, 3)],
        "yazi_turu_acc": round(yazi_turu_ok / n, 4) if n else 0.0,
        "per_component": {k: round(v / n, 3) if n else 0.0 for k, v in comp_hits.items()},
        "avg_turkish_purity": round(sum(purities) / n, 4) if n else 0.0,
        "purity_ok": purity_ok, "purity_ok_rate": round(purity_ok / n, 4) if n else 0.0,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 2 — RESMÎ YAZI TASLAĞI (GERÇEK pipeline, format-uyum)\n{bar}")
    print(f"  Vaka: {res['n']}  ·  zorunlu bileşen sayısı: {res['n_components']}")
    print(f"  Pipeline format_uyumlu  : {res['format_uyumlu_rate']:.3f} "
          f"({res['format_uyumlu']}/{res['n']})")
    print(f"  Bileşen tam-uyum (regex): {res['compliance_rate']:.3f}  "
          f"(%95 CI {fmt_ci(res['fully_compliant'], res['n'])})")
    print(f"  Yazı türü doğruluğu     : {res['yazi_turu_acc']:.3f}  (EVRAK_TO_YAZI gold)")
    print(f"  Türkçe saflık           : ort {res['avg_turkish_purity']:.4f}  "
          f"(≥{PURITY_MIN}: {res['purity_ok']}/{res['n']})")
    print("\n  Bileşen kapsamı (oran):")
    for k, v in res["per_component"].items():
        print(f"    {k:14s} {v:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
