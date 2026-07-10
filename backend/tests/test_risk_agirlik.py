"""risk_agirlik — sinyal taksonomisi + noisy-OR skor sözleşmesi testleri.

Bu testler ESKİ davranışın kusurunu regresyon olarak kilitler:
  (a) kanıt arttıkça skor ARTMALI (eski: sabit 0.9, çubuklar küçülüyordu),
  (b) ağır KIRMIZI sinyal, hafif SARI sinyalden büyük çubuk göstermeli (eski: tersi),
  (c) ölçüm yoksa önsele düşülmeli ve bu GİZLENMEMELİ.
"""

from __future__ import annotations

import json

import pytest

from agents import risk_agirlik as ra

_G = "Uydurma şüphesi — Taslaktaki iddia kaynak evrakta yok (LLM grounding): X"
_D = "Uydurma şüphesi — Taslaktaki '99.99.9999' tarihi kaynak evrakta yok (doğrulayın)."


@pytest.fixture(autouse=True)
def _temiz_cache():
    """lru_cache testler arası sızmasın (kalibrasyon dosyası mock'lanıyor)."""
    ra.kalibrasyon_yukle.cache_clear()
    yield
    ra.kalibrasyon_yukle.cache_clear()


class TestTaksonomi:
    def test_grounding_ve_deger_ayrilir(self):
        # 'LLM grounding' imzası daha spesifik → deger'e düşmemeli
        assert ra.gerekce_tipi(_G) == ra.UYDURMA_GROUNDING
        assert ra.gerekce_tipi(_D) == ra.UYDURMA_DEGER

    def test_sari_sinyaller_dogru_tiplenir(self):
        assert ra.gerekce_tipi("Eksik bölüm: İmza/Ad-Soyad") == ra.EKSIK_BOLUM
        assert ra.gerekce_tipi("Eksik zorunlu bilgi: tarih") == ra.EKSIK_ZORUNLU
        assert ra.gerekce_tipi("Tutarlılık: gelecek tarih") == ra.TUTARLILIK
        assert ra.gerekce_tipi("Düşük sınıflandırma güveni (0.42)") == ra.DUSUK_GUVEN
        assert ra.gerekce_tipi("Evrak türü belirsiz (sınıflandırma abstention)") == ra.TUR_BELIRSIZ
        assert ra.gerekce_tipi("3 alan doğrulanmalı ([DOĞRULA] işareti)") == ra.DOGRULA_ISARETI
        assert ra.gerekce_tipi("Format (2646 lint): Konu yok") == ra.LINT_2646

    def test_taninmayan_sinyal_bilinmeyene_duser(self):
        # Yeni backend sinyali eklenirse skor ÜRETİLMEYE devam eder (çökmez), muhafazakâr.
        assert ra.gerekce_tipi("Bambaşka yeni bir uyarı") == ra.BILINMEYEN

    def test_bos_girdi_bilinmeyen(self):
        assert ra.gerekce_tipi("") == ra.BILINMEYEN
        assert ra.gerekce_tipi(None) == ra.BILINMEYEN


class TestNoisyOr:
    def test_monoton_artis__kanit_arttikca_skor_buyur(self):
        """ESKİ KUSUR: 1 uydurma da 9 uydurma da 0.9 idi."""
        tek = ra.noisy_or([0.8])
        dort = ra.noisy_or([0.8] * 4)
        dokuz = ra.noisy_or([0.8] * 9)
        assert tek < dort < dokuz

    def test_bir_i_asla_gecmez(self):
        # 50×0.99 matematiksel olarak <1 ama float64'te 1-1e-100 → 1.0'a yuvarlanır.
        # Sözleşme "aşmaz"dır, "erişmez" değil.
        assert ra.noisy_or([0.99] * 50) <= 1.0
        assert ra.noisy_or([1.0, 1.0]) == 1.0

    def test_bos_liste_sifir(self):
        assert ra.noisy_or([]) == 0.0

    def test_sinir_disi_agirlik_kelepcelenir(self):
        assert ra.noisy_or([-5.0]) == 0.0
        assert ra.noisy_or([7.0]) == 1.0


class TestSkorVeKatkilar:
    def test_kirmizi_sinyal_sari_sinyalden_agir(self):
        """ESKİ KUSUR: tek eksik imza (%50) > 4 uydurma (%22). Artık tersi olmalı."""
        uydurma_w = ra.agirlik(ra.UYDURMA_GROUNDING)[0]
        imza_w = ra.agirlik(ra.EKSIK_BOLUM)[0]
        assert uydurma_w > imza_w

    def test_dokuz_uydurma_tek_uydurmadan_yuksek_skor(self):
        tek, katki_tek, _ = ra.skor_ve_katkilar([_G])
        dokuz, katki_dokuz, _ = ra.skor_ve_katkilar([_G] * 9)
        assert dokuz > tek
        # Çubuk yüksekliği sinyalin KENDİ ağırlığı → gerekçe sayısıyla küçülmez
        assert katki_tek[0] == pytest.approx(katki_dokuz[0])

    def test_katkilar_gerekcelerle_ayni_uzunlukta(self):
        _, katkilar, _ = ra.skor_ve_katkilar([_G, "Eksik bölüm: Konu"])
        assert len(katkilar) == 2
        assert katkilar[0] > katkilar[1]  # uydurma > eksik bölüm

    def test_bos_gerekce_sifir_skor(self):
        skor, katkilar, durum = ra.skor_ve_katkilar([])
        assert skor == 0.0 and katkilar == [] and durum == ra.ONSEL

    def test_olcum_yoksa_onsel_bayragi(self, monkeypatch):
        monkeypatch.setattr(ra, "_KALIBRASYON_DOSYA", ra.Path("yok_boyle_dosya.json"))
        ra.kalibrasyon_yukle.cache_clear()
        _, _, durum = ra.skor_ve_katkilar([_G])
        assert durum == ra.ONSEL          # ölçüm iddiası YOK — gizlenmiyor
        assert ra.isabet(ra.UYDURMA_GROUNDING) == (ra._ISABET_ONSEL, ra.ONSEL)


class TestGozlemCikarimAyrimi:
    """Gözlem sinyali deterministik OLGUdur → isabeti ölçülmez, 1.0'dır."""

    def test_gozlem_tipleri_olculmez(self):
        for tip in (ra.TUTARLILIK, ra.DOGRULA_ISARETI, ra.LINT_2646, ra.FORMAT_EKSIK):
            assert ra.isabet(tip) == (1.0, ra.GOZLEM_DURUM)
            # ağırlık = saf ciddiyet (isabet çarpanı 1.0)
            assert ra.agirlik(tip)[0] == pytest.approx(ra.CIDDIYET[tip])

    def test_gozlem_kalibrasyon_dosyasindan_etkilenmez(self, tmp_path, monkeypatch):
        dosya = tmp_path / "k.json"
        dosya.write_text(json.dumps({"tipler": {ra.TUTARLILIK: {"isabet_alt": 0.1}}}), encoding="utf-8")
        monkeypatch.setattr(ra, "_KALIBRASYON_DOSYA", dosya)
        ra.kalibrasyon_yukle.cache_clear()
        assert ra.isabet(ra.TUTARLILIK) == (1.0, ra.GOZLEM_DURUM)  # gözlem ölçüme tabi değil

    def test_cikarim_tipleri_gozlem_degil(self):
        for tip in (ra.UYDURMA_GROUNDING, ra.UYDURMA_DEGER, ra.EKSIK_BOLUM,
                    ra.EKSIK_ZORUNLU, ra.DUSUK_GUVEN, ra.TUR_BELIRSIZ):
            assert tip not in ra.GOZLEM

    def test_yalniz_gozlem_iceren_belge_dayanakli_sayilir(self):
        _, _, durum = ra.skor_ve_katkilar(["Tutarlılık: gelecek tarih"])
        assert durum == ra.OLCULDU   # gözlem = dayanaklı; "önsel" damgası yemez


class TestKusurOlasiligi:
    """Skor (beklenen zarar) ile olasılık AYRI büyüklüklerdir — karıştırmak kategori hatası."""

    def test_olasilik_skordan_farkli(self):
        # tek eksik_zorunlu: olasılık ≈ isabet; skor = ciddiyet(0.40) × isabet → çok daha düşük
        g = ["Eksik zorunlu bilgi: tarih"]
        skor = ra.skor_ve_katkilar(g)[0]
        p = ra.kusur_olasiligi(g)
        assert p > skor           # olasılık, ciddiyetle çarpılmaz
        assert 0.0 <= p <= 1.0

    def test_gozlem_sinyalleri_olasiliga_girmez(self):
        """Gözlem kesindir; olasılığa girerse her belgeyi 1.0'a çakar, ölçüm anlamsızlaşır."""
        assert ra.kusur_olasiligi(["Tutarlılık: gelecek tarih"]) == 0.0
        assert ra.kusur_olasiligi(["3 alan doğrulanmalı ([DOĞRULA] işareti)"]) == 0.0

    def test_olasilik_kanit_arttikca_artar(self):
        assert ra.kusur_olasiligi([_G] * 3) > ra.kusur_olasiligi([_G])

    def test_gerekce_yoksa_sifir(self):
        assert ra.kusur_olasiligi([]) == 0.0


class TestKalibrasyonYukleme:
    def test_olculmus_isabet_onselin_yerine_gecer(self, tmp_path, monkeypatch):
        dosya = tmp_path / "risk_calibration.json"
        dosya.write_text(json.dumps(
            {"tipler": {ra.UYDURMA_DEGER: {"isabet_alt": 0.5, "n": 40}}}), encoding="utf-8")
        monkeypatch.setattr(ra, "_KALIBRASYON_DOSYA", dosya)
        ra.kalibrasyon_yukle.cache_clear()

        p, durum = ra.isabet(ra.UYDURMA_DEGER)
        assert (p, durum) == (0.5, ra.OLCULDU)
        # ağırlık = ciddiyet × ölçülen isabet
        assert ra.agirlik(ra.UYDURMA_DEGER)[0] == pytest.approx(ra.CIDDIYET[ra.UYDURMA_DEGER] * 0.5)
        # ölçülmemiş ÇIKARIM tipi hâlâ önsel → belge durumu "kismi"
        _, _, belge = ra.skor_ve_katkilar([_D, "Eksik bölüm: Konu"])
        assert belge == "kismi"

    def test_bozuk_dosya_sessizce_onsele_duser(self, tmp_path, monkeypatch):
        dosya = tmp_path / "bozuk.json"
        dosya.write_text("{ bu json değil", encoding="utf-8")
        monkeypatch.setattr(ra, "_KALIBRASYON_DOSYA", dosya)
        ra.kalibrasyon_yukle.cache_clear()
        assert ra.kalibrasyon_yukle() == {}          # çökmez
        assert ra.isabet(ra.UYDURMA_DEGER)[1] == ra.ONSEL

    def test_sinir_disi_isabet_reddedilir(self, tmp_path, monkeypatch):
        dosya = tmp_path / "sinir.json"
        dosya.write_text(json.dumps({"tipler": {ra.UYDURMA_DEGER: {"isabet_alt": 1.7}}}), encoding="utf-8")
        monkeypatch.setattr(ra, "_KALIBRASYON_DOSYA", dosya)
        ra.kalibrasyon_yukle.cache_clear()
        assert ra.isabet(ra.UYDURMA_DEGER) == (ra._ISABET_ONSEL, ra.ONSEL)
