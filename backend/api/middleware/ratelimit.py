"""IP-başı hız sınırı — slowapi varsa aktif, yoksa zarif şekilde devre dışı.

KURAL: Uygulama, slowapi KURULU OLMASA DA boot etmeli (opsiyonel bağımlılık —
global Python / CI kırılmasın). Bu modül slowapi'yi try/except ile yükler:
  - Yüklenirse: gerçek `Limiter` + IP-başı limit + 429 exception handler.
  - Yüklenemezse: `rate_limit()` no-op geçiş dekoratörü; `setup_rate_limiting()` boş.

Kullanım (route'ta):
    from api.middleware.ratelimit import rate_limit
    @router.post("/ocr")
    @rate_limit("30/minute")           # slowapi yoksa etkisiz
    async def ocr_upload(request: Request, ...): ...

Kullanım (main.py):
    from api.middleware.ratelimit import setup_rate_limiting
    setup_rate_limiting(app)
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

import structlog

log = structlog.get_logger()

# slowapi opsiyonel — yoksa app yine boot etmeli.
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    _SLOWAPI_AVAILABLE = True
except ImportError:  # slowapi kurulu değil → zarif devre dışı
    _SLOWAPI_AVAILABLE = False


def _is_available() -> bool:
    return _SLOWAPI_AVAILABLE


# Tek paylaşılan Limiter (slowapi varsa). Limit'leri ortam değişkeniyle kapatılabilir kıl.
_RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in ("0", "false", "no")

_limiter: Any = None
if _SLOWAPI_AVAILABLE:
    _limiter = Limiter(key_func=get_remote_address, enabled=_RATE_LIMIT_ENABLED)


def rate_limit(spec: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """IP-başı hız sınırı dekoratörü.

    slowapi varsa `limiter.limit(spec)` döner (endpoint `request: Request` almalı);
    yoksa fonksiyonu olduğu gibi döndüren no-op geçiş dekoratörü.
    """
    if _SLOWAPI_AVAILABLE and _limiter is not None:
        return _limiter.limit(spec)

    def _noop(func: Callable[..., Any]) -> Callable[..., Any]:
        return func

    return _noop


def setup_rate_limiting(app: Any) -> bool:
    """Uygulamaya limiter state + 429 exception handler bağlar.

    slowapi yoksa hiçbir şey yapmaz (False döner) → boot kırılmaz.
    """
    if not (_SLOWAPI_AVAILABLE and _limiter is not None):
        log.info("rate_limit_disabled", reason="slowapi_not_installed")
        return False
    app.state.limiter = _limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    log.info("rate_limit_enabled", enabled=_RATE_LIMIT_ENABLED)
    return True


__all__ = ("rate_limit", "setup_rate_limiting")
