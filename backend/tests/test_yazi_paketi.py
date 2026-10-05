"""Yazışma paketi (yazi/paket.py + yazi_taslak) — havale + cevap, devir + bilgi, tek SDP."""

from __future__ import annotations

from agents.nodes.arsiv import arsiv_node
from agents.nodes.risk_guard import compute_risk
from agents.nodes.yazi_taslak import yazi_taslak_node

DILEKCE = """T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Sokağımızdaki çukurun kapatılmasını talep ediyorum. Ayrıca sokak lambası yanmıyor,
onarılmasını ve su faturamın incelenmesini arz ederim.

02.10.2026

Ayşe Yılmaz
"""


def _state(**ek):
    s = {"evrak_turu": "dilekce", "evrak_text": DILEKCE,
         "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Yol çukuru ve aydınlatma"}}
    s.update(ek)
    return s


async def test_ayni_birime_dusen_talepler_tek_havalede_ve_vatandasa_cevap():
    alt = [
        {"id": "t1", "ozet": "Sokaktaki çukurun kapatılmasını talep ediyorum", "birim": "fen"},
        {"id": "t2", "ozet": "Sokak lambası onarımı", "birim": "fen"},
        {"id": "t3", "ozet": "Su faturası incelemesi", "birim": "mali_strateji_sgb"},
    ]
    yon = {"talepler": [
        {"talep_id": "t1", "birim": {"ad": "Fen İşleri Müdürlüğü"}},
        {"talep_id": "t2", "birim": {"ad": "Fen İşleri Müdürlüğü"}},
        {"talep_id": "t3", "birim": {"ad": "Mali Hizmetler Müdürlüğü"}}]}
    out = await yazi_taslak_node(_state(alt_talepler=alt, yonlendirme=yon))
    paket = out["yazi_paketi"]
    havaleler = [p for p in paket if p["rol"] == "havale"]
    assert [h["muhatap"] for h in havaleler] == [
        "FEN İŞLERİ MÜDÜRLÜĞÜNE", "MALİ HİZMETLER MÜDÜRLÜĞÜNE"]
    assert havaleler[0]["talep_ids"] == ["t1", "t2"]
    assert "Ayşe Yılmaz'ın 02.10.2026 tarihli dilekçesi." in havaleler[0]["yazi_taslak_md"]
    cevap = [p for p in paket if p["rol"] == "cevap"]
    assert len(cevap) == 1
    assert "Sayın Ayşe Yılmaz" in cevap[0]["yazi_taslak_md"]
    assert "02.10.2026 tarihli dilekçeniz." in cevap[0]["yazi_taslak_md"]
    # Geriye uyum: alt_talepler talep başına taslak taşır; tekil alan ilk havaledir.
    assert len(out["alt_talepler"]) == 3
    assert out["yazi_taslak_md"] == havaleler[0]["yazi_taslak_md"]
    for a in out["alt_talepler"]:
        assert "talep ediyorum" not in a["taslak_konu"]  # ham cümle konu olmaz (m.13)
        assert "EBYS-TASLAK" not in a["yazi_taslak_md"]  # Sayı SDP'li (tek motor)


async def test_devirde_yetkili_kuruma_yazi_ve_dilekce_sahibine_bilgi():
    st = _state(muhatap_kurum={"slug": "kecioren-belediyesi", "ad": "Keçiören Belediyesi"},
                yetkili_kurum={"slug": "aski", "ad": "Ankara Su ve Kanalizasyon İdaresi"})
    out = await yazi_taslak_node(st)
    roller = [p["rol"] for p in out["yazi_paketi"]]
    assert roller == ["devir", "devir_bilgi"]
    devir, bilgi = out["yazi_paketi"]
    assert "ANKARA SU VE KANALİZASYON İDARESİNE" in devir["yazi_taslak_md"]
    assert "Ayşe Yılmaz'ın 02.10.2026 tarihli dilekçesi." in devir["yazi_taslak_md"]
    assert "Sayın Ayşe Yılmaz" in bilgi["yazi_taslak_md"]
    assert "3071" in bilgi["yazi_taslak_md"]


async def test_sdp_tek_motor_taslak_ve_arsiv_ayni_kod():
    out = await yazi_taslak_node(_state())
    kod = out["ust_veri"].get("dosya_plani_kodu")
    assert kod and kod in out["yazi_taslak_md"]
    arsiv = await arsiv_node({**_state(), **out})
    assert arsiv["arsiv_metadata"]["sdp_kodu"].split(" ")[0] == kod


async def test_tek_talepli_paket_tek_cevap_ve_ilgi_dilekceniz():
    out = await yazi_taslak_node(_state())
    assert [p["rol"] for p in out["yazi_paketi"]] == ["cevap"]
    assert "02.10.2026 tarihli dilekçeniz." in out["yazi_taslak_md"]
    assert "KEÇİÖREN BELEDİYE" in out["yazi_taslak_md"].upper()


def test_jenerik_antet_en_az_sari():
    taslak = "T.C.\nKAMU KURUMU\nYazı İşleri Birimi\n\nSayı : 1\nKonu : X\n"
    sonuc = compute_risk([], format_uyumlu=True, eksik_alanlar=[], tur_confidence=0.99,
                         evrak_turu="dilekce", taslak=taslak)
    assert sonuc["bant"] == "sari"
    assert any("KAMU KURUMU" in g for g in sonuc["gerekceler"])
