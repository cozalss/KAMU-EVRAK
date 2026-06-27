"""Faz 7 (2/2) — ENV-gated pipeline persistence smoke. DB_PERSIST=1 + mock LLM.

POST /process_doc → pipeline koşar → gelen_evrak+islem+denetim DB'ye yazılır → doğrula →
kontrollü imha temizliği (E-AUTO evrakları + sistem kullanıcı). CI'da DEĞİL (canlı).
Çalıştır: uv run python -m db.smoke_persist_run
"""
from __future__ import annotations

import os

# Gerçek LLM çağrısı OLMASIN + persistence AÇIK (import'tan ÖNCE).
os.environ["LLM_MODE"] = "mock"
os.environ["DB_PERSIST"] = "1"

import asyncio
import sys

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text

from db.models import GelenEvrak, Islem, Kullanici
from db.repositories import dogrula_denetim
from db.session import engine, session_factory
from main import app

_SISTEM = "sistem@kamu-evrak.local"


async def _say_islem() -> int:
    async with session_factory() as s:
        return int(await s.scalar(select(func.count()).select_from(Islem)) or 0)


async def _son_islem_dogrula() -> dict:
    async with session_factory() as s:
        iid = await s.scalar(select(Islem.id).order_by(Islem.baslangic.desc()).limit(1))
        return await dogrula_denetim(s, islem_id=iid)


async def _temizle():
    async with session_factory() as s:
        await s.rollback()
        await s.execute(text("SET LOCAL app.denetim_silmeye_izin = 'on'"))
        await s.execute(delete(GelenEvrak).where(GelenEvrak.evrak_no.like("E-AUTO-%")))
        await s.execute(delete(Kullanici).where(Kullanici.eposta == _SISTEM))
        await s.commit()
    await engine.dispose()


def main() -> int:
    once = asyncio.run(_say_islem())
    client = TestClient(app)
    metin = ("Sayın Yetkili, mahallemizdeki imar durumu hakkında bilgi talep ediyorum. "
             "Gereğinin yapılmasını arz ederim. Ad Soyad, 01.06.2026")
    r = client.post("/process_doc", json={"evrak_text": metin, "filename": "smoke.txt"})
    assert r.status_code == 200, f"process {r.status_code} {r.text[:200]}"
    resp = r.json()
    print(f"1. /process_doc OK — tür={resp['evrak_turu']} birim={resp.get('hedef_birim')}")
    client.close()

    sonra = asyncio.run(_say_islem())
    print(f"2. islem sayısı: {once} → {sonra} (+{sonra - once})")
    dogru = asyncio.run(_son_islem_dogrula())
    print(f"3. son işlem denetim doğrulama: butunluk={dogru['butunluk']} "
          f"adım={dogru['adim_sayisi']}")
    asyncio.run(_temizle())
    print("4. temizlik OK (E-AUTO evrakları + sistem kullanıcı silindi)")
    ok = sonra == once + 1 and dogru["butunluk"]
    print("\nSONUÇ:", "✅ ENV-GATED PERSISTENCE ÇALIŞIYOR" if ok else "⚠️ kontrol et")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
