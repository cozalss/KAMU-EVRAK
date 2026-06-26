"""onay_kapisi (HITL) testleri — LangGraph interrupt() + Command(resume) ile memur onayı.

HITL_ENABLED + InMemorySaver checkpointer ile: graf yazi_taslak sonrası DURUR (__interrupt__),
memur kararı (onayla/duzenle/reddet) resume ile uygulanır. Kapalıyken (baseline) interrupt YOK.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agents import graph as gmod
from agents.nodes import onay_kapisi as okmod
from agents.state import make_initial_state

_METIN = "Konu: izin talebi. Dilekçe ile arz ederim. Ad-Soyad: Ayşe Yılmaz"


def _hitl_graph(monkeypatch):
    # KOŞULSUZ HITL kontratı: RISK_GUARD kapalı → her taslak onaya düşer (risk koşulu yok).
    # Koşullu (risk-tabanlı) HITL ayrı test edilir (test_risk_guard.py).
    monkeypatch.setattr(gmod, "HITL_ENABLED", True)
    monkeypatch.setattr(gmod, "RISK_GUARD_ENABLED", False)
    monkeypatch.setattr(okmod, "HITL_ENABLED", True)
    return gmod.build_graph(checkpointer=InMemorySaver())


class TestOnayKapisi:
    async def test_taslakta_durur_interrupt(self, monkeypatch):
        # Arrange
        g = _hitl_graph(monkeypatch)
        cfg = {"configurable": {"thread_id": "a"}}
        # Act
        out = await g.ainvoke(make_initial_state(_METIN), cfg)
        # Assert — akış onay_kapisi'nde durdu (memur kararı bekleniyor)
        assert "__interrupt__" in out
        assert out["__interrupt__"][0].value["tip"] == "memur_onay"

    async def test_onayla_akis_devam_eder(self, monkeypatch):
        # Arrange
        g = _hitl_graph(monkeypatch)
        cfg = {"configurable": {"thread_id": "b"}}
        await g.ainvoke(make_initial_state(_METIN), cfg)
        # Act — memur onaylar → resume
        final = await g.ainvoke(Command(resume={"secim": "onayla"}), cfg)
        # Assert — onaylandı + finalize çalıştı
        assert final["onay_durumu"] == "onaylandı"
        assert final.get("bilgilendirme") or final.get("response")

    async def test_duzenle_memur_govdesi_ezer(self, monkeypatch):
        # Arrange
        g = _hitl_graph(monkeypatch)
        cfg = {"configurable": {"thread_id": "c"}}
        await g.ainvoke(make_initial_state(_METIN), cfg)
        # Act — memur gövdeyi düzenler
        final = await g.ainvoke(
            Command(resume={"secim": "duzenle", "metin": "DÜZENLENMİŞ RESMÎ GÖVDE"}), cfg)
        # Assert — düzenlenmiş metin taslağı ezer (insan otoritesi)
        assert final["onay_durumu"] == "düzenlendi"
        assert final["yazi_taslak_md"] == "DÜZENLENMİŞ RESMÎ GÖVDE"

    async def test_reddet_gerekce_kaydeder(self, monkeypatch):
        # Arrange
        g = _hitl_graph(monkeypatch)
        cfg = {"configurable": {"thread_id": "d"}}
        await g.ainvoke(make_initial_state(_METIN), cfg)
        # Act — memur reddeder
        final = await g.ainvoke(
            Command(resume={"secim": "reddet", "gerekce": "üslup uygun değil"}), cfg)
        # Assert
        assert final["onay_durumu"] == "reddedildi"
        assert "üslup" in final["onay_gerekce"]

    async def test_baseline_hitl_kapali_kesintisiz(self, monkeypatch):
        # Arrange — HITL kapalı → interrupt YOK, tek ainvoke tamamlanır (baseline)
        monkeypatch.setattr(gmod, "HITL_ENABLED", False)
        monkeypatch.setattr(okmod, "HITL_ENABLED", False)
        g = gmod.build_graph()  # checkpointer yok
        # Act
        out = await g.ainvoke(make_initial_state(_METIN))
        # Assert — kesintisiz; onay alanları yok
        assert "__interrupt__" not in out
        assert "onay_durumu" not in out
