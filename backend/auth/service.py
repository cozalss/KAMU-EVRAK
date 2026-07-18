"""Auth iş mantığı — kayıt/giriş/yenile/çıkış (kullanici + oturum tabloları).

Refresh-rotation: her yenilemede eski oturum iptal + yeni refresh üretilir (token
çalınırsa tek kullanımlık). Ham token saklanmaz (yalnız SHA-256 hash). Tüm hatalar
AuthError (kod) → router HTTP'ye çevirir. Async (asyncpg/SQLAlchemy).
"""
from __future__ import annotations

import asyncio
import datetime as _dt

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import security
from db.models import Birim, Kullanici, Oturum

# Bilinmeyen e-posta yolunda zamanlama-sızıntısını azaltmak için kullanılır (giris()).
# SABİT (modül yüklenirken BİR KEZ hesaplanır) — her istekte hash_parola() ile YENİDEN
# üretmek taze salt + TAM argon2 hash maliyeti demekti; bu da bilinmeyen-e-posta yolunu
# yanlış-parola yolundan (yalnız 1x verify) ~2 kat YAVAŞ yapıp e-posta varlığını daha da
# ayırt edilebilir kılıyordu (regresyon bulgusu — niyetin tam tersi). Sabit hash + yalnız
# verify() → her iki yol da TEK argon2 maliyetine eşitlenir.
_SAHTE_HASH = security.hash_parola("zamanlama-sizintisi-icin-sabit-sahte-parola")


class AuthError(Exception):
    """kod: 'eposta_kayitli' | 'birim_yok' | 'kimlik_hatali' | 'pasif' | 'oturum_gecersiz'."""

    def __init__(self, kod: str, mesaj: str) -> None:
        super().__init__(mesaj)
        self.kod = kod
        self.mesaj = mesaj


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.UTC)


async def kayit(session: AsyncSession, *, eposta: str, parola: str, ad_soyad: str,
                birim_kod: str, unvan: str = "") -> Kullanici:
    birim = await session.scalar(select(Birim).where(Birim.kod == birim_kod))
    if birim is None:
        raise AuthError("birim_yok", f"Birim bulunamadı: {birim_kod}")
    kullanici = Kullanici(
        # argon2 hash CPU-yoğun (~30ms) → to_thread; async event loop bloklanmasın
        # (kod tabanının embedding/ocr/hybrid_search'te izlediği desen).
        eposta=eposta.lower(), parola_hash=await asyncio.to_thread(security.hash_parola, parola),
        ad_soyad=ad_soyad, unvan=unvan, birim_id=birim.id,
    )
    session.add(kullanici)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise AuthError("eposta_kayitli", "Bu e-posta zaten kayıtlı.") from e
    await session.refresh(kullanici)
    return kullanici


async def _oturum_ac(session: AsyncSession, kullanici: Kullanici, ip: str | None,
                     user_agent: str | None) -> tuple[str, str, int]:
    """access+refresh üret + oturum satırı yaz. (access, refresh, access_ttl_s)."""
    access, access_son = security.access_token_uret(
        str(kullanici.id), kullanici.rol, str(kullanici.birim_id))
    refresh, _jti, refresh_son = security.refresh_token_uret(str(kullanici.id))
    session.add(Oturum(
        kullanici_id=kullanici.id, refresh_token_hash=security.token_hash(refresh),
        ip=ip, user_agent=user_agent, gecerli_son=refresh_son,
    ))
    await session.commit()
    ttl = int((access_son - _now()).total_seconds())
    return access, refresh, max(ttl, 0)


async def giris(session: AsyncSession, *, eposta: str, parola: str,
                ip: str | None = None, user_agent: str | None = None
                ) -> tuple[Kullanici, str, str, int]:
    kullanici = await session.scalar(
        select(Kullanici).where(Kullanici.eposta == eposta.lower()))
    # Zamanlama-sızıntısını azalt: kullanıcı yoksa da hash doğrula (sabit-zaman benzeri) —
    # SABİT _SAHTE_HASH kullanılır (her seferinde yeniden hash_parola() üretmek gerçek
    # yoldan daha YAVAŞ yapıyordu, bkz. modül başı not).
    # argon2 verify/hash CPU-yoğun → to_thread ile offload (event loop + eşzamanlı SSE
    # akışları bloklanmasın); zamanlama-sızıntısı simetrisi korunur (her iki yol da 1x verify).
    if kullanici is None:
        await asyncio.to_thread(security.parola_dogrula, parola, _SAHTE_HASH)
        raise AuthError("kimlik_hatali", "E-posta veya parola hatalı.")
    if not await asyncio.to_thread(security.parola_dogrula, parola, kullanici.parola_hash):
        raise AuthError("kimlik_hatali", "E-posta veya parola hatalı.")
    if not kullanici.aktif:
        raise AuthError("pasif", "Hesap pasif.")
    # Opsiyonel: argon2 parametre güncellemesi → giriş anında yeniden hashle.
    if security.rehash_gerekli(kullanici.parola_hash):
        kullanici.parola_hash = await asyncio.to_thread(security.hash_parola, parola)
    kullanici.son_giris = _now()
    access, refresh, ttl = await _oturum_ac(session, kullanici, ip, user_agent)
    return kullanici, access, refresh, ttl


async def yenile(session: AsyncSession, *, refresh_token: str, ip: str | None = None,
                 user_agent: str | None = None) -> tuple[str, str, int]:
    payload = security.token_coz(refresh_token, "refresh")
    if payload is None:
        raise AuthError("oturum_gecersiz", "Refresh token geçersiz veya süresi dolmuş.")
    h = security.token_hash(refresh_token)
    oturum = await session.scalar(select(Oturum).where(Oturum.refresh_token_hash == h))
    if oturum is None or oturum.iptal or oturum.gecerli_son <= _now():
        raise AuthError("oturum_gecersiz", "Oturum bulunamadı veya iptal edilmiş.")
    kullanici = await session.get(Kullanici, oturum.kullanici_id)
    if kullanici is None or not kullanici.aktif:
        raise AuthError("oturum_gecersiz", "Kullanıcı pasif veya silinmiş.")
    # ROTATION: eski oturumu iptal et, yenisini aç (tek kullanımlık refresh). Yukarıdaki
    # SELECT'ten sonra koşulsuz `oturum.iptal = True` yazmak TOCTOU yarışına açıktı: aynı
    # refresh token'la eşzamanlı iki çağrı ikisi de "iptal=false" okuyup ikisi de rotasyonu
    # tamamlayabiliyordu (özellikle uzak DB'de round-trip gecikmesiyle sıkça) — tek-kullanımlık
    # garantisi kağıt üstünde kalıyordu. Koşullu UPDATE ile atomik: Postgres satır kilidi
    # eşzamanlı ikinci çağrıyı ilkinin commit'ine kadar bloklar, WHERE yeniden değerlendirilince
    # rowcount=0 döner → kaybeden kesin 401 alır, tek bir çağrı gerçekten kazanır.
    sonuc = await session.execute(
        update(Oturum).where(Oturum.id == oturum.id, Oturum.iptal.is_(False)).values(iptal=True)
    )
    if sonuc.rowcount != 1:
        await session.rollback()
        raise AuthError("oturum_gecersiz", "Oturum bulunamadı veya iptal edilmiş.")
    return await _oturum_ac(session, kullanici, ip, user_agent)


async def cikis(session: AsyncSession, *, refresh_token: str) -> bool:
    h = security.token_hash(refresh_token)
    oturum = await session.scalar(select(Oturum).where(Oturum.refresh_token_hash == h))
    if oturum is None:
        return False
    oturum.iptal = True
    await session.commit()
    return True


__all__ = ("AuthError", "cikis", "giris", "kayit", "yenile")
