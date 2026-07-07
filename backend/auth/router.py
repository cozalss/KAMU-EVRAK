"""Auth REST uçları — /auth/kayit · /giris · /yenile · /cikis · /ben.

Hata eşlemesi: AuthError.kod → HTTP (409 eposta_kayitli, 404 birim_yok, 401 kimlik/oturum).
İstemci IP + User-Agent oturum kaydına yazılır (denetim). Şartname Görev güvenliği.

Hız sınırı (güvenlik denetimi HIGH-1): bu uçlar auth'suz açık ve giris/kayit kasıtlı-pahalı
argon2 koşturur → sınırsız istek = parola deneme + CPU-DoS. Sıkı IP-başı limitler; meşru
kullanıcı akışına bol yeter (login 5/dk, refresh access-TTL'de ~1 kez).
"""
from __future__ import annotations

import ipaddress
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.ratelimit import rate_limit
from auth import service
from auth.deps import CurrentUser
from auth.schemas import (
    GirisRequest,
    KayitRequest,
    KullaniciOut,
    TokenResponse,
    YenileRequest,
)
from db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])

Session = Annotated[AsyncSession, Depends(get_session)]

_KOD_HTTP = {
    "eposta_kayitli": status.HTTP_409_CONFLICT,
    "birim_yok": status.HTTP_404_NOT_FOUND,
    "kimlik_hatali": status.HTTP_401_UNAUTHORIZED,
    "pasif": status.HTTP_403_FORBIDDEN,
    "oturum_gecersiz": status.HTTP_401_UNAUTHORIZED,
}


def _http(e: service.AuthError) -> HTTPException:
    return HTTPException(_KOD_HTTP.get(e.kod, status.HTTP_400_BAD_REQUEST), e.mesaj)


def _gecerli_ip(host: str | None) -> str | None:
    """INET kolonu için doğrula — geçersizse (örn. 'testclient', proxy adı) None."""
    if not host:
        return None
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        return None


def _istemci(req: Request) -> tuple[str | None, str | None]:
    ip = _gecerli_ip(req.client.host if req.client else None)
    return ip, req.headers.get("user-agent")


@router.post("/kayit", response_model=KullaniciOut, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def kayit(req: KayitRequest, request: Request, session: Session) -> KullaniciOut:
    try:
        k = await service.kayit(
            session, eposta=req.eposta, parola=req.parola, ad_soyad=req.ad_soyad,
            birim_kod=req.birim_kod, unvan=req.unvan)
    except service.AuthError as e:
        raise _http(e) from e
    return KullaniciOut.model_validate(k, from_attributes=True)


@router.post("/giris", response_model=TokenResponse)
@rate_limit("5/minute")
async def giris(req: GirisRequest, request: Request, session: Session) -> TokenResponse:
    ip, ua = _istemci(request)
    try:
        _k, access, refresh, ttl = await service.giris(
            session, eposta=req.eposta, parola=req.parola, ip=ip, user_agent=ua)
    except service.AuthError as e:
        raise _http(e) from e
    return TokenResponse(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/yenile", response_model=TokenResponse)
@rate_limit("5/minute")
async def yenile(req: YenileRequest, request: Request, session: Session) -> TokenResponse:
    ip, ua = _istemci(request)
    try:
        access, refresh, ttl = await service.yenile(
            session, refresh_token=req.refresh_token, ip=ip, user_agent=ua)
    except service.AuthError as e:
        raise _http(e) from e
    return TokenResponse(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/cikis", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def cikis(req: YenileRequest, request: Request, session: Session) -> None:
    await service.cikis(session, refresh_token=req.refresh_token)


@router.get("/ben", response_model=KullaniciOut)
async def ben(kullanici: CurrentUser) -> KullaniciOut:
    return KullaniciOut.model_validate(kullanici, from_attributes=True)


__all__ = ("router",)
