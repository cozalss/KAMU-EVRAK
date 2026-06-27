"""Auth güvenlik primitifleri — argon2 parola + JWT (DB'siz, deterministik).

Bütünleşik akış (kayıt→giriş→yenile→çıkış) canlı DB ister → db/smoke_auth.py'de
elle doğrulanır; burada saf kriptografik davranış test edilir (CI hızlı).
"""
from __future__ import annotations

import datetime as _dt

import jwt
import pytest

from auth import security


# --- argon2 parola ---------------------------------------------------------
def test_hash_dogrula_roundtrip():
    h = security.hash_parola("Gizli.Parola.123")
    assert h != "Gizli.Parola.123"           # düz-metin saklanmaz
    assert security.parola_dogrula("Gizli.Parola.123", h) is True


def test_yanlis_parola_reddedilir():
    h = security.hash_parola("dogru-parola-xyz")
    assert security.parola_dogrula("yanlis-parola", h) is False


def test_bozuk_hash_patlamaz():
    # Geçersiz hash dizgesi → False (istisna fırlatmaz)
    assert security.parola_dogrula("x", "argon2-degil") is False


def test_ayni_parola_farkli_hash_uretir():
    # Tuz (salt) → aynı parola farklı hash (rainbow-table direnci)
    assert security.hash_parola("aa12345678") != security.hash_parola("aa12345678")


# --- token hash ------------------------------------------------------------
def test_token_hash_deterministik_ve_geriye_donmez():
    t = "ornek.refresh.token"
    assert security.token_hash(t) == security.token_hash(t)
    assert t not in security.token_hash(t)       # ham token görünmez
    assert len(security.token_hash(t)) == 64      # sha256 hex


# --- JWT access ------------------------------------------------------------
def test_access_token_coz_payload():
    tok, son = security.access_token_uret("kid-1", "yetkili", "bid-9")
    p = security.token_coz(tok, "access")
    assert p is not None
    assert p["sub"] == "kid-1" and p["rol"] == "yetkili" and p["birim_id"] == "bid-9"
    assert p["type"] == "access"
    assert son > _dt.datetime.now(_dt.UTC)


def test_access_token_refresh_olarak_cozulmez():
    # Tip ayrımı: access token 'refresh' beklenince reddedilir
    tok, _ = security.access_token_uret("k", "memur", "b")
    assert security.token_coz(tok, "refresh") is None


# --- JWT refresh -----------------------------------------------------------
def test_refresh_token_jti_ve_tip():
    tok, jti, son = security.refresh_token_uret("kid-2")
    p = security.token_coz(tok, "refresh")
    assert p is not None and p["type"] == "refresh"
    assert p["jti"] == jti and p["sub"] == "kid-2"


def test_gecersiz_imza_reddedilir():
    sahte = jwt.encode({"sub": "x", "type": "access"}, "yanlis-secret", algorithm="HS256")
    assert security.token_coz(sahte, "access") is None


def test_suresi_dolmus_token_reddedilir():
    gecmis = _dt.datetime.now(_dt.UTC) - _dt.timedelta(hours=1)
    suresi_dolmus = jwt.encode(
        {"sub": "x", "type": "access", "exp": gecmis},
        security._SECRET, algorithm="HS256")
    assert security.token_coz(suresi_dolmus, "access") is None


@pytest.mark.parametrize("bozuk", ["", "a.b", "not-a-jwt", "x.y.z"])
def test_bozuk_token_none_doner(bozuk):
    assert security.token_coz(bozuk, "access") is None
