"""Görev 1 — İlgili mevzuat / yazışma kuralı önerme node'u.

İki kademe (LLM'siz — mock modda da çalışır):
  1. data/mevzuat korpusu VARSA: madde-bazlı chunk üzerinde BM25 retrieval.
     - Önce seed indeksi (data/mevzuat/index/mevzuat_index.json, scripts/seed_mevzuat.py)
       okunur; yoksa korpus *.txt runtime'da chunker.chunk_mevzuat ile chunk'lanır.
     - Skor: rank_bm25 BM25Okapi (varsa); yoksa stdlib term-overlap fallback.
  2. Korpus YOKSA: config.EVRAK_TO_MEVZUAT statik eşleme (kaynaklı başlıklar).

CLAUDE.md §1: madde no UYDURULMAZ. Korpustan gelen snippet ham metindir
(doğrulanabilir). Chunk metadata'sında madde_no varsa başlık "... m.<no>" olur;
yoksa başlık `[DOĞRULA: madde no]` ile işaretlenir.

Return sözleşmesi (KEEP): {"mevzuat_onerileri": list[MevzuatOneri]}.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog

from agents.config import EVRAK_TO_MEVZUAT, EVRAK_TURU_TR
from core.text import tr_lower
from retrieval.chunker import chunk_mevzuat

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[3]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
_INDEX_FILE = _MEVZUAT_DIR / "index" / "mevzuat_index.json"
_TOP_K = 3
_MIN_QUERY_LEN = 8  # çok kısa metinde retrieval gürültülü → statik'e düş
_MIN_CHUNK_CHARS = 40
_SNIPPET_CHARS = 280
_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")
# BM25 uzunluk-normalizasyonu (b). Varsayılan 0.75 KISA madde korpusunda kısa+genel
# maddeleri (örn. 2646 m.22 Koordinasyon) aşırı kayırır → spesifik madde (3071 m.4
# Dilekçe zorunlu unsurlar) dilekçe sorgusunda 3. sıraya düşer. Madde uzunluğu burada
# alaka ile korele DEĞİL → b=0.3 ile normalizasyon zayıflatılır (ölçüldü: 3071 m.4 başa).
_BM25_B = 0.3


def _tokenize(s: str) -> list[str]:
    """Türkçe-doğru küçük harf + alfasayısal token (diakritik korunur)."""
    return _WORD_RE.findall(tr_lower(s))


def _chunks_from_corpus(src_dir: Path) -> list[dict[str, Any]]:
    """Korpus *.txt → madde-bazlı chunk kayıtları (seed indeksi yoksa runtime)."""
    kayitlar: list[dict[str, Any]] = []
    if not src_dir.is_dir():
        return kayitlar
    for path in sorted(src_dir.glob("*.txt")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        etiket = path.stem.replace("_", " ")
        for chunk in chunk_mevzuat(text, subchunk=False):
            govde = chunk.text.strip()
            if len(govde) < _MIN_CHUNK_CHARS:
                continue
            kayitlar.append({
                "mevzuat": etiket,
                "madde_no": chunk.metadata.get("madde_no"),
                "text": govde,
            })
    return kayitlar


@lru_cache(maxsize=1)
def _load_index() -> tuple[dict[str, Any], ...]:
    """Mevzuat chunk indeksi — seed JSON öncelikli, yoksa korpustan runtime build.

    lru_cache: indeks process ömrü boyunca bir kez kurulur (her node çağrısında
    dosya okuma/chunk'lama tekrar etmez). Test izolasyonu için cache_clear var.
    """
    if _INDEX_FILE.is_file():
        try:
            payload = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
            chunks = payload.get("chunks") or []
            if chunks:
                return tuple(chunks)
        except (OSError, ValueError) as exc:
            log.warning("mevzuat_oner.index_read_failed", hata=str(exc))
    return tuple(_chunks_from_corpus(_MEVZUAT_DIR))


def _score(query: str, chunks: tuple[dict[str, Any], ...]) -> list[tuple[float, dict[str, Any]]]:
    """(score, chunk) azalan sıralı — BM25Okapi (varsa) yoksa term-overlap."""
    q_tokens = _tokenize(query)
    if not q_tokens or not chunks:
        return []
    try:
        from rank_bm25 import BM25Okapi

        bm25 = BM25Okapi([_tokenize(c["text"]) for c in chunks], b=_BM25_B)
        scores = list(bm25.get_scores(q_tokens))
    except Exception:  # rank_bm25 yok/hata → stdlib term-overlap
        q_set = set(q_tokens)
        scores = [sum(1 for t in _tokenize(c["text"]) if t in q_set) for c in chunks]
    ranked = sorted(
        ((float(s), chunks[i]) for i, s in enumerate(scores)),
        key=lambda x: -x[0],
    )
    return [r for r in ranked if r[0] > 0][:_TOP_K]


def _baslik(chunk: dict[str, Any]) -> str:
    """Chunk metadata'sından öneri başlığı: madde_no varsa 'm.<no>', yoksa [DOĞRULA:]."""
    mevzuat = str(chunk.get("mevzuat", "")).strip() or "mevzuat"
    madde_no = chunk.get("madde_no")
    if madde_no is not None:
        return f"{mevzuat} m.{madde_no}"
    return f"{mevzuat} [DOĞRULA: madde no]"


# Konu + evrak türü = en güçlü alaka sinyali; ham gövde boilerplate ("arz ederim",
# "imza") gürültüsü taşır ve genel resmî-yazı maddelerini (2646) kayırır. Konu/türü
# tekrar ederek ağırlandırırız (standart sorgu-genişletme) → domain-spesifik madde
# (3071 m.4 dilekçe) gövde-boilerplate'i geçer. Ölçüldü: dilekçe → 3071 m.4 TOP-1.
_QUERY_BOOST = 3
_EVRAK_TEXT_CHARS = 600


def _retrieval_query(state: dict[str, Any]) -> str:
    """Sorgu: (konu+tür) ağırlıklı + metnin ilk bölümü (PII'siz — cikar zaten maskeledi).

    Tür anahtarı (`dilekce`) yerine Türkçe etiketi (`Dilekçe`) kullanılır → korpus
    metnindeki diakritikli terim ("dilekçe") ile eşleşir (aksi hâlde 'dilekce' hiçbir
    chunk'a değmez, boost sinyali kaybolur).
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    turu_key = (state.get("evrak_turu", "") or "").strip()
    turu = EVRAK_TURU_TR.get(turu_key, turu_key)
    boosted = " ".join(f"{konu} {turu}".split() * _QUERY_BOOST).strip()
    body = (state.get("evrak_text", "") or "")[:_EVRAK_TEXT_CHARS]
    return " ".join(p for p in (boosted, body) if p)


def _from_corpus(query: str) -> list[dict[str, Any]]:
    """Korpustan BM25 retrieval önerileri (boş liste → caller statik'e düşer)."""
    ranked = _score(query, _load_index())
    if not ranked:
        return []
    max_score = ranked[0][0] or 1.0
    oneriler: list[dict[str, Any]] = []
    for score, chunk in ranked:
        oneriler.append({
            "baslik": _baslik(chunk),
            "snippet": str(chunk.get("text", ""))[:_SNIPPET_CHARS],
            "score": round(score / max_score, 3),
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
