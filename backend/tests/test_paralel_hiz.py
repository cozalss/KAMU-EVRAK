"""Hız dalgası (config 15) testleri — triyaj/kapanış fan-out + çift-koşum bariyeri.

PARALEL_TRIYAJ / PARALEL_KAPANIS / YAZI_PLAN_PARALEL / VERIFY_PARALEL varsayılan AÇIK;
0 → baseline topoloji/davranış birebir. Mock modda (conftest LLM_MODE=mock) hız
bayrakları sonucu alan bazında DEĞİŞTİRMEZ (kalite sözleşmesi).

Bariyer regresyonu (2026-07-16 bulgusu): LangGraph'ta fan-in AYRI add_edge çağrılarıyla
kurulunca hedef "hepsi bitince bir kez" değil "her kaynak bitişinde bir kez" koşuyor —
dengesiz dallarda (CRAG açıkken ozetle 1 adım, mevzuat→crag 2 adım) route_birim + tüm
Görev-2 kuyruğu 2× koşuyordu (2× LLM maliyeti/süresi). Liste-formu add_edge([...], hedef)
bariyeri her node'u TEK koşturur; buradaki sayaç testi bunun kalıcı regresyon kilididir.

Desen: test_paralel_anlama.py (monkeypatch modül attribute + mock e2e eşdeğerlik).
"""

from __future__ import annotations

from collections import Counter

import agents.graph as graph_mod
import agents.nodes.route_birim as route_mod
from agents.graph import GIZLI_NODELAR, PIPELINE_NODES, build_graph
from agents.state import make_initial_state

# Sentetik evrak (CLAUDE.md §2 — sahte kişi, gerçek TCKN YOK).
_METIN = (
    "T.C. ANKARA VALİLİĞİ\n"
    "Sayı: E-12345678-622.03-4567\n"
    "Konu: Park aydınlatma talebi\n"
    "Mahalle parkına aydınlatma yapılmasını talep ederim. 12.05.2026\n"
    "Ad-Soyad: Ayşe Yılmaz\nAdres: Atatürk Cad. No:5\nimza"
)

# Deterministik karşılaştırma alanları (mock'ta hız bayraklarından bağımsız AYNI olmalı).
# denetim_izi zaman-damgalı → bilerek dışarıda; sla/arsiv aynı-gün deterministik.
_KARSILASTIR = (
    "evrak_turu", "bilgi_unsurlari", "eksik_alanlar", "clarify_questions", "ozet",
    "hedef_birim", "birim_alternatifleri", "servis_birimi", "yazi_turu",
    "mevzuat_onerileri", "verify_uyari", "risk_metadata", "arsiv_metadata",
    "bilgilendirme",
)


def _kenarlar(compiled) -> set[tuple[str, str]]:
    """Compiled grafın (source, target) kenar kümesi."""
    return {(e.source, e.target) for e in compiled.get_graph().edges}


def _bayraklar(monkeypatch, *, triyaj: bool, kapanis: bool) -> None:
    """Graf + route_birim modüllerinde hız bayraklarını birlikte ayarla (tutarlılık)."""
    monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", triyaj)
    monkeypatch.setattr(graph_mod, "PARALEL_KAPANIS", kapanis)
    monkeypatch.setattr(route_mod, "PARALEL_TRIYAJ", triyaj)


class TestTriyajTopoloji:
    """PARALEL_TRIYAJ — kanit/decompose tür beklemez; danışma çağrıları tek fan-out'ta."""

    def test_triyaj_acik_kenarlar(self, monkeypatch):
        # Arrange
        _bayraklar(monkeypatch, triyaj=True, kapanis=True)
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — kanit tür BEKLEMEZ; tür fan-in'i triyaj hedeflerinde; servis ayrı dal
        assert ("siniflandir", "kanit_baglama") not in edges
        assert ("cikar", "kanit_baglama") in edges
        assert ("siniflandir", "eksik_tespit") in edges
        assert ("decompose", "eksik_tespit") in edges
        assert ("decompose", "mevzuat_oner") in edges
        assert ("decompose", "ozetle") in edges
        assert ("__start__", "servis_birim") in edges
        assert ("servis_birim", "route_birim") in edges
        assert ("eksik_tespit", "route_birim") in edges

    def test_triyaj_kapali_baseline_birebir(self, monkeypatch):
        # Arrange — bayrak kapalı → bugünkü seri triyaj zinciri birebir
        _bayraklar(monkeypatch, triyaj=False, kapanis=True)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — eksik zincirde; servis_birim node'u grafta HİÇ YOK
        assert ("kanit_baglama", "eksik_tespit") in edges
        assert ("eksik_tespit", "decompose") in edges
        assert not any("servis_birim" in kenar for kenar in edges)

    def test_servis_birim_gizli_ve_listede_yok(self):
        # Assert — adım listesi (SSE start sözleşmesi) değişmedi; servis gizli kümede
        assert "servis_birim" in GIZLI_NODELAR
        assert "servis_birim" not in PIPELINE_NODES


class TestKapanisTopoloji:
    """PARALEL_KAPANIS — arsiv ∥ risk_guard; fan-in sla_triyaj; onay sla sonrası."""

    def test_kapanis_acik_arsiv_paralel(self, monkeypatch):
        # Arrange
        _bayraklar(monkeypatch, triyaj=True, kapanis=True)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — arsiv verify'dan dallanır, risk ile sla_triyaj'da birleşir
        assert ("verify", "arsiv") in edges
        assert ("arsiv", "sla_triyaj") in edges
        assert ("risk_guard", "sla_triyaj") in edges
        assert ("risk_guard", "arsiv") not in edges

    def test_kapanis_kapali_baseline_birebir(self, monkeypatch):
        # Arrange
        _bayraklar(monkeypatch, triyaj=True, kapanis=False)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — bugünkü seri kuyruk: risk → arsiv → sla
        assert ("risk_guard", "arsiv") in edges
        assert ("arsiv", "sla_triyaj") in edges
        assert ("verify", "arsiv") not in edges

    def test_kapanis_hitl_onay_sla_sonrasina_kayar(self, monkeypatch):
        # Arrange — HITL + kapanış birlikte
        monkeypatch.setattr(graph_mod, "HITL_ENABLED", True)
        monkeypatch.setattr(graph_mod, "PARALEL_KAPANIS", True)
        # Act
        nodes = graph_mod._pipeline_nodes()
        # Assert — sıra etiketi: onay artık sla'dan SONRA (fan-in'den sonra koşullu onay)
        assert nodes.index("onay_kapisi") > nodes.index("sla_triyaj")
        # Baseline'da (kapanış kapalı) eski yerinde: arsiv'den ÖNCE
        monkeypatch.setattr(graph_mod, "PARALEL_KAPANIS", False)
        nodes = graph_mod._pipeline_nodes()
        assert nodes.index("onay_kapisi") < nodes.index("arsiv")


class TestCiftKosumBariyeri:
    """Fan-in bariyeri — dengesiz dallarda (CRAG) her node TAM BİR KEZ koşmalı."""

    async def _node_sayaci(self) -> Counter:
        sayac: Counter = Counter()
        async for update in build_graph().astream(
                make_initial_state(_METIN), stream_mode="updates"):
            for node in update:
                sayac[node] += 1
        return sayac

    async def test_crag_acik_tum_nodelar_tek_kosum(self, monkeypatch):
        # Arrange — çift-koşumu tetikleyen eski senaryo: CRAG dengesiz dal + triyaj açık
        _bayraklar(monkeypatch, triyaj=True, kapanis=True)
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", True)
        # Act
        sayac = await self._node_sayaci()
        # Assert — regresyon kilidi: route_birim + Görev-2 kuyruğu 2× KOŞMAZ
        cift = {n: k for n, k in sayac.items() if k > 1}
        assert not cift, f"çift koşan node'lar: {cift}"
        assert sayac["route_birim"] == 1 and sayac["finalize"] == 1

    async def test_crag_acik_baseline_da_tek_kosum(self, monkeypatch):
        # Arrange — bayraklar kapalıyken de bariyer korunmalı (bug baseline'daydı)
        _bayraklar(monkeypatch, triyaj=False, kapanis=False)
        monkeypatch.setattr(graph_mod, "CRAG_ENABLED", True)
        # Act
        sayac = await self._node_sayaci()
        # Assert
        cift = {n: k for n, k in sayac.items() if k > 1}
        assert not cift, f"çift koşan node'lar: {cift}"


class TestHizEsdegerlik:
    """Mock e2e — hız bayrakları AÇIK vs KAPALI sonuç alan bazında AYNI (kalite sözleşmesi)."""

    async def test_acik_kapali_sonuc_alan_bazinda_ayni(self, monkeypatch):
        # Arrange/Act — baseline (kapalı)
        _bayraklar(monkeypatch, triyaj=False, kapanis=False)
        seri = await build_graph().ainvoke(make_initial_state(_METIN))
        # Arrange/Act — hız dalgası (açık)
        _bayraklar(monkeypatch, triyaj=True, kapanis=True)
        hizli = await build_graph().ainvoke(make_initial_state(_METIN))
        # Assert — deterministik alanlar birebir aynı (paralellik davranışı DEĞİŞTİRMEZ)
        for alan in _KARSILASTIR:
            assert hizli.get(alan) == seri.get(alan), f"alan farklı: {alan}"

    async def test_triyaj_acik_tum_dallar_dolu(self, monkeypatch):
        # Arrange
        _bayraklar(monkeypatch, triyaj=True, kapanis=True)
        # Act
        out = await build_graph().ainvoke(make_initial_state(_METIN))
        # Assert — paralel dalların hepsi state'e fan-in olmuş
        assert out.get("evrak_turu")
        assert out.get("eksik_alanlar") is not None
        assert out.get("ozet") is not None
        assert out.get("servis_birimi")            # ayrı dal (keyword fallback mock'ta)
        assert out.get("arsiv_metadata")           # kapanış paralel dalı
        assert out.get("sla_metadata")
        assert "yazi_taslak_md" in out


# Yazı-planı testlerinin ortak girdi state'i (statik EVRAK_TO_YAZI: dilekce → cevabi_yazi).
_PLAN_STATE = {
    "evrak_turu": "dilekce",
    "bilgi_unsurlari": {"konu": "Park aydınlatma talebi"},
    "evrak_text": _METIN,
    "hedef_birim": "basin_halkla_iliskiler_cimer",
}


class TestYaziPlanParalel:
    """YAZI_PLAN_PARALEL — plan ∥ gövde; tür değişirse gövde plan türüyle yeniden üretilir."""

    async def _kos(self, monkeypatch, plan_turu: str | None) -> tuple[dict, list[str]]:
        import agents.nodes.yazi_taslak as yt
        import yazi.yazi_plan as yp
        import yazi.yazi_render as yr

        monkeypatch.setattr(yt, "YAZI_PLAN_PARALEL", True)
        cagrilar: list[str] = []
        gercek_body = yr.build_body

        async def sahte_plan(turu, unsurlar, evrak_text, hedef_birim):
            if plan_turu is None:
                return None
            return {"yazi_turu": plan_turu, "muhatap": "", "gerekce": "test gerekçesi"}

        async def sahte_body(yazi_turu, unsurlar, evrak_text):
            cagrilar.append(yazi_turu)
            return await gercek_body(yazi_turu, unsurlar, evrak_text)

        monkeypatch.setattr(yp, "yazi_plani", sahte_plan)
        monkeypatch.setattr(yr, "build_body", sahte_body)
        out = await yt.yazi_taslak_node(dict(_PLAN_STATE))
        return out, cagrilar

    async def test_plan_farkli_tur_govde_yeniden_uretilir(self, monkeypatch):
        # Act — plan statik türden FARKLI tür seçti
        out, cagrilar = await self._kos(monkeypatch, "bilgilendirme")
        # Assert — çıktı plan türünde; gövde önce statik sonra plan türüyle (2 çağrı)
        assert out["yazi_turu"] == "bilgilendirme"
        assert out["yazi_plan_notu"] == "test gerekçesi"
        assert cagrilar == ["cevabi_yazi", "bilgilendirme"]

    async def test_plan_ayni_tur_tek_govde_cagrisi(self, monkeypatch):
        # Act — plan statik türü DOĞRULADI (tipik yol)
        out, cagrilar = await self._kos(monkeypatch, "cevabi_yazi")
        # Assert — gövde yeniden üretilmez (tek çağrı; ~1 çağrı süresi kazanılır)
        assert out["yazi_turu"] == "cevabi_yazi"
        assert cagrilar == ["cevabi_yazi"]

    async def test_plan_yok_statik_yol(self, monkeypatch):
        # Act — plan None (mock/hata) → statik tür, tek gövde
        out, cagrilar = await self._kos(monkeypatch, None)
        # Assert
        assert out["yazi_turu"] == "cevabi_yazi"
        assert cagrilar == ["cevabi_yazi"]


class TestVerifyParalel:
    """VERIFY_PARALEL — grounding ∥ lint zinciri; uyarı listesi seri yolla birebir."""

    async def test_paralel_ve_seri_ayni_uyarilar(self, monkeypatch):
        import agents.nodes.verify as vf

        async def sahte_grounding(taslak, state):
            return ["Taslaktaki iddia kaynak evrakta yok (LLM grounding): test iddiası"]

        monkeypatch.setattr(vf, "_grounding_iddialar", sahte_grounding)
        monkeypatch.setattr(vf, "VERIFY_GROUNDING_LLM", True)
        state = {
            "evrak_text": _METIN, "bilgi_unsurlari": {"konu": "Park aydınlatma talebi"},
            "yazi_turu": "cevabi_yazi",
            "yazi_taslak_md": ("T.C.\nKAMU KURUMU\nSayı : EBYS-TASLAK\n"
                               "Konu : Park aydınlatma talebi\n\nGereğini arz ederim.\nimza"),
        }
        # Act — seri
        monkeypatch.setattr(vf, "VERIFY_PARALEL", False)
        seri = await vf.verify_node(dict(state))
        # Act — paralel
        monkeypatch.setattr(vf, "VERIFY_PARALEL", True)
        paralel = await vf.verify_node(dict(state))
        # Assert — uyarı içerikleri/sırası birebir; grounding uyarısı taşındı
        assert paralel["verify_uyari"] == seri["verify_uyari"]
        assert any("LLM grounding" in u for u in paralel["verify_uyari"])
        assert paralel["lint_2646"] == seri["lint_2646"]
