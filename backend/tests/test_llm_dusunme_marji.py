"""Düşünme marjı — reasoning modellerinde cevabın BOŞ dönmemesi için tek-nokta guard.

deepseek-v4-* modelleri düşünme (reasoning) token'ı üretir ve bunlar `max_tokens`
bütçesinden düşer. Node'ların dar cevap bütçesi (140-400) tek başına gönderilince
bütçenin tamamı düşünmeye gidiyor, içerik boş dönüyor ve node sessizce deterministik
yedeğe düşüyordu. Marj `_chat_dene`'de EKLENİR; mock'ta eklenmez (test determinizmi).
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from agents import config
from agents.llm import ChatMessage, MockLLM
from agents.nodes._llm_extract import _chat_dene


class _SahteGercekLLM:
    """MockLLM DEĞİL → gerçek istemci muamelesi görür; gönderilen bütçeyi kaydeder."""

    def __init__(self) -> None:
        self.gonderilen_max_tokens: int | None = None

    async def chat(self, **kwargs: Any) -> Any:
        self.gonderilen_max_tokens = kwargs.get("max_tokens")
        return SimpleNamespace(content='{"hedef":"yazi_isleri_evrak"}')


def _mesajlar() -> list[ChatMessage]:
    return [ChatMessage(role="user", content="test")]


@pytest.mark.asyncio
async def test_gercek_istemciye_dusunme_marji_eklenir() -> None:
    llm = _SahteGercekLLM()

    await _chat_dene(llm, _mesajlar(), max_tokens=200, temperature=0.0,
                     timeout_s=10.0, json_mode=True)

    assert llm.gonderilen_max_tokens == 200 + config.LLM_DUSUNME_MARJI
    assert config.LLM_DUSUNME_MARJI > 0, "marj kapalıysa reasoning modelleri boş döner"


@pytest.mark.asyncio
async def test_mock_istemcide_butce_degismez() -> None:
    """CI/mock deterministik kalmalı — marj yalnız gerçek istemciye uygulanır."""
    kaydedilen: dict[str, Any] = {}
    mock = MockLLM()
    asil_chat = mock.chat

    async def _izle(**kwargs: Any) -> Any:
        kaydedilen.update(kwargs)
        return await asil_chat(**kwargs)

    mock.chat = _izle  # type: ignore[method-assign]

    await _chat_dene(mock, _mesajlar(), max_tokens=200, temperature=0.0,
                     timeout_s=10.0, json_mode=True)

    assert kaydedilen.get("max_tokens") == 200


@pytest.mark.asyncio
async def test_marj_kapatilabilir(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM_DUSUNME_MARJI=0 → eski davranış (reasoning olmayan modeller için kaçış)."""
    monkeypatch.setattr(config, "LLM_DUSUNME_MARJI", 0)
    llm = _SahteGercekLLM()

    await _chat_dene(llm, _mesajlar(), max_tokens=200, temperature=0.0,
                     timeout_s=10.0, json_mode=True)

    assert llm.gonderilen_max_tokens == 200


class _EskiImzaliLLM:
    """`dusunme_kapali` parametresini TANIMAYAN istemci (üçüncü taraf / eski sahte)."""

    def __init__(self) -> None:
        self.cagri = 0

    async def chat(self, *, messages, temperature, max_tokens, json_mode):
        self.cagri += 1
        return SimpleNamespace(content='{"ok": true}')


class _YeniImzaliLLM:
    """`dusunme_kapali`yi tanıyan istemci — ne geldiğini kaydeder."""

    def __init__(self) -> None:
        self.kwargs: dict[str, Any] = {}

    async def chat(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        return SimpleNamespace(content='{"ok": true}')


class TestDusunmeKapali:
    """`dusunme_kapali` (DeepSeek thinking:disabled) protokole SONRADAN eklendi.

    Sözleşme: parametre YALNIZ istendiğinde geçirilir ve tanımayan istemcide sessizce
    özelliksiz yola düşülür. Koşulsuz göndermek, `chat()` imzası sabit olan her sahte/
    üçüncü-taraf istemciyi TypeError ile kırıyordu (ölçüldü: 174 test kırmızıya döndü).
    """

    async def test_istenmeyince_parametre_HIC_gonderilmez(self):
        llm = _YeniImzaliLLM()
        await _chat_dene(llm, [ChatMessage(role="user", content="x")],
                         max_tokens=100, temperature=0.0, timeout_s=5.0, json_mode=True)
        assert "dusunme_kapali" not in llm.kwargs

    async def test_istenince_parametre_gonderilir(self):
        llm = _YeniImzaliLLM()
        await _chat_dene(llm, [ChatMessage(role="user", content="x")],
                         max_tokens=100, temperature=0.0, timeout_s=5.0, json_mode=True,
                         dusunme_kapali=True)
        assert llm.kwargs.get("dusunme_kapali") is True

    async def test_tanimayan_istemcide_ozelliksiz_yola_duser(self):
        llm = _EskiImzaliLLM()
        sonuc = await _chat_dene(llm, [ChatMessage(role="user", content="x")],
                                 max_tokens=100, temperature=0.0, timeout_s=5.0,
                                 json_mode=True, dusunme_kapali=True)
        # _chat_dene metin DEĞİL CagriSonucu döner (2026-08-07): çağıranın "cevap kesildi mi"
        # bilgisine ihtiyacı var. finish_reason taşımayan eski istemcide kesik=False sayılır.
        assert sonuc.metin == '{"ok": true}'   # çağrı DÜŞMEDİ
        assert sonuc.kesik is False
        # İlk deneme imza BAĞLANIRKEN TypeError verir (gövde hiç çalışmaz) → yalnız
        # özelliksiz çağrı gövdeye ulaşır; yani ağ tarafında çift istek DOĞMAZ.
        assert llm.cagri == 1
