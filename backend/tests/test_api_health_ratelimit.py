"""ECC denetimi düzeltmeleri — /health şeffaf LLM raporu + /process_doc hız sınırı.

HIGH-2 (sessiz mock-fallback görünürlüğü): /health hem `llm_mode` (istenen ENV) hem
`llm_active` (gerçek client tipi) döndürmeli → operatör openai-anahtarsız-fallback'i görür.
MEDIUM-3 (/process_doc rate-limit): düz POST /process_doc artık `request: Request` alır
ve `@rate_limit` dekoratörlüdür (/stream ile aynı desen) → TestClient ile çağrılabilmeli.

TestClient gerçek ASGI hattını koşar (slowapi varsa limiter aktif). LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# HIGH-2 — /health gerçek aktif client tipini de raporlar (sessiz-fallback görünür)
# ---------------------------------------------------------------------------


class TestHealthLlmActive:
    """`/health` yanıtı `llm_mode` (istenen) + `llm_active` (gerçek) anahtarlarını taşımalı."""

    def test_health_llm_active_alani_var(self, client: TestClient):
        # Act
        body = client.get("/health").json()
        # Assert — yeni şeffaflık alanı mevcut + mock (conftest LLM_MODE=mock)
        assert body["status"] == "ok"
        assert "llm_mode" in body
        assert body["llm_active"] == "mock"
        assert isinstance(body["pipeline_nodes"], list) and body["pipeline_nodes"]

    def test_active_llm_openai_client_eslesir(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — get_llm gerçek OpenAIClient döndürürse "openai" raporlanmalı
        from agents.llm import OpenAIClient

        monkeypatch.setattr(main, "get_llm", lambda: object.__new__(OpenAIClient), raising=False)
        # main._active_llm get_llm'i fonksiyon-içi import eder → modül attr'ını patch et
        monkeypatch.setattr("agents.llm.get_llm", lambda: object.__new__(OpenAIClient))
        # Act
        assert main._active_llm() == "openai"

    def test_active_llm_mock_fallback_gorunur(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — LLM_MODE=openai niyetiyle ama get_llm MockLLM'e düşmüş (anahtar yok)
        from agents.llm import MockLLM

        monkeypatch.setattr("agents.llm.get_llm", lambda: object.__new__(MockLLM))
        # Act — gerçek client mock → operatör sessiz-fallback'i görür
        assert main._active_llm() == "mock"

    def test_active_llm_probe_hata_unknown(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — get_llm patlasa bile health asla kırılmaz → "unknown"
        def _boom() -> object:
            raise RuntimeError("probe down")

        monkeypatch.setattr("agents.llm.get_llm", _boom)
        # Act
        assert main._active_llm() == "unknown"


# ---------------------------------------------------------------------------
# MEDIUM-3 — düz POST /process_doc rate-limit dekoratörlü + request param ile çalışır
# ---------------------------------------------------------------------------


class TestProcessDocRateLimit:
    """Düz POST /process_doc (`request: Request` + @rate_limit) TestClient ile çağrılabilmeli."""

    def test_process_doc_calisir(self, client: TestClient):
        # Arrange — basit dilekçe metni
        metin = (
            "Sayın yetkili, mahalle parkına aydınlatma talebimi arz ederim. "
            "Ahmet Yılmaz, Atatürk Cad. No:5, imza."
        )
        # Act
        resp = client.post("/process_doc", json={"evrak_text": metin})
        # Assert — sözleşme korunur (ProcessResponse), rate-limit param'ı 422 yaratmadı
        assert resp.status_code == 200
        body = resp.json()
        assert "evrak_turu" in body
        assert "mevzuat_onerileri" in body

    def test_process_doc_request_param_govde_kirletmez(self, client: TestClient):
        # Act — `request` ASGI-enjekte; istek gövdesinde beklenmemeli (422 olmamalı)
        resp = client.post("/process_doc", json={"evrak_text": "kısa metin"})
        # Assert
        assert resp.status_code == 200
