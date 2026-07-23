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

import structlog
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agents.config import saklama_suresi
from db.models import BilgiUnsuru, GelenEvrak, Islem, KanitSpan, Taslak

log = structlog.get_logger()

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


async def yetim_gelen_evrak(session: AsyncSession) -> list[dict]:
    """Hiç işlemi (Islem) olmayan gelen_evrak — persist_islem hiç çalışmamış/yarım kalmış
    kayıtlar (ör. eski atomik-olmayan persist yarım kesintisi).

    suresi_dolmus() Islem'e INNER JOIN yaptığından bu kayıtlar oraya HİÇ girmez → saklama
    süresi taraması onları göremez, otomatik imha/anonimleştirme sonsuza dek atlar
    (regresyon bulgusu). Burada AYRI yüzeye çıkar — yalnız görünürlük/rapor amaçlı; tür
    bilinmediğinden (Islem yok → evrak_turu_kod yok) otomatik imhaya DAHİL EDİLMEZ, elle
    incelemeye bırakılır (imha_job.py raporu).
    """
    rows = (await session.execute(
        select(GelenEvrak.id, GelenEvrak.evrak_no, GelenEvrak.olusturuldu)
        .outerjoin(Islem, Islem.gelen_evrak_id == GelenEvrak.id)
        .where(Islem.id.is_(None)))).all()
    return [{"id": r.id, "evrak_no": r.evrak_no, "olusturuldu": r.olusturuldu} for r in rows]


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
        # Islem'e türetilmiş İÇERİK de anonimleştirilir — ozet/bilgilendirme (özet+bildirim
        # metni), bilgi_unsurlari (çıkarılan alanlar) ve kanit_metadata (maskeli TAM belge
        # metni). Yoksa docstring'in "içeriği sil" garantisi kısmi kalıyordu: ocr_metni
        # silinse de aynı içerik Islem/Taslak'ta erişilebilir duruyordu (bug avı bulgusu).
        # Struktürel/skor alanları (durum, evrak_turu_kod, risk/sla/arsiv_metadata, süreler)
        # KORUNUR → denetim iskeleti + istatistik bozulmaz.
        await session.execute(update(Islem).where(Islem.id.in_(iids))
                              .values(ozet="", bilgilendirme="", bilgi_unsurlari={}, kanit_metadata={}))
        # O işlemlere bağlı taslak (resmî yazı) tam metni + konusu da anonimleştirilir.
        await session.execute(update(Taslak).where(Taslak.islem_id.in_(iids))
                              .values(metin_md=_ANONIM, konu="[anonim]"))
    await session.commit()


async def sil(session: AsyncSession, *, evrak_id: uuid.UUID) -> None:
    """Tam imha (cascade islem→denetim). Append-only trigger kontrollü-imha GUC'siyle aşılır."""
    await session.execute(text("SET LOCAL app.denetim_silmeye_izin = 'on'"))
    await session.execute(delete(GelenEvrak).where(GelenEvrak.id == evrak_id))
    await session.commit()


async def imha_uygula(session: AsyncSession, *, simdi: _dt.datetime | None = None,
                      yontem: str = "anonimlestir") -> dict:
    """Süresi dolan tüm evraklara imha uygula. yontem: 'anonimlestir' | 'sil'. Özet döner.

    Dayanıklılık (bug avı 2026-07-23): 'sil' yolunda gönderilmiş/onaylanmış evrak taslak
    giden_evrak'a RESTRICT FK ile bağlıysa DELETE ForeignKeyViolation atar. Eskiden bu
    yakalanmıyordu → job traceback ile çöküyor, önceki evraklar silinmiş kalıyor, sonrakiler
    hiç işlenmiyor, sorunlu kayıt bir daha imha edilemiyordu (KVKK md.7 yükümlülüğü bloke).
    Artık her kayıt izole: hata → rollback + anonimleştirmeye düş (imha yine karşılanır) +
    başarısızları raporla. Tek kayıt tüm koşumu düşürmez.
    """
    dolmus = await suresi_dolmus(session, simdi=simdi)
    islem_fn = sil if yontem == "sil" else anonimlestir
    basarili: list[str] = []
    basarisiz: list[str] = []
    for d in dolmus:
        try:
            await islem_fn(session, evrak_id=d["id"])
            basarili.append(d["evrak_no"])
        except IntegrityError:
            await session.rollback()  # RESTRICT FK (gönderilmiş taslak) → silinemez; anonimleştir
            try:
                await anonimlestir(session, evrak_id=d["id"])
                basarili.append(f"{d['evrak_no']} (silinemedi → anonimleştirildi)")
            except Exception as exc:
                await session.rollback()
                log.warning("imha_kayit_basarisiz", evrak_no=d["evrak_no"], error=type(exc).__name__)
                basarisiz.append(d["evrak_no"])
    return {"yontem": yontem, "imha_edilen": len(basarili),
            "evraklar": basarili, "basarisiz": basarisiz}


__all__ = ("anonimlestir", "imha_uygula", "saklama_yil", "sil", "suresi_dolmus", "yetim_gelen_evrak")
