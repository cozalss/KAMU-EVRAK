"""Birim yönlendirme A/B — deterministik yol vs SERBEST LLM seçimi (model parametreli).

`route_birim._route_birim_impl` docstring'i 2026-07-04'te ölçülen bir iddia taşıyor:
"bilinen türde LLM'e serbest bırakılan seçim Top-1'i 0.91'den 0.54-0.59'a düşürüyor".
Bu betik o iddiayı İSTENEN MODELLE yeniden ölçer (ör. deepseek-v4-pro).

ÖLÇÜLDÜ (2026-07-24, deepseek-v4-pro, n=108, 2 bağımsız set):
    deterministik Top-1 = 0.889   ·   serbest LLM Top-1 = 0.584   ·   fark = -0.305
Yani iddia YENİ ve GÜÇLÜ modelle de doğrulandı; serbest LLM seçimi geriletiyor.

İki kol AYNI gold set üzerinde koşar:
  A (det) — `_route_deterministik`: config + içerik-anahtar heuristiği (üretimdeki yol).
  B (llm) — üretimdeki LLM prompt'unun BİREBİR aynısı, ama TÜM örneklerde çağrılır.

    uv run python scripts/eval_route_llm_ab.py --model deepseek-v4-pro
    uv run python scripts/eval_route_llm_ab.py --model deepseek-v4-flash --limit 6
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any


def _on_model() -> str:
    """--model'i importlardan ÖNCE oku: LLM istemcisi env'den TEK sefer kurulur."""
    for i, arg in enumerate(sys.argv):
        if arg == "--model" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        if arg.startswith("--model="):
            return arg.split("=", 1)[1]
    return ""


_MODEL = _on_model()
if _MODEL:
    os.environ["OPENAI_LLM_MODEL"] = _MODEL

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from agents.config import BIRIMLER  # noqa: E402
from agents.nodes._llm_extract import llm_json, real_llm  # noqa: E402
from agents.nodes.route_birim import _birim_listesi, _route_deterministik  # noqa: E402
from api.pii import mask_for_llm  # noqa: E402

_ROOT = Path(__file__).resolve().parents[2]
_VERI = _ROOT / "data" / "synthetic"
_SETLER = ("heldout_gold_n54.jsonl", "heldout2_gold_n54.jsonl")
_ESZAMANLI = 8


def _yukle(dosya: str, limit: int) -> list[dict[str, Any]]:
    path = _VERI / dosya
    if not path.is_file():
        return []
    kayitlar = [
        json.loads(satir)
        for satir in path.read_text(encoding="utf-8").splitlines() if satir.strip()
    ]
    return kayitlar[:limit] if limit else kayitlar


def _det_tahmin(kayit: dict[str, Any]) -> str:
    state = {"evrak_turu": kayit.get("evrak_turu", "belirsiz"),
             "evrak_text": kayit.get("metin", "")}
    return str(_route_deterministik(state)["hedef_birim"])


async def _llm_tahmin(kayit: dict[str, Any]) -> tuple[str, bool]:
    """(tahmin, gecerli) — üretimdeki prompt'un birebir aynısı. Geçersiz kod → ("", False)."""
    text = mask_for_llm(kayit.get("metin", "") or "", None)[:900]
    obj = await llm_json(
        system=(
            "Sen bir kamu kurumunda evrak havale uzmanısın. Verilen evrakı SADECE listedeki "
            "birimlerden EN UYGUN olanına yönlendir. Yalnız listedeki birim KODLARINI kullan. "
            "Yanlış havale maliyetlidir; tür ve içeriğe göre karar ver."
        ),
        user=(
            f"EVRAK TÜRÜ: {kayit.get('evrak_turu', 'belirsiz')}\n\n"
            f"BİRİMLER (kod: ad):\n{_birim_listesi()}\n\n"
            f"EVRAK METNİ:\n{text}\n\n"
            'Yalnız şu JSON: {"hedef":"<birim_kod>","alternatifler":["<kod>","<kod>"],'
            '"gerekce":"<tek cümle Türkçe gerekçe>"}'
        ),
        # DİKKAT: üretimdeki değer 220. deepseek-v4-pro bir DÜŞÜNME modeli ve reasoning
        # token'ları da bu bütçeden düşüyor → 220'de cevap BOŞ dönüyor (2026-07-24 bulgusu).
        # A/B'de LLM'e adil şans vermek için bütçe açılır; üretim ayrı düzeltilmeli.
        max_tokens=1200,
        timeout_s=180.0,  # düşünme süresi uzun
    )
    hedef = (obj or {}).get("hedef")
    return (str(hedef), True) if hedef in BIRIMLER else ("", False)


async def _set_olc(dosya: str, limit: int) -> dict[str, Any]:
    kayitlar = _yukle(dosya, limit)
    if not kayitlar:
        return {"dosya": dosya, "n": 0}
    kilit = asyncio.Semaphore(_ESZAMANLI)

    async def _tek(kayit: dict[str, Any]) -> tuple[bool, bool, bool]:
        beklenen = kayit.get("beklenen_birim", "")
        det = _det_tahmin(kayit)
        async with kilit:
            llm, gecerli = await _llm_tahmin(kayit)
        return det == beklenen, llm == beklenen, gecerli

    sonuc = await asyncio.gather(*(_tek(k) for k in kayitlar))
    n = len(sonuc)
    return {
        "dosya": dosya,
        "n": n,
        "det_top1": round(sum(1 for d, _l, _g in sonuc if d) / n, 3),
        "llm_top1": round(sum(1 for _d, l, _g in sonuc if l) / n, 3),
        "llm_gecersiz": sum(1 for _d, _l, g in sonuc if not g),
    }


async def _calistir(limit: int) -> dict[str, Any]:
    if real_llm() is None:
        return {"hata": "gercek LLM yok (LLM_MODE=mock veya anahtar yok) — A/B anlamsiz"}
    setler = [await _set_olc(dosya, limit) for dosya in _SETLER]
    dolu = [s for s in setler if s.get("n")]
    toplam = sum(s["n"] for s in dolu) or 1
    return {
        "model": os.getenv("OPENAI_LLM_MODEL", "?"),
        "setler": setler,
        "birlesik": {
            "n": sum(s["n"] for s in dolu),
            "det_top1": round(sum(s["det_top1"] * s["n"] for s in dolu) / toplam, 3),
            "llm_top1": round(sum(s["llm_top1"] * s["n"] for s in dolu) / toplam, 3),
            "llm_gecersiz": sum(s["llm_gecersiz"] for s in dolu),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Birim yonlendirme A/B (det vs serbest LLM)")
    parser.add_argument("--model", default="", help="OPENAI_LLM_MODEL (ör. deepseek-reasoner)")
    parser.add_argument("--limit", type=int, default=0, help="set basina ornek siniri (0=hepsi)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    rapor = asyncio.run(_calistir(args.limit))
    if args.json:
        print(json.dumps(rapor, ensure_ascii=False, indent=2))
        return 1 if "hata" in rapor else 0
    if "hata" in rapor:
        print(f"HATA: {rapor['hata']}")
        return 1
    print(f"MODEL: {rapor['model']}")
    for s in rapor["setler"]:
        if not s.get("n"):
            print(f"  {s['dosya']}: veri yok")
            continue
        print(f"  {s['dosya']:26s} n={s['n']:3d}  det={s['det_top1']:.3f}  "
              f"llm={s['llm_top1']:.3f}  (llm gecersiz: {s['llm_gecersiz']})")
    b = rapor["birlesik"]
    print(f"  {'BIRLESIK':26s} n={b['n']:3d}  det={b['det_top1']:.3f}  "
          f"llm={b['llm_top1']:.3f}  (llm gecersiz: {b['llm_gecersiz']})")
    fark = b["llm_top1"] - b["det_top1"]
    print(f"\nFARK (llm - det): {fark:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
