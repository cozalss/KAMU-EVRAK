"""Görünüm sorguları (Faz 7) — panel istatistik + liste okuyucular (sayfalama+filtre).

Frontend görünümlerini (Panel/Gelen/Giden/Taslaklar/Denetim) DB'den besler. Salt-okunur,
parametrize. FilterBar parametreleri: durum/risk/tür/birim/arama + limit/offset.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    Birim,
    DenetimIzi,
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


async def panel_istatistik(session: AsyncSession, *, owner_id: uuid.UUID) -> dict:
    """Panel kartları — sayımlar + risk/tür dağılımı (SQL agregasyon)."""
    async def say_gelen() -> int:
        return int(await session.scalar(
            select(func.count()).select_from(GelenEvrak)
            .where(GelenEvrak.olusturan_id == owner_id)) or 0)

    async def say_islem() -> int:
        return int(await session.scalar(
            select(func.count()).select_from(Islem)
            .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
            .where(GelenEvrak.olusturan_id == owner_id)) or 0)

    async def say_taslak() -> int:
        return int(await session.scalar(
            select(func.count()).select_from(Taslak)
            .join(Islem, Islem.id == Taslak.islem_id)
            .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
            .where(GelenEvrak.olusturan_id == owner_id)) or 0)

    risk_rows = (await session.execute(
        select(RiskDegerlendirme.bant, func.count())
        .join(Islem, Islem.id == RiskDegerlendirme.islem_id)
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .where(GelenEvrak.olusturan_id == owner_id)
        .group_by(RiskDegerlendirme.bant))).all()
    tur_rows = (await session.execute(
        select(Islem.evrak_turu_kod, func.count())
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .where(Islem.evrak_turu_kod.is_not(None))
        .where(GelenEvrak.olusturan_id == owner_id)
        .group_by(Islem.evrak_turu_kod))).all()
    return {
        "mevzuat": int(await session.scalar(select(func.count()).select_from(Mevzuat)) or 0),
        "gelen_evrak": await say_gelen(),
        "islem": await say_islem(),
        "giden_evrak": int(await session.scalar(
            select(func.count()).select_from(GidenEvrak)
            .where(GidenEvrak.gonderen_id == owner_id)) or 0),
        "taslak": await say_taslak(),
        "risk_dagilimi": {b: int(n) for b, n in risk_rows},
        "tur_dagilimi": {t: int(n) for t, n in tur_rows},
    }


async def gelen_evrak_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                              limit: int = 20, offset: int = 0,
                              arama: str = "") -> list[dict]:
    limit, offset = _clamp(limit, offset)
    stmt = (
        select(GelenEvrak)
        .where(GelenEvrak.olusturan_id == owner_id)
        .order_by(GelenEvrak.olusturuldu.desc())
    )
    if arama.strip():
        stmt = stmt.where(GelenEvrak.baslik.ilike(f"%{arama.strip()}%"))
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return [{
        "id": str(r.id), "evrak_no": r.evrak_no, "baslik": r.baslik, "kaynak": r.kaynak,
        "sayfa_sayisi": r.sayfa_sayisi, "olusturuldu": r.olusturuldu.isoformat(),
    } for r in rows]


async def giden_evrak_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                              limit: int = 20, offset: int = 0,
                              durum: str = "", risk: str = "") -> list[dict]:
    limit, offset = _clamp(limit, offset)
    stmt = (
        select(GidenEvrak, Taslak, Islem, GelenEvrak, Birim.kod)
        .join(Taslak, Taslak.id == GidenEvrak.taslak_id)
        .outerjoin(Islem, Islem.id == Taslak.islem_id)
        .outerjoin(GelenEvrak, GelenEvrak.id == GidenEvrak.kaynak_evrak_id)
        .outerjoin(Birim, Birim.id == GidenEvrak.alici_birim_id)
        .where(GidenEvrak.gonderen_id == owner_id)
        .order_by(GidenEvrak.gonderim_tarihi.desc())
    )
    if durum:
        stmt = stmt.where(GidenEvrak.durum == durum)
    if risk:
        stmt = stmt.where(GidenEvrak.risk == risk)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).all()
    return [{
        "id": str(giden.id), "giden_no": giden.giden_no, "konu": giden.konu,
        "durum": giden.durum, "risk": giden.risk, "yazi_turu_kod": giden.yazi_turu_kod,
        "alici_birim": birim_kod or "", "taslak": taslak.metin_md if taslak else "",
        "evrak_turu": islem.evrak_turu_kod if islem else "",
        "kaynak_evrak_adi": evrak.baslik if evrak else "",
        "son_hash": giden.son_hash or "",
        "gonderim_tarihi": giden.gonderim_tarihi.isoformat(),
    } for giden, taslak, islem, evrak, birim_kod in rows]


async def taslak_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                         limit: int = 20, offset: int = 0) -> list[dict]:
    limit, offset = _clamp(limit, offset)
    rows = (await session.execute(
        select(Taslak)
        .join(Islem, Islem.id == Taslak.islem_id)
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .where(GelenEvrak.olusturan_id == owner_id)
        .order_by(Taslak.olusturuldu.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return [{
        "id": str(r.id), "yazi_turu_kod": r.yazi_turu_kod, "konu": r.konu,
        "format_uyumlu": r.format_uyumlu, "surum": r.surum,
        "olusturuldu": r.olusturuldu.isoformat(),
    } for r in rows]


async def islem_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                        limit: int = 50, offset: int = 0) -> list[dict]:
    """Kalıcı işlem geçmişi — frontend session-state şekline yakın, tek sorguda özet."""
    limit, offset = _clamp(limit, offset)
    rows = (await session.execute(
        select(Islem, GelenEvrak, Birim.kod, Taslak, DenetimIzi)
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .outerjoin(Birim, Birim.id == Islem.hedef_birim_id)
        .outerjoin(Taslak, Taslak.islem_id == Islem.id)
        .outerjoin(DenetimIzi, DenetimIzi.islem_id == Islem.id)
        .where(GelenEvrak.olusturan_id == owner_id)
        .order_by(Islem.baslangic.desc())
        .limit(limit)
        .offset(offset)
    )).all()
    items: list[dict] = []
    for islem, evrak, birim_kod, taslak, denetim in rows:
        denetim_izi = {}
        if denetim is not None:
            denetim_izi = {
                "son_hash": denetim.son_hash,
                "kok_hash": denetim.kok_hash,
                "adim_sayisi": denetim.adim_sayisi,
                "butunluk": denetim.butunluk,
            }
        result = {
            "islem_id": str(islem.id),
            "evrak_turu": islem.evrak_turu_kod or "belirsiz",
            "tur_confidence": islem.tur_confidence or 0,
            "bilgi_unsurlari": islem.bilgi_unsurlari or {},
            "eksik_alanlar": list(islem.eksik_alanlar or []),
            "clarify_questions": list(islem.clarify_questions or []),
            "mevzuat_onerileri": [],
            "mevzuat_nli": [],
            "ozet": islem.ozet or "",
            "hedef_birim": birim_kod or "",
            "birim_alternatifleri": list(islem.birim_alternatifleri or []),
            "yazi_turu": taslak.yazi_turu_kod if taslak else "",
            "yazi_taslak_md": taslak.metin_md if taslak else "",
            "format_uyumlu": bool(islem.format_uyumlu),
            "verify_uyari": list(islem.verify_uyari or []),
            "verify_notes": islem.verify_notes or "",
            "bilgilendirme": islem.bilgilendirme or "",
            "arsiv_metadata": islem.arsiv_metadata or {},
            "sla_metadata": islem.sla_metadata or {},
            "denetim_izi": denetim_izi,
            "kanit_metadata": islem.kanit_metadata or {},
            "alt_talepler": [],
            "risk_metadata": islem.risk_metadata or {},
            "onay_bekliyor": False,
            "thread_id": islem.thread_id or "",
            "onay_durumu": "",
            "onay_gerekce": "",
            "ocr_engine": evrak.ocr_engine,
            "page_count": evrak.sayfa_sayisi,
            "ocr_confidence": evrak.ocr_confidence,
        }
        items.append({
            "id": str(islem.id),
            "name": evrak.baslik or evrak.evrak_no,
            "kind": evrak.kaynak,
            "ts": int(islem.baslangic.timestamp() * 1000) if islem.baslangic else 0,
            "evrak_turu": result["evrak_turu"],
            "hedef_birim": result["hedef_birim"],
            "bant": result["risk_metadata"].get("bant"),
            "result": result,
        })
    return items


async def islem_detay(session: AsyncSession, islem_id: uuid.UUID,
                      owner_id: uuid.UUID | None = None) -> dict | None:
    stmt = select(Islem).where(Islem.id == islem_id)
    if owner_id is not None:
        stmt = stmt.join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id).where(
            GelenEvrak.olusturan_id == owner_id)
    islem = await session.scalar(stmt)
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
    "islem_listele",
    "panel_istatistik",
    "taslak_listele",
)
