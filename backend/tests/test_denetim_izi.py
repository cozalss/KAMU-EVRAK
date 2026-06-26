"""denetim_izi node testleri — tamper-evident SHA-256 hash-chain (deterministik).

Zincir kendi içinde tutarlıdır; bir halka sonradan değişirse dogrula_zincir KIRIK
adımı tespit eder. Stdlib hashlib — bağımlılıksız, deterministik. AAA deseni.
"""

from __future__ import annotations

import copy

from agents.nodes.denetim_izi import (
    _GENESIS,
    build_chain,
    denetim_izi_node,
    dogrula_zincir,
)

_STATE = {
    "evrak_turu": "dilekce",
    "tur_confidence": 0.82,
    "bilgi_unsurlari": {"konu": "yol çukuru", "tarih": "01.06.2026"},
    "eksik_alanlar": ["imza"],
    "mevzuat_onerileri": [{"baslik": "3071 dilekce hakki kanunu m.4"}],
    "ozet": "Yol çukuru tamiri talebi.",
    "hedef_birim": "ilgili_teknik_daire",
    "yazi_turu": "cevabi_yazi",
    "format_uyumlu": True,
    "verify_uyari": [],
    "arsiv_metadata": {"sdp_kodu": "010"},
    "sla_metadata": {"durum": "NORMAL"},
}


class TestBuildChain:
    def test_zincir_tum_adimlari_kapsar(self):
        # Arrange + Act
        zincir = build_chain(_STATE)
        # Assert — 10 denetim adımı, her biri hash + onceki taşır
        assert len(zincir) == 10
        for e in zincir:
            assert len(e["hash"]) == 64  # SHA-256 hex
            assert "onceki" in e

    def test_ilk_halka_genesis_baglar(self):
        # Arrange + Act
        zincir = build_chain(_STATE)
        # Assert — ilk halkanın öncekisi genesis; sonraki halkalar zincirlenir
        assert zincir[0]["onceki"] == _GENESIS
        assert zincir[1]["onceki"] == zincir[0]["hash"]

    def test_deterministik_ayni_state_ayni_zincir(self):
        # Arrange + Act — aynı girdi → aynı hash'ler (tekrar-üretilebilir)
        z1 = build_chain(_STATE)
        z2 = build_chain(copy.deepcopy(_STATE))
        # Assert
        assert [e["hash"] for e in z1] == [e["hash"] for e in z2]


class TestDogrulaZincir:
    def test_temiz_zincir_butun(self):
        # Arrange + Act
        butun, kirik = dogrula_zincir(build_chain(_STATE))
        # Assert — üretilen zincir kendi içinde tutarlı
        assert butun is True
        assert kirik == -1

    def test_sabote_edilen_halka_tespit_edilir(self):
        # Arrange — 4. halkanın verisini sonradan DEĞİŞTİR (tamper)
        zincir = build_chain(_STATE)
        zincir[3]["veri"] = {"sabote": "edildi"}
        # Act
        butun, kirik = dogrula_zincir(zincir)
        # Assert — bütünlük bozuldu, kırık adım tespit edildi
        assert butun is False
        assert kirik == 3

    def test_hash_degisirse_kirik(self):
        # Arrange — bir halkanın hash'ini boz
        zincir = build_chain(_STATE)
        zincir[0]["hash"] = "f" * 64
        # Act + Assert
        butun, kirik = dogrula_zincir(zincir)
        assert butun is False
        assert kirik == 0


class TestDenetimIziNode:
    async def test_node_denetim_izi_doner(self):
        # Arrange + Act
        out = await denetim_izi_node(_STATE)
        # Assert
        assert "denetim_izi" in out
        meta = out["denetim_izi"]
        assert meta["butunluk"] is True
        assert meta["adim_sayisi"] == 10
        assert len(meta["kok_hash"]) == 64
        assert meta["algoritma"] == "SHA-256 hash-chain"

    async def test_node_bos_state_patlamaz(self):
        # Arrange — eksik state (tüm alanlar None/boş) → additive, asla patlamaz
        out = await denetim_izi_node({})
        # Assert
        assert out["denetim_izi"]["butunluk"] is True
        assert out["denetim_izi"]["adim_sayisi"] == 10
