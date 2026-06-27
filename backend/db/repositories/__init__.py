"""Repository katmanı — pipeline çıktısı ↔ DB (adapter; pipeline'ı bozmaz).

islem_repo: gelen_evrak ingest + ProcessResponse → islem + normalize tablolar.
Stateless demo modu korunur; persistence ENV-gated çağrılır (Faz 7 route wiring).
"""
from __future__ import annotations

from db.repositories.islem_repo import evrak_olustur, persist_islem

__all__ = ("evrak_olustur", "persist_islem")
