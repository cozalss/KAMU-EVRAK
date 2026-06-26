"""risk_guard testleri — risk bandı (trafik ışığı) + koşullu HITL (Görev 2 yenilikçilik).

compute_risk deterministik bant ataması (yeşil/sarı/kırmızı) + graph._risk_route koşullu
yönlendirme + uçtan-uca koşullu HITL (sarı/kırmızı dur, yeşil otomatik geç). Ağ/LLM yok.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agents import graph as gmod
from agents.nodes import onay_kapisi as okmod
from agents.nodes import risk_guard as rgmod
from agents.nodes.risk_guard import compute_risk, risk_guard_node
from agents.state import make_initial_state

# Temiz taslak (uydurma yok, [DOĞRULA] yok) — yeşil için.
_TEMIZ = "T.C. Sayı: 1 Konu: x. Gereğini arz ederim. Yetkili İmza"


def _risk(verify_uyari=None, *, format_uyumlu=True, eksik=None, conf=0.9,
          turu="dilekce", taslak=_TEMIZ):
    return compute_risk(verify_uyari or [], format_uyumlu=format_uyumlu,
                        eksik_alanlar=eksik or [], tur_confidence=conf,
                        evrak_turu=turu, taslak=taslak)


# ---------------------------------------------------------------------------
# compute_risk — bant ataması (deterministik)
# ---------------------------------------------------------------------------


class TestComputeRiskBant:
    """Trafik ışığı bandı verify sinyallerinden doğru türetilir."""

    def test_temiz_yesil(self):
        assert _risk()["bant"] == "yesil"

    def test_uydurma_kirmizi(self):
        # verify uydurma sinyali ("kaynak evrakta yok") → KIRMIZI
        u = ["Taslaktaki '99.99.9999' tarihi kaynak evrakta yok (doğrulayın)."]
        assert _risk(u)["bant"] == "kirmizi"

    def test_eksik_bolum_sari(self):
        # format eksik bölüm → SARI
        assert _risk(["Eksik bölüm: imza"])["bant"] == "sari"

    def test_dogrula_isareti_sari(self):
        # taslakta [DOĞRULA] → SARI
        assert _risk(taslak="Konu x [DOĞRULA: madde] arz ederim")["bant"] == "sari"

    def test_dusuk_guven_sari(self):
        assert _risk(conf=0.3)["bant"] == "sari"

    def test_belirsiz_tur_sari(self):
        assert _risk(turu="belirsiz")["bant"] == "sari"

    def test_eksik_zorunlu_alan_sari(self):
        assert _risk(eksik=["imza", "tarih"])["bant"] == "sari"

    def test_uydurma_eksikten_baskin(self):
        # hem uydurma hem eksik → KIRMIZI (uydurma baskın)
        u = ["Taslaktaki '5' sayısı kaynak evrakta yok (doğrulayın).", "Eksik bölüm: imza"]
        assert _risk(u)["bant"] == "kirmizi"

    def test_cikti_anahtarlari_sabit(self):
        # frontend RiskBandCard ile eşleşen SABİT anahtarlar
        assert set(_risk()) == {"bant", "skor", "gerekceler", "oneri"}
        assert isinstance(_risk()["gerekceler"], list)


# ---------------------------------------------------------------------------
# graph._risk_route — koşullu yönlendirme (yeşil→geç, sarı/kırmızı→onay)
# ---------------------------------------------------------------------------


class TestRiskRoute:
    """Yeşil otomatik geçer (arsiv); sarı/kırmızı memur onayına (onay_kapisi)."""

    def test_yesil_arsive_gecer(self):
        assert gmod._risk_route({"risk_metadata": {"bant": "yesil"}}) == "arsiv"

    def test_sari_onaya_duser(self):
        assert gmod._risk_route({"risk_metadata": {"bant": "sari"}}) == "onay_kapisi"

    def test_kirmizi_onaya_duser(self):
        assert gmod._risk_route({"risk_metadata": {"bant": "kirmizi"}}) == "onay_kapisi"

    def test_bant_yoksa_guvenli_gecer(self):
        # risk yoksa varsayılan güvenli (arsiv) — akış kilitlenmez
        assert gmod._risk_route({}) == "arsiv"


# ---------------------------------------------------------------------------
# risk_guard_node — çıktı sözleşmesi
# ---------------------------------------------------------------------------


class TestRiskGuardNode:
    async def test_node_risk_metadata_doner(self):
        sonuc = await risk_guard_node({"verify_uyari": [], "yazi_taslak_md": _TEMIZ,
                                       "evrak_turu": "dilekce", "tur_confidence": 0.9})
        assert "risk_metadata" in sonuc
        assert sonuc["risk_metadata"]["bant"] in {"yesil", "sari", "kirmizi"}


# ---------------------------------------------------------------------------
# Koşullu HITL (uçtan-uca) — sarı/kırmızı dur, yeşil otomatik geç
# ---------------------------------------------------------------------------


def _kosullu_hitl_graph(monkeypatch):
    # RISK_GUARD + HITL birlikte açık → koşullu (akıllı) onay
    monkeypatch.setattr(gmod, "HITL_ENABLED", True)
    monkeypatch.setattr(gmod, "RISK_GUARD_ENABLED", True)
    monkeypatch.setattr(okmod, "HITL_ENABLED", True)
    return gmod.build_graph(checkpointer=InMemorySaver())


class TestKosulluHITL:
    """Risk bandına göre koşullu interrupt: yeşil geçer, sarı/kırmızı durur."""

    async def test_sari_memur_onayina_durur(self, monkeypatch):
        # Arrange — eksik alanlı evrak → SARI
        g = _kosullu_hitl_graph(monkeypatch)
        cfg = {"configurable": {"thread_id": "s"}}
        # Act
        out = await g.ainvoke(make_initial_state("Konu: izin. arz ederim."), cfg)
        # Assert — risk sarı → onay_kapisi'nde durdu, memur kararı bekleniyor
        assert (out.get("risk_metadata") or {}).get("bant") in {"sari", "kirmizi"}
        assert "__interrupt__" in out
        assert out["__interrupt__"][0].value["tip"] == "memur_onay"
        # interrupt risk bandını taşır (memur NEDEN durduğunu görür)
        assert out["__interrupt__"][0].value["risk_band"] in {"sari", "kirmizi"}

    async def test_yesil_otomatik_gecer(self, monkeypatch):
        # Arrange — compute_risk YEŞİL'e zorlanır → koşullu HITL durmamali
        g = _kosullu_hitl_graph(monkeypatch)
        monkeypatch.setattr(rgmod, "compute_risk", lambda *a, **k: {
            "bant": "yesil", "skor": 0.1, "gerekceler": ["temiz"], "oneri": "yayın-hazır"})
        cfg = {"configurable": {"thread_id": "y"}}
        # Act
        out = await g.ainvoke(make_initial_state("Konu: izin. arz ederim."), cfg)
        # Assert — yeşil → interrupt YOK, akış finalize'a kadar aktı (otomatik geçti)
        assert "__interrupt__" not in out
        assert out.get("bilgilendirme") or out.get("response")

    async def test_kirmizi_onaylanir_devam(self, monkeypatch):
        # Arrange — KIRMIZI'ya zorla, memur onaylasın → akış sürer
        g = _kosullu_hitl_graph(monkeypatch)
        monkeypatch.setattr(rgmod, "compute_risk", lambda *a, **k: {
            "bant": "kirmizi", "skor": 0.9, "gerekceler": ["uydurma şüphesi"], "oneri": "onay zorunlu"})
        cfg = {"configurable": {"thread_id": "k"}}
        await g.ainvoke(make_initial_state("Konu: izin. arz ederim."), cfg)
        # Act — memur onaylar
        final = await g.ainvoke(Command(resume={"secim": "onayla"}), cfg)
        # Assert — onaylandı VE akış arsiv→finalize'a kadar aktı (denetim izi + bilgilendirme)
        assert final["onay_durumu"] == "onaylandı"
        assert final.get("denetim_izi") and (final.get("bilgilendirme") or final.get("response"))


# ---------------------------------------------------------------------------
# Review düzeltme regresyonları — tur_confidence=0.0, PII maskeleme, verify↔risk sözleşmesi
# ---------------------------------------------------------------------------


class TestReviewRegresyon:
    def test_sifir_guven_sari_olur(self):
        # 0.0 güven "hiç güven yok" → SARI (falsy tuzağı: 0.0 yeşile düşmemeli)
        assert _risk(conf=0.0)["bant"] == "sari"

    async def test_gerekceler_pii_maskeli(self):
        # uydurma uyarısı TCKN-şekilli sayı içerirse → gerekçede ham TCKN GÖRÜNMEZ
        u = ["Taslaktaki '12345678950' sayısı kaynak evrakta yok (doğrulayın)."]
        sonuc = await risk_guard_node({"verify_uyari": u, "yazi_taslak_md": "x",
                                       "evrak_turu": "dilekce", "tur_confidence": 0.9})
        assert all("12345678950" not in g for g in sonuc["risk_metadata"]["gerekceler"])

    def test_verify_risk_sozlesmesi_uydurma(self):
        # verify_node'un ÜRETTİĞİ uydurma mesajı → risk_guard KIRMIZI eşlemeli (imza drift koruması)
        from agents.nodes.verify import _uydurma_veto
        uyarilar = _uydurma_veto("Yazımız 99.99.9999 tarihlidir.",
                                 {"evrak_text": "kaynak", "bilgi_unsurlari": {}})
        assert uyarilar  # verify gerçekten uydurma yakaladı
        assert _risk(uyarilar)["bant"] == "kirmizi"
