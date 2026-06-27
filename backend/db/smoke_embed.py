"""Faz 6/C smoke — semantik arama doğrulama (mevzuat_chunk.embedding + HNSW).

embed_mevzuat çalıştıktan SONRA. BM25 (kelime) ile semantiği (anlam) karşılaştırır:
eş-anlamlı/dolaylı sorgu BM25'te kaçabilir, semantikte yakalanır.
Çalıştır: uv run --extra rag python -m db.smoke_embed
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import func, select

from db.models import MevzuatChunk
from db.repositories.mevzuat_repo import hybrid_ara, semantik_ara
from db.session import engine, session_factory

_SORGULAR = [
    "vatandaşın bilgi isteme hakkı",   # ≈ bilgi edinme (4982) — kelime örtüşmesi düşük
    "memurun şikâyet süresi",
]


async def main() -> int:
    async with session_factory() as s:
        gomulu = await s.scalar(
            select(func.count()).select_from(MevzuatChunk).where(MevzuatChunk.embedding.is_not(None)))
        toplam = await s.scalar(select(func.count()).select_from(MevzuatChunk))
        print(f"Embedding'li chunk: {gomulu}/{toplam}")
        if not gomulu:
            print("⚠️ embedding yok — önce: uv run --extra rag python -m db.embed_mevzuat")
            await engine.dispose()
            return 1

        for q in _SORGULAR:
            sem = await semantik_ara(s, q=q, limit=3)
            bm = await hybrid_ara(s, q=q, limit=3)
            sem_s = " · ".join(f"{r['baslik'][:24]}~{r['skor']}" for r in sem) or "—"
            bm_s = " · ".join(f"{r['baslik'][:24]}~{r['skor']}" for r in bm) or "—"
            print(f"\nSorgu: '{q}'")
            print(f"  semantik: {sem_s}")
            print(f"  bm25    : {bm_s}")
        ok = gomulu == toplam
    await engine.dispose()
    print("\nSONUÇ:", "✅ SEMANTİK ARAMA HAZIR" if ok else "⚠️ kısmi (bazı chunk gömülmemiş)")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
