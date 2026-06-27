"""Auth API şemaları (Pydantic v2) — istek/yanıt sınır doğrulaması."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field


class KayitRequest(BaseModel):
    eposta: EmailStr
    parola: str = Field(min_length=8, max_length=128)
    ad_soyad: str = Field(min_length=2, max_length=120)
    birim_kod: str = Field(min_length=2, max_length=80)   # birim.kod (referans)
    unvan: str = Field(default="", max_length=120)


class GirisRequest(BaseModel):
    eposta: EmailStr
    parola: str = Field(min_length=1, max_length=128)


class YenileRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access saniye


class KullaniciOut(BaseModel):
    id: uuid.UUID
    eposta: EmailStr
    ad_soyad: str
    unvan: str
    rol: str
    birim_id: uuid.UUID
    e_imza_yetkisi: bool


__all__ = (
    "KayitRequest", "GirisRequest", "YenileRequest", "TokenResponse", "KullaniciOut",
)
