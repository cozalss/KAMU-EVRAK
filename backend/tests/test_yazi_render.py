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
from yazi.yazi_render import _fallback_body, _ilgi_satirlari, _muhatap, build_context


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
        res = render_yazi(_ctx("bilgilendirme"))
        assert "Bilgilerinize arz ederim." in res.metin

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
