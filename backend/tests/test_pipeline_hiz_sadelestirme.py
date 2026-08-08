"""Kaliteyi koruyan pipeline hız sadeleştirmesi regresyon testleri."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agents import config
from agents.nodes import arsiv as arsiv_mod
from agents.nodes import finalize as finalize_mod
from agents.nodes import risk_guard as risk_mod
from agents.nodes import servis_birim_oneri as servis_mod
from yazi import yazi_render


async def _cagrilmamali(*args, **kwargs):
    raise AssertionError("Bu danışma LLM çağrısı artık kritik akışta çalışmamalı")


async def test_servis_onerisi_yalniz_deterministik(monkeypatch):
    monkeypatch.setattr(servis_mod, "SERVIS_BIRIM_LLM", True, raising=False)
    monkeypatch.setattr(servis_mod, "oner_servis_birimi_llm", _cagrilmamali, raising=False)

    sonuc = await servis_mod.servis_birim_oneri_node(
        {"evrak_text": "Sokaktaki çukurun asfaltla onarılması talebi."}
    )

    assert sonuc["servis_birimi"]["kod"] == "fen_isleri"


async def test_finalize_yalniz_deterministik_bildirim():
    # Finalize'ın LLM yolu TÜMÜYLE kaldırıldı — artık atlanabilir bir çağrı değil, hiç yok.
    # Bu yüzden guard davranışsal değil YAPISAL: modül bir LLM yardımcısı import ediyorsa
    # yol geri gelmiş demektir (sahte llm_text patch'lemek boş kapıydı; çağrılmayan bir
    # ismi patch'leyip "çağrılmadı" demek her hâlükârda geçerdi).
    assert not hasattr(finalize_mod, "llm_text")

    sonuc = await finalize_mod.finalize_node(
        {
            "evrak_turu": "dilekce",
            "hedef_birim": "yazi_isleri",
            "bilgi_unsurlari": {"konu": "Başvuru"},
            "eksik_alanlar": [],
            "mevzuat_onerileri": [],
        }
    )

    assert sonuc["bilgilendirme_yapisal"]["ne_oldu_kaynak"] == "sablon"
    assert sonuc["bilgilendirme"]


async def test_risk_aciklamasi_yalniz_deterministik(monkeypatch):
    monkeypatch.setattr(config, "RISK_ACIKLAMA_LLM", True)
    monkeypatch.setattr(risk_mod, "llm_json", _cagrilmamali)

    sonuc = await risk_mod.risk_guard_node(
        {
            "evrak_turu": "dilekce",
            "tur_confidence": 0.9,
            "eksik_alanlar": ["imza"],
            "verify_uyari": [],
            "yazi_taslak_md": "T.C. Sayı: 1 Konu: x. Gereğini arz ederim. Yetkili İmza",
        }
    )

    meta = sonuc["risk_metadata"]
    assert meta["bant"] == "sari"
    assert meta["aciklama"] == meta["oneri"]


async def test_sdp_tek_adayda_llm_cagrilmaz(monkeypatch):
    tek_aday = [{
        "kod": "622.03", "ad": "Bilgi Edinme", "skor": 1.5,
        "eslesen": ["bilgi edinme"], "tur_uyumu": True, "dogrula": False,
    }]
    monkeypatch.setattr(config, "SDP_LLM_SECICI", True)
    monkeypatch.setattr(arsiv_mod, "sdp_onerileri", lambda *args, **kwargs: tek_aday)
    monkeypatch.setattr(arsiv_mod, "real_llm", lambda: object())
    monkeypatch.setattr(arsiv_mod, "llm_json", _cagrilmamali)

    sonuc = await arsiv_mod._sdp_secimi(
        "bilgi_edinme", "", {"bilgi_unsurlari": {"konu": "bilgi edinme"}}
    )

    assert sonuc["kod"] == "622.03"


async def test_alt_talep_govdeleri_sinirli_paralel_uretilir(monkeypatch):
    etkin = 0
    en_cok_etkin = 0

    async def _govde(*args, **kwargs):
        nonlocal etkin, en_cok_etkin
        etkin += 1
        en_cok_etkin = max(en_cok_etkin, etkin)
        await asyncio.sleep(0.02)
        etkin -= 1
        return "gövde"

    monkeypatch.setattr(yazi_render, "build_body", _govde)
    monkeypatch.setattr(
        "yazi.renderer.render_yazi",
        lambda ctx: SimpleNamespace(metin=ctx.metin, format_uyumlu=True),
    )
    alt = [
        {"ozet": "bir", "birim_tr": "Birinci Birim"},
        {"ozet": "iki", "birim_tr": "İkinci Birim"},
        {"ozet": "üç", "birim_tr": "Üçüncü Birim"},
    ]

    sonuc = await yazi_render.build_alt_talep_taslaklari(alt, {})

    assert en_cok_etkin >= 2
    assert [x["ozet"] for x in sonuc] == ["bir", "iki", "üç"]


async def test_node_suresi_state_ve_sse_ozetine_tasinir():
    from agents.graph import _zamanli_node
    from api.routes.process_doc import _node_summary

    async def _node(state):
        await asyncio.sleep(0.01)
        return {"ozet": "tamam"}

    sonuc = await _zamanli_node("ozetle", _node)({})
    sure = sonuc["node_sureleri_ms"]["ozetle"]

    assert sure >= 5
    assert _node_summary("ozetle", sonuc)["duration_ms"] == sure
