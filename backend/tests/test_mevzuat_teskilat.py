"""Mevzuat-teşkilat kaynak sınıfı — INV-6/INV-7/INV-8 güvenlik testleri.

Sözleşme: docs/11-mevzuat-teskilat.md. Testlerin ezici çoğunluğu NEGATİF: bu sınıfın tek
riski, jenerik/uydurma bir birimin otomatik havaleye kaçak sokulmasıdır. Güvenlik asimetrisi
gereği yanlış RET ucuz, yanlış KABUL pahalıdır.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from agents.nodes import teskilat_mevzuat as mt
from agents.nodes.teskilat_ara import (
    _load_payload,
    kurum_korpusta_var,
    teskilat_birim_ara,
)
from agents.resmi_kaynak import uclu_grounding
from scripts.seed_teskilat import _inv7_dogrula

_VALILIK = "adana-valiligi"
_KAYMAKAMLIK = "serik-kaymakamligi"


@pytest.fixture()
def payload() -> dict:
    return _load_payload()


def _sablon_var(payload: dict, ad: str) -> bool:
    return ad in (payload.get("sablonlar") or {})


# --------------------------------------------------------------------------- pozitif yol

def test_valilik_mevzuat_sablonundan_gercek_birim_uretir(payload: dict) -> None:
    """81 valilik korpusta olmadan da gerçek, mevzuat-dayanaklı birim adı alabilmeli."""
    assert _sablon_var(payload, "_mevzuat-valilik")
    adaylar = teskilat_birim_ara(_VALILIK, "dilekçe evrak kayıt havale yazışma")

    assert adaylar
    assert adaylar[0]["kaynak_tipi"] == "mevzuat_teskilat"
    assert adaylar[0]["kurum_slug"] == _VALILIK
    assert "Adana" in adaylar[0]["kaynak_kurum"]
    assert adaylar[0]["birim_ad"]


def test_kaymakamlik_yazi_isleri_mudurlugune_genisler(payload: dict) -> None:
    assert _sablon_var(payload, "_mevzuat-kaymakamlik")
    adaylar = teskilat_birim_ara(_KAYMAKAMLIK, "dilekçe evrak kayıt havale")

    assert adaylar and adaylar[0]["kaynak_tipi"] == "mevzuat_teskilat"
    assert adaylar[0]["birim_ad"] == "İlçe Yazı İşleri Müdürlüğü"


def test_mevzuat_adayi_otomatik_havale_YETKISI_KAZANMAZ(payload: dict) -> None:
    """docs/11 §7 — tür geneli mevzuat, birimin O idarede fiilen kurulu olduğunu kanıtlamaz.

    Yönetmelik GEÇİCİ MADDE 1 işlerin başka bir şube müdürlüğüne gördürülmesine izin verir;
    m.26/2 havaleyi ilin kendi İmza Yetkileri Yönergesiyle belirlenen görevliye bağlar.
    Bu yüzden mevzuat adayı GERÇEK birim adı taşıyan bir ÖNERİdir, otomatik hedef değil.
    """
    adaylar = teskilat_birim_ara(_VALILIK, "dilekçe evrak kayıt havale yazışma")

    assert adaylar[0]["kaynak_tipi"] == "mevzuat_teskilat"
    assert uclu_grounding(adaylar[0], "dilekçe evrak kayıt havale yazışma", _VALILIK) is False


# ------------------------------------------------------------------- INV-6: kapsam kilidi

def test_kapsamda_olmayan_uydurma_ilce_genisleme_uretmez(payload: dict) -> None:
    """"NARNİA KAYMAKAMLIĞI" kalıba uyar ama kapalı listede yoktur → genişleme YOK."""
    assert mt.kapsam_cozumle(payload, "narnia-kaymakamligi") is None
    adaylar = teskilat_birim_ara("narnia-kaymakamligi", "dilekçe evrak kayıt")

    assert all(a["kaynak_tipi"] != "mevzuat_teskilat" for a in adaylar)


def test_kaliba_benzeyen_belediye_ic_mudurlugu_genislemez(payload: dict) -> None:
    """Belediye iç müdürlüğü slug'ı hiçbir mevzuat şablonuna oturmamalı."""
    assert mt.kapsam_cozumle(
        payload, "ankara-buyuksehir-belediyesi-fen-isleri-mudurlugu"
    ) is None


def test_bilesik_hitap_artik_token_biraktigi_icin_genislemez(payload: dict) -> None:
    """"Adana Valiliği Defterdarlığı" → kalıp kuyruğu tutmaz, güvenli tarafa düşer."""
    assert mt.kapsam_cozumle(payload, "adana-valiligi-defterdarligi") is None


def test_bos_ve_bozuk_slug_genislemez(payload: dict) -> None:
    for slug in ("", "   ", "ADANA-VALILIGI", "adana valiligi", "-valiligi"):
        assert mt.kapsam_cozumle(payload, slug) is None


def test_sablon_slugunun_kendisi_hedef_olamaz(payload: dict) -> None:
    """`_`-önekli şablon slug'ı hiçbir zaman genişletme hedefi değildir (backstop)."""
    assert mt.kapsam_cozumle(payload, "_mevzuat-valilik") is None
    assert mt.kapsam_cozumle(payload, "_genel-belediye") is None


def test_kapsam_listesi_istemci_verisiyle_buyutulemez(payload: dict) -> None:
    """INV-6: payload kopyasına elle kurum eklemek gerçek dosyayı değiştirmez.

    Şablonun kapsamı diskteki hash-kilitli dosyadan gelir; bellekteki payload'a enjeksiyon
    `dosya_gecerli` yeniden hesabını geçemez... ama asıl güvence şudur: enjekte edilen kayıt
    manifest'te olmadığı için ŞABLON DOSYASI doğrulaması düşer.
    """
    sahte = {
        "sablonlar": {
            "_mevzuat-sahte": {
                "kalip": "{alan}-kaymakamligi",
                "ad_kalip": "{ad} Kaymakamlığı",
                "kaynak_dosya": "_genel-belediye/birimler.txt",  # manifest'te YOK
                "kapsam_dosya": "_genel-belediye/birimler.txt",
                "kapsam": {"narnia": "Narnia"},
            }
        }
    }
    assert mt.kapsam_cozumle(sahte, "narnia-kaymakamligi") is None


def test_sablon_oneki_olmayan_kayit_sablon_sayilmaz(payload: dict) -> None:
    """INV-7: `_mevzuat-` öneki olmayan hiçbir kayıt şablon olarak çözümlenmez."""
    gercek = (payload.get("sablonlar") or {}).get("_mevzuat-kaymakamlik")
    if gercek is None:
        pytest.skip("kaymakamlık şablonu henüz kurulmadı")
    sahte = {"sablonlar": {"_genel-kaymakamlik": dict(gercek)}}

    assert mt.kapsam_cozumle(sahte, _KAYMAKAMLIK) is None


def test_birden_cok_sablon_eslesirse_belirsizlik_reddedilir(payload: dict) -> None:
    gercek = (payload.get("sablonlar") or {}).get("_mevzuat-kaymakamlik")
    if gercek is None:
        pytest.skip("kaymakamlık şablonu henüz kurulmadı")
    sahte = {"sablonlar": {"_mevzuat-a": dict(gercek), "_mevzuat-b": dict(gercek)}}

    assert mt.kapsam_cozumle(sahte, _KAYMAKAMLIK) is None


# ------------------------------------------------------- INV-8: künye taklidi / yeniden hesap

def test_kunye_taklidi_grounding_gecemez(payload: dict) -> None:
    """Alanları elle 'doğrulanmış' yapılan bir mevzuat adayı da kapıdan geçemez."""
    sahte = {
        "birim_ad": "Ruhsat ve Denetim Müdürlüğü",
        "gorev": "işyeri açma ve çalışma ruhsatı denetimi ruhsat başvurusu",
        "kurum_slug": _VALILIK,
        "kaynak_tipi": "mevzuat_teskilat",
        "kaynak_guven": "resmi_dogrulanmis",
        "kaynak_sha256": "a" * 64,
        "sablon_slug": "_mevzuat-valilik",
    }

    assert uclu_grounding(sahte, "ruhsat denetim başvurusu", _VALILIK) is False


def test_genisletme_yalniz_dogrulanmis_dosyanin_chunklarini_kullanir(payload: dict) -> None:
    """F1: şablon DİZİNİNE bırakılan manifest-dışı bir dosya yetkiyi ödünç alamaz."""
    genisleme = mt.kapsam_cozumle(payload, _VALILIK)
    assert genisleme is not None
    adaylar = teskilat_birim_ara(_VALILIK, "dilekçe evrak kayıt havale yazışma")

    for aday in adaylar:
        assert aday["kaynak_dosya"] == genisleme.kaynak_dosya
        assert aday["kaynak_guven"] == "resmi_dogrulanmis"


def test_kapsam_ve_kalip_indeksten_degil_dosyadan_okunur(payload: dict) -> None:
    """F2/INV-8: indeksteki `sablonlar` kopyası yetki taşımaz, yalnız keşif listesidir."""
    gercek = (payload.get("sablonlar") or {}).get("_mevzuat-valilik")
    assert gercek is not None
    # İndeksteki kalıp ve kapsam zehirlenmiş olsa bile dosya otoritedir.
    zehirli = {"sablonlar": {"_mevzuat-valilik": {
        **gercek, "kalip": "{alan}-defterdarligi", "kapsam": {"narnia": "Narnia"},
    }}}

    assert mt.kapsam_cozumle(zehirli, "adana-defterdarligi") is None
    assert mt.kapsam_cozumle(zehirli, "narnia-defterdarligi") is None
    # Gerçek dosya hâlâ gerçek kurumu çözer.
    assert mt.kapsam_cozumle(zehirli, _VALILIK) is not None


def test_manifestte_olmayan_dosya_gecerli_degil() -> None:
    assert mt.dosya_gecerli("_genel-belediye/birimler.txt") is False
    assert mt.dosya_gecerli("olmayan/dosya.txt") is False
    assert mt.dosya_gecerli("") is False


def test_merkez_ilce_kaymakamlik_uretmez(payload: dict) -> None:
    """Büyükşehir olmayan ilin MERKEZ ilçesinde kaymakamlık yoktur (5442); vali yürütür."""
    for slug in ("adiyaman-kaymakamligi", "corum-kaymakamligi", "sinop-kaymakamligi"):
        assert mt.kapsam_cozumle(payload, slug) is None


def test_bozuk_sablon_tanimi_istisna_firlatmaz(payload: dict) -> None:
    """Bozuk indeks canlı istek yolunda patlamamalı; sessizce güvenli tarafa düşmeli."""
    for bozuk in ("dizi-degil", 42, None, ["liste"]):
        assert mt.kapsam_cozumle({"sablonlar": {"_mevzuat-x": bozuk}}, "foo-x") is None
    assert mt.kapsam_cozumle({"sablonlar": "hic-dict-degil"}, _VALILIK) is None


# ------------------------------------------------------------------ INV-1/INV-7 regresyonu

def test_mevzuat_kapsami_kurum_korpusta_var_sonucunu_degistirmez() -> None:
    """INV-1'in harfi: otomatik havale kapsamı ile 'kuruma-özel kaynak var mı' AYRI sorular."""
    assert kurum_korpusta_var(_VALILIK) is False
    assert kurum_korpusta_var(_KAYMAKAMLIK) is False


def test_sicil_turu_degisse_bile_genisleme_karari_degismez(payload: dict) -> None:
    """INV-2: sicil zincirde değil — kapsam kararı yalnız slug kalıbı + kapalı listeden gelir."""
    once = mt.kapsam_cozumle(payload, _KAYMAKAMLIK)
    if once is None:
        pytest.skip("kaymakamlık şablonu henüz kurulmadı")

    assert once.sablon_slug == "_mevzuat-kaymakamlik"
    assert once.kurum_slug == _KAYMAKAMLIK


def test_inv7_jenerik_sablon_mevzuat_turu_ilan_ederse_seed_hata_verir(tmp_path: Path) -> None:
    sahte = tmp_path / "_genel-sahte"
    sahte.mkdir()
    (sahte / "birimler.txt").write_text(
        "@KURUM: Sahte\n@KAYNAK_TURU: resmi_mevzuat_teskilat\n@DOGRULAMA: resmi\n",
        encoding="utf-8",
    )

    with pytest.raises(SystemExit):
        _inv7_dogrula([sahte])


def test_inv7_normal_jenerik_sablon_seedi_kirmaz(tmp_path: Path) -> None:
    normal = tmp_path / "_genel-normal"
    normal.mkdir()
    (normal / "birimler.txt").write_text("@KURUM: Normal\n", encoding="utf-8")

    _inv7_dogrula([normal])  # hata YOK


def test_kuruma_ozel_dogrulanmis_kaynak_mevzuat_sablonunu_golgeler() -> None:
    """docs/11 §6: gerçek kurum verisi eklenince şablon kendiliğinden devre dışı kalır."""
    adaylar = teskilat_birim_ara(
        "nufus-ve-vatandaslik-isleri-genel-mudurlugu", "vatandaşlık başvurusu mavi kart"
    )

    assert adaylar and adaylar[0]["kaynak_tipi"] == "kurum_ozel"
