"""Faz 4 smoke — taslak otomatik persist + onay + giden_evrak + çift-gönderim guard.

CI'da DEĞİL (canlı). islem(+taslak) → onayla_ve_gonder → giden_evrak; tekrar → guard.
Denetim bulgusu düzeltmeleri (2026-07): (a) çift-gönderim guard'ı ARTIK reddet dahil TÜM
karar türlerini kapsar (eskiden yalnız onayla/duzenle korunuyordu — aynı taslak iki kez
reddedilebiliyordu); (b) onayla_ve_gonder owner_id alır — başkasının işlemine karar
verilemez (IDOR kapısı repo'nun kendisinde, yalnız çağıran route'ta değil).
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
_EPOSTA_BASKA = "smoke.karar.baska@kamu-evrak.local"
_EVRAK_NO = "E-SMOKE-KARAR/0001"
_EVRAK_NO_2 = "E-SMOKE-KARAR/0002"


async def _temizle(s):
    for eposta in (_EPOSTA, _EPOSTA_BASKA):
        uid = await s.scalar(select(Kullanici.id).where(Kullanici.eposta == eposta))
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
        birim_id, birim_kod = birim.id, birim.kod   # düz değer olarak yakala — rollback
        # sonrası ORM nesnesi expire olur; async'te expired attribute erişimi
        # MissingGreenlet ile patlar (bkz. adım 3 rollback'i). Düz UUID/str hep güvenli.
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Karar.1!",
                                ad_soyad="Smoke Yetkili", birim_kod=birim_kod)
        k.rol = "yetkili"  # onaylama yetkisi
        baska = await service.kayit(s, eposta=_EPOSTA_BASKA, parola="Smoke.Karar.2!",
                                    ad_soyad="Smoke Başkası", birim_kod=birim_kod)
        baska.rol = "yetkili"
        await s.commit()
        k_id, baska_id = k.id, baska.id
        evrak = await evrak_olustur(s, evrak_no=_EVRAK_NO, ocr_metni="... maskeli ...",
                                    olusturan_id=k_id, gelis_birim_id=birim_id)
        islem = await persist_islem(s, gelen_evrak_id=evrak.id, thread_id="karar-1",
                                    response=_yanit())
        islem_id = islem.id
        # 1) taslak otomatik oluştu mu?
        t = await s.scalar(select(func.count()).select_from(Taslak).where(Taslak.islem_id == islem_id))
        print(f"1. taslak otomatik persist: {t} (beklenen 1)")

        # 2) onayla → giden_evrak
        sonuc = await onayla_ve_gonder(s, islem_id=islem_id, kullanici_id=k_id, secim="onayla")
        print(f"2. onayla → karar={sonuc['karar']} giden_no={sonuc['giden_no']}")
        ng = await s.scalar(select(func.count()).select_from(GidenEvrak).where(GidenEvrak.gonderen_id == k_id))
        no = await s.scalar(select(func.count()).select_from(Onay))

        # 3) çift-gönderim guard (onayla → onayla, mevcut davranış)
        guard = False
        try:
            await onayla_ve_gonder(s, islem_id=islem_id, kullanici_id=k_id, secim="onayla")
        except KararError as e:
            await s.rollback()
            guard = e.kod == "zaten_gonderildi"
            print(f"3. çift-gönderim engellendi ({e.kod})")

        # 4) DÜZELTME: reddet → reddet artık da engellenir (eskiden partial-unique index
        # 'reddedildi' durumunu HARİÇ tutuyordu → aynı taslak iki kez reddedilebiliyordu).
        evrak2 = await evrak_olustur(s, evrak_no=_EVRAK_NO_2, ocr_metni="... maskeli ...",
                                     olusturan_id=k_id, gelis_birim_id=birim_id)
        islem2 = await persist_islem(s, gelen_evrak_id=evrak2.id, thread_id="karar-2",
                                     response=_yanit())
        islem2_id = islem2.id
        await onayla_ve_gonder(s, islem_id=islem2_id, kullanici_id=k_id, secim="reddet")
        reddet_guard = False
        try:
            await onayla_ve_gonder(s, islem_id=islem2_id, kullanici_id=k_id, secim="reddet")
        except KararError as e:
            await s.rollback()
            reddet_guard = e.kod == "zaten_gonderildi"
        print(f"4. çift-reddet engellendi: {reddet_guard} (beklenen True — ÖNCEDEN False'tu)")

        # 5) DÜZELTME: owner_id verilip işlem BAŞKASINA aitse "yetkisiz" ile reddedilir (IDOR).
        idor_engellendi = False
        try:
            await onayla_ve_gonder(s, islem_id=islem2_id, kullanici_id=baska_id,
                                   secim="onayla", owner_id=baska_id)
        except KararError as e:
            await s.rollback()
            idor_engellendi = e.kod == "yetkisiz"
        print(f"5. IDOR engellendi (başkasının işlemi): {idor_engellendi} (beklenen True)")

        ok = (t == 1 and sonuc["giden_no"] and ng == 1 and guard
              and reddet_guard and idor_engellendi)
        print(f"6. doğrulama: giden_evrak={ng} taslak={t} guard={guard} "
              f"reddet_guard={reddet_guard} idor_engellendi={idor_engellendi}")
        await _temizle(s)
        print("7. temizlik OK (giden→gelen→kullanıcı)")
    await engine.dispose()
    print("\nSONUÇ:", "✅ FAZ 4 (taslak/onay/giden) ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
