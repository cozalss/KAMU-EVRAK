"""Görev-1 node'ları için paylaşılan LLM yardımcıları — JSON çağrısı + tolerant parse.

Strateji (CLAUDE.md v2.3 + multi_query.py deseni): `get_llm()` ile gerçek LLM
(LLM_MODE=openai/llamacpp), JSON-mode çıktı; LLM yok/mock/hata/timeout → çağıran
deterministik keyword+regex fallback'e düşer. Bu modül YALNIZ "LLM'i çağır + güvenli
JSON parse" sorumluluğunu taşır; her node kendi prompt'unu + fallback'ini sağlar.
Güçlendirme (2026-07): bozuk JSON'da geri-bildirimli TEK retry (config.LLM_JSON_RETRY)
+ süreç-içi LRU yanıt cache'i (config.LLM_CACHE_ENABLED) — ikisi de mock'ta devre dışı,
fallback sözleşmesi birebir korunur.

MockLLM json_mode'da {"domain": ..., "confidence": ..., "reasoning": ...} döndürür
(llm_mock._mock_json_response default'u) — node'lar bu şemayı tanımadığında fallback'e
düşer, böylece anahtarsız demo deterministik kalır.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import os
import re
from collections import OrderedDict
from typing import Any

import httpx
import structlog

from agents import config
from agents.llm import ChatMessage, MockLLM, get_llm

log = structlog.get_logger()

# LLM çağrısı bütçesi — node başına; aşılırsa fallback (demo asla asılı kalmaz).
LLM_NODE_TIMEOUT_S = float(os.getenv("EVRAK_LLM_TIMEOUT_S", "20.0"))

# multi_query.py deseni: yalnız geçici/altyapı hatalarında fallback; gerçek
# bug'lar (TypeError vb.) yutulmaz, CancelledError propagate eder.
_LLM_FALLBACK_EXCEPTIONS = (
    asyncio.TimeoutError,
    httpx.HTTPError,
    ConnectionError,
    ValueError,        # boş choices / parse-öncesi LLM hataları
    RuntimeError,      # anahtarsız openai → require_api_key, SSE sınırı vb.
)

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def parse_json_object(raw: str) -> dict[str, Any] | None:
    """LLM çıktısından ilk JSON nesnesini tolerant şekilde çıkar (markdown fence + gömülü {}).

    Geçersiz/boş → None (çağıran fallback'e düşer). multi_query._parse_json_paraphrases
    deseniyle tutarlı, ama generic nesne döndürür (paraphrase listesine bağlı değil).
    """
    if not raw:
        return None
    cleaned = _JSON_FENCE_RE.sub("", raw).strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        first, last = cleaned.find("{"), cleaned.rfind("}")
        if first == -1 or last <= first:
            return None
        try:
            obj = json.loads(cleaned[first : last + 1])
        except json.JSONDecodeError:
            return None
    return obj if isinstance(obj, dict) else None


# --- Süreç-içi LRU yanıt cache'i (config.LLM_CACHE_ENABLED) -------------------
# Neden: demo'da aynı örneğe ikinci tıklama ağ turu ödemesin (temp-0 çağrılar
# deterministik — yeniden sormak bilgi katmaz). Anahtar sha256(tür+model+system+
# user+max_tokens); 'tür' (json|text) aynı prompt'un JSON ve serbest-metin
# sonuçlarının birbirine karışmasını önler. Mock modda devre dışı (mock zaten
# anlık + mevcut çağrı-sayısı davranışı birebir korunur).
_yanit_cache: OrderedDict[str, Any] = OrderedDict()


def _model_kimligi(llm: Any) -> str:
    """Cache anahtarı için model kimliği — client tipine göre en spesifik alan."""
    for alan in ("model", "model_name", "model_path"):
        deger = getattr(llm, alan, None)
        if deger:
            return str(deger)
    return type(llm).__name__


def _cache_anahtari(tur: str, llm: Any, system: str, user: str, max_tokens: int) -> str:
    h = hashlib.sha256()
    for parca in (tur, _model_kimligi(llm), system, user, str(max_tokens)):
        h.update(parca.encode("utf-8"))
        h.update(b"\x1f")  # alan ayracı — birleştirme çakışmalarını önler
    return h.hexdigest()


def _cache_al(anahtar: str) -> Any | None:
    deger = _yanit_cache.get(anahtar)
    if deger is not None:
        _yanit_cache.move_to_end(anahtar)  # LRU: isabet girdiyi tazeler
    return deger


def _cache_koy(anahtar: str, deger: Any) -> None:
    _yanit_cache[anahtar] = deger
    _yanit_cache.move_to_end(anahtar)
    kapasite = max(1, int(config.LLM_CACHE_BOYUT))
    while len(_yanit_cache) > kapasite:
        _yanit_cache.popitem(last=False)  # en eski tahliye


def cache_temizle() -> None:
    """Yanıt cache'ini boşalt — test izolasyonu + model/ENV değişiminde tazeleme."""
    _yanit_cache.clear()


async def _chat_dene(
    llm: Any,
    messages: list[ChatMessage],
    *,
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    json_mode: bool,
) -> str | None:
    """Tek LLM çağrısı — geçici/altyapı hatası → None (çağıran fallback'e düşer)."""
    try:
        resp = await asyncio.wait_for(
            llm.chat(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=json_mode,
            ),
            timeout=timeout_s,
        )
    except _LLM_FALLBACK_EXCEPTIONS as exc:
        log.warning("evrak_llm_failed_fallback", error=str(exc) or type(exc).__name__,
                    exc_type=type(exc).__name__)
        return None
    return resp.content


# Retry düzeltme mesajı — önceki ham cevapla birlikte gönderilir (geri-bildirimli).
_RETRY_DUZELTME = (
    "Önceki cevabın geçerli JSON değildi. YALNIZ istenen şemadaki geçerli JSON "
    "nesnesini döndür; açıklama, markdown veya ek metin yazma."
)


async def llm_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 512,
    temperature: float = 0.0,
    timeout_s: float = LLM_NODE_TIMEOUT_S,
) -> dict[str, Any] | None:
    """LLM'i JSON-mode'da çağır, tolerant parse et. Hata/timeout/parse-fail → None
    (çağıran node deterministik fallback'ine düşer — anahtarsız demo çalışır).

    Bozuk JSON'da geri-bildirimli TEK retry (config.LLM_JSON_RETRY); başarılı sonuç
    LRU cache'e yazılır (config.LLM_CACHE_ENABLED). Mock'ta ikisi de devre dışı —
    mock deterministiktir: retry aynı cevabı verir, cache çağrı sayısını değiştirirdi.
    """
    llm = get_llm()
    mock = isinstance(llm, MockLLM)
    anahtar = (
        _cache_anahtari("json", llm, system, user, max_tokens)
        if config.LLM_CACHE_ENABLED and not mock else None
    )
    if anahtar is not None:
        onbellek = _cache_al(anahtar)
        if onbellek is not None:
            return copy.deepcopy(onbellek)  # kopya — çağıran mutasyonu cache'i kirletmesin
    messages = [
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=user),
    ]
    raw = await _chat_dene(llm, messages, max_tokens=max_tokens,
                           temperature=temperature, timeout_s=timeout_s, json_mode=True)
    if raw is None:
        return None
    obj = parse_json_object(raw)
    if obj is None and config.LLM_JSON_RETRY and not mock:
        retry_msgs = [
            *messages,
            ChatMessage(role="assistant", content=raw),
            ChatMessage(role="user", content=_RETRY_DUZELTME),
        ]
        raw2 = await _chat_dene(llm, retry_msgs, max_tokens=max_tokens,
                                temperature=temperature, timeout_s=timeout_s, json_mode=True)
        obj = parse_json_object(raw2) if raw2 is not None else None
    if obj is None:
        log.debug("evrak_llm_json_parse_empty", raw=(raw or "")[:160])
        return None
    if anahtar is not None:
        _cache_koy(anahtar, copy.deepcopy(obj))  # kopya sakla — dönen nesne serbest
    return obj


def real_llm() -> Any | None:
    """GERÇEK LLM client (DeepSeek/yerel); MockLLM veya yoksa None.

    None dönerse node deterministik mantığını kullanır. Özellikle serbest-metin
    node'larında (finalize) MockLLM jenerik metin döndürür ve anahtarsız/mock demoyu
    bozardı — bu yüzden mock modda LLM yolu HİÇ açılmaz (testler deterministik kalır).
    """
    llm = get_llm()
    return None if isinstance(llm, MockLLM) else llm


async def llm_text(
    system: str,
    user: str,
    *,
    max_tokens: int = 420,
    temperature: float = 0.2,
    timeout_s: float = LLM_NODE_TIMEOUT_S,
) -> str | None:
    """LLM'i SERBEST METİN modunda çağır (JSON değil). Mock/hata/timeout/boş → None.

    None dönerse çağıran node kendi deterministik metnine düşer (demo asla bozulmaz).
    llm_json'ın metin-üreten ikizi (DRY: route/finalize gibi prose node'ları paylaşır).
    """
    llm = real_llm()
    if llm is None:
        return None
    anahtar = (
        _cache_anahtari("text", llm, system, user, max_tokens)
        if config.LLM_CACHE_ENABLED else None
    )
    if anahtar is not None:
        onbellek = _cache_al(anahtar)
        if onbellek is not None:
            return onbellek  # str immutable — kopya gerekmez
    raw = await _chat_dene(
        llm,
        [ChatMessage(role="system", content=system), ChatMessage(role="user", content=user)],
        max_tokens=max_tokens, temperature=temperature, timeout_s=timeout_s, json_mode=False,
    )
    if raw is None:
        return None
    txt = raw.strip()
    if not txt:
        return None
    if anahtar is not None:
        _cache_koy(anahtar, txt)
    return txt


__all__ = ("LLM_NODE_TIMEOUT_S", "cache_temizle", "llm_json", "llm_text",
           "parse_json_object", "real_llm")
