"""Tek talep kümesi + gelen evrak modeli + imza dürüstlüğü (teşhis 2026-10-05, Akış T).

Sabitlenen davranış:
  * talepler YALNIZ cikar'ın talep kümesinden; `talepler` (list[str]) ve `alt_talepler`
    bundan türetilir → iki ajan aynı sayıyı verir (tek kaynak).
  * LLM öğesinin kanıtı kaynakta birebir geçmezse düşer (uydurma reddi).
  * decompose LLM ÇAĞIRMAZ; tek talepte alt_talepler=[] (fazla bölme yok).
  * düz metinde imza 'dogrulanamadi' → eksik sayılmaz, clarifier durmaz, bilgi notu düşer.
  * icra/mahkeme/kurum yazısına 3071 dilekçe şartları uygulanmaz.
"""

from __future__ import annotations

from datetime import date

import agents.nodes.cikar as cikar_mod
import agents.nodes.decompose as decompose_mod
from agents.nodes.cikar import cikar_node
from agents.nodes.clarifier import kritik_eksikler
from agents.nodes.decompose import compute_decomposition, decompose_node
from agents.nodes.eksik_tespit import eksik_tespit_node
from agents.talep_kumesi import (
    capa_orani,
    heuristik_talep_kumesi,
    ozet_kisa,
    talep_kumesi_dogrula,
)
from api.schemas import AltTalepSchema
from yazi.gelen_evrak import GelenEvrak, gelen_evrak_cikar

_KECIOREN = (
    "T.C.\nKEÇİÖREN BELEDİYE BAŞKANLIĞINA\n\n"
    "Sokağımızda iki aydır büyük bir çukur bulunmakta, araçlar ve yayalar için tehlike "
    "oluşturmaktadır. Çukurun en kısa sürede kapatılmasını arz ederim.\n\n"
    "Ayrıca Eylül 2026 dönemine ait su faturam 1.850 TL olarak gelmiştir. Sayacımın kontrol "
    "edilmesini ve fazla alınan tutarın iadesini talep ederim.\n\n"
    "02.10.2026\n\nAyşe Yılmaz\nT.C. Kimlik No: 10000000146\nTel: 0555-123-4567\n"
    "Adres: Bağlarbaşı Mah. Gül Sok. No:12 Keçiören/ANKARA"
)
_ICRA = (
    "T.C.\nANKARA 12. İCRA DAİRESİ\n\nDosya No : 2026/45123 Esas\nKonu     : Maaş haczi\n\n"
    "SOSYAL GÜVENLİK KURUMU\nANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜNE\n\n"
    "Borçlunun Kurumunuzdan almakta olduğu aylığın dörtte birinin haczedilerek dosyamıza "
    "gönderilmesini rica ederim.\n\n24.09.2026\nİcra Müdürü"
)
_LLM_KECIOREN = {
    "gonderen": "Ayşe Yılmaz", "konu": "Yol çukuru ve su faturası",
    "gelen_evrak": {"belge_cinsi": "dilekce", "gonderen_turu": "gercek_kisi",
                    "gonderen_idare": None, "muhatap_idare": "Keçiören Belediye Başkanlığı"},
    "talepler": [
        {"kanit": "Çukurun en kısa sürede kapatılmasını arz ederim",
         "ozet": "Yol çukurunun kapatılması", "tur": "talep",
         "birim_ipucu": "ilgili_teknik_daire"},
        {"kanit": "Sayacımın kontrol edilmesini ve fazla alınan tutarın iadesini talep ederim",
         "ozet": "Su sayacı kontrolü ve iade", "tur": "sikayet", "birim_ipucu": None},
        {"kanit": "Belediye binasının boyanmasını istiyorum",   # metinde YOK → düşmeli
         "ozet": "Bina boyası", "tur": "talep", "birim_ipucu": None},
    ],
}


def _sabit_llm(cevap):
    async def _fake(system, user, **kwargs):
        _fake.kwargs = kwargs
        return cevap
    return _fake


class TestTalepKumesiTekKaynak:
    async def test_llm_kumesi_kanit_capali_ve_uydurma_duser(self, monkeypatch):
        monkeypatch.setattr(cikar_mod, "llm_json", _sabit_llm(_LLM_KECIOREN))
        bu = (await cikar_node({"evrak_text": _KECIOREN}))["bilgi_unsurlari"]
        kume = bu["talep_kumesi"]
        assert [o["id"] for o in kume] == ["t1", "t2"]
        assert bu["talep_kumesi_kaynagi"] == "llm"
        assert len(bu["talepler"]) == 2 and "kapatılmasını" in bu["talepler"][0]
        assert kume[0]["ozet"] == "Yol çukurunun kapatılması"
        assert kume[1]["birim_ipucu"] is None

    async def test_cikar_dusunme_kapali_tek_cagri(self, monkeypatch):
        fake = _sabit_llm(_LLM_KECIOREN)
        monkeypatch.setattr(cikar_mod, "llm_json", fake)
        await cikar_node({"evrak_text": _KECIOREN})
        assert fake.kwargs.get("dusunme_kapali") is True

    async def test_decompose_ayni_sayiyi_verir_ve_llm_cagirmaz(self, monkeypatch):
        monkeypatch.setattr(cikar_mod, "llm_json", _sabit_llm(_LLM_KECIOREN))
        bu = (await cikar_node({"evrak_text": _KECIOREN}))["bilgi_unsurlari"]
        assert not hasattr(decompose_mod, "llm_json"), "decompose LLM'e bağlı kalmamalı"
        out = await decompose_node({"evrak_text": _KECIOREN, "bilgi_unsurlari": bu})
        alt = out["alt_talepler"]
        assert len(alt) == len(bu["talepler"]) == 2
        assert alt[0]["konu"] == "Yol çukurunun kapatılması" and alt[0]["kanit"]
        assert alt[0]["birim"] == "ilgili_teknik_daire"
        assert out["ayristirma_denendi"] is True

    async def test_tek_talepte_alt_talep_yok_decompose_gerekmedi(self):
        """LLM kararı cikar adımına aittir; decompose tek talepte iş yapmaz (2026-10-05)."""
        bu = {"talep_kumesi": [{"id": "t1", "kanit": "Faturanın yeniden incelenmesini arz ederim",
                                "ozet": "Fatura incelemesi", "tur": "talep",
                                "birim_ipucu": None}],
              "talep_kumesi_kaynagi": "llm"}
        metin = ("Eylül faturam 1.850 TL gelmiştir; bu tutar üç kat fazladır. "
                 "Faturanın yeniden incelenmesini arz ederim.")
        out = await decompose_node({"evrak_text": metin, "bilgi_unsurlari": bu})
        assert out["alt_talepler"] == []
        assert out["ayristirma_denendi"] is False

    def test_alt_talep_semasi_eski_ve_yeni_anahtarlar(self):
        alt = compute_decomposition(
            "Çukurun kapatılmasını istiyorum. Faturamdaki fazla tutarın iadesini istiyorum.",
            {}, date(2026, 10, 5))
        assert len(alt) == 2
        for a in alt:
            AltTalepSchema(**a)
        AltTalepSchema(ozet="eski kayıt")   # konu/kanit olmadan da parse olur


class TestHeuristikYedek:
    def test_ayracsiz_iki_talep(self):
        k = heuristik_talep_kumesi(
            "Sokaktaki çukurun kapatılmasını istiyorum. Faturamdaki fazla tutarın "
            "iadesini istiyorum.")
        assert len(k) == 2

    def test_kalip_kapanis_talep_sayilmaz(self):
        k = heuristik_talep_kumesi(
            "Mahallemizde çöpler düzenli toplanmıyor, konteynerler taşıyor. "
            "Gereğinin yapılmasını arz ederim.")
        assert len(k) == 1 and "çöpler" in k[0]["kanit"]

    def test_durum_cumlesi_ayri_talep_olmaz(self):
        k = heuristik_talep_kumesi(
            "Eylül 2026 dönemine ait su faturam 1.850 TL olarak gelmiştir; bu tutar önceki "
            "aylara göre üç kat fazladır. Faturanın yeniden incelenmesini arz ederim.")
        assert len(k) == 1

    def test_kosullu_alternatif_tek_madde(self):
        k = heuristik_talep_kumesi(
            "Sokağımızdaki aydınlatma direğinin onarılmasını, onarım mümkün değilse bölgeye "
            "yeni bir aydınlatma direği yerleştirilmesini talep ederim.")
        assert len(k) == 1 and "yeni" in k[0]["kanit"]

    def test_imza_adi_ozete_sizmaz(self):
        k = heuristik_talep_kumesi(
            "Başvurumun sonucunu öğrenmek istiyorum.\nAyşe Yılmaz\nİmza")
        assert k and all("Yılmaz" not in o["kanit"] for o in k)

    def test_pii_kanita_ham_gecmez(self):
        k = heuristik_talep_kumesi(
            "10000000146 kimlik numaralı kaydımdaki hatanın düzeltilmesini, 0555-123-4567 "
            "numaramdan dönülmesini talep ederim.")
        metin = str(k)
        assert "10000000146" not in metin and "0555-123-4567" not in metin

    def test_ozet_kisa_isim_obegi(self):
        assert ozet_kisa("Çukurun en kısa sürede kapatılmasını arz ederim") == \
            "Çukurun kapatılması"

    def test_capa_unsuz_yumusamasi(self):
        assert capa_orani("Sokaktaki çukur", "Sokağımızda çukur var") == 1.0

    def test_dogrula_capasiz_ozeti_kanittan_kisaltir(self):
        k = talep_kumesi_dogrula(
            [{"kanit": "Çukurun kapatılmasını arz ederim", "ozet": "Uzay mekiği fırlatılması"}],
            "Sokakta çukur var. Çukurun kapatılmasını arz ederim.")
        assert k[0]["ozet"] == "Çukurun kapatılması"


class TestGelenEvrak:
    def test_dilekce_hitap_muhatap_olur(self):
        g = gelen_evrak_cikar(_KECIOREN, None, "Ayşe Yılmaz")
        assert g.belge_cinsi == "dilekce" and g.gonderen_turu == "gercek_kisi"
        assert g.muhatap_idare == "Keçiören Belediye Başkanlığı"
        assert g.gonderen_idare is None and g.gonderen_ad == "Ayşe Yılmaz"
        assert g.tarih == "02.10.2026" and g.sayi is None

    def test_icra_yazisi_antet_gonderen_dosya_no_sayi(self):
        g = gelen_evrak_cikar(_ICRA)
        assert g.belge_cinsi == "icra_yazisi" and g.gonderen_turu == "kamu_idaresi"
        assert g.gonderen_idare == "Ankara 12. İcra Dairesi"
        assert g.muhatap_idare == "Ankara Sosyal Güvenlik İl Müdürlüğü"
        assert g.sayi == "2026/45123 Esas" and g.resmi

    def test_sayi_yalniz_etiketten(self):
        g = gelen_evrak_cikar("Başvurum 12345678 numaralıdır. Gereğini arz ederim.")
        assert g.sayi is None

    def test_cimer_basvuru_no_ve_elektronik_kanal(self):
        metin = ("T.C.\nETİMESGUT BELEDİYE BAŞKANLIĞI\n\nCİMER Başvuru No: 2026-0925-55130\n"
                 "Başvuru Sahibi: Ayşe Yılmaz\n\nParktaki köpeklerin toplatılmasını istiyorum.")
        g = gelen_evrak_cikar(metin)
        assert g.belge_cinsi == "cimer_basvurusu" and g.elektronik_kanal
        assert g.basvuru_no == "2026-0925-55130" and g.gonderen_ad == "Ayşe Yılmaz"
        assert g.muhatap_idare == "Etimesgut Belediye Başkanlığı"

    def test_from_dict_kapali_kume_ve_tur_donusumu(self):
        g = GelenEvrak.from_dict({"belge_cinsi": "uydurma", "gonderen_turu": "x", "sayi": 5})
        assert g.belge_cinsi == "diger" and g.gonderen_turu == "gercek_kisi" and g.sayi is None
        assert GelenEvrak.from_dict(g.to_dict()) == g

    def test_llm_cinsi_kullanilir_etiket_kazanir(self):
        g = gelen_evrak_cikar(_ICRA, {"belge_cinsi": "muzekkere", "gonderen_turu": "kamu_idaresi",
                                      "gonderen_idare": "Uydurma İdare"})
        assert g.belge_cinsi == "muzekkere"
        assert g.gonderen_idare == "Ankara 12. İcra Dairesi"   # yapısal kanıt kazanır


class TestImzaVeKurallar:
    async def test_duz_metin_imza_dogrulanamadi_eksik_degil(self):
        bu = (await cikar_node({"evrak_text": _KECIOREN}))["bilgi_unsurlari"]
        assert bu["imza_durumu"] == "dogrulanamadi"
        out = await eksik_tespit_node({"bilgi_unsurlari": bu, "evrak_turu": "dilekce",
                                       "evrak_text": _KECIOREN})
        assert "imza" not in out["eksik_alanlar"]
        assert out["eksik_bilgi_notlari"] and "m.6/c" in out["eksik_bilgi_notlari"][0]
        assert kritik_eksikler({"evrak_turu": "dilekce", **out}) == []

    async def test_imza_satiri_var(self):
        bu = (await cikar_node({"evrak_text": _KECIOREN + "\nİmza"}))["bilgi_unsurlari"]
        assert bu["imza_durumu"] == "var" and bu["imza"] is True

    async def test_telefon_adres_yerine_gecmez(self):
        metin = "MAMAK BELEDİYE BAŞKANLIĞINA\n\nÇöplerin toplanmasını istiyorum.\nTel: 0555-123-4567"
        bu = (await cikar_node({"evrak_text": metin}))["bilgi_unsurlari"]
        out = await eksik_tespit_node({"bilgi_unsurlari": bu, "evrak_turu": "dilekce",
                                       "evrak_text": metin})
        assert "iletisim_adres" in out["eksik_alanlar"]

    async def test_muhatap_kurum_tckn_eksigini_ortmez(self):
        metin = "MAMAK BELEDİYE BAŞKANLIĞINA\n\nÇöplerin toplanmasını istiyorum.\nAyşe Yılmaz"
        bu = (await cikar_node({"evrak_text": metin}))["bilgi_unsurlari"]
        out = await eksik_tespit_node({"bilgi_unsurlari": bu, "evrak_turu": "dilekce",
                                       "evrak_text": metin})
        assert "tckn_veya_kurum" in out["eksik_alanlar"]

    async def test_icra_yazisina_dilekce_kurali_uygulanmaz(self):
        bu = (await cikar_node({"evrak_text": _ICRA}))["bilgi_unsurlari"]
        for tur in ("icra_evraki", "talep"):   # sınıflandırma yanılsa da gelen evrak belirler
            out = await eksik_tespit_node({"bilgi_unsurlari": bu, "evrak_turu": tur,
                                           "evrak_text": _ICRA})
            assert not {"gonderen_ad_soyad", "iletisim_adres", "imza"} & set(
                out["eksik_alanlar"]), out["eksik_alanlar"]
