"""LLM istemci güçlendirme — parse-retry (LLM_JSON_RETRY) + süreç-içi LRU yanıt cache'i.

Sözleşme (CLAUDE.md): LLM yok/mock/hata/bozuk-çıktı → deterministik fallback BİREBİR
korunur. Retry yalnız gerçek LLM'de TEK deneme; cache mock modda devre dışı.
Sahte LLM çağrı SAYACI ile ağ turu kanıtlanır (gerçek ağ YOK). AAA deseni.
"""

from __future__ import annotations

import httpx
import pytest

import agents.nodes._llm_extract as ext
from agents import config
from agents.llm import ChatMessage, LLMResponse, MockLLM
from agents.nodes._llm_extract import cache_temizle, llm_json, llm_text

GECERLI_JSON = '{"evrak_turu": "dilekce", "tur_confidence": 0.9}'
BOZUK_JSON = "bu geçerli json değil {{{"


class SayacLLM:
    """Sıralı sahte yanıt + çağrı sayacı — MockLLM DEĞİL (cache/retry yolu açık kalır)."""

    def __init__(self, *yanitlar: str) -> None:
        self._yanitlar = list(yanitlar)
        self.call_count = 0
        self.gecmis: list[list[ChatMessage]] = []

    async def chat(self, messages, *, temperature=0.1, max_tokens=1024,
                   json_mode=False, json_schema=None) -> LLMResponse:
        self.gecmis.append(list(messages))
        yanit = self._yanitlar[min(self.call_count, len(self._yanitlar) - 1)]
        self.call_count += 1
        return LLMResponse(content=yanit)


class IkinciCagriPatlarLLM(SayacLLM):
    """İlk çağrı normal döner, ikincisi ağ hatası fırlatır — retry hata dalı."""

    async def chat(self, messages, **kwargs) -> LLMResponse:
        if self.call_count >= 1:
            self.call_count += 1
            raise httpx.ConnectError("bağlantı koptu")
        return await super().chat(messages, **kwargs)


@pytest.fixture(autouse=True)
def _temiz_cache():
    """Testler arası cache sızıntısı olmasın (süreç-içi global durum)."""
    cache_temizle()
    yield
    cache_temizle()


def _kur(monkeypatch, llm, *, retry: bool = True, cache: bool = False,
         boyut: int | None = None) -> None:
    """Sahte LLM'i tak + config bayraklarını testten bağımsız sabitle."""
    monkeypatch.setattr(ext, "get_llm", lambda: llm)
    monkeypatch.setattr(config, "LLM_JSON_RETRY", retry)
    monkeypatch.setattr(config, "LLM_CACHE_ENABLED", cache)
    if boyut is not None:
        monkeypatch.setattr(config, "LLM_CACHE_BOYUT", boyut)


# ---------------------------------------------------------------------------
# llm_json — parse-retry (bozuk JSON'da geri-bildirimli TEK yeniden deneme)
# ---------------------------------------------------------------------------
class TestJsonRetry:
    async def test_bozuk_sonra_duzgun_json_retry_basarili(self, monkeypatch):
        # Arrange — ilk cevap bozuk, ikincisi geçerli
        llm = SayacLLM(BOZUK_JSON, GECERLI_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert — retry düzgün JSON'u kurtarır, tam 2 çağrı
        assert obj == {"evrak_turu": "dilekce", "tur_confidence": 0.9}
        assert llm.call_count == 2

    async def test_retry_mesajlari_onceki_cevap_ve_duzeltmeyi_icerir(self, monkeypatch):
        # Arrange
        llm = SayacLLM(BOZUK_JSON, GECERLI_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        await llm_json("sistem", "kullanıcı")
        # Assert — 2. çağrı: system+user + önceki ham cevap (assistant) + düzeltme (user)
        retry_msgs = llm.gecmis[1]
        assert len(retry_msgs) == 4
        assert retry_msgs[2].role == "assistant"
        assert retry_msgs[2].content == BOZUK_JSON
        assert retry_msgs[3].role == "user"
        assert "JSON" in retry_msgs[3].content

    async def test_retry_kapaliyken_tek_cagri_fallback(self, monkeypatch):
        # Arrange — LLM_JSON_RETRY=0 → mevcut davranış birebir (tek çağrı, None)
        llm = SayacLLM(BOZUK_JSON, GECERLI_JSON)
        _kur(monkeypatch, llm, retry=False)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert
        assert obj is None
        assert llm.call_count == 1

    async def test_retry_de_bozuk_verirse_fallback(self, monkeypatch):
        # Arrange — iki cevap da bozuk → None (çağıran deterministik fallback'e düşer)
        llm = SayacLLM(BOZUK_JSON, BOZUK_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert
        assert obj is None
        assert llm.call_count == 2

    async def test_retry_cagrisi_hata_verirse_fallback(self, monkeypatch):
        # Arrange — retry çağrısı ağ hatası fırlatır → hata YÜKSELMEZ, None döner
        llm = IkinciCagriPatlarLLM(BOZUK_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert
        assert obj is None
        assert llm.call_count == 2

    async def test_duzgun_json_retry_tetiklenmez(self, monkeypatch):
        # Arrange — ilk cevap zaten geçerli → tek çağrı
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert
        assert obj is not None
        assert llm.call_count == 1

    async def test_mock_modda_retry_yapilmaz(self, monkeypatch):
        # Arrange — MockLLM deterministik: retry aynı bozuk cevabı verir → israf;
        # mock yolu MEVCUT davranışta kalır (tek çağrı → None → fallback)
        llm = MockLLM(fixed_response=BOZUK_JSON)
        _kur(monkeypatch, llm, retry=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı")
        # Assert
        assert obj is None
        assert llm.call_count == 1


# ---------------------------------------------------------------------------
# llm_json — LRU yanıt cache'i (LLM_CACHE_ENABLED)
# ---------------------------------------------------------------------------
class TestJsonCache:
    async def test_cache_isabetinde_ikinci_cagri_ag_turu_odemez(self, monkeypatch):
        # Arrange
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act — aynı prompt iki kez
        ilk = await llm_json("sistem", "kullanıcı")
        ikinci = await llm_json("sistem", "kullanıcı")
        # Assert — sayaç artmaz, sonuç aynı
        assert llm.call_count == 1
        assert ilk == ikinci

    async def test_cache_kopya_doner_kirletme_olmaz(self, monkeypatch):
        # Arrange — çağıran dönen dict'i mutasyona uğratırsa cache bozulmamalı
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act
        ilk = await llm_json("sistem", "kullanıcı")
        ilk["evrak_turu"] = "KIRLETILDI"
        ikinci = await llm_json("sistem", "kullanıcı")
        # Assert
        assert ikinci["evrak_turu"] == "dilekce"

    async def test_farkli_prompt_farkli_anahtar(self, monkeypatch):
        # Arrange
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act — user metni farklı → cache miss
        await llm_json("sistem", "kullanıcı A")
        await llm_json("sistem", "kullanıcı B")
        # Assert
        assert llm.call_count == 2

    async def test_farkli_max_tokens_farkli_anahtar(self, monkeypatch):
        # Arrange — max_tokens anahtarın parçası (kesik cevap uzun isteğe dönmesin)
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act
        await llm_json("sistem", "kullanıcı", max_tokens=100)
        await llm_json("sistem", "kullanıcı", max_tokens=200)
        # Assert
        assert llm.call_count == 2

    async def test_cache_kapaliyken_her_cagri_ag_turu(self, monkeypatch):
        # Arrange — LLM_CACHE_ENABLED=0 → mevcut davranış birebir
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=False)
        # Act
        await llm_json("sistem", "kullanıcı")
        await llm_json("sistem", "kullanıcı")
        # Assert
        assert llm.call_count == 2

    async def test_lru_tahliye_kapasite_asiminda_en_eski_gider(self, monkeypatch):
        # Arrange — kapasite 2: A, B, C → A tahliye edilir
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True, boyut=2)
        # Act
        await llm_json("sistem", "A")
        await llm_json("sistem", "B")
        await llm_json("sistem", "C")
        await llm_json("sistem", "A")  # tahliye edildi → yeniden ağ turu
        # Assert
        assert llm.call_count == 4

    async def test_lru_isabet_girdiyi_tazeler(self, monkeypatch):
        # Arrange — kapasite 2: A, B, A(isabet→tazelenir), C → B tahliye, A kalır
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True, boyut=2)
        # Act
        await llm_json("sistem", "A")   # 1. çağrı
        await llm_json("sistem", "B")   # 2. çağrı
        await llm_json("sistem", "A")   # isabet (A en-yeni olur)
        await llm_json("sistem", "C")   # 3. çağrı (B tahliye)
        await llm_json("sistem", "A")   # isabet (A hâlâ cache'te)
        # Assert
        assert llm.call_count == 3

    async def test_cache_temizle_sonrasi_yeniden_ag_turu(self, monkeypatch):
        # Arrange
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act
        await llm_json("sistem", "kullanıcı")
        cache_temizle()
        await llm_json("sistem", "kullanıcı")
        # Assert — temizlik sonrası isabet yok
        assert llm.call_count == 2

    async def test_retry_ile_kurtarilan_sonuc_cachelenir(self, monkeypatch):
        # Arrange — bozuk→retry→düzgün; ikinci özdeş istek cache'ten gelir
        llm = SayacLLM(BOZUK_JSON, GECERLI_JSON)
        _kur(monkeypatch, llm, retry=True, cache=True)
        # Act
        await llm_json("sistem", "kullanıcı")
        await llm_json("sistem", "kullanıcı")
        # Assert — toplam 2 çağrı (retry dahil), cache isabeti ağ turu ödemez
        assert llm.call_count == 2

    async def test_bozuk_sonuc_cachelenmez(self, monkeypatch):
        # Arrange — None (parse-fail) cache'e yazılmaz; sonraki çağrı yeniden dener
        llm = SayacLLM(BOZUK_JSON)
        _kur(monkeypatch, llm, retry=False, cache=True)
        # Act
        assert await llm_json("sistem", "kullanıcı") is None
        assert await llm_json("sistem", "kullanıcı") is None
        # Assert
        assert llm.call_count == 2

    async def test_mock_modda_cache_devre_disi(self, monkeypatch):
        # Arrange — MockLLM zaten anlık; cache mock çağrı sayısını DEĞİŞTİRMEZ
        llm = MockLLM()
        _kur(monkeypatch, llm, cache=True)
        # Act — mock json_mode geçerli JSON döndürür (parse başarılı)
        ilk = await llm_json("sistem", "kullanıcı")
        await llm_json("sistem", "kullanıcı")
        # Assert
        assert ilk is not None
        assert llm.call_count == 2


# ---------------------------------------------------------------------------
# llm_text — cache kapsamı + mock davranışı
# ---------------------------------------------------------------------------
class TestTextCache:
    async def test_text_cache_isabet(self, monkeypatch):
        # Arrange
        llm = SayacLLM("serbest metin cevabı")
        _kur(monkeypatch, llm, cache=True)
        # Act
        ilk = await llm_text("sistem", "kullanıcı")
        ikinci = await llm_text("sistem", "kullanıcı")
        # Assert
        assert ilk == ikinci == "serbest metin cevabı"
        assert llm.call_count == 1

    async def test_text_ve_json_anahtarlari_karismaz(self, monkeypatch):
        # Arrange — aynı system/user/max_tokens: json sonucu text'e SIZMAMALI
        llm = SayacLLM(GECERLI_JSON)
        _kur(monkeypatch, llm, cache=True)
        # Act
        obj = await llm_json("sistem", "kullanıcı", max_tokens=300)
        txt = await llm_text("sistem", "kullanıcı", max_tokens=300)
        # Assert — iki ayrı ağ turu + tipler doğru
        assert isinstance(obj, dict)
        assert isinstance(txt, str)
        assert llm.call_count == 2

    async def test_text_mock_modda_none_kalir(self, monkeypatch):
        # Arrange — mevcut davranış: MockLLM'de llm_text HİÇ çağrılmaz → None
        llm = MockLLM(fixed_response="mock metin")
        _kur(monkeypatch, llm, cache=True)
        # Act + Assert
        assert await llm_text("sistem", "kullanıcı") is None
        assert llm.call_count == 0

    async def test_text_bos_cevap_cachelenmez(self, monkeypatch):
        # Arrange — boş cevap None döner ve cache'e yazılmaz
        llm = SayacLLM("   ")
        _kur(monkeypatch, llm, cache=True)
        # Act
        assert await llm_text("sistem", "kullanıcı") is None
        assert await llm_text("sistem", "kullanıcı") is None
        # Assert
        assert llm.call_count == 2
