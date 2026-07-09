"""yazi_render.revize_taslak — AI-destekli doğal-dil taslak revizyonu.

Sözleşme: LLM yok/mock/hata → None (çağıran orijinal taslağı korur). Ayrıca iki ek
güvenlik kapısı: (1) taslak _REVIZE_MAX_TASLAK_CHARS'ı aşarsa LLM'e hiç gitmeden
reddedilir (eski kod taslağı [:4000] sessizce kesip kuyruğu kaybediyordu); (2) LLM
çıktısı girdiden şüpheli biçimde kısaysa (olası kesilme/çöküş) reddedilir. AAA deseni,
mock modda deterministik.
"""

from __future__ import annotations

import agents.nodes._llm_extract as ext
from agents.llm import ChatMessage, LLMResponse, MockLLM
from agents.nodes._llm_extract import cache_temizle
from yazi.yazi_render import _REVIZE_MAX_TASLAK_CHARS, revize_taslak

import pytest


class SayacLLM:
    """Sıralı sahte yanıt — MockLLM DEĞİL (llm_text'in real_llm() kontrolünü geçer)."""

    def __init__(self, *yanitlar: str) -> None:
        self._yanitlar = list(yanitlar)
        self.call_count = 0
        self.gecmis: list[list[ChatMessage]] = []

    async def chat(self, messages, *, temperature=0.1, max_tokens=1024,
                   json_mode=False, json_schema=None) -> LLMResponse:
        self.gecmis.append(list(messages))
        yanit = self._yanitlar[min(self.call_count, len(self._yanitlar) - 1)]
        self.call_count += 1
        return LLMResponse(content=yanit)


@pytest.fixture(autouse=True)
def _temiz_cache():
    cache_temizle()
    yield
    cache_temizle()


_TASLAK = (
    "T.C.\nSANAYİ VE TEKNOLOJİ BAKANLIĞI\n\nSayı : E-12345678-622.03-99999\n"
    "Konu : Çukur onarımı\n\nSayın Ayşe Yılmaz\n\nGereğini arz ederim.\n\nAd Soyad\nUnvan"
)


class TestRevizeTaslakBasariliYol:
    async def test_normal_revizyon_llm_cevabini_dondurur(self, monkeypatch):
        # Arrange
        beklenen = _TASLAK.replace("Gereğini arz ederim.", "Gereğinin yapılmasını arz ederim.")
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(beklenen))
        # Act
        sonuc = await revize_taslak(_TASLAK, "daha resmi yap")
        # Assert
        assert sonuc == beklenen

    async def test_prompt_taslak_ve_talimati_icerir(self, monkeypatch):
        llm = SayacLLM(_TASLAK)
        monkeypatch.setattr(ext, "get_llm", lambda: llm)
        await revize_taslak(_TASLAK, "506 sayılı kanuna atıf ekle")
        user_mesaji = llm.gecmis[0][-1].content
        assert "506 sayılı kanuna atıf ekle" in user_mesaji
        assert "Çukur onarımı" in user_mesaji


class TestRevizeTaslakFallback:
    async def test_mock_modda_none_doner(self, monkeypatch):
        monkeypatch.setattr(ext, "get_llm", lambda: MockLLM())
        assert await revize_taslak(_TASLAK, "daha resmi yap") is None

    async def test_bos_yanitta_none_doner(self, monkeypatch):
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM("   "))
        assert await revize_taslak(_TASLAK, "daha resmi yap") is None


class TestRevizeTaslakKesilmeKoruma:
    """Eski davranış: taslak_md[:4000] + max_tokens=800 → uzun taslağın kuyruğu sessizce
    kaybolurdu. Yeni davranış: aşırı-uzun taslak LLM'e HİÇ gitmeden reddedilir; LLM'in
    girdiden şüpheli kısa döndüğü durum da reddedilir — ikisinde de orijinal taslak korunur.
    """

    async def test_asiri_uzun_taslak_llme_gitmeden_reddedilir(self, monkeypatch):
        llm = SayacLLM("ilgisiz cevap")
        monkeypatch.setattr(ext, "get_llm", lambda: llm)
        uzun_taslak = "A" * (_REVIZE_MAX_TASLAK_CHARS + 1)
        sonuc = await revize_taslak(uzun_taslak, "kısalt")
        assert sonuc is None
        assert llm.call_count == 0  # LLM hiç çağrılmadı — sessiz kesilme riski yok

    async def test_supheli_kisa_cevap_reddedilir(self, monkeypatch):
        # Girdi 200+ karakter, LLM yanıtı girdinin %30'undan kısa → muhtemel kesilme/çöküş.
        uzun_taslak = _TASLAK + "\n\n" + "Ek açıklama satırı. " * 10
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM("kısa cevap"))
        sonuc = await revize_taslak(uzun_taslak, "daha resmi yap")
        assert sonuc is None

    async def test_kisa_taslakta_kisa_cevap_serbest(self, monkeypatch):
        # Kısa taslak (<200 char) için şüpheli-kısalma koruması devreye girmez.
        kisa = "Konu : Test\nGereğini arz ederim."
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM("Kısaltıldı."))
        sonuc = await revize_taslak(kisa, "kısalt")
        assert sonuc == "Kısaltıldı."
