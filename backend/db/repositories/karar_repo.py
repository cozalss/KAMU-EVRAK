"""HITL karar persistence (Faz 4) — onay + giden_evrak (outbox).

Memur taslağı onaylar/düzenler/reddeder → onay satırı yazılır; reddedilmediyse
giden_evrak (E-G-YYYY/NNNN) üretilir. Çift-gönderim DB partial-unique ile engellenir
(giden_evrak.taslak_id, durum<>reddedildi). risk + son_hash islem'den taşınır.

Çok-konulu evrakta HER alt-talep (birim) kendi taslağına, dolayısıyla kendi bağımsız
onay/giden_evrak zincirine sahiptir (taslak.alt_talep_id ile bağlı) — bkz.
onayla_ve_gonder_alt_talep. Tek-konulu evrakta (alt_talep_id NULL) eski davranış birebir.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    AltTalep,
    DenetimIzi,
    GidenEvrak,
    Islem,
    Onay,
    RiskDegerlendirme,
    Taslak,
    YaziTuru,
)

# Frontend seçimi → onay_karari + giden_durumu enum.
_KARAR = {"onayla": "onaylandi", "duzenle": "duzenlendi", "reddet": "reddedildi"}
_GIDEN = {"onaylandi": "gonderildi", "duzenlendi": "duzenlendi", "reddedildi": "reddedildi"}


class KararError(Exception):
    """kod: 'taslak_yok' | 'alt_talep_yok' | 'zaten_gonderildi'."""

    def __init__(self, kod: str, mesaj: str) -> None:
        super().__init__(mesaj)
        self.kod, self.mesaj = kod, mesaj


async def _giden_no(session: AsyncSession) -> str:
    yil = _dt.datetime.now(_dt.UTC).year
    n = int(await session.scalar(select(func.count()).select_from(GidenEvrak)) or 0)
    return f"E-G-{yil}/{n + 1:04d}"


async def _taslak_guncelle(
    session: AsyncSession, taslak: Taslak, yeni_tur: str, yeni_metin: str,
) -> None:
    """Memur karttan farklı tür/metin seçtiyse ONAYDAN ÖNCE taslağı güncelle (yeni sürüm).

    Kalıcı kayıt gerçekten gönderilen içeriği yansıtsın diye: tür kutucuğuyla yeniden
    üretilen taslak DB'deki taslak satırına yazılır (surum+1, guncellendi damgası).
    Bilinmeyen tür kodu FK'yi bozmasın diye yazi_turu lookup'ında doğrulanır (yoksa
    yalnız metin güncellenir). Boş parametreler = değişiklik yok (geriye uyum).
    """
    degisti = False
    if yeni_tur and yeni_tur != taslak.yazi_turu_kod:
        gecerli = await session.scalar(select(YaziTuru.kod).where(YaziTuru.kod == yeni_tur))
        if gecerli:
            taslak.yazi_turu_kod = yeni_tur
            degisti = True
    if yeni_metin and yeni_metin != taslak.metin_md:
        taslak.metin_md = yeni_metin
        degisti = True
    if degisti:
        taslak.surum += 1
        taslak.guncellendi = _dt.datetime.now(_dt.UTC)


async def _karar_ve_giden(
    session: AsyncSession, *, taslak: Taslak, islem_id: uuid.UUID, kullanici_id: uuid.UUID,
    secim: str, gerekce: str, alici_birim_id: uuid.UUID | None = None,
    yazi_turu: str = "", metin: str = "",
) -> dict:
    """onayla_ve_gonder + onayla_ve_gonder_alt_talep ORTAK gövdesi: Onay (+ GidenEvrak).

    alici_birim_id verilmezse işlemin genel hedef birimi kullanılır (tek-konulu davranış).
    yazi_turu/metin verildiyse (memur kartta tür değiştirdi / metni tazeledi) taslak
    önce güncellenir → Onay ve GidenEvrak gerçekten gönderilen içeriğe bağlanır.
    """
    await _taslak_guncelle(session, taslak, yazi_turu, metin)
    karar = _KARAR.get(secim, "onaylandi")
    session.add(Onay(
        taslak_id=taslak.id, karar=karar, karar_veren_id=kullanici_id,
        gerekce=gerekce or None, karar_zamani=_dt.datetime.now(_dt.UTC)))

    # Karar arşivi: onay/duzenle gönderim, red ise reddedildi kaydı olarak giden_evrak'a düşer.
    # Çift-gönderim kontrolü (partial-unique zaten korur; erken net hata için).
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
        konu=taslak.konu,
        alici_birim_id=alici_birim_id or (islem.hedef_birim_id if islem else None),
        yazi_turu_kod=taslak.yazi_turu_kod, risk=risk,
        durum=_GIDEN.get(karar, "gonderildi"), gonderen_id=kullanici_id,
        son_hash=izi.son_hash if izi else None))

    await session.commit()
    return {"karar": karar, "giden_no": giden_no}


async def onayla_ve_gonder(
    session: AsyncSession, *, islem_id: uuid.UUID, kullanici_id: uuid.UUID,
    secim: str = "onayla", gerekce: str = "", yazi_turu: str = "", metin: str = "",
) -> dict:
    """Taslağı onayla/düzenle/reddet → onay (+ giden_evrak). Döner: {karar, giden_no?}.

    Tek-konulu evrak için (işlemin EN SON sürümlü taslağı hedeflenir — geriye uyum).
    Çok-konulu evrakta birim-bazlı karar için onayla_ve_gonder_alt_talep kullanılır.
    yazi_turu/metin: memurun karttan seçtiği tür + o türle üretilen metin (opsiyonel).
    """
    taslak = await session.scalar(
        select(Taslak).where(Taslak.islem_id == islem_id)
        .order_by(Taslak.surum.desc()).limit(1))
    if taslak is None:
        raise KararError("taslak_yok", "Bu işleme ait taslak bulunamadı.")
    return await _karar_ve_giden(
        session, taslak=taslak, islem_id=islem_id, kullanici_id=kullanici_id,
        secim=secim, gerekce=gerekce, yazi_turu=yazi_turu, metin=metin)


async def onayla_ve_gonder_alt_talep(
    session: AsyncSession, *, islem_id: uuid.UUID, sira: int, kullanici_id: uuid.UUID,
    secim: str = "onayla", gerekce: str = "", yazi_turu: str = "", metin: str = "",
) -> dict:
    """Çok-konulu evrakta TEK bir alt-talebin (birim) taslağını onayla/düzenle/reddet.

    `sira` = alt_talep.sira (1-tabanlı, frontend'deki listedeki sıra ile birebir — decompose
    ile aynı sırayla üretilir). GidenEvrak bu alt-talebin KENDİ hedef birimine yazılır.
    yazi_turu/metin: memurun karttan seçtiği tür + o türle üretilen metin (opsiyonel).
    """
    alt = await session.scalar(
        select(AltTalep).where(AltTalep.islem_id == islem_id, AltTalep.sira == sira))
    if alt is None:
        raise KararError("alt_talep_yok", "Bu sıradaki alt-talep bulunamadı.")
    taslak = await session.scalar(select(Taslak).where(Taslak.alt_talep_id == alt.id))
    if taslak is None:
        raise KararError("taslak_yok", "Bu alt-talebe ait taslak bulunamadı.")
    return await _karar_ve_giden(
        session, taslak=taslak, islem_id=islem_id, kullanici_id=kullanici_id,
        secim=secim, gerekce=gerekce, alici_birim_id=alt.hedef_birim_id,
        yazi_turu=yazi_turu, metin=metin)


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


__all__ = ("KararError", "onayla_ve_gonder", "onayla_ve_gonder_alt_talep", "taslak_sil")
