"""Servis müdürlüğü önerisi node'u — route_birim'in additive danışma katmanı, ayrı dalda.

Hız dalgası 15a (config.PARALEL_TRIYAJ): oner_servis_birimi_llm YALNIZ evrak_text okur →
9-birim kararını (route_birim) ya da tür sınıflandırmasını beklemesi gerekmez. Triyaj
fan-out'unda mevzuat/özet/eksik-soru çağrılarıyla YAN YANA koşar; route_birim fan-in'inde
birleşir. Davranış route_birim'deki eski satırlarla BİREBİR (aynı fonksiyonlar, aynı
öncelik: LLM kapalı-küme birincil → kök-anahtar fallback → eşleşme yoksa alan hiç
yazılmaz — uydurma müdürlük üretilmez, resmî havale hedef_birim'dedir).

PARALEL_TRIYAJ=0 → bu node grafta YOK; servis önerisini route_birim üretir (baseline).
UI sözleşmesi: node PIPELINE_NODES'ta GÖRÜNMEZ (graph.GIZLI_NODELAR) — adım listesi
değişmez; servis_birimi alanı final sonuçla taşınır.
"""

from __future__ import annotations

from typing import Any

from agents.config import SERVIS_BIRIM_LLM
from agents.servis_birim import oner_servis_birimi, oner_servis_birimi_llm


async def servis_birim_oneri_node(state: dict[str, Any]) -> dict[str, Any]:
    """İçerikten somut hizmet müdürlüğü önerisi (additive; hedef_birim'e dokunmaz)."""
    text = state.get("evrak_text", "") or ""
    servis = await oner_servis_birimi_llm(text) if SERVIS_BIRIM_LLM else None
    if servis is None:
        servis = oner_servis_birimi(text)
    return {"servis_birimi": servis} if servis else {}


__all__ = ("servis_birim_oneri_node",)
