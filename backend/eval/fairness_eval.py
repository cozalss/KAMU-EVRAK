"""Etik §13.1 — Adillik/yanlılık değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §13.1: "geliştirdikleri sistemlerin Türkçe konuşan tüm bireyler için adil,
kapsayıcı ve yanlılıktan arındırılmış olması". Bu harness, AYNI evrakın yalnız
BAŞVURAN İSMİ/CİNSİYETİ değiştirilmiş varyantlarında sistemin sınıflandırma + birim
yönlendirme kararının DEĞİŞMEMESİ gerektiğini ölçer (counterfactual fairness).

Yöntem: her evrak için kadın/erkek/nötr-kurumsal isim varyantları üret → mock ajan
ile sınıf+birim tahmin et → varyantlar arası tutarlılık (consistency) oranı. Tutarsızlık
= ismin/cinsiyetin karara sızdığı yer (yanlılık sinyali). Hedef: %100 tutarlılık.

Çalıştır (cd backend): python -m eval.fairness_eval
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

from eval.stats import fmt_ci, wilson_interval  # noqa: E402

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
    """Her evrakın isim-varyantlarında sınıf+birim kararı tutarlı mı."""
    class_consistent = route_consistent = 0
    tutarsiz: list[dict] = []
    name_bearing = 0  # 'Ad-Soyad:' içeren (varyant uygulanabilen) evrak sayısı
    for r in rows:
        if not _ADSOYAD_RE.search(r["metin"]):
            continue
        name_bearing += 1
        siniflar: set[str] = set()
        birimler: set[str] = set()
        for ad in _VARIANTS.values():
            m = _swap_name(r["metin"], ad)
            turu = gs.mock_classify(m)[0]
            siniflar.add(turu)
            birimler.add(gs.mock_route(turu)[0])
        class_ok = len(siniflar) == 1
        route_ok = len(birimler) == 1
        class_consistent += int(class_ok)
        route_consistent += int(route_ok)
        if not (class_ok and route_ok):
            tutarsiz.append({"id": r["id"], "siniflar": sorted(siniflar),
                             "birimler": sorted(birimler)})
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
    print(f"\n{bar}\n  ETİK §13.1 — ADİLLİK (counterfactual isim/cinsiyet)\n{bar}")
    print(f"  İsim-taşıyan evrak: {res['n']}  ·  varyantlar: {res['variants']}")
    print(f"  Sınıf tutarlılığı : {res['class_consistency']:.4f}  "
          f"(%95 CI {fmt_ci(res['class_consistent'], res['n'])})")
    print(f"  Birim tutarlılığı : {res['route_consistency']:.4f}")
    if res["tutarsiz"]:
        print("\n  ⚠️  TUTARSIZ (isim karara sızmış — yanlılık):")
        for t in res["tutarsiz"]:
            print(f"    [{t['id']}] sınıflar={t['siniflar']} birimler={t['birimler']}")
    else:
        print("\n  ✅ İsim/cinsiyet değişimi kararı DEĞİŞTİRMEDİ (counterfactual-adil).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
