"""Mevzuat retrieval EVAL — Recall@1/@3 + MRR (Wilson CI ile, jüri titizliği).

Dış değerlendirme "mevzuat retrieval zayıf" dedi → bu harness `mevzuat_oner` BM25
retrieval'ının doğruluğunu evrak→beklenen-mevzuat ALTIN SETİ üzerinde ölçülebilir
kılar. ÖNCE/SONRA Recall@3 karşılaştırması için tek komut.

Metrikler (oran metrikleri → Wilson %95 CI; eval/stats.py):
  - Recall@1: top-1 öneri doğru kanunu içeriyor mu (kanun-no eşleşmesi).
  - Recall@3: top-3 öneri içinde doğru kanun var mı.
  - MRR: ilk doğru önerinin sırasının tersinin ortalaması (1/rank).

Altın set kaynağı (öncelik sırası):
  1. data/synthetic/mevzuat_gold.jsonl (varsa — elle/küçük altın set).
  2. data/synthetic/evrak_class_gold.jsonl `beklenen_mevzuat` alanından türetilir
     (gen_synthetic zaten yazıyor → ek veri üretmeden büyük örneklem).

Eşleşme: beklenen mevzuat metnindeki KANUN NUMARASI (3071, 4982...) önerinin
başlığında geçiyor mu (`baslik` ile substring). Kanun-no güvenilir tekil anahtar.

Çalıştır (PYTHONPATH=...\\backend):
    python -m eval.retrieval_eval [--n 0] [--gold PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import re
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from eval.stats import fmt_ci, wilson_interval  # noqa: E402

_ROOT = Path(__file__).resolve().parents[2]
_GOLD_MEVZUAT = _ROOT / "data" / "synthetic" / "mevzuat_gold.jsonl"
_GOLD_CLASS = _ROOT / "data" / "synthetic" / "evrak_class_gold.jsonl"

# Kanun/mevzuat numarası: 2005-7 (SDP genelge) ÖNCE denenir (aksi halde \d{3,4}
# "2005"i yutar), sonra 3-4 hane (657, 2577, 4982...).
_KANUN_NO_RE = re.compile(r"\b(2005[-/]7)\b|\b(\d{3,4})\b")

# Numara taşımayan mevzuat atıfları → korpus etiketindeki kanun no'suna köprü.
# Gold'da bazı beklenen mevzuat yalnız madde verir ("Resmî Yazışma Yönetmeliği
# m.15") — korpus bunları "2646 ..." etiketiyle taşır. İsim eşleştirme ile köprülenir.
_AD_KOPRU: tuple[tuple[str, str], ...] = (
    ("yazışma", "2646"),
    ("yazisma", "2646"),
)


def _kanun_nolari(metin: str) -> set[str]:
    """Mevzuat etiketinden/öneriden kanun numaralarını çıkar; numara yoksa isim köprüsü."""
    metin = metin or ""
    nolar: set[str] = set()
    for m in _KANUN_NO_RE.finditer(metin):
        no = m.group(1) or m.group(2)
        if no:
            nolar.add(no.replace("/", "-"))
    if not nolar:
        alt = metin.lower()
        for ad, no in _AD_KOPRU:
            if ad in alt:
                nolar.add(no)
    return nolar


def _gold_satirlari(gold_path: Path, n: int) -> list[dict[str, Any]]:
    """Altın set yükle: özel mevzuat_gold öncelikli, yoksa evrak_class'tan türet."""
    if gold_path.exists():
        rows = _oku_jsonl(gold_path)
    elif _GOLD_CLASS.exists():
        rows = [
            {"metin": r["metin"], "evrak_turu": r.get("evrak_turu"),
             "beklenen_mevzuat": r.get("beklenen_mevzuat") or []}
            for r in _oku_jsonl(_GOLD_CLASS)
            if r.get("beklenen_mevzuat")
        ]
    else:
        raise FileNotFoundError(
            f"Altın set yok: {gold_path} ya da {_GOLD_CLASS} — gen_synthetic.py koşun."
        )
    return rows[:n] if n > 0 else rows


def _oku_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(ln)
        for ln in path.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]


def _beklenen_nolar(row: dict[str, Any]) -> set[str]:
    """Altın satırın beklediği kanun numaraları (beklenen_mevzuat listesinden)."""
    nolar: set[str] = set()
    for m in row.get("beklenen_mevzuat") or []:
        nolar |= _kanun_nolari(str(m))
    return nolar


async def _oner(row: dict[str, Any]) -> list[dict[str, Any]]:
    """Tek altın satır için mevzuat_oner node'unu çalıştır → öneri listesi."""
    from agents.nodes.mevzuat_oner import mevzuat_oner_node

    state = {
        "evrak_turu": row.get("evrak_turu", "belirsiz"),
        "bilgi_unsurlari": {"konu": row.get("konu", "")},
        "evrak_text": row.get("metin", ""),
    }
    out = await mevzuat_oner_node(state)
    return out.get("mevzuat_onerileri") or []


def _ilk_dogru_rank(oneriler: list[dict[str, Any]], beklenen: set[str]) -> int:
    """İlk doğru önerinin 1-tabanlı sırası (yoksa 0). Kanun-no eşleşmesi."""
    for i, oneri in enumerate(oneriler, start=1):
        if _kanun_nolari(str(oneri.get("baslik", ""))) & beklenen:
            return i
    return 0


async def degerlendir(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Altın set üzerinde Recall@1/@3 + MRR hesapla (Wilson CI için k/n döner)."""
    n = 0
    hit1 = hit3 = 0
    mrr_toplam = 0.0
    ornekler: list[dict[str, Any]] = []
    for row in rows:
        beklenen = _beklenen_nolar(row)
        if not beklenen:
            continue  # değerlendirilebilir altın yoksa atla
        n += 1
        oneriler = await _oner(row)
        rank = _ilk_dogru_rank(oneriler, beklenen)
        if rank == 1:
            hit1 += 1
        if 1 <= rank <= 3:
            hit3 += 1
        if rank:
            mrr_toplam += 1.0 / rank
        if len(ornekler) < 3:
            ornekler.append({
                "evrak_turu": row.get("evrak_turu"),
                "beklenen": sorted(beklenen),
                "top3": [o.get("baslik") for o in oneriler[:3]],
                "rank": rank,
            })
    return {
        "n": n, "hit1": hit1, "hit3": hit3,
        "recall_1": hit1 / n if n else 0.0,
        "recall_3": hit3 / n if n else 0.0,
        "mrr": mrr_toplam / n if n else 0.0,
        "ornekler": ornekler,
    }


def _rapor(res: dict[str, Any]) -> str:
    """Konsol raporu (ASCII-güvenli; Wilson CI)."""
    n = res["n"]
    bar = "=" * 66
    lines = [
        f"\n{bar}",
        "  MEVZUAT RETRIEVAL EVAL — Recall@k + MRR (Wilson %95 CI)",
        bar,
        f"  Ornek (n)   : {n}",
        f"  Recall@1    : {res['recall_1']:.3f}  {fmt_ci(res['hit1'], n)}",
        f"  Recall@3    : {res['recall_3']:.3f}  {fmt_ci(res['hit3'], n)}",
        f"  MRR         : {res['mrr']:.3f}",
        "",
        "  Ornek retrieval (ilk 3 altin):",
    ]
    for ex in res["ornekler"]:
        lines.append(
            f"   - tur={ex['evrak_turu']} beklenen={ex['beklenen']} "
            f"rank={ex['rank']}"
        )
        for b in ex["top3"]:
            lines.append(f"       · {b}")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mevzuat retrieval eval (Recall@k + MRR)")
    parser.add_argument("--n", type=int, default=0, help="ilk-N altın (0=tümü)")
    parser.add_argument("--gold", type=Path, default=_GOLD_MEVZUAT, help="altın set yolu")
    parser.add_argument("--json", action="store_true", help="JSON çıktı (CI)")
    args = parser.parse_args(argv)

    rows = _gold_satirlari(args.gold, args.n)
    res = asyncio.run(degerlendir(rows))

    if args.json:
        out = {k: v for k, v in res.items() if k != "ornekler"}
        out["recall_3_ci"] = list(wilson_interval(res["hit3"], res["n"]))
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(_rapor(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
