"""Görev 1 — Özetleme değerlendirmesi.

Şartname §6.4.1 ("kısa ve öz bir özet oluşturabilme") + §9 ("özetleme kalitesi").
docs/06 birincil: LLM-judge kapsama; ikincil: key-fact recall + **faithfulness**.

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur; `out['ozet']` (ozetle_node çıktısı) ölçülür:
  1. key-fact recall: özet, gold anahtar unsurlarını (konu/tür-etiketi/tarih) kapsıyor mu
     (mikro + makro). Diakritik-duyarsız string-içerme — referanssız, deterministik.
  2. **faithfulness** (sadakat): özet, kaynak evrak metninde OLMAYAN somut iddia
     (tarih/evrak-sayısı) içeriyor mu? Halüsinasyon sayacı (kamu evrakta KRİTİK).
     LLM'siz deterministik: özet tarih/sayı tokenları kaynak metinde var mı?
  3. LLM-judge OPSİYONEL (SUMMARY_JUDGE_ENABLED=1, default kapalı): eval/judge.py
     özet hakemi (kapsama/sadakat/kısalık, deepseek-chat) rapora judge_* ekler;
     gate kapalı → judge HİÇ çağrılmaz, key-fact'e düşer (CI deterministik).

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

from agents.graph import build_graph
from agents.state import make_initial_state
from eval.judge import JudgeScore, LLMJudge
from eval.stats import fmt_ci, wilson_interval

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "ozet_gold.jsonl"
MAX_OZET_KELIME = 60  # "kısa ve öz" üst sınırı (bu üstü uzun-özet uyarısı)

# Faithfulness için somut iddia tokenları (cikar/verify ile aynı desen → tutarlı).
_RE_TARIH = re.compile(r"\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")
# PII maskesi (özet [TCKN]/[TEL] üretir) — somut-sayı sadakat kontrolünden muaf.
_RE_MASKE = re.compile(r"\[TCKN\]|\[TEL\]|\*{2,}")


def _judge_acik() -> bool:
    """Özetleme LLM-judge gate (default kapalı) — çağrı anında okunur.

    Import anında donmuş sabit yerine çalışma anı env okuması: test/CI monkeypatch
    güvenli + gate kapalıyken judge yolu HİÇ açılmaz (deterministik key-fact kalır).
    """
    return os.getenv("SUMMARY_JUDGE_ENABLED", "0") == "1"


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


def _judge_skorlari(rows: list[dict]) -> list[JudgeScore]:
    """SUMMARY_JUDGE_ENABLED=1 iken TÜM satırları LLM-judge'la (docs/06 birincil kanca).

    Async-uyumlu: satır başına run_until_complete yerine TEK asyncio.run noktası
    (kırılgan get_event_loop yok). Gate kapalı → boş liste, judge HİÇ çağrılmaz;
    harness deterministik key-fact recall'ı raporlar (anahtarsız demo/CI bozulmaz).
    """
    if not _judge_acik():
        return []
    judge = LLMJudge()

    async def _run() -> list[JudgeScore]:
        return [await judge.evaluate(r["metin"], r["ozet"]) for r in rows]

    return asyncio.run(_run())


def _judge_rapor(skorlar: list[JudgeScore]) -> dict:
    """Judge eksen ortalamaları → rapor alanları; skor yoksa None (deterministik CI).

    judge_coverage = kapsama ortalaması (eski alan adıyla geriye-uyum; scorecard okur).
    """
    if not skorlar:
        return {"judge_coverage": None, "judge_kapsama": None, "judge_sadakat": None,
                "judge_kisalik": None, "judge_n": 0}
    n = len(skorlar)
    kapsama = round(sum(s.kapsama for s in skorlar) / n, 4)
    return {
        "judge_coverage": kapsama,
        "judge_kapsama": kapsama,
        "judge_sadakat": round(sum(s.sadakat for s in skorlar) / n, 4),
        "judge_kisalik": round(sum(s.kisalik for s in skorlar) / n, 4),
        "judge_n": n,
    }


def evaluate(rows: list[dict]) -> dict:
    """Key-fact recall (mikro+makro) + faithfulness + uzunluk — gerçek pipeline ozet."""
    run_pipeline(rows)
    total_cov = total_unsur = 0
    macro_sum = 0.0
    uzunluklar: list[int] = []
    uzun_ozet = full_cover = sadik = 0
    ihlal_ornek: list[dict] = []
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
        # LLM-judge alanları (gate açıkken dolu; kapalıyken None → rapor deterministik).
        **_judge_rapor(_judge_skorlari(rows)),
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
        print(f"  LLM-judge             : kapsama {res['judge_kapsama']:.3f}  "
              f"sadakat {res['judge_sadakat']:.3f}  kısalık {res['judge_kisalik']:.3f}  "
              f"(n={res['judge_n']})")
    else:
        print("  LLM-judge kapsama     : — (gate kapalı; key-fact recall'a düşüldü)")
    print(f"  Ort. özet uzunluk     : {res['avg_uzunluk']} kelime  "
          f"(>{MAX_OZET_KELIME} kelime: {res['uzun_ozet']} özet)")
    print("\n  Not: mock-LLM'de ozetle fallback (deterministik kısaltma) çalışır; "
          "gerçek LLM modu daha akıcı/öz özet üretir (taban ≠ tavan).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
