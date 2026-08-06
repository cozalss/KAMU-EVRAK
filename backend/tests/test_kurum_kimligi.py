"""Kimlik kapısı — indirilen sayfa GERÇEKTEN o kuruma mı ait?

Bu kapı ölçülmüş bir olaydan doğdu (2026-08-06). Merkezî kurumlarda `<slug>.gov.tr`
kalıbı sınanırken sicildeki `ttk` (**Türkiye Taşkömürü Kurumu**) için ttk.gov.tr açıldı
— ama o adres **Türk Tarih Kurumu**na aittir. Aynı kısaltma, iki ayrı kurum. Kapı
olmasaydı taşkömürü evrakına tarih kurumunun birimleri, üstelik "resmî kaynak" görünümlü
tıklanabilir bir linkle önerilecekti.

Bu depodaki en eski kural burada da geçerli: **yanlış kuruma GÜVENLE yönlendirmek, hiç
öneri vermemekten kötüdür** — memur öneriyi kaynaklı gördüğü için sorgulamaz.

Testler AĞA ÇIKMAZ: kapı saf bir metin karşılaştırmasıdır.
"""
from __future__ import annotations

import pytest

from core.kurum_kimligi import (
    ayirt_edici_tokenlar,
    eslesen_tokenlar,
    kurum_sayfasi_mi,
)

# Türk Tarih Kurumu sayfasından temsilî metin — "taşkömürü" GEÇMİYOR.
_TARIH_KURUMU_SAYFASI = (
    "Türk Tarih Kurumu Başkanlığı — Atatürk'ün direktifleriyle kurulmuştur. "
    "Yayınlar, Belleten dergisi, Kütüphane ve Arşiv Müdürlüğü, Bilim Kurulu."
)
_TASKOMURU_SAYFASI = (
    "Türkiye Taşkömürü Kurumu Genel Müdürlüğü — Zonguldak. Taşkömürünün üretimi, "
    "Armutçuk Müessesesi, İnsan Kaynakları Daire Başkanlığı."
)


class TestTTKCakismasi:
    """En kritik regresyon: bu senaryo bir kez GERÇEKTEN yaşandı."""

    def test_taskomuru_kurumu_tarih_kurumu_sayfasini_KABUL_ETMEZ(self) -> None:
        assert kurum_sayfasi_mi("Türkiye Taşkömürü Kurumu (TTK)", _TARIH_KURUMU_SAYFASI) is False

    def test_taskomuru_kurumu_KENDI_sayfasini_kabul_eder(self) -> None:
        assert kurum_sayfasi_mi("Türkiye Taşkömürü Kurumu (TTK)", _TASKOMURU_SAYFASI) is True

    def test_ucharfli_kisaltma_tek_basina_kimlik_KANITI_sayilmaz(self) -> None:
        """'TTK' her iki kurumda da geçiyor; ayırt edici olan 'Taşkömürü'dür."""
        assert "ttk" not in ayirt_edici_tokenlar("Türkiye Taşkömürü Kurumu (TTK)")


class TestAyirtEdicilik:
    @pytest.mark.parametrize("zayif", [
        "Türkiye", "Genel", "Müdürlüğü", "Başkanlığı", "Kurumu", "Belediyesi", "Hizmetleri",
    ])
    def test_her_kurumda_gecen_kelimeler_ayirt_edici_degil(self, zayif: str) -> None:
        from core.text import tr_lower
        tokenlar = ayirt_edici_tokenlar(f"Örnek {zayif} Kurumu")
        assert tr_lower(zayif) not in tokenlar
        assert "örnek" in tokenlar, "ayırt edici kelime elenmemeli"

    def test_ayirt_edici_kelime_yoksa_kapi_KAPALI(self) -> None:
        """Kimliği kanıtlanamayan sayfa kabul edilmez — güvenli yön reddetmektir."""
        assert kurum_sayfasi_mi("Genel Müdürlüğü", "her şey burada yazıyor") is False
        assert kurum_sayfasi_mi("", "herhangi bir metin") is False

    def test_kurum_adinin_yarisi_yeterli_tamami_sart_degil(self) -> None:
        """Sayfa kurumun tam adını nadiren tekrarlar; yarısı kimlik için yeter.
        Ölçüldü: 29 gerçek sayfada bu eşikle 0 yanlış-pozitif, 0 etkin yanlış-negatif."""
        ad = "Maden Tetkik ve Arama Genel Müdürlüğü"          # ayırt edici: maden/tetkik/arama
        assert kurum_sayfasi_mi(ad, "MTA — maden arama faaliyetleri") is True


class TestTurkceCekim:
    def test_cekim_eki_almis_kelime_eslesir(self) -> None:
        """Sayfa 'Taşkömürünün' yazarsa da eşleşmeli — kök karşılaştırılır."""
        assert eslesen_tokenlar("Taşkömürü Kurumu", "taşkömürünün üretimi") == ("taşkömürü",)

    def test_buyuk_kucuk_harf_ve_TR_karakter_farki_engel_degil(self) -> None:
        assert kurum_sayfasi_mi("Nilüfer Belediyesi", "NİLÜFER BELEDİYE BAŞKANLIĞI") is True

    def test_benzemeyen_kok_eslesmez(self) -> None:
        assert eslesen_tokenlar("Nilüfer Belediyesi", "Osmangazi Belediyesi sayfası") == ()


class TestNullGuvenligi:
    @pytest.mark.parametrize("metin", ["", " ", "\n"])
    def test_bos_sayfa_kabul_edilmez(self, metin: str) -> None:
        assert kurum_sayfasi_mi("Türkiye Taşkömürü Kurumu", metin) is False

    def test_bos_ad_cokme_yapmaz(self) -> None:
        assert ayirt_edici_tokenlar("") == frozenset()
        assert eslesen_tokenlar("", "metin") == ()
