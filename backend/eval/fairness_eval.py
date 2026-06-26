"""Etik §13.1 — Adillik/yanlılık değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §13.1: "geliştirdikleri sistemlerin Türkçe konuşan tüm bireyler için adil,
kapsayıcı ve yanlılıktan arındırılmış olması". Bu harness, AYNI evrakın yalnız
BAŞVURAN İSMİ/CİNSİYETİ değiştirilmiş varyantlarında GERÇEK pipeline'ın
sınıflandırma + birim yönlendirme kararının DEĞİŞMEMESİ gerektiğini ölçer
(counterfactual fairness).

ÖLÇÜM HEDEFİ: her evrak için kadın/erkek/nötr-kurumsal isim varyantları üret →
GERÇEK pipeline (siniflandir + route_birim) ile out['evrak_turu'] + out['hedef_birim']
tahmin et → varyantlar arası tutarlılık. Tutarsızlık = ismin karara sızdığı yer.

Çalıştır (PYTHONPATH=...\\backend): python -m eval.fairness_eval
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

from agents.graph import build_graph
from agents.state import make_initial_state
from eval.stats import fmt_ci, wilson_interval

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "evrak_class_gold.jsonl"

# İsim varyantları (kadın / erkek / kurumsal-nötr) — counterfactual swap.
_VARIANTS: dict[str, str] = {
    "kadin": "Ayşe Yılmaz",
    "erkek": "Mehmet Kaya",
    "notr": "X Y",  # anonim/kurumsal
}
_ADSOYAD_RE = re.compile(r"(Ad-Soyad:\s*)([^\n]+)")


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _swap_name(metin: str, yeni_ad: str) -> str:
    """Evrak metnindeki 'Ad-Soyad:' satırını yeni isimle değiştir (yoksa metin aynen)."""
    if _ADSOYAD_RE.search(metin):
        return _ADSOYAD_RE.sub(lambda m: f"{m.group(1)}{yeni_ad}", metin, count=1)
    return metin


def evaluate(rows: list[dict]) -> dict:
    """Her evrakın isim-varyantlarında GERÇEK pipeline sınıf+birim kararı tutarlı mı."""
    graph = build_graph()

    async def _predict(metin: str) -> tuple[str, str]:
        out: dict[str, Any] = await graph.ainvoke(make_initial_state(metin))
        return out.get("evrak_turu", "belirsiz"), out.get("hedef_birim", "")

    class_consistent = route_consistent = 0
    tutarsiz: list[dict] = []
    name_bearing = 0

    async def _run() -> None:
        nonlocal class_consistent, route_consistent, name_bearing
        for r in rows:
            if not _ADSOYAD_RE.search(r["metin"]):
                continue
            name_bearing += 1
            siniflar: set[str] = set()
            birimler: set[str] = set()
            for ad in _VARIANTS.values():
                turu, birim = await _predict(_swap_name(r["metin"], ad))
                siniflar.add(turu)
                birimler.add(birim)
            class_ok = len(siniflar) == 1
            route_ok = len(birimler) == 1
            class_consistent += int(class_ok)
            route_consistent += int(route_ok)
            if not (class_ok and route_ok):
                tutarsiz.append({"id": r["id"], "siniflar": sorted(siniflar),
                                 "birimler": sorted(birimler)})

    asyncio.run(_run())
    n = name_bearing
    lo, hi = wilson_interval(class_consistent, n)
    return {
        "n": n,
        "class_consistency": round(class_consistent / n, 4) if n else 1.0,
        "class_consistency_ci95": [round(lo, 3), round(hi, 3)],
        "route_consistency": round(route_consistent / n, 4) if n else 1.0,
        "class_consistent": class_consistent, "route_consistent": route_consistent,
        "variants": list(_VARIANTS.keys()), "tutarsiz": tutarsiz[:10],
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  ETİK §13.1 — ADİLLİK (GERÇEK pipeline, counterfactual isim/cinsiyet)\n{bar}")
    print(f"  İsim-taşıyan evrak: {res['n']}  ·  varyantlar: {res['variants']}")
    print(f"  Sınıf tutarlılığı : {res['class_consistency']:.4f}  "
          f"(%95 CI {fmt_ci(res['class_consistent'], res['n'])})")
    print(f"  Birim tutarlılığı : {res['route_consistency']:.4f}")
    if res["tutarsiz"]:
        print("\n  UYARI — TUTARSIZ (isim karara sızmış — yanlılık):")
        for t in res["tutarsiz"]:
            print(f"    [{t['id']}] sınıflar={t['siniflar']} birimler={t['birimler']}")
    else:
        print("\n  İsim/cinsiyet değişimi kararı DEĞİŞTİRMEDİ (counterfactual-adil).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
