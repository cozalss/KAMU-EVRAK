"""pytest konfigürasyonu — PYTHONPATH + LLM_MODE=mock ortam ayarı.

Her test oturumunda:
  - backend dizini sys.path'e eklenir (mutlak yol).
  - LLM_MODE=mock set edilir → ağ/GPU bağımlılığı yok, anahtarsız CI çalışır.
  - agents.llm singleton sıfırlanır (test izolasyonu — paylaşılan global durum kaçmasın).
"""

from __future__ import annotations

import os
import sys

# Mutlak backend yolu — her çalıştırmada tutarlı.
_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# LLM ağ/GPU çağrısını engelle: tüm node'lar keyword/regex fallback'e düşer.
os.environ.setdefault("LLM_MODE", "mock")
# LLM node timeout'unu minimize et (CI hız).
os.environ.setdefault("EVRAK_LLM_TIMEOUT_S", "5.0")

# DB/auth katmanı (Faz 1-8) import anında env ister; CI'da .env YOK. Test-dummy değerler:
# auth.security JWT imzalar (saf sign/verify in-process), db.session engine'i LAZY kurar
# (saf-fonksiyon testleri DB'ye BAĞLANMAZ — yalnız import). Üretim fail-fast korunur.
# setdefault → .env varsa load_dotenv override etmez; gerçek anahtarlar testte kullanılmaz.
os.environ.setdefault("AUTH_JWT_SECRET", "test-only-jwt-secret-not-for-production-0123456789")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql+psycopg://test:test@localhost:5432/test")

import pytest  # noqa: E402 (sys.path düzeltmesinden sonra import zorunlu)


@pytest.fixture(autouse=True)
def _reset_llm_singleton():
    """Her testten önce LLM singleton sıfırla — testler birbirini kirletmesin."""
    try:
        from agents.llm import reset_llm
        reset_llm()
    except ImportError:
        pass
    yield
    try:
        from agents.llm import reset_llm
        reset_llm()
    except ImportError:
        pass
