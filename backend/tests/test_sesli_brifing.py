"""core/sesli_brifing.py testleri — sesli karşılamanın DURUM-FARKINDA ve UYDURMASIZ olması.

Karşılama sahne açılır açılmaz konuşulur; LLM'e sorulmaz (gecikme + uydurma riski). Bu yüzden
metin deterministiktir: yalnız sorgudan gelen sayılar konuşulur, veri yoksa sayı ANILMAZ.
"""

from __future__ import annotations

import pytest

from core.sesli_brifing import karsilama_metni, sayiyi_yaz


class TestSayiyiYaz:
    """TTS rakamı ('3') tekdüze okur; Türkçe sözcük ('üç') doğal duyulur."""

    @pytest.mark.parametrize(("sayi", "beklenen"), [
        (0, "sıfır"), (1, "bir"), (7, "yedi"), (10, "on"), (11, "on bir"),
        (20, "yirmi"), (42, "kırk iki"), (90, "doksan"), (99, "doksan dokuz"),
    ])
    def test_yuze_kadar_turkce_yazilir(self, sayi, beklenen):
        assert sayiyi_yaz(sayi) == beklenen

    def test_yuz_ve_uzeri_rakam_kalir(self):
        # 100+ sözcüğe çevrilmez — uzun okuma yerine rakam daha anlaşılır.
        assert sayiyi_yaz(128) == "128"

    def test_negatif_guvenli(self):
        assert sayiyi_yaz(-3) == "-3"


class TestKarsilamaMetni:
    """Girdi: _brifing_araci çıktısı (bekleyen_onay / kirmizi_taslak / sla_kritik).

    panel_istatistik BİLEREK kullanılmaz: oradaki 'taslak' TÜM taslakları sayar (onaylanıp
    gönderilmişler dahil) ve 'risk_dagilimi.kirmizi' işlem bazlıdır — taslakların alt kümesi
    DEĞİLDİR. İkisini bir cümlede birleştirmek "bir taslağınız var, bunlardan üçü kırmızı"
    gibi matematiksel olarak imkânsız, ama kendinden emin okunan bir iddia üretiyordu.
    """

    def test_persona_adiyla_tanitir(self):
        metin = karsilama_metni("Kamu Evrak", {})
        assert "Kamu Evrak" in metin

    def test_veri_yoksa_SAYI_ANMAZ(self):
        # Uydurma yasağı: brifing boşsa "üç taslağınız var" gibi bir cümle ASLA kurulmaz.
        metin = karsilama_metni("Kamu Evrak", {})
        assert "taslağınız" not in metin
        assert "bant" not in metin.lower()

    def test_sifir_sayilar_anilmaz(self):
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": 0, "kirmizi_taslak": 0,
                                               "sla_kritik": 0})
        assert "taslağınız" not in metin

    def test_bekleyen_taslak_sayisi_konusulur(self):
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": 3})
        assert "üç" in metin
        assert "taslağınız" in metin        # yumuşak g: "taslak" gövdesi çekimde değişir

    def test_kirmizi_ALT_KUME_olarak_anlatilir(self):
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": 2, "kirmizi_taslak": 1})
        assert "kırmızı" in metin.lower()
        assert "bunlardan bir" in metin

    def test_kirmizi_bekleyeni_ASAMAZ(self):
        # Savunma: tutarsız girdi gelirse imkânsız cümle kurmak yerine alt-küme iddiası düşer.
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": 1, "kirmizi_taslak": 3})
        assert "bunlardan" not in metin

    def test_sla_kritik_oncelikli_soylenir(self):
        # Yasal süre, onay kuyruğundan daha acildir — brifing önce onu anar.
        metin = karsilama_metni("Kamu Evrak", {"sla_kritik": 2, "bekleyen_onay": 5})
        assert "süre" in metin.lower()
        assert metin.index("iki") < metin.index("beş")

    def test_tekil_cogul_dogru(self):
        assert "bir taslağınız" in karsilama_metni("K", {"bekleyen_onay": 1})

    def test_davetle_biter(self):
        # Sahne açılışı: kullanıcı ne yapacağını bilmeli (konuşma sırası ONDA).
        assert karsilama_metni("Kamu Evrak", {"bekleyen_onay": 2}).rstrip().endswith(
            ("dinliyorum.", "buyurun.", "Buyurun."))

    def test_markdown_ve_madde_isareti_YOK(self):
        # Sesli okunacak: yıldız/madde işareti seslendirilirse robotik duyulur.
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": 4, "kirmizi_taslak": 2})
        assert "*" not in metin and "•" not in metin and "#" not in metin

    def test_bozuk_brifing_cokmez(self):
        # Savunma: beklenmedik tip gelirse karşılama yine üretilir (sayı anılmadan).
        metin = karsilama_metni("Kamu Evrak", {"bekleyen_onay": "iki", "kirmizi_taslak": None})
        assert "Kamu Evrak" in metin
        assert "taslağınız" not in metin

    def test_bool_sayi_sayilmaz(self):
        # isinstance(True, int) Python'da True — bayrak, sayı gibi konuşulmamalı.
        assert "taslağınız" not in karsilama_metni("K", {"bekleyen_onay": True})
