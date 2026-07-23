"""OpenAI TTS (metni sese çevirme) — sohbet asistanının sesli yanıt vermesi için.

DeepSeek'in TTS servisi YOK; bu yüzden OPENAI_API_KEY/OPENAI_BASE_URL (agents/config.py'de
DeepSeek'e işaret eder, core/openai_compat.py'nin paylaşılan anahtarı) BURADA KULLANILMAZ —
bağımsız OPENAI_TTS_API_KEY (her zaman gerçek api.openai.com'a gider, ana LLM sağlayıcısından
etkilenmez). Anahtar yoksa/hata olursa çağıran (api/routes/sohbet.py) sessizce metin-only'e
düşer (established deterministik-fallback deseni — bkz. core/openai_compat.py docstring'i).

ENV:
    OPENAI_TTS_API_KEY=sk-...              (zorunlu — yoksa RuntimeError → çağıran fallback yapar)
    OPENAI_TTS_MODEL=tts-1                 (default; tts-1-hd = daha kaliteli/yavaş/pahalı)
    OPENAI_TTS_VOICE=alloy                 (alloy|echo|fable|onyx|nova|shimmer)
    OPENAI_TTS_BASE_URL=https://api.openai.com/v1  (test/proxy override — normalde değiştirilmez)
"""

from __future__ import annotations

import os

import httpx
import structlog

from core.openai_compat import send_with_retry

log = structlog.get_logger()

_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_SPEECH_PATH = "/audio/speech"

# OpenAI TTS girdi sınırı (karakter) — aşarsa API 400 döner; görünür kırp (sessiz kesme değil).
_MAX_INPUT_CHARS = 4000


def tts_api_key() -> str:
    """OPENAI_TTS_API_KEY (trim'li) — OPENAI_API_KEY'den BAĞIMSIZ (DeepSeek'ten ayrı sağlayıcı)."""
    return os.environ.get("OPENAI_TTS_API_KEY", "").strip()


def tts_enabled() -> bool:
    """OpenAI TTS anahtarı set mi? (auto-routing kararı için)."""
    return bool(tts_api_key())


def _base_url() -> str:
    """TTS her zaman gerçek OpenAI'a gider — OPENAI_BASE_URL (DeepSeek override'ı) buraya SIZMAZ."""
    return os.getenv("OPENAI_TTS_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")


async def tts_openai(
    text: str,
    *,
    timeout_s: float,
    voice: str | None = None,
    model: str | None = None,
) -> bytes:
    """Metni OpenAI TTS ile mp3 sese çevir. Başarısızlıkta exception (çağıran metne düşer).

    Anahtar `.env`'den — ASLA hardcode edilmez.
    """
    api_key = tts_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_TTS_API_KEY yok — sesli yanıt devre dışı")

    metin = text.strip()
    if not metin:
        raise ValueError("tts_openai: boş metin")
    if len(metin) > _MAX_INPUT_CHARS:
        log.warning("tts_openai_kirpildi", uzunluk=len(metin), sinir=_MAX_INPUT_CHARS)
        metin = metin[:_MAX_INPUT_CHARS]

    payload = {
        "model": (model or os.getenv("OPENAI_TTS_MODEL", "tts-1")).strip(),
        "voice": (voice or os.getenv("OPENAI_TTS_VOICE", "alloy")).strip(),
        "input": metin,
        "response_format": "mp3",
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base = _base_url()

    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as client:
        async def _post() -> httpx.Response:
            return await client.post(f"{base}{_SPEECH_PATH}", headers=headers, json=payload)

        resp = await send_with_retry(_post)
        return resp.content


__all__ = ("tts_api_key", "tts_enabled", "tts_openai")
