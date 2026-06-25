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
