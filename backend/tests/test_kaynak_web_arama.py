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
    """Her test kendi harcama defteriyle çalışsın; gerçek sayaç kirlenmesin."""
    monkeypatch.setattr(kwa, "_HARCAMA_DOSYASI", tmp_path / "harcama.json")
    monkeypatch.setattr(kwa, "_YAZILAMIYOR", False)
    # Süreç-içi yüksek su seviyesi modül genelindedir; sıfırlanmazsa bir testin harcaması
    # sonrakine sızar (dosya izole olsa bile). monkeypatch test sonunda geri yükler.
    monkeypatch.setattr(kwa, "_SURECTE_HARCANAN", 0.0)
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
        kwa._deftere_ekle(1.50)
        assert not kwa.acik_mi(), "tavana ulaşıldığı hâlde açık kaldı"

    def test_kapaliyken_arama_none_doner_ve_istek_atmaz(self, monkeypatch) -> None:
        """Kapalıyken ağa hiç çıkılmamalı — httpx.post çağrılırsa test kırılır."""
        def _patlat(*a, **k):
            raise AssertionError("kapalıyken ağa çıkıldı")
        monkeypatch.setattr(kwa.httpx, "post", _patlat)
        assert kwa.kaynak_sayfasi_ara("Tokat Defterdarlığı") is None

    def test_defter_BOZUKSA_katman_KAPANIR_fail_closed(self, monkeypatch) -> None:
        """Eskiden burada 0 dönülüyordu ve tek bozuk yazma tavanı SIFIRLIYORDU.

        Bozuk defter "harcanmadı" anlamına gelmez — ne kadar harcandığını bilmiyoruz,
        bu yüzden harcamayı durdurmak tek doğru yön.
        """
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        kwa._HARCAMA_DOSYASI.write_text('{"usd": 0.5}\n{bozu', encoding="utf-8")
        assert kwa.harcanan() == float("inf")
        assert not kwa.acik_mi()

    def test_defter_HIC_YOKSA_sifir_sayilir(self) -> None:
        """İlk çalıştırma meşrudur; yalnız VAR OLAN bozuk defter alarm sebebidir."""
        assert not kwa._HARCAMA_DOSYASI.exists()
        assert kwa.harcanan() == 0.0

    def test_defter_SILINIRSE_tavan_geri_ACILMAZ(self) -> None:
        """"Dosya yoksa 0" kuralı tek başına tavanı SİLİNEBİLİR bir dosyaya bağlıyordu.

        Log rotasyonu, disk temizliği ya da `git clean -fdx` bütçeyi sıfırlayabilirdi.
        Süreç-içi yüksek su seviyesi bunu engeller: süreç yaşadıkça harcama unutulmaz.
        """
        kwa._deftere_ekle(1.60)
        kwa._HARCAMA_DOSYASI.unlink()
        assert kwa.harcanan() >= 1.60, "defter silinince harcama unutuldu"

    def test_defter_yazilamazsa_katman_kapanir(self, monkeypatch) -> None:
        """Harcamayı kaydedemiyorsak harcama yapmayız."""
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        # Yol bir DOSYAnın altına iniyor → dizin oluşturulamaz, yazım OSError verir.
        engel = kwa._HARCAMA_DOSYASI.parent / "engel"
        engel.write_text("dosya", encoding="utf-8")
        monkeypatch.setattr(kwa, "_HARCAMA_DOSYASI", engel / "alt" / "x.json")
        assert kwa._deftere_ekle(0.01) is False
        assert not kwa.acik_mi()

    def test_harcama_birikerek_EKLENIR(self) -> None:
        kwa._deftere_ekle(0.25)
        assert kwa.harcanan() == pytest.approx(0.25)
        kwa._deftere_ekle(0.10)
        assert kwa.harcanan() == pytest.approx(0.35)
        satirlar = kwa._HARCAMA_DOSYASI.read_text(encoding="utf-8").strip().splitlines()
        assert len(satirlar) == 2, "üzerine yazıldı — defter olmalı"
        assert "usd" in json.loads(satirlar[0])

    def test_ESZAMANLI_harcama_KAYBOLMAZ(self, monkeypatch) -> None:
        """Denetimde ölçülen asıl hata: 20 thread × 10 artım → paranın %96,5'i kaybolmuştu.

        Defter (yalnız ekleme) bu yarışı yapısal olarak ortadan kaldırır: kimse kimsenin
        satırını ezemez.
        """
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=20) as havuz:
            list(havuz.map(lambda _: kwa._deftere_ekle(0.001), range(200)))
        assert kwa.harcanan() == pytest.approx(0.200, abs=1e-6)

    def test_rezervasyon_tavani_ESZAMANLI_da_korur(self, monkeypatch) -> None:
        """TOCTOU: eskiden tavana kıl payı kala 50 eşzamanlı kontrolün 50'si de geçiyordu."""
        from concurrent.futures import ThreadPoolExecutor
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "0.10")
        with ThreadPoolExecutor(max_workers=25) as havuz:
            gecen = sum(havuz.map(lambda _: bool(kwa._rezerve_et()), range(100)))
        # Her geçiş _REZERVASYON_USD düşürür; tavan 0.10 / rezervasyon 0.02 → en çok 5.
        assert gecen <= 5, f"tavan aşıldı: {gecen} çağrı geçti"
        assert kwa.harcanan() <= 0.10 + kwa._REZERVASYON_USD


class TestMaliyetHesabi:
    def test_ucuz_model_pahalidan_dusuk(self) -> None:
        """Ölçülen çağrı (10.613 girdi + 178 çıktı) — luna varsayılan olmalı."""
        luna = kwa._maliyet("gpt-5.6-luna", 10613, 178)
        terra = kwa._maliyet("gpt-5.6-terra", 10613, 178)
        assert luna < terra

    def test_ARAC_UCRETI_sayilir_olculen_bedelin_altina_INILMEZ(self) -> None:
        """`web_search` çağrı başına ayrıca faturalanır; yalnız token saymak 3,4 kat eksikti.

        Deponun kendi ölçümü aynı çağrı için ≈$0,008 diyor; hesap bunun altına inmemeli,
        yoksa $1,50 tavanı gerçekte ~$5 harcandığında devreye girer.
        """
        assert kwa._maliyet("gpt-5.6-luna", 10613, 178) >= 0.008

    def test_usage_okunamazsa_SIFIR_yazilmaz(self) -> None:
        """Sıfır maliyet 'ücretsiz çağrı' demektir ve tavanı sonsuza dek açık bırakır."""
        assert kwa._maliyet("gpt-5.6-luna", 0, 0) >= 0.008

    def test_cok_arama_daha_pahali_sayilir(self) -> None:
        assert kwa._maliyet("gpt-5.6-terra", 10613, 178, 3) > \
            kwa._maliyet("gpt-5.6-terra", 10613, 178, 1)

    def test_bilinmeyen_model_pahali_sayilir(self) -> None:
        """Fiyatı bilinmeyen model ucuz varsayılırsa tavan geç devreye girer."""
        assert kwa._maliyet("yeni-model", 10613, 178) == kwa._maliyet(
            "gpt-5.6-terra", 10613, 178
        )


class TestTekCagriSiniri:
    def test_istek_govdesi_cikti_ve_arac_sayisini_SINIRLAR(self, monkeypatch) -> None:
        """Sınırsız çıktı/araç çağrısı tek başına tavanı aşabilir."""
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        yakalanan: dict = {}

        class _Yanit:
            status_code = 500
            def json(self):
                return {}

        def _sahte_post(url, **kw):
            yakalanan.update(kw.get("json") or {})
            return _Yanit()

        monkeypatch.setattr(kwa.httpx, "post", _sahte_post)
        kwa.kaynak_sayfasi_ara("Örnek Kurumu")
        assert yakalanan.get("max_output_tokens") == 120
        assert yakalanan.get("max_tool_calls") == 2

    def test_hata_yolunda_REZERVASYON_geri_alinmaz(self, monkeypatch) -> None:
        """Timeout'ta çağrı faturalanmış olabilir; sayaç bunu varsaymalı (fazla say)."""
        monkeypatch.setenv("KESIF_OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("KESIF_AZAMI_HARCAMA_USD", "1.50")
        monkeypatch.setattr(kwa.httpx, "post",
                            lambda *a, **k: (_ for _ in ()).throw(TimeoutError()))
        assert kwa.kaynak_sayfasi_ara("Örnek Kurumu") is None
        assert kwa.harcanan() == pytest.approx(kwa._REZERVASYON_USD)


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
