"""Görev 1 — İlgili mevzuat / yazışma kuralı önerme node'u.

İki kademe:
  1. data/mevzuat/*.txt korpusu VARSA: madde-bazlı chunk üzerinde BM25/keyword
     retrieval (rank_bm25 varsa BM25Okapi; yoksa stdlib term-overlap fallback).
  2. Korpus YOKSA: config.EVRAK_TO_MEVZUAT statik eşleme (kaynaklı başlıklar).

CLAUDE.md §1: madde no UYDURULMAZ. Korpustan gelen snippet ham metindir
(doğrulanabilir); statik başlıklar zaten resmî kaynağa dayanır. Korpus
snippet'inde madde no görünmüyorsa başlık `[DOĞRULA: madde no]` ile işaretlenir.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import structlog

from agents.config import EVRAK_TO_MEVZUAT
from core.text import tr_lower

log = structlog.get_logger()

_MEVZUAT_DIR = Path(__file__).resolve().parents[3] / "data" / "mevzuat"
_TOP_K = 4
_MIN_QUERY_LEN = 8  # çok kısa metinde retrieval gürültülü → statik'e düş
_MADDE_RE = re.compile(r"\bmadde\s*\d+|\bm\.\s*\d+", re.IGNORECASE)
_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")


def _load_corpus() -> list[tuple[str, str]]:
    """data/mevzuat/*.txt → [(dosya_etiketi, paragraf)] madde/paragraf chunk'ları."""
    chunks: list[tuple[str, str]] = []
    if not _MEVZUAT_DIR.is_dir():
        return chunks
    for path in sorted(_MEVZUAT_DIR.glob("*.txt")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        label = path.stem.replace("_", " ")
        for para in re.split(r"\n\s*\n", text):
            para = para.strip()
            if len(para) >= 40:  # gürültü kısa satırları ele
                chunks.append((label, para))
    return chunks


def _tokenize(s: str) -> list[str]:
    return _WORD_RE.findall(tr_lower(s))


def _score_corpus(query: str, chunks: list[tuple[str, str]]) -> list[tuple[float, str, str]]:
    """(score, etiket, snippet) sıralı liste — BM25 (varsa) yoksa term-overlap."""
    q_tokens = _tokenize(query)
    if not q_tokens or not chunks:
        return []
    try:
        from rank_bm25 import BM25Okapi

        bm25 = BM25Okapi([_tokenize(c[1]) for c in chunks])
        scores = bm25.get_scores(q_tokens)
    except Exception:  # rank_bm25 yok/hata → stdlib term-overlap
        q_set = set(q_tokens)
        scores = [sum(1 for t in _tokenize(c[1]) if t in q_set) for c in chunks]
    ranked = sorted(
        ((float(s), chunks[i][0], chunks[i][1]) for i, s in enumerate(scores)),
        key=lambda x: -x[0],
    )
    return [r for r in ranked if r[0] > 0][:_TOP_K]


def _retrieval_query(state: dict[str, Any]) -> str:
    """Sorgu: konu + tür + metnin ilk bölümü (PII'siz — cikar zaten maskeledi)."""
    unsurlar = state.get("bilgi_unsurlari") or {}
    parts = [str(unsurlar.get("konu", "") or ""), state.get("evrak_turu", "") or "",
             (state.get("evrak_text", "") or "")[:600]]
    return " ".join(p for p in parts if p)


def _from_corpus(query: str) -> list[dict[str, Any]]:
    """Korpustan retrieval önerileri (boş liste → caller statik'e düşer)."""
    ranked = _score_corpus(query, _load_corpus())
    oneriler: list[dict[str, Any]] = []
    max_score = ranked[0][0] if ranked else 1.0
    for score, etiket, snippet in ranked:
        baslik = etiket if _MADDE_RE.search(snippet) else f"{etiket} [DOĞRULA: madde no]"
        oneriler.append({
            "baslik": baslik,
            "snippet": snippet[:280],
            "score": round(score / max_score, 3) if max_score else 0.0,
        })
    return oneriler


def _from_config(turu: str) -> list[dict[str, Any]]:
    """config.EVRAK_TO_MEVZUAT statik başlıkları (kaynaklı; uydurma yok)."""
    basliklar = EVRAK_TO_MEVZUAT.get(turu, [])
    if basliklar:
        return [{"baslik": b, "score": 0.5} for b in basliklar]
    return [{
        "baslik": "Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)",
        "score": 0.3,
    }]


async def mevzuat_oner_node(state: dict[str, Any]) -> dict[str, Any]:
    """İlgili mevzuatı öner — korpus BM25 retrieval birincil, statik config fallback."""
    turu = state.get("evrak_turu", "belirsiz")
    query = _retrieval_query(state)

    oneriler: list[dict[str, Any]] = []
    if len(query) >= _MIN_QUERY_LEN:
        oneriler = _from_corpus(query)
    kaynak = "corpus" if oneriler else "config"
    if not oneriler:
        oneriler = _from_config(turu)

    log.info("mevzuat_oner", turu=turu, kaynak=kaynak, n=len(oneriler))
    return {"mevzuat_onerileri": oneriler}


__all__ = ("mevzuat_oner_node",)
