"""schema.sql'i Supabase'e uygular + doğrular. Idempotent (tekrar çalıştırılabilir).

Çok-ifadeli DDL (DO blokları + dollar-quote) için asyncpg simple-query protokolü
(connection.execute tüm script'i tek çağrıda çalıştırır). Session pooler (:5432, DDL
için doğru). Kimlik bilgisi ekrana basılmaz.

Çalıştır:  uv run python -m db.apply_schema
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))
SCHEMA = Path(__file__).with_name("schema.sql")

# Beklenen tablo + enum sayıları (doğrulama).
EXPECTED_TABLES = {
    "evrak_turu", "yazi_turu", "birim", "kullanici", "oturum", "gelen_evrak",
    "evrak_eki", "mevzuat", "mevzuat_madde", "mevzuat_chunk", "islem", "islem_adimi",
    "bilgi_unsuru", "kanit_span", "alt_talep", "risk_degerlendirme", "sla_takip",
    "mevzuat_oneri", "taslak", "onay", "giden_evrak", "denetim_izi", "denetim_adimi",
    "bildirim",
}


def _dsn() -> str:
    """DATABASE_URL_SYNC (psycopg) → asyncpg ham DSN (sürücü öneki/sslmode soyulur)."""
    url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("HATA: DATABASE_URL_SYNC/.env yok")
    return url.replace("postgresql+psycopg://", "postgresql://").replace(
        "postgresql+asyncpg://", "postgresql://")


async def main() -> int:
    sql = SCHEMA.read_text(encoding="utf-8")
    conn = await asyncpg.connect(_dsn(), timeout=30, statement_cache_size=0)
    try:
        print("Şema uygulanıyor (idempotent)…")
        await conn.execute(sql)  # simple-query: tüm script tek çağrıda
        print("  → DDL çalıştı.\n")

        # Doğrulama
        tables = set(await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"))
        tnames = {r["tablename"] for r in tables}
        missing = EXPECTED_TABLES - tnames
        extra = tnames - EXPECTED_TABLES
        print(f"Tablolar: {len(EXPECTED_TABLES & tnames)}/{len(EXPECTED_TABLES)} bekleneni mevcut")
        if missing:
            print("  EKSİK:", ", ".join(sorted(missing)))
        if extra:
            print("  (ekstra/sistem):", ", ".join(sorted(extra)))

        enums = await conn.fetchval("SELECT count(*) FROM pg_type WHERE typtype='e'")
        idx = await conn.fetchval(
            "SELECT count(*) FROM pg_indexes WHERE schemaname='public'")
        rls = await conn.fetchval(
            "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity")
        exts = [r["extname"] for r in await conn.fetch(
            "SELECT extname FROM pg_extension WHERE extname IN ('vector','pgcrypto','pg_trgm')")]
        hnsw = await conn.fetchval(
            "SELECT count(*) FROM pg_indexes WHERE indexname='ix_chunk_embedding'")
        print(f"Enum türleri: {enums} · İndeksler: {idx} · RLS-açık tablo: {rls}")
        print(f"Uzantılar: {', '.join(sorted(exts))} · HNSW vektör indeksi: {'VAR' if hnsw else 'YOK'}")

        ok = not missing and enums >= 8 and {"vector", "pgcrypto", "pg_trgm"} <= set(exts)
        print("\nSONUÇ:", "✅ ŞEMA HAZIR" if ok else "⚠️ eksik var")
        return 0 if ok else 2
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
