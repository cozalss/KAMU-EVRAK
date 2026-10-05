"""Birleştirme sonrası mock smoke'ta bulunan iki kusurun regresyonu (2026-10-06).

1. Son-6 kelime kesimi cümle ortasındaki bağlacı talep özetinin başına taşıyordu
   ('ve fazla tahsil edilen …') → paket konusu 'X ve Ve fazla …' oluyordu.
2. Göndereni çözülemeyen vatandaş dilekçesinde cevap yazısının muhatabı KENDİ
   kurumumuza ('Keçiören Belediye Başkanlığı') düşüyordu.
"""
from __future__ import annotations

from agents.talep_kumesi import ozet_kisa
from yazi.paket import cevap_yazisi, grup_konusu
from yazi.yazi_render import BASVURAN_YER_TUTUCU, build_context


def test_ozet_kisa_kesimden_sonra_bas_baglac_atilir():
    ozet = ozet_kisa("Sayacımın kontrol edilmesini ve fazla tahsil edilen tutarın "
                     "iadesini arz ederim")
    assert not ozet.lower().startswith("ve ")
    assert ozet.startswith("Fazla")


def test_grup_konusu_cift_baglac_uretmez():
    konular = [{"konu": "Çukurun kapatılması"},
               {"konu": ozet_kisa("Sayacımın kontrol edilmesini ve fazla tahsil "
                                  "edilen tutarın iadesini arz ederim")}]
    assert " ve Ve " not in grup_konusu(konular)


def _gelen(ad=None, tur="gercek_kisi"):
    return {"belge_cinsi": "dilekce", "gonderen_turu": tur, "gonderen_ad": ad,
            "gonderen_idare": None, "muhatap_idare": "Keçiören Belediye Başkanlığı",
            "tarih": "02.10.2026", "sayi": None, "basvuru_no": None, "konu_satiri": None}


def test_cevap_muhatabi_gonderen_yoksa_kendi_kurumumuz_olmaz():
    unsurlar = {"kurum": "Keçiören Belediye Başkanlığı", "konu": "Çukur"}
    y = cevap_yazisi(_gelen(), unsurlar, "Talebiniz ilgili birime havale edilmiştir.",
                     rol="cevap")
    assert y["muhatap"] == BASVURAN_YER_TUTUCU
    assert "Keçiören Belediye Başkanlığı\n" not in y["yazi_taslak_md"]
    assert "Bilgilerinize sunulur." in y["yazi_taslak_md"]


def test_cevap_muhatabi_gonderen_varsa_aynen():
    y = cevap_yazisi(_gelen("Ayşe Yılmaz"), {"kurum": "Keçiören Belediye Başkanlığı"},
                     "Talebiniz havale edilmiştir.", rol="cevap")
    assert y["muhatap"] == "Sayın Ayşe Yılmaz"


def test_yer_tutucu_yalniz_basvurana_yazida():
    ctx = build_context("cevabi_yazi", {"kurum": "Hukuk Müşavirliği"}, "metin",
                        gelen=_gelen(tur="kamu_idaresi"), rol="cevap")
    assert ctx.muhatap != BASVURAN_YER_TUTUCU
