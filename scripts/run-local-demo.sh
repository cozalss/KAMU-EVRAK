#!/usr/bin/env bash
# kamu-evrak — tek komutla yerel demo (iskelet).
# Kullanım:  bash scripts/run-local-demo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Backend bağımlılıkları (uv)"
cd "$ROOT/backend"
uv sync                     # çekirdek iskelet (hafif). Mevzuat RAG için: uv sync --extra rag

echo "==> Backend (FastAPI :8000)"
LLM_MODE="${LLM_MODE:-mock}" uv run uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "==> Frontend (Vite :5173)"
cd "$ROOT/frontend"
if command -v pnpm >/dev/null 2>&1; then pnpm install && pnpm dev
else npm install && npm run dev; fi

wait $BACKEND_PID
