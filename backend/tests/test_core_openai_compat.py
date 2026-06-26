"""OpenAI-uyumlu ortak yardımcı testleri — anahtar okuma + base_url SSRF + retry/backoff.

core/openai_compat.py: anahtar trim, cloud_enabled, validated_base_url SSRF sertleştirme
(metadata/IMDS/link-local engelle), require_api_key, _retry_delay (Retry-After + cap),
send_with_retry (429/5xx retry, kalıcı 4xx hemen yükselt). httpx Response sahte mock'larla.
AAA deseni; mock offline (ağ yok).
"""

from __future__ import annotations

import httpx
import pytest

from core.openai_compat import (
    _RETRY_AFTER_CAP_S,
    _retry_delay,
    cloud_enabled,
    openai_api_key,
    require_api_key,
    send_with_retry,
    validated_base_url,
)


class TestOpenAIApiKey:
    """openai_api_key / cloud_enabled — env okuma + trim."""

    def test_anahtar_trimlenir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "  sk-test123  ")
        # Act + Assert
        assert openai_api_key() == "sk-test123"

    def test_anahtar_yoksa_bos(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        # Act + Assert
        assert openai_api_key() == ""

    def test_cloud_enabled_anahtar_varsa(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-x")
        # Act + Assert
        assert cloud_enabled() is True

    def test_cloud_disabled_anahtar_yoksa(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        # Act + Assert
        assert cloud_enabled() is False


class TestRequireApiKey:
    """require_api_key — yoksa açıklayıcı RuntimeError."""

    def test_anahtar_varsa_doner(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-abc")
        # Act + Assert
        assert require_api_key("llm") == "sk-abc"

    def test_anahtar_yoksa_runtime_error(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        # Act + Assert — bağlam mesajında geçer
        with pytest.raises(RuntimeError, match="stt"):
            require_api_key("stt")


class TestValidatedBaseUrl:
    """validated_base_url — şema/host SSRF sertleştirme."""

    def test_varsayilan_openai(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
        # Act
        url = validated_base_url()
        # Assert
        assert url == "https://api.openai.com/v1"

    def test_https_proxy_serbest(self, monkeypatch):
        # Arrange — meşru Azure/proxy override
        monkeypatch.setenv("OPENAI_BASE_URL", "https://my-proxy.example.com/v1/")
        # Act — sondaki / kırpılır
        url = validated_base_url()
        # Assert
        assert url == "https://my-proxy.example.com/v1"

    def test_loopback_serbest(self, monkeypatch):
        # Arrange — yerel LiteLLM/proxy meşru bırakılır
        monkeypatch.setenv("OPENAI_BASE_URL", "http://127.0.0.1:8000/v1")
        # Act + Assert — hata fırlatmaz
        assert validated_base_url() == "http://127.0.0.1:8000/v1"

    def test_dosya_semasi_reddedilir(self, monkeypatch):
        # Arrange — file:// SSRF/LFI vektörü
        monkeypatch.setenv("OPENAI_BASE_URL", "file:///etc/passwd")
        # Act + Assert
        with pytest.raises(ValueError, match="güvensiz"):
            validated_base_url()

    def test_gopher_semasi_reddedilir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_BASE_URL", "gopher://evil")
        # Act + Assert
        with pytest.raises(ValueError):
            validated_base_url()

    def test_gcp_metadata_host_engellenir(self, monkeypatch):
        # Arrange — IMDS kimlik-hırsızlığı hedefi
        monkeypatch.setenv("OPENAI_BASE_URL", "http://metadata.google.internal/v1")
        # Act + Assert
        with pytest.raises(ValueError, match="metadata"):
            validated_base_url()

    def test_link_local_ip_engellenir(self, monkeypatch):
        # Arrange — 169.254.x.x (AWS/GCP IMDS)
        monkeypatch.setenv("OPENAI_BASE_URL", "http://169.254.169.254/latest")
        # Act + Assert
        with pytest.raises(ValueError, match="link-local|IMDS"):
            validated_base_url()


class TestRetryDelay:
    """_retry_delay — exponential backoff + Retry-After saygısı + cap."""

    def test_exponential_backoff(self):
        # Arrange — response None → saf backoff
        # Act — base=1, attempt=0 → 1; attempt=2 → 4
        assert _retry_delay(1.0, 0, None) == 1.0
        assert _retry_delay(1.0, 2, None) == 4.0

    def test_retry_after_header_saygi(self):
        # Arrange — sunucu 10sn Retry-After verir (backoff'tan büyük)
        resp = httpx.Response(429, headers={"retry-after": "10"})
        # Act
        delay = _retry_delay(1.0, 0, resp)
        # Assert
        assert delay == 10.0

    def test_retry_after_cap_uygulanir(self):
        # Arrange — aşırı Retry-After (kötü-niyetli) cap'lenir
        resp = httpx.Response(429, headers={"retry-after": "9999"})
        # Act
        delay = _retry_delay(1.0, 0, resp)
        # Assert
        assert delay == _RETRY_AFTER_CAP_S

    def test_gecersiz_retry_after_backoff(self):
        # Arrange — parse edilemez header → backoff'a düş
        resp = httpx.Response(429, headers={"retry-after": "abc"})
        # Act
        delay = _retry_delay(2.0, 1, resp)
        # Assert — base*2^1 = 4
        assert delay == 4.0


class TestSendWithRetry:
    """send_with_retry — geçici hata retry, kalıcı 4xx hemen yükselt."""

    async def test_basarili_ilk_denemede(self):
        # Arrange — 200 OK (raise_for_status için request bağlı olmalı)
        req = httpx.Request("POST", "http://x")

        async def _post():
            return httpx.Response(200, json={"ok": True}, request=req)

        # Act
        resp = await send_with_retry(_post, attempts=3, base_delay=0.0)
        # Assert
        assert resp.status_code == 200

    async def test_kalici_401_hemen_yukselir(self):
        # Arrange — auth hatası retry edilmez
        cagrilar = {"n": 0}

        async def _post():
            cagrilar["n"] += 1
            return httpx.Response(401, request=httpx.Request("POST", "http://x"))

        # Act + Assert — tek deneme, hemen HTTPStatusError
        with pytest.raises(httpx.HTTPStatusError):
            await send_with_retry(_post, attempts=3, base_delay=0.0)
        assert cagrilar["n"] == 1

    async def test_gecici_500_retry_sonra_basari(self):
        # Arrange — ilk 500, sonra 200
        cagrilar = {"n": 0}

        req = httpx.Request("POST", "http://x")

        async def _post():
            cagrilar["n"] += 1
            if cagrilar["n"] == 1:
                return httpx.Response(503, request=req)
            return httpx.Response(200, json={"ok": True}, request=req)

        # Act
        resp = await send_with_retry(_post, attempts=3, base_delay=0.0)
        # Assert — 2. denemede başarı
        assert resp.status_code == 200
        assert cagrilar["n"] == 2

    async def test_tum_denemeler_500_yukselir(self):
        # Arrange — her zaman 502
        async def _post():
            return httpx.Response(502, request=httpx.Request("POST", "http://x"))

        # Act + Assert — denemeler tükenir → son exception
        with pytest.raises(httpx.HTTPStatusError):
            await send_with_retry(_post, attempts=2, base_delay=0.0)

    async def test_aglar_hatasi_retry(self):
        # Arrange — transport hatası geçici sayılır
        cagrilar = {"n": 0}

        req = httpx.Request("POST", "http://x")

        async def _post():
            cagrilar["n"] += 1
            if cagrilar["n"] == 1:
                raise httpx.ConnectError("ağ koptu")
            return httpx.Response(200, request=req)

        # Act
        resp = await send_with_retry(_post, attempts=3, base_delay=0.0)
        # Assert
        assert resp.status_code == 200
