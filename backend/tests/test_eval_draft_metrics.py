"""Görev 2 yazı taslağı metrik testleri — format-uyum + Türkçe saflık + false-veto.

eval/draft_eval.py saf/deterministik fonksiyonları (regex/string; ağ/LLM yok):
turkish_purity, check_components, check_siralama, check_kapanis_turu, check_muhatap_turu,
check_olur_yapisi, format_skoru, false_veto_count, _bilesenler_tam.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

from eval.draft_eval import (
    _bilesenler_tam,
    check_components,
    check_kapanis_turu,
    check_muhatap_turu,
    check_olur_yapisi,
    check_siralama,
    false_veto_count,
    format_skoru,
    turkish_purity,
)

# Tam, sıralı, türe-uyumlu örnek cevabi yazı taslağı (Yön. 2646 minimum seti).
_TAM_CEVABI = (
    "T.C.\n"
    "ÖRNEK BAKANLIĞI\n"
    "Sayı: 12345\n"
    "Konu: Başvurunuz hk.\n"
    "İlgi: 01.01.2026 tarihli yazınız.\n"
    "Sayın Ahmet Yılmaz\n"
    "İlgi yazınız incelenmiştir.\n"
    "Gereğini rica ederim.\n"
    "{{ AD SOYAD }}\n"
)


class TestTurkishPurity:
    """turkish_purity — Türkçe+ASCII harf oranı [0,1]."""

    def test_saf_turkce_bir(self):
        # Arrange — yalnız Türkçe harfler
        # Act + Assert
        assert turkish_purity("çğşöüİ Türkçe metin") == 1.0

    def test_harfsiz_metin_bir(self):
        # Arrange — yalnız rakam/noktalama (harf yok)
        # Act + Assert
        assert turkish_purity("12345 ... !!!") == 1.0

    def test_yabanci_harf_dusurur(self):
        # Arrange — Yunan/Kiril sızıntısı saflığı düşürür
        # Act
        pur = turkish_purity("metin αβγ")
        # Assert
        assert pur < 1.0

    def test_rakam_noktalama_sayilmaz(self):
        # Arrange — harfler saf TR; rakamlar yok sayılır
        # Act + Assert — 'abc' tamamı TR → 1.0
        assert turkish_purity("abc 123, 456.") == 1.0


class TestCheckComponents:
    """check_components — zorunlu bileşen tespiti (regex)."""

    def test_tam_taslak_tum_bilesenler(self):
        # Act
        comp = check_components(_TAM_CEVABI)
        # Assert — hepsi mevcut
        assert all(comp.values())

    def test_eksik_sayi_yakalanir(self):
        # Arrange — Sayı satırı yok
        taslak = _TAM_CEVABI.replace("Sayı: 12345\n", "")
        # Act
        comp = check_components(taslak)
        # Assert
        assert comp["sayi"] is False

    def test_kapanis_ibaresi_tespit(self):
        # Arrange — yalnız kapanış
        comp = check_components("arz ederim.")
        # Assert
        assert comp["kapanis"] is True


class TestCheckSiralama:
    """check_siralama — bölümler Yön. 2646 sırasında mı."""

    def test_dogru_sira_true(self):
        # Act + Assert — başlık<sayı<konu<kapanış<imza
        assert check_siralama(_TAM_CEVABI) is True

    def test_eksik_bolum_false(self):
        # Arrange — imza bloğu yok → sıra tamamlanamaz
        taslak = _TAM_CEVABI.replace("{{ AD SOYAD }}\n", "")
        # Act + Assert
        assert check_siralama(taslak) is False

    def test_bozuk_sira_false(self):
        # Arrange — kapanış konudan ÖNCE (ters)
        taslak = (
            "T.C.\nSayı: 1\nrica ederim\nKonu: x\n{{ AD SOYAD }}"
        )
        # Act + Assert
        assert check_siralama(taslak) is False


class TestCheckKapanisTuru:
    """check_kapanis_turu — kapanış türe uygun mu (Yön. m.16)."""

    def test_cevabi_rica_ederim(self):
        # Act + Assert
        assert check_kapanis_turu("Gereğini rica ederim.", "cevabi_yazi") is True

    def test_ust_yazi_arz_ederim(self):
        # Act + Assert
        assert check_kapanis_turu("Bilgilerinize arz ederim.", "ust_yazi") is True

    def test_cevabi_yanlis_kapanis_false(self):
        # Arrange — cevabi yazıda 'arz ederim' (yanlış kapanış)
        assert check_kapanis_turu("arz ederim", "cevabi_yazi") is False

    def test_bilinmeyen_tur_herhangi_kapanis(self):
        # Arrange — tür haritada yok → herhangi resmî kapanış yeterli
        assert check_kapanis_turu("sunulur.", "bilinmeyen_tur") is True


class TestCheckMuhatapTuru:
    """check_muhatap_turu — muhatap bölümü türe uygun mu (olur'da YOK)."""

    def test_cevabi_muhatap_var(self):
        # Act + Assert — 'Sayın ...' muhatap
        assert check_muhatap_turu("Sayın Ahmet Yılmaz", "cevabi_yazi") is True

    def test_olur_muhatap_yok_true(self):
        # Arrange — olur'da muhatap bulunmamalı (Yön. m.20)
        assert check_muhatap_turu("OLUR\nMakam onayı.", "olur") is True

    def test_olur_muhatap_var_false(self):
        # Arrange — olur'da muhatap VARSA hatalı
        assert check_muhatap_turu("Sayın X\nOLUR", "olur") is False


class TestCheckOlurYapisi:
    """check_olur_yapisi — ortalı OLUR bloğu var + muhatap yok."""

    def test_gecerli_olur(self):
        # Arrange — ortalı OLUR satırı, muhatap yok
        taslak = "T.C.\nKonu: x\nUygun görülmüştür.\nOLUR\n{{ ONAY MAKAMI }}"
        # Act + Assert
        assert check_olur_yapisi(taslak) is True

    def test_muhatapli_olur_gecersiz(self):
        # Arrange — muhatap eklenmiş
        taslak = "Sayın X\nOLUR\n"
        # Act + Assert
        assert check_olur_yapisi(taslak) is False


class TestBilesenlerTam:
    """_bilesenler_tam — İlgi türe göre koşullu (olur/bilgilendirme muaf)."""

    def test_olur_ilgi_muaf(self):
        # Arrange — İlgi hariç tüm bileşenler dolu; olur türü → İlgi muaf
        comp = {"tc_baslik": True, "sayi": True, "konu": True,
                "ilgi": False, "imza_bloku": True, "kapanis": True}
        # Act + Assert — İlgi eksikliği olur'da eksiklik değil
        assert _bilesenler_tam(comp, "olur") is True

    def test_cevabi_ilgi_zorunlu(self):
        # Arrange — aynı comp; cevabi_yazi türünde İlgi ZORUNLU
        comp = {"tc_baslik": True, "sayi": True, "konu": True,
                "ilgi": False, "imza_bloku": True, "kapanis": True}
        # Act + Assert
        assert _bilesenler_tam(comp, "cevabi_yazi") is False


class TestFormatSkoru:
    """format_skoru — bileşen+sıra+kapanış+muhatap birleşik [0,1] skor."""

    def test_tam_cevabi_yuksek_skor(self):
        # Act
        skor, boyutlar = format_skoru(_TAM_CEVABI, "cevabi_yazi")
        # Assert — tüm boyutlar geçti → 1.0
        assert skor == 1.0
        assert all(boyutlar.values())

    def test_eksik_taslak_dusuk_skor(self):
        # Arrange — yalnız başlık
        skor, _ = format_skoru("T.C.", "cevabi_yazi")
        # Assert
        assert skor < 1.0
        assert 0.0 <= skor <= 1.0


class TestFalseVetoCount:
    """false_veto_count — kaynakta VAR olan değeri 'yok' diyen YANLIŞ veto sayımı."""

    def test_kaynakta_olan_deger_yanlis_veto(self):
        # Arrange — uyarı '10.04.2026 yok' diyor ama kaynakta VAR
        uyari = ["Taslaktaki '10.04.2026' tarihi kaynak evrakta yok (doğrulayın)."]
        kaynak = "Evrak tarihi 10.04.2026 olarak kayıtlıdır."
        # Act
        n, ornekler = false_veto_count(uyari, kaynak)
        # Assert — false-veto yakalandı
        assert n == 1
        assert "10.04.2026" in ornekler

    def test_kaynakta_olmayan_deger_dogru_veto(self):
        # Arrange — değer gerçekten kaynakta YOK → false-veto DEĞİL
        uyari = ["Taslaktaki '99.99.9999' tarihi kaynak evrakta yok (doğrulayın)."]
        kaynak = "Hiçbir tarih içermeyen metin."
        # Act
        n, _ = false_veto_count(uyari, kaynak)
        # Assert — doğru veto → false-veto 0
        assert n == 0

    def test_eksik_bolum_uyarisi_sayilmaz(self):
        # Arrange — 'Eksik bölüm' uyarısı uydurma-veto değildir
        uyari = ["Eksik bölüm: İmza/Ad-Soyad"]
        # Act
        n, _ = false_veto_count(uyari, "herhangi kaynak")
        # Assert
        assert n == 0
