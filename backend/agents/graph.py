"""LangGraph topolojisi — kamu-evrak uçtan-uca pipeline (Görev 1 + Görev 2).

ADALET-AGENT graph.py deseninden ADAPT: StateGraph + conditional-edge + fan-in/fan-out
KEEP; node listesi evrak iş-akışına yenilendi. OCR (`oku`) graf-öncesi (API route'unda)
yapılır; graf metin üzerinde çalışır → saf/test-edilebilir.

Akış:

    START → siniflandir → cikar → kanit_baglama → eksik_tespit → [decompose]
                                                       │
                                      ┌────────────────┴────────────────┐
                                      ▼                                 ▼
                                 mevzuat_oner                        ozetle   (paralel fan-out)
                                      └────────────────┬────────────────┘
                                                       ▼
       route_birim → yazi_taslak → verify → [risk_guard] → (🟢 geç │ 🟡🔴 → onay_kapisi*)
             → arsiv → sla_triyaj → denetim_izi → finalize → END

    [.] ENV-gated (decompose/risk_guard varsayılan AÇIK; * onay_kapisi HITL ile koşullu).
    Additive yenilikçilik node'ları (kanit_baglama/arsiv/sla_triyaj/denetim_izi) çıktıyı
    zenginleştirir, birincil tür/birim/yönlendirmeyi DEĞİŞTİRMEZ.

ENV-gated gelişmiş node'lar UYGULANDI: decompose (DECOMPOSE_ENABLED, çok-konulu evrak →
alt-talepler, fan-out kaynağı, varsayılan AÇIK), risk_guard (RISK_GUARD_ENABLED, trafik
ışığı 🟢🟡🔴 + KOŞULLU HITL — verify sonrası, varsayılan AÇIK), crag (CRAG_ENABLED), self_rag
(SELF_RAG_ENABLED), verify (taslak kalite kapısı), clarifier dur-ve-sor (CLARIFY_STOP_ENABLED).
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

from langgraph.graph import END, START, StateGraph

from agents import llm_iz
from agents.config import (
    CLARIFY_STOP_ENABLED,
    CRAG_ENABLED,
    DECOMPOSE_ENABLED,
    HITL_ENABLED,
    NLI_ENABLED,
    PARALEL_ANLAMA,
    PARALEL_KAPANIS,
    PARALEL_TRIYAJ,
    RISK_GUARD_ENABLED,
    SELF_RAG_ENABLED,
)
from agents.katman import katmanlar as _katmanlar
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
from agents.nodes.servis_birim_oneri import servis_birim_oneri_node
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
    if HITL_ENABLED and not PARALEL_KAPANIS:
        nodes.append("onay_kapisi")  # KOŞULLU memur onayı (risk sarı/kırmızı → dur)
    # additive yenilikçilik node'ları: arsiv (SDP) → sla_triyaj (yasal süre) →
    # denetim_izi (hash-chain). … → arsiv → sla_triyaj → denetim_izi → finalize.
    nodes += ["arsiv", "sla_triyaj"]
    if HITL_ENABLED and PARALEL_KAPANIS:
        # Hız 15b: kapanış fan-out'unda onay kapısı sla SONRASINDA (arsiv ∥ risk dalları
        # sla_triyaj'da birleşir, KOŞULLU onay birleşimden sonra) — sıra etiketi de kayar.
        nodes.append("onay_kapisi")
    nodes += ["denetim_izi", "finalize"]
    return tuple(nodes)


# SSE/UI'da GÖSTERİLMEYEN yardımcı graf node'ları: adım listesi (PIPELINE_NODES) ve
# frontend akış şeridi değişmesin diye event'leri process_doc akışında süzülür; çıktıları
# (servis_birimi) final state ile taşınır. Yeni gizli yardımcı node buraya eklenir.
GIZLI_NODELAR: frozenset[str] = frozenset({"servis_birim"})


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


def pipeline_katmanlari(compiled: Any) -> dict[str, int]:
    """Derlenmiş graftan node → superstep (katman) haritası; SSE ile UI'a gider.

    Kaynak DERLENMİŞ GRAFIN KENDİ KENARLARIDIR — elle tutulan bir kopya değil. Bu yüzden
    ENV bayrakları (PARALEL_ANLAMA/PARALEL_TRIYAJ/PARALEL_KAPANIS/CRAG/NLI…) topolojiyi
    değiştirdiğinde harita kendiliğinden değişir; UI'ın "bu adımlar aynı anda koştu"
    iddiası çalışan grafla YAPISAL OLARAK çelişemez.

    Aynı katmandaki node'lar eşzamanlıdır. Katman, node'un koşabileceği EN ERKEN
    superstep'tir — düz PIPELINE_NODES listesinden farklı olarak graf bağımlılıklarına
    uyar (o liste `decompose`/`eksik_tespit` çiftinde sırayı ters verir). Harita STATİK
    graftan, istek işlenmeden önce üretilir: koşullu dallarda (`onay_kapisi`, `clarifier`)
    "her koşul ateşlenirse" varsayımıyla üst sınırdır — o node atlanan bir istekte kuyruk
    gerçekte bir adım kısadır. Sıralama ve eşzamanlılık iddiası bundan etkilenmez.
    """
    return _katmanlar([(e.source, e.target) for e in compiled.get_graph().edges])


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


def _zamanli_node(
    ad: str, node: Callable[..., Awaitable[dict[str, Any]]],
) -> Callable[..., Awaitable[dict[str, Any]]]:
    """Node çıktısına gerçek sunucu süresini + LLM çağrı izlerini additive olarak ekle.

    `llm_iz.node_kapsami` koşan node adını ContextVar'a koyar: merkezi LLM katmanı
    (`_llm_extract.llm_json/llm_text`) profil verilmemiş çağrının politikasını bu addan
    çözer ve her çağrının izini (kesik/kurtarıldı/yedeğe düştü/süre/token) toplar.
    """
    @wraps(node)
    async def _sarili(state: dict[str, Any], *args: Any, **kwargs: Any) -> dict[str, Any]:
        baslangic = time.perf_counter()
        with llm_iz.node_kapsami(ad) as izler:
            sonuc = await node(state, *args, **kwargs)
        sure_ms = max(0, round((time.perf_counter() - baslangic) * 1000))
        ek: dict[str, Any] = {"node_sureleri_ms": {ad: sure_ms}}
        if izler:
            ek["llm_izleri"] = list(izler)
        return {**(sonuc or {}), **ek}

    return _sarili


def build_graph(checkpointer: Any = None) -> Any:
    """Compiled LangGraph — `await graph.ainvoke(make_initial_state(text))` ile çağrılır.

    checkpointer: None (varsayılan) → baseline, kesintisiz compile (mevcut davranış birebir).
    HITL_ENABLED + checkpointer (InMemorySaver) verilirse onay_kapisi interrupt() ile durur
    ve `Command(resume=...)` ile sürer (memur onayı). HITL için API checkpointer geçer.
    """
    g = StateGraph(EvrakState)

    def ekle(ad: str, node: Callable[..., Awaitable[dict[str, Any]]]) -> None:
        g.add_node(ad, _zamanli_node(ad, node))

    ekle("siniflandir", siniflandir_node)
    ekle("cikar", cikar_node)
    ekle("kanit_baglama", kanit_baglama_node)
    ekle("eksik_tespit", eksik_tespit_node)
    ekle("mevzuat_oner", mevzuat_oner_node)
    ekle("ozetle", ozetle_node)
    ekle("route_birim", route_birim_node)
    ekle("yazi_taslak", yazi_taslak_node)
    ekle("verify", verify_node)
    ekle("arsiv", arsiv_node)
    ekle("sla_triyaj", sla_triyaj_node)
    ekle("denetim_izi", denetim_izi_node)
    ekle("finalize", finalize_node)

    # DİKKAT — LangGraph çok-ebeveyn birleşimi: kaynaklar AYRI add_edge çağrılarıyla
    # bağlanırsa hedef "hepsi bitince BİR KEZ" değil "HER kaynak bitişinde bir kez" koşar.
    # Dengesiz dal derinliklerinde bu ÇİFT KOŞUM demektir (2026-07-16 ölçüldü: CRAG açıkken
    # route_birim + tüm Görev-2 kuyruğu 2× koşuyordu → 2× LLM maliyeti/süresi). Fan-in
    # noktaları bu yüzden LİSTE formundadır: add_edge([kaynaklar], hedef) = bariyer.

    # Madde 14 — anlama fan-out (ENV-gated, varsayılan AÇIK): cikar yalnız evrak_text okur
    # (tür bağımlılığı yok) → siniflandir ∥ cikar paralel dallar. PARALEL_ANLAMA=0 → seri.
    g.add_edge(START, "siniflandir")
    if PARALEL_ANLAMA:
        g.add_edge(START, "cikar")
    else:
        g.add_edge("siniflandir", "cikar")

    if PARALEL_TRIYAJ:
        # Hız 15a — triyaj fan-out: kanit_baglama/decompose TÜR OKUMAZ (yalnız evrak_text +
        # bilgi_unsurlari) → siniflandir'ı beklemeden koşarlar (siniflandir en yavaş tekil
        # çağrı; decompose LLM'i onun gölgesinde biter). Tür okuyan danışma hedefleri
        # (eksik takip-sorusu + mevzuat + özet) siniflandir + gövde dalının BARİYERLİ
        # birleşiminden fan-out olur; fan-in route_birim.
        g.add_edge("cikar", "kanit_baglama")
        fanout_src = "kanit_baglama"
        if DECOMPOSE_ENABLED:
            ekle("decompose", decompose_node)
            g.add_edge("kanit_baglama", "decompose")
            fanout_src = "decompose"
        for hedef in ("eksik_tespit", "mevzuat_oner", "ozetle"):
            if PARALEL_ANLAMA:
                g.add_edge([fanout_src, "siniflandir"], hedef)
            else:  # siniflandir zaten zincirin başında (seri) → tek kaynak yeter
                g.add_edge(fanout_src, hedef)
        # Servis müdürlüğü önerisi YALNIZ evrak_text okur → en baştan ayrı danışma dalı
        # (route_birim'den taşındı; o node artık bilinen türde saf deterministik).
        ekle("servis_birim", servis_birim_oneri_node)
        g.add_edge(START, "servis_birim")
        route_kaynaklar = ["eksik_tespit", "ozetle", "servis_birim"]
    else:
        # Baseline birebir: kanit fan-in → eksik → [decompose] → mevzuat ∥ ozetle.
        if PARALEL_ANLAMA:
            g.add_edge(["siniflandir", "cikar"], "kanit_baglama")
        else:
            g.add_edge("cikar", "kanit_baglama")
        g.add_edge("kanit_baglama", "eksik_tespit")
        fanout_src = "eksik_tespit"
        if DECOMPOSE_ENABLED:
            ekle("decompose", decompose_node)
            g.add_edge("eksik_tespit", "decompose")
            fanout_src = "decompose"
        g.add_edge(fanout_src, "mevzuat_oner")
        g.add_edge(fanout_src, "ozetle")
        route_kaynaklar = ["ozetle"]

    # Mevzuat dalı kuyruğu: mevzuat_oner → [crag?] → [mevzuat_dogrula?] → route_birim.
    # İkisi de ENV-gated; kapalıyken node grafta YOK → baseline (mevzuat_oner→route_birim) korunur.
    mevzuat_tail = "mevzuat_oner"
    if CRAG_ENABLED:
        # CRAG öz-düzeltme (Yan et al. 2024): düşük-güvenli retrieval'ı sorgu-genişletmeyle düzeltir.
        ekle("crag", crag_node)
        g.add_edge(mevzuat_tail, "crag")
        mevzuat_tail = "crag"
    if NLI_ENABLED:
        # NLI atıf-gerekçelendirme: önerilen madde ⊨ evrak talebi entailment doğrulaması (additive).
        ekle("mevzuat_dogrula", mevzuat_dogrula_node)
        g.add_edge(mevzuat_tail, "mevzuat_dogrula")
        mevzuat_tail = "mevzuat_dogrula"
    route_kaynaklar.append(mevzuat_tail)
    # Fan-in BARİYERİ (çift-koşum fix'i): route_birim tüm kaynaklar bitince BİR KEZ koşar.
    g.add_edge(route_kaynaklar, "route_birim")

    if CLARIFY_STOP_ENABLED:
        # Dur-ve-sor dalı (ENV-gated): kritik eksikte taslak ÜRETMEDEN kullanıcıdan
        # bilgi iste. clarifier kendi dur-ve-sor mesajını yazar → doğrudan END
        # (finalize'ı atla ki mesaj korunsun; finalize scope dışı, ezmesin).
        ekle("clarifier", clarifier_node)
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
        ekle("risk_guard", risk_guard_node)
        g.add_edge(tail, "risk_guard")
        tail = "risk_guard"
    if SELF_RAG_ENABLED:
        # Self-RAG reflection (ENV-gated): çıktı tamlığını öz-değerlendirir (Asai et al. 2023).
        ekle("self_rag", self_rag_node)
        g.add_edge(tail, "self_rag")
        tail = "self_rag"

    if PARALEL_KAPANIS:
        # Hız 15b — kapanış fan-out: arsiv yazı/risk çıktısı OKUMAZ (tür + unsurlar +
        # hedef_birim + özet) → risk dalıyla PARALEL koşar, sla_triyaj bariyerinde birleşir.
        # KOŞULLU onay birleşimden SONRA: bant kararı yine verify sinyallerinden — arşiv/SLA
        # METADATA üretimi onay kararını etkilemez; denetim izi + bilgilendirme onaydan sonra.
        g.add_edge("verify", "arsiv")
        g.add_edge([tail, "arsiv"] if tail != "verify" else "arsiv", "sla_triyaj")
        if HITL_ENABLED:
            ekle("onay_kapisi", onay_kapisi_node)
            if RISK_GUARD_ENABLED:
                # _risk_route "arsiv" etiketi = "yeşil, otomatik geç" — burada geçiş denetim'e.
                g.add_conditional_edges("sla_triyaj", _risk_route,
                                        {"onay_kapisi": "onay_kapisi", "arsiv": "denetim_izi"})
            else:
                g.add_edge("sla_triyaj", "onay_kapisi")
            g.add_edge("onay_kapisi", "denetim_izi")
        else:
            g.add_edge("sla_triyaj", "denetim_izi")
    else:
        if HITL_ENABLED:
            # Memur onay kapısı (interrupt() — checkpointer ŞART → build_graph(checkpointer=...)).
            # RISK_GUARD ile KOŞULLU: yeşil → otomatik geç (arsiv); sarı/kırmızı → onay_kapisi →
            # arsiv. RISK_GUARD yoksa KOŞULSUZ (her taslak onaya). Kapalıyken node grafta YOK.
            ekle("onay_kapisi", onay_kapisi_node)
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


__all__ = (
    "GIZLI_NODELAR", "PIPELINE_NODES", "_zamanli_node", "build_graph", "pipeline_katmanlari",
)
