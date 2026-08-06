"""Web aramalı kaynak keşfi — bütçe tavanı ve adres güvenliği.

Bu, canlı keşfin TEK ÜCRETLİ katmanı ve dış bir modelin çıktısıyla ağa çıkıyor. Testlerin
tamamı bu iki riski hedefler:

  1. PARA — tavan aşılırsa katman kendini kapatmalı. Kullanıcının hesabında sınırlı
     bakiye var; "sessizce harcamaya devam etmek" kabul edilemez.
  2. ADRES — model `allowed_domains` ile kısıtlansa bile dönen adres YERELDE de
     doğrulanır (kemer + askı). Filtrenin ileride değişmesi ya da modelin metin içinde
     başka bir adres yazması bizi izinsiz alana götürmemeli.

TESTLER AĞA ÇIKMAZ ve API ANAHTARI GEREKTİRMEZ. `kaynak_sayfasi_ara` yalnız kapalıyken
çağrılır (None dönmeli); açıkken gerçek istek atacağı için test edilmez — para harcayan
bir testi CI'da koşturmak yanlış olur.
"""
from __future__ import annotations

import json

import pytest

from core import kaynak_web_arama as kwa


@pytest.fixture(autouse=True)
def _temiz_cevre(monkeypatch, tmp_path):
    """Her test kendi harcama dosyasıyla çalışsın; gerçek sayaç kirlenmesin."""
    monkeypatch.setattr(kwa, "_HARCAMA_DOSYASI", tmp_path / "harcama.json")
    monkeypatch.delenv("KESIF_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("KESIF_AZAMI_HARCAMA_USD", raising=False)
    monkeypatch.delenv("KESIF_ARAMA_MODEL", raising=False)


class TestButceTavani:
    def test_anahtar_yoksa_kapali(self, monkeypatch) -> None:
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        assert not kwa.acik_mi()

    def test_tavan_sifirsa_kapali(self, monkeypatch) -> None:
        """KESIF_AZAMI_HARCAMA_USD=0 → web araması tamamen kapalı (acil kapatma)."""
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "0")
        assert not kwa.acik_mi()

    def test_tavan_tanimsizsa_kapali(self, monkeypatch) -> None:
        """Varsayılan KAPALI: yanlışlıkla para harcanmasın."""
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        assert not kwa.acik_mi()

    def test_bozuk_tavan_degeri_kapali_sayilir(self, monkeypatch) -> None:
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "bir buçuk dolar")
        assert not kwa.acik_mi()

    def test_tavana_ulasinca_kapanir(self, monkeypatch) -> None:
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        assert kwa.acik_mi()
        kwa._harcamayi_yaz(1.50)
        assert not kwa.acik_mi(), "tavana ulaşıldığı hâlde açık kaldı"

    def test_kapaliyken_arama_none_doner_ve_istek_atmaz(self, monkeypatch) -> None:
        """Kapalıyken ağa hiç çıkılmamalı — httpx.post çağrılırsa test kırılır."""
        def _patlat(*a, **k):
            raise AssertionError("kapalıyken ağa çıkıldı")
        monkeypatch.setattr(kwa.httpx, "post", _patlat)
        assert kwa.kaynak_sayfasi_ara("Tokat Defterdarlığı") is None

    def test_harcama_dosyasi_bozuksa_sifir_sayilir(self) -> None:
        kwa._HARCAMA_DOSYASI.write_text("{bozuk", encoding="utf-8")
        assert kwa.harcanan() == 0.0

    def test_harcama_birikerek_yazilir(self) -> None:
        kwa._harcamayi_yaz(0.25)
        assert kwa.harcanan() == pytest.approx(0.25)
        kwa._harcamayi_yaz(kwa.harcanan() + 0.10)
        assert kwa.harcanan() == pytest.approx(0.35)
        kayit = json.loads(kwa._HARCAMA_DOSYASI.read_text(encoding="utf-8"))
        assert "usd" in kayit


class TestMaliyetHesabi:
    def test_ucuz_model_pahalidan_dusuk(self) -> None:
        """Ölçülen çağrı (10.613 girdi + 178 çıktı) — luna varsayılan olmalı."""
        luna = kwa._maliyet("gpt-5.6-luna", 10613, 178)
        terra = kwa._maliyet("gpt-5.6-terra", 10613, 178)
        assert luna < terra
        assert luna == pytest.approx(0.00234, abs=1e-4)

    def test_bilinmeyen_model_pahali_sayilir(self) -> None:
        """Fiyatı bilinmeyen model ucuz varsayılırsa tavan geç devreye girer."""
        assert kwa._maliyet("yeni-model", 10613, 178) == kwa._maliyet(
            "gpt-5.6-terra", 10613, 178
        )


class TestAdresGuvenligi:
    def test_arama_alanlari_resmi_ve_dar(self) -> None:
        assert set(kwa.IZINLI_ARAMA_ALANLARI) == {"gov.tr", "bel.tr", "edu.tr"}

    @pytest.mark.parametrize("url,izinli", [
        ("https://tokat.gov.tr/il-defterdarligi", True),
        ("https://www.selcuklu.bel.tr/mudurlukler", True),
        ("https://kotu.com/birimler", False),
        ("https://tokat.gov.tr.saldirgan.com/x", False),
        ("http://tokat.gov.tr/x", False),
    ])
    def test_donen_adres_yerelde_de_dogrulanir(self, url: str, izinli: bool) -> None:
        """API filtresine ek olarak yerel kontrol — kemer + askı."""
        from core.sayfa_kesif import izinli_mi
        assert izinli_mi(url) is izinli
