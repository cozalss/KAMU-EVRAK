"""Demo hesabının görünen adını Türkçe karakterle düzelt — idempotent, ELLE çalıştırılır.

Kenar çubuğu / Panel / giden kaydı "Ayse Yilmaz · Sef" gösteriyordu: demo hesabı ASCII ile
kaydedilmiş. Ad sahte (gerçek kişi değildir, CLAUDE.md §2). Yalnız ASCII biçimi eşleşen satırı
günceller; ikinci koşum değişiklik yapmaz. Parola/rol/birim dokunulmaz.

Varsayılan KURU koşum (yalnız raporlar); yazmak için `--uygula`:
    uv run python -m db.demo_kullanici_adi_duzelt            # ne değişecek
    uv run python -m db.demo_kullanici_adi_duzelt --uygula   # uygula
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import sys

from sqlalchemy import select

from db.models import Kullanici
from db.session import engine, session_factory

_EPOSTA = "tasarim.demo@kurum.gov.tr"
# (eski ASCII biçim → doğru Türkçe biçim); yalnız birebir eski değer eşleşirse yazılır.
_DUZELTME = {"ad_soyad": ("Ayse Yilmaz", "Ayşe Yılmaz"), "unvan": ("Sef", "Şef")}


async def _calis(uygula: bool) -> int:
    async with session_factory() as s:
        k = await s.scalar(select(Kullanici).where(Kullanici.eposta == _EPOSTA))
        if k is None:
            print(f"{_EPOSTA} bulunamadı — yapılacak bir şey yok.")
            return 0
        degisen = {alan: yeni for alan, (eski, yeni) in _DUZELTME.items() if getattr(k, alan) == eski}
        if not degisen:
            print("Zaten düzgün — değişiklik yok.")
            return 0
        for alan, yeni in degisen.items():
            print(f"{alan}: {getattr(k, alan)!r} → {yeni!r}")
        if not uygula:
            print("KURU koşum — yazmak için --uygula.")
            return 0
        for alan, yeni in degisen.items():
            setattr(k, alan, yeni)
        k.guncellendi = _dt.datetime.now(_dt.UTC)
        await s.commit()
        print("Uygulandı. Kullanıcı yeniden giriş yapınca (ya da /me tazelenince) görünür.")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_calis("--uygula" in sys.argv[1:])))
