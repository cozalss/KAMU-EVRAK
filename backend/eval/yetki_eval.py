"""Yetki + GERÇEK birim yönlendirme değerlendirmesi (routing_eval'in tamamlayıcısı).

routing_eval yalnız 9'lu kategoriyi (hedef_kategori) türe göre yazılmış altınla ölçer; gerçek
birim adını, yetki içeride/dışarıda kararını ve yetkili kurumu GÖRMEZ (teşhis 2026-10-05).
Bu betik route düğümünü İZOLE koşar: e2e altın setindeki (data/synthetic/e2e_gercek_gold.jsonl)
her belge için türü ve talepleri altından verir, yalnız yönlendirmeyi ölçer:

  - birim_dogruluk        : gosterim_birimi altının kabul ettiği birim/kurum köklerinden birini içeriyor
  - alt_birim_dogruluk    : çok talepli belgede talep başına birim/kurum doğru
  - yetki_tespit          : DISARIDA belgede yetkili kurum (belge ya da talep düzeyi) doğru
  - yetki_yanlis_alarm    : ICERIDE belgede belge düzeyi kurum dışına devir
  - yargi_yolu_devir      : YARGI belgede (3071 m.6/b, yargı merciinin görevi) herhangi bir devir
                            — hedef 0; m.5 devri yalnız yetkili İDARİ makama yapılır
  - yanlis_otomatik_havale: insan onayı İSTEMEDEN yanlış birime havale (hedef 0)

Mock modda (LLM yok) deterministik yolu ölçer — CI bekçisi: yanlış otomatik havale 0 olmalı.
Gerçek LLM: LLM_MODE=openai + anahtar (ücretli; yalnız ölçüm için, --id ile daraltın).

Çalıştır: cd backend && PYTHONUTF8=1 uv run python -m eval.yetki_eval [--id X ...]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any

from eval.e2e_eslesme import birim_dogru as _birim_dogru
from eval.e2e_gercek_eval import GOLD, icerir_herhangi
from eval.stats import wilson_interval


def _state(g: dict[str, Any]) -> dict[str, Any]:
    b = g["beklenen"]
    talepler = [t["ozet"] for t in b["talep_detay"]]
    alt = [{"id": f"t{i + 1}", "ozet": o} for i, o in enumerate(talepler)] if len(talepler) > 1 else []
    return {"evrak_turu": b["evrak_turu"], "evrak_text": g["metin"],
            "bilgi_unsurlari": {"talepler": talepler}, "alt_talepler": alt}


def belge_olc(out: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    gosterim = out.get("gosterim_birimi") or out.get("hedef_birim_oneri") or ""
    birim_dogru = _birim_dogru(gosterim, b["birim_kabul_edilebilir"])
    yon = out.get("yonlendirme") or {}
    kararlar = yon.get("talepler") or []
    alt = []
    if len(b["talep_detay"]) > 1:
        for t, k in zip(b["talep_detay"], kararlar, strict=False):
            metin = " ".join(filter(None, [((k.get("birim") or {}).get("ad")),
                                           ((k.get("alici_kurum") or {}).get("ad"))]))
            alt.append(icerir_herhangi(metin, t["birim_kabul"] + t.get("yetkili_kurum_kabul", [])))
    muh = (out.get("muhatap_kurum") or {}).get("slug")
    yk = out.get("yetkili_kurum") or {}
    belge_disari = bool(yk.get("slug")) and yk.get("slug") != muh
    kurumlar = " | ".join((k.get("alici_kurum") or {}).get("ad", "") for k in kararlar)
    return {"birim": birim_dogru, "alt": alt, "gosterim": gosterim,
            "yetki": icerir_herhangi(kurumlar, b.get("yetkili_kurum_kabul") or []),
            "yanlis_alarm": belge_disari, "karar": yon.get("karar"),
            "devir": belge_disari or any(k.get("alici_kurum") for k in kararlar),
            "otomatik_yanlis": (not out.get("insan_onayi_gerekli")) and not birim_dogru}


def _oran(k: int, n: int) -> dict[str, Any]:
    lo, hi = wilson_interval(k, n)
    return {"k": k, "n": n, "oran": round(k / n, 4) if n else None, "ci95": [round(lo, 3), round(hi, 3)]}


async def calistir(satirlar: list[dict[str, Any]]) -> dict[str, Any]:
    from agents.nodes.route_birim import route_birim_node

    kayit = []
    for g in satirlar:
        out = await route_birim_node(_state(g))
        kayit.append({"id": g["id"], "yetki_beklenen": g["beklenen"]["yetki"],
                      **belge_olc(out, g["beklenen"])})
    dis = [r for r in kayit if r["yetki_beklenen"] == "DISARIDA"]
    ic = [r for r in kayit if r["yetki_beklenen"] == "ICERIDE"]
    yargi = [r for r in kayit if r["yetki_beklenen"] == "YARGI"]
    alt = [x for r in kayit for x in r["alt"]]
    return {"n": len(kayit), "metrikler": {
        "birim_dogruluk": _oran(sum(r["birim"] for r in kayit), len(kayit)),
        "alt_birim_dogruluk": _oran(sum(alt), len(alt)),
        "yetki_tespit": _oran(sum(r["yetki"] for r in dis), len(dis)),
        "yetki_yanlis_alarm": _oran(sum(r["yanlis_alarm"] for r in ic), len(ic)),
        "yargi_yolu_devir": _oran(sum(r["devir"] for r in yargi), len(yargi)),
        "yanlis_otomatik_havale": _oran(sum(r["otomatik_yanlis"] for r in kayit), len(kayit)),
    }, "belgeler": kayit}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--id", action="append", dest="ids")
    args = ap.parse_args()
    satirlar = [json.loads(s) for s in GOLD.read_text(encoding="utf-8").splitlines() if s.strip()]
    if args.ids:
        satirlar = [g for g in satirlar if g["id"] in set(args.ids)]
    sonuc = asyncio.run(calistir(satirlar))
    print(json.dumps(sonuc["metrikler"], ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
