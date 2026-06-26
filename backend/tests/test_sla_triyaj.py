"""sla_triyaj node testleri — yasal süre / SLA triyaj (deterministik).

compute_sla SAF (bugün enjekte edilir) → tarih bağımsız, tekrar-üretilebilir.
Süreler mevzuat-dayanaklı (3071 m.7 / 4982 m.11); tanımsız tür → uydurma YOK.
AAA deseni.
"""

from __future__ import annotations

from datetime import date

from agents.nodes.sla_triyaj import compute_sla, sla_triyaj_node


def _son(metadata: dict) -> date:
    g, a, y = (int(x) for x in metadata["son_tarih"].split("."))
    return date(y, a, g)


class TestComputeSlaDilekce:
    """3071 m.7 → 30 takvim günü; bant geçişleri."""

    def test_normal_band(self):
        # Arrange + Act — 01.01 + 30g = 31.01; bugün 15.01 → 16 gün kala
        m = compute_sla("dilekce", "01.01.2026", date(2026, 1, 15))
        # Assert
        assert m["durum"] == "NORMAL"
        assert m["son_tarih"] == "31.01.2026"
        assert m["kalan_gun"] == 16
        assert "3071" in m["mevzuat"]

    def test_kritik_band_son_iki_gun(self):
        # Arrange + Act — bugün 30.01 → son tarihe 1 gün kala (≤2 = KRİTİK)
        m = compute_sla("dilekce", "01.01.2026", date(2026, 1, 30))
        # Assert
        assert m["durum"] == "KRITIK"
        assert m["kalan_gun"] == 1

    def test_gecikmis_band_sure_doldu(self):
        # Arrange + Act — bugün 10.02 → son tarih (31.01) geçti
        m = compute_sla("dilekce", "01.01.2026", date(2026, 2, 10))
        # Assert
        assert m["durum"] == "GECIKMIS"
        assert m["kalan_gun"] < 0
        assert "GECİKMİŞ" in m["etiket"]


class TestComputeSlaBilgiEdinme:
    """4982 m.11 → 15 İŞ GÜNÜ (hafta sonu atlanır, takvim gününden uzun)."""

    def test_is_gunu_hafta_sonu_atlar(self):
        # Arrange + Act
        m = compute_sla("bilgi_edinme", "01.06.2026", date(2026, 6, 1))
        # Assert — 15 iş günü ≈ 21 takvim günü (≥15'ten kesin fazla)
        assert "iş günü" in m["sure"]
        assert (_son(m) - date(2026, 6, 1)).days >= 15
        assert _son(m).weekday() < 5  # son tarih bir iş günü
        assert "4982" in m["mevzuat"]


class TestComputeSlaSinirDurumlar:
    def test_tanimsiz_tur_uydurma_yok(self):
        # Arrange + Act — kurum→kurum yazıda yasal vatandaş-süresi YOK
        m = compute_sla("ust_yazi", "01.01.2026", date(2026, 1, 15))
        # Assert — süre uydurulmaz
        assert m["durum"] == "tanimsiz"
        assert m["son_tarih"] is None
        assert m["kalan_gun"] is None

    def test_tarih_okunamazsa_dogrula(self):
        # Arrange + Act — süre bilinir ama evrak tarihi yok
        m = compute_sla("dilekce", "tarih burada yok", date(2026, 1, 15))
        # Assert
        assert m["durum"] == "tarih_yok"
        assert m["son_tarih"] is None
        assert "3071" in m["mevzuat"]  # dayanak yine de gösterilir

    def test_gecersiz_tarih_31_subat_none(self):
        # Arrange + Act — 31.02 geçersiz → parse None → tarih_yok
        m = compute_sla("dilekce", "31.02.2026", date(2026, 1, 15))
        # Assert
        assert m["durum"] == "tarih_yok"


class TestSlaTriyajNode:
    async def test_node_sla_metadata_doner(self):
        # Arrange — çok eski tarih → bugün (2026) itibarıyla kesin gecikmiş
        state = {"evrak_turu": "dilekce", "bilgi_unsurlari": {"tarih": "01.01.2020"}}
        # Act
        out = await sla_triyaj_node(state)
        # Assert
        assert "sla_metadata" in out
        assert out["sla_metadata"]["durum"] == "GECIKMIS"

    async def test_node_tanimsiz_turde_patlamaz(self):
        # Arrange — tür tabloda yok + tarih yok
        state = {"evrak_turu": "tutanak", "bilgi_unsurlari": {}}
        # Act
        out = await sla_triyaj_node(state)
        # Assert — additive, asla patlamaz
        assert out["sla_metadata"]["durum"] == "tanimsiz"
