"""kamu-evrak persistence katmanı — SQLAlchemy 2.0 async + asyncpg (Supabase).

Şema: db/schema.sql (uygulanmış). Bağlantı: .env DATABASE_URL (async, txn pooler :6543).
Erişim denetimi UYGULAMA katmanında (JWT + repository); RLS Supabase anon savunması.
"""
from __future__ import annotations

from db.session import engine, get_session, session_factory

__all__ = ("engine", "get_session", "session_factory")
