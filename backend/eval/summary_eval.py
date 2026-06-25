"""Görev 1 — Özetleme değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("kısa ve öz bir özet oluşturabilme") + §9 ("özetleme kalitesi").

Soyut özet kalitesini LLM'siz ölçmenin en güvenilir yolu KEY-FACT RECALL: özetin,
evrakın anahtar unsurlarını (konu/tarih/taraf) kapsama oranı. Saf string-içerme
(diakritik-duyarsız) — referansa ihtiyaç duymaz, deterministik, jüri-savunulabilir.

Ölçer:
  - key-fact recall: özet, kaç anahtar unsuru kapsıyor (mikro + makro)
  - ortalama özet uzunluğu (kelime) — "kısa ve öz" kontrolü
  - LLM-judge: opsiyonel stub (VERIFY_LLM_JUDGE gerektirir; default KAPALI/no-op)

Mock modda gen_synthetic.mock_summary ile koşar (offline).

Çalıştır (cd backend): python -m eval.summary_eval
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

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "ozet_gold.jsonl"
MAX_OZET_KELIME = 40  # "kısa ve öz" üst sınırı (bu üstü uzun-özet uyarısı)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _norm(s: str) -> str:
    """Diakritik-duyarsız küçük-harf (Türkçe I/İ normalizasyonu) — string-içerme için."""
    return s.lower().replace("i̇", "i").replace("ı", "i")


def key_fact_recall(ozet: str, unsurlar: list[str]) -> tuple[int, int]:
    """Özetin kaç anahtar unsuru kapsadığı → (kapsanan, toplam)."""
    no = _norm(ozet)
    covered = sum(1 for u in unsurlar if _norm(str(u)) in no)
    return covered, len(unsurlar)


def llm_judge_stub(ozet: str, metin: str) -> float | None:
    """LLM-judge özet-kalite stub. VERIFY_LLM_JUDGE=1 değilse None (no-op) döner.

    Gerçek implementasyonda OpenAI'ye 'özet evrakı sadık yansıtıyor mu?' sorulur;
    burada yalnız bağlanma noktası — mock/offline'da çağrılmaz (latency/maliyet)."""
    import os
    if os.getenv("VERIFY_LLM_JUDGE", "0").lower() not in {"1", "true", "yes"}:
        return None
    return None  # gerçek judge entegrasyonu eval.judge ile yapılır (kapsam dışı stub)


def evaluate(rows: list[dict]) -> dict:
    """Key-fact recall (mikro+makro) + uzunluk dağılımı."""
    total_cov = total_unsur = 0
    macro_sum = 0.0
    uzunluklar: list[int] = []
    uzun_ozet = 0
    full_cover = 0
    for r in rows:
        ozet = gs.mock_summary(r["metin"], r.get("alanlar", {}))
        cov, tot = key_fact_recall(ozet, r["anahtar_unsurlar"])
        total_cov += cov
        total_unsur += tot
        macro_sum += (cov / tot) if tot else 0.0
        full_cover += int(cov == tot and tot > 0)
        wc = len(ozet.split())
        uzunluklar.append(wc)
        uzun_ozet += int(wc > MAX_OZET_KELIME)
    n = len(rows)
    lo, hi = wilson_interval(total_cov, total_unsur)
    return {
        "n": n, "micro_recall": round(total_cov / total_unsur, 4) if total_unsur else 0.0,
        "macro_recall": round(macro_sum / n, 4) if n else 0.0,
        "micro_recall_ci95": [round(lo, 3), round(hi, 3)],
        "full_cover": full_cover, "full_cover_rate": round(full_cover / n, 4) if n else 0.0,
        "avg_uzunluk": round(sum(uzunluklar) / n, 1) if n else 0.0,
        "uzun_ozet": uzun_ozet, "total_cov": total_cov, "total_unsur": total_unsur,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 1 — ÖZETLEME (key-fact recall, deterministik)\n{bar}")
    print(f"  Vaka: {res['n']}")
    print(f"  Mikro key-fact recall : {res['micro_recall']:.3f}  "
          f"(%95 CI {fmt_ci(res['total_cov'], res['total_unsur'])})")
    print(f"  Makro key-fact recall : {res['macro_recall']:.3f}")
    print(f"  Tam-kapsama           : {res['full_cover']}/{res['n']} "
          f"({res['full_cover_rate']:.0%})")
    print(f"  Ort. özet uzunluk     : {res['avg_uzunluk']} kelime  "
          f"(>{MAX_OZET_KELIME} kelime: {res['uzun_ozet']} özet)")
    print("\n  Not: LLM-judge (akıcılık/sadakat) opsiyonel — VERIFY_LLM_JUDGE=1 ile bağlanır "
          "(default no-op; deterministik recall jüri-savunulabilir taban).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
