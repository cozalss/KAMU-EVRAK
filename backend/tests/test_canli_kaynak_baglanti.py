"""Canlı kaynağın yönlendirmeye bağlanması — OTOMATİK HAVALE YOLU AÇILMADI.

Canlı kaynak, korpusta karşılığı olmayan kuruma evrak gelince memura tıklanabilir bir
kaynak linki gösterir. O sayfa manifest + SHA-256 + İNSAN İNCELEMESİNDEN GEÇMEMİŞTİR;
dolayısıyla otomatik havale üretemez.

Bu dosya o sınırı ÜÇ AYRI YERDE kilitler — biri ileride bozulursa diğerleri tutsun:
  1. `uclu_grounding` canlı kaynağı kabul etmez (kaynak_tipi şartı).
  2. Yönlendirme çıktısında `hedef_birim` None, `insan_onayi_gerekli` True kalır.
  3. Canlı veri `hedef_birim_kaynak` künyesine SIZMAZ; ayrı `canli_kaynak` anahtarında
     durur ve `dogrulanmis=False` taşır.

Testler AĞA ÇIKMAZ: canlı arama sahte bir fonksiyonla değiştirilir.
"""
from __future__ import annotations

import pytest

from agents.nodes import route_ajan as ra
from agents.resmi_kaynak import uclu_grounding
from core.canli_kaynak import en_uygun_birim

_CANLI = {
    "url": "https://www.ornek.bel.tr/mudurlukler",
    "birim_sayisi": 3,
    "yol": "kalip",
    "dogrulanmis": False,
    "uyari": "Bu kaynak canlı bulundu; insan incelemesinden GEÇMEDİ.",
    "kurum_slug": "ornek-belediyesi",
    "birim_oneri": "Ulaşım Dairesi Başkanlığı",
    "birim_ornekleri": ["Ulaşım Dairesi Başkanlığı", "Fen İşleri Müdürlüğü"],
}


class TestGroundingKabulEtmez:
    def test_canli_kaynak_ucul_groundingden_gecmez(self) -> None:
        """Canlı kaynağın künyesi kurum_ozel değildir → otomatik havale üretemez."""
        aday = {
            "birim_ad": "Ulaşım Dairesi Başkanlığı",
            "gorev": "ulaşım ve toplu taşıma hatlarının planlanması",
            "kurum_slug": "ornek-belediyesi",
            "kaynak_tipi": "canli",
            "kaynak_guven": "resmi_dogrulanmis",   # kasten en iyimser değer
            "kaynak_sha256": "0" * 64,
            "kaynak_dosya": "ornek-belediyesi/birimler.txt",
        }
        assert uclu_grounding(aday, "ulaşım ve toplu taşıma talebi", "ornek-belediyesi") is False

    def test_kaynak_tipi_bos_da_gecmez(self) -> None:
        aday = {"birim_ad": "X Müdürlüğü", "gorev": "ulaşım toplu taşıma",
                "kurum_slug": "ornek-belediyesi", "kaynak_guven": "resmi_dogrulanmis",
                "kaynak_sha256": "0" * 64}
        assert uclu_grounding(aday, "ulaşım toplu taşıma", "ornek-belediyesi") is False


class TestKesifKonusu:
    """Keşfe verilen metin: ne çok dar (dejenere konu) ne çok geniş (tüm gövde).

    İki yönde de ölçülmüş bozulma var:
      · Tüm gövde verilince adresteki "Sağlık Sokak" yüzünden Sağlık İşleri Müdürlüğü
        öneriliyordu (tesadüfi kelimeler konuyla eşit ağırlık kazanıyor).
      · Yalnız `konu` verilince, çıkarıcı "T.C" gibi dejenere bir konu üretince keşif kör
        kalıyordu: link geliyor ama birim önerisi BOŞ çıkıyordu.
    """

    def test_ayirt_edici_konu_AYNEN_kullanilir(self) -> None:
        assert ra.kesif_konusu("ambulans gecikmesi hakkında", "uzun gövde metni") == \
            "ambulans gecikmesi hakkında"

    @pytest.mark.parametrize("dejenere", ["T.C", "", "  ", "ve", "talep"])
    def test_dejenere_konuda_govde_onekine_dusulur(self, dejenere: str) -> None:
        govde = "İlçemizde ambulans hizmetlerinde yaşanan gecikmeler hakkında " * 20
        sonuc = ra.kesif_konusu(dejenere, govde)
        assert "ambulans" in sonuc
        assert len(sonuc) <= 300, "tüm gövde verildi — öneri rastgeleleşir"

    def test_ikisi_de_bossa_cokmez(self) -> None:
        assert ra.kesif_konusu("", "") == ""


class TestBirimSecimi:
    def test_konuya_en_cok_ortusen_birim_secilir(self) -> None:
        birimler = ("Fen İşleri Müdürlüğü", "Ulaşım Dairesi Başkanlığı",
                    "Park ve Bahçeler Müdürlüğü")
        assert en_uygun_birim(birimler, "toplu taşıma ulaşım hattı") == \
            "Ulaşım Dairesi Başkanlığı"

    def test_ortusme_yoksa_bos_doner(self) -> None:
        """Zorlama öneri yapılmaz: alakasız konuda birim uydurmaktansa susmak doğrudur."""
        assert en_uygun_birim(("Fen İşleri Müdürlüğü",), "pasaport randevusu") == ""

    def test_evrak_zarfi_sozcukleri_secim_yapmaz(self) -> None:
        """'Şikâyet/başvuru/müdürlüğü' ayırt edici değildir; tek başına eşleşme sayılmaz."""
        birimler = ("Fen İşleri Müdürlüğü", "Zabıta Müdürlüğü")
        assert en_uygun_birim(birimler, "şikayet başvurusu hakkında talep") == ""


@pytest.mark.anyio
class TestYonlendirmeCiktisi:
    async def _fallback_ciktisi(self, monkeypatch, canli: dict | None):
        """Korpusta olmayan kuruma evrak: fallback yolu + sahte canlı kaynak.

        `aktif_kurum` ŞART: canlı keşif yalnız muhatap kurum ÇÖZÜMLENDİĞİNDE tetiklenir.
        İlk yazımda evrak metnine güvenilmişti, kurum tespit edilemedi ve blok hiç
        çalışmadı — test yanlış sebeple kırıldı. Bu da bir davranış kaydı: kurum
        bilinmiyorsa canlı keşif yapılmaz, çünkü hangi sitede aranacağı bilinmez.
        """
        async def _sahte(slug, konu, **kw):
            return canli

        monkeypatch.setattr(ra, "kurum_korpusta_var", lambda slug: False)
        monkeypatch.setattr(ra, "kurum_icin_oneri_async", _sahte)
        return await ra.route_ajan(
            {"evrak_text": "Toplu taşıma hattı talebi hakkında.",
             "aktif_kurum": "Tavşanlı Kaymakamlığı",
             "bilgi_unsurlari": {"konu": "toplu taşıma hattı talebi"}},
            {"birim_alternatifleri": []},
        )

    async def test_kurum_cozumlenemezse_canli_kesif_YAPILMAZ(self, monkeypatch) -> None:
        """Hangi sitede aranacağı bilinmiyorsa dışarı çıkmanın anlamı yok."""
        async def _patla(*a, **k):
            raise AssertionError("kurum bilinmezken canlı keşif çağrıldı")
        monkeypatch.setattr(ra, "kurum_korpusta_var", lambda slug: False)
        monkeypatch.setattr(ra, "kurum_icin_oneri_async", _patla)
        out = await ra.route_ajan(
            {"evrak_text": "Herhangi bir talep.", "bilgi_unsurlari": {"konu": "talep"}},
            {"birim_alternatifleri": []},
        )
        assert out["canli_kaynak"] == {}

    async def test_canli_kaynak_ciktida_gorunur(self, monkeypatch) -> None:
        out = await self._fallback_ciktisi(monkeypatch, _CANLI)
        assert out["canli_kaynak"]["url"] == _CANLI["url"]
        assert _CANLI["url"] in out["birim_reasoning"]

    async def test_otomatik_havale_URETILMEZ(self, monkeypatch) -> None:
        """En kritik değişmez: link gösterilse de hedef üretilmez."""
        out = await self._fallback_ciktisi(monkeypatch, _CANLI)
        assert out["hedef_birim"] is None
        assert out["insan_onayi_gerekli"] is True
        assert out["durum"] == "fallback_onerisi"

    async def test_canli_veri_dogrulanmis_kunyeye_SIZMAZ(self, monkeypatch) -> None:
        """`hedef_birim_kaynak` yalnız korpus künyesidir; canlı URL oraya girmemeli."""
        out = await self._fallback_ciktisi(monkeypatch, _CANLI)
        kunye = out.get("hedef_birim_kaynak") or {}
        assert _CANLI["url"] not in str(kunye)
        assert out["canli_kaynak"]["dogrulanmis"] is False

    async def test_canli_kaynak_yoksa_akis_bozulmaz(self, monkeypatch) -> None:
        out = await self._fallback_ciktisi(monkeypatch, None)
        assert out["canli_kaynak"] == {}
        assert out["durum"] == "fallback_onerisi"

    async def test_canli_kaynak_HATASI_yonlendirmeyi_dusurmez(self, monkeypatch) -> None:
        """Dış ağ hatası evrak işlemeyi durdurmamalı — keşif bir EK'tir, zorunluluk değil."""
        async def _patla(*a, **k):
            raise RuntimeError("ağ öldü")
        monkeypatch.setattr(ra, "kurum_korpusta_var", lambda slug: False)
        monkeypatch.setattr(ra, "kurum_icin_oneri_async", _patla)
        out = await ra.route_ajan(
            {"evrak_text": "Talep hakkında.", "aktif_kurum": "Tavşanlı Kaymakamlığı",
             "bilgi_unsurlari": {"konu": "talep"}},
            {"birim_alternatifleri": []},
        )
        assert out["durum"] == "fallback_onerisi"
        assert out["canli_kaynak"] == {}

    async def test_korpusta_OLAN_kurumda_canli_kesif_CALISMAZ(self, monkeypatch) -> None:
        """Boşuna ağ isteği ve gecikme olmasın: korpus varsa dışarı çıkılmaz."""
        async def _patla(*a, **k):
            raise AssertionError("korpus varken canlı keşif çağrıldı")
        monkeypatch.setattr(ra, "kurum_korpusta_var", lambda slug: True)
        monkeypatch.setattr(ra, "kurum_icin_oneri_async", _patla)
        out = await ra.route_ajan(
            {"evrak_text": "Talep hakkında.", "aktif_kurum": "Yenimahalle Belediyesi",
             "bilgi_unsurlari": {"konu": "talep"}},
            {"birim_alternatifleri": []},
        )
        assert out["canli_kaynak"] == {}
