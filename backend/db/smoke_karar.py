"""Faz 4 smoke — taslak otomatik persist + onay + giden_evrak + çift-gönderim guard.

CI'da DEĞİL (canlı). islem(+taslak) → onayla_ve_gonder → giden_evrak; tekrar → guard.
Temizlik FK sırası: giden_evrak → gelen_evrak(cascade) → kullanıcı.
Çalıştır: uv run python -m db.smoke_karar
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, func, select

from api.schemas import ProcessResponse
from auth import service
from db.models import Birim, GelenEvrak, GidenEvrak, Kullanici, Onay, Taslak
from db.repositories import KararError, evrak_olustur, onayla_ve_gonder, persist_islem
from db.session import engine, session_factory

_EPOSTA = "smoke.karar@kamu-evrak.local"
_EVRAK_NO = "E-SMOKE-KARAR/0001"


async def _temizle(s):
    uid = await s.scalar(select(Kullanici.id).where(Kullanici.eposta == _EPOSTA))
    if uid:
        await s.execute(delete(GidenEvrak).where(GidenEvrak.gonderen_id == uid))
        await s.execute(delete(GelenEvrak).where(GelenEvrak.olusturan_id == uid))
        await s.execute(delete(Kullanici).where(Kullanici.id == uid))
        await s.commit()


def _yanit() -> ProcessResponse:
    return ProcessResponse(
        evrak_turu="dilekce", hedef_birim="ilgili_teknik_daire", yazi_turu="cevabi_yazi",
        yazi_taslak_md="T.C.\n...\nGereğini rica ederim.", format_uyumlu=True,
        bilgi_unsurlari={"konu": "İmar durumu talebi"},
        risk_metadata={"bant": "yesil", "skor": 0.1, "gerekceler": []})


async def main() -> int:
    async with session_factory() as s:
        await _temizle(s)
        birim = await s.scalar(select(Birim).limit(1))
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Karar.1!",
                                ad_soyad="Smoke Yetkili", birim_kod=birim.kod)
        k.rol = "yetkili"  # onaylama yetkisi
        await s.commit()
        evrak = await evrak_olustur(s, evrak_no=_EVRAK_NO, ocr_metni="... maskeli ...",
                                    olusturan_id=k.id, gelis_birim_id=birim.id)
        islem = await persist_islem(s, gelen_evrak_id=evrak.id, thread_id="karar-1",
                                    response=_yanit())
        # 1) taslak otomatik oluştu mu?
        t = await s.scalar(select(func.count()).select_from(Taslak).where(Taslak.islem_id == islem.id))
        print(f"1. taslak otomatik persist: {t} (beklenen 1)")

        # 2) onayla → giden_evrak
        sonuc = await onayla_ve_gonder(s, islem_id=islem.id, kullanici_id=k.id, secim="onayla")
        print(f"2. onayla → karar={sonuc['karar']} giden_no={sonuc['giden_no']}")
        ng = await s.scalar(select(func.count()).select_from(GidenEvrak).where(GidenEvrak.gonderen_id == k.id))
        no = await s.scalar(select(func.count()).select_from(Onay))

        # 3) çift-gönderim guard
        guard = False
        try:
            await onayla_ve_gonder(s, islem_id=islem.id, kullanici_id=k.id, secim="onayla")
        except KararError as e:
            await s.rollback()
            guard = e.kod == "zaten_gonderildi"
            print(f"3. çift-gönderim engellendi ({e.kod})")

        ok = t == 1 and sonuc["giden_no"] and ng == 1 and guard
        print(f"4. doğrulama: giden_evrak={ng} taslak={t} guard={guard}")
        await _temizle(s)
        print("5. temizlik OK (giden→gelen→kullanıcı)")
    await engine.dispose()
    print("\nSONUÇ:", "✅ FAZ 4 (taslak/onay/giden) ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
