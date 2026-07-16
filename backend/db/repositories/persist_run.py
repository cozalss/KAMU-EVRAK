"""Pipeline koşumu → DB (ENV-gated adapter). DB_PERSIST=1 iken process() çağırır.

Demo güvenliği: bu modül LAZY import edilir (DATABASE_URL yoksa app yine boot eder);
persistence hatası ASLA yanıtı bozmaz (çağıran try/except + log). Auth'suz demo akışı
için otomatik 'sistem' kullanıcısı (rol=sistem) olusturan olarak kullanılır.
KVKK: ocr_metni MASKELİ yazılır (kanit_metadata.metin veya mask_pii).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select

from api.pii import mask_pii
from db.models import Birim, Kullanici
from db.repositories import evrak_olustur, persist_denetim, persist_islem
from db.session import session_factory

_SISTEM_EPOSTA = "sistem@kamu-evrak.local"


async def _sistem_kullanici(session) -> Kullanici:
    """Otomatik koşumların olusturan'ı — get-or-create (rol=sistem)."""
    k = await session.scalar(select(Kullanici).where(Kullanici.eposta == _SISTEM_EPOSTA))
    if k is not None:
        return k
    from auth.security import hash_parola
    birim = await session.scalar(select(Birim).limit(1))
    if birim is None:
        raise RuntimeError("birim seed yok — db.seed_referans çalıştırın")
    k = Kullanici(eposta=_SISTEM_EPOSTA, parola_hash=hash_parola(uuid.uuid4().hex),
                  ad_soyad="Sistem (otomatik)", rol="sistem", birim_id=birim.id, aktif=False)
    session.add(k)
    await session.commit()
    await session.refresh(k)
    return k


async def persist_pipeline_run(
    *, state: dict[str, Any], response, kaynak_metin: str, filename: str = "",
    owner_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """gelen_evrak + islem + denetim_izi yaz. islem.id döner. Hatalar çağırana propagate."""
    async with session_factory() as s:
        k = await s.get(Kullanici, owner_id) if owner_id is not None else None
        if k is None or not k.aktif:
            k = await _sistem_kullanici(s)
        masked = (response.kanit_metadata or {}).get("metin") or mask_pii(kaynak_metin).masked_text
        # evrak/islem/denetim TEK transaction'da: her biri eskiden kendi commit'ini
        # atıyordu — ara adım (ör. persist_islem) hata verirse önceki commit'ler (evrak)
        # DB'de yetim kalıcı kalıyordu (regresyon bulgusu). commit=False + tek final
        # commit ile ya hepsi ya hiçbiri yazılır.
        evrak = await evrak_olustur(
            s, evrak_no=f"E-AUTO-{uuid.uuid4().hex[:10]}", ocr_metni=(masked or "")[:50_000],
            olusturan_id=k.id, baslik=filename or "otomatik koşum", gelis_birim_id=k.birim_id,
            commit=False)
        # Gerçek işlem durumu: HITL onay kapısında bekleyen koşum "onay_bekliyor" yazılır —
        # eskiden durum hiç iletilmiyordu, her kayıt koşulsuz "tamamlandi" görünüyordu
        # (enum değeri şemada var ama pratikte hiç kullanılmıyordu — sağlık taraması bulgusu).
        islem = await persist_islem(
            s, gelen_evrak_id=evrak.id, thread_id=response.thread_id or uuid.uuid4().hex,
            response=response, sure_ms=getattr(response, "sure_ms", None),
            durum=("onay_bekliyor" if getattr(response, "onay_bekliyor", False) else "tamamlandi"),
            commit=False)
        if state.get("denetim_izi", {}).get("zincir"):
            await persist_denetim(s, islem_id=islem.id, denetim_izi=state["denetim_izi"], commit=False)
        await s.commit()
        return islem.id


__all__ = ("persist_pipeline_run",)
