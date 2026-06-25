"""Görev 1 — Özetleme değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.1 ("kısa ve öz bir özet oluşturabilme") + §9 ("özetleme kalitesi").
docs/06 birincil: LLM-judge kapsama; ikincil: key-fact recall + **faithfulness**.

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur; `out['ozet']` (ozetle_node çıktısı) ölçülür:
  1. key-fact recall: özet, gold anahtar unsurlarını (konu/tür-etiketi/tarih) kapsıyor mu
     (mikro + makro). Diakritik-duyarsız string-içerme — referanssız, deterministik.
  2. **faithfulness** (sadakat): özet, kaynak evrak metninde OLMAYAN somut iddia
     (tarih/evrak-sayısı) içeriyor mu? Halüsinasyon sayacı (kamu evrakta KRİTİK).
     LLM'siz deterministik: özet tarih/sayı tokenları kaynak metinde var mı?
  3. LLM-judge OPSİYONEL stub: LLM yoksa key-fact'e düşer (gate, default kapalı).

Çalıştır (PYTHONPATH=...\\backend): python -m eval.summary_eval
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from agents.graph import build_graph  # noqa: E402
from agents.state import make_initial_state  # noqa: E402
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "ozet_gold.jsonl"
MAX_OZET_KELIME = 60  # "kısa ve öz" üst sınırı (bu üstü uzun-özet uyarısı)

# Faithfulness için somut iddia tokenları (cikar/verify ile aynı desen → tutarlı).
_RE_TARIH = re.compile(r"\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")
# PII maskesi (özet [TCKN]/[TEL] üretir) — somut-sayı sadakat kontrolünden muaf.
_RE_MASKE = re.compile(r"\[TCKN\]|\[TEL\]|\*{2,}")
# Özetleme LLM-judge gate (default kapalı): gerçek LLM'siz key-fact'e düşer.
SUMMARY_JUDGE_ENABLED = os.getenv("SUMMARY_JUDGE_ENABLED", "0") == "1"


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK pipeline'ı koş → r['ozet'] doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["ozet"] = out.get("ozet", "") or ""

    asyncio.run(_run())


def _norm(s: str) -> str:
    """Diakritik-duyarsız küçük-harf (Türkçe I/İ normalizasyonu) — string-içerme için."""
    return s.lower().replace("i̇", "i").replace("ı", "i")


def key_fact_recall(ozet: str, unsurlar: list[str]) -> tuple[int, int]:
    """Özetin kaç anahtar unsuru kapsadığı → (kapsanan, toplam)."""
    no = _norm(ozet)
    covered = sum(1 for u in unsurlar if _norm(str(u)) in no)
    return covered, len(unsurlar)


def faithfulness(ozet: str, kaynak: str) -> tuple[bool, list[str]]:
    """Özet kaynakta OLMAYAN somut tarih/sayı iddiası içeriyor mu → (sadık_mı, ihlaller).

    LLM'siz halüsinasyon proxy'si: özetteki her somut tarih/evrak-sayısı kaynak evrak
    metninde de geçmeli (özet yalnız metne dayanmalı — CLAUDE.md §1). Maskeli PII
    ([TCKN]/[TEL]) muaftır (uydurma değil, redaksiyon). Sadık = ihlal yok.
    """
    masked_ozet = _RE_MASKE.sub(" ", ozet)
    src = _norm(kaynak)
    ihlaller: list[str] = []
    for tarih in set(_RE_TARIH.findall(masked_ozet)):
        if _norm(tarih) not in src:
            ihlaller.append(f"tarih:{tarih}")
    for sayi in set(_RE_SAYI.findall(masked_ozet)):
        if _norm(sayi) not in src:
            ihlaller.append(f"sayı:{sayi}")
    return (not ihlaller), ihlaller


def _llm_judge_coverage(ozet: str, unsurlar: list[str], kaynak: str) -> float | None:
    """OPSİYONEL LLM-judge kapsama skoru (0..1). LLM yok/gate kapalı → None (key-fact'e düş).

    docs/06 birincil metrik "LLM-judge kapsama" için kanca. Gerçek bir LLM gate'i
    (SUMMARY_JUDGE_ENABLED=1 + anahtar) bağlanana kadar stub None döndürür; harness
    bu durumda deterministik key-fact recall'ı raporlar (anahtarsız demo bozulmaz).
    """
    if not SUMMARY_JUDGE_ENABLED:
        return None
    try:  # gerçek LLM-judge yolu (opt-in, gate'li) — yoksa sessizce key-fact'e düş
        from agents.nodes._llm_extract import llm_json
    except Exception:
        return None
    system = (
        "Sen bir özet kalite hakemisin. Özetin, kaynak evrakın kilit unsurlarını "
        "ne kadar kapsadığını 0..1 arası puanla. Çıktı SADECE JSON: "
        '{"kapsama": <0..1>}'
    )
    user = f"Kilit unsurlar: {', '.join(map(str, unsurlar))}\n\nÖzet:\n{ozet}\n\nKaynak:\n{kaynak[:2000]}"
    try:
        obj = asyncio.get_event_loop().run_until_complete(
            llm_json(system, user, max_tokens=60, temperature=0.0))
    except Exception:
        return None
    if obj and isinstance(obj.get("kapsama"), (int, float)):
        return max(0.0, min(1.0, float(obj["kapsama"])))
    return None


def evaluate(rows: list[dict]) -> dict:
    """Key-fact recall (mikro+makro) + faithfulness + uzunluk — gerçek pipeline ozet."""
    run_pipeline(rows)
    total_cov = total_unsur = 0
    macro_sum = 0.0
    uzunluklar: list[int] = []
    uzun_ozet = full_cover = sadik = 0
    ihlal_ornek: list[dict] = []
    judge_scores: list[float] = []
    for r in rows:
        ozet = r["ozet"]
        cov, tot = key_fact_recall(ozet, r["anahtar_unsurlar"])
        total_cov += cov
        total_unsur += tot
        macro_sum += (cov / tot) if tot else 0.0
        full_cover += int(cov == tot and tot > 0)
        sadik_mi, ihlaller = faithfulness(ozet, r["metin"])
        sadik += int(sadik_mi)
        if ihlaller and len(ihlal_ornek) < 10:
            ihlal_ornek.append({"id": r.get("id"), "ihlaller": ihlaller})
        if (js := _llm_judge_coverage(ozet, r["anahtar_unsurlar"], r["metin"])) is not None:
            judge_scores.append(js)
        wc = len(ozet.split())
        uzunluklar.append(wc)
        uzun_ozet += int(wc > MAX_OZET_KELIME)
    n = len(rows)
    lo, hi = wilson_interval(total_cov, total_unsur)
    flo, fhi = wilson_interval(sadik, n)
    return {
        "n": n, "micro_recall": round(total_cov / total_unsur, 4) if total_unsur else 0.0,
        "macro_recall": round(macro_sum / n, 4) if n else 0.0,
        "micro_recall_ci95": [round(lo, 3), round(hi, 3)],
        "full_cover": full_cover, "full_cover_rate": round(full_cover / n, 4) if n else 0.0,
        "faithfulness_rate": round(sadik / n, 4) if n else 1.0,
        "faithfulness_ci95": [round(flo, 3), round(fhi, 3)],
        "faithful": sadik, "ihlal_ornek": ihlal_ornek,
        "judge_coverage": round(sum(judge_scores) / len(judge_scores), 4) if judge_scores else None,
        "judge_n": len(judge_scores),
        "avg_uzunluk": round(sum(uzunluklar) / n, 1) if n else 0.0,
        "uzun_ozet": uzun_ozet, "total_cov": total_cov, "total_unsur": total_unsur,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 1 — ÖZETLEME (GERÇEK pipeline, key-fact + faithfulness)\n{bar}")
    print(f"  Vaka: {res['n']}")
    print(f"  Mikro key-fact recall : {res['micro_recall']:.3f}  "
          f"(%95 CI {fmt_ci(res['total_cov'], res['total_unsur'])})")
    print(f"  Makro key-fact recall : {res['macro_recall']:.3f}")
    print(f"  Tam-kapsama           : {res['full_cover']}/{res['n']} "
          f"({res['full_cover_rate']:.0%})")
    print(f"  Faithfulness (sadakat): {res['faithfulness_rate']:.3f}  "
          f"({res['faithful']}/{res['n']}, %95 CI {fmt_ci(res['faithful'], res['n'])}) "
          f"— özet uydurma somut tarih/sayı içermiyor")
    if res["ihlal_ornek"]:
        print("    UYARI — sadakat ihlali (örnek):")
        for it in res["ihlal_ornek"][:5]:
            print(f"      [{it['id']}] {it['ihlaller']}")
    if res["judge_coverage"] is not None:
        print(f"  LLM-judge kapsama     : {res['judge_coverage']:.3f}  (n={res['judge_n']})")
    else:
        print("  LLM-judge kapsama     : — (gate kapalı; key-fact recall'a düşüldü)")
    print(f"  Ort. özet uzunluk     : {res['avg_uzunluk']} kelime  "
          f"(>{MAX_OZET_KELIME} kelime: {res['uzun_ozet']} özet)")
    print("\n  Not: mock-LLM'de ozetle fallback (deterministik kısaltma) çalışır; "
          "gerçek LLM modu daha akıcı/öz özet üretir (taban ≠ tavan).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
