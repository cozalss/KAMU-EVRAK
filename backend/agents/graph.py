"""LangGraph topolojisi — kamu-evrak uçtan-uca pipeline (Görev 1 + Görev 2).

ADALET-AGENT graph.py deseninden ADAPT: StateGraph + conditional-edge + fan-in/fan-out
KEEP; node listesi evrak iş-akışına yenilendi. OCR (`oku`) graf-öncesi (API route'unda)
yapılır; graf metin üzerinde çalışır → saf/test-edilebilir.

Akış:

    START → siniflandir → cikar → eksik_tespit
                                       │
                          ┌────────────┴────────────┐
                          ▼                          ▼
                     mevzuat_oner                 ozetle      (paralel fan-out)
                          └────────────┬────────────┘
                                       ▼
                                  route_birim
                                       │
                          eksik var? ──┤
                                       ▼
                                  yazi_taslak  (eksik yoksa taslak; varsa yine iskelet)
                                       ▼
                                   finalize → END

# TODO(kamu-evrak): Üretimde ENV-gated SOTA node'lar (crag/self_rag/decompose — ADALET'ten
# KEEP) + verify/risk_guard (uydurma kurum/tarih/sayı veto) + clarifier dur-ve-sor dalı eklenir.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from agents.nodes.cikar import cikar_node
from agents.nodes.eksik_tespit import eksik_tespit_node
from agents.nodes.finalize import finalize_node
from agents.nodes.mevzuat_oner import mevzuat_oner_node
from agents.nodes.ozetle import ozetle_node
from agents.nodes.route_birim import route_birim_node
from agents.nodes.siniflandir import siniflandir_node
from agents.nodes.yazi_taslak import yazi_taslak_node
from agents.state import EvrakState

# SSE / Ajan Akış Şeması için node sıra etiketleri (frontend topology ile eşleşir).
PIPELINE_NODES: tuple[str, ...] = (
    "siniflandir", "cikar", "eksik_tespit", "mevzuat_oner", "ozetle",
    "route_birim", "yazi_taslak", "finalize",
)


def build_graph() -> Any:
    """Compiled LangGraph — `await graph.ainvoke(make_initial_state(text))` ile çağrılır."""
    g = StateGraph(EvrakState)

    g.add_node("siniflandir", siniflandir_node)
    g.add_node("cikar", cikar_node)
    g.add_node("eksik_tespit", eksik_tespit_node)
    g.add_node("mevzuat_oner", mevzuat_oner_node)
    g.add_node("ozetle", ozetle_node)
    g.add_node("route_birim", route_birim_node)
    g.add_node("yazi_taslak", yazi_taslak_node)
    g.add_node("finalize", finalize_node)

    g.add_edge(START, "siniflandir")
    g.add_edge("siniflandir", "cikar")
    g.add_edge("cikar", "eksik_tespit")
    # Fan-out: mevzuat önerisi + özet paralel (state reducer'ları fan-in birleştirir).
    g.add_edge("eksik_tespit", "mevzuat_oner")
    g.add_edge("eksik_tespit", "ozetle")
    # Fan-in → birim yönlendirme.
    g.add_edge("mevzuat_oner", "route_birim")
    g.add_edge("ozetle", "route_birim")
    g.add_edge("route_birim", "yazi_taslak")
    g.add_edge("yazi_taslak", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


__all__ = ("PIPELINE_NODES", "build_graph")
