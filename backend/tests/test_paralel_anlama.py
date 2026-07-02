"""MADDE 14 — anlama fan-out testleri (siniflandir ∥ cikar paralel dalları).

PARALEL_ANLAMA=1 (varsayılan): START'tan siniflandir VE cikar'a fan-out, kanit_baglama'da
fan-in (cikar yalnız evrak_text okur — tür bağımlılığı yok; iki LLM çağrısı paralelleşir).
PARALEL_ANLAMA=0: seri baseline (START → siniflandir → cikar → kanit_baglama) BİREBİR.

Desen: build_graph() bayrağı modül attribute'undan çağrı anında okur → monkeypatch ile
iki topoloji de aynı süreçte test edilir (test_graph_topology.py CRAG deseni). Import-anı
ENV davranışı için ayrıca subprocess izolasyonu (test_kvkk_modu.py deseni). LLM_MODE=mock
(conftest) → deterministik fallback; iki modun sonucu alan bazında AYNI olmalı.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import agents.graph as graph_mod
from agents.graph import PIPELINE_NODES, build_graph
from agents.state import make_initial_state

_BACKEND = str(Path(__file__).resolve().parents[1])

# Sentetik evrak (CLAUDE.md §2 — sahte kişi, checksum'suz gerçek TCKN YOK).
_METIN = (
    "T.C. ANKARA VALİLİĞİ\n"
    "Sayı: E-12345678-622.03-4567\n"
    "Konu: Park aydınlatma talebi\n"
    "Mahalle parkına aydınlatma yapılmasını talep ederim. 12.05.2026\n"
    "Ad-Soyad: Ayşe Yılmaz\nAdres: Atatürk Cad. No:5\nimza"
)

# Deterministik karşılaştırma alanları (mock modda iki topolojide de AYNI olmalı).
# denetim_izi/sla gibi zaman-damgalı alanlar bilerek DIŞARIDA.
_KARSILASTIR = (
    "evrak_turu", "tur_confidence", "tur_reasoning", "bilgi_unsurlari",
    "eksik_alanlar", "ozet", "hedef_birim", "yazi_turu", "mevzuat_onerileri",
)


def _kenarlar(compiled) -> set[tuple[str, str]]:
    """Compiled grafın (source, target) kenar kümesi."""
    return {(e.source, e.target) for e in compiled.get_graph().edges}


class TestParalelTopoloji:
    """build_graph — bayrağa göre fan-out/seri kenarlar."""

    def test_paralel_acik_fanout_kenarlari(self, monkeypatch):
        # Arrange — fan-out açık
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — START her iki dala; seri siniflandir→cikar kenarı YOK; fan-in kanit_baglama
        assert ("__start__", "siniflandir") in edges
        assert ("__start__", "cikar") in edges
        assert ("siniflandir", "cikar") not in edges
        assert ("siniflandir", "kanit_baglama") in edges
        assert ("cikar", "kanit_baglama") in edges

    def test_paralel_kapali_seri_baseline_birebir(self, monkeypatch):
        # Arrange — bayrak kapalı → mevcut seri kenarlar birebir
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", False)
        # Act
        edges = _kenarlar(build_graph())
        # Assert — baseline zincir; START'tan cikar'a doğrudan kenar YOK
        assert ("__start__", "siniflandir") in edges
        assert ("siniflandir", "cikar") in edges
        assert ("cikar", "kanit_baglama") in edges
        assert ("__start__", "cikar") not in edges

    def test_pipeline_nodes_listesi_sabit(self, monkeypatch):
        # Arrange/Act — bayrak sıra ETİKETLERİNİ değiştirmez (/health + SSE start sözleşmesi)
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        acik = graph_mod._pipeline_nodes()
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", False)
        kapali = graph_mod._pipeline_nodes()
        # Assert — liste (topoloji değil) her iki modda birebir aynı
        assert acik == kapali == PIPELINE_NODES


class TestParalelUctanUca:
    """ainvoke (mock) — fan-out'ta tüm node'lar çalışır, sonuç seri ile eşdeğer."""

    async def test_paralel_acik_iki_dal_da_dolu(self, monkeypatch):
        # Arrange
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        g = build_graph()
        # Act
        out = await g.ainvoke(make_initial_state(_METIN))
        # Assert — iki dalın çıktısı da state'e fan-in olmuş
        assert out.get("evrak_turu")                       # siniflandir dalı
        assert out.get("bilgi_unsurlari")                  # cikar dalı (dict dolu)
        assert out.get("ozet") is not None                 # akış sonuna ulaşıldı
        assert "yazi_taslak_md" in out                     # Görev 2 de üretildi

    async def test_paralel_ve_seri_sonuc_alan_bazinda_ayni(self, monkeypatch):
        # Arrange/Act — aynı metin iki toplolojide (mock → deterministik)
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", False)
        seri = await build_graph().ainvoke(make_initial_state(_METIN))
        monkeypatch.setattr(graph_mod, "PARALEL_ANLAMA", True)
        paralel = await build_graph().ainvoke(make_initial_state(_METIN))
        # Assert — deterministik alanlar birebir aynı (fan-out davranışı DEĞİŞTİRMEZ)
        for alan in _KARSILASTIR:
            assert paralel.get(alan) == seri.get(alan), f"alan farklı: {alan}"


class TestParalelEnvSubprocess:
    """Import-anı ENV davranışı — taze süreçte iki mod da derlenir + uçtan uca koşar."""

    def _kos(self, bayrak: str) -> dict:
        kod = (
            "import os, json, asyncio;"
            f"os.environ['PARALEL_ANLAMA']='{bayrak}';"
            "os.environ['LLM_MODE']='mock';"
            "from agents.graph import build_graph;"
            "from agents.state import make_initial_state;"
            "g = build_graph();"
            "edges = {(e.source, e.target) for e in g.get_graph().edges};"
            "out = asyncio.run(g.ainvoke(make_initial_state("
            "'Konu: park aydinlatma talebi. Talep ederim. Ad-Soyad: Ayse Yilmaz')));"
            "print(json.dumps({"
            "'start_cikar': ['__start__','cikar'] in [list(e) for e in edges],"
            "'seri_kenar': ['siniflandir','cikar'] in [list(e) for e in edges],"
            "'evrak_turu': bool(out.get('evrak_turu')),"
            "'unsur': bool(out.get('bilgi_unsurlari'))}))"
        )
        env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
        # encoding açıkça UTF-8: Windows'ta text=True locale (cp1254) ile çözer ve
        # çocuğun Türkçe structlog çıktısında UnicodeDecodeError'a düşer.
        sonuc = subprocess.run([sys.executable, "-c", kod], capture_output=True,
                               text=True, encoding="utf-8", errors="replace",
                               cwd=_BACKEND, env=env, timeout=120)
        assert sonuc.returncode == 0, sonuc.stderr[-800:]
        return json.loads(sonuc.stdout.strip().splitlines()[-1])

    def test_env_paralel_1_fanout(self):
        # Act — taze süreç, bayrak açık
        r = self._kos("1")
        # Assert — fan-out kenarı var, seri kenar yok; iki dal da dolu
        assert r["start_cikar"] and not r["seri_kenar"]
        assert r["evrak_turu"] and r["unsur"]

    def test_env_paralel_0_seri(self):
        # Act — taze süreç, bayrak kapalı
        r = self._kos("0")
        # Assert — seri baseline; iki alan yine dolu
        assert r["seri_kenar"] and not r["start_cikar"]
        assert r["evrak_turu"] and r["unsur"]
