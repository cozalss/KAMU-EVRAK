"""LangGraph topoloji testleri — _pipeline_nodes ENV-gate + _clarify_route + build_graph.

agents/graph.py ÜRETİM KODU; burada YALNIZ test eklenir (kaynak değişmez). ENV-gated
node'ların (CRAG/Self-RAG/clarifier) sıra etiketlerinde açıkken görünüp kapalıyken
kaybolması + clarify router dal seçimi + grafın compile olup ainvoke edilebilmesi.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import importlib

import agents.graph as graph_mod
from agents.graph import _clarify_route, build_graph
from agents.state import make_initial_state


class TestPipelineNodesEnvGate:
    """_pipeline_nodes — ENV bayraklarına göre crag/self_rag sıra etiketleri."""

    def test_baseline_crag_self_rag_yok(self, monkeypatch):
        # Arrange — ikisi de kapalı (varsayılan)
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", False)
        monkeypatch.setattr(graph_mod, "SELF_RAG_ENABLED", False)
        # Act
        nodes = graph_mod._pipeline_nodes()
        # Assert — baseline dizi; crag/self_rag YOK
        assert "crag" not in nodes
        assert "self_rag" not in nodes
        assert nodes[0] == "siniflandir"
        assert nodes[-1] == "finalize"

    def test_crag_acik_sirada_gorunur(self, monkeypatch):
        # Arrange — CRAG açık
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(graph_mod, "SELF_RAG_ENABLED", False)
        # Act
        nodes = graph_mod._pipeline_nodes()
        # Assert — crag mevzuat_oner'den sonra
        assert "crag" in nodes
        assert nodes.index("crag") == nodes.index("mevzuat_oner") + 1

    def test_self_rag_acik_verify_arsiv_arasi(self, monkeypatch):
        # Arrange — Self-RAG açık
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", False)
        monkeypatch.setattr(graph_mod, "SELF_RAG_ENABLED", True)
        # Act
        nodes = graph_mod._pipeline_nodes()
        # Assert — self_rag verify ile arsiv arasında
        assert nodes.index("verify") < nodes.index("self_rag") < nodes.index("arsiv")

    def test_ikisi_acik_her_ikisi_var(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", True)
        monkeypatch.setattr(graph_mod, "SELF_RAG_ENABLED", True)
        # Act
        nodes = graph_mod._pipeline_nodes()
        # Assert
        assert "crag" in nodes and "self_rag" in nodes


class TestClarifyRoute:
    """_clarify_route — kritik eksikte clarifier, değilse yazi_taslak."""

    def test_kritik_eksik_clarifier(self):
        # Arrange — dilekçe + imza kritik eksik
        state = {"evrak_turu": "dilekce", "eksik_alanlar": ["imza", "iletisim_adres"]}
        # Act + Assert
        assert _clarify_route(state) == "clarifier"

    def test_kritik_yok_yazi_taslak(self):
        # Arrange — kritik eksik yok
        state = {"evrak_turu": "dilekce", "eksik_alanlar": []}
        # Act + Assert
        assert _clarify_route(state) == "yazi_taslak"

    def test_resmi_yazi_yazi_taslak(self):
        # Arrange — resmî yazıda clarifier tetiklenmez
        state = {"evrak_turu": "ust_yazi", "eksik_alanlar": ["imza"]}
        # Act + Assert
        assert _clarify_route(state) == "yazi_taslak"


class TestBuildGraph:
    """build_graph — baseline compile + uçtan-uca ainvoke (mock)."""

    async def test_baseline_compile_ainvoke(self):
        # Arrange — baseline graf
        g = build_graph()
        # Act — basit dilekçe metniyle uçtan uca
        out = await g.ainvoke(make_initial_state(
            "Sayın yetkili, mahalle parkına aydınlatma talebimi arz ederim. "
            "Ad-Soyad: Ali Veli, Atatürk Cad. No:5, imza."
        ))
        # Assert — temel çıktı sözleşmesi
        assert "evrak_turu" in out
        assert "mevzuat_onerileri" in out
        assert "ozet" in out

    async def test_crag_acik_graf_compile(self, monkeypatch):
        # Arrange — CRAG açık varyant compile + ainvoke etmeli
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", True)
        importlib.reload  # no-op referans; build_graph modül attr okur
        g = build_graph()
        # Act
        out = await g.ainvoke(make_initial_state("Konu: haciz icra takibi başlatılması."))
        # Assert — crag dalı state'i bozmadı
        assert "evrak_turu" in out

    async def test_clarify_stop_acik_graf_compile(self, monkeypatch):
        # Arrange — dur-ve-sor dalı açık
        monkeypatch.setattr(graph_mod, "CLARIFY_STOP_ENABLED", True)
        g = build_graph()
        # Act — kritik-eksik dilekçe (imza/adres yok) → clarifier dalı
        out = await g.ainvoke(make_initial_state(
            "Mahalledeki sorunun çözülmesini istiyorum. Ad-Soyad: Ayşe Yılmaz"
        ))
        # Assert — graf yine çalışır (dur-ve-sor veya normal taslak)
        assert "evrak_turu" in out

    async def test_self_rag_acik_graf_compile(self, monkeypatch):
        # Arrange — Self-RAG açık
        monkeypatch.setattr(graph_mod, "SELF_RAG_ENABLED", True)
        g = build_graph()
        # Act
        out = await g.ainvoke(make_initial_state("Konu: bilgi edinme başvurusu 4982."))
        # Assert
        assert "evrak_turu" in out
