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
        # Arrange — NLI açık; model yolu (mDeBERTa; deepseek yolu tests/test_nli_deepseek.py)
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "model")
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
        # Arrange — NLI açık (model yolu) ama model/lib yok → graceful boş (öneriler korunur)
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "model")

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

    async def test_crag_duzeltilmis_liste_dogrulanir(self, monkeypatch):
        # Arrange — CRAG düzeltmesi uygulanmış: gösterilen liste _corrected altında.
        # NLI, atılmış eski listeyi DEĞİL düzeltilmiş listeyi doğrulamalı (grounding).
        monkeypatch.setattr(md, "NLI_ENABLED", True)
        monkeypatch.setattr(md, "NLI_PROVIDER", "model")
        monkeypatch.setattr(md, "NLI_ESIK", 0.5)
        monkeypatch.setattr(md, "_entailment_skor", lambda p, h: 0.9)
        duzeltilmis = [{"baslik": "4982 bilgi edinme kanunu m.11", "snippet": "On beş iş günü."}]
        # Act — hem eski (yanlış) hem düzeltilmiş liste state'te; düzeltilmiş kazanmalı
        out = await md.mevzuat_dogrula_node({
            "mevzuat_onerileri": _ONERILER,               # eski/atılmış liste
            "mevzuat_onerileri_corrected": duzeltilmis,   # CRAG düzeltmesi (gösterilen)
            "bilgi_unsurlari": {"konu": "bilgi edinme"},
        })
        # Assert — NLI çıktısı düzeltilmiş listenin başlığını taşımalı (eskiyi değil)
        nli = out["mevzuat_nli"]
        assert len(nli) == 1
        assert nli[0]["baslik"] == "4982 bilgi edinme kanunu m.11"
