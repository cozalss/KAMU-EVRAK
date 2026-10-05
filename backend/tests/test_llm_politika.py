"""Merkezi LLM politikası (agents.llm_politika + _llm_extract + llm_iz + graph._zamanli_node).

Teşhis 2026-10-05 "LLM altyapısının dayanıklılığı ve hızı": bütçe/düşünme/kesik davranışı
çağrı noktalarına dağılmıştı; kesilme yalnız bir node'da kurtarılıyordu ve kimse görmüyordu.
Bu testler sözleşmeyi sabitler:
  · her graf node'u bir profile çözülür (graf içinde politikasız çağrı yok),
  · profil verilmeyen çağrı koşan node'un profilini alır; AÇIK parametre profilden önceliklidir,
  · kesik cevap TEK kez düşünmesiz + 2× bütçeyle kurtarılır, olmazsa yedek,
  · llm_text yarım metni asla tam metin gibi döndürmez,
  · her çağrı içeriksiz bir iz bırakır ve iz state'e `llm_izleri` olarak yazılır,
  · doğrudan `.chat(` çağrısı yalnız merkezde (ve birleştirmede taşınacak bilinen yerlerde).
"""
from __future__ import annotations

import ast
import warnings
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from agents import config, llm_iz, llm_politika
from agents.graph import _zamanli_node, build_graph
from agents.llm_politika import NODE_PROFILI, PROFILLER, Dusunme, profil_al, profil_coz
from agents.nodes import _llm_extract
from agents.nodes._llm_extract import KesikMetin, llm_json, llm_text

BACKEND = Path(__file__).resolve().parents[1]


class _SahteLLM:
    """Gerçek istemci gibi davranan (MockLLM değil), sıralı cevap veren sahte."""

    model = "deepseek-v4-flash"

    def __init__(self, *cevaplar: tuple[str, str]) -> None:
        self.cevaplar = list(cevaplar)
        self.cagrilar: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> Any:
        self.cagrilar.append(kwargs)
        icerik, bitis = self.cevaplar[min(len(self.cagrilar), len(self.cevaplar)) - 1]
        return SimpleNamespace(content=icerik, finish_reason=bitis, tokens_in=10,
                               tokens_out=5, raw={"usage": {"completion_tokens_details": {
                                   "reasoning_tokens": 3}}})


@pytest.fixture(autouse=True)
def _ortam(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "LLM_CACHE_ENABLED", False)
    monkeypatch.setattr(config, "LLM_JSON_RETRY", True)
    monkeypatch.setattr(config, "LLM_DUSUNME_CIKARIMDA_KAPALI", True)
    monkeypatch.delenv("LLM_DUSUNME_ACIK_NODELAR", raising=False)
    monkeypatch.delenv("LLM_DUSUNME_KAPALI_NODELAR", raising=False)


def _bagla(monkeypatch: pytest.MonkeyPatch, llm: _SahteLLM) -> None:
    monkeypatch.setattr(_llm_extract, "get_llm", lambda: llm)
    monkeypatch.setattr(_llm_extract, "real_llm", lambda: llm)


# --- Tablo bütünlüğü ------------------------------------------------------------------

def test_her_graf_nodeu_bir_profile_cozulur() -> None:
    nodelar = set(build_graph().get_graph().nodes) - {"__start__", "__end__"}
    for ad in nodelar:
        assert profil_coz(node=ad) is not None, ad
    for ad in NODE_PROFILI.values():
        assert ad in PROFILLER, f"NODE_PROFILI bilinmeyen profile işaret ediyor: {ad}"


def test_gorev_listesindeki_tum_isler_tabloda() -> None:
    for ad in ("route_ajan", "yazi_plan", "decompose", "siniflandir", "cikar", "ozetle",
               "eksik_tespit", "servis_birim", "mevzuat_dogrula", "siniflandir_eskalasyon"):
        assert ad in PROFILLER


def test_acik_dusunme_olcum_gerekcesi_tasir() -> None:
    for p in PROFILLER.values():
        if p.dusunme is Dusunme.ACIK:
            assert len(p.gerekce) > 40, f"{p.ad}: ACIK düşünme ölçüm gerekçesiz"


def test_varsayilan_dusunme_kapali_ve_env_ile_acilir(monkeypatch: pytest.MonkeyPatch) -> None:
    assert profil_al("route_ajan").dusunme_kapali
    monkeypatch.setenv("LLM_DUSUNME_ACIK_NODELAR", "route_ajan")
    assert not profil_al("route_ajan").dusunme_kapali


def test_eski_bayrak_geriye_uyumlu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "LLM_DUSUNME_CIKARIMDA_KAPALI", False)
    assert not profil_al("cikar").dusunme_kapali


def test_bilinmeyen_profil_sessiz_gecmez() -> None:
    with pytest.raises(KeyError):
        llm_politika.profil_al("yok_boyle_profil")


# --- Merkezi çözüm + öncelik ------------------------------------------------------------

@pytest.mark.asyncio
async def test_profilsiz_cagri_kosan_nodeun_profilini_alir(monkeypatch) -> None:
    llm = _SahteLLM(('{"a": 1}', "stop"))
    _bagla(monkeypatch, llm)
    with llm_iz.node_kapsami("route_birim") as izler:
        assert await llm_json("s", "u") == {"a": 1}
    assert llm.cagrilar[0]["max_tokens"] == PROFILLER["route_ajan"].cevap_butcesi
    assert llm.cagrilar[0].get("dusunme_kapali") is True
    assert izler[0]["node"] == "route_birim" and izler[0]["profil"] == "route_ajan"


@pytest.mark.asyncio
async def test_acik_parametre_profilden_onceliklidir(monkeypatch) -> None:
    llm = _SahteLLM(('{"a": 1}', "stop"))
    _bagla(monkeypatch, llm)
    with llm_iz.node_kapsami("cikar"):
        await llm_json("s", "u", max_tokens=123, dusunme_kapali=False)
    assert llm.cagrilar[0]["max_tokens"] == 123 + config.LLM_DUSUNME_MARJI
    assert "dusunme_kapali" not in llm.cagrilar[0]


# --- Kesilme kurtarma -------------------------------------------------------------------

@pytest.mark.asyncio
async def test_kesik_json_tek_kez_dusunmesiz_2x_kurtarilir_ve_izlenir(monkeypatch) -> None:
    llm = _SahteLLM(('{"birim": "yar', "length"), ('{"birim": "Yazı İşleri"}', "stop"))
    _bagla(monkeypatch, llm)
    with llm_iz.node_kapsami("yazi_taslak") as izler:
        sonuc = await llm_json("s", "u", gorev="yazi_plan")
    assert sonuc == {"birim": "Yazı İşleri"}
    assert llm.cagrilar[1]["max_tokens"] == 2 * PROFILLER["yazi_plan"].cevap_butcesi
    assert llm.cagrilar[1]["dusunme_kapali"] is True
    iz = izler[0]
    assert iz["kesik"] and iz["kurtarildi"] and not iz["yedege_dustu"]
    assert iz["deneme"] == 2 and iz["tokens_out"] == 10 and iz["reasoning_tokens"] == 6
    assert set(iz) <= llm_iz.IZ_ALANLARI, "iz kaydı içerik taşımamalı"


@pytest.mark.asyncio
async def test_finish_reason_soylemese_de_kapanmamis_json_kesik_sayilir(monkeypatch) -> None:
    llm = _SahteLLM(('{"a": [1, 2', "stop"), ('{"a": [1, 2]}', "stop"))
    _bagla(monkeypatch, llm)
    assert await llm_json("s", "u", profil="cikar") == {"a": [1, 2]}
    assert llm.cagrilar[1].get("dusunme_kapali") is True


@pytest.mark.asyncio
async def test_kurtarma_da_kesilirse_yedege_duser(monkeypatch) -> None:
    llm = _SahteLLM(('{"a": "yar', "length"))
    _bagla(monkeypatch, llm)
    with llm_iz.node_kapsami("cikar") as izler:
        assert await llm_json("s", "u") is None
    assert len(llm.cagrilar) == 2
    assert izler[0]["yedege_dustu"] and izler[0]["neden"] == "kesik"


@pytest.mark.asyncio
async def test_llm_text_yarim_metni_tam_gibi_dondurmez(monkeypatch) -> None:
    llm = _SahteLLM(("Sayın Valilik, ilgi yazı ile", "length"))
    _bagla(monkeypatch, llm)
    assert await llm_text("s", "u", profil="yazi_govde") is None
    assert len(llm.cagrilar) == 2
    yarim = await llm_text("s", "u", profil="yazi_govde", kesik_kabul=True)
    assert isinstance(yarim, KesikMetin) and yarim.kesik


@pytest.mark.asyncio
async def test_llm_text_kesik_kurtarilinca_tam_metin(monkeypatch) -> None:
    llm = _SahteLLM(("yarım", "length"), ("Tam gövde metni.", "stop"))
    _bagla(monkeypatch, llm)
    txt = await llm_text("s", "u", profil="yazi_govde")
    assert txt == "Tam gövde metni." and not getattr(txt, "kesik", False)


@pytest.mark.asyncio
async def test_eskalasyon_merkezi_katmandan_ve_dusunme_marjiyla(monkeypatch) -> None:
    from agents.nodes import siniflandir
    llm = _SahteLLM(('{"evrak_turu": "dilekce", "confidence": 0.9, "reasoning": "x"}', "stop"))
    monkeypatch.setattr(siniflandir, "get_llm_for_model", lambda m: llm)
    await siniflandir._eskalasyon_ikinci_gorus("metin")
    p = PROFILLER["siniflandir_eskalasyon"]
    assert llm.cagrilar[0]["max_tokens"] == p.cevap_butcesi + (p.dusunme_marji or 0)


# --- Graf sarmalayıcısı -----------------------------------------------------------------

@pytest.mark.asyncio
async def test_zamanli_node_izleri_statee_yazar(monkeypatch) -> None:
    llm = _SahteLLM(('{"a": 1}', "stop"))
    _bagla(monkeypatch, llm)

    async def _node(state: dict[str, Any]) -> dict[str, Any]:
        await llm_json("s", "u")
        return {"x": 1}

    async def _bos(state: dict[str, Any]) -> dict[str, Any]:
        return {"y": 2}

    out = await _zamanli_node("ozetle", _node)({})
    assert out["x"] == 1 and out["llm_izleri"][0]["profil"] == "ozetle"
    assert "llm_izleri" not in await _zamanli_node("sla_triyaj", _bos)({})


# --- Doğrudan .chat( envanteri ----------------------------------------------------------

# Akışların sahip olduğu dosyalar — birleştirmede merkezi katmana taşınacak.
BIRLESMEDE_TASINACAK = frozenset({
    "yazi/yazi_render.py", "retrieval/hyde.py", "retrieval/query_rewrite.py",
    "retrieval/multi_query.py",
})
MERKEZ = frozenset({"agents/nodes/_llm_extract.py", "agents/llm.py"})


def _dogrudan_chat_cagiranlar() -> set[str]:
    bulunan: set[str] = set()
    for yol in BACKEND.rglob("*.py"):
        rel = yol.relative_to(BACKEND).as_posix()
        if rel.startswith((".venv/", "tests/")) or "/." in rel:
            continue
        with warnings.catch_warnings():  # başka dosyadaki kaçış uyarısı bu testin işi değil
            warnings.simplefilter("ignore", SyntaxWarning)
            warnings.simplefilter("ignore", DeprecationWarning)
            agac = ast.parse(yol.read_text(encoding="utf-8-sig"))
        for d in ast.walk(agac):
            if (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                    and d.func.attr == "chat"):
                bulunan.add(rel)
    return bulunan - MERKEZ


def test_dogrudan_chat_yalniz_bilinen_istisnalarda() -> None:
    fazla = _dogrudan_chat_cagiranlar() - BIRLESMEDE_TASINACAK
    assert not fazla, f"merkezi katmanı (llm_json/llm_text) atlayan çağrı: {sorted(fazla)}"
