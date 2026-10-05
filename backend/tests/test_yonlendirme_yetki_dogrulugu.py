"""Yönlendirme / yetki doğruluğu — 2026-10-05 inceleme bulgularının (GRUP 2) regresyonları.

  * taşra örneği (il müdürlüğü, tapu müdürlüğü) merkez teşkilatının birimlerine havale edilmez,
  * il müdürlüğü / bakanlık / defterdarlıkta kardeş il müdürlükleri 'iç birim' sayılmaz,
  * merkezî alıcı yerine aynı ailenin il taşra birimi tercih edilir,
  * özel hukuk tüzel kişisine (dağıtım şirketi) 3071 m.5 'idari makam' dayanağı yazılmaz,
  * YARGI (3071 m.6/b) yalnız dilekçe türünde geçerlidir; kurum yazısında muhatap işlem yapar,
  * yönlendirme varken etkili_birim kaba kategoriye düşmez,
  * türetilmiş Bursa BB görev tanımı mezarlık işini Sağlık İşleri'ne atamaz.
"""
from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from agents.config import etkili_birim
from agents.kurum_aday import yerel_tasra_tercih
from agents.nodes import route_ajan as ra
from agents.nodes.teskilat_ara import kurum_birimleri, tasra_ornegi_mi
from agents.yonlendirme import (
    BIRIM_SECILMEDI,
    duz_alanlar,
    gosterim_birimi,
    talep_karari,
    yonlendirme_kur,
)

_LLM = {"yol": "llm", "kesik": False, "yedege_dustu": False}
_KOK = Path(__file__).resolve().parents[2]


class TestTasraBirimleri:
    def test_sgk_il_mudurlugu_merkez_birimi_almaz(self):
        adlar = [b["birim_ad"] for b in kurum_birimleri(
            "ankara-sosyal-guvenlik-il-mudurlugu", "emeklilik hizmet borçlanması",
            tur="il_mudurlugu")]
        assert not any("Genel Müdürlüğü" in a or "Daire Başkanlığı" in a for a in adlar)

    def test_tapu_mudurlugu_tkgm_birimlerini_almaz(self):
        adlar = [b["birim_ad"] for b in kurum_birimleri(
            "cankaya-tapu-mudurlugu", "miras intikali tescil")]
        assert "Tapu Dairesi Başkanlığı" not in adlar

    def test_il_mudurlugunde_kardes_il_mudurlukleri_birim_degil(self):
        adlar = [b["birim_ad"] for b in kurum_birimleri(
            "ankara-il-tarim-ve-orman-mudurlugu", "hayvan şap aşısı", tur="il_mudurlugu")]
        assert not any("İl Müdürlüğü" in a or "İl/İlçe" in a for a in adlar)

    def test_ulusal_kaydin_kendisi_ve_aliasi_birimlerini_korur(self):
        assert kurum_birimleri("sosyal-guvenlik-kurumu", "emeklilik")
        assert not tasra_ornegi_mi("sosyal-guvenlik-kurumu", "sosyal-guvenlik-kurumu")
        assert kurum_birimleri("uedas", "elektrik kesintisi")  # alias = aynı kurum
        assert tasra_ornegi_mi("ankara-sosyal-guvenlik-il-mudurlugu", "sosyal-guvenlik-kurumu")

    def test_valilik_ic_birimleri_korunur(self):
        assert kurum_birimleri("ankara-valiligi", "toplantı yürüyüş", tur="valilik")


_ANKARA_ADAYLAR = ({"kod": "K1", "slug": "ankara-sosyal-guvenlik-il-mudurlugu",
                    "ad": "Ankara Sosyal Güvenlik İl Müdürlüğü", "tur": "il_mudurlugu",
                    "il": "Ankara"},)


class TestYerelTasra:
    _ANKARA: ClassVar[list[dict[str, str]]] = list(_ANKARA_ADAYLAR)

    def test_merkez_yerine_ayni_aile_il_mudurlugu(self):
        alici = {"slug": "sosyal-guvenlik-kurumu", "ad": "Sosyal Güvenlik Kurumu Başkanlığı",
                 "tur": "diger", "kaynak": "sicil"}
        out = yerel_tasra_tercih(alici, self._ANKARA)
        assert out["slug"] == "ankara-sosyal-guvenlik-il-mudurlugu"
        assert out["merkez_yerine"] == "Sosyal Güvenlik Kurumu Başkanlığı"

    def test_tasra_kaydi_yoksa_merkez_isaretlenir(self):
        alici = {"slug": "tapu-ve-kadastro-genel-mudurlugu",
                 "ad": "Tapu ve Kadastro Genel Müdürlüğü", "tur": "diger"}
        out = yerel_tasra_tercih(alici, self._ANKARA)
        assert out["slug"] == alici["slug"] and out["merkez_teskilati"] is True

    def test_yerel_alici_degismez(self):
        alici = {"slug": "aski", "ad": "ASKİ Genel Müdürlüğü", "tur": "su_kanalizasyon"}
        assert yerel_tasra_tercih(alici, self._ANKARA) == alici
        assert yerel_tasra_tercih(None, self._ANKARA) is None


class TestOzelHukukDayanak:
    def test_dagitim_sirketine_idari_makam_dayanagi_yazilmaz(self):
        alici = {"slug": "baskent-edas", "ad": "Başkent Elektrik Dağıtım A.Ş.",
                 "tur": "elektrik_dagitim", "kaynak": "sicil"}
        k = talep_karari("t1", "DISARIDA", alici_kurum=alici, dayanak="3071 m.5")
        assert k["devir"]["gerekli"] is True
        assert k["devir"]["dayanak"] == "" and k["devir"]["idari_makam"] is False
        yon = yonlendirme_kur([k], gerekce="", uretim=_LLM, dayanak="3071 m.5")
        assert yon["devir"]["dayanak"] == ""

    def test_idari_makama_dayanak_korunur(self):
        alici = {"slug": "aski", "ad": "ASKİ Genel Müdürlüğü", "tur": "su_kanalizasyon"}
        k = talep_karari("t1", "DISARIDA", alici_kurum=alici, dayanak="3071 m.5")
        assert k["devir"]["dayanak"] == "3071 m.5" and k["devir"]["idari_makam"] is True


def _sahte(monkeypatch, yanit):
    async def _llm(*a, **kw):
        return yanit
    monkeypatch.setattr(ra, "real_llm", lambda: object())
    monkeypatch.setattr(ra, "llm_json", _llm)


class TestYargiKapisi:
    _DILEKCE = ("ÇANKAYA BELEDİYE BAŞKANLIĞINA\n\nApartman yöneticisinin aidat artışı kararının "
                "iptalini arz ederim.\n\nAyşe Yılmaz\n")

    async def test_dilekcede_yargi_karari_korunur(self, monkeypatch):
        _sahte(monkeypatch, {"talepler": [{"id": "t1", "karar": "YARGI", "gerekce": "kat"}]})
        out = await ra.route_ajan({"evrak_turu": "dilekce", "evrak_text": self._DILEKCE,
                                   "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz",
                                                       "konu": "Aidat iptali"}}, {})
        yon = out["yonlendirme"]
        assert yon["karar"] == "YARGI" and not yon["devir"]["gerekli"]
        assert yon["insan_onayi_gerekli"] is True and out["canli_kaynak"] == {}

    async def test_kurum_yazisinda_yargi_icerde_kalir(self, monkeypatch):
        _sahte(monkeypatch, {"talepler": [{"id": "t1", "karar": "YARGI"}]})
        out = await ra.route_ajan({"evrak_turu": "muzekkere", "evrak_text": self._DILEKCE,
                                   "bilgi_unsurlari": {"konu": "Tedbir şerhi"}}, {})
        assert out["yonlendirme"]["karar"] == "ICERIDE"
        assert "3071 m.6/b uygulanmaz" in out["yonlendirme"]["talepler"][0]["gerekce"]


class TestEtkiliBirimKategoriYok:
    def test_yonlendirme_var_birim_yok_kategori_donmez(self):
        yon = yonlendirme_kur([talep_karari("t1", "ICERIDE")], gerekce="", uretim=_LLM,
                              dayanak="")
        state = {"yonlendirme": yon, "hedef_kategori": "basin_halkla_iliskiler_cimer",
                 "hedef_birim_oneri": "x"}
        assert etkili_birim(state) == ""
        assert gosterim_birimi(yon) == BIRIM_SECILMEDI
        assert duz_alanlar(yon, {})["gosterim_birimi"] == BIRIM_SECILMEDI

    def test_eski_kayit_zinciri_korunur(self):
        assert etkili_birim({"hedef_birim_oneri": "Fen İşleri Müdürlüğü"})


def test_bursa_saglik_isleri_mezarlik_gorevi_tasimaz():
    dosya = _KOK / "data/teskilat/bursa-buyuksehir-belediyesi/teskilat-resmi.txt"
    satirlar = dosya.read_text(encoding="utf-8").splitlines()
    i = satirlar.index("BİRİM: Sağlık İşleri Dairesi Başkanlığı")
    assert "mezarl" not in satirlar[i + 1].lower()
