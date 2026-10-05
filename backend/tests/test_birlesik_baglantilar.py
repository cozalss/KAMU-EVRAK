"""Akışlar arası bağlantılar (insa/birlesik) — T/Y/B/M sözleşmelerinin birbirine oturduğu yer.

Her test bir birleştirme sözleşmesini sabitler:
  * yazı gövdesi merkezi LLM katmanından geçer; kesik gövde taslağa GİRMEZ;
  * yazışma paketi Akış Y'nin GERÇEK ürettiği yönlendirme şeklini okur (KARMA/DISARIDA);
  * finalize bildirimi devirde 'havale edildi' değil 'gönderildi' der (3071 m.5 lafzı);
  * 4982 devir dayanağı korpustaki madde lafzıyla eşleşir.
"""

from __future__ import annotations

from pathlib import Path

from agents.llm import LLMResponse
from agents.yonlendirme import (
    alt_talepleri_zenginlestir,
    talep_karari,
    yonlendirme_kur,
)

KOK = Path(__file__).resolve().parents[2]


class _KesikLLM:
    """Her çağrıda yarım cümle + finish_reason=length döndüren sahte istemci."""

    def __init__(self) -> None:
        self.cagri = 0

    async def chat(self, messages, **_kw) -> LLMResponse:
        self.cagri += 1
        return LLMResponse(content="Başvurunuz incelenmiş olup ilgili birimce yerinde",
                           finish_reason="length")


async def test_kesik_yazi_govdesi_taslaga_girmez(monkeypatch) -> None:
    import agents.llm as llm_mod
    from yazi.yazi_render import build_body_sonuclu

    llm = _KesikLLM()
    monkeypatch.setattr(llm_mod, "get_llm", lambda: llm)
    sonuc = await build_body_sonuclu(
        "cevabi_yazi", {"konu": "Yol çukuru"}, "Çukurun kapatılmasını arz ederim.")
    assert llm.cagri >= 1                      # merkezi katman gerçekten çağırdı
    assert "yerinde" not in sonuc.metin        # yarım metin taslağa girmedi
    assert sonuc.mevzuat_kanit_durumu == "llm_bos"


# --- (a) yazışma paketi ← Akış Y'nin GERÇEK yönlendirme şekli ---------------------------

DILEKCE = """T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Sokağımızdaki çukurun kapatılmasını talep ediyorum. Ayrıca su faturamın yüksek
gelmesinin incelenmesini arz ederim.

02.10.2026

Ayşe Yılmaz
"""

ASKI = {"slug": "aski", "ad": "Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü",
        "tur": "su_kanalizasyon"}
DAYANAK = "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 5 inci maddesi"


def _karma_state() -> dict:
    """route_ajan'ın ürettiği şekil — agents.yonlendirme yardımcılarıyla kurulur (elle değil)."""
    kararlar = [
        talep_karari("t1", "ICERIDE", birim={"ad": "Fen İşleri Müdürlüğü",
                                             "kaynak_tipi": "kurum_ozel", "dogrulanmis": True},
                     dayanak=DAYANAK),
        talep_karari("t2", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK),
    ]
    yon = yonlendirme_kur(kararlar, gerekce="", uretim={"yol": "llm"}, dayanak=DAYANAK)
    alt = alt_talepleri_zenginlestir([
        {"id": "t1", "ozet": "Çukurun kapatılması", "konu": "Yol Çukurunun Kapatılması",
         "birim": "fen", "birim_tr": "İlgili Teknik Daire"},
        {"id": "t2", "ozet": "Su faturasının incelenmesi", "konu": "Su Faturası İncelemesi",
         "birim": "mali_strateji_sgb", "birim_tr": "Mali Hizmetler"},
    ], kararlar)
    return {"evrak_turu": "dilekce", "evrak_text": DILEKCE, "yonlendirme": yon,
            "alt_talepler": alt,
            "muhatap_kurum": {"slug": "kecioren-belediyesi", "ad": "Keçiören Belediyesi"},
            "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Yol çukuru ve su faturası"}}


async def test_karma_havale_ve_devir_ayni_pakette() -> None:
    from agents.nodes.yazi_taslak import yazi_taslak_node

    st = _karma_state()
    assert st["yonlendirme"]["karar"] == "KARMA"
    assert st["alt_talepler"][1]["birim_ad"].endswith("(devir)")  # gösterim metni
    out = await yazi_taslak_node(st)
    roller = [p["rol"] for p in out["yazi_paketi"]]
    assert roller == ["havale", "devir", "cevap"]
    havale, devir, cevap = out["yazi_paketi"]
    assert havale["muhatap"] == "FEN İŞLERİ MÜDÜRLÜĞÜNE" and havale["talep_ids"] == ["t1"]
    # Devir talebi kurum içi birime HAVALE edilmez; '(devir)' gösterim metni muhatap olmaz.
    assert "(DEVİR)" not in "".join(p["yazi_taslak_md"] for p in out["yazi_paketi"]).upper()
    assert devir["talep_ids"] == ["t2"]
    assert "ANKARA SU VE KANALİZASYON İDARESİ GENEL MÜDÜRLÜĞÜNE" in devir["yazi_taslak_md"]
    assert "5 inci maddesi gereğince" in devir["yazi_taslak_md"]
    metin = cevap["yazi_taslak_md"]
    assert "Sayın Ayşe Yılmaz" in metin
    assert "Fen İşleri Müdürlüğü" in metin and "gönderilmiştir" in metin
    # Alt talep çıktısı talep başına kendi yazısını taşır.
    assert out["alt_talepler"][1]["yazi_taslak_md"] == devir["yazi_taslak_md"]


async def test_karma_alt_talep_yoksa_yonlendirme_kararlarindan_kurulur() -> None:
    from agents.nodes.yazi_taslak import yazi_taslak_node

    st = _karma_state()
    st["bilgi_unsurlari"]["talep_kumesi"] = [
        {"id": "t1", "ozet": "Yol çukurunun kapatılması", "kanit": "çukurun kapatılması"},
        {"id": "t2", "ozet": "Su faturasının incelenmesi", "kanit": "su faturamın"}]
    st["alt_talepler"] = []
    out = await yazi_taslak_node(st)
    assert [p["rol"] for p in out["yazi_paketi"]] == ["havale", "devir", "cevap"]
    assert out.get("devir") is not True  # belgenin TAMAMI devredilmedi


async def test_disarida_tek_talep_butun_belge_devir_ve_bilgi() -> None:
    from agents.nodes.yazi_taslak import yazi_taslak_node

    kararlar = [talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK)]
    yon = yonlendirme_kur(kararlar, gerekce="", uretim={"yol": "llm"}, dayanak=DAYANAK)
    st = {**_karma_state(), "yonlendirme": yon, "alt_talepler": []}
    out = await yazi_taslak_node(st)
    assert [p["rol"] for p in out["yazi_paketi"]] == ["devir", "devir_bilgi"]


# --- (c) finalize bildirimi: devirde 'gönderildi', etkili_birim tek kaynak ----------------

def _madde(dosya: str, no: int) -> str:
    """Korpustaki madde metni (bir sonraki 'Madde N' başlığına kadar)."""
    import re

    metin = (KOK / "data" / "mevzuat" / dosya).read_text(encoding="utf-8")
    m = re.search(rf"^Madde {no} —.*?(?=^Madde \d+ —|\Z)", metin, re.MULTILINE | re.DOTALL)
    assert m, f"{dosya} m.{no} korpusta yok"
    return " ".join(m.group(0).split())


def test_3071_m5_lafzi_gonderilir_ve_bilgi_verilir() -> None:
    m5 = _madde("3071_dilekce_hakki_kanunu.txt", 5)
    assert "yetkili idari makama gönderilir" in m5
    assert "dilekçe sahibine de bilgi verilir" in m5


async def test_finalize_disarida_havale_degil_gonderildi() -> None:
    from agents.nodes.finalize import finalize_node

    kararlar = [talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK)]
    yon = yonlendirme_kur(kararlar, gerekce="", uretim={"yol": "llm"}, dayanak=DAYANAK)
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon,
                               "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz"}})
    ne_oldu = out["bilgilendirme_yapisal"]["ne_oldu"]
    assert "havale edildi" not in ne_oldu
    assert "yetkili makama (Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü) gönderildi" \
        in ne_oldu
    assert "5 inci maddesi gereğince" in ne_oldu
    adimlar = [a["adim"] for a in out["bilgilendirme_yapisal"]["sirada"]]
    assert "Sorumlu birime havale" not in adimlar
    assert adimlar[:2] == ["Yetkili makama gönderim", "Başvuru sahibine bilgi verilmesi"]
    # etkili_birim tek kaynak: referans birimi gösterim metniyle aynı
    assert out["bilgilendirme_yapisal"]["referans"]["birim"].endswith("(devir)")


async def test_finalize_karma_ic_havale_dis_gonderim() -> None:
    from agents.config import etkili_birim
    from agents.nodes.finalize import finalize_node

    st = _karma_state()
    out = await finalize_node(st)
    ne_oldu = out["bilgilendirme_yapisal"]["ne_oldu"]
    assert f"ilgili birime ({etkili_birim(st)}) havale edildi" in ne_oldu
    assert etkili_birim(st) == "Fen İşleri Müdürlüğü"
    assert "görev alanı dışındaki talepler" in ne_oldu and "gönderildi" in ne_oldu
    adimlar = [a["adim"] for a in out["bilgilendirme_yapisal"]["sirada"]]
    assert adimlar[:3] == ["Sorumlu birime havale", "Yetkili makama gönderim",
                           "Başvuru sahibine bilgi verilmesi"]


async def test_finalize_iceride_eski_metin_aynen() -> None:
    from agents.nodes.finalize import finalize_node

    kararlar = [talep_karari("t1", "ICERIDE", birim={"ad": "Fen İşleri Müdürlüğü"})]
    yon = yonlendirme_kur(kararlar, gerekce="", uretim={"yol": "llm"}, dayanak="")
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon})
    assert out["bilgilendirme_yapisal"]["ne_oldu"] == (
        "Evrak, Dilekçe olarak sınıflandırıldı ve ilgili birime (Fen İşleri Müdürlüğü) "
        "havale edildi.")


# --- (e) devir dayanakları korpusla eşleşir ---------------------------------------------

def test_devir_dayanaklari_korpustaki_madde_lafziyla_eslesir() -> None:
    from agents.config import EVRAK_TO_DEVIR_DAYANAK

    assert EVRAK_TO_DEVIR_DAYANAK["dilekce"].endswith("5 inci maddesi")
    # 4982 m.7 son cümlesi: başka yerde bulunan bilgi için dilekçe o kuruma GÖNDERİLİR.
    m7 = _madde("4982_bilgi_edinme_kanunu.txt", 7)
    assert "başvuru dilekçesi bu kurum ve kuruluşa gönderilir" in m7
    assert "durum ilgiliye yazılı bildirilir" in m7
    assert EVRAK_TO_DEVIR_DAYANAK["bilgi_edinme"] == (
        "4982 sayılı Bilgi Edinme Hakkı Kanununun 7 nci maddesi")


# --- (e) ölü yollar temizlendi ----------------------------------------------------------

def test_olu_decompose_bayraklari_ve_sdp_plani_yok() -> None:
    import importlib.util

    from agents import config

    assert not hasattr(config, "DECOMPOSE_KESIKTE_DUSUNMESIZ")
    assert not hasattr(config, "DECOMPOSE_CAPA_ESIGI")
    # SDP tek motor: arşiv seçimi (yazi_taslak da onu çağırır); ikinci seçici yok.
    assert importlib.util.find_spec("yazi.sdp_plani") is None


# --- (g) imza: ad-soyad VAR → doğrulanamadı (bilgi notu); ad-soyad YOK → eksik -----------

_PARK_ADLI = """KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Gazi Parkı'nda banklar kırık durumdadır. Bankların yenilenmesini rica ederim.

Ayşe Yılmaz
T.C. Kimlik No: 10000000146
Adres: Aktepe Mah. Gazi Cad. No:19 Keçiören/ANKARA
30.09.2026
"""
_PARK_ADSIZ = """KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Gazi Parkı'nda banklar kırık durumdadır. Bankların yenilenmesini rica ederim.

Adres: Aktepe Mah. Gazi Cad. No:19 Keçiören/ANKARA
30.09.2026
"""


async def _eksik(metin: str) -> tuple[dict, dict]:
    from agents.nodes.cikar import cikar_node
    from agents.nodes.eksik_tespit import eksik_tespit_node

    bu = (await cikar_node({"evrak_text": metin}))["bilgi_unsurlari"]
    out = await eksik_tespit_node({"bilgi_unsurlari": bu, "evrak_turu": "dilekce",
                                   "evrak_text": metin})
    return bu, out


async def test_imza_ad_soyad_varsa_dogrulanamadi_bilgi_notu() -> None:
    bu, out = await _eksik(_PARK_ADLI)
    assert bu["imza_durumu"] == "dogrulanamadi"
    assert "imza" not in out["eksik_alanlar"]
    assert any("doğrulanamadı" in n for n in out["eksik_bilgi_notlari"])


async def test_imza_kapanista_ad_soyad_yoksa_gercekten_eksik() -> None:
    bu, out = await _eksik(_PARK_ADSIZ)
    assert bu["imza_durumu"] == "yok"
    assert "imza" in out["eksik_alanlar"]
    assert not out["eksik_bilgi_notlari"]      # not değil, eksik
    assert any("imza bloğu" in s for s in out["clarify_questions"])


async def test_imza_kurum_hitabi_ve_ya_ile_biten_ad() -> None:
    from agents.nodes.cikar import _kapanista_ad_var

    assert not _kapanista_ad_var("Metin.\nKEÇİÖREN BELEDİYE BAŞKANLIĞINA", None)
    assert not _kapanista_ad_var("Metin.\nKeçiören Belediye Başkanlığı", None)
    assert _kapanista_ad_var("Metin.\nSelma Kaya", None)
    assert _kapanista_ad_var("Metin.\nAYŞE YILMAZ", None)


async def test_cimer_basvurusunda_imza_aranmaz() -> None:
    metin = ("T.C.\nETİMESGUT BELEDİYE BAŞKANLIĞI\n\nCİMER Başvuru No: 2026-0925-55130\n"
             "Başvuru Sahibi: Ayşe Yılmaz\n\nKaydırak kırık; değiştirilsin.\n")
    bu, out = await _eksik(metin)
    assert bu["imza_durumu"] == "var"
    assert "imza" not in out["eksik_alanlar"]


def test_altin_imza_beklentileri_duzeltildi_ve_eval_notu_olcer() -> None:
    import json

    from eval.e2e_gercek_eval import eksik_degerlendir

    gold = {}
    for satir in (KOK / "data" / "synthetic" / "e2e_gercek_gold.jsonl").read_text(
            encoding="utf-8").splitlines():
        kayit = json.loads(satir)
        gold[kayit["id"]] = kayit["beklenen"]
    assert "imza" not in gold["cimer_etimesgut_hayvan_park"]["eksikler"]
    park = gold["eksik_imza_kecioren_park"]
    assert park["eksikler"] == [] and park["eksik_notlari"] == ["imza_dogrulanamadi"]
    st = {"eksik_alanlar": [], "eksik_bilgi_notlari": [
        "İmza metinden doğrulanamadı: ıslak veya elektronik imzayı kontrol ediniz."]}
    assert eksik_degerlendir(st, park)["not_dogru"] is True
    assert eksik_degerlendir({"eksik_alanlar": []}, park)["not_dogru"] is False
