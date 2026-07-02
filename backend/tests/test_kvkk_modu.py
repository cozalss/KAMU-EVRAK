"""KVKK / on-prem modu profil testleri (S6).

llm_profil() UI rozetinin tek kaynağıdır: kvkk-onprem (veri kurumdan çıkmaz) |
mock (deterministik) | bulut. Modül sabitleri monkeypatch ile senaryolanır
(import-anı ENV'ine bağımlı kalınmaz).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from agents import config

_BACKEND = str(Path(__file__).resolve().parents[1])


class TestLlmProfil:
    def test_kvkk_modu_profili_baskindir(self, monkeypatch):
        # Arrange — KVKK açıkken LLM_MODE ne olursa olsun profil kvkk-onprem
        monkeypatch.setattr(config, "KVKK_MODU", True)
        monkeypatch.setattr(config, "LLM_MODE", "openai")
        # Act / Assert
        assert config.llm_profil() == "kvkk-onprem"

    def test_mock_profili(self, monkeypatch):
        monkeypatch.setattr(config, "KVKK_MODU", False)
        monkeypatch.setattr(config, "LLM_MODE", "mock")
        assert config.llm_profil() == "mock"

    def test_bulut_profili(self, monkeypatch):
        monkeypatch.setattr(config, "KVKK_MODU", False)
        monkeypatch.setattr(config, "LLM_MODE", "openai")
        assert config.llm_profil() == "bulut"


class TestKvkkEnvDali:
    """Gerçek env-mutasyon dalı taze süreçte tetiklenir (import-anı davranışı;
    reload ana test sürecini kirletir → subprocess izolasyonu)."""

    def test_kvkk_modu_base_url_ve_modeli_zorlar(self):
        # Arrange — taze süreç: KVKK_MODU=1 + .env'deki bulut URL'sini temsilen sahte değer
        kod = (
            "import os;"
            "os.environ['KVKK_MODU']='1';"
            "os.environ['OPENAI_BASE_URL']='https://bulut.example/v1';"
            "import agents.config as c;"
            "print(os.environ['OPENAI_BASE_URL']);"
            "print(os.environ['OPENAI_LLM_MODEL'])"
        )
        env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
        # Act
        sonuc = subprocess.run([sys.executable, "-c", kod], capture_output=True,
                               text=True, cwd=_BACKEND, env=env, timeout=60)
        # Assert — bulut URL'si EZİLDİ (modun garantisi: dışarı istek çıkmaz)
        assert sonuc.returncode == 0, sonuc.stderr[-500:]
        satirlar = sonuc.stdout.strip().splitlines()
        assert "localhost:11434" in satirlar[-2]
        assert satirlar[-1].strip() != ""
