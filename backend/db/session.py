"""Async SQLAlchemy engine + session factory (Supabase / asyncpg).

DATABASE_URL = transaction pooler (:6543) → uygulama runtime için doğru (kısa-ömürlü
bağlantı, yüksek eşzamanlılık). Supavisor txn modu PREPARED STATEMENT desteklemez →
asyncpg statement cache KAPALI + NullPool (pooler zaten havuzlar). DDL/migration için
DATABASE_URL_SYNC (:5432 session pooler) ayrı kullanılır (alembic).
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

import structlog
from dotenv import find_dotenv, load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

load_dotenv(find_dotenv(usecwd=True))


def _url_yukle() -> str:
    """DATABASE_URL .env'den; yoksa geçerli-sözdizimli placeholder (taze klon boot'u).

    Eski import-time RuntimeError, .env'siz `uv run main.py`'yi çökertiyordu. Engine lazy
    bağlanır (NullPool) → placeholder ile API/pipeline tam çalışır; persist/auth ilk DB
    kullanımında hızlı, yakalanan hatayla düşer (.env.example kopyalanmış durumla birebir;
    process_doc persist'i zaten db_persist_hata ile yutuyor). Alembic/seed araçlarının
    kendi fail-fast'leri korunur — yalnız uygulama boot'u yumuşatıldı.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    # Üretim kapısı — auth.security._secret_yukle ile aynı gerekçe: maskeleme yerine fail-fast.
    if os.environ.get("APP_ENV", "").strip().lower() in ("prod", "production"):
        raise RuntimeError("DATABASE_URL zorunlu (APP_ENV=production) — bkz. backend/db/README.md.")
    structlog.get_logger().warning(
        "database_url_yok",
        etki="DB persist + login çalışmaz (API/pipeline/mobil QR tam çalışır)",
        cozum="Supabase bağlantısı için .env'e DATABASE_URL ekle (bkz. backend/db/README.md)",
    )
    return "postgresql+asyncpg://kamu:kamu@localhost:5432/kamu_evrak_yok"


_URL = _url_yukle()

# Supavisor transaction pooler: prepared statement YOK → cache kapat, pooler havuzlar.
# server_settings: sızmış/uzun tek transaction free-tier'de tüm pooler slotlarını süresiz
# tutup komşu istekleri kilitlemesin (DB denetimi bulgusu). statement_timeout tekil sorguyu,
# idle_in_transaction açık ama boşta kalan transaction'ı sınırlar — env ile ayarlanabilir.
_STATEMENT_TIMEOUT_MS = os.getenv("DB_STATEMENT_TIMEOUT_MS", "15000").strip()
_IDLE_TX_TIMEOUT_MS = os.getenv("DB_IDLE_TX_TIMEOUT_MS", "10000").strip()
engine = create_async_engine(
    _URL,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "server_settings": {
            "statement_timeout": _STATEMENT_TIMEOUT_MS,
            "idle_in_transaction_session_timeout": _IDLE_TX_TIMEOUT_MS,
        },
    },
    echo=os.getenv("SQL_ECHO", "0") == "1",
)

session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI bağımlılığı — istek başına bir async oturum (commit/rollback çağıran sorumlu)."""
    async with session_factory() as session:
        yield session


__all__ = ("engine", "get_session", "session_factory")
