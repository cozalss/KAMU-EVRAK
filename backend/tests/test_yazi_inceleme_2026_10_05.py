"""Resmî yazı — 2026-10-05 eleştirel inceleme bulgularının regresyon kilitleri (Grup 3).

* KVKK: yazı LLM yolları (gövde · plan · revize · lint düzeltme · grounding) ham TCKN /
  telefon / kişi adı GÖNDERMEZ; belge metni dönen yolda belirteç asıl değere geri döner.
* SDP: gelen evrakın sayısındaki kod karşı kurumundur, giden Sayı satırına girmez.
* Antet (Yön. m.10): sabit 'Yazı İşleri Birimi' yok; doğrulanmamış birim yok; il/ilçe
  teşkilatı 'VALİLİK / İl … Müdürlüğü'; 'Dağıtım Yerleri' kurum değildir.
* m.18: 'ilişikte gönderilmiştir' diyen yazıda Ek bölümü; yoksa lint uyarır.
* m.16: yargı merciine 'Bilgilerinize arz ederim'; talimat kipi lint'e takılır.
* Havale: 2. şahıs sızıntısı lint'te; ilgi dilekçeye 'İlgi yazı' denmez; talep içeriği
  başka havaleye taşınmaz.
* m.15: Soruşturma No ilgi sayısıdır; kurum yazısı ilgisi sayısızsa uyarı.
* /yazi/taslak-turu: evrak türü pipeline'dan gelir, Sayı satırı 000'a düşmez.

PII sentetik/sahtedir (CLAUDE.md §2).
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

_TCKN = "12345678901"
_TEL = "0532 111 22 33"
_AD = "Ayşe Yılmaz"
_DILEKCE = (
    "ÇANKAYA BELEDİYE BAŞKANLIĞINA\n\n"
    f"Sokağımızdaki çukurun onarılmasını arz ederim. TCKN: {_TCKN} Tel: {_TEL}\n\n"
    f"02.06.2026\n{_AD}\n"
)


def _pii_yok(metin: str) -> None:
    assert _TCKN not in metin
    assert _TEL.replace(" ", "") not in metin.replace(" ", "")
    assert "Yılmaz" not in metin and "YILMAZ" not in metin


def _gercek_llm_gibi(monkeypatch: pytest.MonkeyPatch) -> None:
    import agents.llm as llm_mod

    monkeypatch.setattr(llm_mod, "get_llm", lambda: object())


# ------------------------------------------------------------------ KVKK
class TestYaziLlmPii:
    async def test_govde_llm_maskeli_gider_cikti_geri_yuklenir(self, monkeypatch):
        import agents.nodes._llm_extract as ex
        from yazi.yazi_render import build_body_sonuclu

        _gercek_llm_gibi(monkeypatch)
        kayit: dict[str, str] = {}

        async def fake(system, user, **kw):
            kayit["user"] = user
            return "Başvuru sahibi [KİŞİ-1] talebi birime iletilmiştir."

        monkeypatch.setattr(ex, "llm_text", fake)
        sonuc = await build_body_sonuclu(
            "cevabi_yazi", {"konu": "Çukur onarımı", "gonderen": _AD}, _DILEKCE)
        _pii_yok(kayit["user"])
        assert _AD in sonuc.metin  # belirteç yerelde asıl değere döndü

    async def test_kurum_gonderen_adi_maskelenmez(self, monkeypatch):
        import agents.nodes._llm_extract as ex
        from yazi.yazi_render import build_body_sonuclu

        _gercek_llm_gibi(monkeypatch)
        kayit: dict[str, str] = {}

        async def fake(system, user, **kw):
            kayit["user"] = user
            return "İlgi yazı ile istenilen bilgiler hazırlanmaktadır."

        monkeypatch.setattr(ex, "llm_text", fake)
        await build_body_sonuclu("cevabi_yazi", {"gonderen": "Ankara Valiliği"},
                                 "ANKARA VALİLİĞİ yazısı")
        assert "ANKARA VALİLİĞİ" in kayit["user"]

    async def test_yazi_plani_ad_maskeli(self, monkeypatch):
        import yazi.yazi_plan as plan

        kayit: dict[str, str] = {}

        async def fake(**kw):
            kayit["user"] = kw["user"]
            return None

        monkeypatch.setattr(plan, "real_llm", lambda: object())
        monkeypatch.setattr(plan, "llm_json", fake)
        await plan.yazi_plani("dilekce", {"konu": "Çukur", "gonderen": _AD}, _DILEKCE, "")
        _pii_yok(kayit["user"])

    async def test_revize_maskeli_gider_geri_yuklenir(self, monkeypatch):
        import yazi.yazi_render as yr

        taslak = (f"T.C.\nÇANKAYA BELEDİYESİ\n\nKonu : Çukur\n\n          Sayın {_AD}\n\n"
                  f"İlgi : 02.06.2026 tarihli dilekçeniz.\n\nTCKN {_TCKN} başvurunuz "
                  "alınmıştır. Konu ilgili birime iletilmiştir.\n")
        kayit: dict[str, str] = {}

        async def fake(system, user, **kw):
            kayit["user"] = user
            return user.split("TASLAK:\n", 1)[1].split("\n\nREVİZYON", 1)[0] + "Ek cümle."

        monkeypatch.setattr(yr, "llm_text", fake)
        out = await yr.revize_taslak(taslak, "Bir cümle ekle")
        _pii_yok(kayit["user"])
        assert out is not None and f"Sayın {_AD}" in out and _TCKN in out

    async def test_lint_duzeltme_ve_grounding_maskeli(self, monkeypatch):
        import agents.nodes.verify as v

        cagrilar: list[str] = []

        async def fake(system, user, **kw):
            cagrilar.append(user)
            return None

        monkeypatch.setattr(v, "llm_json", fake)
        taslak = f"T.C.\nX\n\n          Sayın {_AD}\n\nTCKN {_TCKN} tel {_TEL}\n"
        state = {"evrak_text": _DILEKCE, "bilgi_unsurlari": {"gonderen": _AD}}
        await v._lint_autofix(taslak, {"uyari": ["x"]}, state)
        await v._grounding_iddialar(taslak, state)
        assert len(cagrilar) == 2
        for user in cagrilar:
            _pii_yok(user)


# ------------------------------------------------------------------ SDP
class TestSdp:
    async def test_gelen_sayidaki_kod_giden_sayiya_kopyalanmaz(self):
        from agents.nodes.arsiv import sdp_secimi_yap

        secim = await sdp_secimi_yap(
            "resmi_yazi", "E-99887766-205.99-5512345",
            {"bilgi_unsurlari": {"konu": "Maaş haczi bilgi talebi"}})
        assert not secim["kod"].startswith("205.99")
        assert secim["karsi_kurum_kodu"] == "205.99"


# ------------------------------------------------------------------ antet m.10
class TestAntet:
    @pytest.mark.parametrize(("idare", "beklenen"), [
        ("Ankara İl Sağlık Müdürlüğü", ("ANKARA VALİLİĞİ", "İl Sağlık Müdürlüğü")),
        ("ÇANKAYA İLÇE MİLLÎ EĞİTİM MÜDÜRLÜĞÜ",
         ("ÇANKAYA KAYMAKAMLIĞI", "İlçe Millî Eğitim Müdürlüğü")),
        ("KONYA VALİLİĞİ İL BASIN VE HALKLA İLİŞKİLER MÜDÜRLÜĞÜ",
         ("KONYA VALİLİĞİ", "İl Basın ve Halkla İlişkiler Müdürlüğü")),
        ("ANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜ", ("ANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜ", "")),
        ("ÇANKAYA TAPU MÜDÜRLÜĞÜ", ("ÇANKAYA TAPU MÜDÜRLÜĞÜ", "")),
    ])
    def test_il_ilce_teskilati_m10_3(self, idare, beklenen):
        from yazi.baslik import antet_m10

        assert antet_m10(idare, "") == beklenen

    def test_il_teskilati_antete_valilik_olarak_basilir(self):
        from yazi.renderer import render_yazi
        from yazi.yazi_render import build_context

        md = render_yazi(build_context(
            "cevabi_yazi", {"konu": "Aşı", "gonderen": _AD}, "gövde",
            idare_adi="Ankara İl Sağlık Müdürlüğü"), formats=frozenset()).metin
        satirlar = [s.strip() for s in md.splitlines()[:4]]
        assert satirlar[:3] == ["T.C.", "ANKARA VALİLİĞİ", "İl Sağlık Müdürlüğü"]

    def test_birim_bilinmiyorsa_satir_basilmaz(self):
        from yazi.renderer import render_yazi
        from yazi.yazi_render import build_context

        md = render_yazi(build_context(
            "cevabi_yazi", {"konu": "Çukur", "gonderen": _AD}, "gövde",
            idare_adi="Çankaya Tapu Müdürlüğü"), formats=frozenset()).metin
        assert "Yazı İşleri Birimi" not in md and "{{" not in md
        assert md.splitlines()[2].strip() == ""  # T.C. / idare / boş satır / Sayı

    def test_dogrulanmamis_birim_antete_girmez(self):
        from agents.nodes.yazi_taslak import _hazirlayan_birim

        yon = {"karar": "ICERIDE", "birim": {"ad": "Fen İşleri Müdürlüğü",
                                             "dogrulanmis": False}}
        assert _hazirlayan_birim({"yonlendirme": yon, "durum": "oneri"}, "cevabi_yazi") == ""
        assert _hazirlayan_birim(
            {"servis_birimi": {"ad": "Fen İşleri Müdürlüğü"}}, "cevabi_yazi") == ""

    def test_dogrulanmis_ic_birim_antete_girer_kategori_girmez(self):
        from agents.nodes.yazi_taslak import _hazirlayan_birim

        yon = {"karar": "ICERIDE", "birim": {"ad": "Fen İşleri Müdürlüğü",
                                             "dogrulanmis": True}}
        st = {"yonlendirme": yon, "durum": "kaynak_dogrulandi"}
        assert _hazirlayan_birim(st, "cevabi_yazi") == "Fen İşleri Müdürlüğü"
        assert _hazirlayan_birim(st, "ust_yazi") == ""
        kat = {"karar": "ICERIDE", "birim": {"ad": "İl/İlçe Sağlık Müdürlüğü",
                                             "dogrulanmis": True}}
        assert _hazirlayan_birim({"yonlendirme": kat, "durum": "kaynak_dogrulandi"},
                                 "cevabi_yazi") == ""

    def test_dagitim_yerleri_kurum_sayilmaz(self):
        from agents.nodes.yazi_taslak import _idare_coz

        st = {"muhatap_kurum": {"ad": "Dağıtım Yerleri", "slug": "dagitim-yerleri"}}
        assert _idare_coz(st, "Genelge metni", {}) == ""
        st_ok = {"muhatap_kurum": {"ad": "Keçiören Kaymakamlığı", "slug": "kecioren"}}
        assert _idare_coz(st_ok, "Genelge metni", {}) == "Keçiören Kaymakamlığı"


# ------------------------------------------------------------------ m.18 / m.16 / üslup
def _kural(md: str, tur: str, ad: str) -> dict[str, Any] | None:
    from agents.yazi_lint import lint_2646

    return next((k for k in lint_2646(md, tur)["kurallar"] if k["kural"] == ad), None)


class TestEkKapanisUslup:
    def test_havale_yazisinda_ek_bolumu_ve_ilgi_cinsi(self):
        from yazi.renderer import render_yazi
        from yazi.yazi_render import build_context

        gelen = {"belge_cinsi": "dilekce", "gonderen_turu": "gercek_kisi",
                 "gonderen_ad": _AD, "tarih": "02.06.2026"}
        metin = ("İlgi yazı ile çukur onarımı istenilmektedir. Söz konusu yazı, gereği "
                 "yapılmak üzere ilişikte gönderilmiştir.")
        md = render_yazi(build_context(
            "ust_yazi", {"konu": "Çukur onarımı"}, metin, muhatap_override="FEN İŞLERİ "
            "MÜDÜRLÜĞÜNE", rol="havale", gelen=gelen), formats=frozenset()).metin
        assert "İlgi dilekçe ile" in md and "Söz konusu dilekçe" in md
        assert "Ek :" in md and "Dilekçe örneği" in md
        assert _kural(md, "ust_yazi", "L-M18-ek")["durum"] == "gecti"

    def test_ilisikte_diyen_ek_bolumsuz_yazi_uyari(self):
        md = ("T.C.\nX\nSayı : 1\nKonu : Y\n\nZ MÜDÜRLÜĞÜNE\n\n"
              "Başvuru ilişikte gönderilmiştir.\n")
        assert _kural(md, "ust_yazi", "L-M18-ek")["durum"] == "uyari"

    def test_yargi_merciine_bilgi_kapanisi(self):
        from yazi.yazi_render import build_context

        ctx = build_context("cevabi_yazi", {"konu": "Tedbir"}, "gövde",
                            muhatap_override="ANKARA 3. İDARE MAHKEMESİNE")
        assert ctx.kapanis == "Bilgilerinize arz ederim."

    def test_yargi_merciine_talimat_kipi_lint(self):
        md = ("T.C.\nX\nSayı : 1\nKonu : Y\n\nANKARA CUMHURİYET BAŞSAVCILIĞINA\n\nİlgi "
              "yazınız ilgili birime iletilmiştir. Sonucun bildirilmesi gerekmektedir.\n\n"
              "Gereğini rica ederim.\n")
        assert _kural(md, "cevabi_yazi", "L-USLUP-yargi-talimat")["durum"] == "uyari"

    def test_ust_yazida_ikinci_sahis_lint_makam_iyeligi_haric(self):
        md = ("T.C.\nX\nSayı : 1\nKonu : Y\n\nNÜFUS MÜDÜRLÜĞÜNE\n\nİlgi : dilekçe.\n\n"
              "İlgi dilekçe ile kızınızın pasaport işlemi istenilmektedir. Müdürlüğünüzce "
              "gereği rica olunur.\n")
        k = _kural(md, "ust_yazi", "L-USLUP-ikinci-sahis")
        assert k and "kızınızın" in k["mesaj"] and "Müdürlüğünüzce" not in k["mesaj"]

    def test_as_muhatabi_yonelme_eki(self):
        from agents.kurum_kimlik import _hitap_idempotent, hitap_eki

        assert hitap_eki("Başkent Elektrik Dağıtım A.Ş.") == "BAŞKENT ELEKTRİK DAĞITIM A.Ş.NE"
        assert _hitap_idempotent("BAŞKENT ELEKTRİK DAĞITIM A.Ş.NE").endswith("A.Ş.NE")


# ------------------------------------------------------------------ çok talep / ilgi
class TestPaketVeIlgi:
    def test_grup_konusu_yalniz_kendi_talepleri(self):
        from yazi.paket import grup_konusu

        assert grup_konusu([{"konu": "Kayıt dondurma"}]) == "Kayıt dondurma"
        assert grup_konusu([{"konu": "Şap aşısı"}, {"ozet": "Mera tahsisi"},
                            {"konu": "Şap aşısı"}]) == "Şap aşısı ve Mera tahsisi"

    async def test_havale_konusu_belge_konusuna_donmez(self):
        from yazi.paket import havale_paketi

        talepler = [
            {"id": "t1", "ozet": "Kayıt dondurma", "konu": "Kayıt dondurma",
             "yonlendirme": {"karar": "ICERIDE", "birim": {"ad": "Öğrenci İşleri Daire "
                                                                  "Başkanlığı"}}},
            {"id": "t2", "ozet": "Kütüphane kartı", "konu": "Kütüphane kartı",
             "yonlendirme": {"karar": "ICERIDE", "birim": {"ad": "Kütüphane ve "
                                                                  "Dokümantasyon Daire "
                                                                  "Başkanlığı"}}},
        ]
        unsur = {"konu": "Kayıt dondurma ve yurt burs işlemleri", "gonderen": _AD}
        _alt, paket = await havale_paketi(talepler, unsur, gelen={"belge_cinsi": "dilekce"})
        havaleler = [p for p in paket if p["rol"] == "havale"]
        assert havaleler and all("yurt" not in p["konu"].lower() for p in havaleler)

    def test_sorusturma_no_ilgi_sayisidir(self):
        from yazi.gelen_evrak import etiketli_sayi

        metin = "T.C.\nANKARA CUMHURİYET BAŞSAVCILIĞI\nSoruşturma No : 2026/88123\n"
        assert etiketli_sayi(metin) == "2026/88123 Soruşturma"

    def test_kurum_yazisi_ilgisi_sayisizsa_uyari(self):
        md = ("T.C.\nX\nSayı : 1\nKonu : Y\n\nANKARA VALİLİĞİNE\n\n"
              "İlgi : 29.09.2026 tarihli yazınız.\n\nGövde.\n\nBilgilerinize arz ederim.\n")
        assert _kural(md, "cevabi_yazi", "L-M15-ilgi")["durum"] == "uyari"
        md_dilekce = md.replace("yazınız", "dilekçeniz")
        assert _kural(md_dilekce, "cevabi_yazi", "L-M15-ilgi")["durum"] == "bilgi"


# ------------------------------------------------------------------ /yazi/taslak-turu
@pytest.fixture(scope="module")
def client():
    from main import app

    with TestClient(app) as c:
        yield c


class TestTaslakTuruSdp:
    def test_evrak_turu_sayi_satirina_tasinir(self, client):
        # İçerikte katalog anahtarı yok → kod yalnız türden gelir (tür taşınmazsa 000).
        govde = {"evrak_text": "Talebimin değerlendirilmesini arz ederim.",
                 "yazi_turu": "cevabi_yazi",
                 "bilgi_unsurlari": {"konu": "Talep", "gonderen": _AD}}
        bos = client.post("/yazi/taslak-turu", json=govde).json()["yazi_taslak_md"]
        dolu = client.post("/yazi/taslak-turu",
                           json={**govde, "evrak_turu": "bilgi_edinme"}).json()["yazi_taslak_md"]
        assert "-000-" in next(s for s in bos.splitlines() if s.startswith("Sayı"))
        assert "-622.03-" in next(s for s in dolu.splitlines() if s.startswith("Sayı"))

    def test_kapali_kume_disi_tur_belirsiz_sayilir(self, client):
        r = client.post("/yazi/taslak-turu", json={
            "evrak_text": "metin", "yazi_turu": "cevabi_yazi", "evrak_turu": "uydurma_tur"})
        assert r.status_code == 200
