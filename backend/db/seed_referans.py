"""Referans tabloları seed — config + template_registry KANONİK kaynak (tek-doğruluk).

evrak_turu  ← EVRAK_TURLERI / EVRAK_TURU_TR
yazi_turu   ← YAZI_TURLERI  / registry (etiket + kapanış + şablon dosyası)
birim       ← BIRIMLER      / BIRIM_TR

Idempotent: ON CONFLICT DO UPDATE (yeniden çalıştırmak güvenli; etiket değişirse günceller).
DDL/seed için session pooler (:5432). Kimlik bilgisi basılmaz.

Çalıştır:  uv run python -m db.seed_referans
"""
from __future__ import annotations

import asyncio
import os
import sys

import asyncpg
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))

from agents.config import (  # noqa: E402
    BIRIM_TR,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    YAZI_TURLERI,
)
from yazi.template_registry import (  # noqa: E402
    default_kapanis,
    template_file,
    template_label,
)


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL_SYNC") or os.environ["DATABASE_URL"]
    return url.replace("postgresql+psycopg://", "postgresql://").replace(
        "postgresql+asyncpg://", "postgresql://")


async def main() -> int:
    conn = await asyncpg.connect(_dsn(), timeout=30, statement_cache_size=0)
    try:
        # 1) evrak_turu
        evrak_rows = [(k, EVRAK_TURU_TR.get(k, k)) for k in EVRAK_TURLERI]
        await conn.executemany(
            """INSERT INTO evrak_turu (kod, etiket_tr) VALUES ($1, $2)
               ON CONFLICT (kod) DO UPDATE SET etiket_tr = EXCLUDED.etiket_tr""",
            evrak_rows,
        )
        # 2) yazi_turu
        yazi_rows = [
            (k, template_label(k), default_kapanis(k), f"{template_file(k)}.j2")
            for k in YAZI_TURLERI
        ]
        await conn.executemany(
            """INSERT INTO yazi_turu (kod, etiket_tr, varsayilan_kapanis, sablon_dosya)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (kod) DO UPDATE SET
                   etiket_tr = EXCLUDED.etiket_tr,
                   varsayilan_kapanis = EXCLUDED.varsayilan_kapanis,
                   sablon_dosya = EXCLUDED.sablon_dosya""",
            yazi_rows,
        )
        # 3) birim
        birim_rows = [(k, ad) for k, ad in BIRIM_TR.items()]
        await conn.executemany(
            """INSERT INTO birim (kod, ad) VALUES ($1, $2)
               ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad""",
            birim_rows,
        )

        # Doğrulama
        ce = await conn.fetchval("SELECT count(*) FROM evrak_turu")
        cy = await conn.fetchval("SELECT count(*) FROM yazi_turu")
        cb = await conn.fetchval("SELECT count(*) FROM birim")
        print(f"Seed tamamlandı:  evrak_turu={ce}  yazi_turu={cy}  birim={cb}")
        ok = ce == len(EVRAK_TURLERI) and cy == len(YAZI_TURLERI) and cb == len(BIRIM_TR)
        print("SONUÇ:", "✅ REFERANS HAZIR" if ok else "⚠️ sayı uyuşmuyor")
        return 0 if ok else 2
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
