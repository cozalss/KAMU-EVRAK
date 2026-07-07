"""Yönetmelik-2646 lint testleri (S2) — kural-kimlikli, madde-atıflı format denetimi.

Durum semantiği guard'ı: 'bilgi' (placeholder/heuristik) risk bandını ETKİLEMEZ;
yalnız 'uyari' listesi risk_guard'a gider. Madde referansları korpusla (m.10-20) sınırlı.
"""

from __future__ import annotations

from agents.nodes.risk_guard import compute_risk
from agents.yazi_lint import lint_2646

# Yön. 2646 uyumlu asgari taslak (üç bileşenli sayı + tarih + ilgi + kapanış + imza).
_UYUMLU_CEVABI = """                                   T.C.
                              KAMU KURUMU
                         YAZI İŞLERİ BİRİMİ

Sayı : E-45678257-622.03-12345                                        01.07.2026
Konu : Bilgi edinme başvurusu

                          İLGİLİ MAKAMA

İlgi : 15.06.2026 tarihli ve E-11112222-622.03-99 sayılı yazınız.

İlgi yazıda belirtilen husus değerlendirilmiştir.

         Gereğini rica ederim.

                                              Ad SOYAD
                                              Birim Yetkilisi
"""


class TestLintUyumluTaslak:
    def test_uyumlu_taslakta_uyari_yok(self):
        # Arrange / Act
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        # Assert — kesin ihlal yok; kurallar gecti/bilgi
        assert rapor["uyari"] == []
        assert rapor["ozet"]["gecti"] >= 6

    def test_kural_sozlesmesi(self):
        # Arrange / Act
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        # Assert — her kural {kural, madde, durum, mesaj} taşır
        for k in rapor["kurallar"]:
            assert set(k) == {"kural", "madde", "durum", "mesaj"}
            assert k["durum"] in {"gecti", "uyari", "bilgi"}


class TestLintIhlaller:
    def test_tc_basligi_yoksa_uyari(self):
        rapor = lint_2646("Sayı : E-1234-010-1  01.07.2026\nKonu : Test\nRica ederim.\nX", "")
        assert any("m.10" in u for u in rapor["uyari"])

    def test_cevabi_yazida_ilgi_zorunlu(self):
        # Arrange — İlgi satırı olmayan cevabi yazı
        taslak = _UYUMLU_CEVABI.replace("İlgi : 15.06.2026 tarihli ve E-11112222-622.03-99 sayılı yazınız.\n", "")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert any("m.15" in u for u in rapor["uyari"])

    def test_ilgi_kurali_bilgilendirmede_aranmaz(self):
        # Arrange — bilgilendirme türünde İlgi zorunlu değil (kural hiç üretilmez)
        taslak = _UYUMLU_CEVABI.replace("İlgi : 15.06.2026 tarihli ve E-11112222-622.03-99 sayılı yazınız.\n", "")
        # Act
        rapor = lint_2646(taslak, "bilgilendirme")
        # Assert
        assert not any("m.15" in u for u in rapor["uyari"])

    def test_konu_sonunda_nokta_uyari(self):
        taslak = _UYUMLU_CEVABI.replace("Konu : Bilgi edinme başvurusu",
                                        "Konu : Bilgi edinme başvurusu.")
        rapor = lint_2646(taslak, "cevabi_yazi")
        assert any("nokta" in u for u in rapor["uyari"])

    def test_kapanis_yoksa_uyari(self):
        taslak = _UYUMLU_CEVABI.replace("         Gereğini rica ederim.\n", "")
        rapor = lint_2646(taslak, "cevabi_yazi")
        assert any("m.16" in u for u in rapor["uyari"])

    def test_olur_turunde_olur_blogu_aranir(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "olur")
        assert any("OLUR" in u for u in rapor["uyari"])


class TestSayiIsoTarihKarismaz:
    def test_iso_tarih_uc_bilesen_sayilmaz(self):
        # Arrange — "2026-07-02" ISO tarihi m.11 üç-bileşen deseni DEĞİLDİR (6+ hane eşiği)
        taslak = _UYUMLU_CEVABI.replace("E-45678257-622.03-12345", "2026-07-02")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert — sayı kuralı 'gecti' OLMAMALI (uyari düşer: desen uymuyor)
        sayi_kurali = next(k for k in rapor["kurallar"] if k["kural"] == "L-M11-sayi")
        assert sayi_kurali["durum"] == "uyari"


class TestLintBilgiSeviyesi:
    def test_ebys_taslak_sayisi_bilgi_seviyesinde(self):
        # Arrange — sayı EBYS kayıt anında atanır → uyarı DEĞİL bilgi (bant güvenliği)
        taslak = _UYUMLU_CEVABI.replace("E-45678257-622.03-12345", "EBYS-TASLAK")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        sayi_kurali = next(k for k in rapor["kurallar"] if k["kural"] == "L-M11-sayi")
        assert sayi_kurali["durum"] == "bilgi"
        assert not any("m.11" in u for u in rapor["uyari"])


class TestRiskEntegrasyonu:
    def test_lint_uyarisi_sari_bant_uretir(self):
        # Arrange / Act — temiz verify sinyalleri + 1 lint uyarısı → SARI
        meta = compute_risk([], format_uyumlu=True, eksik_alanlar=[], tur_confidence=0.9,
                            evrak_turu="dilekce", taslak="x",
                            lint_uyari=["Konunun sonuna nokta konulmaz (m.13)."])
        # Assert
        assert meta["bant"] == "sari"
        assert any("2646 lint" in g for g in meta["gerekceler"])

    def test_tutarlilik_uyarisi_sari_bant_uretir(self):
        meta = compute_risk([], format_uyumlu=True, eksik_alanlar=[], tur_confidence=0.9,
                            evrak_turu="dilekce", taslak="x",
                            tutarlilik_uyari=["Evrak tarihi bugünden ileride."])
        assert meta["bant"] == "sari"
        assert any("Tutarlılık" in g for g in meta["gerekceler"])

    def test_parametresiz_davranis_degismez(self):
        # Arrange / Act — yeni kwargs verilmezse eski davranış birebir (YEŞİL)
        meta = compute_risk([], format_uyumlu=True, eksik_alanlar=[], tur_confidence=0.9,
                            evrak_turu="dilekce", taslak="temiz taslak")
        # Assert
        assert meta["bant"] == "yesil"


# ---------------------------------------------------------------------------
# Hiyerarşi-farkında kapanış (m.16) + yasak ifade (üslup) — rakip analizi sonrası
# eklenen deterministik denetimler. Veri DYS'den KOPYALANMADI (lisanssız repo);
# makam kademeleri kamuya açık devlet teşkilat yapısından derlendi.
# ---------------------------------------------------------------------------
from agents.yazi_lint import kapanis_onerisi  # noqa: E402


class TestKapanisOnerisi:
    def test_ust_makama_arz(self):
        # Gönderen müdürlük (alt) → muhatap genel müdürlük (üst): arz
        oneri = kapanis_onerisi("yazı işleri müdürlüğü", "Personel Genel Müdürlüğü")
        assert oneri is not None and oneri[0] == "arz ederim"

    def test_alt_makama_rica(self):
        oneri = kapanis_onerisi("Sağlık Bakanlığı", "İl Sağlık Müdürlüğü")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_es_makama_arz(self):
        # Eş ve üst makama arz edilir (m.16 doktrini)
        oneri = kapanis_onerisi("Ankara Valiliği", "İstanbul Valiliği")
        assert oneri is not None and oneri[0] == "arz ederim"

    def test_cozulemeyen_makam_none(self):
        assert kapanis_onerisi("yazı işleri müdürlüğü", "Ayşe Yılmaz") is None
        assert kapanis_onerisi("", "Genel Müdürlük") is None

    def test_slug_bicimli_birim_cozulur(self):
        # route_birim hedef_birim'i SLUG döndürür (ilgili_teknik_daire) — alt çizgi
        # normalize edilmeli, 'daire' kademesi tanınmalı: müdürlükten daireye → üst → arz.
        oneri = kapanis_onerisi("YAZI İŞLERİ BİRİMİ", "ilgili_teknik_daire")
        assert oneri is not None and oneri[0] == "arz ederim"

    def test_daire_baskanligi_generic_baskanliktan_ayrisir(self):
        # 'Daire Başkanlığı' (alt kademe) generic 'Başkanlığı' (üst) ile karışmamalı:
        # bakanlıktan daireye → alt → rica.
        oneri = kapanis_onerisi("İçişleri Bakanlığı", "Bilgi İşlem Daire Başkanlığı")
        assert oneri is not None and oneri[0] == "rica ederim"


class TestLintHiyerarsiKapanis:
    def test_ust_makama_rica_uyari_verir(self):
        # Antet: YAZI İŞLERİ BİRİMİ (müdürlük düzeyi) → muhatap genel müdürlük (üst)
        # ama taslak 'rica ederim' ile bitiyor → m.16 uyarısı.
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi",
                          muhatap_makam="Personel Genel Müdürlüğü")
        m16 = [k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis"][0]
        assert m16["durum"] == "uyari"
        assert "arz" in m16["mesaj"].lower()

    def test_dogru_kapanis_hiyerarsi_dogrulanir(self):
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ederim.")
        rapor = lint_2646(taslak, "cevabi_yazi", muhatap_makam="Personel Genel Müdürlüğü")
        m16 = [k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis"][0]
        assert m16["durum"] == "gecti"

    def test_muhatap_verilmezse_eski_davranis(self):
        # Geriye uyumluluk: parametre yoksa varlık kontrolü aynen sürer.
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        m16 = [k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis"][0]
        assert m16["durum"] == "gecti"

    def test_dagitimli_arz_ve_rica_gecer(self):
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ve rica ederim.")
        rapor = lint_2646(taslak, "cevabi_yazi", muhatap_makam="Personel Genel Müdürlüğü")
        m16 = [k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis"][0]
        assert m16["durum"] == "gecti"

    def test_muhatap_cozulemezse_varlik_kontrolune_duser(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi", muhatap_makam="Sayın Ayşe Yılmaz")
        m16 = [k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis"][0]
        assert m16["durum"] == "gecti"  # hiyerarşi bilinmiyor → yanlış-pozitif uyarı YOK


class TestLintYasakIfade:
    def test_yasak_ifade_uyari(self):
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "İlgi yazıda belirtilen husus değerlendirilmiştir. İyi çalışmalar dileriz.")
        rapor = lint_2646(taslak, "cevabi_yazi")
        uslup = [k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak"][0]
        assert uslup["durum"] == "uyari"
        assert "iyi çalışmalar" in uslup["mesaj"].lower()

    def test_temiz_taslakta_yasak_ifade_yok(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        uslup = [k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak"][0]
        assert uslup["durum"] == "gecti"

    def test_yasak_ifade_madde_uydurmaz(self):
        # CLAUDE.md disiplini: üslup kuralı korpustaki bir maddeye ATIF YAPMAZ.
        taslak = _UYUMLU_CEVABI + "\nKolay gelsin."
        rapor = lint_2646(taslak, "cevabi_yazi")
        uslup = [k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak"][0]
        assert not uslup["madde"].startswith("m.")


class TestLintMuhatabi:
    """verify._lint_muhatabi — m.16 muhatabı render'ın muhatap mantığını aynalar."""

    def test_ust_yazi_hedef_birim_gorunen_adla(self):
        # Denetçi bulgusu: HAM slug 9 birimin 8'inde çözülmüyordu — render'la aynı
        # kaynak (birim_tr görünen adı) kullanılmalı.
        from agents.nodes.verify import _lint_muhatabi
        sonuc = _lint_muhatabi({"yazi_turu": "ust_yazi", "hedef_birim": "ilgili_teknik_daire"})
        assert sonuc == "İlgili Teknik / Ana Hizmet Dairesi"

    def test_cevabi_yazi_gonderen(self):
        from agents.nodes.verify import _lint_muhatabi
        state = {"yazi_turu": "cevabi_yazi", "hedef_birim": "ilgili_teknik_daire",
                 "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz"}}
        # Cevabi yazının muhatabı hedef birim DEĞİL evrakın göndereni (vatandaş).
        assert _lint_muhatabi(state) == "Ayşe Yılmaz"

    def test_diger_turlerde_bos(self):
        from agents.nodes.verify import _lint_muhatabi
        assert _lint_muhatabi({"yazi_turu": "bilgilendirme", "hedef_birim": "x"}) == ""
        assert _lint_muhatabi({"yazi_turu": "olur", "hedef_birim": "x"}) == ""


class TestMakamCozumuGercekAdlar:
    """Denetçi CRITICAL repro'ları — gerçek kurum adlarında kademe çözümü."""

    def test_il_ilce_hiyerarsisi_korunur(self):
        # 'İl X Müdürlüğü' (6) > 'İlçe X Müdürlüğü' (7): il'den ilçeye RİCA doğrudur;
        # eski davranış ikisini de 7 sayıp sahte 'arz' uyarısı üretiyordu.
        oneri = kapanis_onerisi("İl Milli Eğitim Müdürlüğü", "İlçe Milli Eğitim Müdürlüğü")
        assert oneri is not None and oneri[0] == "rica ederim"
        ters = kapanis_onerisi("İlçe Milli Eğitim Müdürlüğü", "İl Milli Eğitim Müdürlüğü")
        assert ters is not None and ters[0] == "arz ederim"

    def test_ana_kurum_oneki_alt_birimi_ezmez(self):
        # 'Sağlık Bakanlığı ... Genel Müdürlüğü' bakanlık (3) DEĞİL genel müdürlüktür (5):
        # genel müdürlükten il müdürlüğüne rica.
        oneri = kapanis_onerisi("Sağlık Bakanlığı Sağlık Hizmetleri Genel Müdürlüğü",
                                "İl Sağlık Müdürlüğü")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_cumhurbaskanligi_alt_kurumu_zirveye_terfi_etmez(self):
        # 'Cumhurbaşkanlığı Strateji ve Bütçe Başkanlığı' kademe 1 değil başkanlıktır (5):
        # bakanlığa (3) yazarken arz etmeli.
        oneri = kapanis_onerisi("Cumhurbaşkanlığı Strateji ve Bütçe Başkanlığı",
                                "Sağlık Bakanlığı")
        assert oneri is not None and oneri[0] == "arz ederim"

    def test_cumhurbaskanliginin_kendisi_zirvede(self):
        # İç eşleşme ('cumhurbaşkanlığı' içindeki 'başkanlığ') üst kalıba yenilmeli.
        oneri = kapanis_onerisi("Sağlık Bakanlığı", "Cumhurbaşkanlığı")
        assert oneri is not None and oneri[0] == "arz ederim"


class TestYasakIfadeYanlisPozitifler:
    """Denetçi HIGH repro'ları — meşru resmî kullanım uyarı ÜRETMEMELİ."""

    def test_hayirli_islere_vesile_mesru(self):
        rapor = lint_2646(_UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "Açılışın kurumumuz için hayırlı işlere vesile olmasını temenni ederiz."),
            "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
        assert uslup["durum"] == "gecti"

    def test_gorusmek_uzere_toplanti_mesru(self):
        rapor = lint_2646(_UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "Gündem maddelerini görüşmek üzere komisyon toplantıya çağrılmıştır."),
            "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
        assert uslup["durum"] == "gecti"

    def test_ekli_kullanim_eslesmez(self):
        # Sözcük-sınırı: 'iyi çalışmaların değerlendirilmesi' kalıp değildir.
        rapor = lint_2646(_UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "Birimde yürütülen iyi çalışmaların değerlendirilmesi uygun görülmüştür."),
            "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
        assert uslup["durum"] == "gecti"


class TestTumBirimlerKapsanir:
    """Denetçi bulgusu: yalnız 1/9 birim test ediliyordu (boşluğu maskeliyordu).
    Tüm gerçek yönlendirme hedefleri hem verify-yolunda hem çözücüde kapsanmalı."""

    def test_dokuz_birimin_tamami_cozulur(self):
        from agents.config import BIRIM_TR
        from agents.nodes.verify import _lint_muhatabi
        for slug, gorunen_ad in BIRIM_TR.items():
            # verify yolu render'ı aynalar (görünen ad döner)
            assert _lint_muhatabi({"yazi_turu": "ust_yazi", "hedef_birim": slug}) == gorunen_ad
            # ve her görünen ad makam çözücüde bir kademeye oturur → hiyerarşi denetimi
            # hiçbir gerçek yönlendirme hedefinde sessizce sönmez
            oneri = kapanis_onerisi("YAZI İŞLERİ BİRİMİ", gorunen_ad)
            assert oneri is not None, f"çözülemedi: {slug} → {gorunen_ad}"
