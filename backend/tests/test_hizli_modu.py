"""Vitrin hız profili testleri — danışma LLM çağrıları (route_birim/finalize) atlanır,
kalite-kritikler (sınıflandır/çıkar/özetle/yazı gövdesi) kalır. TEK MOD: hız ayarları
ayrı bayrak değil, VITRIN_MODU'nun parçasıdır (LLM_ATLA_NODELAR ile ezilebilir)."""

from __future__ import annotations

from agents.config import _csv_kume
from agents.nodes import finalize as finalize_mod
from agents.nodes import route_birim as route_mod


class TestCsvKume:
    def test_bosluklu_liste_temizlenir(self):
        assert _csv_kume(" route_birim , finalize ,") == frozenset({"route_birim", "finalize"})

    def test_bos_deger_bos_kume(self):
        assert _csv_kume("") == frozenset()


class TestRouteBirimAtlama:
    async def test_atla_listesindeyse_llm_hic_cagrilmaz(self, monkeypatch):
        # Arrange — real_llm çağrılırsa test patlar (danışma çağrısının atlandığının kanıtı)
        monkeypatch.setattr(route_mod, "LLM_ATLA_NODELAR", frozenset({"route_birim"}))
        def _patlat():
            raise AssertionError("HIZLI_MODU'da real_llm çağrılmamalı")
        monkeypatch.setattr(route_mod, "real_llm", _patlat)
        state = {"evrak_turu": "dilekce", "evrak_text": "izin talebi", "bilgi_unsurlari": {}}
        # Act
        sonuc = await route_mod.route_birim_node(state)
        # Assert — deterministik hedef aynen döner
        assert sonuc["hedef_birim"]

    async def test_liste_bosken_davranis_degismez(self, monkeypatch):
        # Arrange — atla listesi boş + mock LLM (real_llm None) → mevcut baseline yol
        monkeypatch.setattr(route_mod, "LLM_ATLA_NODELAR", frozenset())
        monkeypatch.setattr(route_mod, "real_llm", lambda: None)
        state = {"evrak_turu": "dilekce", "evrak_text": "izin talebi", "bilgi_unsurlari": {}}
        # Act / Assert
        assert (await route_mod.route_birim_node(state))["hedef_birim"]


class TestFinalizeAtlama:
    async def test_atla_listesindeyse_deterministik_bilgilendirme(self, monkeypatch):
        # Arrange — llm_text çağrılırsa patlat (finalize LLM'inin atlandığının kanıtı)
        monkeypatch.setattr(finalize_mod, "LLM_ATLA_NODELAR", frozenset({"finalize"}))
        async def _patlat(*a, **k):
            raise AssertionError("HIZLI_MODU'da llm_text çağrılmamalı")
        monkeypatch.setattr(finalize_mod, "llm_text", _patlat)
        state = {"evrak_turu": "dilekce", "hedef_birim": "yazi_isleri_evrak",
                 "bilgi_unsurlari": {}, "eksik_alanlar": [], "mevzuat_onerileri": []}
        # Act
        sonuc = await finalize_mod.finalize_node(state)
        # Assert — deterministik şablon bilgilendirme yine dolu
        assert sonuc["bilgilendirme"]
