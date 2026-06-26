"""ECC denetimi düzeltmeleri — CRAG tür-boost (HIGH-1) + clarifier ölü-kod (LOW-6).

HIGH-1: crag_node düşük-güvende `_from_corpus(sorgu, turu=...)` çağırmalı — `turu`
geçilmezse tür→mevzuat BOOST uygulanmaz (beklenen=set()) ve düzeltme tür-sinyalsiz
retrieval'a düşer. Bu test çağrının `turu` argümanını GERÇEKTEN ilettiğini kilitler.

LOW-6: clarifier `_KRITIK_TALEP` anahtarları config.CLARIFY_KRITIK_ALANLAR ile örtüşmeli
(asla erişilemeyen ölü kayıt olmasın). 'gonderen_ad_soyad' bilerek YOK (mock'ta güvenilir
tespit edilemez → kritik değil).

LLM_MODE=mock (conftest); crag_node saf — gerçek korpus + monkeypatch ile davranış doğrulanır.
"""

from __future__ import annotations

from typing import Any

import pytest

from agents.config import CLARIFY_KRITIK_ALANLAR
from agents.nodes import crag as crag_mod
from agents.nodes.clarifier import _KRITIK_TALEP

# ---------------------------------------------------------------------------
# HIGH-1 — CRAG düzeltmesi _from_corpus'a `turu` argümanını iletir (tür-boost korunur)
# ---------------------------------------------------------------------------


class TestCragTurBoostIletilir:
    """crag_node, düşük-güvende _from_corpus'u `turu=evrak_turu` ile çağırmalı."""

    async def test_from_corpus_turu_argumani_gecer(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — CRAG açık; retrieval güveni düşük (raw_score yok → config-proxy düşük).
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        cagrilar: list[dict[str, Any]] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            cagrilar.append({"query": query, "turu": turu})
            # Daha iyi (raw_score'lu) sonuç döndür → düzeltme uygulanır.
            return [{"baslik": "X m.1", "snippet": "...", "score": 1.0, "raw_score": 30.0}]

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "park aydınlatma talebi"},
            "evrak_text": "Mahalle parkına aydınlatma talebimi arz ederim.",
            # Düşük güven: mevcut öneri raw_score'suz config-fallback (score≈0.3).
            "mevzuat_onerileri": [{"baslik": "genel", "score": 0.3}],
        }
        # Act
        out = await crag_mod.crag_node(state)
        # Assert — _from_corpus çağrıldı ve turu="dilekce" iletildi (boş DEĞİL)
        assert cagrilar, "_from_corpus düşük-güvende çağrılmalıydı"
        assert cagrilar[0]["turu"] == "dilekce"
        assert out.get("crag_corrected") is True

    async def test_evrak_turu_yoksa_bos_turu_gecer(self, monkeypatch: pytest.MonkeyPatch):
        # Arrange — evrak_turu yok → turu="" geçmeli (kwarg hatasız, boost no-op)
        monkeypatch.setattr(crag_mod, "CRAG_ENABLED", True)
        cagrilar: list[str] = []

        def _fake_from_corpus(query: str, turu: str = "") -> list[dict[str, Any]]:
            cagrilar.append(turu)
            return []

        monkeypatch.setattr(crag_mod, "_from_corpus", _fake_from_corpus)
        monkeypatch.setattr(crag_mod, "_from_config", lambda t: [{"baslik": "f", "score": 0.3}])
        state = {
            "bilgi_unsurlari": {"konu": "uzun yeterli konu metni"},
            "evrak_text": "Yeterince uzun bir evrak metni buraya yazılır.",
            "mevzuat_onerileri": [{"baslik": "g", "score": 0.3}],
        }
        # Act
        await crag_mod.crag_node(state)
        # Assert — turu boş string olarak iletildi (None/eksik DEĞİL)
        assert cagrilar == [""]


# ---------------------------------------------------------------------------
# LOW-6 — clarifier _KRITIK_TALEP config ile tutarlı (ölü kayıt yok)
# ---------------------------------------------------------------------------


class TestClarifierTalepTutarli:
    """_KRITIK_TALEP anahtarları CLARIFY_KRITIK_ALANLAR ile birebir örtüşmeli."""

    def test_talep_anahtarlari_config_ile_eslesir(self):
        # Assert — her kritik alan için talep mesajı var; fazlası (ölü kayıt) yok
        assert set(_KRITIK_TALEP) == set(CLARIFY_KRITIK_ALANLAR)

    def test_gonderen_ad_soyad_kaldirildi(self):
        # Assert — LOW-6 ölü kayıt temizlendi
        assert "gonderen_ad_soyad" not in _KRITIK_TALEP
