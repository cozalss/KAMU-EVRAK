"""Mevzuat RAG kanıt paketinin LLM taslak üretimindeki güvenlik sözleşmesi."""
from __future__ import annotations

import pytest

from agents.llm import ChatMessage, LLMResponse
from agents.mevzuat_kanit import kanit_etiketlerini_coz, mevzuat_kanit_paketi
from agents.nodes.risk_guard import compute_risk
from agents.nodes.verify import verify_node
from yazi.yazi_render import build_body_sonuclu

_RAG_KAYDI = {
    "baslik": "isyeri acma calisma ruhsatlari yonetmeligi m.12",
    "snippet": (
        "Madde 12 — Sıhhi işyeri açma ruhsatı başvurusu yetkili idareye "
        "başvurularak yürütülür."
    ),
    "kaynak_dosya": "isyeri_acma_calisma_ruhsatlari_yonetmeligi",
    "madde_no": 12,
    "madde_tur": "madde",
    "kaynak_guven": "resmi_dogrulanmis",
    "kaynak_url": "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3071.pdf",
    "icerik_sha256": "a" * 64,
}


class KayitliLLM:
    def __init__(self, yanit: str) -> None:
        self.yanit = yanit
        self.mesajlar: list[list[ChatMessage]] = []

    async def chat(self, messages: list[ChatMessage], **_kwargs) -> LLMResponse:
        self.mesajlar.append(list(messages))
        return LLMResponse(content=self.yanit)


@pytest.fixture(autouse=True)
def _dogrulanmis_test_kaynagi(monkeypatch) -> None:
    """Unit tests isolate evidence formatting from the repository manifest."""
    import agents.mevzuat_kanit as kanit_mod

    def _dogrula(oneri, _kaynak_dosya):
        if oneri.get("kaynak_guven") != "resmi_dogrulanmis":
            return None
        return {
            "kaynak_url": oneri["kaynak_url"],
            "icerik_sha256": oneri["icerik_sha256"],
            "dogrulayan": "test-reviewer",
            "dogrulama_tarihi": "2026-07-24",
        }

    monkeypatch.setattr(kanit_mod, "_dogrulanmis_kaynak", _dogrula)


def test_kanit_paketi_yalniz_gercek_maddeleri_alir() -> None:
    paket = mevzuat_kanit_paketi({
        "mevzuat_onerileri": [
            _RAG_KAYDI,
            {**_RAG_KAYDI, "snippet": ""},
            {**_RAG_KAYDI, "kaynak_dosya": "../../sahte"},
        ],
    })

    assert len(paket) == 1
    assert paket[0]["id"] == "KANIT-1"
    assert paket[0]["madde_no"] == "12"


def test_dogrulanmamis_korpus_kaydi_llm_kanitina_girmez() -> None:
    paket = mevzuat_kanit_paketi({
        "mevzuat_onerileri": [{**_RAG_KAYDI, "kaynak_guven": "aday"}],
    })

    assert paket == []


def test_kanit_yokken_hukuki_atif_guvenli_uyari_uretir() -> None:
    _metin, uyarilar, sayi = kanit_etiketlerini_coz(
        "3071 sayili Kanun'un 7 nci maddesi uygulanir.",
        [],
    )

    assert sayi == 0
    assert uyarilar and "(mevzuat kan" in uyarilar[0]


def test_kanit_etiketi_gercek_atfa_cozulur() -> None:
    paket = mevzuat_kanit_paketi({"mevzuat_onerileri": [_RAG_KAYDI]})
    metin, uyarilar, sayi = kanit_etiketlerini_coz(
        "Başvuru yetkili idarece alınır [KANIT-1].", paket)

    assert not uyarilar
    assert sayi == 1
    assert "[KANIT-1]" not in metin
    assert "ruhsatlari yonetmeligi m.12" in metin


@pytest.mark.parametrize(
    "metin",
    (
        "Başvuru hakkında 3071 sayılı Kanun'un 7 nci maddesi uygulanır.",
        "Başvuru [KANIT-9] kapsamında değerlendirilir.",
    ),
)
def test_paket_disi_hukuki_atif_reddedilir(metin: str) -> None:
    paket = mevzuat_kanit_paketi({"mevzuat_onerileri": [_RAG_KAYDI]})
    _cozulmus, uyarilar, _sayi = kanit_etiketlerini_coz(metin, paket)

    assert uyarilar
    assert "(mevzuat kanıtı)" in uyarilar[0]


async def test_llm_promptu_kanit_snippetini_icerir_ve_etiketi_cozer(monkeypatch) -> None:
    import agents.llm as llm_mod

    llm = KayitliLLM("Başvuru yetkili idarece değerlendirilir [KANIT-1].")
    monkeypatch.setattr(llm_mod, "get_llm", lambda: llm)
    paket = mevzuat_kanit_paketi({"mevzuat_onerileri": [_RAG_KAYDI]})

    sonuc = await build_body_sonuclu(
        "cevabi_yazi",
        {"konu": "işyeri açma ruhsatı"},
        "İşyeri açma ruhsatı başvurusunun değerlendirilmesini talep ederim.",
        mevzuat_kanit_paketi=paket,
    )

    prompt = llm.mesajlar[0][-1].content
    assert "MEVZUAT KANIT PAKETİ" in prompt
    assert _RAG_KAYDI["snippet"] in prompt
    assert sonuc.mevzuat_kanit_durumu == "kullanildi"
    assert sonuc.mevzuat_kanit_atif_sayisi == 1
    assert "ruhsatlari yonetmeligi m.12" in sonuc.metin


async def test_llm_paket_disi_atif_yazarsa_guvenli_govdeye_duser(monkeypatch) -> None:
    import agents.llm as llm_mod

    monkeypatch.setattr(
        llm_mod,
        "get_llm",
        lambda: KayitliLLM("3071 sayılı Kanun'un 7 nci maddesi uyarınca işlem yapılır."),
    )
    paket = mevzuat_kanit_paketi({"mevzuat_onerileri": [_RAG_KAYDI]})

    sonuc = await build_body_sonuclu(
        "cevabi_yazi",
        {"konu": "işyeri açma ruhsatı"},
        "Başvuru metni.",
        mevzuat_kanit_paketi=paket,
    )

    assert sonuc.mevzuat_kanit_durumu == "atik_reddedildi"
    assert sonuc.mevzuat_kanit_uyari
    assert "3071 sayılı" not in sonuc.metin


async def test_kanit_atif_uyarisi_verify_ve_risk_katmanina_tasinir() -> None:
    state = {
        "evrak_text": "Konu: ruhsat başvurusu",
        "bilgi_unsurlari": {"konu": "ruhsat başvurusu"},
        "yazi_turu": "cevabi_yazi",
        "yazi_taslak_md": (
            "T.C.\nKAMU KURUMU\nSayı : EBYS-TASLAK\nKonu : ruhsat başvurusu\n\n"
            "Gereğini arz ederim.\nYetkili İmza"
        ),
        "mevzuat_kanit_uyari": [
            "(mevzuat kanıtı) Taslakta kanıt etiketi olmadan hukukî atıf üretildi; atıf kaldırıldı."
        ],
    }
    verify = await verify_node(state)
    risk = compute_risk(
        verify["verify_uyari"],
        format_uyumlu=True,
        eksik_alanlar=[],
        tur_confidence=0.9,
        evrak_turu="dilekce",
        taslak=state["yazi_taslak_md"],
    )

    assert any("(mevzuat kanıtı)" in u for u in verify["verify_uyari"])
    assert risk["bant"] == "sari"
