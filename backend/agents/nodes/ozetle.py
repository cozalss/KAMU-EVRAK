"""Görev 1 — Evrak özeti node'u.

# TODO(kamu-evrak): STUB naif kısaltma yapar. Üretimde:
#   - LLM (get_llm) ile kısa-öz özet VEYA mT5-turkish-summarization (Apache-2.0),
#   - key-fact recall odaklı (eval/summary_eval.py LLM-judge kapsama metriği),
#   - ADALET nodes/draft.py prompt-bütçe/adaptif-token deseni ADAPT.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import evrak_turu_tr

log = structlog.get_logger()

_MAX_OZET = 280


async def ozetle_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak için kısa öz özet üret (STUB: tür + konu + ilk cümleler)."""
    text = (state.get("evrak_text") or "").strip()
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = unsurlar.get("konu")

    govde = " ".join(text.split())
    if len(govde) > _MAX_OZET:
        govde = govde[:_MAX_OZET].rsplit(" ", 1)[0] + "…"

    parcalar = [f"**{evrak_turu_tr(turu)}**"]
    if konu:
        parcalar.append(f"Konu: {konu}")
    parcalar.append(govde or "_metin boş_")
    ozet = " — ".join(parcalar)

    log.info("ozetle", turu=turu, n_chars=len(ozet))
    return {"ozet": ozet}


__all__ = ("ozetle_node",)
