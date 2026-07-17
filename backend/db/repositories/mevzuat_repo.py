"""Mevzuat hibrit arama (Faz 7) — BM25 (tsvector) birincil + pg_trgm (typo) fallback.

DB tarafı retrieval: mevzuat_chunk.tsv (GENERATED 'simple') üzerinde websearch_to_tsquery
+ ts_rank. Sonuç yoksa (typo/eş-anlam) trgm similarity'e düşer. embedding (HNSW) ileride
eklenince RRF ile birleşir. Salt-okunur; kullanıcıdan gelen q parametrize ($1) — SQLi yok.
"""
from __future__ import annotations

import os
import re
import unicodedata

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Mevzuat, MevzuatChunk, MevzuatMadde

# Unicode harf/rakam (Türkçe â/î/û + İ dahil); diğerleri to_tsquery için ayraç.
# Küçültme YAPILMAZ — to_tsquery('simple') zaten küçültür; Python .lower() 'İ'yi bozar.
_KELIME_RE = re.compile(r"\w+", re.UNICODE)

# OR (|) tsquery → recall yüksek; ts_rank çok-terim eşleşmeyi üste taşır (precision korunur).
_BM25_SQL = text("""
    SELECT m.kanun_no, m.baslik, md.madde_no, c.metin,
           ts_rank(c.tsv, to_tsquery('simple', :tsq)) AS skor
    FROM mevzuat_chunk c
    JOIN mevzuat m ON m.id = c.mevzuat_id
    LEFT JOIN mevzuat_madde md ON md.id = c.madde_id
    WHERE c.tsv @@ to_tsquery('simple', :tsq)
    ORDER BY skor DESC, c.id
    LIMIT :k
""")


def _tsquery(q: str) -> str:
    """Kullanıcı sorgusu → güvenli OR tsquery ('kelime1 | kelime2'). Boşsa ''.

    Yalnız harf/rakam token'ları (to_tsquery operatörü &|!():* enjekte edilemez).
    """
    return " | ".join(_KELIME_RE.findall(unicodedata.normalize("NFC", q)))

_TRGM_SQL = text("""
    SELECT m.kanun_no, m.baslik, md.madde_no, c.metin,
           similarity(c.metin, :q) AS skor
    FROM mevzuat_chunk c
    JOIN mevzuat m ON m.id = c.mevzuat_id
    LEFT JOIN mevzuat_madde md ON md.id = c.madde_id
    WHERE c.metin %> :q
    ORDER BY skor DESC, c.id
    LIMIT :k
""")

_SNIPPET = 240


def _satir(r, yontem: str) -> dict:
    metin = r.metin or ""
    return {
        "kanun_no": r.kanun_no, "baslik": r.baslik, "madde_no": r.madde_no,
        "snippet": metin[:_SNIPPET] + ("…" if len(metin) > _SNIPPET else ""),
        "skor": round(float(r.skor or 0), 4), "yontem": yontem,
    }


async def hybrid_ara(session: AsyncSession, *, q: str, limit: int = 10) -> list[dict]:
    """q için mevzuat chunk araması. BM25 birincil; boşsa trgm fallback."""
    q = (q or "").strip()
    if not q:
        return []
    tsq = _tsquery(q)
    if tsq:
        rows = (await session.execute(_BM25_SQL, {"tsq": tsq, "k": limit})).all()
        if rows:
            return [_satir(r, "bm25") for r in rows]
    # typo/eş-anlam → trgm (word_similarity eşiği pg_trgm.word_similarity_threshold, vars. 0.6).
    rows = (await session.execute(_TRGM_SQL, {"q": q, "k": limit})).all()
    return [_satir(r, "trgm") for r in rows]


# --- Semantik arama (opsiyonel; mevzuat_chunk.embedding + HNSW) -----------
_embed_model = None  # lazy singleton (torch ağır → yalnız kullanılırsa yüklenir)


def _embed_query(q: str) -> list[float]:
    """Sorguyu e5 'query:' ön-ekiyle göm. sentence-transformers yoksa ImportError."""
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer  # ağır import — lazy
        _embed_model = SentenceTransformer(os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-base"))
    return _embed_model.encode(["query: " + q], normalize_embeddings=True)[0].tolist()


async def semantik_ara(session: AsyncSession, *, q: str, limit: int = 10) -> list[dict]:
    """Anlamsal arama (pgvector cosine + HNSW). rag extra yoksa/embedding boşsa [] döner."""
    q = (q or "").strip()
    if not q:
        return []
    try:
        vec = _embed_query(q)
    except ImportError:
        return []  # graceful — caller BM25'e düşebilir
    dist = MevzuatChunk.embedding.cosine_distance(vec)
    rows = (await session.execute(
        select(Mevzuat.kanun_no, Mevzuat.baslik, MevzuatMadde.madde_no,
               MevzuatChunk.metin, dist.label("d"))
        .join(Mevzuat, Mevzuat.id == MevzuatChunk.mevzuat_id)
        .outerjoin(MevzuatMadde, MevzuatMadde.id == MevzuatChunk.madde_id)
        .where(MevzuatChunk.embedding.is_not(None))
        .order_by(dist).limit(limit))).all()
    return [{
        "kanun_no": r.kanun_no, "baslik": r.baslik, "madde_no": r.madde_no,
        "snippet": (r.metin or "")[:_SNIPPET] + ("…" if len(r.metin or "") > _SNIPPET else ""),
        "skor": round(1 - float(r.d), 4), "yontem": "semantik",
    } for r in rows]


__all__ = ("hybrid_ara", "semantik_ara")
