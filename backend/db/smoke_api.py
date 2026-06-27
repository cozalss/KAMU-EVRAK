"""Faz 7 REST API smoke — auth + panel + mevzuat arama (canlı Supabase, TestClient).

CI'da DEĞİL. Akış: kayıt→giriş→Bearer ile panel(mevzuat=233)→mevzuat ara→liste→401.
Çalıştır: uv run python -m db.smoke_api
"""
from __future__ import annotations

import asyncio
import sys

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from db.models import Birim, Kullanici
from db.session import engine, session_factory
from main import app

_EPOSTA = "smoke.api@kamu-evrak-test.com"
_PAROLA = "Smoke.Api.123!"


async def _birim_kod() -> str:
    async with session_factory() as s:
        await s.execute(delete(Kullanici).where(Kullanici.eposta == _EPOSTA))
        await s.commit()
        return (await s.scalar(select(Birim.kod).limit(1)))


async def _temizle():
    async with session_factory() as s:
        await s.execute(delete(Kullanici).where(Kullanici.eposta == _EPOSTA))
        await s.commit()
    await engine.dispose()


def main() -> int:
    birim_kod = asyncio.run(_birim_kod())
    client = TestClient(app)
    basarili = True

    # 1) kayıt
    r = client.post("/auth/kayit", json={"eposta": _EPOSTA, "parola": _PAROLA,
                                         "ad_soyad": "Smoke API", "birim_kod": birim_kod})
    assert r.status_code == 201, f"kayıt {r.status_code} {r.text}"
    print("1. kayıt OK (201)")

    # 2) giriş
    r = client.post("/auth/giris", json={"eposta": _EPOSTA, "parola": _PAROLA})
    assert r.status_code == 200, f"giriş {r.status_code} {r.text}"
    token = r.json()["access_token"]
    H = {"Authorization": f"Bearer {token}"}
    print("2. giriş OK (token alındı)")

    # 3) auth'suz panel → 401/403
    r = client.get("/panel/istatistik")
    assert r.status_code in (401, 403), f"auth'suz {r.status_code}"
    print(f"3. auth'suz panel reddedildi ({r.status_code})")

    # 4) panel istatistik
    r = client.get("/panel/istatistik", headers=H)
    assert r.status_code == 200, r.text
    stat = r.json()
    print(f"4. panel OK — mevzuat={stat['mevzuat']} gelen={stat['gelen_evrak']} "
          f"islem={stat['islem']}")
    basarili &= stat["mevzuat"] == 233

    # 5) mevzuat hibrit arama
    r = client.get("/mevzuat/ara", params={"q": "dilekçe hakkı süre", "limit": 5}, headers=H)
    assert r.status_code == 200, r.text
    ara = r.json()
    print(f"5. mevzuat ara OK — '{ara['q']}' → {ara['adet']} sonuç "
          f"(ilk: {ara['sonuclar'][0]['baslik'][:40] if ara['sonuclar'] else '—'})")
    basarili &= ara["adet"] > 0

    # 6) liste uçları
    for yol in ("/gelen-evrak", "/giden-evrak", "/taslaklar"):
        r = client.get(yol, headers=H)
        assert r.status_code == 200, f"{yol} {r.status_code}"
    print("6. liste uçları (gelen/giden/taslak) OK (200)")

    client.close()
    asyncio.run(_temizle())
    print("7. temizlik OK")
    print("\nSONUÇ:", "✅ REST API ÇALIŞIYOR" if basarili else "⚠️ kontrol et")
    return 0 if basarili else 2


if __name__ == "__main__":
    sys.exit(main())
