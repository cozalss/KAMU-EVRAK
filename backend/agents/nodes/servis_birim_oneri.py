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


def _muhatap_belediye(text: str) -> bool:
    from agents.kurum_kimlik import muhatap_kurum_tespit
    from core.sicil import sicil_turu

    muhatap = muhatap_kurum_tespit(text, {})
    if not muhatap.get("slug"):
        return True  # hitapsız evrak: muhatap kurulum kurumudur (KURUM_ADI), engelleme
    return muhatap.get("tur") == "belediye" or sicil_turu(muhatap.get("slug", "")) == "belediye"


async def servis_birim_oneri_node(state: dict[str, Any]) -> dict[str, Any]:
    """İçerikten somut hizmet müdürlüğü önerisi (additive; hedef_birim'e dokunmaz)."""
    text = state.get("evrak_text", "") or ""
    # Katalog BELEDİYE hizmet müdürlükleridir: valiliğe/üniversiteye belediye müdürlüğü
    # önermek yanlış tipin birimini göstermektir (teşhis 2026-10-05). Muhatap belediye
    # bilinen ve belediye değilse öneri yapılmaz; gerçek birimi route_ajan verir.
    if not _muhatap_belediye(text):
        return {}
    servis = oner_servis_birimi(text)
    return {"servis_birimi": servis} if servis else {}


__all__ = ("servis_birim_oneri_node",)
