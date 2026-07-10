"""Mevzuat öneri GÜVEN BANDI kalibrasyonu — "yüksek güven" demeye hakkımız var mı?

Neden bu harness var
--------------------
`api/mevzuat_zenginlestir._guven` eskiden max-normalize `score` üzerinden bant veriyordu.
`score` liderin kendine bölünmesiyle üretildiği için (mevzuat_oner._from_corpus) **top-1
daima 1.0** olur → çip daima "yüksek güven" yazardı. Yani rozet, retrieval kalitesinden
BAĞIMSIZ bir sabitti. Bu harness, bantları ölçülmüş bir sinyale bağlar.

Ölçülen sinyal
--------------
`norm_score = raw_score / sorgu_token_sayısı`. Ham BM25 skoru sorgu uzunluğuyla
ölçeklenir → belgeler arası karşılaştırılamaz; token sayısına bölünce karşılaştırılabilir
hale gelir. Gold set (data/synthetic/evrak_class_gold.jsonl, `beklenen_mevzuat`) üzerinde
ölçülen ayırt edicilik (AUC, top-1 doğru/yanlış):

    raw_score (ham)            0.877
    raw_score / q_token        0.964   ← seçilen
    raw1/raw2 (lider marjı)    0.717

"Doğru" = önerinin başlığındaki kanun numarası gold'un beklediğiyle eşleşiyor
(retrieval_eval ile AYNI eşleşme kuralı).

Çalıştır (repo kökünden):
    uv run python -m eval.mevzuat_guven_kalibrasyon
    uv run python -m eval.mevzuat_guven_kalibrasyon --json

Çıktı, `api/mevzuat_zenginlestir._BANT_ISABET` sabitleriyle karşılaştırılmalıdır;
korpus/BM25 parametreleri değişirse bantlar burada YENİDEN ölçülüp güncellenir.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import re
import sys
from itertools import pairwise
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_ROOT = Path(__file__).resolve().parents[2]
_GOLD_CLASS = _ROOT / "data" / "synthetic" / "evrak_class_gold.jsonl"

# Evrak metnindeki "Konu :" satırı — üretimde `bilgi_unsurlari.konu` doludur ve sorguya
# 3× ağırlıkla girer (mevzuat_oner._QUERY_BOOST). Kalibrasyon üretim koşulunu taklit
# etmezse (konu boş) eşikler kayar: ölçüldü, AUC 0.964 → 0.916'ya düşüyor.
_KONU_RE = re.compile(r"^\s*Konu\s*[:：]\s*(.+)$", re.IGNORECASE | re.MULTILINE)


def _oku_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _auc(pozitif: list[float], negatif: list[float]) -> float:
    """Mann-Whitney U → AUC. 0.5 = sinyal yok, 1.0 = kusursuz ayrım."""
    if not pozitif or not negatif:
        return float("nan")
    kazanc = 0.0
    for p in pozitif:
        for n in negatif:
            kazanc += 1.0 if p > n else (0.5 if p == n else 0.0)
    return kazanc / (len(pozitif) * len(negatif))


async def _ornekle(rows: list[dict[str, Any]]) -> tuple[list[tuple[float, bool]], list[tuple[float, bool]]]:
    """Gold satırlarını gerçek retrieval'dan geçir → (top1, tüm-rank) [(norm_score, dogru)]."""
    from agents.nodes.mevzuat_oner import mevzuat_oner_node
    from eval.retrieval_eval import _kanun_nolari

    top1: list[tuple[float, bool]] = []
    tum: list[tuple[float, bool]] = []
    for row in rows:
        metin = row.get("metin", "")
        eslesme = _KONU_RE.search(metin)
        state: dict[str, Any] = {
            "evrak_turu": row.get("evrak_turu", "belirsiz"),
            "bilgi_unsurlari": {"konu": eslesme.group(1).strip() if eslesme else ""},
            "evrak_text": metin,
        }
        oneriler = (await mevzuat_oner_node(state))["mevzuat_onerileri"]
        if not oneriler or "norm_score" not in oneriler[0]:
            continue  # config fallback (retrieval yok) → kalibrasyon dışı
        beklenen: set[str] = set()
        for m in row.get("beklenen_mevzuat") or []:
            beklenen |= _kanun_nolari(str(m))
        for i, oneri in enumerate(oneriler):
            norm = float(oneri["norm_score"])
            dogru = bool(_kanun_nolari(str(oneri.get("baslik", ""))) & beklenen)
            tum.append((norm, dogru))
            if i == 0:
                top1.append((norm, dogru))
    return top1, tum


def _bant_isabet(veri: list[tuple[float, bool]], kenarlar: tuple[float, ...]) -> list[dict[str, Any]]:
    """Her bant için (n, isabet) — 'yüksek güven' iddiasının kanıtı budur."""
    out: list[dict[str, Any]] = []
    sinirlar = (0.0, *kenarlar, float("inf"))
    for alt, ust in pairwise(sinirlar):
        uyan = [d for v, d in veri if alt <= v < ust]
        if not uyan:
            continue
        out.append({"alt": alt, "ust": ust, "n": len(uyan),
                    "isabet": round(sum(uyan) / len(uyan), 3)})
    return out


async def degerlendir(rows: list[dict[str, Any]], kenarlar: tuple[float, ...]) -> dict[str, Any]:
    top1, tum = await _ornekle(rows)
    if not top1:
        raise RuntimeError("Hiç retrieval örneği toplanamadı (korpus/indeks eksik?).")
    return {
        "n_evrak": len(top1),
        "taban_isabet": round(sum(d for _, d in top1) / len(top1), 3),
        "auc_top1": round(_auc([v for v, d in top1 if d], [v for v, d in top1 if not d]), 3),
        "auc_tum_rank": round(_auc([v for v, d in tum if d], [v for v, d in tum if not d]), 3),
        "kenarlar": list(kenarlar),
        "bantlar_top1": _bant_isabet(top1, kenarlar),
        "bantlar_tum_rank": _bant_isabet(tum, kenarlar),
    }


def _rapor(res: dict[str, Any]) -> str:
    satir = [
        "",
        "=== Mevzuat güven bandı kalibrasyonu (norm_score = raw_score / sorgu_token) ===",
        f"  evrak            : {res['n_evrak']}",
        f"  taban top-1 isabet: {res['taban_isabet']}  <- 'her top-1 yüksek güven' demenin gerçek isabeti",
        f"  AUC (top-1)      : {res['auc_top1']}",
        f"  AUC (tüm rank)   : {res['auc_tum_rank']}",
        "",
        "  Bant isabetleri (top-1):",
    ]
    for b in res["bantlar_top1"]:
        ust = "∞" if b["ust"] == float("inf") else f"{b['ust']:.2f}"
        satir.append(f"    [{b['alt']:.2f}, {ust})  n={b['n']:>4}  isabet={b['isabet']:.3f}")
    satir += ["", "  Bant isabetleri (tüm rank):"]
    for b in res["bantlar_tum_rank"]:
        ust = "∞" if b["ust"] == float("inf") else f"{b['ust']:.2f}"
        satir.append(f"    [{b['alt']:.2f}, {ust})  n={b['n']:>4}  isabet={b['isabet']:.3f}")
    satir.append("")
    return "\n".join(satir)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mevzuat güven bandı kalibrasyonu")
    parser.add_argument("--n", type=int, default=0, help="ilk-N altın satır (0=tümü)")
    parser.add_argument("--gold", type=Path, default=_GOLD_CLASS, help="altın set yolu")
    parser.add_argument("--kenar", type=float, nargs="+", default=[1.2, 1.4],
                        help="bant kenarları (varsayılan: düşük<1.2<=orta<1.4<=yüksek)")
    parser.add_argument("--json", action="store_true", help="JSON çıktı (CI)")
    args = parser.parse_args(argv)

    # Kalibrasyon SAF retrieval'ı ölçer: rerank/CRAG/NLI/atıf açıkken norm_score'un
    # anlamı değişir (sıra/liste başkalaşır) → bantlar baseline BM25 üzerinde tanımlıdır.
    for bayrak in ("RERANK_ENABLED", "CRAG_ENABLED", "NLI_ENABLED", "ATIF_GENISLET_ENABLED"):
        os.environ[bayrak] = "0"
    os.environ.setdefault("LLM_MODE", "mock")

    rows = [r for r in _oku_jsonl(args.gold) if r.get("beklenen_mevzuat")]
    if args.n > 0:
        rows = rows[: args.n]
    res = asyncio.run(degerlendir(rows, tuple(args.kenar)))

    if args.json:
        sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(_rapor(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
