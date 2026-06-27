"""Denetim tablolarının AYRI yedeği (Faz 8) — denetim_izi + denetim_adimi → JSON.

Sayıştay/KVKK: denetim izi, ana DB'den BAĞIMSIZ olarak da saklanmalı (ana yedek bozulsa
bile bütünlük kanıtı durur). Salt-okunur export; hash-zinciri olduğu gibi taşınır →
dış kopya üzerinden de dogrula_zincir ile doğrulanabilir.

  uv run python -m db.yedek_denetim [çıktı_yolu.json]
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import json
import sys
from pathlib import Path

from sqlalchemy import select

from db.models import DenetimAdimi, DenetimIzi
from db.session import engine, session_factory

_ROOT = Path(__file__).resolve().parents[2]


def _vars() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d_%H%M%S")


async def main() -> int:
    cikti = Path(sys.argv[1]) if len(sys.argv) > 1 else _ROOT / "data" / "backups" / f"denetim_{_vars()}.json"
    cikti.parent.mkdir(parents=True, exist_ok=True)
    async with session_factory() as s:
        izler = (await s.execute(select(DenetimIzi))).scalars().all()
        adimlar = (await s.execute(
            select(DenetimAdimi).order_by(DenetimAdimi.islem_id, DenetimAdimi.sira))).scalars().all()
        veri = {
            "uretildi": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "denetim_izi": [{
                "islem_id": str(i.islem_id), "kok_hash": i.kok_hash, "son_hash": i.son_hash,
                "adim_sayisi": i.adim_sayisi, "butunluk": i.butunluk,
            } for i in izler],
            "denetim_adimi": [{
                "islem_id": str(a.islem_id), "sira": a.sira, "adim_adi": a.adim_adi,
                "karar_json": a.karar_json, "onceki_hash": a.onceki_hash, "hash": a.hash,
            } for a in adimlar],
        }
    cikti.write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ Denetim yedeği: {len(izler)} iz / {len(adimlar)} adım → {cikti}")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
