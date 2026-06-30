"""Kalıcı kayıt görünümleri — REST (Faz 7). Frontend'i oturum-state yerine DB'den besler.

Tümü auth-korumalı (get_current_user). FilterBar parametreleri query string ile.
Mevzuat araması gerçek seed korpusta (233 mevzuat / 1506 chunk) çalışır.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import CurrentUser, require_role
from db.models import Birim, Kullanici
from db.repositories import KararError, dogrula_denetim, onayla_ve_gonder
from db.repositories.mevzuat_repo import hybrid_ara
from db.repositories.sorgu_repo import (
    gelen_evrak_listele,
    giden_evrak_listele,
    islem_detay,
    islem_listele,
    panel_istatistik,
    taslak_listele,
)
from db.session import get_session

router = APIRouter(tags=["kayitlar"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/referans/birimler")
async def birimler(session: Session) -> dict:
    """Aktif birim listesi (kayıt formu dropdown'u için PUBLIC — auth gerekmez)."""
    rows = (await session.execute(
        select(Birim.kod, Birim.ad).where(Birim.aktif).order_by(Birim.ad))).all()
    return {"birimler": [{"kod": k, "ad": a} for k, a in rows]}


@router.get("/panel/istatistik")
async def panel(_user: CurrentUser, session: Session) -> dict:
    return await panel_istatistik(session, owner_id=_user.id)


@router.get("/mevzuat/ara")
async def mevzuat_ara(
    _user: CurrentUser, session: Session,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict:
    sonuc = await hybrid_ara(session, q=q, limit=limit)
    return {"q": q, "adet": len(sonuc), "sonuclar": sonuc}


@router.get("/gelen-evrak")
async def gelen_evrak(
    _user: CurrentUser, session: Session,
    arama: Annotated[str, Query(max_length=200)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows = await gelen_evrak_listele(
        session, owner_id=_user.id, limit=limit, offset=offset, arama=arama)
    return {"adet": len(rows), "kayitlar": rows}


@router.get("/giden-evrak")
async def giden_evrak(
    _user: CurrentUser, session: Session,
    durum: Annotated[str, Query(max_length=20)] = "",
    risk: Annotated[str, Query(max_length=10)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows = await giden_evrak_listele(
        session, owner_id=_user.id, limit=limit, offset=offset, durum=durum, risk=risk)
    return {"adet": len(rows), "kayitlar": rows}


@router.get("/taslaklar")
async def taslaklar(
    _user: CurrentUser, session: Session,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows = await taslak_listele(session, owner_id=_user.id, limit=limit, offset=offset)
    return {"adet": len(rows), "kayitlar": rows}


@router.get("/islemler")
async def islemler(
    _user: CurrentUser, session: Session,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows = await islem_listele(session, owner_id=_user.id, limit=limit, offset=offset)
    return {"adet": len(rows), "kayitlar": rows}


@router.get("/islem/{islem_id}")
async def islem(islem_id: uuid.UUID, _user: CurrentUser, session: Session) -> dict:
    detay = await islem_detay(session, islem_id, owner_id=_user.id)
    if detay is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "İşlem bulunamadı.")
    return detay


@router.get("/islem/{islem_id}/denetim/dogrula")
async def denetim_dogrula(islem_id: uuid.UUID, _user: CurrentUser, session: Session) -> dict:
    """Denetim izinin bütünlüğünü DB'den bağımsız yeniden hesapla (tamper-evident)."""
    if await islem_detay(session, islem_id, owner_id=_user.id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "İşlem bulunamadı.")
    return await dogrula_denetim(session, islem_id=islem_id)


class OnaylaRequest(BaseModel):
    secim: str = Field("onayla", pattern="^(onayla|duzenle|reddet)$")
    gerekce: str = Field("", max_length=2000)


@router.post("/islem/{islem_id}/onayla")
async def onayla(
    islem_id: uuid.UUID, req: OnaylaRequest, session: Session,
    kullanici: Annotated[Kullanici, Depends(require_role("memur"))],
) -> dict:
    """HITL kararı (yetkili+) → onay + giden_evrak. Reddedilirse yalnız onay yazılır."""
    try:
        if await islem_detay(session, islem_id, owner_id=kullanici.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "İşlem bulunamadı.")
        return await onayla_ve_gonder(
            session, islem_id=islem_id, kullanici_id=kullanici.id,
            secim=req.secim, gerekce=req.gerekce)
    except KararError as e:
        kod = status.HTTP_404_NOT_FOUND if e.kod == "taslak_yok" else status.HTTP_409_CONFLICT
        raise HTTPException(kod, e.mesaj) from e


__all__ = ("router",)
