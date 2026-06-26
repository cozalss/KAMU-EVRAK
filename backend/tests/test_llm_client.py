"""LLM istemci testleri — think-filtre + dispatch + OpenAI/llama-server (mock httpx, ağsız).

agents/llm.py: saf yardımcılar (_strip_think / _apply_no_think / _hold_partial /
_StreamThinkFilter), get_llm dispatch (mode→client), get_llm_for_model tiered routing,
reset_llm/aclose_llm, OpenAIClient._payload/_headers/chat/chat_stream + LlamaCppServerClient.chat
(httpx mock'lanır → gerçek ağ YOK), LlamaCppClient._fit_max_tokens.
AAA deseni; LLM_MODE=mock (conftest, fixture singleton sıfırlar).
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

import agents.llm as llm_mod
from agents.llm import (
    ChatMessage,
    LlamaCppClient,
    LlamaCppServerClient,
    LLMResponse,
    MockLLM,
    OpenAIClient,
    _apply_no_think,
    _hold_partial,
    _strip_think,
    _StreamThinkFilter,
    aclose_llm,
    get_llm,
    get_llm_for_model,
    reset_llm,
)


# ---------------------------------------------------------------------------
# Saf veri sınıfları
# ---------------------------------------------------------------------------
class TestDataClasses:
    def test_chat_message_to_dict(self):
        # Act + Assert
        assert ChatMessage("user", "selam").to_dict() == {"role": "user", "content": "selam"}

    def test_llm_response_varsayilanlar(self):
        # Arrange + Act
        r = LLMResponse(content="x")
        # Assert
        assert r.finish_reason == "stop"
        assert r.tokens_in == 0


# ---------------------------------------------------------------------------
# _strip_think — <think>...</think> temizleme
# ---------------------------------------------------------------------------
class TestStripThink:
    def test_kapali_blok_kesilir(self):
        # Act + Assert
        assert _strip_think("<think>muhakeme</think>cevap") == "cevap"

    def test_kapanissiz_think_sonrasi_atilir(self):
        # Arrange — kapanışsız <think> → o noktadan sonrası gider
        assert _strip_think("cevap <think>yarım muhakeme") == "cevap"

    def test_think_yoksa_aynen(self):
        # Act + Assert
        assert _strip_think("düz cevap") == "düz cevap"

    def test_buyuk_harf_duyarsiz(self):
        # Act + Assert
        assert _strip_think("<THINK>x</THINK>y") == "y"

    def test_bos_metin(self):
        # Act + Assert
        assert _strip_think("") == ""


# ---------------------------------------------------------------------------
# _apply_no_think — Qwen3 thinking kapatma (ENV-gated)
# ---------------------------------------------------------------------------
class TestApplyNoThink:
    def test_no_think_kapali_degismez(self, monkeypatch):
        # Arrange — _NO_THINK False (varsayılan)
        monkeypatch.setattr(llm_mod, "_NO_THINK", False)
        msgs = [ChatMessage("system", "sistem"), ChatMessage("user", "soru")]
        # Act
        out = _apply_no_think(msgs)
        # Assert — aynı liste
        assert out is msgs

    def test_no_think_acik_system_eke(self, monkeypatch):
        # Arrange — _NO_THINK True + system mesajı var
        monkeypatch.setattr(llm_mod, "_NO_THINK", True)
        msgs = [ChatMessage("system", "sistem"), ChatMessage("user", "soru")]
        # Act
        out = _apply_no_think(msgs)
        # Assert — system mesajına /no_think eklenir
        assert out[0].content.endswith("/no_think")

    def test_no_think_acik_system_yoksa_eklenir(self, monkeypatch):
        # Arrange — system mesajı yok → başa eklenir
        monkeypatch.setattr(llm_mod, "_NO_THINK", True)
        msgs = [ChatMessage("user", "soru")]
        # Act
        out = _apply_no_think(msgs)
        # Assert
        assert out[0].role == "system"
        assert "/no_think" in out[0].content


# ---------------------------------------------------------------------------
# _hold_partial — etiket token-sınırı koruması
# ---------------------------------------------------------------------------
class TestHoldPartial:
    def test_kismi_etiket_tutulur(self):
        # Arrange — '<thi' = '<think>' başlangıcı olabilir
        safe, tail = _hold_partial("abc<thi", "<think>")
        # Assert
        assert safe == "abc"
        assert tail == "<thi"

    def test_kismi_yoksa_tum_safe(self):
        # Act
        safe, tail = _hold_partial("temiz metin", "<think>")
        # Assert
        assert safe == "temiz metin"
        assert tail == ""


# ---------------------------------------------------------------------------
# _StreamThinkFilter — akan token'larda <think> sızdırmama
# ---------------------------------------------------------------------------
class TestStreamThinkFilter:
    def test_think_dishi_emit_edilir(self):
        # Arrange
        emitted: list[str] = []
        f = _StreamThinkFilter(emitted.append)
        # Act — think bloğu içeren akış
        f.feed("merhaba ")
        f.feed("<think>gizli</think>")
        f.feed("dünya")
        f.flush()
        # Assert — yalnız think-dışı içerik
        out = "".join(emitted)
        assert "merhaba" in out
        assert "dünya" in out
        assert "gizli" not in out

    def test_parcali_etiket_korunur(self):
        # Arrange — etiket token sınırına bölünmüş
        emitted: list[str] = []
        f = _StreamThinkFilter(emitted.append)
        # Act
        f.feed("a<thi")
        f.feed("nk>gizli</think>b")
        f.flush()
        # Assert
        out = "".join(emitted)
        assert "gizli" not in out
        assert "a" in out and "b" in out

    def test_flush_think_icinde_bos(self):
        # Arrange — kapanışsız think → flush hiçbir şey emit etmez
        emitted: list[str] = []
        f = _StreamThinkFilter(emitted.append)
        f.feed("<think>açık kaldı")
        f.flush()
        # Assert
        assert "".join(emitted) == ""


# ---------------------------------------------------------------------------
# get_llm — mode dispatch
# ---------------------------------------------------------------------------
class TestGetLlmDispatch:
    def test_mock_mode(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("LLM_MODE", "mock")
        reset_llm()
        # Act
        llm = get_llm()
        # Assert
        assert isinstance(llm, MockLLM)

    def test_singleton_tekrar_ayni(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("LLM_MODE", "mock")
        reset_llm()
        # Act
        assert get_llm() is get_llm()

    def test_openai_anahtarsiz_mock_fallback(self, monkeypatch):
        # Arrange — openai niyeti ama anahtar yok → mock'a düş
        monkeypatch.setenv("LLM_MODE", "openai")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        reset_llm()
        # Act
        llm = get_llm()
        # Assert
        assert isinstance(llm, MockLLM)

    def test_openai_anahtarli_client(self, monkeypatch):
        # Arrange — openai + anahtar → OpenAIClient
        monkeypatch.setenv("LLM_MODE", "openai")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        reset_llm()
        # Act
        llm = get_llm()
        # Assert
        assert isinstance(llm, OpenAIClient)

    def test_llamacpp_server_mode(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("LLM_MODE", "llamacpp_server")
        reset_llm()
        # Act
        llm = get_llm()
        # Assert
        assert isinstance(llm, LlamaCppServerClient)

    def test_llamacpp_yol_yok_runtime_error(self, monkeypatch):
        # Arrange — llamacpp ama LLM_MODEL_PATH yok
        monkeypatch.setenv("LLM_MODE", "llamacpp")
        monkeypatch.delenv("LLM_MODEL_PATH", raising=False)
        reset_llm()
        # Act + Assert
        with pytest.raises(RuntimeError, match="LLM_MODEL_PATH"):
            get_llm()

    def test_bilinmeyen_mode_mock(self, monkeypatch):
        # Arrange — tanımsız mod → mock
        monkeypatch.setenv("LLM_MODE", "rastgele")
        reset_llm()
        # Act + Assert
        assert isinstance(get_llm(), MockLLM)


# ---------------------------------------------------------------------------
# get_llm_for_model — tiered routing
# ---------------------------------------------------------------------------
class TestGetLlmForModel:
    def test_model_none_base_doner(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("LLM_MODE", "mock")
        reset_llm()
        base = get_llm()
        # Act + Assert — model yok → base singleton
        assert get_llm_for_model(None) is base

    def test_openai_disi_base_doner(self, monkeypatch):
        # Arrange — mock modunda model verilse de base döner
        monkeypatch.setenv("LLM_MODE", "mock")
        reset_llm()
        base = get_llm()
        # Act + Assert
        assert get_llm_for_model("gpt-4o") is base

    def test_openai_farkli_model_ayri_client(self, monkeypatch):
        # Arrange — openai + farklı model → yeni cache'li client
        monkeypatch.setenv("LLM_MODE", "openai")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
        reset_llm()
        base = get_llm()
        # Act
        c1 = get_llm_for_model("gpt-4o")
        c2 = get_llm_for_model("gpt-4o")
        # Assert — base'den farklı + cache (aynı obje)
        assert c1 is not base
        assert c1 is c2
        assert c1.model == "gpt-4o"

    def test_openai_ayni_model_base(self, monkeypatch):
        # Arrange — base modeliyle aynı → base
        monkeypatch.setenv("LLM_MODE", "openai")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
        reset_llm()
        base = get_llm()
        # Act + Assert
        assert get_llm_for_model("gpt-4o-mini") is base


class TestAcloseLlm:
    async def test_mock_no_op(self, monkeypatch):
        # Arrange — MockLLM aclose yok → no-op (hata fırlatmamalı)
        monkeypatch.setenv("LLM_MODE", "mock")
        reset_llm()
        get_llm()
        # Act
        await aclose_llm()

    async def test_singleton_yoksa_guvenli(self):
        # Arrange — singleton temiz
        reset_llm()
        # Act — hiçbir şey yapmamalı
        await aclose_llm()


# ---------------------------------------------------------------------------
# OpenAIClient — _payload / _headers / chat / chat_stream (mock httpx)
# ---------------------------------------------------------------------------
class TestOpenAIClientPayload:
    def test_gpt4o_klasik_parametreler(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        p = c._payload([ChatMessage("user", "x")], 0.3, 100,
                       json_mode=False, json_schema=None, stream=False)
        # Assert — temperature + max_tokens (klasik)
        assert p["temperature"] == 0.3
        assert p["max_tokens"] == 100
        assert "max_completion_tokens" not in p

    def test_o_serisi_max_completion_tokens(self, monkeypatch):
        # Arrange — o1/gpt-5 yeni param + temp gönderilmez
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        c = OpenAIClient(model="o1-preview")
        # Act
        p = c._payload([ChatMessage("user", "x")], 0.3, 100,
                       json_mode=False, json_schema=None, stream=False)
        # Assert
        assert p["max_completion_tokens"] == 100
        assert "temperature" not in p

    def test_json_mode_response_format(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        p = c._payload([ChatMessage("user", "x")], 0.1, 50,
                       json_mode=True, json_schema=None, stream=False)
        # Assert
        assert p["response_format"] == {"type": "json_object"}

    def test_stream_include_usage(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        p = c._payload([ChatMessage("user", "x")], 0.1, 50,
                       json_mode=False, json_schema=None, stream=True)
        # Assert
        assert p["stream_options"] == {"include_usage": True}

    def test_headers_anahtar_call_time(self, monkeypatch):
        # Arrange — anahtar call-time okunur
        monkeypatch.setenv("OPENAI_API_KEY", "sk-runtime")
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        h = c._headers()
        # Assert
        assert h["Authorization"] == "Bearer sk-runtime"
        assert h["Content-Type"] == "application/json"

    def test_varsayilan_model(self, monkeypatch):
        # Arrange — model verilmezse env veya gpt-4o-mini
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.delenv("OPENAI_LLM_MODEL", raising=False)
        c = OpenAIClient()
        # Assert
        assert c.model == "gpt-4o-mini"


def _mock_async_client(monkeypatch, post_handler):
    """httpx.AsyncClient'i mock'la — gerçek ağ çağrısı YOK (post_handler döndürür)."""
    class _MockClient:
        def __init__(self, *a, **k):
            pass

        async def post(self, url, **kwargs):
            return post_handler(url, kwargs)

        async def aclose(self):
            pass

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)


class TestOpenAIClientChat:
    async def test_basarili_chat(self, monkeypatch):
        # Arrange — OpenAI 200 yanıtı mock
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        body = {"choices": [{"message": {"content": "merhaba"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 3}}
        req = httpx.Request("POST", "http://x")
        _mock_async_client(monkeypatch, lambda u, k: httpx.Response(200, json=body, request=req))
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        resp = await c.chat([ChatMessage("user", "selam")])
        # Assert
        assert resp.content == "merhaba"
        assert resp.tokens_in == 5

    async def test_bos_choices_value_error(self, monkeypatch):
        # Arrange — choices boş
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        req = httpx.Request("POST", "http://x")
        _mock_async_client(monkeypatch,
                           lambda u, k: httpx.Response(200, json={"choices": []}, request=req))
        c = OpenAIClient(model="gpt-4o-mini")
        # Act + Assert
        with pytest.raises(ValueError, match="choices"):
            await c.chat([ChatMessage("user", "x")])

    async def test_kalici_401_yukselir(self, monkeypatch):
        # Arrange — auth hatası retry edilmez
        monkeypatch.setenv("OPENAI_API_KEY", "sk-bad")
        req = httpx.Request("POST", "http://x")
        _mock_async_client(monkeypatch, lambda u, k: httpx.Response(401, request=req))
        c = OpenAIClient(model="gpt-4o-mini")
        # Act + Assert
        with pytest.raises(httpx.HTTPStatusError):
            await c.chat([ChatMessage("user", "x")])

    async def test_think_blok_temizlenir(self, monkeypatch):
        # Arrange — yanıt <think> içerir → _strip_think uygulanır
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        body = {"choices": [{"message": {"content": "<think>iç</think>dış"},
                             "finish_reason": "stop"}], "usage": {}}
        req = httpx.Request("POST", "http://x")
        _mock_async_client(monkeypatch, lambda u, k: httpx.Response(200, json=body, request=req))
        c = OpenAIClient(model="gpt-4o-mini")
        # Act
        resp = await c.chat([ChatMessage("user", "x")])
        # Assert
        assert resp.content == "dış"

    async def test_aclose_client_kapatir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        c = OpenAIClient(model="gpt-4o-mini")
        c._ensure_client()
        # Act — kapatma sonrası _client None
        await c.aclose()
        # Assert
        assert c._client is None


# ---------------------------------------------------------------------------
# LlamaCppServerClient.chat — mock httpx (ağsız)
# ---------------------------------------------------------------------------
def _mock_stream_client(monkeypatch, lines, status=200):
    """httpx.AsyncClient.stream'i mock'la — SSE satırlarını aiter_lines ile akıt (ağsız)."""
    class _StreamCtx:
        def __init__(self):
            self._status = status

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def raise_for_status(self):
            if self._status >= 400:
                raise httpx.HTTPStatusError(
                    "err", request=httpx.Request("POST", "http://x"),
                    response=httpx.Response(self._status, request=httpx.Request("POST", "http://x")))

        async def aiter_lines(self):
            for ln in lines:
                yield ln

    class _MockClient:
        def __init__(self, *a, **k):
            pass

        def stream(self, *a, **k):
            return _StreamCtx()

        async def aclose(self):
            pass

    monkeypatch.setattr(httpx, "AsyncClient", _MockClient)


class TestOpenAIChatStream:
    """OpenAIClient.chat_stream — SSE delta akışı + usage + boyut sınırı (mock)."""

    async def test_token_akisi_ve_birikim(self, monkeypatch):
        # Arrange — iki delta + usage-only son chunk
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        lines = [
            'data: {"choices":[{"delta":{"content":"mer"}}]}',
            'data: {"choices":[{"delta":{"content":"haba"}}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}',
            "data: [DONE]",
        ]
        _mock_stream_client(monkeypatch, lines)
        c = OpenAIClient(model="gpt-4o-mini")
        toplanan: list[str] = []
        # Act
        resp = await c.chat_stream([ChatMessage("user", "selam")], on_token=toplanan.append)
        # Assert — delta'lar emit edildi + tam içerik + usage
        assert "".join(toplanan) == "merhaba"
        assert resp.content == "merhaba"
        assert resp.tokens_out == 2

    async def test_bozuk_json_chunk_atlanir(self, monkeypatch):
        # Arrange — geçersiz JSON satırı sessizce atlanır
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        lines = [
            "data: bozuk-json",
            'data: {"choices":[{"delta":{"content":"ok"}}]}',
            "data: [DONE]",
        ]
        _mock_stream_client(monkeypatch, lines)
        c = OpenAIClient(model="gpt-4o-mini")
        toplanan: list[str] = []
        # Act
        resp = await c.chat_stream([ChatMessage("user", "x")], on_token=toplanan.append)
        # Assert — yalnız geçerli delta
        assert resp.content == "ok"

    async def test_data_disi_satir_atlanir(self, monkeypatch):
        # Arrange — 'data:' ile başlamayan satırlar yok sayılır
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        lines = [
            ": yorum satırı",
            "event: ping",
            'data: {"choices":[{"delta":{"content":"x"}}]}',
        ]
        _mock_stream_client(monkeypatch, lines)
        c = OpenAIClient(model="gpt-4o-mini")
        toplanan: list[str] = []
        # Act
        resp = await c.chat_stream([ChatMessage("user", "y")], on_token=toplanan.append)
        # Assert
        assert resp.content == "x"


class TestLlamaCppServerClient:
    async def test_basarili_chat(self, monkeypatch):
        # Arrange — llama-server 200 yanıtı
        body = {"choices": [{"message": {"content": "yanıt"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 2, "completion_tokens": 1}}

        class _MockClient:
            def __init__(self, *a, **k):
                pass

            async def post(self, url, **kwargs):
                req = httpx.Request("POST", url)
                return httpx.Response(200, json=body, request=req)

            async def aclose(self):
                pass

        monkeypatch.setattr(httpx, "AsyncClient", _MockClient)
        c = LlamaCppServerClient(base_url="http://127.0.0.1:8080")
        # Act
        resp = await c.chat([ChatMessage("user", "soru")])
        # Assert
        assert resp.content == "yanıt"
        assert resp.tokens_out == 1

    async def test_json_mode_payload(self, monkeypatch):
        # Arrange — json_mode response_format kontrolü (yakalanan payload)
        yakalanan: dict[str, Any] = {}

        class _MockClient:
            def __init__(self, *a, **k):
                pass

            async def post(self, url, **kwargs):
                yakalanan.update(kwargs.get("json", {}))
                req = httpx.Request("POST", url)
                return httpx.Response(200, json={
                    "choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}],
                    "usage": {}}, request=req)

            async def aclose(self):
                pass

        monkeypatch.setattr(httpx, "AsyncClient", _MockClient)
        c = LlamaCppServerClient()
        # Act
        await c.chat([ChatMessage("user", "x")], json_mode=True)
        # Assert
        assert yakalanan["response_format"] == {"type": "json_object"}

    async def test_aclose_guvenli(self):
        # Arrange — client kurulmamış → aclose no-op
        c = LlamaCppServerClient()
        # Act
        await c.aclose()
        # Assert
        assert c._client is None


# ---------------------------------------------------------------------------
# LlamaCppClient._fit_max_tokens — ctx-taşma clamp (model mock'lu)
# ---------------------------------------------------------------------------
class TestFitMaxTokens:
    def test_kisa_prompt_clamp_yok(self):
        # Arrange — sahte model: her mesaj 10 token
        c = LlamaCppClient(model_path="dummy", n_ctx=8192)

        class _M:
            def tokenize(self, b, **k):
                return [0] * 10

        c._model = _M()
        # Act — kısa prompt → istenen değer korunur
        out = c._fit_max_tokens([ChatMessage("user", "kısa")], 1024)
        # Assert
        assert out == 1024

    def test_uzun_prompt_clamp_taban(self):
        # Arrange — küçük n_ctx → clamp tabana iner
        c = LlamaCppClient(model_path="dummy", n_ctx=300)

        class _M:
            def tokenize(self, b, **k):
                return [0] * 200

        c._model = _M()
        # Act
        out = c._fit_max_tokens([ChatMessage("user", "uzun")], 1024)
        # Assert — _MIN_OUTPUT_TOKENS tabanı (256)
        assert out == 256

    def test_tokenizer_hata_tahmine_duser(self):
        # Arrange — tokenize patlar → char-tabanlı muhafazakar tahmin
        c = LlamaCppClient(model_path="dummy", n_ctx=8192)

        class _M:
            def tokenize(self, b, **k):
                raise RuntimeError("tokenizer yok")

        c._model = _M()
        # Act — hata fırlatmamalı, makul değer dönmeli
        out = c._fit_max_tokens([ChatMessage("user", "metin")], 512)
        # Assert
        assert isinstance(out, int)
        assert out > 0


class TestMockLlmChat:
    """MockLLM.chat — fixed_response + json_mode + düz metin yolları."""

    async def test_fixed_response(self):
        # Arrange
        m = MockLLM(fixed_response="SABİT")
        # Act
        resp = await m.chat([ChatMessage("user", "x")])
        # Assert
        assert resp.content == "SABİT"
        assert m.call_count == 1

    async def test_duz_metin_mock(self):
        # Arrange
        m = MockLLM()
        # Act — json_mode kapalı → MOCK metin
        resp = await m.chat([ChatMessage("user", "soru")])
        # Assert
        assert "[MOCK]" in resp.content

    async def test_json_mode_domain(self):
        # Arrange — kira keyword → domain dispatch
        m = MockLLM()
        # Act
        resp = await m.chat([ChatMessage("user", "kira sözleşmesi depozito")], json_mode=True)
        # Assert
        obj = json.loads(resp.content)
        assert obj["domain"] == "kira"
