"""Mevzuat chunk embedding job (Faz 6 / C) — mevzuat_chunk.embedding doldurur.

768-dim model (şema vector(768) ile uyumlu): varsayılan intfloat/multilingual-e5-base
(Türkçe dahil çok-dilli, MIT). e5 ailesi belge için 'passage: ' ön-eki ister. Doldurunca
HNSW (ix_chunk_embedding) semantik arama için hazır olur; BM25+trgm birincil kalır (hibrit).

Ağır bağımlılık: `uv sync --extra rag` (sentence-transformers/torch) gerekir. Idempotent:
yalnız embedding'i NULL olan chunk'ları işler (--all ile hepsini yeniden gömer).

Çalıştır:  uv run --extra rag python -m db.embed_mevzuat
"""
from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import func, select, update

from db.models import MevzuatChunk
from db.session import engine, session_factory

_MODEL = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-base")
_BATCH = int(os.getenv("EMBED_BATCH", "64"))
_PREFIX = os.getenv("EMBED_PREFIX", "passage: ")  # e5 belge ön-eki


def _model():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise SystemExit("sentence-transformers yok — `uv sync --extra rag` çalıştırın") from e
    return SentenceTransformer(_MODEL)


async def main() -> int:
    yeniden = "--all" in sys.argv
    async with session_factory() as s:
        stmt = select(MevzuatChunk.id, MevzuatChunk.metin)
        if not yeniden:
            stmt = stmt.where(MevzuatChunk.embedding.is_(None))
        rows = (await s.execute(stmt)).all()
        toplam = await s.scalar(select(func.count()).select_from(MevzuatChunk))
        if not rows:
            print(f"İşlenecek chunk yok (toplam {toplam}, hepsi gömülü).")
            await engine.dispose()
            return 0

        print(f"Model yükleniyor: {_MODEL} …")
        model = _model()
        boyut = model.get_sentence_embedding_dimension()
        if boyut != 768:
            raise SystemExit(f"Model {boyut}-dim üretiyor; şema vector(768) bekliyor. "
                             f"768-dim model seçin (EMBED_MODEL).")

        print(f"{len(rows)}/{toplam} chunk gömülüyor (batch={_BATCH}) …")
        islenen = 0
        for i in range(0, len(rows), _BATCH):
            parca = rows[i:i + _BATCH]
            vekt = model.encode(
                [_PREFIX + (m or "") for _id, m in parca],
                normalize_embeddings=True, batch_size=_BATCH, show_progress_bar=False)
            for (cid, _m), v in zip(parca, vekt):
                await s.execute(update(MevzuatChunk).where(MevzuatChunk.id == cid)
                                .values(embedding=v.tolist()))
            await s.commit()
            islenen += len(parca)
            print(f"  {islenen}/{len(rows)}")

        gomulu = await s.scalar(
            select(func.count()).select_from(MevzuatChunk).where(MevzuatChunk.embedding.is_not(None)))
        print(f"\nTamam: {gomulu}/{toplam} chunk embedding'li.")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
