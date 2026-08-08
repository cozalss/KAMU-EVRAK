"""Servis müdürlüğü önerisi node'u — hızlı, deterministik danışma katmanı.

Bu erken fan-out dalı LangGraph bariyerinin parçasıdır. Burada uzak LLM çağrısı yapmak,
kanıt bağlama gibi milisaniyelik düğümleri de çağrı bitene kadar bekletiyordu. Bu nedenle
node yalnız kapalı yerel katalog/kök eşleşmesini kullanır. Kaynak-doğrulanmış resmî havale
kararı yine ``route_birim``/``route_ajan`` tarafından verilir; bu alan sadece fallback ve
taslak anteti için additive bir öneridir.

PARALEL_TRIYAJ=0 → bu node grafta YOK; servis önerisini route_birim üretir (baseline).
UI sözleşmesi: node PIPELINE_NODES'ta GÖRÜNMEZ (graph.GIZLI_NODELAR) — adım listesi
değişmez; servis_birimi alanı final sonuçla taşınır.
"""

from __future__ import annotations

from typing import Any

from agents.servis_birim import oner_servis_birimi


async def servis_birim_oneri_node(state: dict[str, Any]) -> dict[str, Any]:
    """İçerikten somut hizmet müdürlüğü önerisi (additive; hedef_birim'e dokunmaz)."""
    text = state.get("evrak_text", "") or ""
    servis = oner_servis_birimi(text)
    return {"servis_birimi": servis} if servis else {}


__all__ = ("servis_birim_oneri_node",)
