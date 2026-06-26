"""Çeşitli eval yardımcıları — eksik-bilgi F-beta + özet key-fact/faithfulness + adillik swap.

Saf/deterministik (ağ/LLM/gold dosyası yok):
  - missing_info_eval.f_beta (recall-öncelikli β=2)
  - summary_eval.key_fact_recall / faithfulness / _norm
  - fairness_eval._swap_name (counterfactual isim değişimi)
  - evrak_class_eval.macro_f1 / confusion_pairs (in-memory satırlarla)
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

from eval.evrak_class_eval import confusion_pairs, macro_f1
from eval.fairness_eval import _swap_name
from eval.missing_info_eval import f_beta
from eval.summary_eval import _norm, faithfulness, key_fact_recall


class TestFBeta:
    """f_beta — β=2 recall'ı 2× ağırlıklar (eksik kaçırmak pahalı)."""

    def test_tam_precision_recall_bir(self):
        # Act + Assert
        assert f_beta(1.0, 1.0) == 1.0

    def test_sifir_bolen_guvenli(self):
        # Arrange — p=r=0 → payda 0 → 0.0 (ZeroDivision yok)
        assert f_beta(0.0, 0.0) == 0.0

    def test_recall_oncelikli_beta2(self):
        # Arrange — yüksek recall/düşük precision, β=2 recall'ı kayırır
        # f2(P=0.5, R=1.0) > f2(P=1.0, R=0.5) olmalı
        recall_yuksek = f_beta(0.5, 1.0, beta=2.0)
        precision_yuksek = f_beta(1.0, 0.5, beta=2.0)
        # Assert
        assert recall_yuksek > precision_yuksek


class TestSummaryNorm:
    """_norm — diakritik-duyarsız Türkçe küçük-harf."""

    def test_buyuk_harf_kuculur(self):
        # Act + Assert
        assert _norm("MERHABA") == "merhaba"

    def test_turkce_i_normalizasyonu(self):
        # Arrange — 'ı' → 'i'
        # Act
        sonuc = _norm("ışık")
        # Assert — diakritik-duyarsız içerme için sadeleşir
        assert "i" in sonuc


class TestKeyFactRecall:
    """key_fact_recall — özet anahtar unsurları kapsama (kapsanan, toplam)."""

    def test_tam_kapsama(self):
        # Arrange
        ozet = "Park aydınlatma talebi 2026 yılında iletildi."
        unsurlar = ["park", "aydınlatma", "2026"]
        # Act
        covered, total = key_fact_recall(ozet, unsurlar)
        # Assert
        assert covered == 3
        assert total == 3

    def test_kismi_kapsama(self):
        # Arrange — biri özette yok
        covered, total = key_fact_recall("park talebi", ["park", "kanalizasyon"])
        # Assert
        assert covered == 1
        assert total == 2

    def test_diakritik_duyarsiz_eslesme(self):
        # Arrange — büyük/küçük + Türkçe I eşleşmeli
        covered, _ = key_fact_recall("IŞIK sorunu", ["ışık"])
        # Assert
        assert covered == 1


class TestFaithfulness:
    """faithfulness — özet kaynakta OLMAYAN somut tarih/sayı içeriyor mu."""

    def test_sadik_ozet_ihlal_yok(self):
        # Arrange — özetteki tarih kaynakta da var
        ozet = "01.01.2026 tarihli evrak."
        kaynak = "01.01.2026 tarihinde kaydedilmiştir."
        # Act
        sadik, ihlaller = faithfulness(ozet, kaynak)
        # Assert
        assert sadik is True
        assert ihlaller == []

    def test_uydurma_tarih_ihlal(self):
        # Arrange — özette kaynakta olmayan tarih (halüsinasyon)
        ozet = "12.12.2099 tarihli karar."
        kaynak = "Tarihi belirsiz bir evrak."
        # Act
        sadik, ihlaller = faithfulness(ozet, kaynak)
        # Assert
        assert sadik is False
        assert any("12.12.2099" in i for i in ihlaller)

    def test_uydurma_sayi_ihlal(self):
        # Arrange — özette kaynakta olmayan 6+ haneli sayı
        ozet = "E-1234567 sayılı yazı."
        kaynak = "Sayısı kaydedilmemiş evrak."
        # Act
        sadik, ihlaller = faithfulness(ozet, kaynak)
        # Assert
        assert sadik is False

    def test_maskeli_pii_muaf(self):
        # Arrange — [TCKN] maskesi uydurma sayılmaz
        sadik, ihlaller = faithfulness("Başvuran [TCKN] numaralı.", "kaynak metin")
        # Assert
        assert sadik is True


class TestSwapName:
    """_swap_name — 'Ad-Soyad:' satırını counterfactual isimle değiştir."""

    def test_isim_degisir(self):
        # Arrange
        metin = "Konu: x\nAd-Soyad: Ayşe Yılmaz\nGövde."
        # Act
        yeni = _swap_name(metin, "Mehmet Kaya")
        # Assert
        assert "Mehmet Kaya" in yeni
        assert "Ayşe Yılmaz" not in yeni

    def test_adsoyad_yoksa_metin_aynen(self):
        # Arrange — Ad-Soyad satırı yok
        metin = "Sadece gövde metni."
        # Act
        yeni = _swap_name(metin, "X Y")
        # Assert
        assert yeni == metin

    def test_yalniz_ilk_eslesme_degisir(self):
        # Arrange — iki Ad-Soyad satırı; yalnız ilki değişmeli (count=1)
        metin = "Ad-Soyad: A B\nAd-Soyad: C D"
        # Act
        yeni = _swap_name(metin, "X Y")
        # Assert
        assert yeni.count("X Y") == 1


class TestMacroF1:
    """macro_f1 — sınıf-bazlı P/R/F1 + makro ortalama (in-memory satırlar)."""

    def test_kusursuz_tahmin_f1_bir(self):
        # Arrange — tüm tahminler doğru
        rows = [
            {"evrak_turu": "dilekce", "pred": "dilekce"},
            {"evrak_turu": "fatura", "pred": "fatura"},
        ]
        # Act
        mf1, per = macro_f1(rows)
        # Assert
        assert mf1 == 1.0
        assert per["dilekce"]["f1"] == 1.0

    def test_tam_yanlis_f1_sifir(self):
        # Arrange — hepsi yanlış sınıf
        rows = [
            {"evrak_turu": "dilekce", "pred": "fatura"},
            {"evrak_turu": "fatura", "pred": "dilekce"},
        ]
        # Act
        mf1, _ = macro_f1(rows)
        # Assert
        assert mf1 == 0.0

    def test_support_dogru_sayilir(self):
        # Arrange — dilekce 2 kez gerçek
        rows = [
            {"evrak_turu": "dilekce", "pred": "dilekce"},
            {"evrak_turu": "dilekce", "pred": "fatura"},
        ]
        # Act
        _, per = macro_f1(rows)
        # Assert — support = TP+FN
        assert per["dilekce"]["support"] == 2


class TestConfusionPairs:
    """confusion_pairs — en sık (gerçek→tahmin) karışma çiftleri."""

    def test_dogru_olanlar_haric(self):
        # Arrange — yalnız 1 yanlış
        rows = [
            {"evrak_turu": "dilekce", "pred": "dilekce"},  # doğru → sayılmaz
            {"evrak_turu": "talep", "pred": "dilekce"},    # yanlış
        ]
        # Act
        pairs = confusion_pairs(rows)
        # Assert
        assert pairs == [("talep", "dilekce", 1)]

    def test_en_sik_karisma_basta(self):
        # Arrange — talep→dilekce 2 kez, fatura→rapor 1 kez
        rows = [
            {"evrak_turu": "talep", "pred": "dilekce"},
            {"evrak_turu": "talep", "pred": "dilekce"},
            {"evrak_turu": "fatura", "pred": "rapor"},
        ]
        # Act
        pairs = confusion_pairs(rows)
        # Assert — en sık başta
        assert pairs[0] == ("talep", "dilekce", 2)

    def test_bos_karisma_bos_liste(self):
        # Arrange — hepsi doğru
        rows = [{"evrak_turu": "x", "pred": "x"}]
        # Act + Assert
        assert confusion_pairs(rows) == []
