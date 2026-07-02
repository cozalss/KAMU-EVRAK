"""EYP 2.0-uyumlu paket iskeleti testleri (S5).

Sözleşme: ZIP içinde UstYazi/ + Ustveri.json + NihaiOzet.json + BENIOKU.txt;
Nihai Özet ÇİFT algoritmalıdır (SHA-512 + SHA-256, EYP 2.0 gereği) ve içerikle
birebir doğrulanır; imza HİÇ üretilmez (IMZASIZ-TASLAK — sahte imza yasağı).
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile

from yazi.eyp import build_eyp_paket

_META = {
    "konu": "Bilgi edinme başvurusu",
    "yazi_turu": "bilgilendirme",
    "sdp_kodu": "622.03",
    "sdp_adi": "Bilgi edinme başvuruları (4982)",
    "hedef_birim": "Basın-Halkla İlişkiler / CİMER Birimi",
    "ilgi_tarih": "25.06.2026",
    "ilgi_sayi": "E-11112222-622.03-9",
    "filename": "ornek.txt",
}
_TASLAK = "T.C.\nKAMU KURUMU\n\nSayı : EBYS-TASLAK  01.07.2026\nKonu : Test\n\nGereğini rica ederim.\nAd SOYAD"


def _zip_oku(data: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(data))


class TestPaketYapisi:
    def test_zorunlu_bilesenler_mevcut(self):
        # Arrange / Act
        zf = _zip_oku(build_eyp_paket(_META, taslak_md=_TASLAK))
        adlar = set(zf.namelist())
        # Assert — EYP bileşen iskeleti tam
        assert adlar == {"UstYazi/resmi-yazi-taslak.txt", "Ustveri.json",
                         "NihaiOzet.json", "BENIOKU.txt"}

    def test_pdf_varsa_ustyazi_pdf_olur(self):
        zf = _zip_oku(build_eyp_paket(_META, taslak_md=_TASLAK, pdf_bytes=b"%PDF-sahte"))
        assert "UstYazi/resmi-yazi-taslak.pdf" in zf.namelist()
        assert zf.read("UstYazi/resmi-yazi-taslak.pdf") == b"%PDF-sahte"


class TestNihaiOzet:
    def test_cift_ozet_icerikle_dogrulanir(self):
        # Arrange
        data = build_eyp_paket(_META, taslak_md=_TASLAK)
        zf = _zip_oku(data)
        icerik = zf.read("UstYazi/resmi-yazi-taslak.txt")
        ozet = json.loads(zf.read("NihaiOzet.json"))
        # Assert — EYP 2.0: SHA-512 birincil + ikinci algoritma zorunlu
        assert ozet["algoritma"] == "SHA-512"
        assert ozet["ozet_sha512"] == hashlib.sha512(icerik).hexdigest()
        assert ozet["ikinci_algoritma"] == "SHA-256"
        assert ozet["ozet_sha256"] == hashlib.sha256(icerik).hexdigest()


class TestUstveri:
    def test_ustveri_alanlari_ve_imzasizlik(self):
        # Arrange / Act
        zf = _zip_oku(build_eyp_paket(_META, taslak_md=_TASLAK))
        u = json.loads(zf.read("Ustveri.json"))
        # Assert — alanlar meta'dan; imza ASLA üretilmez (dürüstlük sınırı)
        assert u["belge"]["dosya_plani_kodu"] == "622.03"
        assert u["belge"]["konu"] == _META["konu"]
        assert u["dagitim"][0]["hedef"] == _META["hedef_birim"]
        assert u["imza_bilgisi"]["durum"] == "IMZASIZ-TASLAK"

    def test_dogrula_isareti_koddan_temizlenir_bayraga_cevrilir(self):
        # Arrange — ana-hizmet kodu [DOĞRULA] işaretli gelir; EBYS üstverisine HAM işaret girmez
        meta = dict(_META, sdp_kodu="100 [DOĞRULA: kuruma-özgü ana hizmet kodu]")
        # Act
        zf = _zip_oku(build_eyp_paket(meta, taslak_md=_TASLAK))
        u = json.loads(zf.read("Ustveri.json"))
        # Assert — kod temiz, işaret ayrı bayrakta (bilgi kaybı yok, veri kirliliği yok)
        assert u["belge"]["dosya_plani_kodu"] == "100"
        assert u["belge"]["dosya_plani_dogrulama_gerekli"] is True

    def test_temiz_kod_dogrulama_bayragi_kapali(self):
        zf = _zip_oku(build_eyp_paket(_META, taslak_md=_TASLAK))
        u = json.loads(zf.read("Ustveri.json"))
        assert u["belge"]["dosya_plani_dogrulama_gerekli"] is False

    def test_bos_meta_uydurmaz(self):
        # Arrange — hiç meta yok → alanlar boş kalır (uydurma değer YOK)
        zf = _zip_oku(build_eyp_paket({}, taslak_md="x"))
        u = json.loads(zf.read("Ustveri.json"))
        # Assert
        assert u["belge"]["dosya_plani_kodu"] == ""
        assert u["dagitim"] == []
        assert u["olusturan"]["detsis_no"] == ""
