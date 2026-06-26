"""Hız sınırı middleware birim testleri — slowapi varsa/yoksa zarif davranış.

api/middleware/ratelimit.py: rate_limit() dekoratör (slowapi yoksa no-op geçiş),
setup_rate_limiting() (slowapi yoksa False, varsa app.state.limiter bağlar).
slowapi'nin kurulu olup olmamasına KARŞI dayanıklı testler (iki dalı da kapsar).
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import api.middleware.ratelimit as rl_mod
from api.middleware.ratelimit import _is_available, rate_limit, setup_rate_limiting


class TestRateLimitDekorator:
    """rate_limit — fonksiyonu sarar (slowapi) veya aynen döndürür (no-op)."""

    def test_dekorator_cagrilabilir_doner(self):
        # Act — rate_limit bir dekoratör döndürmeli
        dec = rate_limit("30/minute")
        # Assert
        assert callable(dec)

    def test_dekorator_fonksiyonu_korur(self):
        # Arrange
        async def _endpoint(request):
            return "ok"

        # Act — sarılmış/sarılmamış olsun, çağrılabilir kalmalı
        wrapped = rate_limit("10/minute")(_endpoint)
        # Assert
        assert callable(wrapped)

    def test_slowapi_yoksa_no_op_ayni_fonksiyon(self, monkeypatch):
        # Arrange — slowapi yokmuş gibi davran
        monkeypatch.setattr(rl_mod, "_SLOWAPI_AVAILABLE", False)
        monkeypatch.setattr(rl_mod, "_limiter", None)

        async def _endpoint(request):
            return "ok"

        # Act — no-op geçiş dekoratörü orijinali döndürür
        wrapped = rate_limit("5/minute")(_endpoint)
        # Assert
        assert wrapped is _endpoint


class TestSetupRateLimiting:
    """setup_rate_limiting — slowapi yoksa False (boot kırılmaz)."""

    def test_slowapi_yoksa_false(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(rl_mod, "_SLOWAPI_AVAILABLE", False)
        monkeypatch.setattr(rl_mod, "_limiter", None)

        class _App:
            pass

        # Act
        sonuc = setup_rate_limiting(_App())
        # Assert
        assert sonuc is False

    def test_slowapi_varsa_limiter_baglar(self):
        # Arrange — gerçek durum (slowapi kurulu OLABİLİR)
        class _State:
            pass

        class _App:
            def __init__(self):
                self.state = _State()
                self.handlers = []

            def add_exception_handler(self, exc, handler):
                self.handlers.append((exc, handler))

        app = _App()
        # Act
        sonuc = setup_rate_limiting(app)
        # Assert — kuruluysa True + state.limiter bağlı; değilse False (her iki dal geçerli)
        if _is_available():
            assert sonuc is True
            assert hasattr(app.state, "limiter")
            assert app.handlers  # 429 handler eklendi
        else:
            assert sonuc is False


class TestIsAvailable:
    """_is_available — slowapi import durumunu bool olarak raporlar."""

    def test_bool_doner(self):
        # Act + Assert
        assert isinstance(_is_available(), bool)
