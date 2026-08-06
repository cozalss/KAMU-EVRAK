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

    def test_GEZINME_oneki_temizlenir(self) -> None:
        """Eskiden "Anasayfa Fen İşleri Müdürlüğü" tek bir "birim" olarak çıkıyordu.

        O davranış bilinen bir sınır olarak kayda geçirilmişti ve "bir gün çıkarım
        güçlendirilirse bu test kırılmalı" diye yazılmıştı. 2026-08-06 denetiminde
        gürültünün yalnız çirkin değil ZARARLI olduğu ölçüldü: `en_uygun_birim` gürültülü
        adayı seçebiliyor ve yanlış birim öneriliyordu. Artık aday sağdan kırpılıyor.
        """
        assert ck.birimleri_cikar("Anasayfa Fen İşleri Müdürlüğü") == ("Fen İşleri Müdürlüğü",)

    def test_CUMLE_ici_birim_adi_cumleyi_yutmaz(self) -> None:
        metin = ("Vatandaşlarımız gürültü şikayetlerini Zabıta Müdürlüğüne iletebilir. "
                 "İlgili ölçümler Çevre Koruma ve Kontrol Müdürlüğü tarafından yapılır.")
        birimler = ck.birimleri_cikar(metin)
        assert "Zabıta Müdürlüğü" in birimler
        assert "Çevre Koruma ve Kontrol Müdürlüğü" in birimler
        assert all("Vatandaşlarımız" not in b for b in birimler), birimler

    def test_baglac_ADIN_ICINDE_korunur(self) -> None:
        """Kırpma fazla agresif olmamalı: "ve" gerçek birim adlarının parçasıdır."""
        birimler = ck.birimleri_cikar("Ölçüm İklim Değişikliği ve Sıfır Atık Müdürlüğü")
        assert "İklim Değişikliği ve Sıfır Atık Müdürlüğü" in birimler

    def test_KISI_ADI_bitisik_hucreden_birim_adina_karismaz(self) -> None:
        """Personel tablosunda hücre sınırı kaybolunca kişi adı "birim" oluyordu (KVKK).

        Kök çözüm `sayfa_kesif._duz_metin`te: blok etiketleri satır sonuna çevrilir ve
        `_ADAY_RE` satır sonunu sınır sayar.
        """
        from core.sayfa_kesif import _duz_metin
        html_ = "<table><tr><td>Ayşe Yılmaz</td><td>Fen İşleri Müdürlüğü</td></tr></table>"
        birimler = ck.birimleri_cikar(_duz_metin(html_))
        assert birimler == ("Fen İşleri Müdürlüğü",)
        assert all("Ayşe" not in b for b in birimler)

    def test_unvan_eki_TEK_BASINA_birim_sayilmaz(self) -> None:
        assert ck.birimleri_cikar("... hakkında Müdürlüğü") == ()

    def test_PARANTEZLI_ad_kirpilirken_bozulmaz(self) -> None:
        """Bitişik parantez ilk karakter olunca harf sınavı düşüyor ve ad kırpılıyordu.

        Ölçülen bozulma: "Bilgi İşlem (Fen İşleri) Müdürlüğü" → "İşleri) Müdürlüğü".
        Sınav noktalamasız biçimde yapılmalı; çıktıda parantez atılır.
        """
        assert ck._adayi_kirp("(Fen İşleri) Müdürlüğü") == "Fen İşleri Müdürlüğü"
        assert ck._adayi_kirp("İklim ve (Sıfır) Atık Müdürlüğü") == \
            "İklim ve Sıfır Atık Müdürlüğü"

    def test_VIRGUL_ad_icinde_KORUNUR(self) -> None:
        """Parantez atılırken virgül de atılırsa gerçek birim adları bozulur."""
        assert ck._adayi_kirp("Kültür, Sanat ve Sosyal İşler Müdürlüğü") == \
            "Kültür, Sanat ve Sosyal İşler Müdürlüğü"

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


class TestKimlikKapisiBagli:
    """Kapı yalnız var olmakla yetmez — bu akışta GERÇEKTEN çağrılıyor mu?

    `ttk` olayı (bkz. tests/test_kurum_kimligi.py) tam olarak burada engellenmeliydi:
    alan adı kalıptan açıldı, sayfa indi, birim adları da çıktı — kapı olmasa öneri
    üretilirdi. Bu yüzden kapının bağlı olduğu ayrıca kilitlenir.
    """

    @staticmethod
    def _sahte_bulgu(monkeypatch, metin: str) -> None:
        from core.sayfa_kesif import Bulgu
        monkeypatch.setattr(
            ck, "birim_sayfasi_bul",
            lambda *a, **k: Bulgu(url="https://ttk.gov.tr/teskilat", metin=metin, ipucu="teskilat"),
        )

    def test_baska_kurumun_sayfasi_REDDEDILIR(self, monkeypatch) -> None:
        # Sayfa BİRİM ADI İÇERİYOR — yani reddin sebebi birim bulunamaması değil, kimlik.
        self._sahte_bulgu(monkeypatch, "Türk Tarih Kurumu — Kütüphane ve Arşiv Müdürlüğü")
        sonuc = ck.canli_kaynak_bul(
            {"slug": "ttk", "ad": "Türkiye Taşkömürü Kurumu (TTK)"}, web_aramasi=False
        )
        assert sonuc is None, "yanlış kurumun sayfasından öneri üretildi"

    def test_dogru_kurumun_sayfasi_KABUL_EDILIR(self, monkeypatch) -> None:
        # İlk öğe bilerek kurumun kendi ünvanı: çıkarıcının bilinen önek gürültüsü orada
        # kalır (bkz. test_ILK_ogede_onek_gurultusu…), sonraki adlar temiz çıkar.
        self._sahte_bulgu(
            monkeypatch,
            "Türkiye Taşkömürü Kurumu Genel Müdürlüğü "
            "İnsan Kaynakları Daire Başkanlığı Muhasebe Müdürlüğü",
        )
        sonuc = ck.canli_kaynak_bul(
            {"slug": "ttk", "ad": "Türkiye Taşkömürü Kurumu (TTK)"}, web_aramasi=False
        )
        assert sonuc is not None
        assert "İnsan Kaynakları Daire Başkanlığı" in sonuc.birimler

    def test_reddedilen_sayfa_ONBELLEGE_YAZILMAZ(self, monkeypatch) -> None:
        """Yanlış eşleşme önbelleğe girerse hata 30 gün boyunca tekrarlanır."""
        self._sahte_bulgu(monkeypatch, "Türk Tarih Kurumu — Bilim Kurulu Başkanlığı")
        ck.canli_kaynak_bul({"slug": "ttk", "ad": "Türkiye Taşkömürü Kurumu"}, web_aramasi=False)
        assert ck.onbellekten("ttk") is None


@pytest.mark.anyio
class TestAsenkronSarmalayici:
    """`kurum_icin_oneri_async` — zaman aşımı ve hata yutma GERÇEKTEN çalışıyor mu?

    Bu sarmalayıcı evrak akışını ASILMAKTAN korur, ama onu çağıran her test şimdiye kadar
    onu tamamen sahteyle değiştiriyordu; yani asıl uygulama CI'da hiç koşmuyordu. Biri
    ayrılmış havuzu varsayılana çevirse ya da zaman aşımını kaldırsa hiçbir test kırılmazdı
    — tam da bu dosyanın önlemeye çalıştığı thread-açlığı hatası sessizce geri gelirdi.
    """

    async def test_yavas_kesif_ZAMAN_ASIMINA_ugrar_ve_None_doner(self, monkeypatch) -> None:
        import time as _t
        monkeypatch.setattr(ck, "KESIF_TOPLAM_SN", 0.4)
        monkeypatch.setattr(ck, "kurum_icin_oneri",
                            lambda *a, **k: (_t.sleep(5), {"url": "x"})[1])
        basla = _t.monotonic()
        sonuc = await ck.kurum_icin_oneri_async("bir-kurum", "konu")
        gecen = _t.monotonic() - basla
        assert sonuc is None
        assert gecen < 2.0, f"zaman aşımı tutmadı: {gecen:.1f} sn"

    async def test_kesif_HATASI_yutulur(self, monkeypatch) -> None:
        def _patla(*a, **k):
            raise RuntimeError("ağ öldü")
        monkeypatch.setattr(ck, "kurum_icin_oneri", _patla)
        assert await ck.kurum_icin_oneri_async("bir-kurum", "konu") is None

    async def test_basarili_sonuc_AYNEN_doner(self, monkeypatch) -> None:
        kunye = {"url": "https://x.gov.tr/b", "dogrulanmis": False}
        monkeypatch.setattr(ck, "kurum_icin_oneri", lambda *a, **k: kunye)
        assert await ck.kurum_icin_oneri_async("bir-kurum", "konu") == kunye

    async def test_AYRILMIS_havuzda_kosar_varsayilan_executorda_DEGIL(self, monkeypatch) -> None:
        """Paylaşımlı havuzda koşarsa yavaş kurum siteleri giriş/mevzuat/mobil'i aç bırakır."""
        import threading
        gorulen: dict[str, str] = {}
        monkeypatch.setattr(ck, "kurum_icin_oneri",
                            lambda *a, **k: gorulen.setdefault(
                                "ad", threading.current_thread().name) and None)
        await ck.kurum_icin_oneri_async("bir-kurum", "konu")
        assert gorulen.get("ad", "").startswith("kesif-worker"), gorulen


class TestGirdiDogrulama:
    def test_slugsuz_kayit_none(self, monkeypatch) -> None:
        def _patlat(*a, **k):
            raise AssertionError("slug yokken ağa çıkıldı")
        monkeypatch.setattr(ck, "birim_sayfasi_bul", _patlat)
        assert ck.canli_kaynak_bul({"tur": "belediye"}) is None
