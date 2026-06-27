"""Declarative base + ortak mixin'ler (SQLAlchemy 2.0 tiplemeli)."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Tüm ORM modellerinin ortak tabanı."""


class UUIDPk:
    """gen_random_uuid() PK mixin (pgcrypto)."""

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )


class Olusturuldu:
    """now() oluşturma damgası mixin."""

    olusturuldu: Mapped[_dt.datetime] = mapped_column(server_default=func.now())


__all__ = ("Base", "UUIDPk", "Olusturuldu")
