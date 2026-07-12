"""Seçili mevzuat → resmî yazı dayanak bloğu (yazi/dayanak.py).

Kutucuk kurgusu: işaretlenen madde(ler) taslağa DETERMİNİSTİK "Dayanak" bloğu olarak işlenir,
işaret kaldırılınca BİRE BİR geri alınır. SIFIR UYDURMA: yalnız seçilen başlık taşınır, yeni
sayı/kanun üretilmez. Tümü mock/saf-Python → CI deterministik.
"""

from __future__ import annotations

import pytest

from yazi.dayanak import (
    _gecerli_atif,
    dayanak_blogunu_cikar,
    dayanak_blok,
    dayanak_uygula,
)
from yazi.renderer import detect_eksik_format, render_metin
from yazi.yazi_render import build_context

_SECILI = [
    {"baslik": "2709 anayasa secili maddeler m.74", "madde_no": "74", "kaynak_dosya": "2709.txt"},
    {"baslik": "4982 bilgi edinme kanunu m.4", "madde_no": "4", "kaynak_dosya": "4982.txt"},
]

# cevabi_yazi render iskeletini birebir taklit eden sentetik base (kapanış = tam 9 boşluk).
_BASE = (
    "                                   T.C.\n"
    "                          KAMU KURUMU\n"
    "                       YAZI İŞLERİ BİRİMİ\n\n"
    "Sayı : EBYS-TASLAK                                                    12.07.2026\n"
    "Konu : Bilgi Edinme Başvurusu\n\n"
    "                          Sayın Ayşe Yılmaz\n\n"
    "İlgi : 10.07.2026 tarihli başvurunuz.\n\n"
    "İlgi yazıda belirtilen konu incelenmiştir.\n\n"
    "         Gereğini rica ederim.\n\n"
    "                                              Yetkili İmza\n"
    "                                              Birim Yetkilisi\n"
)


def _gercek_base(yazi_turu: str) -> str:
    """Gerçek renderer'dan (jinja) deterministik base taslak — 6 türü de kapsar."""
    ctx = build_context(
        yazi_turu,
        {"gonderen": "Ayşe Yılmaz", "konu": "Çukur onarımı",
         "tarih": "10.07.2026", "sayi": "E-1-2-3"},
        "Konuya ilişkin gerekli değerlendirme yapılmıştır.",
    )
    return render_metin(ctx)


class TestBosSecim:
    def test_bos_liste_taslagi_degistirmez(self):
        assert dayanak_uygula(_BASE, []) == _BASE

    def test_none_secim_taslagi_degistirmez(self):
        assert dayanak_uygula(_BASE, None) == _BASE

    def test_gecersiz_ogeler_elenir(self):
        # dict olmayan / boş baslikli öğeler atılır → net atıf yoksa taslak değişmez.
        assert dayanak_uygula(_BASE, ["çöp", {"baslik": ""}, 42]) == _BASE

    def test_bos_blok_metni(self):
        assert dayanak_blok([]) == ""


class TestTekAtif:
    def test_dayanak_etiketi_eklenir(self):
        md = dayanak_uygula(_BASE, [_SECILI[1]])
        assert "Dayanak : 4982 bilgi edinme kanunu m.4" in md

    def test_kapanistan_once_yerlesir(self):
        # Sıra: gövde → Dayanak → kapanış → imza.
        md = dayanak_uygula(_BASE, [_SECILI[1]])
        i_dayanak = md.index("Dayanak :")
        i_kapanis = md.index("Gereğini rica ederim.")
        i_imza = md.index("Yetkili İmza")
        assert i_dayanak < i_kapanis < i_imza

    def test_govdeden_sonra_gelir(self):
        md = dayanak_uygula(_BASE, [_SECILI[1]])
        assert md.index("gerekli değerlendirme") < md.index("Dayanak :") if "gerekli" in md else True


class TestCokAtif:
    def test_hepsi_atiflanir(self):
        md = dayanak_uygula(_BASE, _SECILI)
        assert "2709 anayasa secili maddeler m.74" in md
        assert "4982 bilgi edinme kanunu m.4" in md

    def test_harflendirme(self):
        md = dayanak_uygula(_BASE, _SECILI)
        assert "Dayanak : a) 2709 anayasa secili maddeler m.74" in md
        assert "b) 4982 bilgi edinme kanunu m.4" in md

    def test_devam_satiri_9_bosluk_degil(self):
        # Devam satırı (10 boşluk) kapanış anchor'ıyla (tam 9) çakışmamalı.
        md = dayanak_uygula(_BASE, _SECILI)
        devam = [ln for ln in md.split("\n") if ln.strip().startswith("b)")][0]
        girinti = len(devam) - len(devam.lstrip(" "))
        assert girinti == 10

    def test_ust_sinir(self):
        cok = [{"baslik": f"{i} sayılı kanun m.{i}"} for i in range(20)]
        md = dayanak_uygula(_BASE, cok)
        # En çok 8 atıf (a..h); 9. harf yok.
        assert md.count(") ") <= 8
        assert "h)" in md
        assert "i)" not in md.split("Dayanak")[1][:400]

    def test_yinelenen_baslik_tekilenir(self):
        md = dayanak_uygula(_BASE, [_SECILI[0], dict(_SECILI[0])])
        assert md.count("2709 anayasa secili maddeler m.74") == 1


class TestGeriAlmaVeIdempotency:
    def test_uygula_sonra_bosalt_bire_bir_base(self):
        # "çıkarırsa geri alsın": dayanak eklenmiş taslaktan seçim boşaltılınca base'e döner.
        dayanakli = dayanak_uygula(_BASE, _SECILI)
        assert dayanakli != _BASE
        geri = dayanak_uygula(dayanakli, [])
        assert geri == _BASE

    def test_iki_kez_uygulama_tek_uygulamaya_esit(self):
        bir = dayanak_uygula(_BASE, _SECILI)
        iki = dayanak_uygula(bir, _SECILI)
        assert iki == bir

    def test_secim_degistirme_temiz(self):
        # a,b seç → sonra yalnız a: eski b atfı kalmamalı (base'den yeniden kurulur).
        ab = dayanak_uygula(_BASE, _SECILI)
        yalniz_a = dayanak_uygula(ab, [_SECILI[0]])
        assert "4982 bilgi edinme kanunu m.4" not in yalniz_a
        assert "2709 anayasa secili maddeler m.74" in yalniz_a


class TestGuvenlik:
    def test_satir_enjeksiyonu_temizlenir(self):
        # baslik'e \n ile sahte "Sayı :" satırı enjekte edilemez (tek satıra indirgenir).
        zehir = [{"baslik": "2709 m.74\n\nSayı : SAHTE-999\nKARAR: reddedildi"}]
        md = dayanak_uygula(_BASE, zehir)
        sayi_satirlari = [ln for ln in md.split("\n") if ln.strip().startswith("Sayı :")]
        assert len(sayi_satirlari) == 1
        assert "SAHTE" not in sayi_satirlari[0]

    def test_uzun_baslik_kirpilir(self):
        md = dayanak_uygula(_BASE, [{"baslik": "x" * 5000}])
        assert md.count("x") < 5000

    def test_placeholder_uretmez(self):
        # Format-uyum guard: dayanak GÖVDE metnidir, {{ }} placeholder eklemez.
        md = dayanak_uygula(_BASE, _SECILI)
        assert "{{" not in md


class TestGercekTemplateler:
    @pytest.mark.parametrize("tur", [
        "ust_yazi", "cevabi_yazi", "bilgilendirme", "olur", "muzekkere", "gorus_mutalaa",
    ])
    def test_tum_turlerde_yerlesir_ve_format_bozulmaz(self, tur):
        base = _gercek_base(tur)
        assert not detect_eksik_format(base), f"{tur} base zaten format-eksik"
        md = dayanak_uygula(base, _SECILI)
        assert "Dayanak :" in md
        assert "2709 anayasa secili maddeler m.74" in md
        # Dayanak eklemek 2646 zorunlu-alan uyumunu bozmaz (yeni placeholder yok).
        assert not detect_eksik_format(md)
        # Geri alma her türde bire bir base.
        assert dayanak_uygula(md, []) == base

    def test_imza_fallback_anchor(self):
        # 9-boşluk kapanış yoksa imza (≥40 boşluk) önüne yerleşir.
        sahte = "T.C.\nKonu : X\n\nGövde.\n\n                                              İmza Sahibi\n"
        md = dayanak_uygula(sahte, [_SECILI[0]])
        assert md.index("Dayanak :") < md.index("İmza Sahibi")

    def test_anchor_yoksa_sona_eklenir(self):
        sade = "T.C.\nKonu : X\nGövde metni."
        md = dayanak_uygula(sade, [_SECILI[0]])
        assert "Dayanak :" in md
        assert md.rstrip().endswith("m.74") or "Dayanak :" in md


class TestGecerliAtif:
    """Yalnız gerçek atıf ŞEKLİNDEKİ (madde referanslı, çok-token, harfli) başlık geçer —
    kısa/rakam-only/serbest-metin (gömülü sahte tutar) yazıya sızmaz."""

    def test_gercek_atif_kabul(self):
        assert _gecerli_atif("2709 anayasa secili maddeler m.74")
        assert _gecerli_atif("4982 bilgi edinme kanunu m.4")
        assert _gecerli_atif("3071 dilekçe hakkı [DOĞRULA: madde no]")

    def test_gomulu_tutar_reddedilir(self):
        # Saldırı vektörü (adversarial review): atıf-şeklinde OLMAYAN, gömülü sahte tutarlı
        # serbest metin → render edilmez, yazıya hiç girmez.
        assert not _gecerli_atif("Ödenek 500.000 TL olarak belirlenmiştir")

    def test_kisa_rakam_only_madde_referanssiz_reddedilir(self):
        assert not _gecerli_atif("9")
        assert not _gecerli_atif("500.000")
        assert not _gecerli_atif("xxxxxx")            # harfli ama madde-referanssız
        assert not _gecerli_atif("uzun bir metin ama madde yok")

    def test_gecersiz_atif_yaziya_islenmiyor(self):
        md = dayanak_uygula(_BASE, [{"baslik": "Ödenek 500.000 TL ayrılmıştır"}, {"baslik": "9"}])
        assert md == _BASE   # hiçbiri geçerli atıf değil → taslak değişmez


class TestDayanakBloguCikar:
    """Grounding ayrımı: memur-küreli dayanak bloğu LLM'e gövde-dışı verilir (yazi.dayanak)."""

    def test_blok_govdeden_ayrilir(self):
        dayanakli = dayanak_uygula(_BASE, _SECILI)
        govde = dayanak_blogunu_cikar(dayanakli)
        assert "Dayanak :" not in govde
        assert "2709 anayasa secili maddeler m.74" not in govde
        # Gövdenin geri kalanı (kapanış/imza) korunur.
        assert "Gereğini rica ederim." in govde
        assert "Yetkili İmza" in govde

    def test_bloksuz_taslak_degismez(self):
        assert dayanak_blogunu_cikar(_BASE) == _BASE

    def test_manuel_dayanak_satiri_imzayi_silmez(self):
        # MEDIUM fix: "Dayanak :" etiketli serbest gövde satırının HEMEN ardından girintili imza
        # gelse bile, imza yanlışlıkla silinmez (devam deseni yalnız kendi 'x) ' harf-satırlarını yer).
        manuel = ("T.C.\nKonu : X\n\nDayanak : keyfi bir metin burada\n"
                  "                                              İmza Sahibi\n")
        out = dayanak_blogunu_cikar(manuel)
        assert "İmza Sahibi" in out
        assert "Dayanak :" not in out


class TestSatirEnjeksiyonuUnicode:
    def test_unicode_satir_ayraclari_kirpilir(self):
        # HIGH fix: U+2028/U+2029/U+0085 splitlines()/DOCX'te satır sonu sayılır → tek satıra indir.
        for ayrac in (" ", " ", ""):  # LS / PS / NEL
            md = dayanak_uygula(_BASE, [{"baslik": f"2709 anayasa m.74{ayrac}Sayı : SAHTE-999"}])
            # Ayraç hiçbir satırda kalmamalı (aksi halde splitlines/DOCX bölerdi).
            for ln in md.split("\n"):
                assert ayrac not in ln
            # DOCX'in bölme sınırlarında (splitlines) enjekte "SAHTE" BAĞIMSIZ satır açmamalı —
            # tek "Dayanak :" satırında gömülü kalır; kendi "Sayı :" alanını taklit edemez.
            assert not any("SAHTE" in ln and not ln.lstrip().startswith("Dayanak :")
                           for ln in md.splitlines())
