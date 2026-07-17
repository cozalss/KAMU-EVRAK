"""yazi_plan — dinamik yazı türü + muhatap planı (LLM, kapalı-küme + grounded).

Sözleşme: mock/anahtarsız/hata → None (çağıran statik EVRAK_TO_YAZI yoluna döner);
kapalı-küme dışı tür → plan tümden ret; belgeye dayanmayan muhatap → muhatap düşer,
tür korunur. AAA deseni; SayacLLM fake'i (test_yazi_render_revize deseni).
"""

from __future__ import annotations

import json

import pytest

import agents.nodes._llm_extract as ext
from agents.llm import ChatMessage, LLMResponse, MockLLM
from agents.nodes._llm_extract import cache_temizle
from yazi.yazi_plan import _muhatap_grounded, yazi_plani


class SayacLLM:
    """Sıralı sahte yanıt — MockLLM DEĞİL (real_llm() kontrolünü geçer)."""

    def __init__(self, *yanitlar: str) -> None:
        self._yanitlar = list(yanitlar)
        self.call_count = 0

    async def chat(self, messages: list[ChatMessage], *, temperature=0.1,
                   max_tokens=1024, json_mode=False, json_schema=None) -> LLMResponse:
        yanit = self._yanitlar[min(self.call_count, len(self._yanitlar) - 1)]
        self.call_count += 1
        return LLMResponse(content=yanit)


@pytest.fixture(autouse=True)
def _temiz_cache():
    cache_temizle()
    yield
    cache_temizle()


_EVRAK = ("4734 sayılı Kanun'un 22. maddesi kapsamında doğrudan temin sınırına ilişkin "
          "hukuki görüş ve mütalaanızın bildirilmesini arz ederim.\n"
          "Sanayi ve Teknoloji Bakanlığı Strateji Geliştirme Başkanlığı")


def _plan_json(**kw) -> str:
    return json.dumps({"yazi_turu": "gorus_mutalaa", "muhatap": "", "gerekce": "Görüş talebi.", **kw},
                      ensure_ascii=False)


class TestYaziPlani:
    async def test_mock_modda_none_statik_yol(self, monkeypatch):
        monkeypatch.setattr(ext, "get_llm", lambda: MockLLM())
        assert await yazi_plani("gorus_mutalaa", {}, _EVRAK, "hukuk_musavirligi") is None

    async def test_gecerli_plan_uygulanir(self, monkeypatch):
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(_plan_json()))
        plan = await yazi_plani("gorus_mutalaa", {"konu": "görüş"}, _EVRAK, "hukuk_musavirligi")
        assert plan == {"yazi_turu": "gorus_mutalaa", "muhatap": "", "gerekce": "Görüş talebi."}

    async def test_kapali_kume_disi_tur_plani_reddeder(self, monkeypatch):
        monkeypatch.setattr(ext, "get_llm",
                            lambda: SayacLLM(_plan_json(yazi_turu="serbest_mektup")))
        assert await yazi_plani("dilekce", {}, _EVRAK, "") is None

    async def test_belgede_gecen_muhatap_kabul(self, monkeypatch):
        # "Strateji Geliştirme Başkanlığı" evrak metninde birebir geçiyor → grounded
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(
            _plan_json(yazi_turu="cevabi_yazi", muhatap="Strateji Geliştirme Başkanlığı")))
        plan = await yazi_plani("gorus_mutalaa", {}, _EVRAK, "")
        assert plan is not None and plan["muhatap"] == "Strateji Geliştirme Başkanlığı"

    async def test_uydurma_muhatap_duser_tur_korunur(self, monkeypatch):
        # "Hazine Müsteşarlığı" evrakta YOK ve hedef birim değil → muhatap boşalır
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(
            _plan_json(yazi_turu="cevabi_yazi", muhatap="Hazine Müsteşarlığı")))
        plan = await yazi_plani("gorus_mutalaa", {}, _EVRAK, "hukuk_musavirligi")
        assert plan is not None
        assert plan["yazi_turu"] == "cevabi_yazi"
        assert plan["muhatap"] == ""  # uydurma muhatap taslağa giremez

    def test_muhatap_grounded_hedef_birim_adi(self):
        # Hedef birimin resmî adı belgede geçmese de kabul (iletim muhatabı)
        assert _muhatap_grounded("Hukuk Müşavirliği", "alakasız metin", "hukuk_musavirligi")

    def test_muhatap_grounded_sayin_oneki_toleransli(self):
        assert _muhatap_grounded("Sayın Ayşe Yılmaz", "başvuran: Ayşe Yılmaz", "")


class TestYaziTaslakNodeDinamik:
    async def test_plan_turu_ve_gerekce_uygulanir(self, monkeypatch):
        # Arrange — 1. çağrı plan JSON'u, 2. çağrı gövde metni
        from agents.nodes.yazi_taslak import yazi_taslak_node
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(
            _plan_json(gerekce="Hukuki görüş istendiği için görüş yazısı."),
            "Talep edilen hukuki değerlendirme yapılmıştır."))
        state = {"evrak_turu": "dilekce",  # statik tablo cevabi_yazi derdi
                 "bilgi_unsurlari": {"konu": "görüş"}, "evrak_text": _EVRAK,
                 "hedef_birim": "hukuk_musavirligi"}
        # Act
        out = await yazi_taslak_node(state)
        # Assert — plan statik tabloyu EZDİ + gerekçe API'ye taşındı
        assert out["yazi_turu"] == "gorus_mutalaa"
        assert out["yazi_plan_notu"] == "Hukuki görüş istendiği için görüş yazısı."
        assert "Bilgi ve gereğini arz ederim." in out["yazi_taslak_md"]  # görüş kapanışı

    async def test_mock_modda_statik_yol_birebir(self, monkeypatch):
        # Arrange — mock: plan None → EVRAK_TO_YAZI statik eşleme aynen (CI deterministik)
        from agents.nodes.yazi_taslak import yazi_taslak_node
        monkeypatch.setattr(ext, "get_llm", lambda: MockLLM())
        state = {"evrak_turu": "fatura", "bilgi_unsurlari": {"konu": "ödeme"},
                 "evrak_text": "fatura bedeli", "hedef_birim": "mali_strateji_sgb"}
        # Act
        out = await yazi_taslak_node(state)
        # Assert
        assert out["yazi_turu"] == "ust_yazi"          # statik iletim eşlemesi
        assert out["yazi_plan_notu"] == ""              # plan koşmadı
        assert "STRATEJİ GELİŞTİRME / MALİ İŞLER" in out["yazi_taslak_md"]  # m.14/2 BÜYÜK
