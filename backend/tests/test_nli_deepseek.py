"""Madde 12 — NLI entailment DeepSeek sağlayıcısı (model indirmesiz) testleri.

Gerçek LLM GEREKMEDEN: llm_json/real_llm monkeypatch'lenir → deepseek yolu wiring + eşik +
kapalı-küme doğrulama + sessiz passthrough sınanır. Çıktı sözleşmesi mevcut yapıyla AYNI
({baslik, entailment, skor, etiket}); 'model' sağlayıcı yolu (mDeBERTa) ve NLI_ENABLED=0
sözleşmesi birebir korunur. AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import agents.graph as graph_mod
from agents.nodes import mevzuat_dogrula as md

_ONERILER = [
    {"baslik": "3071 dilekce hakki kanunu m.4", "snippet": "Dilekçe sahibinin adı soyadı imzası."},
    {"baslik": "2646 resmi yazisma yonetmeligi", "snippet": "Resmî yazışma usul ve esasları."},
]


def _state(oneriler=None):
    return {
        "mevzuat_onerileri": _ONERILER if oneriler is None else oneriler,
        "bilgi_unsurlari": {"konu": "dilekçe hakkı"},
    }


def _fake_llm_json(cevaplar, kayit=None):
    """Sıralı sahte llm_json — çağrı başına bir cevap; istenirse user prompt'ları kaydeder."""
    it = iter(cevaplar)

    async def _fake(system, user, **kw):
        if kayit is not None:
            kayit.append(user)
        return next(it)

    return _fake


async def _patlayan_llm_json(system, user, **kw):
    raise AssertionError("llm_json bu yolda ÇAĞRILMAMALI")


class TestDeepseekYolu:
    """NLI_PROVIDER=deepseek — llm_json entailment, mDeBERTa indirmeden."""

    def _ac(self, monkeypatch):
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "deepseek")
        monkeypatch.setattr(md, "NLI_ESIK", 0.5)
        monkeypatch.setattr(md, "real_llm", lambda: object())  # gerçek LLM varmış gibi

    async def test_dusuk_entailment_dogrula_etiketi(self, monkeypatch):
        # Arrange — sahte LLM iki öneride de zayıf destek verir
        self._ac(monkeypatch)
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"entailment": False, "skor": 0.2},
            {"entailment": False, "skor": 0.1},
        ]))
        # Act
        out = await md.mevzuat_dogrula_node(_state())
        # Assert — eşik altı → [DOĞRULA] etiketi (mevcut sözleşme birebir)
        nli = out["mevzuat_nli"]
        assert len(nli) == 2
        for kayit in nli:
            assert set(kayit) == {"baslik", "entailment", "skor", "etiket"}
            assert kayit["entailment"] is False
            assert "DOĞRULA" in kayit["etiket"]
        assert nli[0]["skor"] == 0.2

    async def test_yuksek_entailment_etiket_yok(self, monkeypatch):
        # Arrange — güçlü anlamsal destek
        self._ac(monkeypatch)
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"entailment": True, "skor": 0.9},
            {"entailment": True, "skor": 0.8},
        ]))
        # Act
        out = await md.mevzuat_dogrula_node(_state())
        # Assert — eşik üstü → destekleniyor, [DOĞRULA] yok
        nli = out["mevzuat_nli"]
        assert nli[0]["entailment"] is True and nli[0]["skor"] == 0.9
        assert all(k["etiket"] == "destekleniyor" for k in nli)
        assert all("DOĞRULA" not in k["etiket"] for k in nli)

    async def test_oneri_basina_tek_cagri_ve_snippet_kisaltma(self, monkeypatch):
        # Arrange — uzun snippet (1000 kr) → prompt'a ~400 kr girer (maliyet sözleşmesi)
        self._ac(monkeypatch)
        prompts: list[str] = []
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"entailment": True, "skor": 0.9},
            {"entailment": True, "skor": 0.9},
        ], kayit=prompts))
        uzun = [
            {"baslik": "uzun madde", "snippet": "a" * 1000},
            {"baslik": "kisa madde", "snippet": "kısa metin"},
        ]
        # Act
        await md.mevzuat_dogrula_node(_state(uzun))
        # Assert — öneri başına TAM 1 mini çağrı; premise 400 kr'de kesilmiş
        assert len(prompts) == 2
        assert "a" * 400 in prompts[0]
        assert "a" * 401 not in prompts[0]

    async def test_bozuk_cikti_sessiz_passthrough(self, monkeypatch):
        # Arrange — LLM şema dışı JSON döndürür (mock default'u gibi)
        self._ac(monkeypatch)
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"domain": "x", "confidence": 0.4},
        ]))
        # Act + Assert — bozuk çıktıya körü körüne güvenilmez → mevcut sessiz passthrough
        out = await md.mevzuat_dogrula_node(_state())
        assert out == {}

    async def test_aralik_disi_skor_passthrough(self, monkeypatch):
        # Arrange — skor [0..1] dışı + entailment bool değil → kapalı-küme reddi
        self._ac(monkeypatch)
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"entailment": "evet", "skor": 5},
        ]))
        # Act + Assert
        out = await md.mevzuat_dogrula_node(_state())
        assert out == {}

    async def test_skor_bozuk_bool_karari_kullanilir(self, monkeypatch):
        # Arrange — skor alanı bozuk ama entailment kararı NET bool → keskin skora düş
        self._ac(monkeypatch)
        monkeypatch.setattr(md, "llm_json", _fake_llm_json([
            {"entailment": True},                    # skor yok → 1.0
            {"entailment": False, "skor": "yok"},    # skor bozuk → 0.0
        ]))
        # Act
        out = await md.mevzuat_dogrula_node(_state())
        # Assert
        nli = out["mevzuat_nli"]
        assert nli[0]["entailment"] is True and nli[0]["skor"] == 1.0
        assert nli[1]["entailment"] is False and "DOĞRULA" in nli[1]["etiket"]

    async def test_llm_yok_mock_passthrough_cagri_yok(self, monkeypatch):
        # Arrange — mock/anahtarsız (real_llm None); llm_json çağrılırsa test patlar
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "deepseek")
        monkeypatch.setattr(md, "real_llm", lambda: None)
        monkeypatch.setattr(md, "llm_json", _patlayan_llm_json)
        # Act + Assert — mock modda LLM yolu hiç açılmaz → mevcut sessiz passthrough
        out = await md.mevzuat_dogrula_node(_state())
        assert out == {}


class TestModelYolu:
    """NLI_PROVIDER=model — eski mDeBERTa yolu birebir (llm_json'a hiç girmez)."""

    async def test_model_yolu_llm_json_cagirmaz(self, monkeypatch):
        # Arrange — provider=model; _entailment_skor mock, llm_json patlar-tuzağı
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "model")
        monkeypatch.setattr(md, "NLI_ESIK", 0.5)
        skorlar = iter([0.9, 0.2])
        monkeypatch.setattr(md, "_entailment_skor", lambda p, h: next(skorlar))
        monkeypatch.setattr(md, "llm_json", _patlayan_llm_json)
        # Act
        out = await md.mevzuat_dogrula_node(_state())
        # Assert — eski çıktı sözleşmesi aynen
        nli = out["mevzuat_nli"]
        assert nli[0]["entailment"] is True and nli[0]["skor"] == 0.9
        assert nli[1]["entailment"] is False and "DOĞRULA" in nli[1]["etiket"]

    async def test_transformers_yok_graceful_passthrough_aynen(self, monkeypatch):
        # Arrange — model/lib yok → mevcut graceful passthrough korunur
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "model")

        def _boom(premise, hypothesis):
            raise ImportError("transformers kurulu değil")

        monkeypatch.setattr(md, "_entailment_skor", _boom)
        # Act + Assert
        out = await md.mevzuat_dogrula_node(_state())
        assert out == {}


class TestNliKapaliSozlesmesi:
    """NLI_ENABLED=0 (varsayılan) — node çağrılmıyor sözleşmesi korunur."""

    async def test_kapali_node_bos_ve_llm_cagirmaz(self, monkeypatch):
        # Arrange — ana anahtar kapalı; hiçbir sağlayıcı yolu açılmamalı
        monkeypatch.setattr(md, "NLI_ENABLED", False)
        monkeypatch.setattr(md, "NLI_PROVIDER", "deepseek")
        monkeypatch.setattr(md, "llm_json", _patlayan_llm_json)
        # Act + Assert
        out = await md.mevzuat_dogrula_node(_state())
        assert out == {}

    def test_kapali_graf_sirasinda_yok(self, monkeypatch):
        # Arrange + Act + Assert — kapalıyken node grafta YOK, açıkken mevzuat dalında VAR
        monkeypatch.setattr(graph_mod, "NLI_ENABLED", False)
        assert "mevzuat_dogrula" not in graph_mod._pipeline_nodes()
        monkeypatch.setattr(graph_mod, "NLI_ENABLED", True)
        nodes = graph_mod._pipeline_nodes()
        assert nodes.index("mevzuat_oner") < nodes.index("mevzuat_dogrula")
