"""Async SQLAlchemy engine + session factory (Supabase / asyncpg).

DATABASE_URL = transaction pooler (:6543) → uygulama runtime için doğru (kısa-ömürlü
bağlantı, yüksek eşzamanlılık). Supavisor txn modu PREPARED STATEMENT desteklemez →
asyncpg statement cache KAPALI + NullPool (pooler zaten havuzlar). DDL/migration için
DATABASE_URL_SYNC (:5432 session pooler) ayrı kullanılır (alembic).
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

from dotenv import find_dotenv, load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

load_dotenv(find_dotenv(usecwd=True))

_URL = os.environ.get("DATABASE_URL", "")
if not _URL:
    raise RuntimeError("DATABASE_URL tanımsız (.env). Supabase bağlantı dizgesi gerekli.")

# Supavisor transaction pooler: prepared statement YOK → cache kapat, pooler havuzlar.
engine = create_async_engine(
    _URL,
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    echo=os.getenv("SQL_ECHO", "0") == "1",
)

session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI bağımlılığı — istek başına bir async oturum (commit/rollback çağıran sorumlu)."""
    async with session_factory() as session:
        yield session


__all__ = ("engine", "session_factory", "get_session")
