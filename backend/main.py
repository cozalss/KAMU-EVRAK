"""kamu-evrak FastAPI uygulaması — Kamu Evrak ve Yazışma için Akıllı Agent Destek Sistemi.

TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması — 1. Senaryo.
ADALET-AGENT main.py deseninden ADAPT (lifespan/health/CORS KEEP; ağır preload opsiyonel).

Çalıştır:  uv run uvicorn main:app --reload  (backend/ dizininde)
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.config import LLM_MODE
from api.middleware.ratelimit import setup_rate_limiting
from api.middleware.security_headers import SecurityHeadersMiddleware
from api.routes import kayitlar, mevzuat, multimodal, process_doc, sla, sohbet, yazi
from auth import auth_router

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # TODO(kamu-evrak): Gelecek faz — mevzuat-RAG embedder + reranker preload (ADALET
    # deseni); şu an retrieval lazy/stub, ağır model preload yok (hızlı boot tercih edildi).
    log.info("startup", llm_mode=LLM_MODE)
    try:
        yield
    finally:
        # LLM httpx bağlantılarını (openai/llamacpp_server) temiz kapat — aksi halde
        # SIGTERM'de bağlantı/thread sızar (ECC MEDIUM-4). MockLLM'de no-op.
        from agents.llm import aclose_llm

        await aclose_llm()
        log.info("shutdown")


app = FastAPI(
    title="kamu-evrak — Akıllı Agent Destek Sistemi",
    description="Kamu evrak ve yazışma süreçleri için çok-ajanlı yapay zeka (TEKNOFEST 2026, 1. Senaryo)",
    version="0.1.0",
    lifespan=lifespan,
)

# Güvenlik başlıkları — her yanıta nosniff/DENY/Referrer-Policy/CSP (clickjacking + MIME guard).
app.add_middleware(SecurityHeadersMiddleware)

# CORS — frontend dev sunucusu (Vite :5173) erişebilsin. Origin'ler ENV'den (prod'da
# gerçek alan adı). Metod/başlık wildcard yerine SPESİFİK → credentials'lı isteklerde
# saldırı yüzeyi daralır (API yalnız GET/POST + Content-Type/Authorization kullanır).
_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# IP-başı hız sınırı — slowapi varsa aktif, yoksa zarif şekilde atlanır (boot kırılmaz).
setup_rate_limiting(app)

app.include_router(process_doc.router)
app.include_router(multimodal.router)
app.include_router(yazi.router)
app.include_router(auth_router)
app.include_router(kayitlar.router)
app.include_router(mevzuat.router)
app.include_router(sohbet.router)
app.include_router(sla.router)


def _active_llm() -> str:
    """get_llm()'in GERÇEK client tipi → 'openai' | 'mock' | 'llamacpp' | 'llamacpp_server'.

    LLM_MODE=openai iken anahtar yoksa get_llm() sessizce MockLLM'e düşer; operatör bunu
    yalnız `llm_mode` (istenen) bakarak GÖREMEZ. Aktif client tipini ayrı raporlarız →
    sessiz-fallback şeffaf olur (ECC HIGH-2). get_llm() RAISE ETMEZ (mock demo bozulmaz).
    """
    try:
        from agents.llm import get_llm

        return {
            "OpenAIClient": "openai",
            "MockLLM": "mock",
            "LlamaCppClient": "llamacpp",
            "LlamaCppServerClient": "llamacpp_server",
        }.get(type(get_llm()).__name__, type(get_llm()).__name__.lower())
    except Exception as exc:
        log.warning("health_llm_probe_failed", error=type(exc).__name__)
        return "unknown"


@app.get("/health")
async def health() -> dict[str, Any]:
    """Sağlık kontrolü — istenen LLM modu + GERÇEK aktif client + pipeline node sayısı."""
    from agents.graph import PIPELINE_NODES
    return {
        "status": "ok",
        "llm_mode": LLM_MODE,          # istenen mod (ENV)
        "llm_active": _active_llm(),   # gerçek client (sessiz-fallback görünür)
        "pipeline_nodes": list(PIPELINE_NODES),
    }


@app.get("/")
async def root() -> dict[str, str]:
    return {"app": "kamu-evrak", "scenario": "TEKNOFEST 2026 — 1. Senaryo", "docs": "/docs"}
