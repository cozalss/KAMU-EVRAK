"""core/tts_openai.py testleri — bağımsız OPENAI_TTS_API_KEY (DeepSeek'in OPENAI_API_KEY'inden
AYRI, mock httpx, ağsız). Bkz. test_llm_client.py::_mock_async_client aynı desen.
"""

from __future__ import annotations

import httpx
import pytest

import core.tts_openai as tts_mod
from core.tts_openai import tts_api_key, tts_enabled, tts_openai


def _mock_async_client(monkeypatch, post_handler):
    """httpx.AsyncClient'i mock'la — gerçek ağ çağrısı YOK (post_handler döndürür)."""
    class _MockClient:
        def __init__(self, *a, **k):
            pass

        async def post(self, url, **kwargs):
            return post_handler(url, kwargs)

        async def aclose(self):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)


class TestTtsApiKeyBagimsizligi:
    """OPENAI_TTS_API_KEY, DeepSeek'in kullandığı OPENAI_API_KEY'den TAMAMEN bağımsız olmalı —
    aksi halde DeepSeek profilinde TTS sessizce api.deepseek.com'a gider (öyle bir uç yok)."""

    def test_tts_key_yoksa_devre_disi(self, monkeypatch):
        monkeypatch.delenv("OPENAI_TTS_API_KEY", raising=False)
        assert tts_enabled() is False
        assert tts_api_key() == ""

    def test_tts_key_varsa_etkin(self, monkeypatch):
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        assert tts_enabled() is True
        assert tts_api_key() == "sk-tts-test"

    def test_deepseek_anahtari_tts_icin_gecersiz(self, monkeypatch):
        # Arrange — yalnız DeepSeek'in OPENAI_API_KEY'i set, TTS anahtarı YOK
        monkeypatch.setenv("OPENAI_API_KEY", "sk-deepseek-anahtari")
        monkeypatch.setenv("OPENAI_BASE_URL", "https://api.deepseek.com")
        monkeypatch.delenv("OPENAI_TTS_API_KEY", raising=False)
        # Assert — TTS DeepSeek anahtarını ASLA ödünç almaz
        assert tts_enabled() is False

    def test_base_url_deepseek_ayarindan_bagimsiz(self, monkeypatch):
        # Arrange — OPENAI_BASE_URL DeepSeek'e işaret etse bile TTS her zaman gerçek OpenAI'a gider
        monkeypatch.setenv("OPENAI_BASE_URL", "https://api.deepseek.com")
        monkeypatch.delenv("OPENAI_TTS_BASE_URL", raising=False)
        # Act
        base = tts_mod._base_url()
        # Assert
        assert base == "https://api.openai.com/v1"


class TestTtsOpenaiCagri:
    async def test_anahtar_yoksa_runtime_error(self, monkeypatch):
        # Arrange
        monkeypatch.delenv("OPENAI_TTS_API_KEY", raising=False)
        # Act + Assert
        with pytest.raises(RuntimeError, match="OPENAI_TTS_API_KEY"):
            await tts_openai("merhaba", timeout_s=5.0)

    async def test_bos_metin_value_error(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        # Act + Assert
        with pytest.raises(ValueError):
            await tts_openai("   ", timeout_s=5.0)

    async def test_basarili_cagri_mp3_bytes_doner(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        req = httpx.Request("POST", "http://x")
        fake_audio = b"\xff\xfb\x90fake-mp3-bytes"
        _mock_async_client(monkeypatch, lambda u, k: httpx.Response(200, content=fake_audio, request=req))
        # Act
        audio = await tts_openai("Bilgilerinize sunulur.", timeout_s=5.0)
        # Assert
        assert audio == fake_audio

    async def test_dogru_url_ve_header_ve_govde(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_BASE_URL", "https://api.deepseek.com")  # DeepSeek profili aktifken bile
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        # Act
        await tts_openai("Merhaba dünya", timeout_s=5.0, voice="nova", model="tts-1-hd")
        # Assert
        assert captured["url"] == "https://api.openai.com/v1/audio/speech"
        assert captured["headers"]["Authorization"] == "Bearer sk-tts-test"
        assert captured["json"]["input"] == "Merhaba dünya"
        assert captured["json"]["voice"] == "nova"
        assert captured["json"]["model"] == "tts-1-hd"
        # Varsayılan format mp3 — ÖLÇÜLDÜ (aynı 3 Türkçe cümle, medyan):
        # wav 1819 ms/204 KB · mp3 1725 ms/56 KB · opus 1384 ms/30 KB.
        # opus en hızlı ama Ogg kabı Safari'de riskli; mp3 her tarayıcıda çalar.
        assert captured["json"]["response_format"] == "mp3"

    async def test_format_env_ile_degistirilebilir(self, monkeypatch):
        """Chrome/Edge demosunda opus'a geçilebilir (ölçülen en hızlı) — gövde ona göre gitmeli."""
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_FORMAT", "opus")
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        await tts_openai("Merhaba", timeout_s=5.0)
        assert captured["json"]["response_format"] == "opus"

    async def test_taninmayan_format_varsayilana_duser(self, monkeypatch):
        """Yanlış ENV değeri canlı API'den 400 almasın — güvenli varsayılana inilir."""
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_FORMAT", "midi")
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        await tts_openai("Merhaba", timeout_s=5.0)
        assert captured["json"]["response_format"] == "mp3"

    async def test_varsayilan_model_ve_ses(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.delenv("OPENAI_TTS_MODEL", raising=False)
        monkeypatch.delenv("OPENAI_TTS_VOICE", raising=False)
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert — steerable kuşak (tts-1 robotik duyuluyordu; marin en doğal ses ailesi)
        assert captured["json"]["model"] == "gpt-4o-mini-tts"
        assert captured["json"]["voice"] == "marin"

    async def test_uzun_metin_kirpilir(self, monkeypatch):
        # Arrange — 4000 karakter sınırını aşan metin sessizce değil GÖRÜNÜR kırpılır
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        uzun = "a" * 5000
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        # Act
        await tts_openai(uzun, timeout_s=5.0)
        # Assert
        assert len(captured["json"]["input"]) == 4000

class TestProzodiTalimati:
    """`instructions` = gpt-4o-mini-tts kuşağının prozodi direksiyonu. Türkçe doğallığı
    ROBOTİKLİKTEN çıkaran asıl kaldıraç; eski (tts-1) kuşağa gönderilmez — orada yok sayılır."""

    def _yakala(self, monkeypatch):
        captured = {}
        req = httpx.Request("POST", "http://x")

        def _handler(url, kwargs):
            captured["json"] = kwargs.get("json")
            return httpx.Response(200, content=b"audio", request=req)

        _mock_async_client(monkeypatch, _handler)
        return captured

    async def test_varsayilan_talimat_gonderilir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.delenv("OPENAI_TTS_MODEL", raising=False)
        monkeypatch.delenv("OPENAI_TTS_TALIMAT", raising=False)
        captured = self._yakala(monkeypatch)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert — Türkçe prozodi yönergesi payload'da
        assert "Türkçe" in captured["json"]["instructions"]

    async def test_talimat_env_ile_degistirilebilir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_TALIMAT", "Fısıltıyla konuş.")
        captured = self._yakala(monkeypatch)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert
        assert captured["json"]["instructions"] == "Fısıltıyla konuş."

    async def test_eski_kusak_modele_talimat_gonderilmez(self, monkeypatch):
        # Arrange — tts-1 `instructions`'ı yok sayar; payload'ı gereksiz şişirme
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_MODEL", "tts-1")
        monkeypatch.setenv("OPENAI_TTS_VOICE", "onyx")
        captured = self._yakala(monkeypatch)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert
        assert "instructions" not in captured["json"]

    async def test_eski_kusak_uyumsuz_sesi_guvenli_sese_duser(self, monkeypatch):
        # Arrange — tts-1 'marin'i TANIMAZ (HTTP 400). Varsayılan ses env'de model eskiye
        # çevrilince sessiz 400 yerine güvenli sese düşmeli (sesli mod hiç susmasın).
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_MODEL", "tts-1-hd")
        monkeypatch.setenv("OPENAI_TTS_VOICE", "marin")
        captured = self._yakala(monkeypatch)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert
        assert captured["json"]["voice"] == "ash"

    async def test_yeni_kusakta_ses_dokunulmadan_gecer(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-tts-test")
        monkeypatch.setenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
        monkeypatch.setenv("OPENAI_TTS_VOICE", "cedar")
        captured = self._yakala(monkeypatch)
        # Act
        await tts_openai("selam", timeout_s=5.0)
        # Assert
        assert captured["json"]["voice"] == "cedar"


class TestTtsHataYollari:
    async def test_401_kalici_hata_retry_yapmadan_yukselir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_TTS_API_KEY", "sk-yanlis")
        req = httpx.Request("POST", "http://x")
        _mock_async_client(monkeypatch, lambda u, k: httpx.Response(401, request=req))
        # Act + Assert
        with pytest.raises(httpx.HTTPStatusError):
            await tts_openai("merhaba", timeout_s=5.0)
