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

ENV-gated gelişmiş node'lar UYGULANDI: decompose (DECOMPOSE_ENABLED, çok-konulu evrak →
alt-talepler, fan-out kaynağı, varsayılan AÇIK), risk_guard (RISK_GUARD_ENABLED, trafik
ışığı 🟢🟡🔴 + KOŞULLU HITL — verify sonrası, varsayılan AÇIK), crag (CRAG_ENABLED), self_rag
(SELF_RAG_ENABLED), verify (taslak kalite kapısı), clarifier dur-ve-sor (CLARIFY_STOP_ENABLED).
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from agents.config import (
    CLARIFY_STOP_ENABLED,
    CRAG_ENABLED,
    DECOMPOSE_ENABLED,
    HITL_ENABLED,
    NLI_ENABLED,
    RISK_GUARD_ENABLED,
    SELF_RAG_ENABLED,
)
from agents.nodes.arsiv import arsiv_node
from agents.nodes.cikar import cikar_node
from agents.nodes.clarifier import clarifier_node, kritik_eksikler
from agents.nodes.crag import crag_node
from agents.nodes.decompose import decompose_node
from agents.nodes.denetim_izi import denetim_izi_node
from agents.nodes.eksik_tespit import eksik_tespit_node
from agents.nodes.finalize import finalize_node
from agents.nodes.kanit_baglama import kanit_baglama_node
from agents.nodes.mevzuat_dogrula import mevzuat_dogrula_node
from agents.nodes.mevzuat_oner import mevzuat_oner_node
from agents.nodes.onay_kapisi import onay_kapisi_node
from agents.nodes.ozetle import ozetle_node
from agents.nodes.risk_guard import risk_guard_node
from agents.nodes.route_birim import route_birim_node
from agents.nodes.self_rag import self_rag_node
from agents.nodes.siniflandir import siniflandir_node
from agents.nodes.sla_triyaj import sla_triyaj_node
from agents.nodes.verify import verify_node
from agents.nodes.yazi_taslak import yazi_taslak_node
from agents.state import EvrakState


def _pipeline_nodes() -> tuple[str, ...]:
    """Aktif node sıra etiketleri (frontend topology / SSE ile eşleşir).

    CRAG/Self-RAG ENV-gated → açıkken sırada görünür (şeffaflık), kapalıyken baseline
    dizi birebir korunur. Modül-seviyesi PIPELINE_NODES geriye-uyum için baseline'ı tutar.
    """
    nodes = ["siniflandir", "cikar", "kanit_baglama", "eksik_tespit"]
    if DECOMPOSE_ENABLED:
        nodes.append("decompose")  # çok-konulu evrak ayrıştırma (paralel fan-out kaynağı)
    nodes.append("mevzuat_oner")
    if CRAG_ENABLED:
        nodes.append("crag")
    if NLI_ENABLED:
        nodes.append("mevzuat_dogrula")
    nodes += ["ozetle", "route_birim", "yazi_taslak", "verify"]
    if RISK_GUARD_ENABLED:
        nodes.append("risk_guard")   # trafik ışığı bandı (verify sonrası)
    if SELF_RAG_ENABLED:
        nodes.append("self_rag")
    if HITL_ENABLED:
        nodes.append("onay_kapisi")  # KOŞULLU memur onayı (risk sarı/kırmızı → dur)
    # additive yenilikçilik node'ları: arsiv (SDP) → sla_triyaj (yasal süre) →
    # denetim_izi (hash-chain). … → arsiv → sla_triyaj → denetim_izi → finalize.
    nodes += ["arsiv", "sla_triyaj", "denetim_izi", "finalize"]
    return tuple(nodes)


# SSE / Ajan Akış Şeması için node sıra etiketleri (frontend topology ile eşleşir).
# verify, yazi_taslak→finalize arasına eklendi (additive — Görev 2 kalite kapısı).
# NOT: modül sabiti baseline diziyi tutar (geriye-uyum). Aktif dizi için _pipeline_nodes().
#
# DİKKAT — bu DÜZ LİSTE gerçek graf topolojisini birebir TEMSİL ETMEZ; yalnız SSE'de
# kullanıcıya gösterilecek okunabilir bir SIRA sağlar. Gerçek akışta:
#   • mevzuat_oner ∥ ozetle PARALEL dallardır (eksik_tespit'ten fan-out, route_birim'de
#     fan-in) — listede yan yana görünseler de sıralı çalışmazlar.
#   • crag KOŞULLU bir dalda (CRAG_ENABLED) mevzuat_oner→route_birim arasına girer.
#   • self_rag KOŞULLU (SELF_RAG_ENABLED) verify→arsiv arasına girer.
# Bağlayıcı topoloji build_graph()'tedir; bu sabit yalnız görselleştirme etiketidir.
PIPELINE_NODES: tuple[str, ...] = _pipeline_nodes()


def _clarify_route(state: dict[str, Any]) -> str:
    """route_birim sonrası dal seçimi: kritik eksik → dur-ve-sor, değilse normal taslak.

    Yalnız CLARIFY_STOP_ENABLED açıkken bu router devrededir (aksi halde düz edge).
    Dönüş değerleri add_conditional_edges path-map anahtarlarıyla eşleşir.
    """
    return "clarifier" if kritik_eksikler(state) else "yazi_taslak"


def _risk_route(state: dict[str, Any]) -> str:
    """risk_guard sonrası koşullu onay: sarı/kırmızı → memur onayı, yeşil → otomatik geç (arsiv).

    Yalnız RISK_GUARD_ENABLED + HITL_ENABLED birlikte açıkken devrede (akıllı/koşullu onay).
    Banka mantığı: güvenli (yeşil) anında geçer, riskli (sarı/kırmızı) insana sorulur.
    """
    bant = (state.get("risk_metadata") or {}).get("bant", "yesil")
    return "onay_kapisi" if bant in ("sari", "kirmizi") else "arsiv"


def build_graph(checkpointer: Any = None) -> Any:
    """Compiled LangGraph — `await graph.ainvoke(make_initial_state(text))` ile çağrılır.

    checkpointer: None (varsayılan) → baseline, kesintisiz compile (mevcut davranış birebir).
    HITL_ENABLED + checkpointer (InMemorySaver) verilirse onay_kapisi interrupt() ile durur
    ve `Command(resume=...)` ile sürer (memur onayı). HITL için API checkpointer geçer.
    """
    g = StateGraph(EvrakState)

    g.add_node("siniflandir", siniflandir_node)
    g.add_node("cikar", cikar_node)
    g.add_node("kanit_baglama", kanit_baglama_node)
    g.add_node("eksik_tespit", eksik_tespit_node)
    g.add_node("mevzuat_oner", mevzuat_oner_node)
    g.add_node("ozetle", ozetle_node)
    g.add_node("route_birim", route_birim_node)
    g.add_node("yazi_taslak", yazi_taslak_node)
    g.add_node("verify", verify_node)
    g.add_node("arsiv", arsiv_node)
    g.add_node("sla_triyaj", sla_triyaj_node)
    g.add_node("denetim_izi", denetim_izi_node)
    g.add_node("finalize", finalize_node)

    g.add_edge(START, "siniflandir")
    g.add_edge("siniflandir", "cikar")
    # kanit_baglama: çıkarılan unsurları (maskeli) metindeki yerine bağla (additive).
    g.add_edge("cikar", "kanit_baglama")
    g.add_edge("kanit_baglama", "eksik_tespit")
    # Decompose (ENV-gated): çok-konulu evrakı alt-taleplere böl (additive). Açıkken paralel
    # fan-out kaynağı eksik_tespit yerine decompose olur; kapalıyken node grafta YOK →
    # baseline (eksik_tespit → mevzuat_oner ∥ ozetle) birebir korunur.
    fanout_src = "eksik_tespit"
    if DECOMPOSE_ENABLED:
        g.add_node("decompose", decompose_node)
        g.add_edge("eksik_tespit", "decompose")
        fanout_src = "decompose"
    # Fan-out: mevzuat önerisi + özet paralel (state reducer'ları fan-in birleştirir).
    g.add_edge(fanout_src, "mevzuat_oner")
    g.add_edge(fanout_src, "ozetle")
    g.add_edge("ozetle", "route_birim")

    # Mevzuat dalı kuyruğu: mevzuat_oner → [crag?] → [mevzuat_dogrula?] → route_birim.
    # İkisi de ENV-gated; kapalıyken node grafta YOK → baseline (mevzuat_oner→route_birim) korunur.
    mevzuat_tail = "mevzuat_oner"
    if CRAG_ENABLED:
        # CRAG öz-düzeltme (Yan et al. 2024): düşük-güvenli retrieval'ı sorgu-genişletmeyle düzeltir.
        g.add_node("crag", crag_node)
        g.add_edge(mevzuat_tail, "crag")
        mevzuat_tail = "crag"
    if NLI_ENABLED:
        # NLI atıf-gerekçelendirme: önerilen madde ⊨ evrak talebi entailment doğrulaması (additive).
        g.add_node("mevzuat_dogrula", mevzuat_dogrula_node)
        g.add_edge(mevzuat_tail, "mevzuat_dogrula")
        mevzuat_tail = "mevzuat_dogrula"
    g.add_edge(mevzuat_tail, "route_birim")

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

    # verify HER ZAMAN yazi_taslak'tan sonra (risk bandı için verify, onay'dan ÖNCE çalışmalı).
    g.add_edge("yazi_taslak", "verify")

    # Doğrulama-sonrası additive kuyruk: [risk_guard] → [self_rag] → [KOŞULLU onay] → arsiv.
    # tail = onay/arsiv kapısına giren son node (ENV-gated node'lara göre kayar).
    tail = "verify"
    if RISK_GUARD_ENABLED:
        # Risk bandı (trafik ışığı): verify sinyallerini yeşil/sarı/kırmızı'ya çevirir (additive).
        g.add_node("risk_guard", risk_guard_node)
        g.add_edge(tail, "risk_guard")
        tail = "risk_guard"
    if SELF_RAG_ENABLED:
        # Self-RAG reflection (ENV-gated): çıktı tamlığını öz-değerlendirir (Asai et al. 2023).
        g.add_node("self_rag", self_rag_node)
        g.add_edge(tail, "self_rag")
        tail = "self_rag"

    if HITL_ENABLED:
        # Memur onay kapısı (interrupt() — checkpointer ŞART → build_graph(checkpointer=...)).
        # RISK_GUARD ile KOŞULLU: yeşil → otomatik geç (arsiv); sarı/kırmızı → onay_kapisi → arsiv.
        # RISK_GUARD yoksa KOŞULSUZ (her taslak onaya). Kapalıyken node grafta YOK → baseline birebir.
        g.add_node("onay_kapisi", onay_kapisi_node)
        if RISK_GUARD_ENABLED:
            g.add_conditional_edges(tail, _risk_route,
                                    {"onay_kapisi": "onay_kapisi", "arsiv": "arsiv"})
        else:
            g.add_edge(tail, "onay_kapisi")
        g.add_edge("onay_kapisi", "arsiv")
    else:
        g.add_edge(tail, "arsiv")

    # arsiv: SDP 2005/7 arşiv metadata kapısı (additive — yenilikçilik). verify/self_rag
    # sonrası, finalize öncesi çalışır → bilgilendirmeye arşiv satırı eklenebilir.
    g.add_edge("arsiv", "sla_triyaj")
    # sla_triyaj: yasal süre triyajı (additive, deterministik) → GECİKMİŞ/KRİTİK rozeti.
    g.add_edge("sla_triyaj", "denetim_izi")
    # denetim_izi: tamper-evident SHA-256 hash-chain (additive) → Sayıştay/KVKK denetim izi.
    g.add_edge("denetim_izi", "finalize")
    g.add_edge("finalize", END)

    # checkpointer=None → baseline (kesintisiz). HITL için API InMemorySaver geçer.
    return g.compile(checkpointer=checkpointer)


__all__ = ("PIPELINE_NODES", "build_graph")
