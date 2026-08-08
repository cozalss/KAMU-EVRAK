"""core/logging.py — hassas anahtar redaksiyonu + PII maskeleme processor'leri.

Bu modül 22c0787'de "ölü kod" sanılıp silinmişti; ölü değil BAĞLANMAMIŞ koddu.
Geri getirildi ve main.py'de fiilen bağlandı. Testler iki şeyi birden korur:
processor'lerin doğruluğu VE zincirin uygulamayı asla düşürmemesi.

Saf fonksiyonlar structlog gerektirmeden test edilir (event_dict in/out sözleşmesi).
`configure_logging` testleri global structlog durumunu değiştirdiği için ZORUNLU
izolasyon fixture'ı ile sarılır — aksi hâlde diğer 2397 teste sızar.
"""

from __future__ import annotations

import logging

import pytest
import structlog

import core.logging as logging_mod
from core.logging import (
    SENSITIVE_KEYS,
    _in_pii_processor,
    _is_sensitive_key,
    _mask_pii_in_strings,
    _mask_pii_nested,
    _redact_dict,
    _redact_sensitive,
    _redact_value,
    _warn_pii_unavailable,
    configure_logging,
)

# Checksum-geçerli SAHTE TCKN (CLAUDE.md §2 — gerçek PII asla).
SAHTE_TCKN = "12345678901"


class TestIsSensitiveKey:
    """_is_sensitive_key — liste + substring (case-insensitive)."""

    def test_tam_eslesme_hassas(self):
        assert _is_sensitive_key("password") is True
        assert _is_sensitive_key("api_key") is True

    def test_buyuk_harf_duyarsiz(self):
        assert _is_sensitive_key("PASSWORD") is True
        assert _is_sensitive_key("Authorization") is True

    def test_substring_yakalanir(self):
        assert _is_sensitive_key("my_secret_value") is True
        assert _is_sensitive_key("user_token_field") is True
        assert _is_sensitive_key("redis_key") is True

    def test_zararsiz_anahtar_degil(self):
        assert _is_sensitive_key("evrak_turu") is False
        assert _is_sensitive_key("event") is False


class TestRedactDict:
    """_redact_dict / _redact_value — özyinelemeli hassas anahtar redaksiyonu."""

    def test_duz_dict_redact(self):
        # Arrange
        d = {"password": "sahte-parola", "user": "ali"}
        # Act
        out = _redact_dict(d)
        # Assert — yalnız hassas anahtar redakte
        assert out["password"] == "[REDACTED]"
        assert out["user"] == "ali"

    def test_nested_dict_recursive(self):
        # Arrange
        d = {"cfg": {"api_key": "sk-xxx", "model": "flash"}}
        # Act
        out = _redact_dict(d)
        # Assert
        assert out["cfg"]["api_key"] == "[REDACTED]"
        assert out["cfg"]["model"] == "flash"

    def test_liste_icinde_dict_recursive(self):
        # Arrange
        d = {"items": [{"token": "abc"}, {"ad": "dosya.pdf"}]}
        # Act
        out = _redact_dict(d)
        # Assert
        assert out["items"][0]["token"] == "[REDACTED]"
        assert out["items"][1]["ad"] == "dosya.pdf"

    def test_derinlik_tavani_sonsuz_inmeyi_durdurur(self):
        # Arrange — kendine referans veren yapı
        d: dict = {"a": {}}
        cur = d["a"]
        for _ in range(40):
            cur["a"] = {}
            cur = cur["a"]
        cur["password"] = "x"
        # Act + Assert — patlamaz
        assert _redact_dict(d) is not None

    def test_redact_value_skalar_degismez(self):
        assert _redact_value(5) == 5
        assert _redact_value(None) is None


class TestRedactSensitiveProcessor:
    """_redact_sensitive — structlog processor sözleşmesi."""

    def test_processor_redact_uygular(self):
        # Arrange
        ev = {"event": "giris", "jwt": "eyJhbG..."}
        # Act
        out = _redact_sensitive(None, "info", ev)
        # Assert
        assert out["jwt"] == "[REDACTED]"
        assert out["event"] == "giris"

    def test_asla_raise_etmez(self, monkeypatch):
        # Arrange — _redact_dict patlasın
        def patla(*_a, **_k):
            raise RuntimeError("beklenmedik")

        monkeypatch.setattr(logging_mod, "_redact_dict", patla)
        ev = {"event": "x"}
        # Act — istisna DIŞARI SIZMAZ
        out = _redact_sensitive(None, "info", ev)
        # Assert — orijinal sözlük geri döner
        assert out is ev


class TestMaskPiiNested:
    """_mask_pii_nested — string/dict/list içinde PII maskeleme."""

    def test_kisa_string_maskelenmez(self):
        from api.pii import mask_pii
        assert _mask_pii_nested("kisa", mask_pii) == "kisa"

    def test_uzun_string_pii_maskelenir(self):
        from api.pii import mask_pii
        out = _mask_pii_nested(f"TCKN: {SAHTE_TCKN}", mask_pii)
        assert SAHTE_TCKN not in out
        assert "*" in out

    def test_pii_yoksa_orijinal(self):
        from api.pii import mask_pii
        metin = "Bu metinde kisisel veri yok"
        assert _mask_pii_nested(metin, mask_pii) == metin

    def test_nested_dict_ve_liste(self):
        from api.pii import mask_pii
        veri = {"kayitlar": [{"kimlik": f"no {SAHTE_TCKN}"}]}
        out = _mask_pii_nested(veri, mask_pii)
        assert SAHTE_TCKN not in str(out)


class TestMaskPiiProcessor:
    """_mask_pii_in_strings — asıl gizlilik kontrolü."""

    def test_tckn_maskelenir(self):
        # Arrange
        ev = {"event": "evrak", "metin": f"Basvuru sahibi {SAHTE_TCKN} numarali"}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert
        assert SAHTE_TCKN not in out["metin"]
        assert out["metin_pii_counts"] == {"tckn": 1}

    def test_pii_yoksa_sozluk_ayni_kalir(self):
        # Arrange
        ev = {"event": "saglik", "durum": "calisiyor"}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert — yeni anahtar eklenmez
        assert out == {"event": "saglik", "durum": "calisiyor"}

    def test_str_disi_degerler_degismez(self):
        # Arrange
        ev = {"event": "x", "sayi": 42, "oran": 0.5, "bayrak": True, "yok": None}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert
        assert out["sayi"] == 42 and out["oran"] == 0.5
        assert out["bayrak"] is True and out["yok"] is None

    def test_anahtarlar_maskelenmez(self):
        # Arrange — anahtar alan adıdır, kişisel veri değil
        ev = {"event": "x", SAHTE_TCKN: "deger"}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert
        assert SAHTE_TCKN in out

    def test_kill_switch_kapatir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("KE_LOG_PII_MASK", "0")
        ev = {"event": "x", "metin": f"no {SAHTE_TCKN}"}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert — maskeleme atlanır
        assert SAHTE_TCKN in out["metin"]

    def test_varsayilan_ACIK(self, monkeypatch):
        # Arrange — bayrak hiç tanımlı değilken maskeleme çalışmalı
        monkeypatch.delenv("KE_LOG_PII_MASK", raising=False)
        ev = {"event": "x", "metin": f"no {SAHTE_TCKN}"}
        # Act
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert
        assert SAHTE_TCKN not in out["metin"]

    def test_re_entrancy_guard_no_op(self):
        # Arrange — bayrak zaten set'liyken processor no-op olmalı
        token = _in_pii_processor.set(True)
        try:
            ev = {"event": "x", "metin": f"no {SAHTE_TCKN}"}
            # Act
            out = _mask_pii_in_strings(None, "info", ev)
            # Assert — maskelenmedi (nested çağrı)
            assert out["metin"] == f"no {SAHTE_TCKN}"
        finally:
            _in_pii_processor.reset(token)

    def test_guard_islem_sonrasi_temizlenir(self):
        # Arrange
        ev = {"event": "x", "metin": f"no {SAHTE_TCKN}"}
        # Act
        _mask_pii_in_strings(None, "info", ev)
        # Assert — ContextVar sızdırmadı
        assert _in_pii_processor.get() is False

    def test_asla_raise_etmez(self, monkeypatch):
        # Arrange — mask_pii patlasın
        import api.pii as pii_mod

        def patla(_t):
            raise RuntimeError("beklenmedik")

        monkeypatch.setattr(pii_mod, "mask_pii", patla)
        ev = {"event": "x", "metin": f"no {SAHTE_TCKN}"}
        # Act — sızmaz
        out = _mask_pii_in_strings(None, "info", ev)
        # Assert
        assert out is ev
        assert _in_pii_processor.get() is False

    def test_api_pii_yoksa_degrade(self, monkeypatch):
        # Arrange — import hatası simüle
        import builtins
        gercek = builtins.__import__

        def sahte(ad, *a, **k):
            if ad == "api.pii":
                raise ImportError("yok")
            return gercek(ad, *a, **k)

        monkeypatch.setattr(builtins, "__import__", sahte)
        monkeypatch.setattr(logging_mod, "_pii_unavailable_warned", False)
        ev = {"event": "x"}
        # Act — patlamaz, event geçer
        assert _mask_pii_in_strings(None, "info", ev) is ev

    def test_warn_pii_unavailable_bir_kez(self, monkeypatch, caplog):
        # Arrange
        monkeypatch.setattr(logging_mod, "_pii_unavailable_warned", False)
        # Act
        with caplog.at_level(logging.CRITICAL):
            _warn_pii_unavailable(ImportError("yok"))
            _warn_pii_unavailable(ImportError("yok"))
        # Assert — yalnız bir kez
        assert len([r for r in caplog.records if r.levelno == logging.CRITICAL]) == 1


class TestSensitiveKeysSabit:
    def test_temel_anahtarlar_var(self):
        for k in ("password", "api_key", "authorization", "openai_api_key"):
            assert k in SENSITIVE_KEYS


@pytest.fixture
def _structlog_izolasyon():
    """configure_logging global durumu değiştirir — anlık görüntü al, geri ver.

    `structlog.reset_defaults()` KULLANILMAZ: `main` zaten import edilmiş ve
    configure_logging bir kez koşmuştur; reset sonrası idempotent bayrak yüzünden
    processor bir daha kurulmaz ve SONRAKİ tüm testler maskesiz log'a düşer.
    """
    onceki = structlog.get_config()
    onceki_bayrak = logging_mod._YAPILANDIRILDI
    yield
    structlog.configure(**onceki)
    logging_mod._YAPILANDIRILDI = onceki_bayrak


class TestConfigureLogging:
    """configure_logging — zincir kurulumu ve idempotanlık."""

    def test_json_bicimi_calisir(self, monkeypatch, _structlog_izolasyon):
        # Arrange
        monkeypatch.setenv("LOG_FORMAT", "json")
        # Act
        assert configure_logging(zorla=True) is True
        # Assert
        islemciler = structlog.get_config()["processors"]
        assert isinstance(islemciler[-1], structlog.processors.JSONRenderer)

    def test_console_bicimi_calisir(self, monkeypatch, _structlog_izolasyon):
        monkeypatch.setenv("LOG_FORMAT", "console")
        assert configure_logging(zorla=True) is True
        islemciler = structlog.get_config()["processors"]
        assert isinstance(islemciler[-1], structlog.dev.ConsoleRenderer)

    def test_prod_varsayilani_json_dev_console(self, monkeypatch, _structlog_izolasyon):
        # Arrange — LOG_FORMAT yokken APP_ENV karar verir
        monkeypatch.delenv("LOG_FORMAT", raising=False)
        monkeypatch.setenv("APP_ENV", "production")
        assert logging_mod._varsayilan_bicim() == "json"
        monkeypatch.setenv("APP_ENV", "dev")
        assert logging_mod._varsayilan_bicim() == "console"

    def test_idempotent(self, _structlog_izolasyon):
        # Arrange
        configure_logging(zorla=True)
        # Act — ikinci çağrı iş yapmaz
        assert configure_logging() is False

    def test_maskeleme_TIMESTAMP_ten_once(self, _structlog_izolasyon):
        # Arrange — gevşek telefon deseni zaman damgasını bozamasın diye sıra kritik
        configure_logging(zorla=True)
        islemciler = structlog.get_config()["processors"]
        adlar = [getattr(p, "__name__", type(p).__name__) for p in islemciler]
        # Act
        maske = adlar.index("_mask_pii_in_strings")
        damga = next(i for i, p in enumerate(islemciler)
                     if isinstance(p, structlog.processors.TimeStamper))
        # Assert
        assert maske < damga

    def test_zincirde_her_iki_processor_da_var(self, _structlog_izolasyon):
        configure_logging(zorla=True)
        adlar = [getattr(p, "__name__", "") for p in structlog.get_config()["processors"]]
        assert "_redact_sensitive" in adlar
        assert "_mask_pii_in_strings" in adlar
