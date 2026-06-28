"""Görev-1 node'ları için paylaşılan LLM yardımcıları — JSON çağrısı + tolerant parse.

Strateji (CLAUDE.md v2.3 + multi_query.py deseni): `get_llm()` ile gerçek LLM
(LLM_MODE=openai/llamacpp), JSON-mode çıktı; LLM yok/mock/hata/timeout → çağıran
deterministik keyword+regex fallback'e düşer. Bu modül YALNIZ "LLM'i çağır + güvenli
JSON parse" sorumluluğunu taşır; her node kendi prompt'unu + fallback'ini sağlar.

MockLLM json_mode'da {"domain": ..., "confidence": ..., "reasoning": ...} döndürür
(llm_mock._mock_json_response default'u) — node'lar bu şemayı tanımadığında fallback'e
düşer, böylece anahtarsız demo deterministik kalır.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx
import structlog

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


async def llm_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 512,
    temperature: float = 0.0,
    timeout_s: float = LLM_NODE_TIMEOUT_S,
) -> dict[str, Any] | None:
    """LLM'i JSON-mode'da çağır, tolerant parse et. Hata/timeout/parse-fail → None.

    None dönerse çağıran node deterministik fallback'ini kullanır (anahtarsız demo
    çalışır). Saf I/O sınır fonksiyonu — node mantığı içermez (DRY: 4 node paylaşır).
    """
    llm = get_llm()
    try:
        resp = await asyncio.wait_for(
            llm.chat(
                messages=[
                    ChatMessage(role="system", content=system),
                    ChatMessage(role="user", content=user),
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=True,
            ),
            timeout=timeout_s,
        )
    except _LLM_FALLBACK_EXCEPTIONS as exc:
        log.warning("evrak_llm_failed_fallback", error=str(exc) or type(exc).__name__,
                    exc_type=type(exc).__name__)
        return None
    obj = parse_json_object(resp.content)
    if obj is None:
        log.debug("evrak_llm_json_parse_empty", raw=(resp.content or "")[:160])
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
    try:
        resp = await asyncio.wait_for(
            llm.chat(
                messages=[
                    ChatMessage(role="system", content=system),
                    ChatMessage(role="user", content=user),
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            timeout=timeout_s,
        )
    except _LLM_FALLBACK_EXCEPTIONS as exc:
        log.warning("evrak_llm_failed_fallback", error=str(exc) or type(exc).__name__,
                    exc_type=type(exc).__name__)
        return None
    txt = (resp.content or "").strip()
    return txt or None


__all__ = ("LLM_NODE_TIMEOUT_S", "llm_json", "llm_text", "parse_json_object", "real_llm")
