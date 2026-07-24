"""Kurum sicili — şema, üretim ve GÜVENLİK POLİTİKASI (INV-1..INV-5) testleri.

Sözleşme: docs/10-kurum-sicili.md. Sicil türetilmiş/ikincil veridir; kurum TANIMA ve TÜR
tespiti yapar, birim/görev ÜRETMEZ ve otomatik havale yetkisi KAZANDIRMAZ.
"""
from __future__ import annotations

import pytest

from agents.kurum_kimlik import ad_to_kurum
from agents.nodes.teskilat_ara import (
    _kanonik_slug,
    kurum_korpusta_var,
    teskilat_birim_ara,
)
from core.sicil import (
    GECERLI_GUVEN,
    GECERLI_TURLER,
    kayit_dogrula,
    sicil_cozumle,
)
from scripts.uret_sicil import sicil_uret

# --- fixture girdileri (Faz 0 çıktısının küçük, deterministik örneği) ---------------

_IL_ILCE = {
    "kaynaklar": [{"url": "https://www.icisleri.gov.tr/ornek", "erisim": "2026-07-24"}],
    "iller": [
        {"plaka": 6, "il": "Ankara", "buyuksehir": True, "ilceler": ["Çankaya", "Gölbaşı"]},
        {"plaka": 2, "il": "Adıyaman", "buyuksehir": False, "ilceler": ["Merkez", "Gölbaşı"]},
    ],
}
_UNIVERSITE = {
    "kaynaklar": [{"url": "https://www.yok.gov.tr/ornek", "erisim": "2026-07-24"}],
    "universiteler": [
        {"ad": "Ankara Üniversitesi", "tur": "devlet", "il": "Ankara",
         "web": "ankara.edu.tr", "kaynak_guveni": "resmi"},
    ],
}
_MERKEZI = {
    "kaynaklar": [{"url": "https://www.mevzuat.gov.tr/ornek", "erisim": "2026-07-24"}],
    "kurumlar": [
        {"ad": "Sosyal Güvenlik Kurumu", "kisaltma": "SGK", "tur": "ilgili_kurulus",
         "bagli_oldugu": "Çalışma ve Sosyal Güvenlik Bakanlığı", "web": "sgk.gov.tr",
         "kaynak_guveni": "resmi"},
        {"ad": "İl Millî Eğitim Müdürlüğü", "kisaltma": "", "tur": "tasra_teskilati",
         "bagli_oldugu": "Millî Eğitim Bakanlığı", "kaynak_guveni": "resmi"},
    ],
}
_ALTYAPI = {
    "kaynaklar": [{"url": "https://www.epdk.gov.tr/ornek", "erisim": "2026-07-24"}],
    "kuruluslar": [
        {"ad": "Uludağ Elektrik Dağıtım A.Ş.", "kisaltma": "UEDAŞ", "tur": "elektrik_dagitim",
         "hizmet_bolgesi": ["Bursa"], "web": "uedas.com.tr", "kaynak_guveni": "resmi"},
        {"ad": "Ankara Su ve Kanalizasyon İdaresi", "kisaltma": "ASKİ",
         "tur": "su_kanalizasyon", "hizmet_bolgesi": ["Ankara"], "kaynak_guveni": "resmi"},
        {"ad": "Adana Su ve Kanalizasyon İdaresi", "kisaltma": "ASKİ",
         "tur": "su_kanalizasyon", "hizmet_bolgesi": ["Adana"], "kaynak_guveni": "resmi"},
    ],
}


@pytest.fixture
def sicil() -> dict:
    return sicil_uret({
        "il_ilce": _IL_ILCE,
        "universiteler": _UNIVERSITE,
        "merkezi_teskilat": _MERKEZI,
        "altyapi": _ALTYAPI,
    })


def _slugs(sicil: dict) -> set[str]:
    return {k["slug"] for k in sicil["kurumlar"]}


# --- şema + üretim ----------------------------------------------------------------

def test_valilik_ve_kaymakamlik_adlandirma_mevzuatindan_uretilir(sicil: dict) -> None:
    sluglar = _slugs(sicil)

    assert "ankara-valiligi" in sluglar
    assert "cankaya-kaymakamligi" in sluglar
    assert "adiyaman-valiligi" in sluglar


def test_buyuksehir_ve_ilce_belediyesi_ayrimi(sicil: dict) -> None:
    kayitlar = {k["slug"]: k for k in sicil["kurumlar"]}

    assert kayitlar["ankara-buyuksehir-belediyesi"]["alt_tur"] == "buyuksehir"
    assert kayitlar["cankaya-belediyesi"]["alt_tur"] == "ilce"
    assert kayitlar["cankaya-belediyesi"]["il"] == "Ankara"


def test_slug_kurum_kimlik_cozumlemesiyle_birebir_ayni(sicil: dict) -> None:
    """Sicil slug'ı kurum_kimlik'in ürettiğiyle aynı olmalı; yoksa çözümleme ıskalar."""
    for kayit in sicil["kurumlar"]:
        if kayit["tur"] in {"valilik", "kaymakamlik", "belediye", "universite"}:
            assert ad_to_kurum(kayit["ad"])["slug"] == kayit["slug"], kayit["ad"]


def test_tasra_adlari_kanonik_ekli_yazilir() -> None:
    """REGRESYON: şablon yalın hâlde yazılırsa ("Defterdarlık") üretilen ad resmî yazımla
    ("Adana Defterdarlığı") uyuşmaz ve evraktan gelen slug sicili ISKALAR."""
    uretilen = sicil_uret({
        "il_ilce": {"kaynaklar": [], "iller": [{"il": "Adana", "buyuksehir": True,
                                                "ilceler": []}]},
        "merkezi_teskilat": {"kaynaklar": [], "kurumlar": [
            {"ad": "Defterdarlığı", "tur": "tasra_teskilati", "bagli_oldugu": "Hazine"},
        ]},
    })
    tasra = [k for k in uretilen["kurumlar"] if k["tur"] in {"defterdarlik", "il_mudurlugu"}]

    assert tasra
    for kayit in tasra:
        assert ad_to_kurum(kayit["ad"])["tur"] != "diger", (
            f"tanınmayan kurum tipi (yalın şablon?): {kayit['ad']!r}")
        assert ad_to_kurum(kayit["ad"])["slug"] == kayit["slug"]


def test_tasra_teskilati_her_il_icin_uretilir(sicil: dict) -> None:
    sluglar = _slugs(sicil)

    assert "ankara-il-milli-egitim-mudurlugu" in sluglar
    assert "adiyaman-il-milli-egitim-mudurlugu" in sluglar


def test_tur_kapali_kume_disi_deger_hata_verir() -> None:
    hatali = {"kurumlar": [{"ad": "Örnek Kurum", "tur": "uydurma_tur"}], "kaynaklar": []}

    with pytest.raises(ValueError, match="tur"):
        sicil_uret({"merkezi_teskilat": hatali})


def test_kayit_dogrula_eksik_alani_bildirir() -> None:
    hatalar = kayit_dogrula({"slug": "", "ad": "X", "tur": "belediye",
                             "kaynak_guveni": "turetilmis"})

    assert any("slug" in h for h in hatalar)


# --- INV-5: alias çakışması --------------------------------------------------------

def test_cakisan_kisaltma_alias_haritasindan_dusurulur(sicil: dict) -> None:
    """ASKİ hem Ankara hem Adana → belirsiz kısaltma kimseye yönlenmez."""
    assert "aski" not in sicil["aliaslar"]
    assert "aski" in sicil["cakisan_aliaslar"]
    assert sicil["aliaslar"].get("uedas") == "uludag-elektrik-dagitim-a-s"


def test_ayni_kurum_iki_tabloda_tekillestirilir() -> None:
    """Bakanlık hem merkezi_teskilat hem e-Devlet tablosunda → TEK kayıt, belirsiz DEĞİL.
    Yüksek güvenli kayıt kazanır, alias'lar birleşir."""
    uretilen = sicil_uret({
        "merkezi_teskilat": {"kaynaklar": [], "kurumlar": [
            {"ad": "Ticaret Bakanlığı", "tur": "bakanlik", "kaynak_guveni": "ikincil"},
        ]},
        "edevlet": {"kaynaklar": [], "kurumlar": [
            {"ad": "Ticaret Bakanlığı", "tur": "bakanlik", "kisaltma": "TB",
             "kaynak_guveni": "resmi"},
        ]},
    })
    kayitlar = [k for k in uretilen["kurumlar"] if k["slug"] == "ticaret-bakanligi"]

    assert len(kayitlar) == 1
    assert kayitlar[0]["kaynak_guveni"] == "resmi"
    assert not kayitlar[0].get("belirsiz")
    assert sicil_cozumle("ticaret-bakanligi", sicil=uretilen) is not None


def test_ad_varyanti_ayni_kisaltmayla_birlestirilir() -> None:
    """"EPDK" hem "... Kurumu" hem "... Kurumu Başkanlığı" adıyla geçiyor → TEK kurum;
    alias düşmez, kısa ad da kanonik kayda çözümlenir."""
    uretilen = sicil_uret({
        "merkezi_teskilat": {"kaynaklar": [], "kurumlar": [
            {"ad": "Enerji Piyasası Düzenleme Kurumu", "tur": "ust_kurul",
             "kisaltma": "EPDK", "kaynak_guveni": "ikincil"},
        ]},
        "edevlet": {"kaynaklar": [], "kurumlar": [
            {"ad": "Enerji Piyasası Düzenleme Kurumu Başkanlığı", "tur": "ust_kurul",
             "kisaltma": "EPDK", "kaynak_guveni": "resmi"},
        ]},
    })

    assert "epdk" not in uretilen["cakisan_aliaslar"]
    assert uretilen["aliaslar"]["epdk"] == "enerji-piyasasi-duzenleme-kurumu-baskanligi"
    assert sicil_cozumle("enerji-piyasasi-duzenleme-kurumu", sicil=uretilen) is not None
    assert len(uretilen["kurumlar"]) == 1


def test_as_genel_mudurlugu_adinda_kurum_adi_dusmez() -> None:
    """"... A.Ş. Genel Müdürlüğü" adlarında slug tüm kurumlarda 'genel-mudurlugu'ya
    çökmemeli — aksi hâlde TEDAŞ/TEİAŞ/EÜAŞ birbirine karışır (2026-07-24 bulgusu)."""
    uretilen = sicil_uret({"edevlet": {"kaynaklar": [], "kurumlar": [
        {"ad": "Türkiye Elektrik Dağıtım A.Ş. Genel Müdürlüğü", "tur": "kit",
         "kisaltma": "TEDAŞ", "kaynak_guveni": "resmi"},
        {"ad": "Türkiye Elektrik İletim A.Ş. Genel Müdürlüğü", "tur": "kit",
         "kisaltma": "TEİAŞ", "kaynak_guveni": "resmi"},
    ]}})
    sluglar = _slugs(uretilen)

    assert "genel-mudurlugu" not in sluglar
    assert len(sluglar) == 2
    assert uretilen["aliaslar"]["tedas"].startswith("turkiye-elektrik-dagitim")
    assert not any(k.get("belirsiz") for k in uretilen["kurumlar"])


def test_ayni_slug_iki_ilde_belirsiz_isaretlenir(sicil: dict) -> None:
    """Gölbaşı hem Ankara hem Adıyaman ilçesi → slug tekil kaydı ÇÖZÜMLEYEMEZ."""
    golbasi = [k for k in sicil["kurumlar"] if k["slug"] == "golbasi-belediyesi"]

    assert len(golbasi) == 2
    assert all(k.get("belirsiz") is True for k in golbasi)
    assert sicil_cozumle("golbasi-belediyesi", sicil=sicil) is None


# --- INV-1..INV-4: güvenlik politikası --------------------------------------------

def test_inv3_hicbir_kayit_resmi_dogrulanmis_olamaz(sicil: dict) -> None:
    for kayit in sicil["kurumlar"]:
        assert kayit["kaynak_guveni"] in GECERLI_GUVEN
        assert kayit["kaynak_guveni"] != "resmi_dogrulanmis"


def test_inv4_sicil_birim_veya_gorev_icermez(sicil: dict) -> None:
    yasak = {"birim_ad", "gorev", "birimler", "text"}

    for kayit in sicil["kurumlar"]:
        assert not (yasak & set(kayit)), kayit["slug"]


def test_inv1_sicil_kaydi_otomatik_havale_yetkisi_vermez(sicil: dict) -> None:
    """Sicilde SGK var ama korpusta doğrulanmış kaynağı yok → otomatik havale KAPALI."""
    assert sicil_cozumle("sosyal-guvenlik-kurumu", sicil=sicil) is not None
    assert kurum_korpusta_var("sosyal-guvenlik-kurumu") is False


def test_turetilmis_kayit_guveni_turetilmis(sicil: dict) -> None:
    valilik = sicil_cozumle("ankara-valiligi", sicil=sicil)

    assert valilik is not None
    assert valilik["kaynak_guveni"] == "turetilmis"


# --- çözümleme --------------------------------------------------------------------

def test_kalip_disi_kurum_tur_kazanir(sicil: dict) -> None:
    """kurum_kimlik regex'i 'Sosyal Güvenlik Kurumu'nu tanımaz; sicil TÜR verir."""
    assert ad_to_kurum("Sosyal Güvenlik Kurumu")["tur"] == "diger"

    kayit = sicil_cozumle("sosyal-guvenlik-kurumu", sicil=sicil)

    assert kayit is not None
    assert kayit["tur"] == "ilgili_kurulus"


def test_kisaltma_alias_ile_cozumlenir(sicil: dict) -> None:
    kayit = sicil_cozumle("uedas", sicil=sicil)

    assert kayit is not None
    assert kayit["tur"] == "elektrik_dagitim"


def test_bilinmeyen_slug_none_doner(sicil: dict) -> None:
    assert sicil_cozumle("olmayan-kurum", sicil=sicil) is None
    assert sicil_cozumle("", sicil=sicil) is None


def test_sicil_turu_dogru_jenerik_sablonu_sectirir() -> None:
    """Entegrasyon (gerçek sicil.json): kurum_kimlik 'il müdürlüğü'nü tipleyemez —
    sicil TÜR verince karışık havuz yerine doğru şablon aranır. INV-1 yine geçerli."""
    adaylar = teskilat_birim_ara("kayseri-il-saglik-mudurlugu", "hasta hakları şikâyeti", tur="")

    assert adaylar
    assert {a["kurum_slug"] for a in adaylar} == {"_genel-il-mudurlukleri"}
    assert all(a["kaynak_tipi"] == "jenerik" for a in adaylar)
    assert kurum_korpusta_var("kayseri-il-saglik-mudurlugu") is False


def test_baglacli_korpus_dizini_evraktan_erisilebilir() -> None:
    """REGRESYON (2026-07-24): kurum_kimlik slug'da 'Ve' bağlacını atar, korpus dizini
    içerir → AFAD/Çevre-Şehircilik gibi insan-küratörlü kurumlar evraktan erişilemiyordu."""
    for ad in ("Afet ve Acil Durum Yönetimi Başkanlığı",
               "Çevre, Şehircilik ve İklim Değişikliği Bakanlığı"):
        slug = ad_to_kurum(ad)["slug"]

        assert "-ve-" not in slug, "kurum_kimlik davranışı değişmiş"
        assert _kanonik_slug(slug), f"korpus kaydı erişilemez: {ad}"
        assert "-ve-" in _kanonik_slug(slug)


def test_tur_kumesi_sozlesmeyle_uyumlu() -> None:
    assert {"bakanlik", "ust_kurul", "kit", "elektrik_dagitim", "diger"} <= GECERLI_TURLER
    assert "resmi_dogrulanmis" not in GECERLI_GUVEN
