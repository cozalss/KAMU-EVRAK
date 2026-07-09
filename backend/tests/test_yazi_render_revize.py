"""yazi_render.revize_taslak / revize_taslak_yapili — AI-destekli doğal-dil taslak revizyonu.

Sözleşme: LLM yok/mock/hata → None (çağıran orijinal taslağı korur). Ayrıca iki ek
güvenlik kapısı: (1) taslak _REVIZE_MAX_TASLAK_CHARS'ı aşarsa LLM'e hiç gitmeden
reddedilir (eski kod taslağı [:4000] sessizce kesip kuyruğu kaybediyordu); (2) LLM
çıktısı girdiden şüpheli biçimde kısaysa (olası kesilme/çöküş) reddedilir. Yapılandırılmış
yol (revize_taslak_yapili) ek olarak değişiklik özeti + uygulanamayan açıklaması döndürür;
JSON bozulursa düz-metin yola düşer. AAA deseni, mock modda deterministik.
"""

from __future__ import annotations

import json

import pytest

import agents.nodes._llm_extract as ext
from agents.llm import ChatMessage, LLMResponse, MockLLM
from agents.nodes._llm_extract import cache_temizle
from yazi.yazi_render import (
    _REVIZE_MAX_TASLAK_CHARS,
    revize_taslak,
    revize_taslak_yapili,
)


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


def _json_cevap(taslak, degisiklikler=None, uygulanamayan=""):
    return json.dumps({"taslak": taslak, "degisiklikler": degisiklikler or [],
                       "uygulanamayan": uygulanamayan}, ensure_ascii=False)


class TestRevizeTaslakYapili:
    """Yapılandırılmış revizyon: metin + değişiklik özeti + uygulanamayan açıklaması."""

    async def test_json_yaniti_yapili_sonuc_dondurur(self, monkeypatch):
        # Arrange
        beklenen = _TASLAK.replace("Gereğini arz ederim.", "Gereğinin yapılmasını arz ederim.")
        cevap = _json_cevap(beklenen, ["Arz ifadesi resmîleştirildi"])
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(cevap))
        # Act
        sonuc = await revize_taslak_yapili(_TASLAK, "daha resmi yap")
        # Assert
        assert sonuc == {"metin": beklenen,
                         "degisiklikler": ["Arz ifadesi resmîleştirildi"],
                         "uygulanamayan": ""}

    async def test_uygulanamayan_aciklamasi_gecirilir(self, monkeypatch):
        # Model taslağı DEĞİŞTİRMEDEN uydurma-reddini açıklayabilir (SIFIR UYDURMA).
        cevap = _json_cevap(_TASLAK, [], "507 sayılı kanun kaynak evrakta geçmiyor")
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(cevap))
        sonuc = await revize_taslak_yapili(_TASLAK, "507 sayılı kanuna atıf ekle")
        assert sonuc["metin"] == _TASLAK
        assert "507" in sonuc["uygulanamayan"]

    async def test_kaynak_ozeti_prompta_girer(self, monkeypatch):
        llm = SayacLLM(_json_cevap(_TASLAK))
        monkeypatch.setattr(ext, "get_llm", lambda: llm)
        await revize_taslak_yapili(_TASLAK, "ilgiye atıf ekle", evrak_ozet="01.06.2026 tarihli dilekçe")
        assert "01.06.2026 tarihli dilekçe" in llm.gecmis[0][-1].content

    async def test_bozuk_json_duz_metin_yola_duser(self, monkeypatch):
        # llm_json parse edemez (retry dahil) → revize_taslak (düz metin) devralır;
        # özet alanları boş döner ama özellik tamamen kaybolmaz.
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM("Bu bir JSON değil, düz revize metni."))
        sonuc = await revize_taslak_yapili(_TASLAK, "daha resmi yap")
        assert sonuc == {"metin": "Bu bir JSON değil, düz revize metni.",
                         "degisiklikler": [], "uygulanamayan": ""}

    async def test_mock_modda_none(self, monkeypatch):
        # Mock'un konu-bazlı sabit JSON'u revizyon değildir — yola hiç girilmez.
        monkeypatch.setattr(ext, "get_llm", lambda: MockLLM())
        assert await revize_taslak_yapili(_TASLAK, "daha resmi yap") is None

    async def test_asiri_uzun_taslak_reddedilir(self, monkeypatch):
        llm = SayacLLM(_json_cevap("x"))
        monkeypatch.setattr(ext, "get_llm", lambda: llm)
        assert await revize_taslak_yapili("A" * (_REVIZE_MAX_TASLAK_CHARS + 1), "kısalt") is None
        assert llm.call_count == 0

    async def test_supheli_kisa_json_taslagi_reddedilir(self, monkeypatch):
        # JSON geçerli ama taslak alanı girdinin küçük bir kesri → kesilme kapısı JSON
        # yolunda da çalışır; düz-metin fallback de aynı kısa cevabı verir → None.
        uzun_taslak = _TASLAK + "\n\n" + "Ek açıklama satırı. " * 10
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(_json_cevap("kısa")))
        assert await revize_taslak_yapili(uzun_taslak, "daha resmi yap") is None

    async def test_llm_ozet_alanlari_temizlenir_ve_sinirlanir(self, monkeypatch):
        # degisiklikler: str-olmayan/boş elenir, en çok 5 madde; satır sonları tek satıra iner.
        cevap = json.dumps({
            "taslak": _TASLAK + " (revize)",
            "degisiklikler": ["a\nb", "", 42, "c", "d", "e", "f", "g"],
            "uygulanamayan": "x\r\ny",
        }, ensure_ascii=False)
        monkeypatch.setattr(ext, "get_llm", lambda: SayacLLM(cevap))
        sonuc = await revize_taslak_yapili(_TASLAK, "düzenle")
        assert sonuc["degisiklikler"] == ["a b", "c", "d", "e", "f"]
        assert sonuc["uygulanamayan"] == "x y"
