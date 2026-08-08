"""`canli_kaynak` künyesi düğümden ARAYÜZE kadar hayatta kalıyor mu?

BU DOSYA BİR HATADAN DOĞDU. `route_ajan` künyeyi doğru üretiyordu ve düğümü doğrudan
çağıran testler geçiyordu — ama `canli_kaynak` ne `EvrakState`te, ne `DocumentResult`ta,
ne de SSE alan haritasında tanımlıydı. **LangGraph şemada olmayan anahtarı hata vermeden
atar.** Sonuç: özellik ağa çıkıyor, önbelleğe yazıyor, log basıyor — ama arayüze HİÇ
ulaşmıyordu ve hiçbir test bunu görmüyordu.

Ders: "düğüm döndürdü" ≠ "state'e yazıldı". Düğüm testi bu hata SINIFINI yakalayamaz;
zincirin tamamı ayrıca kilitlenmelidir.
"""
from __future__ import annotations

import pytest

from agents.state import EvrakState


def test_canli_kaynak_EvrakState_semasinda() -> None:
    """Şemada yoksa LangGraph sessizce düşürür — bütün özelliğin can damarı."""
    assert "canli_kaynak" in EvrakState.__annotations__


def test_canli_kaynak_API_yanit_semasinda() -> None:
    from api.schemas import ProcessResponse

    assert "canli_kaynak" in ProcessResponse.model_fields
    # Varsayılan BOŞ SÖZLÜK olmalı: alan yoksa arayüz "kaynak var" sanmamalı.
    assert ProcessResponse.model_fields["canli_kaynak"].get_default(call_default_factory=True) == {}


def test_canli_kaynak_SSE_ozetinde_tasinir() -> None:
    """Canlı akış demosunda da görünmeli; yalnız nihai yanıtta olması yetmez.

    Yapı değil DAVRANIŞ sınanır: özetleyici çağrılır ve anahtarın çıktıya taşındığı
    doğrulanır — böylece harita nereye taşınırsa taşınsın test anlamlı kalır.
    """
    from api.routes.process_doc import _node_summary

    ozet = _node_summary("route_birim", {
        "hedef_birim": None,
        "canli_kaynak": {"url": "https://x.gov.tr/birimler", "dogrulanmis": False},
    })
    assert ozet.get("canli_kaynak", {}).get("url") == "https://x.gov.tr/birimler"


@pytest.mark.anyio
async def test_grafta_ucdan_uca_HAYATTA_KALIR(monkeypatch) -> None:
    """Gerçek grafı koş: düğümün döndürdüğü künye final state'e ULAŞMALI.

    Ağa çıkılmaz — canlı keşif sahte bir fonksiyonla değiştirilir.
    """
    from agents.graph import build_graph
    from agents.nodes import route_ajan as ra
    from agents.state import make_initial_state

    kunye = {
        "url": "https://konyaism.saglik.gov.tr/birimler.html",
        "birim_sayisi": 38, "yol": "kalip", "dogrulanmis": False,
        "uyari": "Bu kaynak canlı bulundu; insan incelemesinden GEÇMEDİ.",
        "kurum_slug": "konya-il-saglik-mudurlugu",
        "birim_oneri": "Acil Sağlık Hizmetleri Başkanlığı",
        "birim_ornekleri": ["Acil Sağlık Hizmetleri Başkanlığı"],
    }
    async def _sahte(slug, konu, **kw):
        return kunye

    monkeypatch.setenv("KURUM_ADI", "Konya İl Sağlık Müdürlüğü")
    monkeypatch.setattr(ra, "kurum_korpusta_var", lambda slug: False)
    monkeypatch.setattr(ra, "kurum_icin_oneri_async", _sahte)

    son = await build_graph().ainvoke(make_initial_state(
        evrak_text="Ambulans hizmetlerinde yaşanan gecikme hakkında şikâyet başvurusu.",
    ))
    assert son.get("canli_kaynak", {}).get("url") == kunye["url"], (
        "künye graftan geçerken düşürüldü — EvrakState şeması eksik olabilir"
    )
    # Sözleşme graf çıkışında da korunmalı: otomatik havale bu yoldan üretilmez.
    assert son.get("canli_kaynak", {}).get("dogrulanmis") is False
