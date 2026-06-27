"""Görünüm sorguları (Faz 7) — panel istatistik + liste okuyucular (sayfalama+filtre).

Frontend görünümlerini (Panel/Gelen/Giden/Taslaklar/Denetim) DB'den besler. Salt-okunur,
parametrize. FilterBar parametreleri: durum/risk/tür/birim/arama + limit/offset.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    GelenEvrak,
    GidenEvrak,
    Islem,
    Mevzuat,
    RiskDegerlendirme,
    Taslak,
)

_MAX_LIMIT = 100


def _clamp(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, _MAX_LIMIT)), max(0, offset)


async def panel_istatistik(session: AsyncSession) -> dict:
    """Panel kartları — sayımlar + risk/tür dağılımı (SQL agregasyon)."""
    async def say(model) -> int:
        return int(await session.scalar(select(func.count()).select_from(model)) or 0)

    risk_rows = (await session.execute(
        select(RiskDegerlendirme.bant, func.count())
        .group_by(RiskDegerlendirme.bant))).all()
    tur_rows = (await session.execute(
        select(Islem.evrak_turu_kod, func.count())
        .where(Islem.evrak_turu_kod.is_not(None))
        .group_by(Islem.evrak_turu_kod))).all()
    return {
        "mevzuat": await say(Mevzuat),
        "gelen_evrak": await say(GelenEvrak),
        "islem": await say(Islem),
        "giden_evrak": await say(GidenEvrak),
        "taslak": await say(Taslak),
        "risk_dagilimi": {b: int(n) for b, n in risk_rows},
        "tur_dagilimi": {t: int(n) for t, n in tur_rows},
    }


async def gelen_evrak_listele(session: AsyncSession, *, limit: int = 20, offset: int = 0,
                              arama: str = "") -> list[dict]:
    limit, offset = _clamp(limit, offset)
    stmt = select(GelenEvrak).order_by(GelenEvrak.olusturuldu.desc())
    if arama.strip():
        stmt = stmt.where(GelenEvrak.baslik.ilike(f"%{arama.strip()}%"))
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return [{
        "id": str(r.id), "evrak_no": r.evrak_no, "baslik": r.baslik, "kaynak": r.kaynak,
        "sayfa_sayisi": r.sayfa_sayisi, "olusturuldu": r.olusturuldu.isoformat(),
    } for r in rows]


async def giden_evrak_listele(session: AsyncSession, *, limit: int = 20, offset: int = 0,
                              durum: str = "", risk: str = "") -> list[dict]:
    limit, offset = _clamp(limit, offset)
    stmt = select(GidenEvrak).order_by(GidenEvrak.gonderim_tarihi.desc())
    if durum:
        stmt = stmt.where(GidenEvrak.durum == durum)
    if risk:
        stmt = stmt.where(GidenEvrak.risk == risk)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return [{
        "id": str(r.id), "giden_no": r.giden_no, "konu": r.konu, "durum": r.durum,
        "risk": r.risk, "yazi_turu_kod": r.yazi_turu_kod,
        "gonderim_tarihi": r.gonderim_tarihi.isoformat(),
    } for r in rows]


async def taslak_listele(session: AsyncSession, *, limit: int = 20, offset: int = 0) -> list[dict]:
    limit, offset = _clamp(limit, offset)
    rows = (await session.execute(
        select(Taslak).order_by(Taslak.olusturuldu.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return [{
        "id": str(r.id), "yazi_turu_kod": r.yazi_turu_kod, "konu": r.konu,
        "format_uyumlu": r.format_uyumlu, "surum": r.surum,
        "olusturuldu": r.olusturuldu.isoformat(),
    } for r in rows]


async def islem_detay(session: AsyncSession, islem_id: uuid.UUID) -> dict | None:
    islem = await session.get(Islem, islem_id)
    if islem is None:
        return None
    return {
        "id": str(islem.id), "durum": islem.durum, "evrak_turu_kod": islem.evrak_turu_kod,
        "tur_confidence": islem.tur_confidence, "ozet": islem.ozet,
        "eksik_alanlar": list(islem.eksik_alanlar), "format_uyumlu": islem.format_uyumlu,
        "risk_metadata": islem.risk_metadata, "sla_metadata": islem.sla_metadata,
        "arsiv_metadata": islem.arsiv_metadata,
    }


__all__ = (
    "gelen_evrak_listele",
    "giden_evrak_listele",
    "islem_detay",
    "panel_istatistik",
    "taslak_listele",
)
