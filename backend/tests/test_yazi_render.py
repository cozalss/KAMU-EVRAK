"""yazi_render + renderer + draft_eval birim testleri — Yön. 2646 format-uyumu.

Kapsam:
  - build_context otomatik doldurma: gönderen→muhatap, tarih/sayı→ilgi (uydurma yok)
  - _fallback_body tür-uygun resmî gövde (cevabi/olur/bilgilendirme/üst farklı kip)
  - render_yazi 4 yazı türü: metin + PDF (%PDF) + DOCX (PK) + placeholder dürüstlüğü
  - draft_eval bölüm-bölüm format skoru: sıra, kapanış-türü, muhatap-türü, olur yapısı

Tümü deterministik (mock/offline) — ağ/GPU/LLM yok. AAA deseni.
"""

from __future__ import annotations

from yazi.models import YaziContext
from yazi.renderer import detect_eksik_format, render_metin, render_yazi
from yazi.yazi_render import (
    _fallback_body,
    _ilgi_satirlari,
    _muhatap,
    build_alt_talep_taslaklari,
    build_context,
    ts13298_ust_veri,
)

# ---------------------------------------------------------------------------
# build_context — otomatik doldurma (placeholder azaltma)
# ---------------------------------------------------------------------------


class TestMuhatapTuretme:
    """Gelen belgenin göndereni cevabımızın muhatabı olur (Yön. m.14)."""

    def test_gonderen_sayin_ile_muhataba_donusur(self):
        # Arrange
        unsurlar = {"gonderen": "Elif Kılıç"}
        # Act
        muhatap = _muhatap(unsurlar)
        # Assert
        assert muhatap == "Sayın Elif Kılıç"

    def test_parantezli_sifat_atilir(self):
        # Arrange — "(İlgili)" resmî hitapta yer almaz
        unsurlar = {"gonderen": "Hasan Kılıç (Vatandaş)"}
        # Act
        muhatap = _muhatap(unsurlar)
        # Assert
        assert muhatap == "Sayın Hasan Kılıç"

    def test_kurum_aynen_kullanilir(self):
        # Arrange — tüzel kişi "Sayın" almaz
        unsurlar = {"kurum": "Ankara Cumhuriyet Başsavcılığı"}
        # Act
        muhatap = _muhatap(unsurlar)
        # Assert
        assert muhatap == "Ankara Cumhuriyet Başsavcılığı"

    def test_eksikse_bos_doner(self):
        # Arrange — bilgi yok → placeholder'a düşsün (uydurma yok)
        # Act
        muhatap = _muhatap({})
        # Assert
        assert muhatap == ""


class TestIlgiTuretme:
    """İlgi satırı gelen belgenin tarih+sayısından kurulur (Yön. m.15)."""

    def test_tam_ilgi_satiri(self):
        # Arrange
        unsurlar = {"tarih": "10.04.2026", "sayi": "E-59883029-423.03-4453"}
        # Act
        satirlar = _ilgi_satirlari(unsurlar)
        # Assert
        assert satirlar == ("10.04.2026 tarihli ve E-59883029-423.03-4453 sayılı yazınız.",)

    def test_eksik_tarih_demo_guvenli_atif(self):
        # Arrange — yalnız sayı var → tarih uydurulmaz, Jinja placeholder gösterilmez
        unsurlar = {"sayi": "E-123-456"}
        # Act
        satirlar = _ilgi_satirlari(unsurlar)
        # Assert
        assert satirlar == ("E-123-456 sayılı başvurunuz.",)
        assert "{{" not in satirlar[0]

    def test_hicbiri_yoksa_basvuru_atfi(self):
        # Arrange / Act / Assert
        assert _ilgi_satirlari({}) == ("Başvurunuz.",)


class TestBuildContextAutoFill:
    """build_context çıkarılan unsurları azami kullanır; eksikleri placeholder bırakır."""

    def test_cevabi_yazi_muhatap_ve_ilgi_dolu(self):
        # Arrange
        unsurlar = {"gonderen": "Ahmet Yıldız", "konu": "park yeri",
                    "tarih": "21.06.2026", "sayi": "E-688-329"}
        # Act
        ctx = build_context("cevabi_yazi", unsurlar, "gövde")
        # Assert
        assert ctx.muhatap == "Sayın Ahmet Yıldız"
        assert ctx.ilgi_satirlari and "21.06.2026" in ctx.ilgi_satirlari[0]
        assert ctx.konu == "park yeri"

    def test_olur_muhatap_ve_ilgi_yok(self):
        # Arrange — olur'da muhatap ve İlgi bulunmaz (Yön. m.20)
        unsurlar = {"gonderen": "Emine Acar", "konu": "su kesintisi",
                    "tarih": "06.08.2026", "sayi": "E-818-606"}
        # Act
        ctx = build_context("olur", unsurlar, "teklif")
        # Assert
        assert ctx.muhatap == ""
        assert ctx.ilgi_satirlari == ()

    def test_muzekkere_ve_gorus_ilgi_atfi_kurulur(self):
        # Regresyon: muzekkere.j2/gorus_mutalaa.j2 İlgi bloğu İÇERİR ama build_context
        # bu iki türe hiç ilgi_satirlari üretmiyordu (şablon bloğu hep boş kalıyordu).
        unsurlar = {"tarih": "21.06.2026", "sayi": "E-688-329"}
        for turu in ("muzekkere", "gorus_mutalaa"):
            ctx = build_context(turu, unsurlar, "gövde")
            assert ctx.ilgi_satirlari and "21.06.2026" in ctx.ilgi_satirlari[0]


class TestMuhatapOverride:
    """ust_yazi (kurum-içi iletim) muhatabı gönderen değil HEDEF BİRİM olmalı."""

    def test_ust_yazida_override_gonderenin_onune_gecer(self):
        # Arrange — gonderen dolu olsa da (gelen dilekçenin sahibi) üst yazı BİRİME gider
        unsurlar = {"gonderen": "Ayşe Yılmaz", "konu": "çukur onarımı"}
        # Act
        ctx = build_context("ust_yazi", unsurlar, "gövde", muhatap_override="İlgili Teknik Daire")
        # Assert
        assert ctx.muhatap == "İlgili Teknik Daire"
        assert "Ayşe Yılmaz" not in ctx.muhatap

    def test_override_yoksa_eski_davranis_korunur(self):
        # Arrange — geriye uyum: override verilmezse gonderen muhatap olur
        unsurlar = {"gonderen": "Ayşe Yılmaz"}
        # Act
        ctx = build_context("ust_yazi", unsurlar, "gövde")
        # Assert
        assert ctx.muhatap == "Sayın Ayşe Yılmaz"

    def test_olurda_override_yok_sayilir(self):
        # Arrange — olur türünde muhatap hiçbir zaman render edilmez (Yön. m.20)
        unsurlar = {"gonderen": "Emine Acar"}
        # Act
        ctx = build_context("olur", unsurlar, "teklif", muhatap_override="İlgili Birime")
        # Assert
        assert ctx.muhatap == ""

    def test_muzekkere_vatandas_adi_sizdirmaz(self):
        # Regresyon: muzekkere kurum-içi/adli bir yazıdır; override yoksa _muhatap()'ın
        # ürettiği "Sayın <gönderen>" (cevabi-yazı varsayımı) sızmamalı.
        unsurlar = {"gonderen": "Ayşe Yılmaz"}
        ctx = build_context("muzekkere", unsurlar, "gövde")
        assert ctx.muhatap == ""
        assert "Ayşe Yılmaz" not in ctx.muhatap

    def test_gorus_mutalaa_vatandas_adi_sizdirmaz(self):
        unsurlar = {"gonderen": "Ayşe Yılmaz"}
        ctx = build_context("gorus_mutalaa", unsurlar, "gövde")
        assert ctx.muhatap == ""
        assert "Ayşe Yılmaz" not in ctx.muhatap

    def test_muzekkere_override_ile_hedef_makam_kullanilir(self):
        # route_birim/decompose bir hedef birim bulduysa (ör. Hukuk Müşavirliği) o kullanılır.
        ctx = build_context("muzekkere", {}, "gövde", muhatap_override="Hukuk Müşavirliği")
        assert ctx.muhatap == "Hukuk Müşavirliği"


# ---------------------------------------------------------------------------
# build_alt_talep_taslaklari — çok-konulu evrakta birim başına ayrı üst yazı
# ---------------------------------------------------------------------------


class TestBuildAltTalepTaslaklari:
    """Her alt-talep kendi birimine giden ayrı üst yazı taslağı almalı."""

    async def test_tek_konulu_degismeden_doner(self):
        # Arrange — < 2 alt-talep → ek işlem/maliyet yok
        alt = [{"ozet": "çukur onarımı", "birim_tr": "İlgili Teknik Daire"}]
        # Act
        sonuc = await build_alt_talep_taslaklari(alt, {}, "evrak metni")
        # Assert
        assert sonuc == alt

    async def test_coklu_konu_her_biri_kendi_birimine_yazilir(self):
        # Arrange — Ayşe Yılmaz'ın 3 farklı talebi, 3 farklı birim
        alt = [
            {"ozet": "çukurun onarılması", "birim_tr": "İlgili Teknik Daire"},
            {"ozet": "su faturası itirazı", "birim_tr": "Strateji Geliştirme / Mali İşler"},
            {"ozet": "iş başvurusu sonucu", "birim_tr": "İnsan Kaynakları / Personel Dairesi"},
        ]
        # Act
        sonuc = await build_alt_talep_taslaklari(alt, {"gonderen": "Ayşe Yılmaz"}, "evrak metni")
        # Assert — her taslak KENDİ birimine muhatap, vatandaşa değil
        assert len(sonuc) == 3
        for orijinal, taslak in zip(alt, sonuc, strict=True):
            assert taslak["yazi_turu"] == "ust_yazi"
            assert taslak["birim_tr"] in taslak["yazi_taslak_md"]
            assert "Ayşe Yılmaz" not in taslak["yazi_taslak_md"]
            assert taslak["ozet"] == orijinal["ozet"]

    async def test_birim_bilgisi_yoksa_notr_muhatap(self):
        # Arrange — birim_tr eksik → uydurma yok, nötr ifade
        alt = [{"ozet": "talep 1"}, {"ozet": "talep 2"}]
        # Act
        sonuc = await build_alt_talep_taslaklari(alt, {}, "")
        # Assert
        assert all("İlgili Birime" in t["yazi_taslak_md"] for t in sonuc)


# ---------------------------------------------------------------------------
# _fallback_body — tür-uygun resmî gövde (sadece placeholder değil)
# ---------------------------------------------------------------------------


class TestFallbackBody:
    """Mock modda gövde tür+konuya göre anlamlı resmî paragraf üretir."""

    def test_cevabi_ilgi_atfiyla_baslar(self):
        body = _fallback_body("cevabi_yazi", "izin talebi", has_ilgi=True)
        assert "İlgi yazıda" in body and "izin talebi" in body

    def test_olur_teklif_kipinde(self):
        body = _fallback_body("olur", "su kesintisi", has_ilgi=True)
        # olur cevabi koluna düşmemeli (eski bug); teklif/onay dili olmalı
        assert "İlgi yazıda" not in body
        assert "onay" in body.lower() or "teklif" in body.lower()

    def test_bilgilendirme_bilgilendirme_dili(self):
        body = _fallback_body("bilgilendirme", "harcama kalemleri", has_ilgi=False)
        assert "bilgilendir" in body.lower()

    def test_konu_yoksa_uydurma_yok(self):
        # konu boş → somut konu uydurulmaz; nötr ifade
        body = _fallback_body("cevabi_yazi", "", has_ilgi=False)
        assert "ilgili" in body.lower()

    def test_muzekkere_ve_gorus_ust_yaziyla_ayni_metni_paylasmaz(self):
        # Regresyon: muzekkere/gorus_mutalaa dal EKSİKTİ → sessizce üst yazı metnine
        # düşüyordu (iki tür + üst yazı birebir AYNI çıktı üretiyordu).
        konu = "kayıt celbi"
        ust_yazi = _fallback_body("ust_yazi", konu, has_ilgi=False)
        muzekkere = _fallback_body("muzekkere", konu, has_ilgi=False)
        gorus = _fallback_body("gorus_mutalaa", konu, has_ilgi=False)
        assert muzekkere != ust_yazi
        assert gorus != ust_yazi
        assert muzekkere != gorus

    def test_gorus_mutalaa_hukuki_degerlendirme_dili(self):
        # Görüş gövdesi hukuki-görüş dili + kapalı-uçlu cevap çerçevesi taşır (havada kalmaz).
        body = _fallback_body("gorus_mutalaa", "sözleşme feshi", has_ilgi=False)
        assert "hukuki görüş" in body.lower()
        assert "ayrıca bildirilecektir" in body.lower()


# ---------------------------------------------------------------------------
# render_yazi — 4 yazı türü: metin + PDF + DOCX + placeholder dürüstlüğü
# ---------------------------------------------------------------------------


def _ctx(turu: str) -> YaziContext:
    return build_context(
        turu,
        {"gonderen": "Test Kişi", "konu": "deneme konusu",
         "tarih": "01.01.2026", "sayi": "E-1-2"},
        "gövde metni",
    )


class TestRenderYaziTumTurler:
    """4 yazı türü için metin + PDF (%PDF) + DOCX (PK) üretilir."""

    def test_cevabi_yazi_pdf_docx_imzalari(self):
        # Arrange / Act
        res = render_yazi(_ctx("cevabi_yazi"))
        # Assert — PDF sihirli baytı + DOCX zip sihirli baytı
        assert res.pdf_bytes and res.pdf_bytes[:4] == b"%PDF"
        assert res.docx_bytes and res.docx_bytes[:2] == b"PK"
        assert "T.C." in res.metin

    def test_olur_olur_bloku_var_muhatap_yok(self):
        # Arrange / Act
        res = render_yazi(_ctx("olur"))
        # Assert — Yön. m.20: ortalı OLUR var; "Sayın"/muhatap yok
        assert "\n" in res.metin
        assert "OLUR" in res.metin
        assert "Sayın" not in res.metin

    def test_bilgilendirme_kapanisi(self):
        # _ctx muhatabı gerçek kişi ("Test Kişi" → "Sayın ...") → m.16/12-e kişi kapanışı.
        res = render_yazi(_ctx("bilgilendirme"))
        assert "Bilgilerinize sunulur." in res.metin

    def test_bilgilendirme_dagitim_kapanisi(self):
        # Muhatapsız (DAĞITIM YERLERİNE) bilgilendirme → m.16/12-b dağıtım kapanışı.
        ctx = build_context("bilgilendirme", {"konu": "Duyuru"}, "gövde metni")
        assert ctx.kapanis == "Bilgilerini ve gereğini arz ve rica ederim."

    def test_ust_yazi_kapanisi(self):
        res = render_yazi(_ctx("ust_yazi"))
        assert "arz ederim." in res.metin


class TestDemoSafeDefaults:
    """Bilinmeyen alanlar demo metninde Jinja placeholder olarak görünmez."""

    def test_bilinmeyen_alanlar_demo_guvenli_dolar(self):
        # Arrange / Act
        res = render_yazi(_ctx("cevabi_yazi"))
        metin = res.metin
        eksik = detect_eksik_format(metin)
        # Assert — idare/birim/imza bilinmiyor ama jüri demosunda {{ }} görünmez
        assert "{{" not in metin
        assert "}}" not in metin
        assert eksik == ()
        assert res.format_uyumlu is True
        assert "Sayın Test Kişi" in metin

    def test_sayi_ebys_taslak_degeriyle_gosterilir(self):
        # Arrange — OUR yazının sayısı EBYS'ce atanır; sahte DETSİS numarası yazma
        metin = render_metin(_ctx("cevabi_yazi"))
        # Assert — eski "E-DETSİS-SDP-KAYIT" çöp metni yok, Jinja placeholder da yok
        assert "DETSİS-SDP-KAYIT" not in metin
        assert "{{ SAYI }}" not in metin
        assert "EBYS" in metin


# ---------------------------------------------------------------------------
# draft_eval — bölüm-bölüm format skoru
# ---------------------------------------------------------------------------


class TestDraftEvalFormatSkoru:
    """Ayrıntılı format skoru bölüm sırası + kapanış-türü + muhatap-türünü ölçer."""

    def test_tam_uyumlu_taslak_skor_1(self):
        from eval.draft_eval import format_skoru
        # Arrange — tam Yön. 2646 cevabi yazı
        res = render_yazi(_ctx("cevabi_yazi"))
        # Act
        skor, boyutlar = format_skoru(res.metin, "cevabi_yazi")
        # Assert
        assert skor == 1.0
        assert all(boyutlar.values())

    def test_bozuk_sira_yakalanir(self):
        from eval.draft_eval import check_siralama
        # Arrange — kapanış başlıktan önce (bozuk sıra)
        bozuk = "Gereğini rica ederim.\nT.C.\nSayı : x\nKonu : y\n{{ AD SOYAD }}"
        # Act / Assert
        assert check_siralama(bozuk) is False

    def test_kapanis_turu_yanlis_yakalanir(self):
        from eval.draft_eval import check_kapanis_turu
        # Arrange — olur'da "rica ederim" yanlış (olurlarınıza arz olmalı)
        taslak_yanlis = "...\nGereğini rica ederim.\n"
        # Act / Assert
        assert check_kapanis_turu(taslak_yanlis, "olur") is False

    def test_olur_yapisi_muhatapsiz(self):
        from eval.draft_eval import check_olur_yapisi
        # Arrange
        res = render_yazi(_ctx("olur"))
        # Act / Assert
        assert check_olur_yapisi(res.metin) is True

    def test_olur_muhatapli_taslak_reddedilir(self):
        from eval.draft_eval import check_olur_yapisi
        # Arrange — olur'a yanlışlıkla muhatap eklenmiş
        yanlis = "Sayın Ali Veli\n...\nOLUR\n"
        # Act / Assert
        assert check_olur_yapisi(yanlis) is False


class TestKapanisHiyerarsi:
    """m.16 — kapanış, muhatap makam hiyerarşisine göre OTOMATİK seçilir (rakip analizi
    sonrası eklendi). Muhatap çözülemezse (vatandaş) tür varsayılanı korunur."""

    def test_cevabi_yazida_ust_makama_arz_secilir(self):
        # cevabi_yazi varsayılanı 'rica' — ama muhatap (Valilik) üst makam → arz'a çevrilir
        ctx = build_context("cevabi_yazi", {"gonderen": "Ankara Valiliği"}, "gövde")
        assert ctx.kapanis == "Gereğini arz ederim."

    def test_ust_yazida_alt_makama_rica_secilir(self):
        # Gönderen birim (yazı işleri, müdürlük düzeyi) → muhatap şeflik (alt) → rica
        ctx = build_context("ust_yazi", {}, "gövde", muhatap_override="Evrak Kayıt Şefliği")
        assert ctx.kapanis == "Gereğini rica ederim."

    def test_vatandas_muhatapta_kisi_kapanisi(self):
        # m.16/12-e: muhatap gerçek kişi → "Bilgilerinize sunulur." (arz/rica makam dili değil)
        ctx = build_context("cevabi_yazi", {"gonderen": "Ayşe Yılmaz"}, "gövde")
        assert ctx.kapanis == "Bilgilerinize sunulur."

    def test_bilgilendirme_kapanisina_dokunulmaz(self):
        # 'Bilgilerinize arz ederim.' kalıbı türe özgü — hiyerarşi override uygulanmaz
        ctx = build_context("bilgilendirme", {"gonderen": "Ankara Valiliği"}, "gövde")
        assert ctx.kapanis == "Bilgilerinize arz ederim."


# ---------------------------------------------------------------------------
# SDP (Yön. m.11 Sayı konu-kodu) + TS 13298 üst-veri entegrasyonu
# ---------------------------------------------------------------------------
class TestSdpUstVeri:
    def test_sdp_kodu_sayi_satirini_m11_yapisina_koyar(self):
        # Arrange / Act
        ctx = build_context("ust_yazi", {"konu": "Nakil talebi"}, "gövde", sdp_kodu="903")
        metin = render_metin(ctx)
        # Assert — Sayı 'EBYS-TASLAK' değil, m.11-yapılı gerçek SDP kodu
        assert ctx.sdp == "903"
        assert "E-[DETSİS No]-903-[Kayıt No]" in metin
        assert "EBYS-TASLAK" not in metin

    def test_sdp_yoksa_ebys_taslak_placeholder_korunur(self):
        # Additivity: sdp_kodu boş → bugünkü davranış birebir (EBYS-TASLAK)
        ctx = build_context("ust_yazi", {"konu": "x"}, "gövde", sdp_kodu="")
        assert "EBYS-TASLAK" in render_metin(ctx)

    def test_ts13298_ust_veri_grounded_alanlar(self):
        uv = ts13298_ust_veri("cevabi_yazi", "Nakil talebi",
                              {"kod": "903", "baslik": "Atama İşleri"},
                              "E-[DETSİS No]-903-[Kayıt No]", "11.07.2026")
        assert uv["dosya_plani_kodu"] == "903"
        assert uv["dosya_plani_adi"] == "Atama İşleri"
        assert uv["guvenlik_kodu"] == "Tasnif Dışı"
        assert "TS 13298" in uv["standart"]

    def test_ts13298_ust_veri_sdp_yoksa_dosya_plani_alani_yok(self):
        # SDP None → uydurma alan üretilmez (dosya_plani_kodu hiç yok)
        uv = ts13298_ust_veri("ust_yazi", "x", None, "EBYS-TASLAK", "11.07.2026")
        assert "dosya_plani_kodu" not in uv
        assert uv["guvenlik_kodu"] == "Tasnif Dışı"
