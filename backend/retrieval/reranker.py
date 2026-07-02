"""BGE-Reranker-v2-m3 wrapper — cross-encoder reranking + DeepSeek listwise rerank.

Hybrid search ilk aşamada top-50 aday getirir (BM25 + dense + RRF).
Reranker bu 50 adayı tek tek query-document score'larıyla değerlendirir,
en alakalı top-5'i döndürür.

Türkçe hukuk için kritik: dense embedder "anlam benzerliği" verir,
cross-encoder gerçek "soru-belge alakası" verir → +%26-31 nDCG.

Model: BAAI/bge-reranker-v2-m3 (568M params, multilingual, ~1.1GB)

Alternatif sağlayıcı (config.RERANK_PROVIDER="deepseek"): model İNDİRMEZ —
BM25 adayları tek llm_json çağrısında listwise sıralanır (dosya sonu bölümü).
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from concurrent.futures import TimeoutError as FuturesTimeout
from dataclasses import dataclass
from functools import cached_property
from typing import Any

import structlog

log = structlog.get_logger()
logger = logging.getLogger(__name__)

RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
RERANKER_DEVICE = os.getenv("RERANKER_DEVICE", "auto").lower()  # auto|cuda|cpu
RERANKER_FP16 = os.getenv("RERANKER_FP16", "true").lower() == "true"
# Cross-encoder relevance alt eşiği (sigmoid 0-1). Bu skorun altındaki adaylar
# elenir → alakasız emsal/mevzuat LLM'e ve verify'a GÜRÜLTÜ olarak gitmesin
# (kapsam-dışı soruda zorlama "emsal" döndürmek yerine boş → reject, CLAUDE.md §1
# belirsizlik kuralı). Default 0.0 = KAPALI (baseline davranış birebir korunur);
# production'da örn. 0.3 ile açılır.
RERANK_SCORE_MIN = float(os.getenv("RERANK_SCORE_MIN", "0.0"))

# Cross-encoder input token TAVANI. KRİTİK PERF: BGE-reranker-v2-m3 varsayılan
# max_length 8192 token. Mevzuat corpus'unda bazı chunk'lar devasa (ölçüldü:
# 48.000 / 27.000 karakter ≈ 16K+ token — chunking artefaktı). Truncation
# olmadan cross-encoder bu dev metinleri 8192 token'a kesip O(8192²) attention
# ile CPU'da işliyor → tek mevzuat rerank'ı 665s sürüyordu (emsal 29s). 512 token
# rerank için standart + yeterli (alaka ilk pasajda belli olur); O(8192²)→O(512²)
# ~256× daha az hesap. Quality-nötr: dev chunk zaten chunking hatası, ilk 512
# token alaka sinyalini taşır. Uzun chunk'lar gerekirse RERANK_MAX_LENGTH artır.
RERANK_MAX_LENGTH = int(os.getenv("RERANK_MAX_LENGTH", "512"))


@dataclass(slots=True)
class RerankResult:
    """Reranked sonuç — orijinal payload + relevance score."""

    chunk_id: str
    score: float  # Cross-encoder relevance (0-1 sigmoid)
    text: str
    source: str
    source_url: str
    domain: str
    metadata: dict
    original_score: float  # Hybrid search'ten gelen RRF skoru


class Reranker:
    """BGE-Reranker-v2-m3 — lazy load, fp16 GPU, fallback CPU."""

    def __init__(
        self,
        model_name: str = RERANKER_MODEL,
        use_fp16: bool = RERANKER_FP16,
        device: str = RERANKER_DEVICE,
    ) -> None:
        self.model_name = model_name
        self.use_fp16 = use_fp16
        self.device = device

    @cached_property
    def _model(self):  # type: ignore[no-untyped-def]
        from sentence_transformers import CrossEncoder

        resolved = self.device
        if resolved == "auto":
            try:
                import torch
                resolved = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                resolved = "cpu"

        # CPU'da fp16 anlamsız + bazen NaN'e neden olur
        use_fp16 = self.use_fp16 and resolved != "cpu"

        logger.info(
            "reranker_loading model=%s fp16=%s device=%s (ilk seferde ~1.1 GB iner)",
            self.model_name, use_fp16, resolved,
        )
        # CrossEncoder daha stabil — FlagReranker tokenizer bug yok
        # max_length: dev chunk'ları kesip O(n²) attention patlamasını önler
        # (bkz. RERANK_MAX_LENGTH — mevzuat rerank 665s→saniyeler).
        return CrossEncoder(
            self.model_name,
            max_length=RERANK_MAX_LENGTH,
            device=resolved,
            automodel_args={"torch_dtype": "float16"} if use_fp16 else {},
            trust_remote_code=False,
        )

    def rerank(
        self,
        query: str,
        candidates: list[dict],
        top_k: int = 5,
    ) -> list[RerankResult]:
        """Top-N adayı cross-encoder ile yeniden sırala, top-K döndür.

        Args:
            query: Kullanıcı sorusu.
            candidates: hybrid_search.search() sonucu — SearchResult listesi
                veya dict listesi (text, chunk_id, vb. payload).
            top_k: Sonuç sayısı.
        """
        if not candidates:
            return []

        # CrossEncoder input: (query, document) tuple listesi
        pairs = [(query, _get_text(c)) for c in candidates]
        scores = self._model.predict(pairs, convert_to_numpy=True)

        # Skorları aday'larla eşle, sırala
        scored = list(zip(candidates, scores.tolist(), strict=False))
        scored.sort(key=lambda x: x[1], reverse=True)

        # Alaka eşiği (opt-in): eşik altı adayları ele. Hepsi elenirse [] döner
        # → çağıran (emsal/mevzuat) "kaynak yok" yolundan reject'e gider.
        if RERANK_SCORE_MIN > 0.0:
            scored = [(c, s) for c, s in scored if s >= RERANK_SCORE_MIN]

        return [_to_result(cand, score) for cand, score in scored[:top_k]]


def _get_text(candidate) -> str:  # type: ignore[no-untyped-def]
    """SearchResult dataclass veya dict — text field'ını al."""
    if hasattr(candidate, "text"):
        return candidate.text
    return candidate.get("text", "")


def _to_result(candidate, score: float) -> RerankResult:  # type: ignore[no-untyped-def]
    """SearchResult veya dict → RerankResult."""
    if hasattr(candidate, "chunk_id"):
        return RerankResult(
            chunk_id=candidate.chunk_id,
            score=float(score),
            text=candidate.text,
            source=candidate.source,
            source_url=candidate.source_url,
            domain=candidate.domain,
            metadata=candidate.metadata,
            original_score=candidate.score,
        )
    return RerankResult(
        chunk_id=candidate.get("chunk_id", ""),
        score=float(score),
        text=candidate.get("text", ""),
        source=candidate.get("source", ""),
        source_url=candidate.get("source_url", ""),
        domain=candidate.get("domain", ""),
        metadata={k: v for k, v in candidate.items() if k not in {"text", "chunk_id", "source", "source_url", "domain"}},
        original_score=float(candidate.get("score", 0.0)),
    )


_reranker_singleton: Reranker | None = None


def get_reranker() -> Reranker:
    """Lazy singleton — FastAPI/agent kodlarında doğrudan kullan."""
    global _reranker_singleton
    if _reranker_singleton is None:
        _reranker_singleton = Reranker()
    return _reranker_singleton


# ---------------------------------------------------------------------------
# DeepSeek listwise rerank (config.RERANK_PROVIDER="deepseek") — model İNDİRMEZ.
# Cross-encoder her adayı TEK TEK skorlar; listwise ise TÜM aday listesini bir
# çağrıda görür ve karşılaştırmalı sıralar → {"sira": [aday numaraları]}.
# KAPALI KÜME (CLAUDE.md güvensizlik ilkesi): dönen numaralar aday kümesinin
# alt kümesi olmalı; ihlal/boş/bozuk çıktı → None → çağıran BM25 sırasını AYNEN
# korur (deterministik fallback sözleşmesi — mock/CI bu yola hiç girmez).
# ---------------------------------------------------------------------------

_LISTWISE_SYSTEM = (
    "Sen kamu evrak yönetim sisteminde mevzuat alaka sıralayıcısısın. Sana bir "
    "evrak konusu/sorgusu ve numaralı mevzuat maddesi adayları verilir. Adayları "
    "evrak konusuna göre EN ALAKALIDAN en aza sırala; konuyla ilgisi olmayan "
    "adayları listeye alma (eleme serbest). YALNIZ şu JSON nesnesini döndür: "
    '{"sira": [aday numaraları]}. Numaralar verilen adaylardan olmalı; açıklama '
    "ekleme, yeni numara uydurma."
)
# Prompt bütçesi: 30 aday × ~220 karakter ≈ 6.6K karakter — tek ucuz çağrı.
_LISTWISE_SNIPPET_CHARS = 200
_LISTWISE_QUERY_CHARS = 600
_LISTWISE_MAX_TOKENS = 160  # yalnız numara listesi döner — küçük tavan yeterli
_LISTWISE_TIMEOUT_PAY_S = 5.0  # llm_json kendi timeout'unu yönetir; bu dış emniyet payı

# _maybe_rerank SENKRON zincirde (crag de paylaşır) çalışır ama llm_json async.
# Her çağrıda asyncio.run ile YENİ loop açmak httpx bağlantı havuzundaki keep-alive
# bağlantıları kapanmış loop'lara bağlardı (2. çağrıdan itibaren RuntimeError).
# Tek KALICI arka-plan loop tüm listwise çağrılarını aynı loop'ta tutar.
_listwise_loop: asyncio.AbstractEventLoop | None = None
_listwise_kilit = threading.Lock()


def _kalici_loop() -> asyncio.AbstractEventLoop:
    """Listwise LLM çağrıları için kalıcı arka-plan event loop (daemon thread)."""
    global _listwise_loop
    with _listwise_kilit:
        if _listwise_loop is None or _listwise_loop.is_closed():
            loop = asyncio.new_event_loop()
            threading.Thread(
                target=loop.run_forever, name="deepseek-listwise-loop", daemon=True,
            ).start()
            _listwise_loop = loop
    return _listwise_loop


def _sira_dogrula(obj: Any, n_aday: int) -> list[int] | None:
    """LLM 'sira' çıktısını KAPALI KÜMEYE karşı doğrula → 0-tabanlı indeks listesi.

    LLM çıktısına körü körüne güvenilmez: dict/liste değil, boş, sayı olmayan öğe
    veya aday aralığı (1..N) dışında numara → None (çağıran BM25 sırasını korur).
    Tekrar eden numara teke indirilir (alt-küme özelliği bozulmaz).
    """
    if not isinstance(obj, dict) or not isinstance(obj.get("sira"), list):
        return None
    indeksler: list[int] = []
    gorulen: set[int] = set()
    for ham in obj["sira"]:
        # bool, int'in alt tipi — True/False'u numara saymak sessiz hata olurdu.
        if isinstance(ham, bool) or not isinstance(ham, (int, str)):
            return None
        try:
            no = int(ham)
        except ValueError:
            return None
        if not 1 <= no <= n_aday:
            return None  # kapalı-küme ihlali → çıktının tamamı reddedilir
        if no in gorulen:
            continue
        gorulen.add(no)
        indeksler.append(no - 1)
    return indeksler or None


async def _listwise_sira_iste(query: str, adaylar: list[dict]) -> list[int] | None:
    """Numaralı aday listesini DeepSeek'e ver → doğrulanmış 0-tabanlı sıra (veya None)."""
    # Lazy import: agents bağımlılığı yalnız bu yolda (retrieval paketi hafif kalır).
    from agents.nodes._llm_extract import llm_json

    satirlar = []
    for i, aday in enumerate(adaylar, start=1):
        baslik = " ".join(str(aday.get("baslik", "")).split())
        snippet = " ".join(str(aday.get("snippet", "")).split())[:_LISTWISE_SNIPPET_CHARS]
        satirlar.append(f"{i}. {baslik} — {snippet}")
    user = (
        f"Evrak konusu/sorgusu:\n{query[:_LISTWISE_QUERY_CHARS]}\n\n"
        "Mevzuat adayları:\n" + "\n".join(satirlar)
    )
    obj = await llm_json(
        _LISTWISE_SYSTEM, user, max_tokens=_LISTWISE_MAX_TOKENS, temperature=0.0,
    )
    return _sira_dogrula(obj, len(adaylar))


def deepseek_listwise_sirala(
    query: str,
    adaylar: list[dict],
    *,
    timeout_s: float | None = None,
) -> list[int] | None:
    """DeepSeek listwise rerank — adayların YENİ sırası (0-tabanlı indeks) veya None.

    adaylar: {"baslik": str, "snippet": str} dict'leri (numara otomatik 1..N verilir).
    None = rerank uygulanamadı (mock/anahtarsız LLM, timeout, kapalı-küme ihlali,
    boş/bozuk çıktı) → çağıran BM25 sırasını AYNEN korur. Alt-küme dönebilir
    (alakasız adaylar elenmiş olabilir). Skor ÜRETMEZ — skorlar çağıranda korunur.
    """
    if not adaylar:
        return None
    from agents.nodes._llm_extract import LLM_NODE_TIMEOUT_S, real_llm

    if real_llm() is None:
        return None  # mock modda rerank HİÇ denenmez (CI/test deterministik kalır)
    beklet = (timeout_s if timeout_s is not None else LLM_NODE_TIMEOUT_S) + _LISTWISE_TIMEOUT_PAY_S
    gelecek = asyncio.run_coroutine_threadsafe(
        _listwise_sira_iste(query, adaylar), _kalici_loop(),
    )
    try:
        return gelecek.result(timeout=beklet)
    except FuturesTimeout:
        gelecek.cancel()
        log.warning("reranker.deepseek_listwise_timeout", timeout_s=beklet)
        return None
