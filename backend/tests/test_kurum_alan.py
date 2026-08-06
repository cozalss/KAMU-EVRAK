"""Kurum sicilinden resmî alan adı türetme — ölçülmüş kalıpların kilidi.

Doğrulanmamış bir kuruma evrak geldiğinde memura kuru tahmin yerine KAYNAK LİNKİ
göstermek istiyoruz. Adres sicilde yok (4066 kaydın 26'sında dolu, %0,6) ama Türk kamu
kurumlarının alan adları kalıplı. Kalıplar 2026-08-06'da gerçek isteklerle ölçüldü;
bu dosya o ölçümü donduruyor.

TEST AĞA ÇIKMAZ. `aday_alanlar` saf bir fonksiyondur: yalnız nereye bakılacağını söyler.
Adresin gerçekten açılıp açılmadığı çağıran katmanın işidir ve ağ testine tabi değildir —
aksi hâlde bir kurumun sitesi geçici olarak düştüğünde CI kırılırdı.

ÜRETİLEN ADRES KAYNAK DEĞİLDİR: o adresten indirilen sayfa birim adlarını birebir
içermiyorsa hiçbir şey yazılmaz (metin kapısı ayrı).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.kurum_alan import aday_alanlar, il_slugu, kalip_var_mi

_SICIL = Path(__file__).resolve().parents[2] / "data" / "teskilat" / "sicil.json"


def _kayitlar() -> dict[str, dict]:
    ham = json.loads(_SICIL.read_text(encoding="utf-8"))
    return {x["slug"]: x for x in ham.get("kurumlar", ham)}


# (slug, beklenen adresin adaylar arasında bulunması) — hepsi 2026-08-06'da ÇALIŞTIĞI
# ölçülmüş gerçek adreslerdir.
OLCULEN = (
    ("nilufer-belediyesi", "https://www.nilufer.bel.tr"),
    ("selcuklu-belediyesi", "https://www.selcuklu.bel.tr"),
    ("kayseri-valiligi", "https://www.kayseri.gov.tr"),
    ("ordu-valiligi", "https://www.ordu.gov.tr"),
    ("tavsanli-kaymakamligi", "https://tavsanli.gov.tr"),
    ("izmir-il-saglik-mudurlugu", "https://izmirism.saglik.gov.tr"),
    ("konya-il-saglik-mudurlugu", "https://konyaism.saglik.gov.tr"),
    ("samsun-il-tarim-orman-mudurlugu", "https://samsun.tarimorman.gov.tr"),
    ("kayseri-il-milli-egitim-mudurlugu", "https://kayseri.meb.gov.tr"),
)


class TestOlculenKaliplar:
    @pytest.mark.parametrize("slug,beklenen", OLCULEN)
    def test_gercek_adres_adaylar_arasinda(self, slug: str, beklenen: str) -> None:
        kayit = _kayitlar().get(slug)
        assert kayit is not None, f"{slug} sicilde yok"
        assert beklenen in aday_alanlar(kayit), (slug, aday_alanlar(kayit))


class TestTurkceVeCokKelime:
    def test_turkce_harf_ascii_ye_duser(self) -> None:
        """'Şanlıurfa' → 'sanliurfa'. Düşmezse alan adı hiç açılmaz."""
        kayit = _kayitlar()["sanliurfa-valiligi"]
        assert "https://www.sanliurfa.gov.tr" in aday_alanlar(kayit)
        assert all("ş" not in a and "ı" not in a for a in aday_alanlar(kayit))

    def test_cok_kelimeli_adda_tiresiz_varyant_da_uretilir(self) -> None:
        """Türk kamu alan adları tireyi genelde atar; ikisi de denenmeli."""
        kayit = _kayitlar()["19-mayis-belediyesi"]
        adaylar = aday_alanlar(kayit)
        assert any("19-mayis.bel.tr" in a for a in adaylar), adaylar
        assert any("19mayis.bel.tr" in a for a in adaylar), adaylar

    def test_il_slugu_bosluk_ve_turkce_temizler(self) -> None:
        assert il_slugu({"il": "Kahramanmaraş"}) == "kahramanmaras"
        assert il_slugu({"il": "Afyonkarahisar"}) == "afyonkarahisar"


class TestKalipYoksaBosDoner:
    """Kalıp uydurmaktansa boş dönmek: yanlış alan adı hem zaman kaybı hem yanlış
    kuruma ait siteye düşme riskidir. Boş liste = çağıran LLM aramasına düşer."""

    def test_universite_kalibi_YOK(self) -> None:
        """Üniversite alan adları kalıplı değil (agu.edu.tr, boun.edu.tr, itu.edu.tr)."""
        assert not kalip_var_mi("universite")
        kayit = _kayitlar()["abdullah-gul-universitesi"]
        assert aday_alanlar(kayit) == []

    def test_olculmemis_il_mudurlugu_turu_bos_doner(self) -> None:
        kayit = _kayitlar().get("adana-il-jandarma-komutanligi")
        if kayit is not None:
            assert aday_alanlar(kayit) == []

    def test_bilinmeyen_tur_bos_doner(self) -> None:
        assert aday_alanlar({"slug": "bir-sey", "tur": "bilinmeyen-tur"}) == []

    def test_slugsuz_kayit_bos_doner(self) -> None:
        assert aday_alanlar({"tur": "belediye"}) == []


class TestCakismaKapisi:
    """Merkez ilçe kaymakamlığı valiliğin adresine düşüyordu — yanlış kurumun sitesi.

    Kimlik kapısı (core.kurum_kimligi) bunu YAKALAYAMAZ: "Adıyaman Kaymakamlığı" ile
    "Adıyaman Valiliği"nin tek ayırt edici kelimesi "adıyaman"dır ve valilik sayfasında
    da geçer. Bu yüzden kapı burada, aday üretiminde olmalı.
    """

    def test_merkez_ilce_kaymakamligi_ADAY_URETMEZ(self) -> None:
        assert aday_alanlar({"slug": "adiyaman-kaymakamligi", "tur": "kaymakamlik",
                             "il": "Adıyaman"}) == []

    def test_valiligin_kendi_adayi_ETKILENMEZ(self) -> None:
        adaylar = aday_alanlar({"slug": "adiyaman-valiligi", "tur": "valilik",
                                "il": "Adıyaman"})
        assert "https://www.adiyaman.gov.tr" in adaylar

    def test_gercek_ilce_kaymakamligi_calismaya_DEVAM_EDER(self) -> None:
        """Kapı dar olmalı: yalnız ilçe adı il adına EŞİTSE kapanır."""
        adaylar = aday_alanlar({"slug": "tavsanli-kaymakamligi", "tur": "kaymakamlik",
                                "il": "Kütahya"})
        assert "https://tavsanli.gov.tr" in adaylar

    def test_sicildeki_TUM_kaymakamliklar_valilik_adresine_dusmez(self) -> None:
        """Tek örnek değil, korpusun tamamı taranır."""
        kayitlar = list(_kayitlar().values())
        valilik_alanlari = {
            a for k in kayitlar if k.get("tur") == "valilik" for a in aday_alanlar(k)
        }
        cakisan = [
            k["slug"] for k in kayitlar if k.get("tur") == "kaymakamlik"
            if set(aday_alanlar(k)) & valilik_alanlari
        ]
        assert not cakisan, f"valilik adresine düşen kaymakamlık: {cakisan[:5]}"


class TestMerkeziKalip:
    """`<slug>.gov.tr` — 90 karantina kurumunda ölçüldü, 19'u tuttu (bkz. _MERKEZI_OLCUMU).

    Bu kalıp TEK BAŞINA güvenli değildir: kısaltmalar çakışıyor (ttk.gov.tr = Türk Tarih
    Kurumu, sicildeki `ttk` = Türkiye Taşkömürü Kurumu). Güvenliği `kurum_kimligi` kapısı
    sağlar; o kapının kendi testi tests/test_kurum_kimligi.py'dedir.
    """

    @pytest.mark.parametrize("tur", ["diger", "kit", "ust_kurul", "bagli_kurulus"])
    def test_merkezi_turlerde_slug_alan_adi_olur(self, tur: str) -> None:
        adaylar = aday_alanlar({"slug": "tubitak", "tur": tur})
        assert adaylar == ["https://www.tubitak.gov.tr", "https://tubitak.gov.tr"]

    def test_tireli_slugda_tiresiz_varyant_da_denenir(self) -> None:
        adaylar = aday_alanlar({"slug": "eti-maden", "tur": "kit"})
        assert "https://www.eti-maden.gov.tr" in adaylar
        assert "https://etimaden.gov.tr" in adaylar

    @pytest.mark.parametrize("tur", ["elektrik_dagitim", "dogalgaz_dagitim"])
    def test_ozel_sirketlere_kalip_UYGULANMAZ(self, tur: str) -> None:
        """Ölçümde 21/21 başarısız (.com.tr kullanıyorlar) — boş istek atılmaz."""
        assert aday_alanlar({"slug": "aydem", "tur": tur}) == []
        assert not kalip_var_mi(tur)


class TestKapsam:
    def test_kalibi_olan_kurum_sayisi_olculdu(self) -> None:
        """Kalıbın kaç kurumu kapsadığı görünür olsun; daralırsa fark edilsin."""
        kayitlar = list(_kayitlar().values())
        kapsanan = sum(1 for k in kayitlar if aday_alanlar(k))
        # Ölçüldü 2026-08-06: belediye+valilik+kaymakamlık+il özel idare+defterdarlık
        # ve ölçülmüş il müdürlüğü türleri. 2026-08-06 (2. dalga): +merkezî kurumlar
        # (diger/kit/ust_kurul/cumhurbaskanligi_ofis_kurul = 227 kayıt).
        assert kapsanan > 2700, kapsanan
