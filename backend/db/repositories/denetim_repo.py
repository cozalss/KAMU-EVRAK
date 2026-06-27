"""Denetim izi (SHA-256 hash-zinciri) DB persistence + bütünlük doğrulama (Faz 5).

Hash mantığı agents/nodes/denetim_izi (build_chain/dogrula_zincir/_hash) ile AYNI —
DB yalnız kalıcı saklama + bağımsız doğrulamadır (Sayıştay/KVKK m.12 işleme kaydı).
denetim_adimi append-only (trigger); kontrollü imha app.denetim_silmeye_izin GUC ile.

karar_json kanonik JSON ile hash'lenir (sort_keys) → JSONB round-trip sıra-bağımsız.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.nodes.denetim_izi import _GENESIS, dogrula_zincir
from db.models import DenetimAdimi, DenetimIzi


async def persist_denetim(
    session: AsyncSession, *, islem_id: uuid.UUID, denetim_izi: dict,
) -> DenetimIzi | None:
    """denetim_izi meta'sını (zincir + kök/son hash) DB'ye yazar. Boş zincir → None.

    Şema: kok_hash = genesis (zincirin ilk öncekisi); son_hash = tüm akışın parmak izi
    (meta['kok_hash'] = son halka hash'i). 1:1 islem (PK islem_id) → tek kez yazılır.
    """
    zincir = (denetim_izi or {}).get("zincir") or []
    if not zincir:
        return None
    izi = DenetimIzi(
        islem_id=islem_id, kok_hash=_GENESIS,
        son_hash=denetim_izi.get("kok_hash", zincir[-1]["hash"]),
        adim_sayisi=denetim_izi.get("adim_sayisi", len(zincir)),
        butunluk=bool(denetim_izi.get("butunluk", True)),
    )
    session.add(izi)
    session.add_all([
        DenetimAdimi(
            islem_id=islem_id, sira=i + 1, adim_adi=str(e["adim"]),
            karar_json=e["veri"], onceki_hash=str(e["onceki"]), hash=str(e["hash"]),
        )
        for i, e in enumerate(zincir)
    ])
    await session.commit()
    await session.refresh(izi)
    return izi


async def dogrula_denetim(session: AsyncSession, *, islem_id: uuid.UUID) -> dict:
    """DB'deki zinciri bağımsız yeniden hesaplayıp bütünlüğü doğrula.

    Döner: {var, butunluk, kirik_adim (1-tabanlı | None), adim_sayisi, son_hash_eslesme}.
    Bir denetim_adimi sonradan değiştirilmişse (hash/karar) yeniden hesap tutmaz → tespit.
    """
    adimlar = (await session.execute(
        select(DenetimAdimi).where(DenetimAdimi.islem_id == islem_id)
        .order_by(DenetimAdimi.sira))).scalars().all()
    if not adimlar:
        return {"var": False, "butunluk": False, "kirik_adim": None,
                "adim_sayisi": 0, "son_hash_eslesme": False}
    zincir = [{"adim": a.adim_adi, "veri": a.karar_json, "hash": a.hash,
               "onceki": a.onceki_hash} for a in adimlar]
    butun, kirik = dogrula_zincir(zincir)
    izi = await session.get(DenetimIzi, islem_id)
    son_eslesme = bool(izi and izi.son_hash == adimlar[-1].hash)
    return {
        "var": True, "butunluk": butun and son_eslesme,
        "kirik_adim": (kirik + 1) if kirik >= 0 else None,
        "adim_sayisi": len(adimlar), "son_hash_eslesme": son_eslesme,
    }


__all__ = ("persist_denetim", "dogrula_denetim")
