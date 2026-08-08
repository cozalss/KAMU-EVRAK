"""JSON retry'ı YALNIZ "dolu ama bozuk" cevapta yap — boş/kesik cevapta ASLA.

ÖLÇÜLEN HATA (gecikme denetimi, 7 Ağustos 2026):
`llm_json`, parse edilemeyen HER cevabı "bozuk JSON" sayıp aynı bütçe ve aynı sıcaklıkla
bir kez daha soruyordu. Ama ölçülen başarısızlık bozuk JSON değildi: deepseek-v4-* bir
reasoning modeli ve düşünme token'ları `max_tokens`'tan düşüyor; decompose (600+700=1300)
ile route_ajan (260+700=960) bütçelerinin TAMAMINI düşünmeye harcayıp BOŞ dönüyordu
(log: `tokens_out` tam tavanda + `finish_reason == "length"`).

Aynı bütçeyle tekrar sormak mekanik olarak aynı sonucu verir — üstelik retry mesajı
prompt'u uzattığı için cevap alanını DAHA DA daraltır (ölçüldü: tokens_in 714 -> 775).
Uçtan uca 44,9 saniyenin ~15 saniyesi, çıktısı zaten atılan bu ikinci çağrılara gidiyordu.

BU TESTLERİN KORUDUĞU SÖZLEŞME:
  · boş cevap        -> retry YOK (tek çağrı)
  · kesik cevap      -> retry YOK (tek çağrı), içerik dolu görünse bile
  · dolu ama bozuk   -> retry VAR (yetenek kaybı yok — asıl işi buydu)
  · bayrak kapalı    -> eski davranış birebir geri gelir
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from agents import config
from agents.nodes import _llm_extract
from agents.nodes._llm_extract import llm_json


class _SayanLLM:
    """Gerçek istemci gibi davranır (MockLLM DEĞİL) ve çağrıları sayar."""

    model = "deepseek-v4-flash"

    def __init__(self, icerik: str, finish_reason: str = "stop") -> None:
        self.icerik = icerik
        self.finish_reason = finish_reason
        self.cagri = 0

    async def chat(self, **kwargs: Any) -> Any:
        self.cagri += 1
        return SimpleNamespace(content=self.icerik, finish_reason=self.finish_reason)


@pytest.fixture(autouse=True)
def _temiz_ortam(monkeypatch: pytest.MonkeyPatch) -> None:
    """Önbellek kapalı + retry açık: testler çağrı SAYISINI ölçüyor."""
    monkeypatch.setattr(config, "LLM_CACHE_ENABLED", False)
    monkeypatch.setattr(config, "LLM_JSON_RETRY", True)
    monkeypatch.setattr(config, "LLM_RETRY_SADECE_BOZUK", True)
    _llm_extract.cache_temizle()


def _bagla(monkeypatch: pytest.MonkeyPatch, llm: _SayanLLM) -> None:
    monkeypatch.setattr(_llm_extract, "get_llm", lambda: llm)


@pytest.mark.asyncio
async def test_bos_cevapta_yeniden_denenmez(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bütçe düşünmeye gitti, içerik boş: ikinci çağrı aynı sonucu verir — sorma."""
    llm = _SayanLLM("")
    _bagla(monkeypatch, llm)

    sonuc = await llm_json("sys", "user", max_tokens=600)

    assert sonuc is None, "boş cevap deterministik fallback'e düşmeli"
    assert llm.cagri == 1, f"boş cevapta retry yapıldı ({llm.cagri} çağrı)"


@pytest.mark.asyncio
async def test_kesik_cevapta_yeniden_denenmez(monkeypatch: pytest.MonkeyPatch) -> None:
    """finish_reason='length': cevap bütçeye sığmadı. Aynı bütçeyle tekrar sormak anlamsız.

    İçerik BOŞ DEĞİL (yarım JSON) — yani eski kod bunu "bozuk JSON" sanıp retry ederdi.
    Ayrım tam olarak burada: bozukluğun sebebi biçim değil bütçe.
    """
    llm = _SayanLLM('{"alt_talepler": [{"metin": "yarim', finish_reason="length")
    _bagla(monkeypatch, llm)

    sonuc = await llm_json("sys", "user", max_tokens=600)

    assert sonuc is None
    assert llm.cagri == 1, f"kesik cevapta retry yapıldı ({llm.cagri} çağrı)"


@pytest.mark.asyncio
async def test_dolu_ama_bozuk_cevapta_yeniden_denenir(monkeypatch: pytest.MonkeyPatch) -> None:
    """Retry'ın ASIL işi korunuyor: model JSON'u açıklamayla sardıysa ikinci şans verilir."""
    llm = _SayanLLM("Tabii, işte JSON: bu geçerli değil ama dolu")
    _bagla(monkeypatch, llm)

    await llm_json("sys", "user", max_tokens=600)

    assert llm.cagri == 2, "dolu-ama-bozuk cevapta retry kaybedilmiş"


@pytest.mark.asyncio
async def test_retry_basarili_olursa_sonuc_doner(monkeypatch: pytest.MonkeyPatch) -> None:
    """Kurtarma yolu uçtan uca çalışıyor mu — yalnız çağrı sayısı değil SONUÇ da doğru."""

    class _IkinciDenemedeDuzelen(_SayanLLM):
        async def chat(self, **kwargs: Any) -> Any:
            self.cagri += 1
            icerik = "```json açıklama" if self.cagri == 1 else '{"tur": "dilekce"}'
            return SimpleNamespace(content=icerik, finish_reason="stop")

    llm = _IkinciDenemedeDuzelen("")
    _bagla(monkeypatch, llm)

    sonuc = await llm_json("sys", "user", max_tokens=600)

    assert sonuc == {"tur": "dilekce"}
    assert llm.cagri == 2


@pytest.mark.asyncio
async def test_bayrak_kapaliyken_eski_davranis_geri_gelir(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Geri alma yolu gerçekten geri alıyor mu — bayrak sözleşmesinin kendisi test edilir."""
    monkeypatch.setattr(config, "LLM_RETRY_SADECE_BOZUK", False)
    llm = _SayanLLM("")
    _bagla(monkeypatch, llm)

    await llm_json("sys", "user", max_tokens=600)

    assert llm.cagri == 2, "LLM_RETRY_SADECE_BOZUK=0 eski (boşta da retry) davranışı vermeli"


@pytest.mark.asyncio
async def test_finish_reason_tasimayan_istemci_kesik_sayilmaz(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Üçüncü-taraf/sahte istemciler finish_reason taşımayabilir — retry yeteneği ölmemeli."""

    class _AlanSiz:
        model = "sahte"

        def __init__(self) -> None:
            self.cagri = 0

        async def chat(self, **kwargs: Any) -> Any:
            self.cagri += 1
            return SimpleNamespace(content="dolu ama bozuk")

    llm = _AlanSiz()
    _bagla(monkeypatch, llm)

    await llm_json("sys", "user", max_tokens=600)

    assert llm.cagri == 2, "finish_reason yokluğu 'kesik' sayılıp retry'ı öldürmemeli"
