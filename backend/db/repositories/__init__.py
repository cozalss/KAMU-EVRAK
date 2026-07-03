"""Repository katmanı — pipeline çıktısı ↔ DB (adapter; pipeline'ı bozmaz).

islem_repo: gelen_evrak ingest + ProcessResponse → islem + normalize tablolar.
Stateless demo modu korunur; persistence ENV-gated çağrılır (Faz 7 route wiring).
"""
from __future__ import annotations

from db.repositories.denetim_repo import dogrula_denetim, persist_denetim
from db.repositories.imha_repo import imha_uygula, saklama_yil, suresi_dolmus
from db.repositories.islem_repo import evrak_olustur, persist_islem
from db.repositories.karar_repo import KararError, onayla_ve_gonder, taslak_sil

__all__ = (
    "KararError", "dogrula_denetim", "evrak_olustur", "imha_uygula",
    "onayla_ve_gonder", "persist_denetim", "persist_islem", "saklama_yil",
    "suresi_dolmus", "taslak_sil",
)
