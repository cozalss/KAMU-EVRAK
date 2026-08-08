"""Kademeli model (eskalasyon) testleri — düşük güvenli sınıflandırmada ikinci görüş.

Sözleşme (config.SINIFLANDIR_ESKALASYON): LLM sınıflandırması conf < abstention eşiği
VEYA 'belirsiz' dönerse get_llm_for_model(ESKALASYON_MODEL) ile İKİNCİ görüş alınır.
Reasoner geçerli tür + eşik üstü güven verirse o kazanır; aksi halde mevcut sonuç/
abstention BİREBİR korunur. Bayrak kapalı / mock mod / N>1 (self-consistency) yolunda
eskalasyon HİÇ çağrılmaz. Tüm testler deterministik (ağ yok; sahte reasoner monkeypatch).
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import agents.nodes.siniflandir as S

# Birincil LLM'in "emin değilim" çıktısı — _from_llm eşik-altını 'belirsiz'e çevirir.
_DUSUK_GUVEN = {"evrak_turu": "dilekce", "tur_confidence": 0.2,
                "tur_reasoning": "emin değilim"}
_STATE = {"evrak_text": "İçeriği kapalı örnek evrak metni — sentetik test verisi."}


class SahteReasoner:
    """get_llm_for_model'in döndürdüğü sahte istemci — çağrıları kaydeder."""

    def __init__(self, content: str = "", gecikme_s: float = 0.0,
                 hata: Exception | None = None) -> None:
        self.content = content
        self.gecikme_s = gecikme_s
        self.hata = hata
        self.calls = 0
        self.son_messages = None
        self.son_kwargs = None

    async def chat(self, messages, **kwargs):
        self.calls += 1
        self.son_messages = messages
        self.son_kwargs = kwargs
        if self.gecikme_s:
            await asyncio.sleep(self.gecikme_s)
        if self.hata is not None:
            raise self.hata
        return SimpleNamespace(content=self.content)


def _kur(monkeypatch, *, birincil=None, bayrak=True, n=1):
    """Ortak kurulum: N yolu + bayrak + (varsa) sahte birincil LLM sonucu."""
    monkeypatch.setattr(S, "SELF_CONSISTENCY_N", n)
    monkeypatch.setattr(S, "SINIFLANDIR_ESKALASYON", bayrak)
    if birincil is not None:
        async def _fake(_sys, _u, max_tokens=200, **_):
            return birincil
        monkeypatch.setattr(S, "llm_json", _fake)


def _sahte_reasoner_bagla(monkeypatch, reasoner):
    """get_llm_for_model'i sahte reasoner'a yönlendir; çağrı kaydını döndür."""
    kayit = {"n": 0, "model": None}

    def _fake(model):
        kayit["n"] += 1
        kayit["model"] = model
        return reasoner

    monkeypatch.setattr(S, "get_llm_for_model", _fake)
    return kayit


class TestEskalasyonKazanir:
    """(a) Düşük güven + reasoner yüksek güven → eskalasyon sonucu kazanır."""

    async def test_dusuk_guven_reasoner_sonucu_kazanir(self, monkeypatch):
        # Arrange — birincil conf 0.2 (< eşik) → belirsiz'e düşerdi; reasoner net.
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        reasoner = SahteReasoner(json.dumps(
            {"evrak_turu": "sikayet", "tur_confidence": 0.9,
             "tur_reasoning": "memnuniyetsizlik bildirimi"}, ensure_ascii=False))
        kayit = _sahte_reasoner_bagla(monkeypatch, reasoner)
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert — ikinci görüş kazanır; doğru model istenir; tek çağrı yapılır.
        assert sonuc["evrak_turu"] == "sikayet"
        assert sonuc["tur_confidence"] == 0.9
        assert "[eskalasyon]" in sonuc["tur_reasoning"]
        assert kayit["n"] == 1
        assert kayit["model"] == S.ESKALASYON_MODEL
        assert reasoner.calls == 1

    async def test_ayni_system_prompt_ve_json_mode_kullanilir(self, monkeypatch):
        # Arrange
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        reasoner = SahteReasoner(json.dumps(
            {"evrak_turu": "talep", "tur_confidence": 0.8}))
        _sahte_reasoner_bagla(monkeypatch, reasoner)
        # Act
        await S.siniflandir_node(_STATE)
        # Assert — aynı system prompt (görev tanımı değişmez) + JSON-mode sözleşmesi.
        assert reasoner.son_messages[0].role == "system"
        assert reasoner.son_messages[0].content == S._SYSTEM
        assert reasoner.son_kwargs.get("json_mode") is True

    async def test_llm_belirsiz_deyince_de_eskalasyon_tetiklenir(self, monkeypatch):
        # Arrange — birincil AÇIKÇA 'belirsiz' (güven yüksek olsa da tür yok) → tetik.
        _kur(monkeypatch, birincil={"evrak_turu": "belirsiz", "tur_confidence": 0.9})
        reasoner = SahteReasoner(json.dumps(
            {"evrak_turu": "ihbar", "tur_confidence": 0.85}))
        kayit = _sahte_reasoner_bagla(monkeypatch, reasoner)
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "ihbar"
        assert kayit["n"] == 1


class TestEskalasyonBelirsizKalir:
    """(b) Reasoner da düşük güven / bozuk / hatalı → mevcut abstention aynen korunur."""

    async def test_reasoner_dusuk_guven_belirsiz_kalir(self, monkeypatch):
        # Arrange — reasoner da eşik altı → ikinci görüş kullanılmaz.
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        reasoner = SahteReasoner(json.dumps(
            {"evrak_turu": "talep", "tur_confidence": 0.3}))
        _sahte_reasoner_bagla(monkeypatch, reasoner)
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert — birincil abstention BİREBİR (conf dahil) korunur.
        assert sonuc["evrak_turu"] == "belirsiz"
        assert sonuc["tur_confidence"] == 0.2
        assert "düşük güven" in sonuc["tur_reasoning"]

    async def test_reasoner_bozuk_cikti_belirsiz_kalir(self, monkeypatch):
        # Arrange — bozuk JSON: deterministik fallback sözleşmesi (c) kanıtı.
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        _sahte_reasoner_bagla(monkeypatch, SahteReasoner("bu json değil {{{"))
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"

    async def test_reasoner_kapali_kume_disi_tur_belirsiz_kalir(self, monkeypatch):
        # Arrange — kapalı-küme doğrulaması Python tarafında: uydurma tür reddedilir.
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        _sahte_reasoner_bagla(monkeypatch, SahteReasoner(json.dumps(
            {"evrak_turu": "uydurma_tur", "tur_confidence": 0.95})))
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"

    async def test_reasoner_hatasi_belirsiz_kalir(self, monkeypatch):
        # Arrange — istemci hatası (ör. anahtarsız RuntimeError) yutulur, akış ayakta.
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        _sahte_reasoner_bagla(
            monkeypatch, SahteReasoner(hata=RuntimeError("anahtar yok")))
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"

    async def test_reasoner_timeout_belirsiz_kalir(self, monkeypatch):
        # Arrange — ESKALASYON_TIMEOUT_S bütçesi aşılır (asyncio.wait_for mekanizması).
        _kur(monkeypatch, birincil=_DUSUK_GUVEN)
        monkeypatch.setattr(S, "ESKALASYON_TIMEOUT_S", 0.05)
        _sahte_reasoner_bagla(monkeypatch, SahteReasoner(
            json.dumps({"evrak_turu": "talep", "tur_confidence": 0.9}), gecikme_s=0.5))
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert — timeout → ikinci görüş yok, abstention korunur.
        assert sonuc["evrak_turu"] == "belirsiz"


class TestEskalasyonTetiklenmez:
    """(c) bayrak kapalı, (d) mock mod, yüksek güven ve N>1 yolunda HİÇ çağrılmaz."""

    async def test_bayrak_kapali_hic_cagrilmaz(self, monkeypatch):
        # Arrange
        _kur(monkeypatch, birincil=_DUSUK_GUVEN, bayrak=False)
        kayit = _sahte_reasoner_bagla(monkeypatch, SahteReasoner(json.dumps(
            {"evrak_turu": "sikayet", "tur_confidence": 0.9})))
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert — mevcut davranış birebir: belirsiz + sıfır eskalasyon çağrısı.
        assert sonuc["evrak_turu"] == "belirsiz"
        assert kayit["n"] == 0

    async def test_mock_modda_cagrilmaz(self, monkeypatch):
        # Arrange — llm_json PATCH'siz: mock modda şema tutmaz → heuristik yolu.
        # Bayrak açık olsa bile LLM sonucu olmadığından eskalasyon dalına girilmez.
        _kur(monkeypatch, bayrak=True)
        kayit = _sahte_reasoner_bagla(monkeypatch, SahteReasoner())
        # Act — keyword'süz metin: heuristik 'belirsiz' döner (mevcut davranış).
        sonuc = await S.siniflandir_node({"evrak_text": "xyz qrst 12345 lorem ipsum"})
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"
        assert kayit["n"] == 0

    async def test_yuksek_guven_eskalasyon_yok(self, monkeypatch):
        # Arrange — birincil zaten emin → maliyetli ikinci görüş açılmaz.
        _kur(monkeypatch, birincil={"evrak_turu": "dilekce", "tur_confidence": 0.9})
        kayit = _sahte_reasoner_bagla(monkeypatch, SahteReasoner())
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "dilekce"
        assert kayit["n"] == 0

    async def test_self_consistency_yolunda_cagrilmaz(self, monkeypatch):
        # Arrange — N=3: düşük güvenli örnekler self-consistency'de belirsiz'e düşer;
        # eskalasyon YALNIZ N==1 yolunda (pahalı yolun üstüne maliyet bindirilmez).
        _kur(monkeypatch, birincil=_DUSUK_GUVEN, n=3)
        kayit = _sahte_reasoner_bagla(monkeypatch, SahteReasoner())
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"
        assert kayit["n"] == 0

    async def test_n_buyuk_tek_atis_fallbackinde_de_cagrilmaz(self, monkeypatch):
        # Arrange — N=3 ama self-consistency örnekleri geçersiz (None) → tek-atış
        # yoluna düşülür; orada düşük güven çıksa bile N>1 iken eskalasyon yok.
        monkeypatch.setattr(S, "SELF_CONSISTENCY_N", 3)
        monkeypatch.setattr(S, "SINIFLANDIR_ESKALASYON", True)
        sayac = {"n": 0}

        async def _fake(_sys, _u, max_tokens=200, **_):
            sayac["n"] += 1
            return None if sayac["n"] <= 3 else _DUSUK_GUVEN

        monkeypatch.setattr(S, "llm_json", _fake)
        kayit = _sahte_reasoner_bagla(monkeypatch, SahteReasoner())
        # Act
        sonuc = await S.siniflandir_node(_STATE)
        # Assert
        assert sonuc["evrak_turu"] == "belirsiz"
        assert kayit["n"] == 0
