"""Bakanlık taşra müdürlüğü şablonları — bir kaynak, 81 il.

Sicildeki 4066 kurumun 1377'si il müdürlüğüdür ve bunlar 17 TÜRÜN 81 ilde tekrarıdır.
Her tür için birim listesi ilgili bakanlığın taşra yönetmeliğinde TÜR GENELİ olarak
belirlenir; tek doğrulanmış kaynak 81 kurumu birden açar.

Bu ölçek bir hatayı da 81 kurum birden yayar. Burada kilitlenen üç şey:

  1. KAPSAM 81 İL — ne eksik ne fazla. Şablon yalnız il müdürlüklerine uygulanır;
     ilçe millî eğitim müdürlükleri KAPSAM DIŞIDIR (aynı Yönetmelik m.8/2 ilçede
     hizmetlerin şube değil BÜRO eliyle yürütüleceğini söyler).
  2. GÜNCEL YÖNETMELİK — 2025 yönetmeliği birim adlarını değiştirdi. Eski adlar
     (insan kaynakları yönetimi / öğretmen yetiştirme ve geliştirme / bilgi işlem ve
     eğitim teknolojileri şubeleri) GERİ GELMEMELİ; artık var olmayan bir birime
     evrak yönlendirmek, adresi olmayan yere göndermektir.
  3. KONU→BİRİM AYRIMI yönetmeliğin kendi hizmet bölümlemesini izler.
"""
from __future__ import annotations

import pytest

from agents.nodes.teskilat_ara import teskilat_birim_ara
from core.kaynak_guveni import RESMI_DOGRULANMIS

# 2025 Yönetmeliğinin YÜRÜRLÜKTEN KALDIRDIĞI adlar — hiçbiri korpusta olmamalı.
KALDIRILAN_ADLAR = (
    "İnsan Kaynakları Yönetimi Şubesi",
    "Öğretmen Yetiştirme ve Geliştirme Şubesi",
    "Bilgi İşlem ve Eğitim Teknolojileri Şubesi",
)

KONU_BIRIM = (
    ("okul öncesi eğitim ve ilkokul kayıt alanı", "Temel Eğitim Hizmetleri Şubesi"),
    ("özel okul açma ve kurum ruhsatı", "Özel Öğretim Kurumları Şubesi"),
    ("öğretmen atama ve özlük işlemi", "Personel Hizmetleri Şubesi"),
    ("rehberlik ve özel eğitim ihtiyacı olan öğrenci",
     "Özel Eğitim ve Rehberlik Hizmetleri Şubesi"),
    ("okul inşaatı ve derslik yapımı", "İnşaat ve Emlak Hizmetleri Şubesi"),
    ("müfettiş incelemesi ve soruşturma talebi", "Eğitim Müfettişleri Başkanlığı"),
    ("imam hatip ortaokulu hakkında", "Din Öğretimi Hizmetleri Şubesi"),
    ("halk eğitim kursu ve hayat boyu öğrenme", "Hayat Boyu Öğrenme Hizmetleri Şubesi"),
    ("sınav güvenliği ve merkezi sınav organizasyonu",
     "Ölçme, Değerlendirme ve Sınav Hizmetleri Şubesi"),
)

# Coğrafi olarak dağınık iller — şablon bir ilde çalışıp başkasında çalışmasın.
ILLER = ("ankara", "istanbul", "izmir", "van", "trabzon", "mugla", "sanliurfa", "kars")


class TestKapsam:
    @pytest.mark.parametrize("il", ILLER)
    def test_her_il_dogrulanmis_birim_alir(self, il: str) -> None:
        adaylar = teskilat_birim_ara(f"{il}-il-milli-egitim-mudurlugu", "öğrenci işlemi", top_k=1)
        assert adaylar, il
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS, (il, adaylar[0])
        assert adaylar[0]["kaynak_tipi"] == "mevzuat_teskilat", (il, adaylar[0])

    def test_ilce_milli_egitim_mudurlugu_kapsam_disi(self) -> None:
        """m.8/2: ilçede hizmetler şube değil büro eliyle yürütülür; şablon il içindir."""
        adaylar = teskilat_birim_ara("cankaya-ilce-milli-egitim-mudurlugu", "öğrenci işlemi",
                                     top_k=5)
        assert all(a["kaynak_tipi"] != "mevzuat_teskilat" for a in adaylar), adaylar


class TestGuncelYonetmelik:
    @pytest.mark.parametrize("eski", KALDIRILAN_ADLAR)
    def test_kaldirilan_birim_adlari_geri_gelmez(self, eski: str) -> None:
        """Sorgu bilerek eski birimin KENDİ konusuyla yapılır."""
        adaylar = teskilat_birim_ara(
            "ankara-il-milli-egitim-mudurlugu",
            "insan kaynakları, öğretmen yetiştirme, bilgi işlem ve eğitim teknolojileri",
            top_k=10,
        )
        assert all(a["birim_ad"] != eski for a in adaylar), (eski, adaylar)

    def test_2025_ile_gelen_birimler_var(self) -> None:
        """Yeni yönetmelikle kurulan şubeler korpusta bulunmalı."""
        bulunan: set[str] = set()
        for konu in ("denklik ve belge doğrulama", "bütçe ve tahakkuk",
                     "yenilik ve eğitim teknolojileri", "mesleki gelişim"):
            for a in teskilat_birim_ara("ankara-il-milli-egitim-mudurlugu", konu, top_k=3):
                bulunan.add(a["birim_ad"])
        for yeni in ("Denklik ve Belge Doğrulama Şubesi", "Bütçe ve Tahakkuk Hizmetleri Şubesi",
                     "Yenilik ve Eğitim Teknolojileri Hizmetleri Şubesi", "Mesleki Gelişim Şubesi"):
            assert yeni in bulunan, (yeni, sorted(bulunan))


class TestKonuAyrimi:
    @pytest.mark.parametrize("konu,beklenen", KONU_BIRIM)
    def test_konu_yonetmeligin_bagladigi_subeye_gider(self, konu: str, beklenen: str) -> None:
        adaylar = teskilat_birim_ara("ankara-il-milli-egitim-mudurlugu", konu, top_k=1)
        assert adaylar, konu
        assert adaylar[0]["birim_ad"] == beklenen, (konu, adaylar[0]["birim_ad"])

    def test_ayni_konu_farkli_ilde_ayni_birime_gider(self) -> None:
        """Şablon ile bağımsız olmalı; bir ilde çalışan ayrım hepsinde çalışır."""
        for il in ILLER:
            adaylar = teskilat_birim_ara(f"{il}-il-milli-egitim-mudurlugu",
                                         "öğretmen atama ve özlük işlemi", top_k=1)
            assert adaylar and adaylar[0]["birim_ad"] == "Personel Hizmetleri Şubesi", il
