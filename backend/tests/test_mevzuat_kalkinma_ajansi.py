"""Kalkınma ajansı şablonu — 4 s. CBK m.190'ın saydığı dört birim.

Bu şablonun ayırt edici yanı KAPSAMININ BİLEREK EKSİK olmasıdır ve bu tercih burada
kilitlenir. Kararnamenin EK LİSTE'si Düzey 2 bölgelerini **26** olarak sayar; kapsam
listesinde ise **24** ajans vardır, çünkü ajans adları kararnamede yer almaz (m.186
uyarınca Cumhurbaşkanı kararıyla belirlenir) ve eksik ikisi doğrulanabilir bir kaynaktan
tamamlanamadı.

Eksik bırakmak bilinçli tercihtir. Bu depoda aynı gün ölçülen iki durum farkı gösteriyor:

  · FAZLA kapsam TEHLİKELİDİR — sicil 81 il için vergi dairesi başkanlığı kaydediyor ama
    doğrulanmış GİB raporu 29 ilde 30 tane olduğunu söylüyor. 81'lik şablon kurulsaydı
    "Ağrı Vergi Dairesi Başkanlığı"na güvenle birim önerilirdi; memur öneriyi doğrulanmış
    gördüğü için sorgulamaz.
  · EKSİK kapsam GÜVENLİDİR — iki ajans öneri alamaz, ama yanlış öneri de almaz.

Bu yüzden vergi dairesinde şablon durduruldu, burada 24 ile kuruldu.
"""
from __future__ import annotations

import pytest

from agents.nodes.teskilat_ara import teskilat_birim_ara
from core.kaynak_guveni import RESMI_DOGRULANMIS

# m.190/1'in bent sırasıyla saydığı dört birim — fazlası da eksiği de olmamalı.
KANUNI_BIRIMLER = frozenset({
    "Kalkınma Kurulu", "Yönetim Kurulu", "Genel Sekreterlik", "Yatırım Destek Ofisleri",
})

AJANSLAR = ("ahiler", "ankara", "bati-akdeniz", "cukurova", "istanbul")

KONU_BIRIM = (
    ("bölgesel gelişme işbirliği ve kurul üyeliği", "Kalkınma Kurulu"),
    ("yönetim kurulu kararı", "Yönetim Kurulu"),
    ("vali ve büyükşehir belediye başkanının katıldığı kurul", "Yönetim Kurulu"),
    ("genel sekreterin görev ve yetkileri", "Genel Sekreterlik"),
    ("yatırım destek ofisi ücretsiz hizmet", "Yatırım Destek Ofisleri"),
)


class TestKapsam:
    @pytest.mark.parametrize("alan", AJANSLAR)
    def test_her_ajans_dogrulanmis_birim_alir(self, alan: str) -> None:
        adaylar = teskilat_birim_ara(f"{alan}-kalkinma-ajansi", "ajans işlemi", top_k=1)
        assert adaylar, alan
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS, (alan, adaylar[0])
        assert adaylar[0]["kaynak_tipi"] == "mevzuat_teskilat", (alan, adaylar[0])

    def test_kapsam_bilerek_eksik_ve_bu_yazili(self) -> None:
        """Eksiklik gizlenmemeli: künye 26 bölge / 24 ajans farkını açıkça söylemeli."""
        from pathlib import Path
        kok = Path(__file__).resolve().parents[2] / "data" / "teskilat"
        sablon = (kok / "_mevzuat-kalkinma-ajansi" / "birimler.txt").read_text(encoding="utf-8")
        assert "EKSİK" in sablon.upper()
        assert "26" in sablon, "EK LİSTE'nin 26 bölge saydığı künyede yazmalı"
        kapsam = (kok / "_kapsam" / "kalkinma-ajanslari.txt").read_text(encoding="utf-8")
        satir = [s for s in kapsam.splitlines() if s and "|" in s and not s.startswith("@")]
        assert len(satir) == 24, len(satir)

    def test_ajans_olmayan_kurum_sablonu_almaz(self) -> None:
        """Kalıp yalnız '-kalkinma-ajansi' kuyruğuna uyar."""
        adaylar = teskilat_birim_ara("ankara-buyuksehir-belediyesi", "yönetim kurulu", top_k=5)
        assert all(a.get("sablon_slug") != "_mevzuat-kalkinma-ajansi" for a in adaylar)


class TestBirimKumesi:
    def test_yalnizca_maddede_sayilan_dort_birim(self) -> None:
        bulunan: set[str] = set()
        for konu, _ in KONU_BIRIM:
            for a in teskilat_birim_ara("ankara-kalkinma-ajansi", konu, top_k=10):
                if a["kaynak_tipi"] == "mevzuat_teskilat":
                    bulunan.add(a["birim_ad"])
        assert bulunan == KANUNI_BIRIMLER, bulunan

    @pytest.mark.parametrize("konu,beklenen", KONU_BIRIM)
    def test_konu_maddenin_bagladigi_birime_gider(self, konu: str, beklenen: str) -> None:
        adaylar = teskilat_birim_ara("ankara-kalkinma-ajansi", konu, top_k=1)
        assert adaylar and adaylar[0]["birim_ad"] == beklenen, (konu, adaylar)
