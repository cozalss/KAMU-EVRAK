"""mevzuat_dogrula node testleri — NLI atıf-gerekçelendirme (ENV-gated, graceful).

Gerçek mDeBERTa-xnli modeli GEREKMEDEN: _entailment_skor mock'lanır → wiring + eşik +
graceful fallback sınanır. Kapalıyken (NLI_ENABLED=0) baseline (boş dict) korunur.
"""

from __future__ import annotations

from agents.nodes import mevzuat_dogrula as md

_ONERILER = [
    {"baslik": "3071 dilekce hakki kanunu m.4", "snippet": "Dilekçe sahibinin adı soyadı imzası."},
    {"baslik": "2646 resmi yazisma yonetmeligi", "snippet": "Resmî yazışma usul ve esasları."},
]


class TestMevzuatDogrula:
    async def test_nli_kapali_baseline_bos(self, monkeypatch):
        # Arrange — NLI kapalı → baseline (mevzuat_oner birebir korunur)
        monkeypatch.setattr(md, "NLI_ENABLED", False)
        # Act + Assert
        out = await md.mevzuat_dogrula_node({"mevzuat_onerileri": _ONERILER})
        assert out == {}

    async def test_nli_acik_entailment_isaretler(self, monkeypatch):
        # Arrange — NLI açık; ilk öneri güçlü, ikinci zayıf entailment
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_ESIK", 0.5)
        skorlar = iter([0.9, 0.2])
        monkeypatch.setattr(md, "_entailment_skor", lambda p, h: next(skorlar))
        # Act
        out = await md.mevzuat_dogrula_node({
            "mevzuat_onerileri": _ONERILER,
            "bilgi_unsurlari": {"konu": "dilekçe hakkı"},
        })
        # Assert
        nli = out["mevzuat_nli"]
        assert len(nli) == 2
        assert nli[0]["entailment"] is True and nli[0]["skor"] == 0.9
        assert nli[1]["entailment"] is False
        assert "DOĞRULA" in nli[1]["etiket"]

    async def test_model_yok_graceful_passthrough(self, monkeypatch):
        # Arrange — NLI açık ama model/lib yok → graceful boş (mevzuat_onerileri korunur)
        monkeypatch.setattr(md, "NLI_ENABLED", True)

        def _boom(premise, hypothesis):
            raise ImportError("transformers kurulu değil")

        monkeypatch.setattr(md, "_entailment_skor", _boom)
        # Act + Assert
        out = await md.mevzuat_dogrula_node({
            "mevzuat_onerileri": _ONERILER, "bilgi_unsurlari": {"konu": "x"},
        })
        assert out == {}

    async def test_bos_oneri_bos_doner(self, monkeypatch):
        # Arrange + Act — öneri yoksa NLI denenmez
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        out = await md.mevzuat_dogrula_node({"mevzuat_onerileri": []})
        # Assert
        assert out == {}
