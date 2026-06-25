"""Görev 2 — Birim yönlendirme (havale) node'u.

# TODO(kamu-evrak): STUB statik eşleme (config.EVRAK_TO_BIRIM) döner. Üretimde:
#   - içerik-temelli sınıflandırıcı (few-shot LLM / DistilBERTurk) + top-k alternatif,
#   - maliyet-ağırlıklı hata matrisi (yanlış havale maliyeti yüksek),
#   - eval/routing_eval.py Top-1/Top-3 accuracy + MRR.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import BIRIM_TR, EVRAK_TO_BIRIM

log = structlog.get_logger()


async def route_birim_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak türüne göre hedef birimi belirle (STUB: statik harita; üretimde sınıflandırıcı)."""
    turu = state.get("evrak_turu", "belirsiz")
    hedef = EVRAK_TO_BIRIM.get(turu, "yazi_isleri_evrak")
    # Alternatif: her evrak önce Yazı İşleri'ne düşer (resmî havale akışı).
    alternatifler = [hedef]
    if hedef != "yazi_isleri_evrak":
        alternatifler.append("yazi_isleri_evrak")
    log.info("route_birim", turu=turu, hedef=hedef)
    return {
        "hedef_birim": hedef,
        "birim_alternatifleri": alternatifler,
        "birim_reasoning": f"{BIRIM_TR.get(hedef, hedef)} (tür: {turu})",
    }


__all__ = ("route_birim_node",)
