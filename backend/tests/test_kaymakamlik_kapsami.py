"""Kaymakamlık kapsam listesi — sicil FAZLA sayıyor, kapsam onu izlemez.

Kapsam listesi (`_kapsam/ilceler.txt`) sicildeki kaymakamlık kayıtlarıyla karşılaştırıldı
ve 54 fark bulundu. Farkın **51'i merkez ilçedir** (il adı = ilçe adı): büyükşehir olmayan
illerin merkez ilçesinde KAYMAKAMLIK YOKTUR, o görevi vali yürütür. Yani sicil fazla
sayıyor; kapsamın onu izlememesi DOĞRUDUR.

Kalan 3 fark gerçek boşluktu ve üçü de slug yazım uyuşmazlığından kaynaklanıyordu:
  · `eyup` → `eyupsultan` (ilçe 2018'de yeniden adlandırıldı)
  · `ondokuzmayis` → `19-mayis` (sicilin kanonik biçimi)
  · `karadeniz-eregli` hiç yoktu — kapsamdaki `eregli` KONYA Ereğli'sidir, Zonguldak'taki
    Karadeniz Ereğli ayrı bir ilçedir.

Bu dosya iki yönü birden kilitler: düzeltilen üçü kapsama girmeli, merkez ilçeler
girmemeli. Biri "eksik" diye düzeltilirken diğeri sessizce şişirilmesin.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agents.nodes.teskilat_ara import teskilat_birim_ara
from core.kaynak_guveni import RESMI_DOGRULANMIS

_KOK = Path(__file__).resolve().parents[2] / "data" / "teskilat"

# Slug uyuşmazlığı yüzünden kapsam dışı kalmış, düzeltilen gerçek kaymakamlıklar.
DUZELTILEN = ("eyupsultan", "19-mayis", "karadeniz-eregli")
# Merkez ilçe örnekleri — buralarda kaymakamlık YOKTUR.
MERKEZ_ILCE = ("agri", "bolu", "burdur", "corum")


def _kapsam_slugleri() -> set[str]:
    metin = (_KOK / "_kapsam" / "ilceler.txt").read_text(encoding="utf-8")
    return {
        s.split("|")[0].strip()
        for s in metin.splitlines()
        if s.strip() and "|" in s and not s.startswith(("#", "@"))
    }


class TestDuzeltilenUcKaymakamlik:
    @pytest.mark.parametrize("alan", DUZELTILEN)
    def test_kapsamda_var(self, alan: str) -> None:
        assert alan in _kapsam_slugleri(), alan

    @pytest.mark.parametrize("alan", DUZELTILEN)
    def test_dogrulanmis_birim_aliyor(self, alan: str) -> None:
        adaylar = teskilat_birim_ara(f"{alan}-kaymakamligi", "ilçede yazı işleri ve evrak havalesi",
                                     top_k=1)
        assert adaylar, alan
        assert adaylar[0]["birim_ad"] == "İlçe Yazı İşleri Müdürlüğü", (alan, adaylar[0])
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS, (alan, adaylar[0])

    def test_konya_ve_zonguldak_eregli_ayri_kayitlar(self) -> None:
        """`eregli` Konya'dır; Zonguldak ayrı slug'tır. İkisi karışırsa biri kapsam dışı kalır."""
        kapsam = _kapsam_slugleri()
        assert "eregli" in kapsam and "karadeniz-eregli" in kapsam


class TestMerkezIlceSismesin:
    @pytest.mark.parametrize("alan", MERKEZ_ILCE)
    def test_merkez_ilce_kapsamda_degil(self, alan: str) -> None:
        """Büyükşehir olmayan ilin merkez ilçesinde kaymakamlık yoktur; vali yürütür."""
        assert alan not in _kapsam_slugleri(), alan

    @pytest.mark.parametrize("alan", MERKEZ_ILCE)
    def test_merkez_ilce_dogrulanmis_birim_almaz(self, alan: str) -> None:
        adaylar = teskilat_birim_ara(f"{alan}-kaymakamligi", "ilçede yazı işleri", top_k=5)
        assert all(a["kaynak_tipi"] != "mevzuat_teskilat" for a in adaylar), (alan, adaylar)

    def test_sicil_kapsamdan_FAZLA_sayiyor(self) -> None:
        """Sicil bir envanterdir, kapsam kaynağı değildir — fark bilinçlidir.

        Fark daralırsa (ör. merkez ilçeler kapsama eklenirse) bu test kırılır ve
        şişirmenin fark edilmesini sağlar.
        """
        sicil = json.loads((_KOK / "sicil.json").read_text(encoding="utf-8"))
        kayit = sicil.get("kurumlar", sicil)
        sicil_alan = {
            x["slug"].replace("-kaymakamligi", "")
            for x in kayit if x.get("tur") == "kaymakamlik"
        }
        fazla = sicil_alan - _kapsam_slugleri()
        assert len(fazla) == 51, f"beklenen 51 merkez ilçe, bulunan {len(fazla)}: {sorted(fazla)[:8]}"
