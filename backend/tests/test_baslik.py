"""Resmî yazı başlık tek çözücüsü (yazi/baslik.py) — teşhis 2026-10-05 regresyonları."""

from __future__ import annotations

import pytest

from yazi.baslik import (
    BELIRSIZ_BIRIM_MUHATAP,
    baslik_coz,
    gelen_evrak_coz,
    ilgi_satiri,
    kisi_iyelik,
    konu_dogrula,
    konu_sec,
    muhatap_bicimle,
)

DILEKCE = """T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Sokağımızda iki aydır büyük bir çukur bulunmakta. Çukurun kapatılmasını talep ediyorum.
Ayrıca 18.10.2026 tarihinde su faturam yüksek geldi, iadesini arz ederim.

02.10.2026

Ayşe Yılmaz
İmza
"""

CIMER = """T.C.
ETİMESGUT BELEDİYE BAŞKANLIĞI
Basın Yayın ve Halkla İlişkiler Müdürlüğü

CİMER Başvuru No: 2026-0925-55130
Başvuru Tarihi: 25.09.2026
Başvuru Sahibi: Ayşe Yılmaz (T.C. Kimlik No: 10000000146)

Başvuru Metni:
Parkta yaralı köpekler var.
"""

RESMI = """T.C.
SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI
Ankara Sosyal Güvenlik İl Müdürlüğü

Sayı  : E-99887766-205.99-5512345
Konu  : Prim borcu bilgisi
İlgi  : Keçiören Belediye Başkanlığının 15.09.2026 tarihli ve E-1-841-1 sayılı yazısı.

KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Prim borcu bilgisi aşağıdadır. Bilgilerinizi rica ederim.
Tarih: 29.09.2026
"""

MUZEKKERE = """T.C.
ANKARA 5. ASLİYE HUKUK MAHKEMESİ

Esas No : 2026/812
Konu    : İhtiyati tedbir şerhi

ÇANKAYA TAPU MÜDÜRLÜĞÜNE

Tedbir şerhi konulması rica olunur.
Tarih: 25.09.2026
"""


def test_dilekce_gelen_modeli_imza_tarihini_ve_sahibini_okur():
    g = gelen_evrak_coz(DILEKCE, {"gonderen": "Ayşe Yılmaz", "kurum": "Keçiören Belediye "
                                  "Başkanlığı", "tarih": "18.10.2026"}, "dilekce")
    assert g["belge_cinsi"] == "dilekce"
    assert g["gonderen_turu"] == "gercek_kisi"
    assert g["tarih"] == "02.10.2026"  # gövdedeki olay tarihi değil, imza tarihi
    assert g["sayi"] is None


def test_dilekce_ic_havale_ilgisi_dilekce_sahibini_anar_kurumu_degil():
    g = gelen_evrak_coz(DILEKCE, {"gonderen": "Ayşe Yılmaz",
                                  "kurum": "Keçiören Belediye Başkanlığı"}, "dilekce")
    satir = ilgi_satiri(g, "havale")
    assert satir == "Ayşe Yılmaz'ın 02.10.2026 tarihli dilekçesi."
    assert "Keçiören" not in satir


def test_dilekce_cevap_ilgisi_ikinci_sahis():
    g = gelen_evrak_coz(DILEKCE, {"gonderen": "Ayşe Yılmaz"}, "dilekce")
    assert ilgi_satiri(g, "cevap") == "02.10.2026 tarihli dilekçeniz."


def test_cimer_basvuru_no_etiketten_tam_okunur_ve_sayi_bos():
    g = gelen_evrak_coz(CIMER, {"gonderen": "Ayşe Yılmaz", "sayi": "-0925"}, "cimer")
    assert g["basvuru_no"] == "2026-0925-55130"
    assert g["sayi"] is None
    assert g["gonderen_idare"] is None  # CİMER anteti bizim kurumumuz
    assert ilgi_satiri(g, "cevap") == (
        "25.09.2026 tarihli ve 2026-0925-55130 sayılı CİMER başvurunuz.")


def test_resmi_yazi_kendi_sayi_ve_tarihini_kullanir_ilgi_satirindakini_degil():
    g = gelen_evrak_coz(RESMI, {"tarih": "15.09.2026"}, "cevabi_yazi")
    assert g["gonderen_turu"] == "kamu_idaresi"
    assert g["gonderen_idare"] == "Sosyal Güvenlik Kurumu Başkanlığı"
    assert g["tarih"] == "29.09.2026"
    assert g["sayi"] == "E-99887766-205.99-5512345"
    assert ilgi_satiri(g, "cevap") == (
        "29.09.2026 tarihli ve E-99887766-205.99-5512345 sayılı yazınız.")
    assert ilgi_satiri(g, "havale").startswith("Sosyal Güvenlik Kurumu Başkanlığının 29.09")


def test_muzekkere_esas_no_ve_mahkeme_muhatabi():
    g = gelen_evrak_coz(MUZEKKERE, {}, "muzekkere")
    assert g["sayi"] == "2026/812 Esas"
    b = baslik_coz(g, "cevabi_yazi")
    assert b.muhatap == "ANKARA 5. ASLİYE HUKUK MAHKEMESİNE"
    assert b.ilgi_satirlari == ("25.09.2026 tarihli ve 2026/812 Esas sayılı müzekkereniz.",)


@pytest.mark.parametrize("muhatap", ["Keçiören Belediye Başkanlığı", "KEÇİÖREN BELEDİYE BAŞKANLIĞI"])
def test_ilgi_sahibi_asla_muhatap_idare_olamaz(muhatap):
    g = {"belge_cinsi": "resmi_yazi", "gonderen_turu": "kamu_idaresi",
         "gonderen_idare": muhatap, "muhatap_idare": muhatap, "tarih": "01.10.2026"}
    assert muhatap.lower()[:5] not in ilgi_satiri(g, "havale").lower()


def test_kisi_iyelik_unlu_uyumu():
    assert kisi_iyelik("Ayşe Yılmaz") == "Ayşe Yılmaz'ın"
    assert kisi_iyelik("Mehmet Demir") == "Mehmet Demir'in"
    assert kisi_iyelik("Can Oktay") == "Can Oktay'ın"
    assert kisi_iyelik("Ali Kaya") == "Ali Kaya'nın"


def test_muhatap_tek_kapi():
    assert muhatap_bicimle("Ayşe Yılmaz", "gercek_kisi") == "Sayın Ayşe Yılmaz"
    assert muhatap_bicimle("Ankara Cumhuriyet Başsavcılığı", "kamu_idaresi") == (
        "ANKARA CUMHURİYET BAŞSAVCILIĞINA")
    assert muhatap_bicimle("Fen İşleri Müdürlüğü", "birim") == "FEN İŞLERİ MÜDÜRLÜĞÜNE"
    assert muhatap_bicimle("İlgili Teknik / Ana Hizmet Dairesi", "birim") == (
        BELIRSIZ_BIRIM_MUHATAP)


@pytest.mark.parametrize("konu", [
    "Sokağımızda iki aydır büyük bir çukur bulunmakta",
    "Sayacımın kontrol edilmesini talep ediyorum",
    "Fazla tahsil edilen tutarın iadesini arz ederim",
    "Eylül 2026 dönemine ait su faturası ile sayaç kontrolü ve fazla tahsil edilen tutarın iadesi",
])
def test_konu_dogrulayici_cumleyi_reddeder(konu):
    assert konu_dogrula(konu)


@pytest.mark.parametrize("konu", [
    "Yol Çukurunun Kapatılması Talebi", "Su Faturası İtirazı ve Sayaç Kontrolü",
    "Prim borcu bilgisi", "Temiz Su Şebekesi Arızası", "Toplantı ve gösteri yürüyüşü bildirimi",
])
def test_konu_dogrulayici_isim_obegini_kabul_eder(konu):
    assert konu_dogrula(konu) == []


def test_konu_ham_kopya_reddedilir():
    kaynak = "Mahallemizde çöpler bir haftadır düzenli olarak toplanmıyor ve koku var."
    assert "ham_kopya" in konu_dogrula("çöpler bir haftadır düzenli olarak toplanmıyor ve", kaynak)


def test_konu_sec_ilk_gecerli_adayi_alir():
    konu = konu_sec(["Çukurun en kısa sürede kapatılmasını talep ediyorum",
                     "Sokaktaki çukur ve su faturası hk."], DILEKCE)
    assert konu == "Sokaktaki çukur ve su faturası hk"


def test_baslik_coz_havale_rolunde_muhatap_birim():
    g = gelen_evrak_coz(DILEKCE, {"gonderen": "Ayşe Yılmaz"}, "dilekce")
    b = baslik_coz(g, "ust_yazi", rol="havale",
                   muhatap=muhatap_bicimle("Fen İşleri Müdürlüğü", "birim"),
                   konu_adaylari=["Yol Çukurunun Kapatılması"], kaynak_metin=DILEKCE)
    assert b.muhatap == "FEN İŞLERİ MÜDÜRLÜĞÜNE"
    assert b.ilgi_satirlari == ("Ayşe Yılmaz'ın 02.10.2026 tarihli dilekçesi.",)
    assert b.konu == "Yol Çukurunun Kapatılması"


def test_akis_t_gelen_evrak_tabani_kullanilir_etiket_ustun():
    u = {"gelen_evrak": {"belge_cinsi": "basvuru", "gonderen_turu": "gercek_kisi",
                         "gonderen_ad": "Ayşe Yılmaz", "tarih": "01.01.2026"}}
    g = gelen_evrak_coz(DILEKCE, u, "dilekce")
    assert g["belge_cinsi"] == "basvuru"
    assert g["tarih"] == "02.10.2026"


def test_kurum_adi_satir_sonunu_gecmez():
    from agents.kurum_kimlik import efektif_idare_adi
    metin = ("T.C.\nANKARA VALİLİĞİ\n\nKonu : Kış Mevsimi Afet Hazırlık Toplantısı\n"
             "ETİMESGUT BELEDİYE BAŞKANLIĞINA\n\nToplantı yapılacaktır.\n")
    ad = efektif_idare_adi(metin, {})
    assert "Kış" not in ad and "KIŞ" not in ad
    assert "Etimesgut" in ad
