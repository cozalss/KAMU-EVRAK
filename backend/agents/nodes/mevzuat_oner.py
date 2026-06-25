"""Görev 1 — İlgili mevzuat / yazışma kuralı önerme node'u.

# TODO(kamu-evrak): STUB statik eşleme (config.EVRAK_TO_MEVZUAT) döner. Üretimde:
#   - data/mevzuat/ (2646, 3071, 4982, 7201, SDP) korpusu Qdrant'a seed → BGE-M3 hybrid RAG
#     (ADALET nodes/mevzuat.py + retrieval/ KEEP), opsiyonel mevzuat-mcp zenginleştirme.
#   - Madde no'ları çıktıdan önce DOĞRULANIR (CLAUDE.md §1: uydurma referans yasak).
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import EVRAK_TO_MEVZUAT

log = structlog.get_logger()


async def mevzuat_oner_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak türüne göre ilgili mevzuatı öner (STUB: statik harita; üretimde RAG)."""
    turu = state.get("evrak_turu", "belirsiz")
    basliklar = EVRAK_TO_MEVZUAT.get(turu, [])
    oneriler = [{"baslik": b, "score": 0.5} for b in basliklar]
    if not oneriler:
        oneriler = [{
            "baslik": "Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)",
            "score": 0.3,
        }]
    log.info("mevzuat_oner", turu=turu, n=len(oneriler))
    return {"mevzuat_onerileri": oneriler}


__all__ = ("mevzuat_oner_node",)
