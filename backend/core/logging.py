"""structlog tek yer config — hassas anahtar redaksiyonu + PII maskeleme.

TARİHÇE (önemli): bu modül 22c0787'de "ölü kod" sanılıp SİLİNDİ. Ölü değildi;
`configure_logging()` hiçbir yerden ÇAĞRILMIYORDU. Yani silinen şey, kurulmamış bir
güvenlik kontrolüydü. `api/pii.py:3` hâlâ bu dosyanın `_mask_pii_in_strings`
processor'ünü SÖZLEŞME olarak anlatıyor. Geri getirildi ve bu kez `main.py`'de fiilen
bağlandı — halka açık demoda vatandaş belgesi log'a düşmesin diye.

Processor zinciri (SIRA ÖNEMLİ):
  1. merge_contextvars        — bağlama bağlı değerler de maskelensin diye ÖNCE
  2. add_log_level
  3. _redact_sensitive        — hassas ANAHTARLAR → "[REDACTED]"
  4. _mask_pii_in_strings     — string DEĞERLERDE TCKN/telefon/IBAN → yıldız
  5. TimeStamper              — maskelemeden SONRA (aşağıdaki nota bak)
  6. JSONRenderer (prod) | ConsoleRenderer (dev)

TimeStamper NEDEN MASKELEMEDEN SONRA: `api/pii.py:22` telefon deseni gevşektir
(ayraçlı 10 haneli her dizi). Zaman damgası maskelemeden ÖNCE eklenirse bir gün
biçim değiştiğinde damganın kendisi "maskelenmiş" olarak bozulabilir. Damgayı
zincirin sonunda üretmek bu sınıf hatayı imkânsız kılar — maskeleyici onu hiç görmez.

VARSAYILAN SEVİYE INFO'dur: `log.debug` çağrıları (ör. `_llm_extract.py` ham LLM
çıktısı) yayınlanmaz. structlog yapılandırılmamışken seviye 0'dır, yani debug AKAR —
bu modülün bağlanması o sızıntıyı da kapatır.
"""

from __future__ import annotations

import contextvars
import logging
import os
import sys
from typing import Any

import structlog

# Re-entrancy guard: processor `mask_pii()` çağırır; `mask_pii` ileride PII bulduğunda
# kendisi log emit ederse nested event yine bu processor'a girer → SONSUZ RECURSION.
# Bugün `mask_pii` log ETMİYOR (api/pii.py:8 bunu sözleşme sayıyor); bayrak o sözleşme
# ileride bozulursa diye savunma derinliğidir. Maliyeti tek ContextVar okuması.
_in_pii_processor: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "_in_pii_processor", default=False,
)

# Hassas anahtar listesi — log payload'larında bu anahtarların DEĞERİ redakte edilir.
SENSITIVE_KEYS: frozenset[str] = frozenset({
    "password", "passwd", "secret", "token", "api_key", "apikey",
    "authorization", "auth", "jwt", "bearer", "private_key",
    "refresh_token", "access_token", "session_token",
    "redis_password", "qdrant_api_key", "jwt_secret",
    "langfuse_secret_key", "langfuse_public_key", "openai_api_key",
    "cookie", "set-cookie",
})

# Maskeleme eşiği: bundan kısa string'de TCKN(11)/telefon(10)/IBAN(26) barınamaz.
_ASGARI_UZUNLUK = 8

# Yapısal maskelemede özyineleme tavanı (api/pii.py:106 ile aynı disiplin).
_AZAMI_DERINLIK = 12

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def _varsayilan_bicim() -> str:
    """Prod'da JSON (Filebeat/Vector), dev'de console (okunabilirlik).

    Açıkça LOG_FORMAT verilmişse o kazanır. Varsayılanı APP_ENV'e bağlamak, bu modülü
    bağlamanın YEREL geliştirmede log görünümünü değiştirmemesini sağlar.
    """
    acik = os.getenv("LOG_FORMAT", "").strip().lower()
    if acik in ("json", "console"):
        return acik
    return "json" if os.getenv("APP_ENV", "").lower() in ("prod", "production") else "console"


def _maske_acik() -> bool:
    """PII maskeleme kill-switch'i. VARSAYILAN AÇIK — kapatmak bilinçli bir eylem olmalı."""
    return os.getenv("KE_LOG_PII_MASK", "1").strip().lower() not in ("0", "false", "no")


def _is_sensitive_key(key: Any) -> bool:
    """Anahtar hassas mı? Case-insensitive + substring (secret/password/token/_key)."""
    kl = str(key).lower()
    return kl in SENSITIVE_KEYS or any(
        s in kl for s in ("secret", "password", "token", "_key")
    )


def _redact_value(value: Any, _derinlik: int = 0) -> Any:
    """Değere recursive in — dict VE list içindeki hassas anahtarları redakte et."""
    if _derinlik > _AZAMI_DERINLIK:
        return value
    if isinstance(value, dict):
        return _redact_dict(value, _derinlik + 1)
    if isinstance(value, list):
        return [_redact_value(v, _derinlik + 1) for v in value]
    return value


def _redact_dict(d: dict[str, Any], _derinlik: int = 0) -> dict[str, Any]:
    """Hassas anahtarları '[REDACTED]'; dict+list değerlere recursive in."""
    out: dict[str, Any] = {}
    for k, v in d.items():
        out[k] = "[REDACTED]" if _is_sensitive_key(k) else _redact_value(v, _derinlik)
    return out


def _redact_sensitive(
    _logger: Any, _method_name: str, event_dict: dict[str, Any],
) -> dict[str, Any]:
    """structlog processor — hassas anahtarların DEĞERİNİ '[REDACTED]' yap.

    ASLA RAISE ETMEZ: processor istisnası her `log.info()` çağrı yerine, yani istek
    yoluna sızar. Log hattı uygulamayı düşüremez.
    """
    try:
        return _redact_dict(event_dict)
    except Exception:
        return event_dict


# Gizlilik kritik: PII modülü import edilemezse log'lar maskesiz akar. Sessizce geçme —
# bir kez stdlib logging ile CRITICAL uyar (structlog henüz config edilmemiş olabilir;
# döngüye girmemek için bilinçli olarak stdlib kullanılır).
_pii_unavailable_warned = False


def _warn_pii_unavailable(exc: Exception) -> None:
    global _pii_unavailable_warned
    if not _pii_unavailable_warned:
        _pii_unavailable_warned = True
        logging.getLogger(__name__).critical(
            "PII maskeleme modülü yüklenemedi — loglar maskesiz akıyor (gizlilik riski): %s",
            exc,
        )


def _mask_pii_nested(value: Any, mask_fn: Any, _derinlik: int = 0) -> Any:
    """dict/list/string içine recursive in, string'lerde PII maskesi uygula."""
    if _derinlik > _AZAMI_DERINLIK:
        return value
    if isinstance(value, str):
        if len(value) > _ASGARI_UZUNLUK:
            sonuc = mask_fn(value)
            if sonuc.has_pii:
                return sonuc.masked_text
        return value
    if isinstance(value, dict):
        return {k: _mask_pii_nested(v, mask_fn, _derinlik + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_pii_nested(v, mask_fn, _derinlik + 1) for v in value]
    return value


def _mask_pii_in_strings(
    _logger: Any, _method_name: str, event_dict: dict[str, Any],
) -> dict[str, Any]:
    """String değerlerde PII desenlerini maskele — nested dict/list dahil.

    AD SÖZLEŞMEDİR: `api/pii.py:3` bu processor'ü adıyla belgeliyor.
    ANAHTARLARA DOKUNULMAZ (alan adıdır, kişisel veri değil — api/pii.py:117 ile aynı gerekçe).
    ASLA RAISE ETMEZ (bkz. `_redact_sensitive`).
    """
    if not _maske_acik() or _in_pii_processor.get():
        return event_dict
    try:
        from api.pii import mask_pii
    except ImportError as exc:
        _warn_pii_unavailable(exc)
        return event_dict
    token = _in_pii_processor.set(True)
    try:
        for key, value in list(event_dict.items()):
            if isinstance(value, str):
                if len(value) > _ASGARI_UZUNLUK:
                    sonuc = mask_pii(value)
                    if sonuc.has_pii:
                        event_dict[key] = sonuc.masked_text
                        event_dict[f"{key}_pii_counts"] = sonuc.counts
            elif isinstance(value, (dict, list)):
                event_dict[key] = _mask_pii_nested(value, mask_pii)
    except Exception:
        return event_dict
    finally:
        _in_pii_processor.reset(token)
    return event_dict


_YAPILANDIRILDI = False


def configure_logging(*, zorla: bool = False) -> bool:
    """Tek seferlik global structlog config. `main.py` import sırasında çağırır.

    Idempotent: ikinci çağrı no-op (True yalnız fiilen yapılandırıldığında döner).
    `zorla=True` yalnız testler için.
    """
    global _YAPILANDIRILDI
    if _YAPILANDIRILDI and not zorla:
        return False

    bicim = _varsayilan_bicim()
    renderer: Any = (
        structlog.processors.JSONRenderer() if bicim == "json"
        else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _redact_sensitive,
            _mask_pii_in_strings,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, LOG_LEVEL, logging.INFO),
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    _YAPILANDIRILDI = True
    return True


__all__ = ("LOG_LEVEL", "SENSITIVE_KEYS", "configure_logging")
