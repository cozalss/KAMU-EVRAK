"""Onay / risk / bildirim dürüstlüğü — 2026-10-05 incelemesinin regresyon kilitleri.

İlke: otomatik ilerleme YALNIZ tüm talepler ICERIDE + her birim doğrulanmış + diğer
sinyaller temizken. Aksi hâlde bant en az SARI (onay kapısı) ve bildirim gerçek durumu söyler
("onay bekliyor"), koşmayan adım "tamam" sayılmaz. Tümü mock/saf — LLM yok.
"""
from __future__ import annotations

from agents import risk_agirlik as ra
from agents.graph import _risk_route
from agents.nodes.finalize import finalize_node
from agents.nodes.risk_guard import compute_risk, risk_guard_node
from agents.yonlendirme import talep_karari, yonlendirme_kur

DAYANAK = "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 5 inci maddesi"
ASKI = {"slug": "aski", "ad": "Ankara Su ve Kanalizasyon İdaresi Genel Müdürlüğü",
        "tur": "su_kanalizasyon", "kaynak": "sicil"}
FEN = {"ad": "Fen İşleri Müdürlüğü", "kaynak_tipi": "kurum_ozel", "dogrulanmis": True}
FEN_DOGRULANMAMIS = {"ad": "Fen İşleri Müdürlüğü", "kaynak_tipi": "kategori",
                     "dogrulanmis": False}
LLM = {"yol": "llm"}


def _risk(yon=None, **kw):
    """Diğer bütün sinyaller temiz bir taslak için compute_risk."""
    temel = dict(format_uyumlu=True, eksik_alanlar=[], tur_confidence=0.95,
                 evrak_turu="dilekce", taslak="T.C.\nKEÇİÖREN BELEDİYESİ\nTemiz gövde.")
    temel.update(kw)
    return compute_risk([], yonlendirme=yon, **temel)


def _yon(*kararlar, uretim=LLM):
    return yonlendirme_kur(list(kararlar), gerekce="", uretim=uretim, dayanak=DAYANAK)


# --- yonlendirme_kur: otomatik havale talep başına sınanır --------------------------------

def test_belirsiz_talep_otomatik_havaleyi_engeller():
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN), talep_karari("t2", "BELIRSIZ"))
    assert yon["karar"] == "ICERIDE"            # belge kararı BELIRSIZ'i yutar …
    assert yon["insan_onayi_gerekli"] is True   # … ama otomatik havale YOK


def test_ikinci_talep_dogrulanmamis_birimde_otomatik_havale_yok():
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN),
               talep_karari("t2", "ICERIDE", birim=FEN_DOGRULANMAMIS))
    assert yon["insan_onayi_gerekli"] is True


def test_tum_talepler_icerde_ve_dogrulanmis_ise_otomatik():
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN), talep_karari("t2", "ICERIDE", birim=FEN))
    assert yon["insan_onayi_gerekli"] is False


# --- compute_risk: bant ile yönlendirme çelişemez -----------------------------------------

def test_temiz_ve_otomatik_yonlendirme_yesil_kalir():
    meta = _risk(_yon(talep_karari("t1", "ICERIDE", birim=FEN)))
    assert meta["bant"] == "yesil"
    assert _risk_route({"risk_metadata": meta}) == "arsiv"


def test_devir_yesil_olamaz_ve_onay_kapisina_gider():
    meta = _risk(_yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK)))
    assert meta["bant"] == "sari"
    assert any("devir önerisi" in g for g in meta["gerekceler"])
    assert "onaylamanıza gerek yok" not in meta["oneri"]
    assert _risk_route({"risk_metadata": meta}) == "onay_kapisi"


def test_sicilde_olmayan_devir_alicisi_kirmizi():
    serbest = {"slug": "serbest-kooperatif", "ad": "Serbest Kooperatif",
               "kaynak": "serbest_dogrulanmadi"}
    meta = _risk(_yon(talep_karari("t1", "DISARIDA", alici_kurum=serbest, dayanak=DAYANAK)))
    assert meta["bant"] == "kirmizi"
    assert meta["gerekceler"][0].startswith("Yetkili kurum sicilde doğrulanmadı: Serbest")
    assert "kurum kayıtlarımızda doğrulanamadı" in meta["oneri"]
    assert "evrakta bulunmayan" not in meta["oneri"]   # uydurma uyarısı karışmaz


def test_belirsiz_talep_sari():
    meta = _risk(_yon(talep_karari("t1", "ICERIDE", birim=FEN), talep_karari("t2", "BELIRSIZ")))
    assert meta["bant"] == "sari"
    assert any("belirlenemeyen talep" in g for g in meta["gerekceler"])


def test_dogrulanmamis_birim_sari():
    meta = _risk(_yon(talep_karari("t1", "ICERIDE", birim=FEN_DOGRULANMAMIS)))
    assert meta["bant"] == "sari"
    assert any("havale birimi kaynakta doğrulanmadı" in g for g in meta["gerekceler"])


def test_insan_onayi_bayragi_tek_basina_sari():
    """Deterministik yedek yol: birim doğrulanmış ama model karar vermedi → onay."""
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN), uretim={"yol": "deterministik"})
    assert yon["insan_onayi_gerekli"] is True
    meta = _risk(yon)
    assert meta["bant"] == "sari"
    assert any("otomatik havale koşulları sağlanmadı" in g for g in meta["gerekceler"])


def test_yonlendirme_yoksa_iddia_uretilmez():
    assert _risk(None)["bant"] == "yesil"


def test_imza_dogrulanamadi_notu_sari():
    notu = ("İmza metinden doğrulanamadı: ıslak veya elektronik imzayı asıl evrak üzerinde "
            "kontrol ediniz (3071 sayılı Kanun m.4; imzasız dilekçe m.6/c uyarınca incelenemez).")
    meta = _risk(_yon(talep_karari("t1", "ICERIDE", birim=FEN)), eksik_notlari=[notu])
    assert meta["bant"] == "sari"
    assert any(g.startswith("Asıl evrak kontrolü:") for g in meta["gerekceler"])


def test_yargi_icra_yazismasi_sari():
    temiz_yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN))
    assert _risk(temiz_yon, evrak_turu="muzekkere")["bant"] == "sari"
    assert _risk(temiz_yon, evrak_turu="cevabi_yazi",
                 gelen_evrak={"belge_cinsi": "icra_yazisi"})["bant"] == "sari"
    assert _risk(temiz_yon, evrak_turu="cevabi_yazi",
                 gelen_evrak={"belge_cinsi": "resmi_yazi"})["bant"] == "yesil"


def test_yeni_gerekce_tipleri_taksonomide():
    assert ra.gerekce_tipi("Yönlendirme: görev alanı dışı — X") == ra.YONLENDIRME_ONAY
    assert ra.gerekce_tipi("Yetkili kurum sicilde doğrulanmadı: X") == ra.DEVIR_DOGRULANMADI
    assert ra.gerekce_tipi("Asıl evrak kontrolü: imza") == ra.ASIL_EVRAK_KONTROLU
    assert ra.gerekce_tipi("Yargı/icra yazışması: x") == ra.YARGI_ICRA_YAZISMASI
    assert ra.isabet(ra.YONLENDIRME_ONAY) == (1.0, ra.GOZLEM_DURUM)


async def test_risk_guard_node_state_yonlendirmesini_okur():
    yon = _yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK))
    out = await risk_guard_node({"yonlendirme": yon, "evrak_turu": "dilekce",
                                 "tur_confidence": 0.95, "yazi_taslak_md": "Temiz gövde."})
    assert out["risk_metadata"]["bant"] == "sari"


# --- finalize: bildirim gerçek duruma bağlı -----------------------------------------------

async def test_devir_onay_beklerken_gonderildi_demez():
    yon = _yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK))
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon})
    y = out["bilgilendirme_yapisal"]
    assert "gönderildi" not in y["ne_oldu"]
    assert "devir için memur onayı bekliyor" in y["ne_oldu"]
    assert y["durum_etiket"] == "Devir için memur onayı bekliyor"
    gonderim = next(a for a in y["sirada"] if a["adim"] == "Yetkili makama gönderim")
    assert gonderim["durum"] == "bekliyor"


async def test_ic_havale_onay_beklerken_havale_edildi_demez():
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN_DOGRULANMAMIS))
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon})
    y = out["bilgilendirme_yapisal"]
    assert "havale edildi" not in y["ne_oldu"]
    assert "havale edilmesi önerildi; memur onayı bekliyor" in y["ne_oldu"]
    assert y["sirada"][0] == {"adim": "Sorumlu birime havale", "detay": "Fen İşleri Müdürlüğü",
                              "durum": "bekliyor"}


async def test_sari_bant_yonlendirme_otomatik_olsa_da_bekliyor():
    yon = _yon(talep_karari("t1", "ICERIDE", birim=FEN))
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon,
                               "risk_metadata": {"bant": "sari"}})
    assert out["bilgilendirme_yapisal"]["sirada"][0]["durum"] == "bekliyor"


async def test_reddedilen_devir_gonderildi_demez():
    yon = _yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK))
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon,
                               "onay_durumu": "reddedildi", "yazi_taslak_md": "x"})
    y = out["bilgilendirme_yapisal"]
    assert "gönderildi" not in y["ne_oldu"] and "reddedildi" in y["ne_oldu"]
    assert "reddedildi" in out["bilgilendirme"]


async def test_kurum_yazisinda_basvuru_sahibi_denmez():
    yon = _yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK))
    gelen = {"belge_cinsi": "resmi_yazi", "gonderen_turu": "kamu_idaresi"}
    out = await finalize_node({"evrak_turu": "cevabi_yazi", "yonlendirme": yon,
                               "onay_durumu": "onaylandı",
                               "bilgi_unsurlari": {"gelen_evrak": gelen}})
    metin = out["bilgilendirme"]
    assert "başvuru sahibi" not in metin.lower()
    assert "gönderen idareye ayrıca bilgi verilecek" in metin
    adimlar = [a["adim"] for a in out["bilgilendirme_yapisal"]["sirada"]]
    assert "Gönderen idareye bilgi verilmesi" in adimlar


async def test_vatandas_dilekcesinde_basvuru_sahibi_korunur():
    yon = _yon(talep_karari("t1", "DISARIDA", alici_kurum=ASKI, dayanak=DAYANAK))
    gelen = {"belge_cinsi": "dilekce", "gonderen_turu": "gercek_kisi"}
    out = await finalize_node({"evrak_turu": "dilekce", "yonlendirme": yon,
                               "onay_durumu": "onaylandı",
                               "bilgi_unsurlari": {"gelen_evrak": gelen}})
    assert "başvuru sahibine ayrıca bilgi verilecek" in out["bilgilendirme"]
