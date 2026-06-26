"""structlog processor testleri — hassas anahtar redaksiyonu + PII maskeleme + metrics tap.

core/logging.py saf processor fonksiyonları (structlog gerektirmeden test edilir;
event_dict in/out kontratı). Gizlilik-kritik: sensitive key redact + PII mask + tap
asla event'i bozmamalı / hata fırlatmamalı.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import core.logging as logging_mod
from core.logging import (
    SENSITIVE_KEYS,
    _in_pii_processor,
    _is_sensitive_key,
    _mask_pii_in_strings,
    _mask_pii_nested,
    _metrics_tap,
    _redact_dict,
    _redact_sensitive,
    _redact_value,
    _warn_pii_unavailable,
    configure_logging,
)


class TestIsSensitiveKey:
    """_is_sensitive_key — allow-list + substring (case-insensitive)."""

    def test_tam_eslesme_hassas(self):
        # Act + Assert
        assert _is_sensitive_key("password") is True
        assert _is_sensitive_key("api_key") is True

    def test_buyuk_harf_duyarsiz(self):
        # Act + Assert
        assert _is_sensitive_key("PASSWORD") is True
        assert _is_sensitive_key("Authorization") is True

    def test_substring_yakalanir(self):
        # Arrange — '_key'/'token'/'secret'/'password' substring
        assert _is_sensitive_key("my_secret_value") is True
        assert _is_sensitive_key("user_token_field") is True
        assert _is_sensitive_key("redis_key") is True

    def test_zararsiz_anahtar_degil(self):
        # Act + Assert
        assert _is_sensitive_key("evrak_turu") is False
        assert _is_sensitive_key("event") is False


class TestRedactDict:
    """_redact_dict / _redact_value — recursive hassas anahtar maskeleme."""

    def test_duz_dict_redact(self):
        # Arrange
        d = {"password": "gizli123", "user": "ali"}
        # Act
        out = _redact_dict(d)
        # Assert — yalnız hassas anahtar redact
        assert out["password"] == "[REDACTED]"
        assert out["user"] == "ali"

    def test_nested_dict_recursive(self):
        # Arrange — iç içe hassas anahtar
        d = {"config": {"api_key": "sk-xxx", "host": "localhost"}}
        # Act
        out = _redact_dict(d)
        # Assert
        assert out["config"]["api_key"] == "[REDACTED]"
        assert out["config"]["host"] == "localhost"

    def test_liste_icinde_dict_recursive(self):
        # Arrange — liste içi token
        d = {"items": [{"token": "abc"}, {"name": "x"}]}
        # Act
        out = _redact_dict(d)
        # Assert
        assert out["items"][0]["token"] == "[REDACTED]"
        assert out["items"][1]["name"] == "x"

    def test_redact_value_skalar_degismez(self):
        # Act + Assert — dict/list olmayan değer aynen döner
        assert _redact_value(42) == 42
        assert _redact_value("metin") == "metin"


class TestRedactSensitiveProcessor:
    """_redact_sensitive structlog processor imzası — event_dict döner."""

    def test_processor_redact_uygular(self):
        # Arrange
        event = {"event": "login", "secret": "s3cr3t"}
        # Act
        out = _redact_sensitive(None, "info", event)
        # Assert
        assert out["secret"] == "[REDACTED]"
        assert out["event"] == "login"


class TestMaskPiiNested:
    """_mask_pii_nested — nested string'lerde PII mask (mask_fn ile)."""

    def test_kisa_string_maskelenmez(self):
        # Arrange — sahte mask_fn (her zaman PII bulur), <=8 char muaf
        class _R:
            has_pii = True
            masked_text = "MASKED"

        out = _mask_pii_nested("kısa", lambda s: _R())
        # Assert — 8 karakterden kısa → mask uygulanmaz
        assert out == "kısa"

    def test_uzun_string_pii_maskelenir(self):
        # Arrange — uzun string + mask_fn PII döndürür
        class _R:
            has_pii = True
            masked_text = "[MASKED]"

        out = _mask_pii_nested("çok uzun bir metin parçası", lambda s: _R())
        # Assert
        assert out == "[MASKED]"

    def test_pii_yoksa_orijinal(self):
        # Arrange — mask_fn PII bulmaz
        class _R:
            has_pii = False
            masked_text = ""

        out = _mask_pii_nested("uzun temiz metin burada", lambda s: _R())
        # Assert — değişmez
        assert out == "uzun temiz metin burada"

    def test_nested_dict_ve_liste(self):
        # Arrange
        class _R:
            has_pii = True
            masked_text = "X"

        data = {"a": "uzun metin parçası", "b": ["başka uzun değer burada"]}
        out = _mask_pii_nested(data, lambda s: _R())
        # Assert
        assert out["a"] == "X"
        assert out["b"][0] == "X"


class TestMetricsTap:
    """_metrics_tap — event'i DEĞİŞTİRMEZ + asla hata fırlatmaz (gözlemci)."""

    def test_event_degismeden_doner(self):
        # Arrange
        event = {"event": "bilinmeyen_event", "x": 1}
        # Act
        out = _metrics_tap(None, "info", event)
        # Assert — aynı dict (mutasyon yok)
        assert out is event
        assert out == {"event": "bilinmeyen_event", "x": 1}

    def test_event_olmayan_dict_guvenli(self):
        # Arrange — 'event' anahtarı yok
        event = {"foo": "bar"}
        # Act — hata fırlatmamalı
        out = _metrics_tap(None, "info", event)
        # Assert
        assert out == {"foo": "bar"}


class TestSensitiveKeysSabit:
    """SENSITIVE_KEYS allow-list temel beklenenleri içerir (regrese karşı)."""

    def test_temel_anahtarlar_var(self):
        # Assert — frozenset kontratı
        assert "password" in SENSITIVE_KEYS
        assert "openai_api_key" in SENSITIVE_KEYS
        assert "jwt_secret" in SENSITIVE_KEYS


class TestMaskPiiProcessor:
    """_mask_pii_in_strings — re-entrancy guard + api.pii yoksa zarif degrade."""

    def test_re_entrancy_guard_no_op(self):
        # Arrange — guard set'liyken nested çağrı event'i değiştirmeden döner
        token = _in_pii_processor.set(True)
        try:
            event = {"event": "nested", "msg": "uzun bir metin parçası"}
            # Act
            out = _mask_pii_in_strings(None, "info", event)
            # Assert — aynı dict (no-op)
            assert out is event
        finally:
            _in_pii_processor.reset(token)

    def test_api_pii_yoksa_degrade(self, monkeypatch):
        # Arrange — kamu-evrak'ta api.pii YOK → ImportError dalı (loglar maskesiz akar)
        # _warn_pii_unavailable bir kez CRITICAL uyarır; event_dict değişmeden döner.
        monkeypatch.setattr(logging_mod, "_pii_unavailable_warned", False)
        event = {"event": "x", "metin": "uzun bir test metni burada"}
        # Act — api.pii import edilemez → event aynen döner (hata fırlatmaz)
        out = _mask_pii_in_strings(None, "info", event)
        # Assert
        assert out["metin"] == "uzun bir test metni burada"

    def test_warn_pii_unavailable_bir_kez(self, monkeypatch):
        # Arrange — uyarı bayrağı bir kez set edilir (spam yok)
        monkeypatch.setattr(logging_mod, "_pii_unavailable_warned", False)
        # Act — iki kez çağır
        _warn_pii_unavailable(ImportError("yok"))
        # Assert — bayrak set edildi (ikinci çağrı no-op)
        assert logging_mod._pii_unavailable_warned is True
        _warn_pii_unavailable(ImportError("yok2"))  # ikinci çağrı sessiz (kapsam)


class TestConfigureLogging:
    """configure_logging — structlog global config (hata fırlatmamalı)."""

    def test_json_format_calisir(self, monkeypatch):
        # Arrange — JSON format (production)
        monkeypatch.setattr(logging_mod, "LOG_FORMAT", "json")
        # Act — config kurulur (hata yok)
        configure_logging()

    def test_console_format_calisir(self, monkeypatch):
        # Arrange — console format (dev)
        monkeypatch.setattr(logging_mod, "LOG_FORMAT", "console")
        # Act
        configure_logging()
