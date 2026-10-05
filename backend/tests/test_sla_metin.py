"""SLA metin girdileri — başlangıç tarihi önceliği, metinde yazılı süre, ivedilik (m.26).

Regresyon kaynağı: 2026-10-05 gerçek-LLM ölçümü (59 belge). Örnek metinler o vakaların
SENTETİK eşdeğerleridir (gerçek PII yok — CLAUDE.md §2).
"""

from __future__ import annotations

from datetime import date

from agents.nodes.sla_triyaj import compute_sla, sla_triyaj_node
from agents.sla_metin import baslangic_sec, ivedilik_ibaresi, metinden_sure

_BUGUN = date(2026, 10, 5)


def _state(metin: str, tur: str, gelen_tarih: str | None, cikarim: str | None) -> dict:
    return {"evrak_turu": tur, "evrak_text": metin,
            "bilgi_unsurlari": {"tarih": cikarim, "gelen_evrak": {"tarih": gelen_tarih}}}


class TestBaslangicTarihi:
    def test_gelen_evrak_tarihi_govdedeki_olay_tarihini_ezer(self):
        # bilgi_edinme_cankaya_cift: gelen 19.09.2026, LLM gövdeden 30.06.2026 seçmişti
        metin = "Tarih: 19.09.2026\n30.06.2026 tarihli ihale kararının örneğini istiyorum."
        tarih, kaynak = baslangic_sec(
            {"tarih": "30.06.2026", "gelen_evrak": {"tarih": "19.09.2026"}}, metin)
        assert (tarih, kaynak) == ("19.09.2026", "gelen_evrak")

    def test_etiketsiz_ve_cok_tarihli_metinde_cikarim_kabul_edilmez(self):
        # sgk_rapor_parasi: rapor başlangıcı (01.08) evrak tarihi sanılıyordu
        metin = "01.08.2026 - 20.08.2026 tarihleri arası raporluyum, 26.09.2026 itibarıyla..."
        assert baslangic_sec({"tarih": "01.08.2026", "gelen_evrak": {}}, metin) == ("", "")

    def test_tek_tarihli_metinde_cikarim_kabul(self):
        assert baslangic_sec({"tarih": "02.10.2026"}, "Saygılarımla 02.10.2026") == \
            ("02.10.2026", "cikarim")

    async def test_node_sahte_gecikmis_uretmez(self):
        metin = "Tarih: 19.09.2026\n30.06.2026 tarihli kararın örneğini talep ederim."
        out = await sla_triyaj_node(_state(metin, "bilgi_edinme", "19.09.2026", "30.06.2026"))
        meta = out["sla_metadata"]
        assert meta["baslangic"] == "19.09.2026"
        assert meta["baslangic_kaynagi"] == "gelen_evrak"

    async def test_node_belirsiz_tarihte_dogrula(self):
        metin = "Olay 21.09.2026 günü oldu; 18.10.2026 tarihinde yürüyüş yapılacaktır."
        out = await sla_triyaj_node(_state(metin, "dilekce", None, "18.10.2026"))
        assert out["sla_metadata"]["durum"] == "tarih_yok"
        assert "DOĞRULA" in out["sla_metadata"]["etiket"]


class TestMetindenSure:
    def test_muzekkere_15_gun_icinde(self):
        metin = ("Dava dosyasına ilişkin imar durum belgesinin 15 (on beş) gün içinde\n"
                 "Mahkememize gönderilmesi rica olunur.")
        m = compute_sla("muzekkere", "01.10.2026", _BUGUN, metin=metin)
        assert m["durum"] != "tanimsiz"
        assert m["sure_kaynagi"] == "metin"
        assert m["son_tarih"] == "16.10.2026"
        assert m["ivedilik"] == "GÜNLÜDÜR"
        assert "m.26" in m["ivedilik_dayanak"]

    def test_soz_ile_yazili_is_gunu(self):
        ms = metinden_sure("Bilgilerin on beş iş günü içinde bildirilmesini rica ederim.",
                           date(2026, 10, 1))
        assert ms is not None and ms["gun"] == 15 and ms["is_gunu"] is True

    def test_tarihine_kadar(self):
        metin = "İstenen belgelerin en geç 20.10.2026 tarihine kadar gönderilmesi gerekmektedir."
        m = compute_sla("ust_yazi", "01.10.2026", _BUGUN, metin=metin)
        assert m["son_tarih"] == "20.10.2026"

    def test_ay_sonuna_kadar(self):
        metin = "Genelge gereğinin Ekim ayı sonuna kadar yapılması ve sonucun bildirilmesi."
        m = compute_sla("ust_yazi", "02.10.2026", _BUGUN, metin=metin)
        assert m["son_tarih"] == "31.10.2026"

    def test_kosul_cumlesi_sure_sayilmaz(self):
        assert metinden_sure("Kira 3 gün içinde ödenmezse sözleşme feshedilir.",
                             date(2026, 10, 1)) is None

    def test_istem_fiili_yoksa_sure_sayilmaz(self):
        assert metinden_sure("Tesis 10 gün içinde tamamen kurudu ve çiçekler soldu",
                             date(2026, 10, 1)) is None

    def test_yasal_sureyi_metin_uzatamaz(self):
        # dilekçede vatandaş 60 gün yazsa da 3071 m.7 otuz gün erken olandır
        metin = "Talebimin 60 gün içinde cevaplanmasını rica ederim."
        m = compute_sla("dilekce", "01.09.2026", _BUGUN, metin=metin)
        assert m["sure_kaynagi"] == "tur" and "3071" in m["mevzuat"]

    def test_metin_suresi_daha_erkense_onu_alir(self):
        metin = "Talebimin 10 gün içinde cevaplanmasını rica ederim."
        m = compute_sla("dilekce", "01.10.2026", _BUGUN, metin=metin)
        assert m["sure_kaynagi"] == "metin" and m["son_tarih"] == "12.10.2026"

    def test_sure_yoksa_tanimsiz_dogrula_etiketli(self):
        m = compute_sla("ust_yazi", "01.10.2026", _BUGUN, metin="Bilgilerinize sunulur.")
        assert m["durum"] == "tanimsiz" and "DOĞRULA" in m["etiket"]
        assert m["ivedilik"] == ""


class TestIvedilik:
    def test_gelen_belgenin_acele_ibaresi(self):
        assert ivedilik_ibaresi("T.C.\nACELE\nKEÇİÖREN KAYMAKAMLIĞI") == "ACELE"

    def test_kucuk_harf_veya_sozcuk_ici_ibare_sayilmaz(self):
        assert ivedilik_ibaresi("acele etmeyin, ACELECİ davranmayın") == ""
