"""decompose node testleri — çok-konulu evrak ayrıştırma (Görev 1+2 yenilikçilik).

Deterministik çekirdek (compute_decomposition) test edilir: çok-talep bölme, tek-konulu
passthrough, alt-talep tür/birim/SLA doğruluğu, PII maskeleme. Ağ/LLM bağımlılığı yok.
"""

from __future__ import annotations

from datetime import date

from agents.nodes.decompose import (
    _coklu_sinyal,
    _govde,
    _heuristik_segment,
    _segment_birim,
    _segment_turu,
    compute_decomposition,
    decompose_node,
)

_BUGUN = date(2026, 6, 26)
# Kullanıcının verdiği kanonik çok-konulu dilekçe (3 ayrı iş).
_COK_KONULU = (
    "Sokağımızdaki çukurun onarılmasını, ayrıca geçen ay kestiğiniz su faturasının "
    "yanlış olduğunu, bir de oğlumun belediyedeki iş başvurusunun sonucunu öğrenmek istiyorum."
)


# ---------------------------------------------------------------------------
# Çok-konulu bölme (kanonik demo örneği) — 3 alt-talep, doğru birim/tür/SLA
# ---------------------------------------------------------------------------


class TestCokKonuluBolme:
    """Tek dilekçedeki 3 ayrı istek 3 alt-talebe bölünür, her biri doğru yönlendirilir."""

    def test_uc_alt_talebe_bolunur(self):
        # Act
        alt = compute_decomposition(_COK_KONULU, {"tarih": "01.06.2026"}, _BUGUN)
        # Assert
        assert len(alt) == 3, f"3 alt-talep beklendi, {len(alt)} geldi"

    def test_cukur_onarimi_teknik_daireye(self):
        # Act
        alt = compute_decomposition(_COK_KONULU, {}, _BUGUN)
        # Assert — çukur onarımı → talep → ilgili teknik daire (Fen İşleri)
        assert alt[0]["tur"] == "talep"
        assert alt[0]["birim"] == "ilgili_teknik_daire"

    def test_fatura_itirazi_mali_isler(self):
        # Act
        alt = compute_decomposition(_COK_KONULU, {}, _BUGUN)
        # Assert — fatura yanlışlığı → şikâyet → mali işler/SGB
        assert alt[1]["tur"] == "sikayet"
        assert alt[1]["birim"] == "mali_strateji_sgb"

    def test_is_basvurusu_insan_kaynaklari(self):
        # Act
        alt = compute_decomposition(_COK_KONULU, {}, _BUGUN)
        # Assert — iş başvurusu sonucu → bilgi edinme → insan kaynakları
        assert alt[2]["tur"] == "bilgi_edinme"
        assert alt[2]["birim"] == "insan_kaynaklari"

    def test_bilgi_edinme_15_is_gunu_slasi(self):
        # Act — bilgi edinme 4982 m.11 = 15 iş günü (diğerleri 3071 = 30 gün)
        alt = compute_decomposition(_COK_KONULU, {}, _BUGUN)
        # Assert
        assert "15 iş günü" in alt[2]["cevap_suresi"]
        assert "30 gün" in alt[0]["cevap_suresi"]

    def test_alt_talep_anahtarlari_sabit(self):
        # Act
        alt = compute_decomposition(_COK_KONULU, {}, _BUGUN)
        # Assert — frontend/AltTalepSchema ile eşleşen SABİT anahtarlar
        beklenen = {"ozet", "tur", "tur_tr", "birim", "birim_tr",
                    "yazi_turu", "cevap_suresi", "sla_durum"}
        assert set(alt[0]) == beklenen


# ---------------------------------------------------------------------------
# Tek-konulu passthrough — bölme YOK (boş liste → frontend kartı gizler)
# ---------------------------------------------------------------------------


class TestTekKonuluPassthrough:
    """Tek istekli evrak ayrıştırılmaz (boş liste döner)."""

    def test_tek_istek_bos_liste(self):
        # Arrange — tek somut istek, bağlaç yok
        metin = "Sokağımızdaki çukurun bir an önce onarılmasını arz ederim."
        # Act
        alt = compute_decomposition(metin, {}, _BUGUN)
        # Assert
        assert alt == []

    def test_coklu_sinyal_yoksa_bos(self):
        # Arrange — çok-talep işareti yok
        metin = "Saygılarımla bilgilerinize sunarım."
        # Act / Assert
        assert _coklu_sinyal(metin) is False
        assert compute_decomposition(metin, {}, _BUGUN) == []

    def test_baglac_coklu_sinyali_tetikler(self):
        # Arrange / Act / Assert — 'ayrıca' bağlacı çok-talep işareti
        assert _coklu_sinyal(_COK_KONULU) is True

    def test_numarali_liste_gate_tetikler_ama_numarasiz_tetiklemez(self):
        # Regresyon (izole): _govde metni tek satıra düzleştirir; _AYRAC'ın '\n'-çapalı
        # numaralı desenleri govde'de ASLA eşleşmiyordu → numaralı çok-konulu evrak sessizce
        # decompose EDİLMİYORDU. Sinyal YALNIZ numaralı işaretten gelir (numarasız → tetiklenmez).
        metin = ("Konu: İki husus\n\n"
                 "1) Personelin izin talebinin onaylanmasını arz ederim,\n"
                 "2) Biriminize ait aracın bakımının yaptırılmasını arz ederim.")
        assert _coklu_sinyal(_govde(metin)) is True
        numarasiz = _govde(metin).replace("1) ", "").replace("2) ", "")
        assert _coklu_sinyal(numarasiz) is False  # izolasyon: sinyal numaralardan

    def test_numarali_liste_heuristik_iki_segmente_boler(self):
        # Numaralı liste (düzleşmiş) deterministik yolda da ≥2 segmente ayrılır.
        metin = ("1) Su faturasındaki hatanın düzeltilmesini talep ediyorum, "
                 "2) Sokaktaki çukurun onarılmasını istiyorum.")
        assert len(compute_decomposition(metin, {}, _BUGUN)) >= 2

    def test_tek_numarali_madde_yanlis_tetiklemez(self):
        # Tek 'm.5' benzeri dayanak atfı çok-talep sinyali DEĞİL (≥2 işaret gerekir).
        assert _coklu_sinyal("Talebiniz 2926 sayılı Kanun m.5 uyarınca değerlendirilmiştir.") is False


# ---------------------------------------------------------------------------
# PII maskeleme + segment yardımcıları
# ---------------------------------------------------------------------------


class TestPiiVeYardimcilar:
    """Alt-talep özeti PII-maskeli; segment sınıflandırıcılar doğru çalışır."""

    def test_ozet_pii_maskeli(self):
        # Arrange — TCKN içeren çok-konulu metin
        metin = ("Çukurun onarılmasını talep ediyorum, ayrıca 12345678950 numaralı "
                 "kaydımdaki fatura hatasının düzeltilmesini istiyorum.")
        # Act
        alt = compute_decomposition(metin, {}, _BUGUN)
        # Assert — ham TCKN hiçbir alt-talep özetinde görünmemeli
        assert all("12345678950" not in a["ozet"] for a in alt)

    def test_segment_turu_bilgi_edinme_oncelikli(self):
        # 'öğrenmek istiyorum' → talep değil bilgi_edinme (sıra önceliği)
        assert _segment_turu("başvurumun sonucunu öğrenmek istiyorum") == "bilgi_edinme"

    def test_segment_birim_konu_oncelikli(self):
        # konu-spesifik tablo tür config'ini geçer
        assert _segment_birim("su faturası yanlış", "sikayet") == "mali_strateji_sgb"

    def test_heuristik_segment_baglac_boler(self):
        # iki bağlaç → en az iki segment
        segs = _heuristik_segment(_COK_KONULU)
        assert len(segs) >= 2


# ---------------------------------------------------------------------------
# Node çıktı sözleşmesi (async)
# ---------------------------------------------------------------------------


class TestDecomposeNode:
    """decompose_node her zaman {'alt_talepler': list} döndürür."""

    async def test_node_cok_konulu_liste_doner(self):
        # Act — mock modda LLM None → heuristik segment
        sonuc = await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}})
        # Assert
        assert "alt_talepler" in sonuc
        assert len(sonuc["alt_talepler"]) == 3

    async def test_node_tek_konulu_bos_liste(self):
        # Act
        sonuc = await decompose_node({"evrak_text": "Bilgilerinize arz ederim.",
                                      "bilgi_unsurlari": {}})
        # Assert
        assert sonuc["alt_talepler"] == []

    async def test_node_bos_metin_bos_liste(self):
        # Act / Assert — boş metin patlamaz
        sonuc = await decompose_node({"evrak_text": "", "bilgi_unsurlari": {}})
        assert sonuc["alt_talepler"] == []
