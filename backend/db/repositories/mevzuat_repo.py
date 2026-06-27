"""Mevzuat hibrit arama (Faz 7) — BM25 (tsvector) birincil + pg_trgm (typo) fallback.

DB tarafı retrieval: mevzuat_chunk.tsv (GENERATED 'simple') üzerinde websearch_to_tsquery
+ ts_rank. Sonuç yoksa (typo/eş-anlam) trgm similarity'e düşer. embedding (HNSW) ileride
eklenince RRF ile birleşir. Salt-okunur; kullanıcıdan gelen q parametrize ($1) — SQLi yok.
"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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


__all__ = ("hybrid_ara",)
