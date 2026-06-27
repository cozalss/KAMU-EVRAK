"""Saklama süresi imha/anonimleştirme (Faz 8 — KVKK md.7 + 3473 s.K. / SDP).

Saklama süresi dolan gelen evrak ya ANONİMLEŞTİRİLİR (içerik silinir, denetim izi/işlem
kaydı korunur — tercih edilen) ya da tamamen SİLİNİR (cascade; denetim append-only
trigger'ı kontrollü-imha GUC'siyle aşılır). Süre evrak türünden (config.saklama_suresi)
ve gelen_evrak.olusturuldu'dan hesaplanır. "Süresiz"/belirsiz tür → ASLA imha (güvenli).
"""
from __future__ import annotations

import datetime as _dt
import re
import uuid

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from agents.config import saklama_suresi
from db.models import BilgiUnsuru, GelenEvrak, Islem, KanitSpan

_ANONIM = "[İMHA EDİLDİ — saklama süresi doldu (KVKK md.7)]"
_GUN_YIL = 365


def saklama_yil(evrak_turu_kod: str | None) -> int | None:
    """Tür → saklama yılı (int). 'Süresiz'/belirsiz/[DOĞRULA] → None (asla imha)."""
    if not evrak_turu_kod:
        return None
    m = re.search(r"(\d+)\s*yıl", saklama_suresi(evrak_turu_kod))
    return int(m.group(1)) if m else None


async def suresi_dolmus(session: AsyncSession, *, simdi: _dt.datetime | None = None
                        ) -> list[dict]:
    """Saklama süresi dolmuş evraklar. Tür, en güncel işlemin evrak_turu_kod'undan."""
    simdi = simdi or _dt.datetime.now(_dt.UTC)
    rows = (await session.execute(
        select(GelenEvrak.id, GelenEvrak.evrak_no, GelenEvrak.olusturuldu,
               Islem.evrak_turu_kod, Islem.baslangic)
        .join(Islem, Islem.gelen_evrak_id == GelenEvrak.id)
        .order_by(GelenEvrak.id, Islem.baslangic.desc()))).all()
    seen: set = set()
    dolmus: list[dict] = []
    for r in rows:
        if r.id in seen:
            continue
        seen.add(r.id)               # en güncel işlem (desc) → tür
        yil = saklama_yil(r.evrak_turu_kod)
        if yil is None:
            continue
        son = r.olusturuldu + _dt.timedelta(days=_GUN_YIL * yil)
        if simdi > son:
            dolmus.append({
                "id": r.id, "evrak_no": r.evrak_no, "tur": r.evrak_turu_kod,
                "saklama_yil": yil, "olusturuldu": r.olusturuldu, "son_tarih": son,
            })
    return dolmus


async def anonimlestir(session: AsyncSession, *, evrak_id: uuid.UUID) -> None:
    """İçeriği sil, kayıt iskeletini koru (denetim izi/işlem zinciri bozulmaz — KVKK anonim)."""
    await session.execute(update(GelenEvrak).where(GelenEvrak.id == evrak_id)
                          .values(ocr_metni=_ANONIM, baslik="[anonim]"))
    iids = (await session.scalars(select(Islem.id).where(Islem.gelen_evrak_id == evrak_id))).all()
    if iids:
        await session.execute(update(BilgiUnsuru).where(BilgiUnsuru.islem_id.in_(iids))
                              .values(deger_maskeli="[anonim]"))
        await session.execute(update(KanitSpan).where(KanitSpan.islem_id.in_(iids))
                              .values(deger="[anonim]"))
    await session.commit()


async def sil(session: AsyncSession, *, evrak_id: uuid.UUID) -> None:
    """Tam imha (cascade islem→denetim). Append-only trigger kontrollü-imha GUC'siyle aşılır."""
    await session.execute(text("SET LOCAL app.denetim_silmeye_izin = 'on'"))
    await session.execute(delete(GelenEvrak).where(GelenEvrak.id == evrak_id))
    await session.commit()


async def imha_uygula(session: AsyncSession, *, simdi: _dt.datetime | None = None,
                      yontem: str = "anonimlestir") -> dict:
    """Süresi dolan tüm evraklara imha uygula. yontem: 'anonimlestir' | 'sil'. Özet döner."""
    dolmus = await suresi_dolmus(session, simdi=simdi)
    islem_fn = sil if yontem == "sil" else anonimlestir
    for d in dolmus:
        await islem_fn(session, evrak_id=d["id"])
    return {"yontem": yontem, "imha_edilen": len(dolmus),
            "evraklar": [d["evrak_no"] for d in dolmus]}


__all__ = ("anonimlestir", "imha_uygula", "saklama_yil", "sil", "suresi_dolmus")
