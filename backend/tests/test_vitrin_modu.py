"""Vitrin (jüri demo) modu bayrak çözümü testleri (S3).

VITRIN_MODU tek anahtarı kapalı hazineleri (clarifier/HITL/CRAG/self-consistency)
birlikte açar; bireysel ENV her zaman kazanır; baseline (vitrin kapalı) birebir korunur.
_bayrak SAF fonksiyondur → env sözlüğüyle deterministik test edilir.
"""

from __future__ import annotations

from agents.config import _bayrak


class TestBayrakCozumu:
    def test_vitrin_acik_bayrak_verilmemis_acik(self):
        # Arrange / Act / Assert — vitrin varsayılanı devreye girer
        assert _bayrak("HITL_ENABLED", vitrin_acik=True, env={}) is True

    def test_vitrin_acik_bireysel_kapatma_kazanir(self):
        # Bireysel ENV vitrini ezer (VITRIN_MODU=1 + HITL_ENABLED=0 → kapalı)
        assert _bayrak("HITL_ENABLED", vitrin_acik=True, env={"HITL_ENABLED": "0"}) is False

    def test_vitrin_kapali_baseline_kapali(self):
        # Baseline: bayrak verilmemişse KAPALI (827 testin sabitlediği topoloji)
        assert _bayrak("CLARIFY_STOP_ENABLED", vitrin_acik=False, env={}) is False

    def test_vitrin_kapali_bireysel_acma_kazanir(self):
        assert _bayrak("CRAG_ENABLED", vitrin_acik=False, env={"CRAG_ENABLED": "1"}) is True
