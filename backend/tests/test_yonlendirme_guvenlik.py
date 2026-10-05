"""Yönlendirme güvenlik ağı — 2026-10-05 birleşik dal incelemesinin KRİTİK/YÜKSEK bulguları.

Her test bir inceleme senaryosunun regresyonudur:
  * çözülemeyen (BELIRSIZ) ya da cevapsız talep varken otomatik havale YOK,
  * doğrulanmamış ikinci birim / farklı birimler varken otomatik havale YOK,
  * gelen kurum yazısında gönderen ailesi (antet üst kurumu + alt birimi) yetkili kurum olamaz,
  * LLM'in serbest kurum adı doğrulanmamış işaretini devir bloğuna ve gösterime taşır,
  * yargı merciinin görevi (3071 m.6/b) devir değildir,
  * bilgi edinme başvurusu (4982) usul birimine gider; tür istemde açıktır,
  * kurum kendine ve sicildeki başka kuruma 'iç havale' edemez,
  * kesilip kurtarılan LLM cevabı otomatik havale üretmez.
"""
from __future__ import annotations

from typing import Any

import pytest

from agents import llm_iz
from agents.kurum_aday import gonderen_aileleri, kurum_adaylari, kurum_aile_anahtari
from agents.nodes import route_ajan as ra
from agents.yonlendirme import (
    BIRIM_SECILMEDI,
    devir_ozeti,
    gosterim_birimi,
    talep_karari,
    yonlendirme_kur,
)

_B_DOGRU = {"ad": "Fen İşleri Müdürlüğü", "kaynak_tipi": "kurum_ozel", "dogrulanmis": True}
_B_DOGRU2 = {"ad": "Zabıta Müdürlüğü", "kaynak_tipi": "kurum_ozel", "dogrulanmis": True}
_B_ONERI = {"ad": "Zabıta Müdürlüğü", "kaynak_tipi": "aday", "dogrulanmis": False}
_LLM = {"yol": "llm", "kesik": False, "yedege_dustu": False}

_SGK_YAZISI = (
    "T.C.\nSOSYAL GÜVENLİK KURUMU BAŞKANLIĞI\nAnkara Sosyal Güvenlik İl Müdürlüğü\n\n"
    "Sayı  : E-99887766-205.99-5512345\nKonu  : Prim borcu bilgisi\n\n"
    "KEÇİÖREN BELEDİYE BAŞKANLIĞINA\n\nBelediyeniz adına kayıtlı işyerine ait prim borcu "
    "toplam 412.350,00 TL olup bilgilerinizi rica ederim.\n\nİl Müdürü\n"
)


def _kur(talepler: list[dict], uretim: dict | None = None) -> dict:
    return yonlendirme_kur(talepler, gerekce="", uretim=uretim or _LLM, dayanak="")


class TestOtomatikHavaleSartlari:
    def test_belirsiz_talep_varken_otomatik_havale_yok(self):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU),
                    talep_karari("t2", "BELIRSIZ")])
        assert yon["karar"] == "ICERIDE"          # karar verilen talebin kararı görünür
        assert yon["belirsiz_talep"] == 1         # ama çözülemeyen talep yok sayılmaz
        assert yon["insan_onayi_gerekli"] is True

    def test_alicisi_reddedilen_disarida_talep_belirsiz_ve_onay(self):
        # DISARIDA dendi ama alıcı çözülemedi (gönderen = alıcı reddi) → BELIRSIZ.
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU),
                    talep_karari("t2", "DISARIDA", alici_kurum=None)])
        assert yon["talepler"][1]["karar"] == "BELIRSIZ"
        assert yon["insan_onayi_gerekli"] is True

    def test_dogrulanmamis_ikinci_birim_onay_ister(self):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU),
                    talep_karari("t2", "ICERIDE", birim=_B_ONERI)])
        assert yon["insan_onayi_gerekli"] is True

    def test_farkli_dogrulanmis_birimler_onay_ister(self):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU),
                    talep_karari("t2", "ICERIDE", birim=_B_DOGRU2)])
        assert yon["insan_onayi_gerekli"] is True

    def test_tek_dogrulanmis_birim_otomatik(self):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU),
                    talep_karari("t2", "ICERIDE", birim=dict(_B_DOGRU))])
        assert yon["insan_onayi_gerekli"] is False

    @pytest.mark.parametrize("uretim", [
        {"yol": "llm_kismi"}, {"yol": "deterministik"}, {"yol": "llm", "kesik": True}])
    def test_kismi_yedek_ya_da_kesik_uretim_otomatik_degil(self, uretim):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=_B_DOGRU)], uretim)
        assert yon["insan_onayi_gerekli"] is True


class TestSerbestKurum:
    def test_dogrulanmamis_isaret_devir_ve_gosterime_tasinir(self):
        alici = {"slug": "sahte-danismanlik-mudurlugu", "ad": "Sahte Danışmanlık Müdürlüğü",
                 "kaynak": "serbest_dogrulanmadi"}
        yon = _kur([talep_karari("t1", "DISARIDA", alici_kurum=alici, dayanak="3071 m.5")])
        yk = yon["devir"]["yetkili_kurum"]
        assert yk["kaynak"] == "serbest_dogrulanmadi" and yk["dogrulanmis"] is False
        assert gosterim_birimi(yon).endswith("(devir, doğrulanmadı)")
        oz = devir_ozeti(yon)
        assert oz["dogrulanmamis"] is True
        assert oz["kurumlar"] == ["Sahte Danışmanlık Müdürlüğü (doğrulanmadı)"]

    def test_sicil_kurumu_dogrulanmis(self):
        alici = {"slug": "aski", "ad": "ASKİ Genel Müdürlüğü", "kaynak": "sicil"}
        yon = _kur([talep_karari("t1", "DISARIDA", alici_kurum=alici)])
        assert yon["devir"]["yetkili_kurum"]["dogrulanmis"] is True
        assert gosterim_birimi(yon) == "ASKİ Genel Müdürlüğü (devir)"


class TestYargiYolu:
    def test_yargi_karari_devir_ve_birim_uretmez(self):
        k = talep_karari("t1", "YARGI", birim=_B_DOGRU,
                         alici_kurum={"slug": "x", "ad": "Çankaya Kaymakamlığı"})
        assert k["karar"] == "YARGI" and k["birim"] is None and k["alici_kurum"] is None
        assert k["devir"]["gerekli"] is False
        yon = _kur([k])
        assert yon["karar"] == "YARGI" and yon["insan_onayi_gerekli"] is True
        assert devir_ozeti(yon) is None
        assert "3071 m.6/b" in gosterim_birimi(yon)


class TestBirimYoksaKategoriYok:
    def test_birimsiz_yonlendirme_memur_secer_der(self):
        yon = _kur([talep_karari("t1", "ICERIDE", birim=None)])
        assert gosterim_birimi(yon) == BIRIM_SECILMEDI


class TestGonderenAilesi:
    def test_aile_anahtari_yer_ve_orgut_sozcuklerini_atar(self):
        a = kurum_aile_anahtari("Ankara Sosyal Güvenlik İl Müdürlüğü")
        assert a == kurum_aile_anahtari("SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI")
        assert a == kurum_aile_anahtari("Keçiören Sosyal Güvenlik Merkezi Müdürlüğü")
        assert kurum_aile_anahtari("Keçiören Belediyesi") != kurum_aile_anahtari(
            "Mamak Belediyesi")

    def test_gonderen_ailesi_aday_listesinden_cikar(self):
        gonderen = {"slug": "sosyal-guvenlik-kurumu-baskanligi",
                    "ad": "Sosyal Güvenlik Kurumu Başkanlığı"}
        aile = gonderen_aileleri(gonderen, ra.antet_satirlari(_SGK_YAZISI))
        muhatap = {"slug": "kecioren-belediyesi", "ad": "Keçiören Belediyesi",
                   "tur": "belediye"}
        sluglar = {k["slug"] for k in kurum_adaylari(muhatap, gonderen, aile)}
        assert "ankara-sosyal-guvenlik-il-mudurlugu" not in sluglar
        assert "sosyal-guvenlik-kurumu" not in sluglar
        assert "aski" in sluglar  # başka kurumlar etkilenmez

    async def test_kurum_yazisinda_gondereni_devir_icerde_kalir(self, monkeypatch):
        cevap = {"talepler": [{"id": "t1", "karar": "DISARIDA", "kurum": "",
                               "kurum_adi": "Ankara Sosyal Güvenlik İl Müdürlüğü",
                               "gerekce": "Prim borcu SGK'nın işidir."}]}
        _sahte_llm(monkeypatch, cevap)
        state = {"evrak_turu": "cevabi_yazi", "evrak_text": _SGK_YAZISI,
                 "bilgi_unsurlari": {"konu": "Prim borcu bilgisi"}}
        out = await ra.route_ajan(state, {"hedef_birim": "mali_strateji_sgb"})
        yon = out["yonlendirme"]
        assert yon["karar"] == "ICERIDE"
        assert yon["alici_kurum"] is None and not yon["devir"]["gerekli"]
        assert "cevap yükümlüsü" in yon["talepler"][0]["gerekce"]
        assert out["yetkili_kurum"].get("slug") != "ankara-sosyal-guvenlik-il-mudurlugu"


def _sahte_llm(monkeypatch: pytest.MonkeyPatch, yanit: dict | None,
               iz: dict | None = None) -> list[dict]:
    cagrilar: list[dict] = []

    async def _sahte(*args: Any, **kw: Any) -> dict | None:
        cagrilar.append(kw)
        if iz:
            llm_iz.iz_ekle(iz)
        return yanit

    monkeypatch.setattr(ra, "real_llm", lambda: object())
    monkeypatch.setattr(ra, "llm_json", _sahte)
    return cagrilar


_KECIOREN_IKI = {
    "evrak_turu": "dilekce",
    "evrak_text": ("KEÇİÖREN BELEDİYE BAŞKANLIĞINA\n\nSokağımızdaki çukurun kapatılmasını ve "
                   "parktaki bankların onarılmasını arz ederim.\n\nAyşe Yılmaz\n"),
    "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çukur ve bank onarımı",
                        "talep_kumesi": [
                            {"id": "t1", "ozet": "Sokaktaki çukurun kapatılması",
                             "kanit": "çukurun kapatılmasını"},
                            {"id": "t2", "ozet": "Parktaki bankların onarılması",
                             "kanit": "bankların onarılmasını"}]},
}


class TestKismiCevap:
    async def test_cevapsiz_talep_belirsiz_ve_kismi_uretim(self, monkeypatch):
        _sahte_llm(monkeypatch, {"talepler": [
            {"id": "t1", "karar": "ICERIDE", "birim": "B1", "gerekce": "yol"}]})
        out = await ra.route_ajan(dict(_KECIOREN_IKI), {"hedef_birim": "ilgili_teknik_daire"})
        yon = out["yonlendirme"]
        assert [t["karar"] for t in yon["talepler"]][1] == "BELIRSIZ"
        assert yon["uretim"]["yol"] == "llm_kismi"
        assert yon["insan_onayi_gerekli"] is True
        assert out["durum"] != "kaynak_dogrulandi"

    async def test_kesik_izi_uretime_yazilir(self, monkeypatch):
        _sahte_llm(monkeypatch, {"talepler": [
            {"id": "t1", "karar": "ICERIDE", "birim": "B1"},
            {"id": "t2", "karar": "ICERIDE", "birim": "B1"}]},
            iz={"kesik": True, "kurtarildi": True})
        with llm_iz.node_kapsami("route_birim"):
            out = await ra.route_ajan(dict(_KECIOREN_IKI), {"hedef_birim": "x"})
        uretim = out["yonlendirme"]["uretim"]
        assert uretim["kesik"] is True and uretim["kurtarildi"] is True
        assert out["yonlendirme"]["insan_onayi_gerekli"] is True


class TestBilgiEdinmeUsulu:
    async def test_tur_istemde_ve_secenekler_usul_birimi(self, monkeypatch):
        cagrilar = _sahte_llm(monkeypatch, None)
        state = {"evrak_turu": "bilgi_edinme",
                 "evrak_text": ("ÇANKAYA BELEDİYE BAŞKANLIĞINA\n\n4982 sayılı Kanun kapsamında "
                                "2025 yılında asfaltlanan yol uzunluğu bilgisinin verilmesini "
                                "arz ederim.\n\nAyşe Yılmaz\n"),
                 "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz",
                                     "konu": "Asfalt yol uzunluğu bilgisi"}}
        out = await ra.route_ajan(state, {"hedef_birim": "basin_halkla_iliskiler_cimer"})
        assert "Bilgi Edinme" in cagrilar[0]["user"]
        # Model cevap vermedi → deterministik yedek de usul birimini önerir, 'Bilgi İşlem' değil.
        birim = (out["yonlendirme"]["birim"] or {}).get("ad", "")
        assert "Halkla" in birim and "Bilgi İşlem" not in birim

    def test_bilgi_islem_usul_birimi_sayilmaz(self):
        birimler = [{"birim_ad": "Bilgi İşlem Müdürlüğü"},
                    {"birim_ad": "Basın, Yayın ve Halkla İlişkiler Müdürlüğü"},
                    {"birim_ad": "Açık Kapı Şube Müdürlüğü"}]
        adlar = [b["birim_ad"] for b in ra._bilgi_edinme_birimleri(birimler)]
        assert adlar == ["Basın, Yayın ve Halkla İlişkiler Müdürlüğü",
                         "Açık Kapı Şube Müdürlüğü"]


class TestIcBirimKapisi:
    def test_kurum_kendine_havale_edemez(self):
        muhatap = {"slug": "ankara-il-saglik-mudurlugu", "ad": "Ankara İl Sağlık Müdürlüğü"}
        assert not ra._birim_uygun({"birim_ad": "İl/İlçe Sağlık Müdürlüğü",
                                    "kaynak_tipi": "jenerik"}, muhatap)

    def test_sicildeki_baska_kurum_ic_birim_degil(self):
        muhatap = {"slug": "kecioren-belediyesi", "ad": "Keçiören Belediyesi"}
        assert not ra._birim_uygun({"birim_ad": "Ankara Valiliği", "kaynak_tipi": "jenerik"},
                                   muhatap)

    def test_valiligin_bagli_il_mudurlugu_istisna(self):
        muhatap = {"slug": "ankara-valiligi", "ad": "Ankara Valiliği"}
        assert ra._birim_uygun({"birim_ad": "Ankara İl Sağlık Müdürlüğü",
                                "kaynak_tipi": "bagli_kurulus"}, muhatap)

    def test_gercek_ic_birim_gecer(self):
        muhatap = {"slug": "kecioren-belediyesi", "ad": "Keçiören Belediyesi"}
        assert ra._birim_uygun({"birim_ad": "Fen İşleri Müdürlüğü",
                                "kaynak_tipi": "kurum_ozel"}, muhatap)
