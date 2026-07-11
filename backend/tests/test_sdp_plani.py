"""SDP (Standart Dosya Planı) kod seçimi testleri — Yön. 2646 m.11 Sayı konu-kodu.

Deterministik + kapalı-küme: dönen kod DAİMA SDP_TABLOSU'nda (uydurma kod yok); konu
anahtarı türden önceliklidir; eşleşme yoksa None (Sayı placeholder kalır). Kodların
kaynağı 2005/7 Genelge Ortak Alanlar — testler gerçek kod→başlık eşlemesini kilitler.
"""

from __future__ import annotations

import pytest

from yazi.sdp_plani import SDP_TABLOSU, sdp_bul


class TestKonuOnceligi:
    @pytest.mark.parametrize("konu,beklenen", [
        ("Personel nakil talebi hakkında", "903"),
        ("Yıllık izin talebi", "906"),
        ("Emeklilik işlemleri", "911"),
        ("İcra takibi ödeme emri", "642"),
        ("İdare aleyhine açılan iptal davası", "641"),
        ("Tebligat evrakı", "645"),
        ("Hukuki görüş talebi", "647"),
        ("2025 bütçe ödenek talebi", "841"),
        ("Elektrik faturası tahakkuku", "848"),
        ("Bilgisayar teknik arıza onarımı", "707"),
        ("Park aydınlatma onarım talebi", "807"),
        ("CİMER şikayet başvurusu", "622"),
        ("4982 sayılı Kanun bilgi edinme başvurusu", "622"),
    ])
    def test_konu_kokune_gore_dogru_kod(self, konu, beklenen):
        sonuc = sdp_bul("talep", konu)
        assert sonuc is not None
        assert sonuc["kod"] == beklenen
        assert sonuc["baslik"] == SDP_TABLOSU[beklenen]


class TestTurTabani:
    def test_konu_bossa_gercek_evrak_turu_tabani(self):
        # GERÇEK EVRAK_TURLERI değerleriyle (dava_evraki, icra_evraki, genelge_talimat_olur)
        assert sdp_bul("dava_evraki", "")["kod"] == "641"
        assert sdp_bul("icra_evraki", "")["kod"] == "642"
        assert sdp_bul("fatura", "")["kod"] == "848"
        assert sdp_bul("genelge_talimat_olur", "")["kod"] == "010"

    def test_tur_anahtarlari_evrak_turleri_ile_hizali(self):
        # Regresyon: TUR_SDP anahtarları gerçek sınıflandırma değerleriyle BİREBİR olmalı
        from agents.config import EVRAK_TURLERI
        from yazi.sdp_plani import TUR_SDP
        assert set(TUR_SDP) <= set(EVRAK_TURLERI), set(TUR_SDP) - set(EVRAK_TURLERI)

    def test_spesifik_konu_turden_onceliklidir(self):
        # icra_evraki türü ama konu 'yıllık izin' → spesifik konu kazanır (906), tür (642) değil
        assert sdp_bul("icra_evraki", "yıllık izin talebi")["kod"] == "906"

    def test_guvenilir_tur_govdedeki_genel_kelimeyi_ezer(self):
        # Regresyon (review CRITICAL-2b): tebligat türü, gövdede alakasız 'personel' geçiyor →
        # tür (645) kazanmalı, gövdedeki genel 'personel' (900) DEĞİL.
        sonuc = sdp_bul("tebligat", "",
                        ek_metin="tebligatı alan personelin durumdan haberdar edilmesi gerekir")
        assert sonuc["kod"] == "645"

    def test_dava_evraki_govde_genel_kelimeyle_bozulmaz(self):
        # Regresyon (review CRITICAL-2a): dava_evraki tür fallback'i çalışır; gövdedeki genel
        # 'evrak' kelimesi 804'e KAYDIRAMAZ (tür 641 önce gelir).
        assert sdp_bul("dava_evraki", "Esas No hakkında evrak")["kod"] == "641"

    def test_genel_kok_yalniz_konuda_son_care(self):
        # Genel kök (personel→900) yalnız konu metninde + spesifik/tür yoksa; gövdede taranmaz.
        assert sdp_bul("belirsiz", "personel özlük işlemi")["kod"] == "900"
        # gövdede 'personel' ama konu boş + tür yok → genel gövdede TARANMAZ → None
        assert sdp_bul("belirsiz", "", ek_metin="personel hakkında bir metin") is None


class TestGuvenlik:
    def test_eslesme_yoksa_none(self):
        # Ne konu ne tür eşleşir → None (Sayı placeholder kalır, uydurma kod yok)
        assert sdp_bul("belirsiz", "anlaşılamayan içerik xyzzy") is None

    def test_donen_kod_daima_tabloda(self):
        # Kapalı-küme güvencesi: her olası dönüş SDP_TABLOSU'nda olmalı (uydurma imkânsız)
        ornekler = ["nakil", "izin", "dava", "icra", "bütçe", "fatura", "şikayet",
                    "onarım", "teftiş", "mevzuat", "arıza", "emeklilik"]
        for konu in ornekler:
            sonuc = sdp_bul("talep", konu)
            if sonuc is not None:
                assert sonuc["kod"] in SDP_TABLOSU
                assert sonuc["baslik"] == SDP_TABLOSU[sonuc["kod"]]

    def test_ek_metin_konu_zayifken_taranir(self):
        # Konu boş ama gövdede 'nakil' geçiyor → yakalanır
        assert sdp_bul("talep", "", ek_metin="personelin nakil talebi değerlendirilsin")["kod"] == "903"
