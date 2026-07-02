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
