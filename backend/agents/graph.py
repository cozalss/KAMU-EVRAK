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
                                    verify
                                       ▼
                                    arsiv   (SDP 2005/7 arşiv metadata — additive)
                                       ▼
                                   finalize → END

# TODO(kamu-evrak): Üretimde ENV-gated SOTA node'lar (crag/self_rag/decompose — ADALET'ten
# KEEP) + verify/risk_guard (uydurma kurum/tarih/sayı veto) + clarifier dur-ve-sor dalı eklenir.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from agents.config import (
    CLARIFY_STOP_ENABLED,
    CRAG_ENABLED,
    SELF_RAG_ENABLED,
)
from agents.nodes.arsiv import arsiv_node
from agents.nodes.cikar import cikar_node
from agents.nodes.clarifier import clarifier_node, kritik_eksikler
from agents.nodes.crag import crag_node
from agents.nodes.eksik_tespit import eksik_tespit_node
from agents.nodes.finalize import finalize_node
from agents.nodes.mevzuat_oner import mevzuat_oner_node
from agents.nodes.ozetle import ozetle_node
from agents.nodes.route_birim import route_birim_node
from agents.nodes.self_rag import self_rag_node
from agents.nodes.siniflandir import siniflandir_node
from agents.nodes.verify import verify_node
from agents.nodes.yazi_taslak import yazi_taslak_node
from agents.state import EvrakState

def _pipeline_nodes() -> tuple[str, ...]:
    """Aktif node sıra etiketleri (frontend topology / SSE ile eşleşir).

    CRAG/Self-RAG ENV-gated → açıkken sırada görünür (şeffaflık), kapalıyken baseline
    dizi birebir korunur. Modül-seviyesi PIPELINE_NODES geriye-uyum için baseline'ı tutar.
    """
    nodes = ["siniflandir", "cikar", "eksik_tespit", "mevzuat_oner"]
    if CRAG_ENABLED:
        nodes.append("crag")
    nodes += ["ozetle", "route_birim", "yazi_taslak", "verify"]
    if SELF_RAG_ENABLED:
        nodes.append("self_rag")
    # arsiv: SDP 2005/7 arşiv metadata (additive — yenilikçilik); verify/self_rag→arsiv→finalize.
    nodes += ["arsiv", "finalize"]
    return tuple(nodes)


# SSE / Ajan Akış Şeması için node sıra etiketleri (frontend topology ile eşleşir).
# verify, yazi_taslak→finalize arasına eklendi (additive — Görev 2 kalite kapısı).
# NOT: modül sabiti baseline diziyi tutar (geriye-uyum). Aktif dizi için _pipeline_nodes().
PIPELINE_NODES: tuple[str, ...] = _pipeline_nodes()


def _clarify_route(state: dict[str, Any]) -> str:
    """route_birim sonrası dal seçimi: kritik eksik → dur-ve-sor, değilse normal taslak.

    Yalnız CLARIFY_STOP_ENABLED açıkken bu router devrededir (aksi halde düz edge).
    Dönüş değerleri add_conditional_edges path-map anahtarlarıyla eşleşir.
    """
    return "clarifier" if kritik_eksikler(state) else "yazi_taslak"


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
    g.add_node("verify", verify_node)
    g.add_node("arsiv", arsiv_node)
    g.add_node("finalize", finalize_node)

    g.add_edge(START, "siniflandir")
    g.add_edge("siniflandir", "cikar")
    g.add_edge("cikar", "eksik_tespit")
    # Fan-out: mevzuat önerisi + özet paralel (state reducer'ları fan-in birleştirir).
    g.add_edge("eksik_tespit", "mevzuat_oner")
    g.add_edge("eksik_tespit", "ozetle")
    g.add_edge("ozetle", "route_birim")

    if CRAG_ENABLED:
        # CRAG öz-düzeltme (ENV-gated): mevzuat_oner → crag → route_birim. crag düşük-
        # güvenli retrieval'ı sorgu-genişletmeyle düzeltir (Yan et al. 2024). Kapalıyken
        # bu node grafta YOK → baseline fan-in (mevzuat_oner→route_birim) birebir korunur.
        g.add_node("crag", crag_node)
        g.add_edge("mevzuat_oner", "crag")
        g.add_edge("crag", "route_birim")
    else:
        # Baseline fan-in → birim yönlendirme (mevzuat_oner doğrudan route_birim'e).
        g.add_edge("mevzuat_oner", "route_birim")

    if CLARIFY_STOP_ENABLED:
        # Dur-ve-sor dalı (ENV-gated): kritik eksikte taslak ÜRETMEDEN kullanıcıdan
        # bilgi iste. clarifier kendi dur-ve-sor mesajını yazar → doğrudan END
        # (finalize'ı atla ki mesaj korunsun; finalize scope dışı, ezmesin).
        g.add_node("clarifier", clarifier_node)
        g.add_conditional_edges(
            "route_birim", _clarify_route,
            {"clarifier": "clarifier", "yazi_taslak": "yazi_taslak"},
        )
        g.add_edge("clarifier", END)
    else:
        # Varsayılan (KAPALI): baseline akış — her evrak için taslak üretilir.
        g.add_edge("route_birim", "yazi_taslak")

    # verify: taslak kalite kapısı (additive). VERIFY_ENABLED=0 ise node no-op.
    g.add_edge("yazi_taslak", "verify")

    if SELF_RAG_ENABLED:
        # Self-RAG reflection (ENV-gated): verify → self_rag → arsiv. self_rag
        # çıktının TAMLIĞINI öz-değerlendirir (Asai et al. 2023). Kapalıyken bu node
        # grafta YOK → baseline (verify→arsiv) birebir korunur.
        g.add_node("self_rag", self_rag_node)
        g.add_edge("verify", "self_rag")
        g.add_edge("self_rag", "arsiv")
    else:
        g.add_edge("verify", "arsiv")

    # arsiv: SDP 2005/7 arşiv metadata kapısı (additive — yenilikçilik). verify/self_rag
    # sonrası, finalize öncesi çalışır → bilgilendirmeye arşiv satırı eklenebilir.
    g.add_edge("arsiv", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


__all__ = ("PIPELINE_NODES", "build_graph")
