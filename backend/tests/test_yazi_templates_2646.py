"""Resmî yazı şablonları — Yön. 2646 e-Yazışma geliştirmeleri (e-imza/ivedilik/iletişim
+ müzekkere/görüş yeni türleri). Render deterministik; LLM yok.
"""

from __future__ import annotations

import pytest

from agents.config import YAZI_TURLERI
from yazi.models import YaziContext
from yazi.renderer import detect_eksik_format, render_metin
from yazi.template_registry import available_yazi_turleri, default_kapanis, template_file


def _ctx(yazi_turu: str, **kw) -> YaziContext:
    base = dict(
        tarih="27.06.2026", idare_adi="X BAKANLIĞI", birim_adi="Y MÜDÜRLÜĞÜ",
        konu="Test konusu", metin="Gövde metni.", ad_soyad="Ad SOYAD", unvan="Unvan",
    )
    base.update(kw)
    return YaziContext(yazi_turu=yazi_turu, **base)


# --- E-imza bloğu (Yön. 2646 m.23) ---------------------------------------


def test_eimza_blogu_kapali_iken_render_edilmez():
    # Arrange + Act
    metin = render_metin(_ctx("cevabi_yazi"))
    # Assert — e_imza=False (varsayılan) → blok yok
    assert "güvenli elektronik imza" not in metin


def test_eimza_blogu_acik_iken_dogrulama_satirlari_gelir():
    # Arrange + Act
    metin = render_metin(_ctx("cevabi_yazi", e_imza=True))
    # Assert — m.23 üç bileşen
    assert "Bu belge, güvenli elektronik imza ile imzalanmıştır." in metin
    assert "Belge Doğrulama Kodu" in metin
    assert "belge-dogrulama" in metin  # doğrulama adresi


def test_eimza_dogrulama_kodu_uydurulmaz():
    # Arrange + Act — kod verilmedi → nötr ifade (sahte kod YOK, CLAUDE.md §1)
    metin = render_metin(_ctx("cevabi_yazi", e_imza=True))
    # Assert
    assert "EBYS tarafından imzalama anında atanır" in metin


# --- İvedilik / gizlilik işaretleri (m.31) -------------------------------


def test_ivedilik_gizlilik_buyuk_harf_render():
    # Arrange + Act
    metin = render_metin(_ctx("ust_yazi", ivedilik_derecesi="acele", gizlilik_derecesi="kişiye özel"))
    # Assert — büyük harfe çevrilir
    assert "ACELE" in metin
    assert "KİŞİYE ÖZEL" in metin


def test_isaret_yoksa_satir_eklenmez():
    # Arrange + Act
    metin = render_metin(_ctx("ust_yazi"))
    # Assert
    assert "ACELE" not in metin and "GİZLİ" not in metin


# --- Sayı otomatik kompoze (m.11) ----------------------------------------


def test_sayi_oto_kompoze_uc_bilesen():
    # Arrange + Act
    metin = render_metin(_ctx("ust_yazi", detsis="45678257", sdp="622.03", kayit_no="12345"))
    # Assert — E-DETSİS-SDP-KAYIT
    assert "E-45678257-622.03-12345" in metin


def test_sayi_eksik_bilesende_ebys_taslak():
    # Arrange + Act — sadece detsis var → kompoze etme, EBYS-TASLAK
    metin = render_metin(_ctx("ust_yazi", detsis="45678257"))
    # Assert
    assert "EBYS-TASLAK" in metin


# --- İletişim dipnotu (m.23) ---------------------------------------------


def test_iletisim_dipnot_ayri_satirlar():
    # Arrange + Act
    metin = render_metin(_ctx("cevabi_yazi", telefon="0312 000", email="a@b.tr", web="w.tr"))
    lines = metin.splitlines()
    # Assert — Tel ve e-Posta AYRI satırlarda (whitespace bug regresyon koruması)
    tel_line = next(line for line in lines if line.startswith("Tel :"))
    assert "e-Posta" not in tel_line
    assert any(line.startswith("e-Posta :") for line in lines)


# --- Yeni türler: müzekkere + görüş/mütalaa ------------------------------


@pytest.mark.parametrize("yazi_turu", ["muzekkere", "gorus_mutalaa"])
def test_yeni_turler_render_ve_kayitli(yazi_turu):
    # Arrange + Act
    metin = render_metin(_ctx(yazi_turu))
    # Assert — render olur + registry'de kayıtlı
    assert "T.C." in metin
    assert yazi_turu in available_yazi_turleri()


def test_gorus_mutalaa_kapanis():
    # Arrange + Act — gerçek kamu pratiği kalıbı (Diyanet Hukuk Müşavirliği örneği, 2026-07-17)
    assert default_kapanis("gorus_mutalaa") == "Bilgi ve gereğini arz ederim."
    metin = render_metin(_ctx("gorus_mutalaa", muhatap="İlgili Daireye"))
    # Assert
    assert "Bilgi ve gereğini arz ederim." in metin


# --- Tam bağlam format-uyumlu (placeholder kalmaz) -----------------------


def test_tam_baglam_eksik_format_yok():
    # Arrange — tüm zorunlu + e-yazışma alanları dolu
    ctx = _ctx(
        "cevabi_yazi", muhatap="Sayın A", e_imza=True, ivedilik_derecesi="ACELE",
        detsis="1", sdp="2", kayit_no="3", telefon="0312", email="a@b.tr",
    )
    # Act
    metin = render_metin(ctx)
    # Assert — kalan {{ PLACEHOLDER }} yok
    assert detect_eksik_format(metin) == ()


# --- Yeni-tür yayın sigortası: registry ↔ config ↔ dosya + boş-bağlam temizliği ---
# "Şablon yayınlandığında kusursuz yazabilme" değişmezini KİLİTLER. Yeni bir yazı
# türü eklenirken üç yer birlikte güncellenmezse (registry / config.YAZI_TURLERI /
# .j2 dosyası) sistem sessizce cevabi_yazi'ya düşer ya da node-fallback iskeletine
# iner — çökme değil ama "kusursuz" beklentisini bozan sessiz davranış. Bu testler
# o sessiz sapmayı CI'da yakalar.


def test_registry_config_yazi_turleri_birebir_ortusur():
    # Registry (renderer'ın kaynağı) ile config.YAZI_TURLERI (pipeline'ın kaynağı)
    # ıraksarsa yeni tür sessizce devre dışı kalır → burada erken yakala.
    assert set(available_yazi_turleri()) == set(YAZI_TURLERI)


@pytest.mark.parametrize("yazi_turu", available_yazi_turleri())
def test_her_kayitli_tur_render_edilir_ve_bos_baglamda_temiz(yazi_turu):
    # Arrange — YALNIZ zorunlu alanlar (tür + tarih); gerisi demo varsayılanına düşer.
    # Kayıtlı ama .j2 dosyası olmayan bir tür burada TemplateNotFound ile patlar (guard).
    ctx = YaziContext(yazi_turu=yazi_turu, tarih="09.07.2026")
    # Act
    metin = render_metin(ctx)
    # Assert — hiçbir ham {{ PLACEHOLDER }} kalmamalı (jüri önizlemesinde ham slot görünmez)
    assert detect_eksik_format(metin) == (), f"{yazi_turu}: ham placeholder kaldı"
    assert "{{" not in metin and "}}" not in metin
    # Registry çözümlemesi de dosya köküyle tutarlı olmalı (bilinmeyen → cevabi_yazi düşüşü değil)
    assert template_file(yazi_turu) == yazi_turu
