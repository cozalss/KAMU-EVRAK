# syntax=docker/dockerfile:1.6
# =============================================================================
#  kamu-evrak — TEK SERVİS imajı (frontend + backend)
#
#  `backend/Dockerfile` ADALET-AGENT'tan miras kalmıştı ve kamu-evrak'ta
#  KULLANILMAYAN ağırlıklar taşıyordu: tesseract-ocr(+tur) — pytesseract burada
#  OPSİYONEL bir extra (`ocr-tesseract`), varsayılan kurulumda yok; ffmpeg — STT
#  bağımlılığı yok; HF_HOME/model volume — yerel ML modeli yok. Render ÜCRETSİZ
#  katmanında yalnız 512 MB RAM var, o yüzden bu imaj sıfırdan yalın kuruldu.
#
#  Build bağlamı DEPO KÖKÜDÜR (frontend + backend birlikte gerekiyor):
#      docker build -t kamu-evrak .
# =============================================================================

# --------------------------- 1) FRONTEND build ------------------------------
FROM node:20-slim AS frontend

WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
# VITE_DEMO_MODU build ANINDA gömülür (Vite `import.meta.env`) — çalışma anında
# değiştirilemez. KVKK onam kapısını ve kota sayacını açan bayrak budur.
ARG VITE_DEMO_MODU=1
ENV VITE_DEMO_MODU=$VITE_DEMO_MODU
RUN npm run build


# --------------------------- 2) PYTHON build --------------------------------
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

WORKDIR /app
# Bağımlılık katmanı önce — kaynak değişince yeniden çözülmesin (cache).
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
RUN uv sync --frozen --no-dev


# --------------------------- 3) RUNTIME -------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUTF8=1 \
    PYTHONIOENCODING=utf-8 \
    PATH="/app/.venv/bin:$PATH"

# Yalnız GERÇEKTEN gereken sistem kütüphaneleri:
#   libgomp1              — onnxruntime (OpenMP), RapidOCR'ın çekirdeği
#   libgl1 + libglib2.0-0 — opencv (rapidocr-onnxruntime bağımlılığı). Bunlar
#                           olmadan import ANINDA ImportError verir ve OCR yolu
#                           sessizce değil, GÜRÜLTÜLÜ biçimde çöker.
#   curl                  — HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

# Trivy fixable-HIGH: base imajın SİSTEM paketleme araçları yamalı olsun
# (uygulama /app/.venv'den koşar, orası zaten güncel).
RUN pip install --no-cache-dir --upgrade \
        "pip" "setuptools>=81.0.0" "wheel>=0.46.2" "jaraco.context>=6.1.0"

WORKDIR /app
COPY --from=builder --chown=app:app /app /app
# Frontend derlenmiş çıktısı — StaticFiles buradan sunar (bkz. main.py STATIK_KOK).
COPY --from=frontend --chown=app:app /fe/dist /app/frontend_dist

# data/ ÇALIŞMA ANINDA yazılır (harcama defteri). Ücretsiz katmanda kalıcı disk YOKTUR;
# dizin yine de var olmalı, yoksa ilk yazımda hata. Kalıcılık Supabase'e devredilir.
RUN mkdir -p /app/data && chown -R app:app /app/data

USER app

ENV STATIK_KOK=/app/frontend_dist \
    APP_ENV=production \
    LLM_MODE=mock \
    DEMO_DEFTER_YOLU=/app/data/demo_harcama.json

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent --output /dev/null http://127.0.0.1:8000/health || exit 1

# $PORT Render tarafından verilir; yerelde 8000'e düşer.
# TEK WORKER bilinçli: kota sözlüğü ve uçuştaki-harcama kümesi SÜREÇ-İÇİDİR,
# çok worker onları çarpar (boot banner'ı da bunu uyarır).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
