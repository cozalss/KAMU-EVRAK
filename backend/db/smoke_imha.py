"""Faz 8 smoke — saklama-süresi imha (anonimleştir + sil). CANLI; CI'da değil.

Eski evrak (6 yıl, dilekçe 5yıl → dolmuş) + güncel evrak (dolmamış) kur → suresi_dolmus
yalnız eskiyi bulur → anonimleştir (içerik [anonim]) + ikinci eskiyi sil (cascade) → temizlik.
Çalıştır: uv run python -m db.smoke_imha
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import sys

from sqlalchemy import delete, select, text

from api.schemas import ProcessResponse
from auth import service
from db.models import Birim, GelenEvrak, Kullanici
from db.repositories import persist_islem
from db.repositories.imha_repo import anonimlestir, sil, suresi_dolmus
from db.session import engine, session_factory

_EPOSTA = "smoke.imha@kamu-evrak.local"
_PREFIX = "E-IMHA-"


async def _temizle(s):
    uid = await s.scalar(select(Kullanici.id).where(Kullanici.eposta == _EPOSTA))
    if uid:
        await s.execute(text("SET LOCAL app.denetim_silmeye_izin = 'on'"))
        await s.execute(delete(GelenEvrak).where(GelenEvrak.olusturan_id == uid))
        await s.execute(delete(Kullanici).where(Kullanici.id == uid))
        await s.commit()


async def _evrak(s, k, birim, no, gun_once):
    """Geriye-tarihli gelen_evrak + dilekçe işlemi (tür → 5 yıl saklama)."""
    eski = _dt.datetime.now(_dt.UTC) - _dt.timedelta(days=gun_once)
    ev = GelenEvrak(evrak_no=no, ocr_metni="Gizli içerik: Ayşe Y***z başvurusu.",
                    baslik="test", olusturan_id=k.id, gelis_birim_id=birim.id, olusturuldu=eski)
    s.add(ev)
    await s.commit()
    await s.refresh(ev)
    await persist_islem(s, gelen_evrak_id=ev.id, thread_id="imha",
                        response=ProcessResponse(evrak_turu="dilekce"))
    return ev


async def main() -> int:
    async with session_factory() as s:
        await _temizle(s)
        birim = await s.scalar(select(Birim).limit(1))
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Imha.1!",
                                ad_soyad="Smoke", birim_kod=birim.kod)
        eski1 = await _evrak(s, k, birim, _PREFIX + "ESKI1", 365 * 6)   # dolmuş
        eski2 = await _evrak(s, k, birim, _PREFIX + "ESKI2", 365 * 7)   # dolmuş
        await _evrak(s, k, birim, _PREFIX + "GUNCEL", 30)              # dolmamış

        dolmus = await suresi_dolmus(s)
        nolar = {d["evrak_no"] for d in dolmus if d["evrak_no"].startswith(_PREFIX)}
        print(f"1. süresi dolmuş (bizim): {sorted(nolar)} (beklenen ESKI1+ESKI2)")

        # anonimleştir ESKI1 → içerik silinir, kayıt durur
        await anonimlestir(s, evrak_id=eski1.id)
        a = await s.get(GelenEvrak, eski1.id)
        print(f"2. anonimleştir: ocr='{a.ocr_metni[:30]}…' kayıt korundu")

        # sil ESKI2 → tamamen gider (cascade)
        await sil(s, evrak_id=eski2.id)
        var = await s.get(GelenEvrak, eski2.id)
        print(f"3. sil: ESKI2 {'YOK (silindi)' if var is None else 'HÂLÂ VAR ⚠'}")

        ok = (nolar == {_PREFIX + "ESKI1", _PREFIX + "ESKI2"}
              and a.ocr_metni.startswith("[İMHA") and var is None)
        await _temizle(s)
        print("4. temizlik OK")
    await engine.dispose()
    print("\nSONUÇ:", "✅ FAZ 8 İMHA/ANONİMLEŞTİRME ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
