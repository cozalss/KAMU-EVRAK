"""Auth uçtan-uca canlı smoke (Supabase) — kayıt→giriş→yenile(rotation)→çıkış→temizlik.

CI'da DEĞİL (canlı DB + yazma); elle doğrulama: uv run python -m db.smoke_auth
Test kullanıcısını sonunda SİLER (cascade → oturumlar). Idempotent (önce siler).
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, select

from auth import security, service
from db.models import Birim, Kullanici
from db.session import engine, session_factory

_EPOSTA = "smoke.test@kamu-evrak.local"
_PAROLA = "Smoke.Test.123!"


async def _temizle() -> None:
    async with session_factory() as s:
        await s.execute(delete(Kullanici).where(Kullanici.eposta == _EPOSTA))
        await s.commit()


async def main() -> int:
    await _temizle()
    async with session_factory() as s:
        birim = await s.scalar(select(Birim).limit(1))
        if birim is None:
            print("HATA: birim seed yok"); return 1
        # 1) kayıt
        k = await service.kayit(s, eposta=_EPOSTA, parola=_PAROLA,
                                ad_soyad="Smoke Test", birim_kod=birim.kod)
        print(f"1. kayıt OK  (rol={k.rol}, birim={birim.kod})")
        # 2) giriş
        _k, access, refresh, ttl = await service.giris(s, eposta=_EPOSTA, parola=_PAROLA)
        print(f"2. giriş OK  (access ttl={ttl}s)")
        # 3) access doğrula
        p = security.token_coz(access, "access")
        assert p and p["sub"] == str(k.id), "access payload hatalı"
        print(f"3. access çözüldü  (sub={p['sub'][:8]}…, rol={p['rol']})")
        # 4) yanlış parola reddi
        try:
            await service.giris(s, eposta=_EPOSTA, parola="yanlis")
            print("4. HATA: yanlış parola kabul edildi"); return 2
        except service.AuthError as e:
            print(f"4. yanlış parola reddedildi  ({e.kod})")
        # 5) yenile (rotation): eski refresh artık geçersiz
        access2, refresh2, _ = await service.yenile(s, refresh_token=refresh)
        print("5. yenile OK  (yeni token çifti)")
        try:
            await service.yenile(s, refresh_token=refresh)
            print("5b. HATA: eski refresh hâlâ geçerli (rotation bozuk)"); return 3
        except service.AuthError as e:
            print(f"5b. eski refresh iptal (rotation OK)  ({e.kod})")
        # 6) çıkış: yeni refresh de geçersiz olur
        await service.cikis(s, refresh_token=refresh2)
        try:
            await service.yenile(s, refresh_token=refresh2)
            print("6. HATA: çıkıştan sonra refresh geçerli"); return 4
        except service.AuthError as e:
            print(f"6. çıkış OK  (refresh iptal: {e.kod})")
    await _temizle()
    await engine.dispose()
    print("\nSONUÇ: ✅ AUTH AKIŞI UÇTAN-UCA ÇALIŞIYOR (test kullanıcı silindi)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
