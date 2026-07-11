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
        # Assert — çekirdek alanlar zorunlu; dayanak (yönetmelik lafzı) + oneri opsiyonel
        for k in rapor["kurallar"]:
            assert {"kural", "madde", "durum", "mesaj"} <= set(k)
            assert set(k) <= {"kural", "madde", "durum", "mesaj", "dayanak", "oneri"}
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


class TestArastirmaDogrulamaliKurallar:
    """mevzuat.gov.tr 21.5.2646 PDF'i doğrudan okunarak doğrulanan kurallar: E/Z/O
    öneki (m.11 f.1) · her noktalama yasak (m.13 f.1) · kurum muhataba 'Sayın'
    yazılmaz (m.14 f.2-3) · ilgide tarih+sayı (m.15 f.6) · 'arz/rica ederim' GEÇERLİ
    dağıtımlı kapanış (m.16 f.12-b) · ad-SOYAD (m.17 f.2) · Ek (m.18) · Dağıtım (m.19)
    · süreli ibare ACELE/GÜNLÜDÜR (m.26). Bant güvenliği: heuristik/çıkarımsal olanlar
    yalnız 'bilgi'; 'uyari' yalnız belge-içi kesin çelişkide."""

    def test_sayida_onek_yoksa_bilgi(self):
        # Arrange — üç bileşen tam ama E/Z/O öneki yok → bilgi (fiziksel belge meşru)
        taslak = _UYUMLU_CEVABI.replace("E-45678257-622.03-12345", "45678257-622.03-12345")
        # Act
        k = next(k for k in lint_2646(taslak, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M11-sayi")
        # Assert
        assert k["durum"] == "bilgi"
        assert "E-" in k["mesaj"] or "önek" in k["mesaj"].lower()

    def test_kurum_muhataba_sayin_uyari(self):
        # Arrange — m.14 f.2: idare/makam adına 'Sayın' yazılmaz (yalnız gerçek kişiye)
        taslak = _UYUMLU_CEVABI.replace("İLGİLİ MAKAMA", "Sayın Ankara Valiliği")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert any("m.14" in u and "Sayın" in u for u in rapor["uyari"])

    def test_gercek_kisiye_sayin_uyari_uretmez(self):
        # Arrange — m.14 f.3: gerçek kişiye 'Sayın' + ad Soyad-BÜYÜK doğru kullanım
        taslak = _UYUMLU_CEVABI.replace("İLGİLİ MAKAMA", "Sayın Ayşe YILMAZ")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert not any("Sayın" in u for u in rapor["uyari"])

    def test_ilgide_tarih_ve_sayi_yoksa_uyari(self):
        # Arrange — m.15 f.6: ilgide belgenin tarihi ve sayısı belirtilir
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi : 15.06.2026 tarihli ve E-11112222-622.03-99 sayılı yazınız.",
            "İlgi : yazınız.")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert any("m.15" in u for u in rapor["uyari"])

    def test_ilgide_tarih_var_sayi_yok_bilgi(self):
        # Arrange — vatandaş dilekçesinin kayıt sayısı olmayabilir → uyarı değil bilgi
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi : 15.06.2026 tarihli ve E-11112222-622.03-99 sayılı yazınız.",
            "İlgi : 15.06.2026 tarihli dilekçeniz.")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M15-ilgi")
        # Assert
        assert k["durum"] == "bilgi"
        assert not any("m.15" in u for u in rapor["uyari"])

    def test_arz_rica_bolu_gecerli_dagitimli_kapanis(self):
        # Arrange — m.16 f.12-b: '… arz/rica ederim.' YÖNETMELİKÇE GEÇERLİ dağıtımlı
        # kapanıştır (eski davranış 'tek kalıba indirilmeli' bilgisi üretiyordu — bug).
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz/rica ederim.")
        # Act
        k = next(k for k in lint_2646(taslak, "cevabi_yazi",
                                      muhatap_makam="Personel Genel Müdürlüğü")["kurallar"]
                 if k["kural"] == "L-M16-kapanis")
        # Assert
        assert k["durum"] == "gecti"

    def test_imza_ad_soyad_bicimi_dogrulanir(self):
        # Arrange — m.17 f.2: ad ilk harfi büyük, SOYAD büyük ("Ad SOYAD" uyumlu)
        k = next(k for k in lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M17-imza")
        # Assert
        assert k["durum"] == "gecti"
        assert "biçim" in k["mesaj"].lower()

    def test_imza_bicimi_farkliysa_bilgi(self):
        # Arrange — "AD SOYAD" (ikisi de büyük) → heuristik not; ASLA uyari (bant güvenliği)
        taslak = _UYUMLU_CEVABI.replace("Ad SOYAD", "AD SOYAD")
        rapor = lint_2646(taslak, "cevabi_yazi")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M17-imza")
        # Assert
        assert k["durum"] == "bilgi"
        assert not any("m.17" in u for u in rapor["uyari"])

    def test_ek_referansi_var_blok_yok_bilgi(self):
        # Arrange — m.18: gövde 'ekte' diyor ama Ek bloğu yok. 'ekte' alıntı da olabilir
        # (vatandaşın dilekçe eki, başka belgenin eki) → kesin çelişki DEĞİL → bilgi,
        # asla uyari (bant güvenliği — adversarial review bulgusu).
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "İlgi yazıda belirtilen husus değerlendirilmiş olup sonuç raporu ekte sunulmuştur.")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M18-ek")
        # Assert
        assert k["durum"] == "bilgi"
        assert not any("m.18" in u for u in rapor["uyari"])

    def test_kanun_eki_referansi_m18_tetiklemez(self):
        # Arrange — "5018 sayılı Kanunun ek-3 maddesi" mevzuat ekidir, belge eki değil
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "5018 sayılı Kanunun ek-3 maddesi kapsamında değerlendirme yapılmıştır.")
        # Act / Assert — m.18 kuralı hiç üretilmez
        rapor = lint_2646(taslak, "cevabi_yazi")
        assert not any(k["kural"] == "L-M18-ek" for k in rapor["kurallar"])

    def test_govde_alintisinda_sayin_kurum_uyari_uretmez(self):
        # Arrange — gövdede BAŞKA belgenin hitabı alıntılanıyor; muhatap bölgesi dışı →
        # m.14 uyarısı üretmemeli (adversarial review bulgusu: tüm belge taranıyordu)
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "Başvurunuzda yer alan\nSayın Ankara Valiliği\nhitabı incelenmiştir.")
        # Act
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert not any("Sayın" in u for u in rapor["uyari"])

    def test_ek_blogu_varsa_gecti(self):
        # Arrange
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "Sonuç raporu ekte sunulmuştur.") + "\nEk: Sonuç raporu (2 sayfa)\n"
        # Act
        k = next(k for k in lint_2646(taslak, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M18-ek")
        # Assert
        assert k["durum"] == "gecti"

    def test_ek_referansi_yoksa_kural_uretilmez(self):
        # Arrange / Act — ek geçmeyen belgede m.18 kuralı hiç görünmez (gürültü yok)
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        # Assert
        assert not any(k["kural"] == "L-M18-ek" for k in rapor["kurallar"])

    def test_dagitimli_kapanista_dagitim_bloku_yoksa_bilgi(self):
        # Arrange — 'arz ve rica' → çok muhatap ÇIKARIMI; kesin değil → bilgi, uyari değil
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ve rica ederim.")
        rapor = lint_2646(taslak, "cevabi_yazi")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M19-dagitim")
        # Assert
        assert k["durum"] == "bilgi"
        assert not any("m.19" in u for u in rapor["uyari"])

    def test_dagitim_blogu_varsa_gecti(self):
        # Arrange
        taslak = (_UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ve rica ederim.")
                  + "\nDağıtım:\nGereği: Personel Genel Müdürlüğü\n")
        k = next(k for k in lint_2646(taslak, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M19-dagitim")
        # Assert
        assert k["durum"] == "gecti"

    def test_sureli_ibare_bilgi_notu(self):
        # Arrange — m.26: ACELE/GÜNLÜDÜR ibaresi varsa yerleşim hatırlatması (bilgi)
        taslak = "GÜNLÜDÜR\n" + _UYUMLU_CEVABI
        rapor = lint_2646(taslak, "cevabi_yazi")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M26-sureli")
        # Assert
        assert k["durum"] == "bilgi"
        assert not any(kk["kural"] == "L-M26-sureli"
                       for kk in lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")["kurallar"])

    def test_konu_sonu_diger_noktalama_uyari(self):
        # Arrange — m.13 f.1: 'herhangi bir noktalama işareti konulmaksızın' (yalnız nokta değil)
        taslak = _UYUMLU_CEVABI.replace("Konu : Bilgi edinme başvurusu",
                                        "Konu : Bilgi edinme başvurusu?")
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert any("m.13" in u for u in rapor["uyari"])

    def test_konu_sonu_parantez_de_noktalamadir(self):
        # Arrange — Unicode P* kategorisi: parantez/tire de 'herhangi bir noktalama'dır
        taslak = _UYUMLU_CEVABI.replace("Konu : Bilgi edinme başvurusu",
                                        "Konu : Bilgi edinme başvurusu)")
        rapor = lint_2646(taslak, "cevabi_yazi")
        # Assert
        assert any("m.13" in u for u in rapor["uyari"])

    def test_imza_vekalet_eki_gecti(self):
        # Arrange — m.17 f.10: vekâleten imzada ad SOYAD'ın altına/yanına 'V.' eklenir
        taslak = _UYUMLU_CEVABI.replace("Ad SOYAD", "Ad SOYAD V.")
        k = next(k for k in lint_2646(taslak, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M17-imza")
        # Assert
        assert k["durum"] == "gecti"


class TestDayanakVeOneri:
    """Her kural yönetmelik LAFZI (dayanak — korpustan, uydurma imkânsız) ve ihlalde
    somut düzeltme önerisi (oneri) taşır — ESLint 'why + how to fix' deseni."""

    def test_madde_kurali_dayanak_tasir(self):
        # Arrange / Act
        k = next(k for k in lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-M10-baslik")
        # Assert — dayanak korpustaki m.10 lafzından gelir
        assert "T.C." in k.get("dayanak", "")

    def test_uyari_kurali_oneri_tasir(self):
        # Arrange — T.C. başlıksız taslak → m.10 uyarısı somut düzeltme önerir
        rapor = lint_2646("Sayı : E-1234567-010-1  01.07.2026\nKonu : Test\nRica ederim.\nX", "")
        k = next(k for k in rapor["kurallar"] if k["kural"] == "L-M10-baslik")
        # Assert
        assert k["durum"] == "uyari" and k.get("oneri")

    def test_uslup_kurali_dayanaksiz_kalabilir(self):
        # Arrange / Act — üslup kuralının korpusta birebir maddesi yok → dayanak boş/yok
        k = next(k for k in lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")["kurallar"]
                 if k["kural"] == "L-USLUP-yasak")
        # Assert — uydurma dayanak atanmamış
        assert not k.get("dayanak")


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
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "uyari"
        assert "arz" in m16["mesaj"].lower()

    def test_dogru_kapanis_hiyerarsi_dogrulanir(self):
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ederim.")
        rapor = lint_2646(taslak, "cevabi_yazi", muhatap_makam="Personel Genel Müdürlüğü")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "gecti"

    def test_muhatap_verilmezse_eski_davranis(self):
        # Geriye uyumluluk: parametre yoksa varlık kontrolü aynen sürer.
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "gecti"

    def test_dagitimli_arz_ve_rica_gecer(self):
        taslak = _UYUMLU_CEVABI.replace("Gereğini rica ederim.", "Gereğini arz ve rica ederim.")
        rapor = lint_2646(taslak, "cevabi_yazi", muhatap_makam="Personel Genel Müdürlüğü")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "gecti"

    def test_muhatap_cozulemezse_varlik_kontrolune_duser(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi", muhatap_makam="Sayın Ayşe Yılmaz")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "gecti"  # hiyerarşi bilinmiyor → yanlış-pozitif uyarı YOK


class TestLintYasakIfade:
    def test_yasak_ifade_uyari(self):
        taslak = _UYUMLU_CEVABI.replace(
            "İlgi yazıda belirtilen husus değerlendirilmiştir.",
            "İlgi yazıda belirtilen husus değerlendirilmiştir. İyi çalışmalar dileriz.")
        rapor = lint_2646(taslak, "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
        assert uslup["durum"] == "uyari"
        assert "iyi çalışmalar" in uslup["mesaj"].lower()

    def test_temiz_taslakta_yasak_ifade_yok(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
        assert uslup["durum"] == "gecti"

    def test_yasak_ifade_madde_uydurmaz(self):
        # CLAUDE.md disiplini: üslup kuralı korpustaki bir maddeye ATIF YAPMAZ.
        taslak = _UYUMLU_CEVABI + "\nKolay gelsin."
        rapor = lint_2646(taslak, "cevabi_yazi")
        uslup = next(k for k in rapor["kurallar"] if k["kural"] == "L-USLUP-yasak")
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


class TestTabloGenisletme:
    """Katman A — yaygın kamu birimi türleri deterministik tabloda."""

    def test_buyuksehir_ile_ilce_belediyesi_ayrisir(self):
        # Büyükşehir (5) > ilçe belediyesi (6): büyükşehirden ilçe belediyesine rica.
        oneri = kapanis_onerisi("Ankara Büyükşehir Belediye Başkanlığı",
                                "Çankaya Belediye Başkanlığı")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_bolge_mudurlugu_tasra_kademesi(self):
        # Genel müdürlükten (5) bölge müdürlüğüne (6) rica.
        oneri = kapanis_onerisi("Devlet Su İşleri Genel Müdürlüğü",
                                "DSİ 5. Bölge Müdürlüğü")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_bashekimlik_ve_genel_sekreterlik(self):
        # İl sağlık müdürlüğü (6) ↔ başhekimlik (6): eş → arz.
        oneri = kapanis_onerisi("İl Sağlık Müdürlüğü", "Şehir Hastanesi Başhekimliği")
        assert oneri is not None and oneri[0] == "arz ederim"
        # Rektörlükten (5) genel sekreterliğe (6) rica.
        oneri = kapanis_onerisi("Üniversite Rektörlüğü", "Üniversite Genel Sekreterliği")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_il_ilce_muftulugu_regexle_ayrisir(self):
        # il/ilçe regex'i müftülüğe genellendi: il müftülüğü (6) > ilçe müftülüğü (7).
        oneri = kapanis_onerisi("İzmir İl Müftülüğü", "Karşıyaka İlçe Müftülüğü")
        assert oneri is not None and oneri[0] == "rica ederim"

    def test_enstitu_ve_fakulte(self):
        oneri = kapanis_onerisi("Fen Bilimleri Enstitüsü", "Üniversite Rektörlüğü")
        assert oneri is not None and oneri[0] == "arz ederim"


class TestLlmKademeFallback:
    """Katman B — tablo çözemezse LLM tahmini YALNIZ 'bilgi' üretir (asla uyari)."""

    def test_llm_seviyesi_bilgi_uretir_uyari_uretmez(self):
        # Tablo 'Atom Enerjisi Kurumu Acayip Ofisi'ni çözemez; LLM kademe=5 verdi diyelim.
        # Taslak ters kalıp ('rica') taşısa bile durum en fazla BİLGİ olur (bant güvenliği).
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi",
                          muhatap_makam="Acayip Ofisi Kurumu",
                          muhatap_seviye_llm=5)
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "bilgi"
        assert "arz" in m16["mesaj"].lower()          # beklenen kalıp söylenir
        assert not any("m.16" in u for u in rapor["uyari"])  # ASLA uyari listesine girmez

    def test_tablo_cozuyorsa_llm_tahmini_yok_sayilir(self):
        # Deterministik çözüm varken LLM tahmini davranışı DEĞİŞTİREMEZ (uyari kalır).
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi",
                          muhatap_makam="Personel Genel Müdürlüğü",
                          muhatap_seviye_llm=8)
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "uyari"  # tablo: üst makam, taslak 'rica' → gerçek ihlal


class TestSeffaflikNotu:
    """Katman C — kurum-görünümlü çözümsüz muhatapta 'elle doğrula' bilgi notu;
    vatandaş adında sessizlik (gürültü yok)."""

    def test_kurum_gorunumlu_cozumsuz_bilgi_notu(self):
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi",
                          muhatap_makam="Türkiye Uzay Ajansı Yörünge Ofisi Kurumu")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "bilgi"
        assert "elle" in m16["mesaj"].lower() or "doğrula" in m16["mesaj"].lower()

    def test_vatandas_muhatapta_sessiz(self):
        # Kişi adı kurum ipucu taşımaz → eski davranış (varlık kontrolü gecti), not yok.
        rapor = lint_2646(_UYUMLU_CEVABI, "cevabi_yazi", muhatap_makam="Ayşe Yılmaz")
        m16 = next(k for k in rapor["kurallar"] if k["kural"] == "L-M16-kapanis")
        assert m16["durum"] == "gecti"
        assert "elle" not in m16["mesaj"].lower()


class TestVerifyLlmKademe:
    def test_mock_modda_llm_kademe_none(self):
        # CI/mock: LLM yok → tahmin None → katman B tamamen susar (deterministik fallback).
        import asyncio

        from agents.nodes.verify import _makam_seviye_llm
        assert asyncio.run(_makam_seviye_llm("Acayip Ofisi Kurumu")) is None


class TestYeniKurallarM21M22M25:
    """m.21 Paraf · m.22 Koordinasyon · m.25 Gizlilik — gerçek 2646 unsurları (korpus dayanaklı)."""

    def test_paraf_e_belgede_gecti_uyari_yok(self):
        # m.21: e-belgede paraf EBYS'de tutulur → geçti (asla uyari — bant güvenliği)
        k = next(k for k in lint_2646("T.C.\nSayı : E-1-010-1  01.07.2026\nRica ederim.\nX",
                                      "")["kurallar"] if k["kural"] == "L-M21-paraf")
        assert k["durum"] == "gecti"
        assert k.get("dayanak")  # korpus m.21 lafzı

    def test_gizlilik_tasnif_disi_gecti(self):
        # m.25: gizlilik ibaresi yok → belge tasnif dışı → geçti
        k = next(k for k in lint_2646("T.C.\nKonu : x\nRica ederim.", "")["kurallar"]
                 if k["kural"] == "L-M25-gizlilik")
        assert k["durum"] == "gecti"
        assert "tasnif dışı" in k["mesaj"].lower()

    def test_gizlilik_derece_isareti_taninir(self):
        # m.25: geçerli derece işaretliyse belirtilmiş olarak geçer (uzun-önce: HİZMETE ÖZEL)
        k = next(k for k in lint_2646("T.C.\nHİZMETE ÖZEL\nKonu : x\nRica ederim.", "")["kurallar"]
                 if k["kural"] == "L-M25-gizlilik")
        assert k["durum"] == "gecti"
        assert "Hizmete Özel" in k["mesaj"]

    def test_ozel_idaresi_gizlilik_sanilmaz(self):
        # Regresyon (review MEDIUM): 'İl Özel İdaresi' yaygın kurum adı → gizlilik derecesi
        # DEĞİL; belge tasnif dışı raporlanmalı ('Özel' yanlış-eşleşmesi negatif ileri-bakışla önlendi).
        k = next(k for k in lint_2646("T.C.\nANKARA İLİ ÖZEL İDARESİ\nKonu : x\nRica ederim.",
                                      "")["kurallar"] if k["kural"] == "L-M25-gizlilik")
        assert k["durum"] == "gecti"
        assert "tasnif dışı" in k["mesaj"].lower()

    def test_paraf_blok_varsa_gecti(self):
        # m.21: fiziksel 'Paraf:' bloğu varsa geçti (etiket-dalı kapsamı)
        k = next(k for k in lint_2646("T.C.\nKonu : x\nRica ederim.\nParaf : Uzman A.Y.",
                                      "")["kurallar"] if k["kural"] == "L-M21-paraf")
        assert k["durum"] == "gecti"
        assert "mevcut" in k["mesaj"]

    def test_koordinasyon_blok_varsa_gecti(self):
        # m.22: 'Koordinasyon:' bloğu varsa geçti (etiket-dalı kapsamı)
        k = next(k for k in lint_2646("T.C.\nKonu : x\nRica ederim.\nKoordinasyon : Şb.Md. B.C.",
                                      "")["kurallar"] if k["kural"] == "L-M22-koordinasyon")
        assert k["durum"] == "gecti"

    def test_koordinasyon_kosullu_uretilir(self):
        # m.22: koordinasyon sözü yok → kural HİÇ üretilmez (m.18/19 deseni)
        kurallar = lint_2646("T.C.\nKonu : x\nRica ederim.", "")["kurallar"]
        assert not any(k["kural"] == "L-M22-koordinasyon" for k in kurallar)
        # gövde 'iş birliği' der ama blok yok → bilgi (uyari değil)
        k = next(k for k in lint_2646("T.C.\nKonu : x\nİlgili birimle iş birliği yapılmıştır.\n"
                                      "Rica ederim.", "")["kurallar"]
                 if k["kural"] == "L-M22-koordinasyon")
        assert k["durum"] == "bilgi"

    def test_yeni_kurallar_banda_dokunmaz(self):
        # Bant güvenliği: yeni üç kural hiçbir temiz taslakta 'uyari' (SARI) üretmez
        rapor = lint_2646("T.C.\nSayı : E-1-010-1  01.07.2026\nKonu : x\nRica ederim.\nAyşe YILMAZ", "")
        yeni = [k for k in rapor["kurallar"]
                if k["kural"] in {"L-M21-paraf", "L-M22-koordinasyon", "L-M25-gizlilik"}]
        assert all(k["durum"] != "uyari" for k in yeni)


class TestSdpSayiRegresyon:
    def test_sdp_konu_kodlu_sayi_bilgi_uyari_degil(self):
        # Regresyon: SDP Sayı'sı 'E-[DETSİS No]-903-[Kayıt No]' m.11-yapılı yer tutucudur →
        # bilgi (uyari DEĞİL); aksi halde SDP güçlendirmesi lint'te SARI üretirdi.
        from agents.yazi_lint import lint_2646
        t = "T.C.\nSayı : E-[DETSİS No]-903-[Kayıt No]  11.07.2026\nKonu : x\nRica ederim."
        k = next(k for k in lint_2646(t, "")["kurallar"] if k["kural"] == "L-M11-sayi")
        assert k["durum"] == "bilgi"
        assert "m.11 yapısında" in k["mesaj"]
