"""İçerik odaklı, talep bazlı, boş dönebilen mevzuat önerisi (mevzuat_mesele + mevzuat_yargic).

Teşhis 2026-10-05 "MEVZUAT ÖNERİSİ İLGİSİ": tür odaklı sorgu her dilekçeye 5690 m.1 / 5176
m.4'ü (gövdeden sıfır katkıyla) ve TBMM başvurusunu düzenleyen 3071 m.8'i öneriyordu. Bu
testler LLM'i sahte (deterministik) yanıtlarla değiştirir; geri getirme gerçek korpus üzerinde
koşar. Kapalı küme, boş sonuç ve fallback sözleşmeleri sabitlenir.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from agents import mevzuat_mesele, mevzuat_yargic
from agents.mevzuat_mesele import analiz_dogrula, katalog, talep_listesi
from agents.mevzuat_yargic import aday_havuzu, usul_onerileri, yargic_dogrula
from agents.nodes import _llm_extract
from agents.nodes.mevzuat_oner import mevzuat_oner_node

_KECIOREN = (
    "KEÇİÖREN BELEDİYE BAŞKANLIĞINA\nSokağımızda iki aydır büyük bir çukur bulunmakta, araçlar "
    "ve yayalar için tehlike oluşturmaktadır. Çukurun kapatılmasını talep ediyorum.\nAyrıca su "
    "faturam olağan tüketimimin çok üzerinde geldi. Sayacımın kontrol edilmesini ve fazla "
    "tahsil edilen tutarın iadesini arz ederim.\nAyşe Yılmaz\nTel: 0555-123-4567"
)


def _kecioren_state() -> dict[str, Any]:
    return {
        "evrak_turu": "dilekce",
        "evrak_text": _KECIOREN,
        "bilgi_unsurlari": {
            "konu": "Yol çukuru ve su faturası itirazı",
            "talep_kumesi": [
                {"id": "t1", "kanit": "Çukurun kapatılmasını talep ediyorum",
                 "ozet": "Sokaktaki çukurun kapatılması", "tur": "dilekce", "birim_ipucu": "fen"},
                {"id": "t2", "kanit": "fazla tahsil edilen tutarın iadesini arz ederim",
                 "ozet": "Su faturası itirazı", "tur": "dilekce", "birim_ipucu": "mali"},
            ],
        },
    }


_ANALIZ = {"talepler": [
    {"id": "t1", "mesele": "belediyenin yol ve kentsel altyapı bakım görevi",
     "terimler": ["kentsel altyapı", "yol", "belediye görev"], "dosyalar": ["5393_belediye_kanunu"]},
    {"id": "t2", "mesele": "su tüketim bedeli tarifesi ve sayaç itirazı",
     "terimler": ["su tarifesi", "abone", "sayaç"],
     "dosyalar": ["2560_iski_kurulus_kanunu", "uydurma_kanun_9999"]},
]}


def _sahte_llm(analiz: Any, yargic_secimi: Any, cagrilar: list[str] | None = None):
    """system istemine göre analiz ya da yargıç yanıtı döndüren sahte llm_json."""
    async def _llm_json(system: str, user: str, **kw: Any) -> Any:
        assert kw.get("dusunme_kapali") is True  # kapalı küme çağrıları düşünmesiz
        if cagrilar is not None:
            cagrilar.append(user)
        if "KATALOG" in system:
            return analiz
        girdi = json.loads(user)
        return yargic_secimi(girdi) if callable(yargic_secimi) else yargic_secimi
    return _llm_json


def _secici(girdi: dict[str, Any]) -> dict[str, Any]:
    """Gerçekçi yargıç: t1 → 5393 m.14, t2 → 2560'tan ilk aday."""
    secim = []
    for a in girdi["adaylar"]:
        if a["kaynak"] == "5393_belediye_kanunu" and a["baslik"].startswith("Madde 14"):
            secim.append({"talep": "t1", "no": a["no"], "gerekce": "belediye yol bakım görevi"})
    ilk_2560 = next(a for a in girdi["adaylar"] if a["kaynak"].startswith("2560_"))
    secim.append({"talep": "t2", "no": ilk_2560["no"], "gerekce": "su idaresi tarifesi"})
    return {"secim": secim}


@pytest.fixture
def gercek_llm_varmis(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(_llm_extract, "real_llm", lambda: object())

    def kur(analiz: Any, yargic: Any, cagrilar: list[str] | None = None) -> None:
        sahte = _sahte_llm(analiz, yargic, cagrilar)
        monkeypatch.setattr(mevzuat_mesele, "llm_json", sahte)
        monkeypatch.setattr(mevzuat_yargic, "llm_json", sahte)
    return kur


class TestTalepListesi:
    def test_talep_kumesi_oncelikli(self):
        talepler = talep_listesi(_kecioren_state())
        assert [t["id"] for t in talepler] == ["t1", "t2"]
        assert "çukur" in talepler[0]["metin"]

    def test_alt_talepler_sonra_talepler_sonra_konu(self):
        assert talep_listesi({"alt_talepler": [{"ozet": "A işi"}, {"ozet": "B işi"}]})[1] == {
            "id": "t2", "metin": "B işi"}
        assert talep_listesi({"bilgi_unsurlari": {"talepler": ["X"]}}) == [{"id": "t1", "metin": "X"}]
        assert talep_listesi({"bilgi_unsurlari": {"konu": "K"}}) == [{"id": "t1", "metin": "K"}]


class TestKapaliKume:
    def test_katalog_korpustan_uretilir(self):
        kat = katalog()
        assert "5393_belediye_kanunu" in kat and "3071_dilekce_hakki_kanunu" in kat
        assert len(kat) > 100

    def test_analiz_katalog_disi_anahtari_atar(self):
        sonuc = analiz_dogrula(_ANALIZ, {"t1", "t2"}, set(katalog()))
        assert sonuc is not None
        assert sonuc["t2"]["dosyalar"] == ["2560_iski_kurulus_kanunu"]

    def test_analiz_bozuk_yapi_none(self):
        assert analiz_dogrula({"x": 1}, {"t1"}, set(katalog())) is None
        assert analiz_dogrula(None, {"t1"}, set(katalog())) is None

    @pytest.mark.parametrize("secim", [
        [{"talep": "t1", "no": 99}], [{"talep": "t1", "no": True}],
        [{"talep": "t9", "no": 0}], [{"talep": "t1", "no": "0"}], ["çöp"],
    ])
    def test_yargic_tek_ihlal_tum_ciktiyi_reddeder(self, secim):
        assert yargic_dogrula({"secim": [{"talep": "t1", "no": 1}, *secim]}, {"t1"}, 5) is None

    def test_yargic_bos_secim_gecerli(self):
        assert yargic_dogrula({"secim": []}, {"t1", "t2"}, 5) == {"t1": [], "t2": []}


class TestAdayHavuzu:
    def test_secilen_dosyanin_ilgili_maddesi_havuzda(self):
        analiz = analiz_dogrula(_ANALIZ, {"t1", "t2"}, set(katalog()))
        havuz, _skor, _q = aday_havuzu(talep_listesi(_kecioren_state()), analiz)
        anahtarlar = {(c["kaynak_dosya"].removesuffix(".txt"), c.get("madde_no")) for c in havuz}
        assert ("5393_belediye_kanunu", 14) in anahtarlar
        assert any(d.startswith("2560_") for d, _ in anahtarlar)


class TestIcerikOdakliNode:
    async def test_kecioren_icerik_onerileri_ve_usul_katmani(self, gercek_llm_varmis):
        gercek_llm_varmis(_ANALIZ, _secici)
        out = await mevzuat_oner_node(_kecioren_state())
        oneriler = out["mevzuat_onerileri"]
        esas = [o for o in oneriler if o["katman"] == "esas"]
        usul = [o for o in oneriler if o["katman"] == "usul"]
        assert esas[0]["kaynak_dosya"] == "5393_belediye_kanunu" and esas[0]["talep_id"] == "t1"
        assert esas[1]["kaynak_dosya"].startswith("2560_") and esas[1]["talep_id"] == "t2"
        assert all(o["yargic"] for o in esas) and esas[0]["gerekce"]
        assert [u["baslik"] for u in usul] == ["3071 dilekce hakki kanunu m.4"]
        dosyalar = {o["kaynak_dosya"] for o in oneriler}
        assert not dosyalar & {"5690_cimer_cb_kararnamesi", "5176_etik_kurulu_kanunu"}
        assert out["mevzuat_bulunamadi"] is False

    async def test_llm_girdisi_maskeli(self, gercek_llm_varmis):
        cagrilar: list[str] = []
        gercek_llm_varmis(_ANALIZ, _secici, cagrilar)
        await mevzuat_oner_node(_kecioren_state())
        assert cagrilar and all("0555-123-4567" not in c for c in cagrilar)

    async def test_yargic_bos_donerse_bulunamadi_ve_dolgu_yok(self, gercek_llm_varmis):
        gercek_llm_varmis(_ANALIZ, {"secim": []})
        out = await mevzuat_oner_node(_kecioren_state())
        assert out["mevzuat_bulunamadi"] is True
        assert [o["katman"] for o in out["mevzuat_onerileri"]] == ["usul"]
        assert all(not d["bulundu"] for d in out["mevzuat_talep_durumu"])

    async def test_yargic_ihlalinde_yargicsiz_icerik_yedegi(self, gercek_llm_varmis):
        gercek_llm_varmis(_ANALIZ, {"secim": [{"talep": "t1", "no": 999}]})
        out = await mevzuat_oner_node(_kecioren_state())
        esas = [o for o in out["mevzuat_onerileri"] if o["katman"] == "esas"]
        assert esas and all(o["yargic"] is False for o in esas)
        assert out["mevzuat_bulunamadi"] is False

    async def test_analiz_basarisizsa_eski_bm25_yolu(self, gercek_llm_varmis):
        gercek_llm_varmis(None, {"secim": []})
        out = await mevzuat_oner_node(_kecioren_state())
        assert out["mevzuat_onerileri"] and "mevzuat_bulunamadi" not in out

    async def test_mock_modda_llm_yolu_denenmez(self, monkeypatch):
        async def patlar(*_a, **_k):
            raise AssertionError("mock modda LLM çağrılmamalı")
        monkeypatch.setattr(mevzuat_mesele, "llm_json", patlar)
        out = await mevzuat_oner_node(_kecioren_state())
        assert out["mevzuat_onerileri"]


class TestUsulKatmani:
    def test_dilekce_3071_m4(self):
        u = usul_onerileri("dilekce")
        assert [(o["kaynak_dosya"], o["madde_no"], o["katman"]) for o in u] == [
            ("3071_dilekce_hakki_kanunu", 4, "usul")]

    def test_dogrula_notlu_tur_usul_uretmez(self):
        assert usul_onerileri("muzekkere") == []


class TestKorpusLint:
    def test_kanun_no_madde_no_cakismasi_yakalanir(self):
        from scripts.seed_mevzuat import madde_kanun_cakismasi

        metin = "Yapı Ruhsatı\nİmar Kanunu, Kanun No 3194, RG 09.05.1985\n\nMadde 3194 — X"
        assert madde_kanun_cakismasi("y.txt", metin, [3194, 3194])
        assert madde_kanun_cakismasi("y.txt", metin, [21, 22]) == []

    def test_korpusta_madde_3194_kalmadi(self):
        from agents.nodes.mevzuat_oner import _load_index

        assert not [c for c in _load_index() if str(c.get("madde_no")) == "3194"]


class TestTuketiciler:
    """finalize 'dayanak' koşulu, zenginleştirme bandı, CRAG atlama."""

    async def test_finalize_yargicsiz_oneriyi_dayanak_diye_anmaz(self):
        from agents.nodes.finalize import finalize_node

        state = {"evrak_turu": "dilekce", "mevzuat_onerileri": [
            {"baslik": "5690 cimer m.1", "katman": "esas", "yargic": False},
            {"baslik": "3071 dilekce hakki kanunu m.4", "katman": "usul", "yargic": False}]}
        y = (await finalize_node(state))["bilgilendirme_yapisal"]
        assert "dayanak alınarak" not in y["ne_oldu"]
        assert y["referans"]["dayanak"] == []
        assert y["referans"]["usul"] == ["3071 dilekce hakki kanunu m.4"]

    async def test_finalize_yargictan_gecen_dayanak(self):
        from agents.nodes.finalize import finalize_node

        state = {"evrak_turu": "dilekce", "mevzuat_onerileri": [
            {"baslik": "5393 belediye kanunu m.14", "katman": "esas", "yargic": True}]}
        y = (await finalize_node(state))["bilgilendirme_yapisal"]
        assert "5393 belediye kanunu m.14 dayanak alınarak" in y["ne_oldu"]

    async def test_finalize_eski_yolda_dusuk_bant_dayanak_degil(self):
        from agents.nodes.finalize import finalize_node

        state = {"evrak_turu": "dilekce", "mevzuat_onerileri": [
            {"baslik": "3071 dilekce hakki kanunu m.8", "norm_score": 0.73}]}
        y = (await finalize_node(state))["bilgilendirme_yapisal"]
        assert y["referans"]["dayanak"] == []

    def test_zenginlestir_yargic_bandi(self):
        from api.mevzuat_zenginlestir import zenginlestir_mevzuat

        out = zenginlestir_mevzuat({"mevzuat_onerileri": [
            {"baslik": "a m.1", "norm_score": 0.2, "yargic": True, "katman": "esas",
             "talep_id": "t1", "gerekce": "g"},
            {"baslik": "b m.2", "norm_score": 5.0, "yargic": False, "katman": "esas"},
            {"baslik": "c m.4", "norm_score": 0.0, "yargic": False, "katman": "usul"}]})
        assert [o["guven"] for o in out] == ["orta", "düşük", "orta"]
        assert all(o["guven_isabet"] is None for o in out)
        assert out[0]["talep_id"] == "t1" and out[0]["gerekce"] == "g"
        assert out[2]["katman"] == "usul"

    async def test_crag_yargic_karar_verdiyse_atlar(self, monkeypatch):
        from agents.nodes import crag

        monkeypatch.setattr(crag, "CRAG_ENABLED", True)
        out = await crag.crag_node({"mevzuat_yargic_calisti": True, "mevzuat_onerileri": []})
        assert out == {"crag_corrected": False}
