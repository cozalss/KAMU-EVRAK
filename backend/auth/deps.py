"""FastAPI auth bağımlılıkları — get_current_user + require_role (RBAC).

Authorization: Bearer <access_token>. access JWT çözülür → kullanici DB'den yüklenir.
Geçersiz/süreli/pasif → 401. require_role(...) yetki kapısı (yonetici her şeyi görür).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from auth import security
from db.models import Kullanici
from db.session import get_session

_bearer = HTTPBearer(auto_error=True)
# Yönetici tüm rolleri kapsar (üst yetki).
_ROL_HIYERARSI = {"memur": 1, "yetkili": 2, "yonetici": 3, "sistem": 3}


async def get_current_user(
    cred: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Kullanici:
    payload = security.token_coz(cred.credentials, "access")
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token.")
    kullanici = await session.get(Kullanici, payload["sub"])
    if kullanici is None or not kullanici.aktif:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı veya pasif.")
    return kullanici


CurrentUser = Annotated[Kullanici, Depends(get_current_user)]


def require_role(*roller: str):
    """En az verilen rollerden birini (veya üstünü) iste. require_role('yetkili') vb."""
    min_seviye = min(_ROL_HIYERARSI.get(r, 99) for r in roller)

    async def _guard(kullanici: CurrentUser) -> Kullanici:
        if _ROL_HIYERARSI.get(kullanici.rol, 0) < min_seviye:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Yetki yetersiz (gerekli: {' / '.join(roller)}).")
        return kullanici

    return _guard


__all__ = ("get_current_user", "CurrentUser", "require_role")
