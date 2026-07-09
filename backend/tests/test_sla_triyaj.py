"""sla_triyaj node testleri — yasal süre / SLA triyaj (deterministik).

compute_sla SAF (bugün enjekte edilir) → tarih bağımsız, tekrar-üretilebilir.
Süreler mevzuat-dayanaklı (3071 m.7 / 4982 m.11); tanımsız tür → uydurma YOK.
AAA deseni.
"""

from __future__ import annotations

from datetime import date, timedelta

from agents.nodes.sla_triyaj import compute_sla, sla_triyaj_node
from agents.resmi_tatil import is_resmi_tatil


def _son(metadata: dict) -> date:
    g, a, y = (int(x) for x in metadata["son_tarih"].split("."))
    return date(y, a, g)


def _yalnız_hafta_gunu_son(baslangic: date, n: int) -> date:
    """Yalnız hafta sonu atlayan (tatil-DUYARSIZ) referans hesap — tatil etkisini kanıtlar."""
    cur, c = baslangic, 0
    while c < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            c += 1
    return cur


class TestComputeSlaDilekce:
    """3071 m.7 → 30 takvim günü; bant geçişleri."""

    def test_normal_band(self):
        # Arrange + Act — 01.01 + 30 takvim günü = 31.01 (Cmt) → son gün hafta tatili →
        # izleyen ilk iş günü 02.02 (2429 m.3). bugün 15.01 → 18 gün kala.
        m = compute_sla("dilekce", "01.01.2026", date(2026, 1, 15))
        # Assert
        assert m["durum"] == "NORMAL"
        assert m["son_tarih"] == "02.02.2026"
        assert m["kalan_gun"] == 18
        assert "3071" in m["mevzuat"]

    def test_kritik_band_son_iki_gun(self):
        # Arrange + Act — son tarih 02.02 (kaydırılmış); bugün 01.02 → 1 gün kala (≤2 = KRİTİK)
        m = compute_sla("dilekce", "01.01.2026", date(2026, 2, 1))
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


class TestComputeSlaResmiTatil:
    """İş günü hesabı resmî tatilleri (2429 + dini) hafta sonuna EK olarak atlar → son tarih
    ileri kayar. Takvim-günü türleri sayımda tatilleri İÇERİR, AMA son günü tatile/hafta
    sonuna denk gelirse izleyen ilk iş gününe uzar (2429 m.3 / HMK m.93)."""

    def test_bilgi_edinme_tatil_son_tarihi_ileri_kaydirir(self):
        # Arrange — 06.04.2026 (Pzt) başlangıç; 15 iş günü penceresi 23 Nisan (2429 tatil) içerir
        baslangic = date(2026, 4, 6)
        # Act
        m = compute_sla("bilgi_edinme", "06.04.2026", date(2026, 4, 6))
        tatil_son = _son(m)
        hafta_son = _yalnız_hafta_gunu_son(baslangic, 15)
        # Assert — tatil-duyarlı son, tatil-duyarsız hesaptan geç (23 Nisan sayılmadı)
        assert tatil_son > hafta_son
        assert not is_resmi_tatil(tatil_son) and tatil_son.weekday() < 5

    def test_dilekce_son_gun_is_gunuyse_kaymaz(self):
        # Arrange + Act — 05.01 + 30 takvim günü = 04.02 (Çrş, iş günü) → kaydırma yok
        m = compute_sla("dilekce", "05.01.2026", date(2026, 1, 5))
        # Assert — takvim günü sayımı korunur (tatiller sayılır); son zaten iş günü
        assert m["son_tarih"] == "04.02.2026"

    def test_dilekce_son_gun_tatile_denk_gelirse_kayar(self):
        # Arrange + Act — 01.04 + 30 takvim günü = 01.05 (1 Mayıs, 2429 tatil, Cuma) →
        # hafta sonu + tatil zinciri → izleyen ilk iş günü 04.05 Pzt (2429 m.3 / HMK m.93)
        m = compute_sla("dilekce", "01.04.2026", date(2026, 4, 1))
        # Assert
        assert m["son_tarih"] == "04.05.2026"
        assert not is_resmi_tatil(_son(m)) and _son(m).weekday() < 5

    def test_yil_siniri_son_gun_yilbasi_tatili_kayar(self):
        # Arrange + Act — 02.12.2025 + 30 takvim günü = 01.01.2026 (yılbaşı, 2429 tatil, Per) →
        # izleyen ilk iş günü 02.01.2026 Cuma. Yıl sınırı + sabit tatil birlikte.
        m = compute_sla("dilekce", "02.12.2025", date(2025, 12, 2))
        # Assert
        assert m["son_tarih"] == "02.01.2026"


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
