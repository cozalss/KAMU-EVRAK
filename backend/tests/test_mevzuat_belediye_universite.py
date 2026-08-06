"""Belediye (5393 m.48) ve üniversite (124 s. KHK m.26) mevzuat-teşkilat şablonları.

Bu iki şablon, tek bir doğrulanmış kaynağı binlerce kuruma açar; bir hata da aynı ölçekte
yayılır. Bu yüzden burada kilitlenen şeyler kapsam sınırları ve GÜVEN SIRALAMASIDIR:

  · 5393 m.48 DÖRT birimi zorunlu kılar; aynı maddedeki koşullu birimler (sağlık, itfaiye,
    imar, insan kaynakları, hukuk işleri) şablona GİRMEMELİDİR — bir belediyede var olup
    olmadıkları meclis kararına bağlıdır ve mevzuattan bilinemez.
  · Büyükşehir belediyeleri 5216 m.21'e tabidir; belediye şablonu onlara UYGULANMAZ.
  · Vakıf yükseköğretim kurumları 124 s. KHK kapsamında DEĞİLDİR (2547 Ek m.8 yalnız
    akademik organlar için devlet üniversiteleriyle eşitlik kurar).
  · Doğrulanmamış kuruma-özel kayıt, doğrulanmış mevzuat birimini GÖLGELEYEMEZ (ölçüldü
    2026-08-02: Kadıköy/Çankaya'da kaynaksız şablon verisi 5393 birimini öne geçiriyordu).
"""
from __future__ import annotations

from agents.nodes.teskilat_ara import teskilat_birim_ara
from core.kaynak_guveni import RESMI_DOGRULANMIS

_KOSULLU_BELEDIYE_BIRIMLERI = ("İtfaiye", "İmar", "İnsan Kaynakları", "Hukuk İşleri", "Sağlık")


def _ilk(kurum: str, konu: str) -> dict | None:
    sonuc = teskilat_birim_ara(kurum, konu, top_k=1)
    return sonuc[0] if sonuc else None


class TestBelediyeSablonu:
    def test_zorunlu_dort_birim_dogrulanmis_doner(self) -> None:
        beklenen = {
            "kaldırım onarımı ve yol yapım talebi": "Fen İşleri Müdürlüğü",
            "ruhsatsız işyeri şikayeti, esenlik ve düzen": "Zabıta Müdürlüğü",
            "emlak vergisi tahakkuk ve tahsilat": "Malî Hizmetler Müdürlüğü",
        }
        for konu, birim in beklenen.items():
            aday = _ilk("acipayam-belediyesi", konu)
            assert aday is not None, konu
            assert aday["birim_ad"] == birim, f"{konu} -> {aday['birim_ad']}"
            assert aday["kaynak_guven"] == RESMI_DOGRULANMIS

    def test_sablon_yalnizca_dort_zorunlu_birimi_icerir(self) -> None:
        """m.48'in 'gerektiğinde oluşturulabilir' birimleri tür geneli DEĞİLDİR.

        Şablonun ürettiği TÜM birimler birkaç sorgu üzerinden toplanır; küme dört zorunlu
        birimden ibaret olmalıdır. (Koşullu birimleri sorup 'sonuç gelmesin' demek yanıltıcı
        olurdu: şablonda o kelimeler hiç geçmediği için sorgu zaten boş döner ve test
        yanlış sebeple yeşil kalırdı.)
        """
        sorgular = (
            "yol yapım ve kaldırım onarımı",
            "esenlik huzur ve düzen, emir ve yasaklara aykırılık",
            "bütçe, muhasebe, gelir tahakkuk ve tahsilat",
            "meclis ve encümen kararı, evrak kayıt ve arşiv",
            "itfaiye, imar ruhsatı, insan kaynakları, hukuk işleri",
        )
        bulunan: set[str] = set()
        for konu in sorgular:
            for a in teskilat_birim_ara("abana-belediyesi", konu, top_k=10):
                if a["kaynak_tipi"] == "mevzuat_teskilat":
                    bulunan.add(a["birim_ad"])
        assert bulunan == {
            "Yazı İşleri Müdürlüğü",
            "Malî Hizmetler Müdürlüğü",
            "Fen İşleri Müdürlüğü",
            "Zabıta Müdürlüğü",
        }, bulunan
        for ad in bulunan:
            assert not any(k in ad for k in _KOSULLU_BELEDIYE_BIRIMLERI), ad

    def test_buyuksehir_belediye_sablonu_kapsaminda_degil(self) -> None:
        """5216 m.21 ayrı teşkilat kurar; şablon büyükşehre sızmamalı."""
        adaylar = teskilat_birim_ara("izmir-buyuksehir-belediyesi", "zabıta denetimi", top_k=10)
        assert adaylar
        assert all(a["kaynak_tipi"] != "mevzuat_teskilat" for a in adaylar)


class TestUniversiteSablonu:
    def test_devlet_universitesi_dogrulanmis_birim_alir(self) -> None:
        aday = _ilk("hacettepe-universitesi", "öğrenci kayıt ve mezuniyet belgesi talebi")
        assert aday is not None
        assert aday["birim_ad"] == "Öğrenci İşleri Daire Başkanlığı"
        assert aday["kaynak_guven"] == RESMI_DOGRULANMIS

    def test_komptrolorluk_yerine_strateji_gelistirme(self) -> None:
        """124 m.26/1-d 'Komptrolörlük' der ama 5436 m.15/1-c onu kaldırmıştır.

        Mülga birimi listelemek, evrağı var olmayan bir adrese göndermek demektir.
        """
        adaylar = teskilat_birim_ara("ege-universitesi", "bütçe ve mali kontrol", top_k=12)
        adlar = {a["birim_ad"] for a in adaylar}
        assert "Strateji Geliştirme Daire Başkanlığı" in adlar
        assert not any("Komptrolörlük" in ad for ad in adlar)

    def test_vakif_universitesi_kapsam_disi(self) -> None:
        """2547 Ek m.8 yalnız AKADEMİK organlar için eşitlik kurar; idarî teşkilat için değil."""
        adaylar = teskilat_birim_ara("koc-universitesi", "öğrenci kayıt işlemi", top_k=10)
        assert all(a["kaynak_tipi"] != "mevzuat_teskilat" for a in adaylar)


class TestGuvenSiralamasi:
    """Senaryo: kurumun KENDİ dosyası doğrulanmamış AMA mevzuat şablonu onu kapsıyor.

    Örnek kurum neden Kadıköy değil: bu iki test 2026-08-02'de Kadıköy/Çankaya üzerinde
    ölçülmüştü; 2026-08-06'da Kadıköy'ün kendi resmî müdürlük listesi doğrulanıp manifeste
    girdi ve arama artık 1. adımda (kurum_ozel) erken dönüyor — yani Kadıköy'de test edilecek
    "doğrulanmamış kuruma-özel kayıt" KALMADI. Kadıköy'de bırakılsaydı ilk test YANLIŞ SEBEPLE
    yeşil kalırdı (doğrulanmış kayıt sıralamayı kazandığı için değil, tek kayıt olduğu için).
    Çankaya hâlâ özgün senaryoda: kaynaksız kendi dosyası + 5393 şablonu.
    """

    KURUM = "cankaya-belediyesi"

    def test_dogrulanmis_birim_kaynaksiz_kaydin_onunde_gelir(self) -> None:
        """Kaynağı gösterilmeyen kuruma-özel dosya, doğrulanmış mevzuat birimini gölgeleyemez."""
        adaylar = teskilat_birim_ara(self.KURUM, "meclis kararı ve evrak kayıt işlemi", top_k=10)
        assert adaylar
        # Senaryonun hâlâ geçerli olduğunu ÖNCE doğrula: kurumun doğrulanmamış kaydı duruyor mu?
        assert any(a["kaynak_tipi"] == "aday" for a in adaylar), (
            f"{self.KURUM} artık doğrulanmış; testi hâlâ kaynaksız olan bir belediyeye taşı"
        )
        assert adaylar[0]["kaynak_guven"] == RESMI_DOGRULANMIS, adaylar[0]

    def test_kurumun_kendi_kaydi_listeden_dusmez(self) -> None:
        """F8 değişmezi: sıralama değişti, GİZLEME geri gelmedi."""
        adaylar = teskilat_birim_ara(self.KURUM, "meclis kararı ve evrak kayıt", top_k=10)
        assert any(a["kaynak_tipi"] == "aday" for a in adaylar), "kurumun kendi kaydı kayboldu"
