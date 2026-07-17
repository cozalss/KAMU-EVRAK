"""Teşkilat korpusunda birim araması — kaynak-doğrulamalı yönlendirmenin arama primitifi.

`birim_ara` aracının offline backend'i (bkz. OfficialSourceSearch, arac_cekirdek). BM25
çekirdeği mevzuat_oner deseninden ADAPT (rank_bm25 + stdlib term-overlap fallback; mock/CI'da
çalışır, ağ yok). Kurum-slug filtreli; kuruma-özel dizin yoksa kurum TİPİNE göre jenerik
şablona düşer (aday/sorgu genişletme — doğrulanmış hedef DEĞİL).

Çıktı `KaynakKaydi` uyumlu dict listesi; her aday `kaynak_tipi` taşır:
  - "kurum_ozel": kuruma-özel resmî kaynak → grounding'de doğrulanmış hedef olabilir.
  - "jenerik": kurum-tipi şablon → yalnız aday; tek başına otomatik yönlendirme yapılmaz.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog

from core.text import tr_lower

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[3]
_INDEX_FILE = _ROOT / "data" / "teskilat" / "teskilat_index.json"
_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")
_BM25_K1 = 1.5
_BM25_B = 0.3
_TOP_K = 5

# Kurum tipi → jenerik şablon slug'ı (kuruma-özel dizin yoksa aday kaynağı).
_TIP_JENERIK: dict[str, str] = {
    "belediye": "_genel-belediye",
    "il_ozel_idare": "_genel-belediye",
    "valilik": "_genel-il-mudurlukleri",
    "kaymakamlik": "_genel-il-mudurlukleri",
    "bakanlik": "_genel-il-mudurlukleri",
    "defterdarlik": "_genel-il-mudurlukleri",
    "universite": "_genel-universite",
    "bassavcilik": "_genel-adliye",
}
# tur bilinmiyorsa denenecek jenerik şablonlar (aday havuzu).
_JENERIK_HEPSI = ("_genel-belediye", "_genel-il-mudurlukleri")

_STOPWORDS: frozenset[str] = frozenset({
    "ve", "veya", "ile", "ya", "da", "de", "ki", "bu", "şu", "o", "bir", "için",
    "gibi", "kadar", "göre", "ise", "ancak", "ayrıca", "her", "hem", "en",
    "arz", "ederim", "rica", "ederiz", "gereğini", "gereği", "bilgilerinize",
    "konusunda", "hakkında", "ilgili", "talep", "konu", "sayın", "müdürlüğü",
    "müdürlük", "başkanlığı", "belediye", "belediyesi",
})


def _tokenize(s: str) -> list[str]:
    return [t for t in _WORD_RE.findall(tr_lower(s)) if t not in _STOPWORDS]


@lru_cache(maxsize=1)
def _load_payload() -> dict[str, Any]:
    """teskilat_index.json ham payload (seed_teskilat.py üretir). Yoksa boş dict."""
    if _INDEX_FILE.is_file():
        try:
            return json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("teskilat_ara.index_read_failed", hata=str(exc))
    return {}


@lru_cache(maxsize=1)
def _load_index() -> tuple[dict[str, Any], ...]:
    """Index chunk listesi."""
    return tuple(_load_payload().get("chunks") or ())


@lru_cache(maxsize=1)
def _aliases() -> dict[str, str]:
    """@ALIAS haritası: alias-slug → kanonik kurum-slug (ör. uedas → uludag-elektrik-dagitim)."""
    return dict(_load_payload().get("aliases") or {})


@lru_cache(maxsize=256)
def _kanonik_slug(kurum_slug: str) -> str:
    """Slug'ı korpustaki kanonik kurum dizinine çözümle; çözülemezse "".

    Sıra: (1) birebir dizin, (2) @ALIAS haritası, (3) İL-ADI-KIRPMA — "ankara-sosyal-guvenlik-
    il-mudurlugu" → baştan 1-2 token at, kalan için (1)+(2) tekrar dene. Böylece her ildeki
    aynı-tip taşra birimi ("X Sosyal Güvenlik İl Müdürlüğü") tek ulusal kurum kaydına düşer.
    """
    slug = (kurum_slug or "").strip()
    if not slug or slug.startswith("_"):
        return ""
    # GÜVENLİK (REVİZYON 2): "_"-önekli jenerik şablonlar KANONİK hedef OLAMAZ — alias bir
    # jenerik şablona işaret etse bile kurum-özel çözümleme reddedilir (jenerik yol ayrı;
    # aksi halde şablon adayları kurum_ozel görünüp üçlü grounding'i yanıltır).
    mevcut = {c.get("kurum_slug") for c in _load_index()
              if not str(c.get("kurum_slug", "")).startswith("_")}
    aliases = _aliases()
    adaylar = [slug]
    parcalar = slug.split("-")
    if len(parcalar) > 2:
        adaylar.append("-".join(parcalar[1:]))   # il adı kırp (tek token)
    if len(parcalar) > 3:
        adaylar.append("-".join(parcalar[2:]))   # iki token (ör. "afyon-karahisar-...")
    for aday in adaylar:
        if aday in mevcut:
            return aday
        hedef = aliases.get(aday, "")
        if hedef and not hedef.startswith("_") and hedef in mevcut:
            return hedef
    return ""


@lru_cache(maxsize=64)
def _slug_chunks(kurum_slug: str) -> tuple[dict[str, Any], ...]:
    """Bir kurum slug'ına ait chunk'lar (lru_cache — BM25 memo için sabit tuple id)."""
    return tuple(c for c in _load_index() if c.get("kurum_slug") == kurum_slug)


# BM25 modeli chunk-tuple başına bir kez kurulur (id-anahtarlı memo; _slug_chunks lru_cached).
_BM25_MEMO: dict[int, Any] = {}


def _bm25_model(chunks: tuple[dict[str, Any], ...]) -> Any:
    """BM25Okapi kur (memo). rank_bm25 yok/hata → None (stdlib term-overlap fallback)."""
    anahtar = id(chunks)
    if anahtar in _BM25_MEMO:
        return _BM25_MEMO[anahtar]
    model: Any = None
    try:
        from rank_bm25 import BM25Okapi

        corpus_tokens = [_tokenize(c["text"]) for c in chunks]
        model = BM25Okapi(corpus_tokens, k1=_BM25_K1, b=_BM25_B)
    except Exception as exc:  # rank_bm25 yok/hata → term-overlap fallback
        log.warning("teskilat_ara.bm25_unavailable_fallback", hata=str(exc))
        model = None
    _BM25_MEMO[anahtar] = model
    return model


def _score(konu: str, chunks: tuple[dict[str, Any], ...]) -> list[tuple[float, dict[str, Any]]]:
    """(skor, chunk) azalan — BM25Okapi (varsa) yoksa term-overlap. Skoru 0 olanlar elenir."""
    q = _tokenize(konu)
    if not q or not chunks:
        return []
    bm25 = _bm25_model(chunks)
    if bm25 is not None:
        skorlar = list(bm25.get_scores(q))
    else:
        q_set = set(q)
        skorlar = [float(sum(1 for t in _tokenize(c["text"]) if t in q_set)) for c in chunks]
    sirali = sorted(((float(s), chunks[i]) for i, s in enumerate(skorlar)), key=lambda x: -x[0])
    return [r for r in sirali if r[0] > 0]


def _aday(chunk: dict[str, Any], skor: float, kaynak_tipi: str) -> dict[str, Any]:
    """Chunk → KaynakKaydi-uyumlu aday dict (icerik_hash + kaynak_tipi eklenir)."""
    import hashlib

    metin = chunk.get("text", "")
    return {
        "birim_ad": chunk.get("birim_ad", ""),
        "gorev": chunk.get("gorev", ""),
        "kaynak_kurum": chunk.get("kurum_ad", ""),
        "kurum_slug": chunk.get("kurum_slug", ""),
        "belge_basligi": chunk.get("belge_basligi", ""),
        "url_veya_belge_kimligi": chunk.get("kaynak_kimlik", ""),
        "erisim_tarihi": chunk.get("erisim", ""),
        "metin_parcasi": metin[:400],
        "icerik_hash": hashlib.sha256(metin.encode("utf-8")).hexdigest()[:16],
        "skor": round(skor, 3),
        "kaynak_tipi": kaynak_tipi,
    }


def teskilat_birim_ara(
    kurum_slug: str,
    konu: str,
    *,
    tur: str = "",
    top_k: int = _TOP_K,
) -> list[dict[str, Any]]:
    """Kurumun teşkilatında konuya en uygun birimleri ara (offline BM25).

    Önce kuruma-özel dizin (kaynak_tipi='kurum_ozel'); yoksa/boşsa kurum TİPİNE göre jenerik
    şablon (kaynak_tipi='jenerik'). Jenerik sonuçlar YALNIZ adaydır — route ajanı bunları
    tek başına doğrulanmış hedef saymaz (REVİZYON 2). Boş konu/korpus → boş liste.
    """
    kurum_slug = (kurum_slug or "").strip()
    # 1) Kuruma-özel kaynak — alias + il-adı-kırpma çözümlemesiyle (uedas, ankara-sgk-... vb.)
    kanonik = _kanonik_slug(kurum_slug)
    if kanonik:
        ozel = _slug_chunks(kanonik)
        if ozel:
            aday = [_aday(c, s, "kurum_ozel") for s, c in _score(konu, ozel)[:top_k]]
            if aday:
                return aday
    # 2) Kurum tipine göre jenerik şablon(lar) — yalnız aday
    jenerik_sluglar = ([_TIP_JENERIK[tur]] if tur in _TIP_JENERIK else list(_JENERIK_HEPSI))
    havuz: list[tuple[float, dict[str, Any]]] = []
    for js in jenerik_sluglar:
        havuz.extend(_score(konu, _slug_chunks(js)))
    havuz.sort(key=lambda x: -x[0])
    return [_aday(c, s, "jenerik") for s, c in havuz[:top_k]]


def kurum_korpusta_var(kurum_slug: str) -> bool:
    """Kuruma-özel resmî kaynak korpusta var mı (alias/il-kırpma çözümlemesi dahil)?"""
    return bool(_kanonik_slug(kurum_slug or ""))


__all__ = ("kurum_korpusta_var", "teskilat_birim_ara")
