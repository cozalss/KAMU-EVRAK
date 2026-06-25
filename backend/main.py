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
from api.routes import multimodal, process_doc, yazi

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    # TODO(kamu-evrak): üretimde mevzuat-RAG embedder + reranker preload (ADALET deseni).
    log.info("startup", llm_mode=LLM_MODE)
    yield
    log.info("shutdown")


app = FastAPI(
    title="kamu-evrak — Akıllı Agent Destek Sistemi",
    description="Kamu evrak ve yazışma süreçleri için çok-ajanlı yapay zeka (TEKNOFEST 2026, 1. Senaryo)",
    version="0.1.0",
    lifespan=lifespan,
)

# Güvenlik başlıkları — her yanıta nosniff/DENY/Referrer-Policy/CSP (clickjacking + MIME guard).
app.add_middleware(SecurityHeadersMiddleware)

# CORS — frontend dev sunucusu (Vite :5173) erişebilsin.
_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# IP-başı hız sınırı — slowapi varsa aktif, yoksa zarif şekilde atlanır (boot kırılmaz).
setup_rate_limiting(app)

app.include_router(process_doc.router)
app.include_router(multimodal.router)
app.include_router(yazi.router)


@app.get("/health")
async def health() -> dict[str, Any]:
    """Sağlık kontrolü — LLM modu + pipeline node sayısı."""
    from agents.graph import PIPELINE_NODES
    return {"status": "ok", "llm_mode": LLM_MODE, "pipeline_nodes": list(PIPELINE_NODES)}


@app.get("/")
async def root() -> dict[str, str]:
    return {"app": "kamu-evrak", "scenario": "TEKNOFEST 2026 — 1. Senaryo", "docs": "/docs"}
