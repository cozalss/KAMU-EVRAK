"""Kurum sitesinde birim sayfası keşfi — güvenlik kuralları ve bağlantı seçimi.

Bu modül DIŞ GİRDİYLE AĞA ÇIKAN tek yerlerden biri, o yüzden testlerin ağırlığı
güvenlikte: nereye gidilebileceği ve nereye GİDİLEMEYECEĞİ.

TESTLER AĞA ÇIKMAZ. `izinli_mi` ve `_aday_baglantilar` saf fonksiyonlardır; gerçek
istek atan `birim_sayfasi_bul` burada çağrılmaz — bir kurumun sitesi geçici düştüğünde
CI kırılmamalı.

GÖZLENEN SINIR (2026-08-06, canlı ölçüm): valilik sitelerinin "hizmet birimleri"
sayfası valiliğin KENDİ birimlerini değil, ildeki AYRI KURUMLARI listeliyor (İl Emniyet
Müdürlüğü, İl Nüfus ve Vatandaşlık Müdürlüğü…). Bunlar valiliğin birimi değil, kendi
slug'ı olan başka kurumlardır. Bu yüzden canlı bulunan sayfa ASLA doğrudan korpusa
yazılmaz; memura kaynak linkiyle ÖNERİ olarak gider ve onay memurundur.
"""
from __future__ import annotations

import pytest

from core.sayfa_kesif import IZINLI_SONEKLER, _aday_baglantilar, izinli_mi


class TestIzinliAlan:
    @pytest.mark.parametrize("url", [
        "https://www.kayseri.gov.tr",
        "https://tavsanli.gov.tr/hizmet-birimleri",
        "https://www.selcuklu.bel.tr/p/g/kurumsal/mudurlukler/",
        "https://konyaism.saglik.gov.tr/TR-1/x",
        "https://hacettepe.edu.tr",
    ])
    def test_resmi_alanlar_izinli(self, url: str) -> None:
        assert izinli_mi(url)

    @pytest.mark.parametrize("url", [
        "http://www.kayseri.gov.tr",          # HTTPS değil
        "https://kayseri.gov.tr.saldirgan.com",   # sonek taklidi
        "https://ornek.com.tr/birimler",      # özel şirket
        "https://bddk.org.tr/Kurumsal",       # .org.tr izinli değil
        "https://192.168.1.1/admin",          # iç ağ
        "https://localhost:8000",
        "file:///etc/passwd",
        "",
    ])
    def test_izinsiz_alanlar_reddedilir(self, url: str) -> None:
        assert not izinli_mi(url)

    def test_sonek_listesi_dar_tutuluyor(self) -> None:
        """Liste genişlerse SSRF yüzeyi büyür; değişiklik bilinçli olmalı."""
        assert set(IZINLI_SONEKLER) == {".gov.tr", ".bel.tr", ".edu.tr", ".pol.tr",
                                        ".tsk.tr"}


class TestBaglantiSecimi:
    TEMEL = "https://www.ornek.bel.tr"

    def _html(self, *baglantilar: str) -> str:
        return "<html><body>" + "".join(baglantilar) + "</body></html>"

    def test_guclu_ipucu_zayif_olanin_onune_gecer(self) -> None:
        govde = self._html(
            '<a href="/kurumsal">Kurumsal</a>',
            '<a href="/mudurlukler">Müdürlükler</a>',
        )
        sirali = _aday_baglantilar(govde, self.TEMEL)
        assert sirali[0][1].endswith("/mudurlukler"), sirali

    def test_baglanti_metni_turkce_olsa_da_yakalanir(self) -> None:
        """Adres ASCII, bağlantı metni Türkçe olabilir — ikisi de aranmalı."""
        govde = self._html('<a href="/p/12">Hizmet Birimleri</a>')
        assert _aday_baglantilar(govde, self.TEMEL), "Türkçe bağlantı metni kaçtı"

    def test_izinsiz_alana_giden_baglanti_atilir(self) -> None:
        govde = self._html(
            '<a href="https://kotu.com/mudurlukler">Müdürlükler</a>',
            '<a href="/mudurlukler">Müdürlükler</a>',
        )
        adaylar = [u for _, u, _ in _aday_baglantilar(govde, self.TEMEL)]
        assert all("kotu.com" not in u for u in adaylar), adaylar
        assert any(u.endswith("/mudurlukler") for u in adaylar)

    @pytest.mark.parametrize("href", [
        "#icerik", "mailto:bilgi@ornek.bel.tr", "tel:+90", "javascript:void(0)",
    ])
    def test_gezinme_disi_semalar_atilir(self, href: str) -> None:
        govde = self._html(f'<a href="{href}">Müdürlükler</a>')
        assert _aday_baglantilar(govde, self.TEMEL) == []

    def test_ilgisiz_baglanti_aday_olmaz(self) -> None:
        govde = self._html(
            '<a href="/haberler">Haberler</a>',
            '<a href="/iletisim">İletişim</a>',
        )
        assert _aday_baglantilar(govde, self.TEMEL) == []

    def test_ayni_adres_tekrar_edilmez(self) -> None:
        govde = self._html(
            '<a href="/birimler">Birimler</a>',
            '<a href="/birimler">Müdürlükler</a>',
        )
        assert len(_aday_baglantilar(govde, self.TEMEL)) == 1
