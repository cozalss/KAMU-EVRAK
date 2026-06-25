"""Görev 1 — İlgili mevzuat / yazışma kuralı önerme node'u.

İki kademe (LLM'siz — mock modda da çalışır):
  1. data/mevzuat korpusu VARSA: madde-bazlı chunk üzerinde BM25 retrieval.
     - Önce seed indeksi (data/mevzuat/index/mevzuat_index.json, scripts/seed_mevzuat.py)
       okunur; yoksa korpus *.txt runtime'da chunker.chunk_mevzuat ile chunk'lanır.
     - Skor: rank_bm25 BM25Okapi (varsa); yoksa stdlib term-overlap fallback.
     - Tür → mevzuat ÖN-FİLTRE/BOOST: config.EVRAK_TO_MEVZUAT'ta türe atanan kanun
       numaralarına ait chunk'lar skor olarak öne alınır (alaka sinyali güçlendirme).
  2. Korpus YOKSA: config.EVRAK_TO_MEVZUAT statik eşleme (kaynaklı başlıklar).

Ranking iyileştirmeleri (dış değerlendirme "mevzuat retrieval zayıf" bulgusu):
  - Türkçe stopword + resmî-yazı boilerplate ("arz ederim", "rica") elenir → gürültü ↓.
  - Madde/diakritik normalizasyon: "m.4" / "madde 4" tokenleri hizalanır.
  - Tür → beklenen-kanun BOOST (config uyumlu); dedup; min-skor eşiği.
  - BM25 k1/b tunable (kısa-madde korpusu için kalibre).

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
# Çok zayıf eşleşmeyi (sorgu hiçbir maddeye iyi değmedi) öneriden ele: ham BM25 top
# skoru bunun ALTINDAysa retrieval gürültülü kabul edilir → config fallback'e düşülür.
# Gold dağılımı: güçlü eşleşmeler ham≈17-40; gürültü <~3. Çok düşük tutulur (recall önce).
_MIN_RAW_SCORE = 1.0

# BM25 uzunluk-normalizasyonu (b). Varsayılan 0.75 KISA madde korpusunda kısa+genel
# maddeleri (örn. 2646 m.22 Koordinasyon) aşırı kayırır → spesifik madde (3071 m.4
# Dilekçe zorunlu unsurlar) dilekçe sorgusunda 3. sıraya düşer. Madde uzunluğu burada
# alaka ile korele DEĞİL → b=0.3 ile normalizasyon zayıflatılır (ölçüldü: 3071 m.4 başa).
_BM25_B = 0.3
# Terim-frekansı doygunluğu (k1). Madde-chunk'larında bir terim çok tekrar etmez;
# default 1.5 yeterli. Tunable (Türkçe kısa-madde IR araştırması: 1.2-2.0 makul aralık).
_BM25_K1 = 1.5

# Türkçe stopword + resmî-yazı boilerplate. Bu terimler HER mevzuat maddesinde ve
# her evrakta geçer → ayırt edici değil; sorgu/doküman tokenlerinden elenince BM25
# spesifik domain terimine (dilekçe/tebligat/ihale) yoğunlaşır. (Diakritik küçük harf.)
_STOPWORDS: frozenset[str] = frozenset({
    "ve", "veya", "ile", "ya", "da", "de", "ki", "bu", "şu", "o", "bir", "için",
    "gibi", "kadar", "göre", "ise", "ancak", "ayrıca", "her", "hem", "en",
    # Resmî-yazı/dilekçe boilerplate (alaka taşımaz, gürültü yapar):
    "arz", "ederim", "rica", "ederiz", "gereğini", "gereği", "bilgilerinize",
    "bilgilerine", "saygılarımla", "konusunda", "hakkında", "ilgili", "talep",
    "ad", "soyad", "adı", "soyadı", "imza", "tarih", "sayı", "konu", "ek",
})

# Madde/kanun-no normalizasyon: "m.4", "madde 4", "md 4" → tek biçim "madde<no>".
# Sorgu ve doküman aynı biçime indirgenince madde-atıfları BM25'te eşleşir.
_MADDE_REF_RE = re.compile(r"\b(?:m|md|madde)[\.\s]*([0-9]+)", re.IGNORECASE)


def _normalize_madde_refs(s: str) -> str:
    """'m.4' / 'md 4' / 'madde 4' → 'madde4' (sorgu↔doküman madde-atıf hizalama)."""
    return _MADDE_REF_RE.sub(lambda m: f" madde{m.group(1)} ", s)


def _tokenize(s: str) -> list[str]:
    """Türkçe-doğru küçük harf + alfasayısal token; stopword/boilerplate elenir."""
    norm = _normalize_madde_refs(s)
    return [t for t in _WORD_RE.findall(tr_lower(norm)) if t not in _STOPWORDS]


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
        chunks = chunk_mevzuat(text, subchunk=False)
        madde_var = any(c.metadata.get("madde_no") is not None for c in chunks)
        for chunk in chunks:
            govde = chunk.text.strip()
            if len(govde) < _MIN_CHUNK_CHARS:
                continue
            # Önsöz/künye chunk'ını (madde başlığı YOK) ele — seed yolu ile aynı
            # davranış (retrieval'da "[DOĞRULA:]" gürültüsü üretmesin).
            if madde_var and chunk.metadata.get("madde_no") is None:
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


# BM25 modeli indeks başına BİR kez kurulur (her sorguda yeniden token'lama yok).
# lru_cache kullanılamaz: chunks (dict tuple) hashable değil → id-anahtarlı memo.
# _load_index lru_cached olduğundan aynı tuple objesi döner (id sabit) → güvenli.
_BM25_MEMO: dict[int, Any] = {}


def _bm25_model(chunks: tuple[dict[str, Any], ...]):
    """BM25Okapi'yi indeks için BİR kez kur (id-anahtarlı memo).

    rank_bm25 yoksa/hata → None döner; caller stdlib term-overlap fallback'e geçer.
    """
    anahtar = id(chunks)
    if anahtar in _BM25_MEMO:
        return _BM25_MEMO[anahtar]
    try:
        from rank_bm25 import BM25Okapi

        corpus_tokens = [_tokenize(c["text"]) for c in chunks]
        model = BM25Okapi(corpus_tokens, k1=_BM25_K1, b=_BM25_B)
    except Exception:  # rank_bm25 yok/hata
        model = None
    _BM25_MEMO[anahtar] = model
    return model


# 2005-7 (SDP genelge) ÖNCE (aksi halde \d{3,4} "2005"i yutar), sonra 3-4 hane.
_KANUN_NO_RE = re.compile(r"\b(2005[-/]7)\b|\b(\d{3,4})\b")


def _kanun_nolari(metin: str) -> set[str]:
    """Bir mevzuat etiketi/başlığından kanun numaraları (tür→mevzuat eşleşme anahtarı)."""
    nolar: set[str] = set()
    for m in _KANUN_NO_RE.finditer(metin or ""):
        no = m.group(1) or m.group(2)
        if no:
            nolar.add(no.replace("/", "-"))
    return nolar


def _beklenen_kanun_nolari(turu: str) -> set[str]:
    """config.EVRAK_TO_MEVZUAT'tan türe atanan beklenen kanun numaraları (ön-filtre/boost)."""
    nolar: set[str] = set()
    for baslik in EVRAK_TO_MEVZUAT.get(turu, []):
        nolar |= _kanun_nolari(baslik)
    return nolar


# Tür → beklenen-kanun BOOST katsayısı: doğru kanun chunk'ı top skorla çarpılır
# (ön-filtre yerine ölçekleme → güçlü ham eşleşme hâlâ kazanabilir, dürüstlük).
# Ölçüldü: 1.6 ile CİMER/dilekçe/tebligat doğru maddesi gürültülü 2646 maddesini geçer.
_TUR_BOOST = 1.6


def _score(query: str, chunks: tuple[dict[str, Any], ...]) -> list[tuple[float, dict[str, Any]]]:
    """(score, chunk) azalan sıralı — BM25Okapi (varsa) yoksa term-overlap.

    NOT: tür→mevzuat boost burada UYGULANMAZ (saf BM25). Boost _from_corpus'ta
    eklenir → bu yardımcı (testlerde de) saf retrieval davranışını korur.
    """
    q_tokens = _tokenize(query)
    if not q_tokens or not chunks:
        return []
    bm25 = _bm25_model(chunks)
    if bm25 is not None:
        scores = list(bm25.get_scores(q_tokens))
    else:  # stdlib term-overlap fallback
        q_set = set(q_tokens)
        scores = [
            float(sum(1 for t in _tokenize(c["text"]) if t in q_set)) for c in chunks
        ]
    ranked = sorted(
        ((float(s), chunks[i]) for i, s in enumerate(scores)),
        key=lambda x: -x[0],
    )
    return [r for r in ranked if r[0] > 0]


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
    """Sorgu: (konu+tür+domain-terim) ağırlıklı + metnin ilk bölümü (PII'siz).

    Tür anahtarı (`dilekce`) yerine Türkçe etiketi (`Dilekçe`) kullanılır → korpus
    metnindeki diakritikli terim ("dilekçe") ile eşleşir. Türe ait statik mevzuat
    başlıklarındaki domain terimleri (örn. "Tebligat", "Bilgi Edinme") de eklenir →
    BM25 doğru kanuna yönelir (sorgu-genişletme).
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    turu_key = (state.get("evrak_turu", "") or "").strip()
    turu = EVRAK_TURU_TR.get(turu_key, turu_key)
    domain = " ".join(EVRAK_TO_MEVZUAT.get(turu_key, []))
    boosted = " ".join(f"{konu} {turu} {domain}".split() * _QUERY_BOOST).strip()
    body = (state.get("evrak_text", "") or "")[:_EVRAK_TEXT_CHARS]
    return " ".join(p for p in (boosted, body) if p)


def _from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
    """Korpustan BM25 retrieval önerileri (boş liste → caller statik'e düşer).

    Tür → mevzuat BOOST: config.EVRAK_TO_MEVZUAT'ta türe atanan kanunlara ait chunk'lar
    `_TUR_BOOST` ile ölçeklenir (alaka sinyali). Dedup (aynı mevzuat+madde) + min-skor.

    NOT (CRAG için): `score` max-normalize (top≈1.0); `raw_score` (boost'lu ham BM25)
    da eklenir → CRAG mutlak retrieval kalitesini ölçebilir (additive).
    """
    ranked = _score(query, _load_index())
    if not ranked:
        return []
    beklenen = _beklenen_kanun_nolari(turu) if turu else set()
    boosted = _apply_boost(ranked, beklenen)
    boosted.sort(key=lambda x: -x[0])
    top = _dedup(boosted)[:_TOP_K]
    if not top or top[0][0] < _MIN_RAW_SCORE:
        return []  # zayıf retrieval → config fallback (recall-koruyucu)
    max_score = top[0][0] or 1.0
    return [{
        "baslik": _baslik(chunk),
        "snippet": str(chunk.get("text", ""))[:_SNIPPET_CHARS],
        "score": round(score / max_score, 3),
        "raw_score": round(score, 3),
    } for score, chunk in top]


def _apply_boost(
    ranked: list[tuple[float, dict[str, Any]]], beklenen: set[str]
) -> list[tuple[float, dict[str, Any]]]:
    """Türe atanan kanun chunk'larını `_TUR_BOOST` ile ölçekle (config uyumlu)."""
    if not beklenen:
        return list(ranked)
    out: list[tuple[float, dict[str, Any]]] = []
    for score, chunk in ranked:
        if _kanun_nolari(str(chunk.get("mevzuat", ""))) & beklenen:
            score *= _TUR_BOOST
        out.append((score, chunk))
    return out


def _dedup(
    ranked: list[tuple[float, dict[str, Any]]]
) -> list[tuple[float, dict[str, Any]]]:
    """Aynı (mevzuat, madde_no) çiftini tek öneriye indir (en yüksek skorlu kalır)."""
    gorulen: set[tuple[str, Any]] = set()
    out: list[tuple[float, dict[str, Any]]] = []
    for score, chunk in ranked:
        anahtar = (str(chunk.get("mevzuat", "")), chunk.get("madde_no"))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        out.append((score, chunk))
    return out


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
        oneriler = _from_corpus(query, turu)
    kaynak = "corpus" if oneriler else "config"
    if not oneriler:
        oneriler = _from_config(turu)

    log.info("mevzuat_oner", turu=turu, kaynak=kaynak, n=len(oneriler))
    return {"mevzuat_onerileri": oneriler}


__all__ = ("mevzuat_oner_node",)
