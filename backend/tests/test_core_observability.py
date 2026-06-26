"""Langfuse observability testleri — ENV yoksa no-op (app etkilenmez).

core/observability.py: LANGFUSE_PUBLIC/SECRET KEY yoksa tüm fonksiyonlar güvenli
no-op (decorator orijinal fonksiyonu döner, client None, flush/update sessiz). Bu
testler ENV-yok yolunu (CI varsayılanı) ve decorator no-op davranışını kilitler.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import core.observability as obs
from core.observability import (
    current_trace_id,
    flush_langfuse,
    get_langfuse_client,
    get_langfuse_handler,
    observe_ask_request,
    observe_node,
    update_current_trace,
)


class TestLangfuseDevreDisi:
    """LANGFUSE_ENABLED False (anahtar yok) → tüm yollar güvenli no-op."""

    def test_client_none_anahtar_yok(self, monkeypatch):
        # Arrange — anahtarsız (CI varsayılanı)
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)
        monkeypatch.setattr(obs, "_client", None, raising=False)
        # Act + Assert
        assert get_langfuse_client() is None

    def test_current_trace_id_none(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)
        monkeypatch.setattr(obs, "_client", None, raising=False)
        # Act + Assert
        assert current_trace_id() is None

    def test_update_current_trace_sessiz(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)
        monkeypatch.setattr(obs, "_client", None, raising=False)
        # Act — hata fırlatmamalı
        update_current_trace(user_id="u1", session_id="s1", metadata={"k": "v"})

    def test_flush_sessiz(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)
        monkeypatch.setattr(obs, "_client", None, raising=False)
        # Act — no-op
        flush_langfuse()

    def test_get_handler_none(self, monkeypatch):
        # Arrange — deprecated shim ENV yoksa None
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)
        # Act + Assert
        assert get_langfuse_handler() is None


class TestObserveDecoratorNoOp:
    """observe_node / observe_ask_request — ENV yoksa orijinal fonksiyonu döner."""

    def test_observe_node_orijinal_fonksiyon(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)

        async def _node(state):
            return {"ok": True}

        # Act — decorator no-op olmalı
        decorated = observe_node(as_type="span")(_node)
        # Assert — aynı fonksiyon objesi (sarılmadı)
        assert decorated is _node

    async def test_decorated_node_calisir(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)

        @observe_node(as_type="generation", name="test_node")
        async def _node(state):
            return {"value": state["x"] * 2}

        # Act
        out = await _node({"x": 21})
        # Assert — davranış korunur
        assert out == {"value": 42}

    def test_observe_ask_request_no_op(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", False)

        async def _ask(req):
            return "cevap"

        # Act
        decorated = observe_ask_request("ask")(_ask)
        # Assert
        assert decorated is _ask


class TestHasLangfuse:
    """_has_langfuse — import-test (cache'li; True/False döner)."""

    def test_bool_doner(self):
        # Act + Assert — langfuse kurulu olabilir/olmayabilir; bool kontratı
        assert isinstance(obs._has_langfuse(), bool)


class _FakeLangfuseClient:
    """Langfuse v4 client taklidi — enabled yollarını test etmek için."""

    def __init__(self):
        self.flushed = False
        self.updated = None

    def get_current_trace_id(self):
        return "trace-abc-123"

    def update_current_trace(self, **kwargs):
        self.updated = kwargs

    def flush(self):
        self.flushed = True


class TestLangfuseEtkinYollar:
    """Sahte client enjekte edilerek LANGFUSE_ENABLED True yolları (singleton patch)."""

    def test_current_trace_id_client_var(self, monkeypatch):
        # Arrange — singleton sahte client'a bağlı
        fake = _FakeLangfuseClient()
        monkeypatch.setattr(obs, "_client", fake, raising=False)
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", True)
        # Act — get_langfuse_client zaten _client döner (None değil)
        tid = current_trace_id()
        # Assert
        assert tid == "trace-abc-123"

    def test_update_current_trace_cagrilir(self, monkeypatch):
        # Arrange
        fake = _FakeLangfuseClient()
        monkeypatch.setattr(obs, "_client", fake, raising=False)
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", True)
        # Act
        update_current_trace(user_id="u1", session_id="s1", metadata={"k": "v"})
        # Assert — client'a iletildi
        assert fake.updated["user_id"] == "u1"

    def test_flush_client_cagrilir(self, monkeypatch):
        # Arrange
        fake = _FakeLangfuseClient()
        monkeypatch.setattr(obs, "_client", fake, raising=False)
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", True)
        # Act
        flush_langfuse()
        # Assert
        assert fake.flushed is True

    def test_get_handler_enabled_none_doner(self, monkeypatch):
        # Arrange — enabled shim trace güncelleyip None döner (v4 callback yok)
        fake = _FakeLangfuseClient()
        monkeypatch.setattr(obs, "_client", fake, raising=False)
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", True)
        # Act
        sonuc = get_langfuse_handler(user_id="u1", metadata={"x": 1})
        # Assert — v4'te callback handler yok → None; trace meta güncellendi
        assert sonuc is None
        assert fake.updated is not None

    def test_observe_node_decorate_basarisiz_no_op(self, monkeypatch):
        # Arrange — enabled ama _observe_fn patlarsa orijinal fonksiyon korunur
        monkeypatch.setattr(obs, "LANGFUSE_ENABLED", True)

        def _bozuk_observe(**kwargs):
            raise RuntimeError("observe kuramadı")

        monkeypatch.setattr(obs, "_observe_fn", _bozuk_observe, raising=False)

        async def _node(state):
            return {"ok": True}

        # Act — try/except sarmalı → orijinal fonksiyon döner (app kırılmaz)
        decorated = observe_node(as_type="span")(_node)
        # Assert
        assert decorated is _node
