"""Canlı kaynak orkestratörü — önbellek, çıkarım ve "doğrulanmış değil" sözleşmesi.

Doğrulanmamış bir kuruma evrak geldiğinde memura kaynak linki göstermek için katmanları
birleştiren yer. Testlerin odağı üç şey:

  1. ÇIKTI "DOĞRULANMIŞ" DEĞİLDİR. Canlı bulunan sayfa manifest + SHA-256 + insan
     incelemesinden geçmemiştir. Künye bunu her zaman söylemeli; UI sarı göstermeli.
     Bu sözleşme kırılırsa uydurma veri doğrulanmış görünür — deponun en temel kuralı.
  2. ÖNBELLEK gerçekten çalışmalı. Aynı kuruma ikinci evrak geldiğinde dışarı
     çıkılmamalı (ölçüldü: 1,2 sn → 0,008 sn).
  3. ÖNBELLEK GÜVENİLİR DEĞİL. Dosya elle bozulabilir; okunan adres yine `izinli_mi`
     sınavından geçer, süresi dolmuş kayıt kullanılmaz.

TESTLER AĞA ÇIKMAZ: `canli_kaynak_bul` yalnız önbellekten dönen yolda çağrılır.
"""
from __future__ import annotations

import time

import pytest

from core import canli_kaynak as ck


@pytest.fixture(autouse=True)
def _temiz_onbellek(monkeypatch, tmp_path):
    monkeypatch.setattr(ck, "_ONBELLEK_DOSYASI", tmp_path / "onbellek.json")


def _ornek(url: str = "https://www.selcuklu.bel.tr/mudurlukler", ts: float | None = None):
    return ck.CanliKaynak(
        kurum_slug="selcuklu-belediyesi", url=url,
        birimler=("Fen İşleri Müdürlüğü", "Zabıta Müdürlüğü"),
        yol="kalip", bulundu_ts=time.time() if ts is None else ts,
    )


class TestDogrulanmisDegilSozlesmesi:
    def test_kunye_her_zaman_dogrulanmadi_der(self) -> None:
        kunye = _ornek().kunye()
        assert kunye["dogrulanmis"] is False
        assert "GEÇMEDİ" in kunye["uyari"]

    def test_kunye_kaynak_linkini_tasir(self) -> None:
        """Memurun tıklayıp kendi gözüyle görebilmesi bu katmanın tek amacı."""
        assert _ornek().kunye()["url"].startswith("https://")


class TestBirimCikarimi:
    def test_unvan_ekiyle_biten_adlar_yakalanir(self) -> None:
        metin = ("Anasayfa Fen İşleri Müdürlüğü Zabıta Müdürlüğü "
                 "Strateji Geliştirme Daire Başkanlığı İletişim")
        birimler = ck.birimleri_cikar(metin)
        assert "Zabıta Müdürlüğü" in birimler
        assert any("Strateji Geliştirme" in b for b in birimler)
        assert any("Fen İşleri Müdürlüğü" in b for b in birimler)

    def test_ILK_ogede_onek_gurultusu_KALIR_bu_bilinen_sinirdir(self) -> None:
        """Düz metinde birim adının NEREDE BAŞLADIĞI lafzen ayırt edilemez.

        "Anasayfa Fen İşleri Müdürlüğü" dizisinde hem "Anasayfa" hem "Fen" büyük harfle
        başlar; hangisinin adın başı olduğunu metin söylemez. Sonraki öğeler temiz çıkar,
        çünkü bir önceki unvanın bittiği yerden başlarlar — ölçüldü (2026-08-06, Selçuklu
        Belediyesi: 37 adayın yalnız ilki kirliydi).

        Bu kusur BİLEREK düzeltilmiyor: çıktı memura ÖNERİ olarak gider, korpusa
        yazılmaz; ayrıca sıralamayı evrak konusuyla BM25 yapar ve önek gürültüsü konuyla
        eşleşmediği için pratikte öne çıkmaz. Bir gün korpusa yazılacaksa bu test
        kırılmalı ve çıkarım güçlendirilmelidir.
        """
        birimler = ck.birimleri_cikar("Anasayfa Fen İşleri Müdürlüğü")
        assert birimler == ("Anasayfa Fen İşleri Müdürlüğü",)

    def test_unvansiz_metin_birim_uretmez(self) -> None:
        assert ck.birimleri_cikar("Haberler Duyurular İletişim Anasayfa") == ()

    def test_tekrar_eden_ad_bir_kez_doner(self) -> None:
        metin = "Fen İşleri Müdürlüğü ... Fen İşleri Müdürlüğü"
        assert ck.birimleri_cikar(metin).count("Fen İşleri Müdürlüğü") == 1

    def test_azami_birim_sinirlanir(self) -> None:
        """Kötü bir sayfa yüzlerce eşleşme verebilir; öneri listesi şişmemeli."""
        metin = " ".join(f"Birim{i} Müdürlüğü" for i in range(200))
        assert len(ck.birimleri_cikar(metin)) <= ck.AZAMI_BIRIM


class TestOnbellek:
    def test_yazilan_kayit_geri_okunur(self) -> None:
        ck._onbellege_koy(_ornek())
        geri = ck.onbellekten("selcuklu-belediyesi")
        assert geri is not None
        assert geri.url == "https://www.selcuklu.bel.tr/mudurlukler"
        assert geri.yol == "onbellek"
        assert "Fen İşleri Müdürlüğü" in geri.birimler

    def test_bilinmeyen_kurum_none(self) -> None:
        assert ck.onbellekten("olmayan-kurum") is None

    def test_suresi_dolan_kayit_kullanilmaz(self) -> None:
        eski = time.time() - ck.ONBELLEK_OMRU_SN - 60
        ck._onbellege_koy(_ornek(ts=eski))
        assert ck.onbellekten("selcuklu-belediyesi") is None

    def test_onbellekteki_izinsiz_adres_reddedilir(self) -> None:
        """Önbellek dosyası elle bozulabilir; adres yine sınanır."""
        ck._onbellege_koy(_ornek(url="https://kotu.com/mudurlukler"))
        assert ck.onbellekten("selcuklu-belediyesi") is None

    def test_bozuk_onbellek_dosyasi_cokme_yapmaz(self) -> None:
        ck._ONBELLEK_DOSYASI.write_text("{bozuk", encoding="utf-8")
        assert ck.onbellekten("selcuklu-belediyesi") is None

    def test_onbellekten_donunce_aga_cikilmaz(self, monkeypatch) -> None:
        def _patlat(*a, **k):
            raise AssertionError("önbellek varken ağa çıkıldı")
        monkeypatch.setattr(ck, "birim_sayfasi_bul", _patlat)
        ck._onbellege_koy(_ornek())
        sonuc = ck.canli_kaynak_bul({"slug": "selcuklu-belediyesi"}, web_aramasi=False)
        assert sonuc is not None and sonuc.yol == "onbellek"


class TestGirdiDogrulama:
    def test_slugsuz_kayit_none(self, monkeypatch) -> None:
        def _patlat(*a, **k):
            raise AssertionError("slug yokken ağa çıkıldı")
        monkeypatch.setattr(ck, "birim_sayfasi_bul", _patlat)
        assert ck.canli_kaynak_bul({"tur": "belediye"}) is None
