"""Parola hash (argon2id) + JWT imzalama/doğrulama. Saf, yan-etkisiz (DB yok).

SIFIR HARDCODED SECRET (CLAUDE.md): AUTH_JWT_SECRET .env'den. Eksikse import-time hata.
Refresh token ham saklanmaz; SHA-256 hash'i oturum tablosunda tutulur (db tarafı).
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import os
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))

_SECRET = os.environ.get("AUTH_JWT_SECRET", "")
if not _SECRET:
    raise RuntimeError("AUTH_JWT_SECRET tanımsız (.env) — JWT imzalanamaz.")
_ALG = "HS256"
_ACCESS_TTL = _dt.timedelta(minutes=int(os.getenv("AUTH_ACCESS_TTL_MIN", "15")))
_REFRESH_TTL = _dt.timedelta(days=int(os.getenv("AUTH_REFRESH_TTL_DAYS", "7")))

_ph = PasswordHasher()  # argon2id varsayılan (güvenli profil)


# --- Parola ---------------------------------------------------------------
def hash_parola(parola: str) -> str:
    return _ph.hash(parola)


def parola_dogrula(parola: str, parola_hash: str) -> bool:
    try:
        return _ph.verify(parola_hash, parola)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def rehash_gerekli(parola_hash: str) -> bool:
    """argon2 parametreleri güncellendiyse True (giriş sonrası yeniden hash önerilir)."""
    try:
        return _ph.check_needs_rehash(parola_hash)
    except Exception:
        return False


# --- Token hash (oturum tablosunda saklanır) ------------------------------
def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --- JWT ------------------------------------------------------------------
def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def access_token_uret(kullanici_id: str, rol: str, birim_id: str) -> tuple[str, _dt.datetime]:
    son = _now() + _ACCESS_TTL
    payload = {
        "sub": str(kullanici_id), "rol": rol, "birim_id": str(birim_id),
        "type": "access", "iat": _now(), "exp": son,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALG), son


def refresh_token_uret(kullanici_id: str) -> tuple[str, str, _dt.datetime]:
    """(token, jti, son_gecerlilik) — jti oturum satırı ilişkilendirme için."""
    jti = str(uuid.uuid4())
    son = _now() + _REFRESH_TTL
    payload = {"sub": str(kullanici_id), "type": "refresh", "jti": jti,
               "iat": _now(), "exp": son}
    return jwt.encode(payload, _SECRET, algorithm=_ALG), jti, son


def token_coz(token: str, beklenen_tip: str) -> dict | None:
    """Doğrula + süre/tip kontrol. Geçersiz/süresi dolmuş/yanlış tip → None."""
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALG])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != beklenen_tip:
        return None
    return payload


__all__ = (
    "hash_parola", "parola_dogrula", "rehash_gerekli", "token_hash",
    "access_token_uret", "refresh_token_uret", "token_coz",
)
