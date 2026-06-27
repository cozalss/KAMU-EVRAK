"""Auth iş mantığı — kayıt/giriş/yenile/çıkış (kullanici + oturum tabloları).

Refresh-rotation: her yenilemede eski oturum iptal + yeni refresh üretilir (token
çalınırsa tek kullanımlık). Ham token saklanmaz (yalnız SHA-256 hash). Tüm hatalar
AuthError (kod) → router HTTP'ye çevirir. Async (asyncpg/SQLAlchemy).
"""
from __future__ import annotations

import datetime as _dt

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import security
from db.models import Birim, Kullanici, Oturum


class AuthError(Exception):
    """kod: 'eposta_kayitli' | 'birim_yok' | 'kimlik_hatali' | 'pasif' | 'oturum_gecersiz'."""

    def __init__(self, kod: str, mesaj: str) -> None:
        super().__init__(mesaj)
        self.kod = kod
        self.mesaj = mesaj


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


async def kayit(session: AsyncSession, *, eposta: str, parola: str, ad_soyad: str,
                birim_kod: str, unvan: str = "") -> Kullanici:
    birim = await session.scalar(select(Birim).where(Birim.kod == birim_kod))
    if birim is None:
        raise AuthError("birim_yok", f"Birim bulunamadı: {birim_kod}")
    kullanici = Kullanici(
        eposta=eposta.lower(), parola_hash=security.hash_parola(parola),
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
    # Zamanlama-sızıntısını azalt: kullanıcı yoksa da hash doğrula (sabit-zaman benzeri).
    if kullanici is None:
        security.parola_dogrula(parola, security.hash_parola("x" * 12))
        raise AuthError("kimlik_hatali", "E-posta veya parola hatalı.")
    if not security.parola_dogrula(parola, kullanici.parola_hash):
        raise AuthError("kimlik_hatali", "E-posta veya parola hatalı.")
    if not kullanici.aktif:
        raise AuthError("pasif", "Hesap pasif.")
    # Opsiyonel: argon2 parametre güncellemesi → giriş anında yeniden hashle.
    if security.rehash_gerekli(kullanici.parola_hash):
        kullanici.parola_hash = security.hash_parola(parola)
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
    # ROTATION: eski oturumu iptal et, yenisini aç (tek kullanımlık refresh).
    oturum.iptal = True
    return await _oturum_ac(session, kullanici, ip, user_agent)


async def cikis(session: AsyncSession, *, refresh_token: str) -> bool:
    h = security.token_hash(refresh_token)
    oturum = await session.scalar(select(Oturum).where(Oturum.refresh_token_hash == h))
    if oturum is None:
        return False
    oturum.iptal = True
    await session.commit()
    return True


__all__ = ("AuthError", "kayit", "giris", "yenile", "cikis")
