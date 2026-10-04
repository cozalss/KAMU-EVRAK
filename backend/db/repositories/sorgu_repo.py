"""Görünüm sorguları (Faz 7) — panel istatistik + liste okuyucular (sayfalama+filtre).

Frontend görünümlerini (Panel/Gelen/Giden/Taslaklar/Denetim) DB'den besler. Salt-okunur,
parametrize. FilterBar parametreleri: durum/risk/tür/birim/arama + limit/offset.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.nodes.sla_triyaj import sla_tazele
from db.models import (
    Birim,
    DenetimIzi,
    GelenEvrak,
    GidenEvrak,
    Islem,
    Mevzuat,
    Onay,
    RiskDegerlendirme,
    Taslak,
)

_MAX_LIMIT = 100


def _clamp(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, _MAX_LIMIT)), max(0, offset)


def onay_durumu_turet(
    taslak_islem: dict[uuid.UUID, uuid.UUID], onaylar: list,
) -> tuple[dict[uuid.UUID, object], set[uuid.UUID]]:
    """İşlem-düzeyi onay durumu: (islem_id → en son karar onayı, karar BEKLEYEN islem_id'ler).

    Kural: işlemin taslağı varsa ve HEPSİNE karar verilmişse → en son karar; herhangi bir
    taslağı kararsızsa → karar bekliyor (çok-konuluda kısmî karar işlemi "bitti" saymaz).
    `onaylar` kronolojik ARTAN sırada verilmeli (sonuncu kazanır). Saf fonksiyon —
    tests/test_sorgu_onay_turet.py'de DB'siz doğrulanır.
    """
    kararli_taslak: set[uuid.UUID] = set()
    son_onay: dict[uuid.UUID, object] = {}
    for o in onaylar:
        if o.karar != "bekliyor" and o.taslak_id in taslak_islem:
            kararli_taslak.add(o.taslak_id)
            son_onay[taslak_islem[o.taslak_id]] = o
    bekleyen = {iid for tid, iid in taslak_islem.items() if tid not in kararli_taslak}
    return {iid: o for iid, o in son_onay.items() if iid not in bekleyen}, bekleyen


async def panel_istatistik(session: AsyncSession, *, owner_id: uuid.UUID) -> dict:
    """Panel kartları — sayımlar + risk/tür dağılımı (SQL agregasyon).

    NOT: sayımlar aynı AsyncSession üzerinde SIRALI koşar (SQLAlchemy async session
    eşzamanlı sorgu desteklemez — asyncio.gather burada MissingGreenlet üretir)."""
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


def _birim_adi(arsiv: dict | None) -> str:
    """Arşiv üst-verisindeki etkin birim adı (yoksa "")."""
    ad = (arsiv or {}).get("birim") if isinstance(arsiv, dict) else ""
    return str(ad or "").strip()[:160]


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
        # Birim kodu yoksa (serbest-metin yönlendirme) taslağın hitap ettiği etkin birim ADI —
        # liste ve detay "—" yerine gönderilen yazının birimini gösterir (istemci adı aynen basar).
        "alici_birim": birim_kod or _birim_adi(islem.arsiv_metadata if islem else None),
        "guven": float(islem.tur_confidence) if islem and islem.tur_confidence else None,
        "taslak": taslak.metin_md if taslak else "",
        "evrak_turu": islem.evrak_turu_kod if islem else "",
        "kaynak_evrak_adi": evrak.baslik if evrak else "",
        "son_hash": giden.son_hash or "",
        "gonderim_tarihi": giden.gonderim_tarihi.isoformat(),
    } for giden, taslak, islem, evrak, birim_kod in rows]


async def taslak_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                         limit: int = 20, offset: int = 0) -> list[dict]:
    """Yalnız KARAR BEKLEYEN taslaklar — karar verilmiş (onaylanmış/reddedilmiş/düzenlenerek
    gönderilmiş) taslak Giden Evrak'ın konusudur; eskiden süresiz burada da listeleniyordu
    (sağlık taraması bulgusu). NOT EXISTS ile: onay(taslak_id) üzerinde DB-düzeyi UNIQUE
    yok (yalnız uygulama-düzeyi teklik — karar_repo tek yazım noktası); outer-join+filtre
    o varsayıma yaslanırdı, NOT EXISTS satır çoğaltamaz (review bulgusu)."""
    limit, offset = _clamp(limit, offset)
    kararli = (
        select(Onay.id)
        .where(Onay.taslak_id == Taslak.id, Onay.karar != "bekliyor")
        .correlate(Taslak)
        .exists()
    )
    rows = (await session.execute(
        select(Taslak)
        .join(Islem, Islem.id == Taslak.islem_id)
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .where(GelenEvrak.olusturan_id == owner_id)
        .where(~kararli)
        .order_by(Taslak.olusturuldu.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return [{
        "id": str(r.id), "yazi_turu_kod": r.yazi_turu_kod, "konu": r.konu,
        "format_uyumlu": r.format_uyumlu, "surum": r.surum,
        "olusturuldu": r.olusturuldu.isoformat(),
    } for r in rows]


async def islem_listele(session: AsyncSession, *, owner_id: uuid.UUID,
                        limit: int = 50, offset: int = 0) -> list[dict]:
    """Kalıcı işlem geçmişi — frontend session-state şekline yakın, tek sorguda özet.

    Çok-konulu evrakta bir işlemin BİRDEN ÇOK taslağı olabilir (bkz. taslak.alt_talep_id) —
    düz outerjoin bu durumda işlem satırını çoğaltırdı. Bunun yerine her işlem için TEK
    "temsilci" taslak seçilir: önce tekil/whole-doc taslak (alt_talep_id IS NULL), yoksa
    en erken oluşturulan birim taslağı (liste özetinde tek satır/tek taslak metni yeterli;
    tüm birim taslakları taslak_listele()'de zaten ayrı ayrı görünür).
    """
    limit, offset = _clamp(limit, offset)
    temsilci_taslak_id = (
        select(Taslak.id)
        .where(Taslak.islem_id == Islem.id)
        .order_by(Taslak.alt_talep_id.is_(None).desc(), Taslak.olusturuldu.asc())
        .limit(1)
        .correlate(Islem)
        .scalar_subquery()
    )
    rows = (await session.execute(
        select(Islem, GelenEvrak, Birim.kod, Taslak, DenetimIzi)
        .join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .outerjoin(Birim, Birim.id == Islem.hedef_birim_id)
        .outerjoin(Taslak, Taslak.id == temsilci_taslak_id)
        .outerjoin(DenetimIzi, DenetimIzi.islem_id == Islem.id)
        .where(GelenEvrak.olusturan_id == owner_id)
        .order_by(Islem.baslangic.desc())
        .limit(limit)
        .offset(offset)
    )).all()
    # Onay durumu işlemin TÜM taslakları üzerinden türetilir — eskiden yalnız temsilci
    # taslağın onayına bakılıyordu; karar BAŞKA taslağa yazılmışsa (ör. çok-konulu evrak,
    # sürüm farkı) işlem sonsuza dek "karar bekliyor" görünüyor, silinen/gönderilen taslak
    # refresh'te taslak kuyruğuna GERİ diriliyordu (kullanıcı bulgusu).
    islem_ids = [i.id for i, _, _, _, _ in rows]
    islem_onay: dict[uuid.UUID, Onay] = {}
    bekleyen_islemler: set[uuid.UUID] = set()
    if islem_ids:
        tid2islem = {tid: iid for tid, iid in (await session.execute(
            select(Taslak.id, Taslak.islem_id).where(Taslak.islem_id.in_(islem_ids)))).all()}
        onay_rows = []
        if tid2islem:
            onay_rows = list((await session.execute(
                select(Onay).where(Onay.taslak_id.in_(list(tid2islem)))
                .order_by(Onay.karar_zamani.asc().nullsfirst()))).scalars())
        islem_onay, bekleyen_islemler = onay_durumu_turet(tid2islem, onay_rows)
    items: list[dict] = []
    for islem, evrak, birim_kod, taslak, denetim in rows:
        onay = islem_onay.get(islem.id)
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
            # Kaynak-doğrulamalı yönlendirme serbest-metin birim üretir; birim tablosunda kodu
            # yoksa hedef_birim_id NULL kalır ve liste "—" basardı. Arşiv üst-verisindeki etkin
            # birim ADI (agents.config.etkili_birim) ayrı alanda taşınır — kod sözleşmesi bozulmaz.
            "hedef_birim_adi": "" if birim_kod else _birim_adi(islem.arsiv_metadata),
            "birim_alternatifleri": list(islem.birim_alternatifleri or []),
            "yazi_turu": taslak.yazi_turu_kod if taslak else "",
            "yazi_taslak_md": taslak.metin_md if taslak else "",
            "format_uyumlu": bool(islem.format_uyumlu),
            "verify_uyari": list(islem.verify_uyari or []),
            "verify_notes": islem.verify_notes or "",
            "bilgilendirme": islem.bilgilendirme or "",
            "arsiv_metadata": islem.arsiv_metadata or {},
            # Tek kaynak: kalan gün okuma anında bugüne göre (Panel /sla ile aynı sayı).
            "sla_metadata": sla_tazele(islem.sla_metadata, _dt.date.today()),
            "denetim_izi": denetim_izi,
            "kanit_metadata": islem.kanit_metadata or {},
            "alt_talepler": [],
            "risk_metadata": islem.risk_metadata or {},
            # Gerçek değer: işlemin karar bekleyen taslağı var mı (eskiden sabit False —
            # dead/yanıltıcı alandı; sağlık taraması bulgusu).
            "onay_bekliyor": islem.id in bekleyen_islemler,
            "thread_id": islem.thread_id or "",
            # Gerçek HITL kararı (onaylandi/duzenlendi/reddedildi) — Panel "Karar bekleyen"
            # ve sohbet "onaylanabilir işlem" bundan beslenir; karar yoksa boş kalır.
            "onay_durumu": onay.karar if onay is not None and onay.karar != "bekliyor" else "",
            "onay_gerekce": (onay.gerekce or "") if onay is not None else "",
            "ocr_engine": evrak.ocr_engine,
            "page_count": evrak.sayfa_sayisi,
            "ocr_confidence": evrak.ocr_confidence,
            "sure_ms": islem.sure_ms,
        }
        items.append({
            "id": str(islem.id),
            "name": evrak.baslik or evrak.evrak_no,
            "kind": evrak.kaynak,
            "ts": int(islem.baslangic.timestamp() * 1000) if islem.baslangic else 0,
            "evrak_turu": result["evrak_turu"],
            "hedef_birim": result["hedef_birim"],
            "hedef_birim_adi": result["hedef_birim_adi"],
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
