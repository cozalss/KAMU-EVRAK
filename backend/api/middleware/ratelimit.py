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


def istemci_anahtari(request: Any) -> str:
    """Hız sınırı kovası anahtarı — `api/demo_kimlik.istemci_ip` ile AYNI türetme.

    ÖLÇÜLEN AÇIK (9 Ağu 2026 güvenlik denetimi): burada eskiden slowapi'nin
    `get_remote_address` fonksiyonu vardı ve o `request.client.host`, yani SOKET adresini
    döndürür. Render (ve Cloudflare) ters vekil ARKASINDA soket adresi her ziyaretçi için
    AYNIDIR — vekilin kendi adresi. Sonuç: tüm dünya tek kovayı paylaşıyordu.
    İki yönlü zarar veriyordu:
      · Koruma tarafı: saldırgan başına sınır YOK — 20/dakika sınırı saldırganı değil
        TOPLAMI sınırlar, yani tek istemci sınırın tamamını yiyebilir.
      · Erişilebilirlik tarafı: tek istemci sınırı doldurunca DİĞER HERKES 429 alır,
        yani ucuz bir DoS'a dönüşür.
    Uygulama `DEMO_GUVENILEN_PROXY_SAYISI`'nı okuyan doğru bir türetmeye ZATEN sahipti
    (`demo_kimlik.istemci_ip`, kota ekseni onu kullanıyordu). İki ayrı IP türetmesi
    tutmak, birinin doğru diğerinin yanlış olması demekti; tek kaynağa indirildi.

    Başlık istemci-kontrollüdür: güvenilen vekil sayısı verilmezse XFF tamamen yok sayılır
    ve soket adresine düşülür (fail-closed — bkz. `demo_kimlik` modül docstring'i).
    """
    from api.demo_kimlik import istemci_ip

    scope = getattr(request, "scope", None)
    if isinstance(scope, dict):
        ip = istemci_ip(scope)
        if ip:
            return ip
    # scope yoksa/boşsa slowapi'nin kendi davranışına düş — anahtar üretmeden kalmaktansa
    # (o durumda TÜM istekler tek kovaya düşerdi) soket adresi yine de daha ayırt edicidir.
    #
    # Sarmalayıcı try BİLİNÇLİ: `key_func` HER istekte koşar ve burada atılan bir istisna
    # isteği 500'e düşürür. Hız sınırı anahtarı üretememek, uygulamayı kırmaktan iyidir —
    # bu yolda güvenlik zaten kaybedilmez, çünkü boş anahtar slowapi'de tek ortak kovadır
    # (daha KISITLAYICI yön, fail-closed).
    if _SLOWAPI_AVAILABLE:
        try:
            return get_remote_address(request)
        except Exception:  # pragma: no cover — savunmacı; gerçek Request'te .client hep var
            return ""
    return ""


# Tek paylaşılan Limiter (slowapi varsa). Limit'leri ortam değişkeniyle kapatılabilir kıl.
_RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in ("0", "false", "no")

_limiter: Any = None
if _SLOWAPI_AVAILABLE:
    _limiter = Limiter(key_func=istemci_anahtari, enabled=_RATE_LIMIT_ENABLED)


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
        # WARNING (INFO değil): kırık bir venv'de slowapi eksikse IP-başı hız sınırlaması
        # (/kayit, /giris vb.) sessizce devre dışı kalır — rutin boot gürültüsüne karışmasın.
        log.warning("rate_limit_disabled", reason="slowapi_not_installed")
        return False
    app.state.limiter = _limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    log.info("rate_limit_enabled", enabled=_RATE_LIMIT_ENABLED)
    return True


__all__ = ("istemci_anahtari", "rate_limit", "setup_rate_limiting")
