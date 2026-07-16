"""HITL karar persistence (Faz 4) — onay + giden_evrak (outbox).

Memur taslağı onaylar/düzenler/reddeder → onay satırı yazılır; reddedilmediyse
giden_evrak (E-G-YYYY/NNNN) üretilir. Çift-gönderim DB UNIQUE(taslak_id) ile engellenir
(bkz. migration 0002 — eskiden yalnız durum<>reddedildi kısmi kısıttı, reddet çift-tıklama/
ikinci-sekmeye açıktı). risk + son_hash islem'den taşınır.

Sahiplik: owner_id verilirse (route'lar HER ZAMAN verir) işlemin GERÇEKTEN o kullanıcıya
ait olduğu burada, TEK yerde doğrulanır — yalnız çağıran route'a güvenmek (IDOR) yerine
repo'nun kendisi kapı bekçiliği yapar; yeni bir çağıran noktası kontrolü unutsa bile korunur.

Çok-konulu evrakta HER alt-talep (birim) kendi taslağına, dolayısıyla kendi bağımsız
onay/giden_evrak zincirine sahiptir (taslak.alt_talep_id ile bağlı) — bkz.
onayla_ve_gonder_alt_talep. Tek-konulu evrakta (alt_talep_id NULL) eski davranış birebir.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import structlog
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    AltTalep,
    DenetimIzi,
    GelenEvrak,
    GidenEvrak,
    Islem,
    Onay,
    RiskDegerlendirme,
    Taslak,
    YaziTuru,
)

log = structlog.get_logger()

# Frontend seçimi → onay_karari + giden_durumu enum.
_KARAR = {"onayla": "onaylandi", "duzenle": "duzenlendi", "reddet": "reddedildi"}
_GIDEN = {"onaylandi": "gonderildi", "duzenlendi": "duzenlendi", "reddedildi": "reddedildi"}
_GIDEN_NO_DENEME = 3   # giden_no çakışmasında (bkz. _giden_no) sınırlı tekrar


class KararError(Exception):
    """kod: 'taslak_yok' | 'alt_talep_yok' | 'zaten_gonderildi' | 'yetkisiz' | 'giden_no_uretilemedi'."""

    def __init__(self, kod: str, mesaj: str) -> None:
        super().__init__(mesaj)
        self.kod, self.mesaj = kod, mesaj


async def _sahiplik_dogrula(session: AsyncSession, islem_id: uuid.UUID, owner_id: uuid.UUID | None) -> None:
    """owner_id verildiyse işlemin GERÇEKTEN o kullanıcıya ait olduğunu doğrular (IDOR kapısı).

    kayitlar.py'deki route-seviyeli islem_detay(...,owner_id=...) ön-kontrolüyle AYNI join —
    burada tekrarlanması, o ön-kontrolü unutan/atlayan bir çağıranın (bkz. denetim bulgusu:
    sohbet.py) da korunmasını sağlar. owner_id=None (iç/sistem çağrısı) → kontrol atlanır.
    """
    if owner_id is None:
        return
    bulundu = await session.scalar(
        select(Islem.id).join(GelenEvrak, GelenEvrak.id == Islem.gelen_evrak_id)
        .where(Islem.id == islem_id, GelenEvrak.olusturan_id == owner_id))
    if bulundu is None:
        raise KararError("yetkisiz", "Bu işlem bulunamadı veya erişim yetkiniz yok.")


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
    islem = await session.get(Islem, islem_id)
    risk = await session.scalar(
        select(RiskDegerlendirme.bant).where(RiskDegerlendirme.islem_id == islem_id))
    izi = await session.get(DenetimIzi, islem_id)

    # session.rollback() (aşağıda IntegrityError'da) ORM nesnelerini expire eder
    # (expire_on_commit=False yalnız commit'i kapsar, rollback'i DEĞİL) — retry döngüsünde
    # taslak/islem/izi nesnelerine TEKRAR erişmek AsyncSession'da senkron lazy-reload
    # gerektirir ve MissingGreenlet ile çöker (regresyon bulgusu). Döngüden ÖNCE düz
    # değerlere kopyala; döngü artık nesnelere değil bu değerlere bakar.
    taslak_id = taslak.id
    taslak_konu = taslak.konu
    taslak_yazi_turu_kod = taslak.yazi_turu_kod
    islem_gelen_evrak_id = islem.gelen_evrak_id if islem else None
    islem_hedef_birim_id = islem.hedef_birim_id if islem else None
    izi_son_hash = izi.son_hash if izi else None

    # Karar arşivi: aynı taslağa İKİNCİ karar (onayla/duzenle/reddet FARK ETMEZ) atılamaz.
    # Eskiden yalnız onayla/duzenle korunuyordu ("if karar != 'reddedildi'") — reddet çift-
    # tıklama/ikinci-sekme/ağ tekrarına açıktı (aynı taslak iki kez reddedilebiliyor, hatta
    # ONAYLANMIŞ bir taslak sonradan ayrıca "reddedilebiliyordu"). Uygulama-seviyeli erken
    # kontrol + DB'nin KOŞULSUZ UNIQUE(taslak_id) kısıtı (migration 0002) birlikte korur.
    for deneme in range(_GIDEN_NO_DENEME):
        mevcut = await session.scalar(
            select(GidenEvrak.id).where(GidenEvrak.taslak_id == taslak_id))
        if mevcut is not None:
            raise KararError("zaten_gonderildi", "Bu taslak için zaten bir karar verilmiş.")
        session.add(Onay(
            taslak_id=taslak_id, karar=karar, karar_veren_id=kullanici_id,
            gerekce=gerekce or None, karar_zamani=_dt.datetime.now(_dt.UTC)))
        # giden_no: SELECT count()+format TOCTOU'ya açık (iki eşzamanlı karar aynı numarayı
        # üretebilir) — DB'nin UNIQUE(giden_no) kısıtı çarpışmayı yakalar; burada sınırlı
        # tekrarla şeffaf toparlanır (kullanıcıya ham 500 sızdırmaz).
        giden_no = await _giden_no(session)
        session.add(GidenEvrak(
            giden_no=giden_no, taslak_id=taslak_id,
            kaynak_evrak_id=islem_gelen_evrak_id,
            konu=taslak_konu,
            alici_birim_id=alici_birim_id or islem_hedef_birim_id,
            yazi_turu_kod=taslak_yazi_turu_kod, risk=risk,
            durum=_GIDEN.get(karar, "gonderildi"), gonderen_id=kullanici_id,
            son_hash=izi_son_hash))
        try:
            await session.commit()
            return {"karar": karar, "giden_no": giden_no}
        except IntegrityError as exc:
            await session.rollback()
            # Yarışı kaybettik: ya giden_no çakıştı (tekrar dene) ya da taslak eşzamanlı
            # başka bir kararla ZATEN gönderildi (net 409 ile bildir, ham 500 sızdırma).
            yarisan = await session.scalar(
                select(GidenEvrak.id).where(GidenEvrak.taslak_id == taslak_id))
            if yarisan is not None:
                raise KararError(
                    "zaten_gonderildi", "Bu taslak için zaten bir karar verilmiş.") from exc
            log.warning("giden_no_carpisma", deneme=deneme + 1)
    raise KararError("giden_no_uretilemedi", "Giden evrak numarası üretilemedi — tekrar deneyin.")


async def onayla_ve_gonder(
    session: AsyncSession, *, islem_id: uuid.UUID, kullanici_id: uuid.UUID,
    secim: str = "onayla", gerekce: str = "", yazi_turu: str = "", metin: str = "",
    owner_id: uuid.UUID | None = None,
) -> dict:
    """Taslağı onayla/düzenle/reddet → onay (+ giden_evrak). Döner: {karar, giden_no?}.

    Tek-konulu evrak için (işlemin EN SON sürümlü taslağı hedeflenir — geriye uyum).
    Çok-konulu evrakta birim-bazlı karar için onayla_ve_gonder_alt_talep kullanılır.
    yazi_turu/metin: memurun karttan seçtiği tür + o türle üretilen metin (opsiyonel).
    owner_id: verilirse işlemin GERÇEKTEN o kullanıcıya ait olduğu burada doğrulanır (IDOR kapısı).
    """
    await _sahiplik_dogrula(session, islem_id, owner_id)
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
    owner_id: uuid.UUID | None = None,
) -> dict:
    """Çok-konulu evrakta TEK bir alt-talebin (birim) taslağını onayla/düzenle/reddet.

    `sira` = alt_talep.sira (1-tabanlı, frontend'deki listedeki sıra ile birebir — decompose
    ile aynı sırayla üretilir). GidenEvrak bu alt-talebin KENDİ hedef birimine yazılır.
    yazi_turu/metin: memurun karttan seçtiği tür + o türle üretilen metin (opsiyonel).
    owner_id: verilirse işlemin GERÇEKTEN o kullanıcıya ait olduğu burada doğrulanır (IDOR kapısı).
    """
    await _sahiplik_dogrula(session, islem_id, owner_id)
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


async def taslak_metnini_guncelle(
    session: AsyncSession, *, islem_id: uuid.UUID, metin: str, yazi_turu: str = "",
    owner_id: uuid.UUID | None = None, sira: int | None = None,
) -> dict:
    """KARAR VERMEDEN taslak metnini/türünü kalıcı güncelle (memurun 'Kaydet' eylemi).

    Denetim bulgusu: frontend'in 'Kaydet ve kapat' butonu yalnız oturum state'ine
    yazıyordu — memur düzenleyip göndermeden sayfayı yenilerse emeği kayboluyordu ve
    'Kaydet' sözü tutulmuyordu. Karar verilmiş taslak güncellenemez (Giden Evrak
    bütünlüğü — onaydaki _taslak_guncelle yolundan farklı olarak burada karar YOK).
    Hedef seçimi onayla_ve_gonder ile birebir: sira verilirse o alt-talebin taslağı,
    yoksa işlemin EN SON sürümlü taslağı. Döner: {guncellendi, surum}.
    """
    await _sahiplik_dogrula(session, islem_id, owner_id)
    if sira is not None:
        alt = await session.scalar(
            select(AltTalep).where(AltTalep.islem_id == islem_id, AltTalep.sira == sira))
        if alt is None:
            raise KararError("alt_talep_yok", "Bu sıradaki alt-talep bulunamadı.")
        taslak = await session.scalar(select(Taslak).where(Taslak.alt_talep_id == alt.id))
    else:
        taslak = await session.scalar(
            select(Taslak).where(Taslak.islem_id == islem_id)
            .order_by(Taslak.surum.desc()).limit(1))
    if taslak is None:
        raise KararError("taslak_yok", "Bu işleme ait taslak bulunamadı.")
    karar_var = await session.scalar(
        select(Onay.id).where(Onay.taslak_id == taslak.id, Onay.karar != "bekliyor").limit(1))
    if karar_var is not None:
        raise KararError("karar_verildi", "Karar verilmiş taslak güncellenemez — Giden Evrak kaydına bağlı.")
    await _taslak_guncelle(session, taslak, yazi_turu, metin)
    await session.commit()
    return {"guncellendi": True, "surum": taslak.surum}


async def taslak_sil(
    session: AsyncSession, *, islem_id: uuid.UUID, owner_id: uuid.UUID | None = None,
    sira: int | None = None,
) -> dict:
    """İşleme ait KARAR BEKLEYEN taslağı kalıcı sil (kullanıcının 'Sil' eylemi).

    Yalnız taslak satır(lar)ı silinir — işlem kaydı ve denetim izi (Sayıştay/KVKK)
    dokunulmaz kalır. Karar verilmiş (onay satırı olan) taslak İMHA EDİLEMEZ →
    KararError('karar_verildi'); bekleyen onay satırları taslakla CASCADE düşer.
    owner_id: verilirse işlemin GERÇEKTEN o kullanıcıya ait olduğu burada doğrulanır (IDOR kapısı).
    sira: verilirse (çok-konulu evrak) YALNIZ o alt-talebin (birim) taslağı hedeflenir —
    eskiden birim kartındaki 'Sil' işlemin TÜM taslaklarını imha ediyordu (kardeş birim
    taslakları sessizce gidiyordu) ve HERHANGİ bir kardeşin kararı tüm silmeyi 409'luyordu
    (adversarial-verify bulgusu). Karar kontrolü de yalnız hedeflenen taslaklarla sınırlıdır.
    """
    await _sahiplik_dogrula(session, islem_id, owner_id)
    stmt = select(Taslak).where(Taslak.islem_id == islem_id)
    if sira is not None:
        alt = await session.scalar(
            select(AltTalep).where(AltTalep.islem_id == islem_id, AltTalep.sira == sira))
        if alt is None:
            raise KararError("alt_talep_yok", "Bu sıradaki alt-talep bulunamadı.")
        stmt = select(Taslak).where(Taslak.alt_talep_id == alt.id)
    taslaklar = list((await session.scalars(stmt)).all())
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


__all__ = ("KararError", "onayla_ve_gonder", "onayla_ve_gonder_alt_talep",
           "taslak_metnini_guncelle", "taslak_sil")
