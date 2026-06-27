"""Alembic ortamı — kamu-evrak (Supabase / PostgreSQL).

Bağlantı .env DATABASE_URL_SYNC'ten gelir (psycopg, session pooler :5432 — DDL için
doğru kanal). Baseline (0001) ham schema.sql çalıştırır; sonraki revizyonlar ORM
modelleri eklendikçe autogenerate ile üretilebilir (şimdilik target_metadata=None).
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from dotenv import find_dotenv, load_dotenv
from sqlalchemy import engine_from_config, pool

load_dotenv(find_dotenv(usecwd=True))

config = context.config

# .env'den bağlantı dizgesini enjekte et (alembic.ini'de düz-metin parola tutma).
_url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL", "")
if _url:
    config.set_main_option("sqlalchemy.url", _url.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # baseline ham SQL; ORM autogenerate Faz 3'te eklenecek.


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
