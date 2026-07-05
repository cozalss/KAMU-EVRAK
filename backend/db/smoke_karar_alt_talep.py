"""Çok-konulu evrak smoke — HER alt-talebin (birim) bağımsız taslak/onay/giden_evrak zinciri.

CI'da DEĞİL (canlı). persist_islem (>=2 alt-talep + taslak metni) → N ayrı Taslak (alt_talep_id
bağlı) → onayla_ve_gonder_alt_talep birim-bazlı → islem_listele işlemi ÇOĞALTMIYOR mu?
Temizlik FK sırası: giden_evrak → gelen_evrak(cascade) → kullanıcı (smoke_karar.py ile aynı desen).
Çalıştır: uv run python -m db.smoke_karar_alt_talep
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, select

from api.schemas import AltTalepSchema, ProcessResponse
from auth import service
from db.models import Birim, GelenEvrak, GidenEvrak, Kullanici, Taslak
from db.repositories import evrak_olustur, onayla_ve_gonder_alt_talep, persist_islem
from db.repositories.sorgu_repo import islem_listele
from db.session import engine, session_factory

_EPOSTA = "smoke.alt.talep@kamu-evrak.local"
_EVRAK_NO = "E-SMOKE-ALT/0001"


async def _temizle(s):
    uid = await s.scalar(select(Kullanici.id).where(Kullanici.eposta == _EPOSTA))
    if uid:
        await s.execute(delete(GidenEvrak).where(GidenEvrak.gonderen_id == uid))
        await s.execute(delete(GelenEvrak).where(GelenEvrak.olusturan_id == uid))
        await s.execute(delete(Kullanici).where(Kullanici.id == uid))
        await s.commit()


def _yanit(birim1: str, birim2: str) -> ProcessResponse:
    """Çukur onarımı + su faturası — 2 farklı birime giden gerçekçi çok-konulu yanıt."""
    return ProcessResponse(
        evrak_turu="dilekce", hedef_birim=birim1, yazi_turu="ust_yazi",
        yazi_taslak_md="T.C.\n...\n(ilk birim taslağı — geriye uyum tekil alan)",
        format_uyumlu=True, bilgi_unsurlari={"konu": "Çeşitli talepler"},
        risk_metadata={"bant": "sari", "skor": 0.3, "gerekceler": []},
        alt_talepler=[
            AltTalepSchema(ozet="çukurun onarılması", tur="talep", birim=birim1,
                           birim_tr="İlgili Teknik Daire", yazi_turu="ust_yazi",
                           yazi_taslak_md="T.C.\n...\nÇukur onarımı — Birim 1'e taslak.",
                           format_uyumlu=True),
            AltTalepSchema(ozet="su faturası itirazı", tur="sikayet", birim=birim2,
                           birim_tr="Mali İşler", yazi_turu="ust_yazi",
                           yazi_taslak_md="T.C.\n...\nSu faturası — Birim 2'ye taslak.",
                           format_uyumlu=True),
        ])


async def main() -> int:
    async with session_factory() as s:
        await _temizle(s)
        birimler = (await s.scalars(select(Birim).limit(2))).all()
        b1, b2 = birimler[0], birimler[1]
        k = await service.kayit(s, eposta=_EPOSTA, parola="Smoke.Alt.1!",
                                ad_soyad="Smoke Alt-Talep", birim_kod=b1.kod)
        k.rol = "yetkili"
        await s.commit()
        evrak = await evrak_olustur(s, evrak_no=_EVRAK_NO, ocr_metni="... maskeli ...",
                                    olusturan_id=k.id, gelis_birim_id=b1.id)
        islem = await persist_islem(s, gelen_evrak_id=evrak.id, thread_id="alt-talep-1",
                                    response=_yanit(b1.kod, b2.kod))

        # 1) N ayrı taslak, HER biri alt_talep_id ile bağlı (birleşik/tekil taslak YOK)
        taslaklar = (await s.scalars(
            select(Taslak).where(Taslak.islem_id == islem.id).order_by(Taslak.olusturuldu))).all()
        n_bagli = sum(1 for t in taslaklar if t.alt_talep_id is not None)
        print(f"1. taslak sayısı: {len(taslaklar)} (beklenen 2), alt_talep_id bağlı: {n_bagli}")

        # 2) Birim 1'i FARKLI türle onayla (kartta kutucuktan cevabi_yazi seçilmiş gibi):
        #    taslak satırı karar anında güncellenmeli (tür+metin+sürüm), giden ona bağlanmalı.
        yeni_metin = "T.C.\n...\nKutucuktan seçilen CEVABİ yazı metni."
        r1 = await onayla_ve_gonder_alt_talep(
            s, islem_id=islem.id, sira=1, kullanici_id=k.id, secim="onayla",
            yazi_turu="cevabi_yazi", metin=yeni_metin)
        await s.refresh(taslaklar[0])
        t1 = taslaklar[0]
        tur_guncel = (t1.yazi_turu_kod == "cevabi_yazi" and t1.metin_md == yeni_metin
                      and t1.surum == 2 and t1.guncellendi is not None)
        print(f"2. sira=1 cevabi_yazi ile onayla → karar={r1['karar']} giden_no={r1['giden_no']} "
              f"taslak güncellendi: {tur_guncel} (tur={t1.yazi_turu_kod} surum={t1.surum})")

        # 3) Birim 2'yi BAĞIMSIZ reddet — birim 1'in onayı buna engel olmamalı
        r2 = await onayla_ve_gonder_alt_talep(
            s, islem_id=islem.id, sira=2, kullanici_id=k.id, secim="reddet", gerekce="eksik")
        print(f"3. sira=2 reddet → karar={r2['karar']}")

        # 4) giden_evrak: 1 gönderildi + 1 reddedildi, HER BİRİ kendi birimine;
        #    gönderilen kaydın türü memurun SEÇTİĞİ tür (cevabi_yazi) olmalı.
        giden = (await s.scalars(
            select(GidenEvrak).where(GidenEvrak.gonderen_id == k.id).order_by(GidenEvrak.gonderim_tarihi))).all()
        birimler_dogru = {g.alici_birim_id for g in giden} == {b1.id, b2.id}
        gonderilen = next(g for g in giden if g.durum == "gonderildi")
        tur_dogru = gonderilen.yazi_turu_kod == "cevabi_yazi"
        print(f"4. giden_evrak: {len(giden)} (beklenen 2), kendi birimine: {birimler_dogru}, "
              f"gönderilen tür seçilen tür: {tur_dogru}")

        # 5) islem_listele işlemi ÇOĞALTMIYOR (fan-out regresyonu — bkz. sorgu_repo düzeltmesi)
        kayitlar = await islem_listele(s, owner_id=k.id, limit=50)
        tekil = sum(1 for r in kayitlar if r["id"] == str(islem.id))
        print(f"5. islem_listele'de bu işlem kaç kez görünüyor: {tekil} (beklenen 1, ÇOĞALMAMALI)")

        ok = (len(taslaklar) == 2 and n_bagli == 2 and r1["karar"] == "onaylandi"
              and r2["karar"] == "reddedildi" and len(giden) == 2 and birimler_dogru
              and tur_guncel and tur_dogru and tekil == 1)
        await _temizle(s)
        print("6. temizlik OK (giden→gelen→kullanıcı)")
    await engine.dispose()
    print("\nSONUÇ:", "✅ ÇOK-KONULU ALT-TALEP ONAY/GÖNDER ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
