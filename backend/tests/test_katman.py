"""Katman (superstep) hesabı — hangi node'lar GERÇEKTEN aynı anda koşar.

Neden var: canlı akış ekranı 15 adımı düz 01→15 dizisi olarak gösteriyordu. Gerçek graf
bir DAG'dır ve üç yerde dallanır; düz liste hem paralelliği gizliyor hem de sırayı YANLIŞ
veriyordu (liste `eksik_tespit`i `decompose`tan önce sayar, oysa graf `decompose →
eksik_tespit` koşar). Katman haritası DERLENMİŞ GRAFTAN türetilir — elle tutulan bir kopya
olmadığı için ENV bayrakları topolojiyi değiştirdiğinde UI'ın iddiası kendiliğinden düzelir.

LangGraph bariyer semantiği: bir node TÜM öncülleri bitince koşar → katman = başlangıçtan
EN UZUN yol. Aynı katmandaki node'lar eşzamanlıdır.
"""

from __future__ import annotations

from typing import ClassVar

import pytest

import agents.graph as graph_mod
from agents.graph import build_graph, pipeline_katmanlari
from agents.katman import BASLANGIC, gruplar, katmanlar
from api.routes.process_doc import _get_hitl_graph, katman_haritasi


class TestKatmanSafFonksiyon:
    """katmanlar() — kenar listesinden superstep indeksi (LangGraph'tan bağımsız, saf)."""

    def test_duz_zincir_artan_katman(self):
        # Arrange — a → b → c
        kenarlar = [(BASLANGIC, "a"), ("a", "b"), ("b", "c")]
        # Act
        k = katmanlar(kenarlar)
        # Assert
        assert k == {"a": 1, "b": 2, "c": 3}

    def test_elmas_dallanma_ayni_katman(self):
        # Arrange — a ∥ b, ikisi de c'de birleşir
        kenarlar = [(BASLANGIC, "a"), (BASLANGIC, "b"), ("a", "c"), ("b", "c")]
        # Act
        k = katmanlar(kenarlar)
        # Assert — a ve b eşzamanlı; c ikisini de bekler
        assert k["a"] == k["b"] == 1
        assert k["c"] == 2

    def test_dengesiz_dal_en_uzun_yolu_alir(self):
        # Arrange — kısa dal (a→d) ile uzun dal (b→c→d); bariyer en uzunu bekler
        kenarlar = [(BASLANGIC, "a"), (BASLANGIC, "b"), ("b", "c"), ("a", "d"), ("c", "d")]
        # Act
        k = katmanlar(kenarlar)
        # Assert — d, kısa dalın 2'sine DEĞİL uzun dalın 3'üne oturur
        assert k["d"] == 3

    def test_bitis_dugumu_haritada_yok(self):
        # Arrange/Act
        k = katmanlar([(BASLANGIC, "a"), ("a", "__end__")])
        # Assert — __end__ bir iş adımı değil, UI'a sızmamalı
        assert "__end__" not in k and "a" in k

    def test_dongu_sessizce_gecmez(self):
        # Arrange — a → b → a (graf hatası); sessiz yanlış katman ÜRETİLMEMELİ
        kenarlar = [(BASLANGIC, "a"), ("a", "b"), ("b", "a")]
        # Act / Assert
        with pytest.raises(ValueError, match="döngü"):
            katmanlar(kenarlar)

    def test_baslangictan_erisilmeyen_dugum_sessizce_dusmez(self):
        # Arrange — "kopuk" hiçbir yerden beslenmiyor
        kenarlar = [(BASLANGIC, "a"), ("kopuk", "b"), ("a", "b")]
        # Act / Assert — erişilemeyen dal = topoloji hatası, sessiz düşme değil
        with pytest.raises(ValueError, match="döngü|erişilemeyen"):
            katmanlar(kenarlar)


class TestPipelineKatmanlariGercekGraf:
    """pipeline_katmanlari(build_graph()) — varsayılan ENV'de ölçülen eşzamanlılık."""

    def test_siniflandir_ve_cikar_ayni_katman(self, monkeypatch):
        # Arrange — anlama fan-out'u açık
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert — START'tan iki dal: eşzamanlı
        assert k["siniflandir"] == k["cikar"]

    def test_uclu_danisma_dali_ayni_katman(self, monkeypatch):
        # Arrange — triyaj fan-out'u açık (varsayılan)
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", True)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert — eksik/mevzuat/özet ÜÇÜ birden eşzamanlı (ekran bunu seri gösteriyordu)
        assert k["eksik_tespit"] == k["mevzuat_oner"] == k["ozetle"]

    def test_decompose_eksik_tespitten_once_kosar(self, monkeypatch):
        # Arrange — düz PIPELINE_NODES listesi bunun TERSİNİ söylüyor (ekran sırası hatası)
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", True)
        monkeypatch.setattr(graph_mod, "DECOMPOSE_ENABLED", True)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert — graf gerçeği: decompose ÖNCE
        assert k["decompose"] < k["eksik_tespit"]

    def test_kapanis_fanout_arsiv_risk_esazamanli(self, monkeypatch):
        # Arrange — kapanış fan-out'u + risk bandı açık
        monkeypatch.setattr(graph_mod, "PARALEL_KAPANIS", True)
        monkeypatch.setattr(graph_mod, "RISK_GUARD_ENABLED", True)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert — arsiv, risk_guard'ı beklemez
        assert k["arsiv"] == k["risk_guard"]
        assert k["sla_triyaj"] > k["arsiv"]          # bariyer ikisini de bekler

    def test_seri_modda_paralellik_iddiasi_kaybolur(self, monkeypatch):
        # Arrange — fan-out'lar KAPALI: harita elle yazılsaydı burada yalan söylerdi
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", False)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", False)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert — seri zincir: siniflandir → cikar
        assert k["siniflandir"] < k["cikar"]

    def test_gorunur_her_node_katman_alir(self, monkeypatch):
        # Arrange — SSE'nin gönderdiği sıra etiketlerinin TAMAMI haritada olmalı,
        # yoksa UI'da katmansız (dolayısıyla sırasız) düğüm kalır.
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", True)
        # Act
        k = pipeline_katmanlari(build_graph())
        # Assert
        eksik = [n for n in graph_mod._pipeline_nodes() if n not in k]
        assert not eksik, f"katmansız node: {eksik}"

    def test_gruplar_calisma_sirasinda_ve_esazamanli_bloklu(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", True)
        k = pipeline_katmanlari(build_graph())
        # Act — UI'ın çizeceği bloklar
        bloklar = gruplar(k, graph_mod._pipeline_nodes())
        duz = [ad for blok in bloklar for ad in blok]
        # Assert — hiçbir node kaybolmaz, sıra katman-artan, üçlü danışma bloğu tek grup
        assert sorted(duz) == sorted(graph_mod._pipeline_nodes())
        assert [k[b[0]] for b in bloklar] == sorted(k[b[0]] for b in bloklar)
        assert {"eksik_tespit", "mevzuat_oner", "ozetle"} in [set(b) for b in bloklar]

    def test_katman_sirasi_graf_kenarlariyla_tutarli(self, monkeypatch):
        # Arrange — genel değişmez: HER kenar için katman(kaynak) < katman(hedef).
        # Bu, haritanın grafla uyuşmazlık ÜRETEMEYECEĞİNİN kanıtıdır.
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        monkeypatch.setattr(graph_mod, "PARALEL_TRIYAJ", True)
        g = build_graph()
        k = pipeline_katmanlari(g)
        # Act / Assert
        for e in g.get_graph().edges:
            if e.source in k and e.target in k:
                assert k[e.source] < k[e.target], f"{e.source} → {e.target} katman ihlali"


class TestSseKatmanSozlesmesi:
    """SSE `start` yükü + frontend yedek haritasının çapası.

    Frontend, SSE'siz örnek (JSON) yolunda kendi VARSAYILAN_KATMAN sabitini kullanır
    (`src/lib/akisKatman.js`). Burada varsayılan ENV haritası ÇİVİLENİR: topoloji
    değişirse bu test kırılır ve o sabitin güncellenmesi gerektiğini söyler. Diller
    ayrı olduğu için tek çapraz-dil emniyet kemeri budur.
    """

    VARSAYILAN: ClassVar[dict[str, int]] = {
        "oku": 0, "siniflandir": 1, "cikar": 1, "kanit_baglama": 2, "decompose": 3,
        "eksik_tespit": 4, "mevzuat_oner": 4, "ozetle": 4, "route_birim": 5,
        "yazi_taslak": 6, "verify": 7, "risk_guard": 8, "arsiv": 8, "sla_triyaj": 9,
        "denetim_izi": 10, "finalize": 11,
    }

    def test_oku_grafi_onceler(self):
        # Arrange / Act — oku graf ÖNCESİ (route'ta) koşar
        h = katman_haritasi(_get_hitl_graph())
        # Assert — 0. katman; graf node'larının hepsi ondan sonra
        assert h["oku"] == 0
        assert min(v for a, v in h.items() if a != "oku") == 1

    def test_gizli_yardimci_node_sizmaz(self):
        # Arrange / Act
        h = katman_haritasi(_get_hitl_graph())
        # Assert — servis_birim grafta var ama UI sözleşmesinde yok
        assert "servis_birim" not in h
        assert "__start__" not in h and "__end__" not in h

    def test_varsayilan_env_haritasi_civili(self):
        # Arrange / Act — süreç varsayılan ENV ile ayağa kalkar (conftest LLM_MODE=mock)
        h = katman_haritasi(_get_hitl_graph())
        # Assert — frontend yedek sabitiyle BİREBİR; kırılırsa akisKatman.js güncellenmeli
        assert h == self.VARSAYILAN, (
            "topoloji değişti → frontend/src/lib/akisKatman.js VARSAYILAN_KATMAN güncellenmeli"
        )

    def test_katmanlanamayan_graf_akisi_dusurmez(self):
        # Arrange — get_graph patlayan sahte graf (topoloji hatası benzetimi)
        class _Bozuk:
            def get_graph(self):
                raise RuntimeError("bozuk topoloji")
        # Act — istisna YUKARI SIZMAMALI (SSE akışı ölmemeli)
        h = katman_haritasi(_Bozuk())
        # Assert — boş harita → UI düz listeye döner (zarif düşüş)
        assert h == {}
