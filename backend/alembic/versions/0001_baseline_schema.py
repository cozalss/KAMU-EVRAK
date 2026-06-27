"""baseline — tam şema (db/schema.sql)

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-27

Sıfır DB'de `alembic upgrade head` → tüm şemayı kurar (idempotent schema.sql).
Şema zaten uygulanmış canlı DB'de `alembic stamp 0001_baseline` (DDL tekrar çalışmaz).
İçerik tek-doğruluk: backend/db/schema.sql (database-reviewer düzeltmeleri dahil).
"""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

_SCHEMA = Path(__file__).resolve().parents[2] / "db" / "schema.sql"


def upgrade() -> None:
    sql = _SCHEMA.read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # Baseline geri-alınmaz (tüm public şemayı düşürmek istenirse manuel).
    raise NotImplementedError("baseline downgrade desteklenmiyor (tam şema)")
