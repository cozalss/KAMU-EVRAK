"""HITL karar persistence (Faz 4) — onay + giden_evrak (outbox).

Memur taslağı onaylar/düzenler/reddeder → onay satırı yazılır; reddedilmediyse
giden_evrak (E-G-YYYY/NNNN) üretilir. Çift-gönderim DB partial-unique ile engellenir
(giden_evrak.taslak_id, durum<>reddedildi). risk + son_hash islem'den taşınır.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import DenetimIzi, GidenEvrak, Islem, Onay, RiskDegerlendirme, Taslak

# Frontend seçimi → onay_karari + giden_durumu enum.
_KARAR = {"onayla": "onaylandi", "duzenle": "duzenlendi", "reddet": "reddedildi"}
_GIDEN = {"onaylandi": "gonderildi", "duzenlendi": "duzenlendi", "reddedildi": "reddedildi"}


class KararError(Exception):
    """kod: 'taslak_yok' | 'zaten_gonderildi'."""

    def __init__(self, kod: str, mesaj: str) -> None:
        super().__init__(mesaj)
        self.kod, self.mesaj = kod, mesaj


async def _giden_no(session: AsyncSession) -> str:
    yil = _dt.datetime.now(_dt.UTC).year
    n = int(await session.scalar(select(func.count()).select_from(GidenEvrak)) or 0)
    return f"E-G-{yil}/{n + 1:04d}"


async def onayla_ve_gonder(
    session: AsyncSession, *, islem_id: uuid.UUID, kullanici_id: uuid.UUID,
    secim: str = "onayla", gerekce: str = "",
) -> dict:
    """Taslağı onayla/düzenle/reddet → onay (+ giden_evrak). Döner: {karar, giden_no?}."""
    taslak = await session.scalar(
        select(Taslak).where(Taslak.islem_id == islem_id)
        .order_by(Taslak.surum.desc()).limit(1))
    if taslak is None:
        raise KararError("taslak_yok", "Bu işleme ait taslak bulunamadı.")

    karar = _KARAR.get(secim, "onaylandi")
    session.add(Onay(
        taslak_id=taslak.id, karar=karar, karar_veren_id=kullanici_id,
        gerekce=gerekce or None, karar_zamani=_dt.datetime.now(_dt.UTC)))

    # Karar arşivi: onay/duzenle gönderim, red ise reddedildi kaydı olarak giden_evrak'a düşer.
    # Çift-gönderim kontrolü (partial-unique zaten korur; erken net hata için).
    giden_no = None
    if karar != "reddedildi":
        mevcut = await session.scalar(
            select(GidenEvrak.id).where(GidenEvrak.taslak_id == taslak.id,
                                        GidenEvrak.durum != "reddedildi"))
        if mevcut is not None:
            raise KararError("zaten_gonderildi", "Bu taslak zaten gönderilmiş.")
    islem = await session.get(Islem, islem_id)
    risk = await session.scalar(
        select(RiskDegerlendirme.bant).where(RiskDegerlendirme.islem_id == islem_id))
    izi = await session.get(DenetimIzi, islem_id)
    giden_no = await _giden_no(session)
    session.add(GidenEvrak(
        giden_no=giden_no, taslak_id=taslak.id,
        kaynak_evrak_id=islem.gelen_evrak_id if islem else None,
        konu=taslak.konu, alici_birim_id=islem.hedef_birim_id if islem else None,
        yazi_turu_kod=taslak.yazi_turu_kod, risk=risk,
        durum=_GIDEN.get(karar, "gonderildi"), gonderen_id=kullanici_id,
        son_hash=izi.son_hash if izi else None))

    await session.commit()
    return {"karar": karar, "giden_no": giden_no}


async def taslak_sil(session: AsyncSession, *, islem_id: uuid.UUID) -> dict:
    """İşleme ait KARAR BEKLEYEN taslağı kalıcı sil (kullanıcının 'Sil' eylemi).

    Yalnız taslak satır(lar)ı silinir — işlem kaydı ve denetim izi (Sayıştay/KVKK)
    dokunulmaz kalır. Karar verilmiş (onay satırı olan) taslak İMHA EDİLEMEZ →
    KararError('karar_verildi'); bekleyen onay satırları taslakla CASCADE düşer.
    """
    taslaklar = list((await session.scalars(
        select(Taslak).where(Taslak.islem_id == islem_id))).all())
    if not taslaklar:
        raise KararError("taslak_yok", "Bu işleme ait taslak bulunamadı.")
    karar_var = await session.scalar(
        select(Onay.id).where(
            Onay.taslak_id.in_([t.id for t in taslaklar]),
            Onay.karar != "bekliyor").limit(1))
    if karar_var is not None:
        raise KararError("karar_verildi", "Karar verilmiş taslak silinemez — Giden Evrak kaydına bağlı.")
    for t in taslaklar:
        await session.delete(t)
    await session.commit()
    return {"silindi": True, "adet": len(taslaklar)}


__all__ = ("KararError", "onayla_ve_gonder", "taslak_sil")
