"""Yönlendirme tek doğruluk kaynağı — teşhis 2026-10-05 "BİRİM YÖNLENDİRME + YETKİ" sözleşmeleri.

Kapsam: talep başına karar (KARMA) · kapalı küme kurum seçimi (sicil) · model başarısızken
otomatik havale YOK · etkili_birim/gosterim_birimi tutarlılığı · tam teşkilat aday kümesi ·
servis_birim kelime sınırı ve kurum türü · türetilmiş görev metni veri kapısı.
"""
from __future__ import annotations

from typing import Any

import pytest

from agents.config import etkili_birim
from agents.kurum_aday import kurum_ad_cozumle, kurum_adaylari
from agents.nodes import route_ajan as ra
from agents.nodes.teskilat_ara import gorev_turetilmis, kurum_birimleri
from agents.servis_birim import oner_servis_birimi
from agents.yonlendirme import (
    alt_talepleri_zenginlestir,
    belge_karari,
    duz_alanlar,
    gosterim_birimi,
    talep_karari,
    yonlendirme_kur,
)

_KECIOREN = {
    "evrak_turu": "dilekce",
    "evrak_text": (
        "T.C.\nKEÇİÖREN BELEDİYE BAŞKANLIĞINA\n\nSokağımızda büyük bir çukur var, kapatılmasını "
        "talep ediyorum. Ayrıca su faturam çok yüksek geldi, sayacın kontrolünü ve iadesini "
        "arz ederim.\n\nAyşe Yılmaz\nT.C. Kimlik No: 10000000146"
    ),
    "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çukur ve su faturası"},
    "alt_talepler": [
        {"ozet": "Sokaktaki çukurun kapatılması", "birim": "ilgili_teknik_daire"},
        {"ozet": "Su faturası itirazı ve iade", "birim": "mali_strateji_sgb"},
    ],
}
_MUHATAP = {"ad": "Keçiören Belediyesi", "slug": "kecioren-belediyesi", "tur": "belediye"}


class _SahteLLM:
    pass


def _llm_yaniti(monkeypatch: pytest.MonkeyPatch, yanit: dict[str, Any] | None) -> list[dict]:
    cagrilar: list[dict] = []

    async def _sahte(*args: Any, **kw: Any) -> dict[str, Any] | None:
        cagrilar.append(kw)
        return yanit

    monkeypatch.setattr(ra, "real_llm", lambda: _SahteLLM())
    monkeypatch.setattr(ra, "llm_json", _sahte)
    return cagrilar


def _kod(liste: list[dict], **kosul: str) -> str:
    return next(k["kod"] for k in liste if all(k.get(a) == v for a, v in kosul.items()))


class TestKurumKapaliKume:
    def test_parantezli_kisaltma_sicile_cozulur(self):
        assert kurum_ad_cozumle("Ankara Su ve Kanalizasyon İdaresi (ASKİ) Genel Müdürlüğü")[
            "slug"] == "aski"
        assert kurum_ad_cozumle("Başkent Elektrik Dağıtım A.Ş. (Başkent EDAŞ)") is not None

    def test_listede_olmayan_ad_cozulmez(self):
        assert kurum_ad_cozumle("Hayali Kurum Genel Müdürlüğü") is None

    def test_ilce_belediyesinde_il_kurumlari_ve_hizmet_saglayicilari(self):
        adaylar = kurum_adaylari(_MUHATAP)
        sluglar = {k["slug"] for k in adaylar}
        assert "aski" in sluglar                       # ilin su idaresi (sicil il=Ankara)
        assert "ankara-buyuksehir-belediyesi" in sluglar
        assert "ankara-il-milli-egitim-mudurlugu" in sluglar
        assert "kecioren-belediyesi" not in sluglar     # muhatap kendisi alıcı olamaz
        assert "iski" not in sluglar                    # başka ilin su idaresi sızmaz
        assert any(k["tur"] == "elektrik_dagitim" for k in adaylar)

    def test_gonderen_listeden_cikar(self):
        adaylar = kurum_adaylari(_MUHATAP, {"slug": "aski"})
        assert "aski" not in {k["slug"] for k in adaylar}


class TestTamTeskilat:
    def test_resmi_eslesme_erken_donus_yapmaz(self):
        birimler = kurum_birimleri("kecioren-belediyesi", "sokak çukuru ve su faturası",
                                   tur="belediye")
        adlar = [b["birim_ad"] for b in birimler]
        assert len(adlar) >= 8
        assert len({a.replace("Malî", "Mali") for a in adlar}) == len(adlar)  # tekil

    def test_kendi_kaydi_olmayan_kurum_tur_sablonuyla_tamamlanir(self):
        birimler = kurum_birimleri("selcuklu-belediyesi", "çöp konteyneri", tur="belediye")
        tipler = {b["birim_ad"]: b["kaynak_tipi"] for b in birimler}
        assert tipler.get("Fen İşleri Müdürlüğü") == "mevzuat_teskilat"   # güveni yüksek kalır
        assert any(t == "jenerik" for t in tipler.values())
        assert all(b["kaynak_guven"] != "resmi_dogrulanmis" for b in birimler
                   if b["kaynak_tipi"] == "jenerik")

    def test_bilinmeyen_tur_jenerik_sablona_dusmez(self):
        assert kurum_birimleri("hayali-kurum-xyz", "su faturası", tur="diger") == []

    def test_turetilmis_gorev_dosyasi_resmi_sayilmaz(self):
        assert gorev_turetilmis("ankara-buyuksehir-belediyesi/teskilat-resmi.txt") is True
        birimler = kurum_birimleri("ankara-buyuksehir-belediyesi", "su", tur="belediye")
        assert all(b["kaynak_guven"] != "resmi_dogrulanmis" for b in birimler
                   if b["kaynak_tipi"] != "mevzuat_teskilat")


class TestYonlendirmeNesnesi:
    def test_karma_karar_ve_gosterim(self):
        ic = talep_karari("t1", "ICERIDE", birim={"ad": "Fen İşleri Müdürlüğü",
                                                   "dogrulanmis": True})
        dis = talep_karari("t2", "DISARIDA", alici_kurum={"slug": "aski", "ad": "ASKİ"},
                           dayanak="3071 m.5")
        yon = yonlendirme_kur([ic, dis], gerekce="g", uretim={"yol": "llm"}, dayanak="3071 m.5")
        assert yon["karar"] == "KARMA"
        assert yon["devir"]["gerekli"] is True
        assert yon["insan_onayi_gerekli"] is True   # devir varken otomatik havale yok
        assert gosterim_birimi(yon) == "Fen İşleri Müdürlüğü"

    def test_disarida_gosterim_alici_kurum(self):
        dis = talep_karari("t1", "DISARIDA", alici_kurum={"slug": "aski", "ad": "ASKİ"})
        yon = yonlendirme_kur([dis], gerekce="", uretim={"yol": "llm"}, dayanak="d")
        duz = duz_alanlar(yon, _MUHATAP)
        assert duz["yetkili_kurum"]["slug"] == "aski"
        assert duz["gosterim_birimi"] == "ASKİ (devir)"
        assert etkili_birim({"yonlendirme": yon, "hedef_kategori": "x"}) == "ASKİ (devir)"

    def test_deterministik_yol_asla_otomatik_havale_uretmez(self):
        ic = talep_karari("t1", "ICERIDE", birim={"ad": "Fen", "dogrulanmis": True})
        yon = yonlendirme_kur([ic], gerekce="", uretim={"yol": "deterministik"}, dayanak="")
        assert yon["insan_onayi_gerekli"] is True
        assert duz_alanlar(yon, _MUHATAP)["durum"] == "fallback_onerisi"

    def test_kurumsuz_disarida_belirsiz(self):
        assert talep_karari("t1", "DISARIDA")["karar"] == "BELIRSIZ"
        assert belge_karari([talep_karari("t1", "?")]) == "BELIRSIZ"

    def test_alt_talepler_additive_zenginlesir(self):
        dis = talep_karari("t2", "DISARIDA", alici_kurum={"slug": "aski", "ad": "ASKİ"})
        ic = talep_karari("t1", "ICERIDE", birim={"ad": "Fen İşleri Müdürlüğü"})
        alt = [{"ozet": "a", "birim": "x"}, {"ozet": "b"}]
        out = alt_talepleri_zenginlestir(alt, [ic, dis])
        assert out[0]["birim"] == "x" and out[0]["birim_ad"] == "Fen İşleri Müdürlüğü"
        assert out[1]["yetki"] == "DISARIDA" and out[1]["yetkili_kurum_ad"] == "ASKİ"
        assert "yetki" not in alt[0]  # girdi değişmez


class TestRouteAjanTalepBazli:
    async def test_llm_karma_karar_kapali_kumeden(self, monkeypatch):
        kurumlar = kurum_adaylari(_MUHATAP)
        birimler = kurum_birimleri("kecioren-belediyesi", "x", tur="belediye")
        fen = next(i for i, b in enumerate(birimler) if b["birim_ad"].startswith("Fen"))
        cagrilar = _llm_yaniti(monkeypatch, {"talepler": [
            {"id": "t1", "karar": "ICERIDE", "birim": f"B{fen + 1}", "gerekce": "yol"},
            {"id": "t2", "karar": "DISARIDA", "kurum": _kod(kurumlar, slug="aski"),
             "gerekce": "su"},
        ]})
        out = await ra.route_ajan(dict(_KECIOREN), {"hedef_birim": "ilgili_teknik_daire"})
        yon = out["yonlendirme"]
        assert yon["karar"] == "KARMA"
        assert yon["talepler"][1]["alici_kurum"]["slug"] == "aski"
        assert out["gosterim_birimi"].startswith("Fen İşleri")
        assert out["alt_talepler"][1]["yetkili_kurum_ad"].startswith("Ankara Su")
        assert out["insan_onayi_gerekli"] is True
        assert cagrilar[0]["dusunme_kapali"] is True
        assert "10000000146" not in cagrilar[0]["user"] and "Ayşe" not in cagrilar[0]["user"]

    async def test_model_basarisizsa_kaynak_dogrulandi_yok(self, monkeypatch):
        _llm_yaniti(monkeypatch, None)
        out = await ra.route_ajan(dict(_KECIOREN), {"hedef_birim": "ilgili_teknik_daire"})
        assert out["durum"] != "kaynak_dogrulandi"
        assert out["insan_onayi_gerekli"] is True
        assert out["hedef_birim"] is None
        assert out["yonlendirme"]["uretim"]["yedege_dustu"] is True
        assert "Model yanıtı alınamadı" in out["birim_reasoning"]

    async def test_listede_olmayan_kurum_dogrulanmadi_isaretlenir(self, monkeypatch):
        _llm_yaniti(monkeypatch, {"talepler": [
            {"id": "t1", "karar": "DISARIDA", "kurum": "", "kurum_adi": "Sulh Hukuk Mahkemesi"},
            {"id": "t2", "karar": "DISARIDA", "kurum": "K99999"},
        ]})
        out = await ra.route_ajan(dict(_KECIOREN), {"hedef_birim": "x"})
        t1, t2 = out["yonlendirme"]["talepler"]
        assert t1["alici_kurum"]["kaynak"] == "serbest_dogrulanmadi"
        assert t2["karar"] == "BELIRSIZ"   # uydurma kod → karar yok
        assert out["insan_onayi_gerekli"] is True

    async def test_valilikte_il_mudurlugu_bagli_birim_secilebilir(self, monkeypatch):
        state = {"evrak_turu": "sikayet", "bilgi_unsurlari": {"konu": "okul şikâyeti"},
                 "evrak_text": "T.C.\nANKARA VALİLİĞİNE\n\nÇocuğumun okulundaki öğretmen "
                               "hakkında şikâyetimi arz ederim."}
        muhatap = {"ad": "Ankara Valiliği", "slug": "ankara-valiligi", "tur": "valilik"}
        birimler = kurum_birimleri("ankara-valiligi", "okul", tur="valilik")
        birimler += ra._bagli_birimler(muhatap, kurum_adaylari(muhatap))
        mem = next(i for i, b in enumerate(birimler) if "Milli Eğitim" in b["birim_ad"])
        _llm_yaniti(monkeypatch, {"talepler": [
            {"id": "t1", "karar": "ICERIDE", "birim": f"B{mem + 1}"}]})
        out = await ra.route_ajan(state, {"hedef_birim": "x"})
        birim = out["yonlendirme"]["birim"]
        assert birim["bagli"] is True and "Milli Eğitim" in birim["ad"]
        assert out["insan_onayi_gerekli"] is True  # sicil kaydı doğrulanmış birim değildir


class TestServisBirim:
    def test_kelime_ici_eslesme_yok(self):
        assert oner_servis_birimi("İlkokulunun önündeki yol") is None or \
            "koku" not in (oner_servis_birimi("İlkokulunun önündeki yol") or {}).get("sinyal", [])

    async def test_belediye_disi_muhatapta_oneri_yok(self):
        from agents.nodes.servis_birim_oneri import servis_birim_oneri_node

        out = await servis_birim_oneri_node(
            {"evrak_text": "T.C.\nANKARA VALİLİĞİNE\n\nSokaktaki çukur ve asfalt bozuk."})
        assert out == {}


class TestYetkiEvalMock:
    async def test_mock_modda_yanlis_otomatik_havale_sifir(self):
        """CI bekçisi: modelsiz yol hiçbir belgede onaysız havale üretmez."""
        import json

        from eval.e2e_gercek_eval import GOLD
        from eval.yetki_eval import calistir

        satirlar = [json.loads(s) for s in GOLD.read_text(encoding="utf-8").splitlines()
                    if s.strip()][:12]
        sonuc = await calistir(satirlar)
        assert sonuc["metrikler"]["yanlis_otomatik_havale"]["k"] == 0
        assert sonuc["metrikler"]["yetki_yanlis_alarm"]["k"] == 0
