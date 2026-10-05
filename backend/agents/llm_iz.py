"""LLM çağrı izleri — hangi node, hangi profil, kesildi mi, kurtarıldı mı, yedeğe mi düştü.

NEDEN AYRI MODÜL: iz bilgisinin üç tüketicisi var ve üçü de farklı katmanda —
  · `agents.llm.OpenAIClient` log satırına node + profil adını yazar (istemci katmanı),
  · `agents.nodes._llm_extract` her çağrının sonucunu iz olarak kaydeder (politika katmanı),
  · `agents.graph._zamanli_node` node bitince izleri state'e `llm_izleri` olarak yazar (graf).
Bu modül yalnız standart kütüphaneye bağlıdır; böylece istemci katmanı politika katmanını
import etmeden bağlamı okuyabilir (döngüsel import yok).

Taşıyıcı ContextVar'dır: LangGraph her node'u kendi asyncio görevinde koşar ve görevler
bağlamı KOPYALAR; node içinde açılan alt görevler (asyncio.gather) aynı toplayıcı listeyi
görür. Paralel node'lar ayrı görevlerdir → izleri birbirine karışmaz.

KVKK: iz kaydına HAM İÇERİK (prompt/cevap) YAZILMAZ — yalnız adlar, sayılar ve bayraklar.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from contextvars import ContextVar
from typing import Any

# Graf dışı çağrılarda (API sohbet, kurul) node yoktur → None; iz toplanmaz, log yine yazılır.
_AKTIF_NODE: ContextVar[str | None] = ContextVar("llm_iz_aktif_node", default=None)
_AKTIF_PROFIL: ContextVar[str | None] = ContextVar("llm_iz_aktif_profil", default=None)
_TOPLAYICI: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "llm_iz_toplayici", default=None)

# Bir iz kaydında bulunabilecek alanlar — test bu kümeyi PII-süzgeci olarak kullanır.
IZ_ALANLARI: frozenset[str] = frozenset({
    "node", "profil", "deneme", "kurtarma", "kesik", "kurtarildi", "yedege_dustu",
    "neden", "sure_ms", "tokens_in", "tokens_out", "reasoning_tokens", "onbellek",
})


def aktif_node() -> str | None:
    """Şu an koşan graf node'unun adı (graf dışında None)."""
    return _AKTIF_NODE.get()


def aktif_profil() -> str | None:
    """Şu an yapılan LLM çağrısının profil adı (merkezi katman dışında None)."""
    return _AKTIF_PROFIL.get()


@contextlib.contextmanager
def node_kapsami(ad: str) -> Iterator[list[dict[str, Any]]]:
    """Node süresince izleri topla; dönen liste node bitince state'e yazılır."""
    izler: list[dict[str, Any]] = []
    t_node = _AKTIF_NODE.set(ad)
    t_top = _TOPLAYICI.set(izler)
    try:
        yield izler
    finally:
        _TOPLAYICI.reset(t_top)
        _AKTIF_NODE.reset(t_node)


@contextlib.contextmanager
def profil_kapsami(ad: str) -> Iterator[None]:
    """Tek bir merkezi LLM çağrısı süresince profil adını bağlama koy (istemci logu okur)."""
    token = _AKTIF_PROFIL.set(ad)
    try:
        yield
    finally:
        _AKTIF_PROFIL.reset(token)


def toplanan_izler() -> list[dict[str, Any]]:
    """Aktif node'un şu ana kadar topladığı izlerin KOPYASI (graf dışında boş liste).
    Node, kendi çağrısının kesilip kurtarıldığını bu listeden okuyabilir."""
    return list(_TOPLAYICI.get() or [])


def iz_ekle(kayit: dict[str, Any]) -> None:
    """İz kaydını aktif toplayıcıya ekle. Toplayıcı yoksa (graf dışı) sessizce atla.

    Yalnız IZ_ALANLARI'ndaki anahtarlar yazılır — yanlışlıkla içerik taşıyan bir alan
    eklenirse state'e/SSE'ye sızmaz.
    """
    toplayici = _TOPLAYICI.get()
    if toplayici is None:
        return
    temiz = {k: v for k, v in kayit.items() if k in IZ_ALANLARI}
    temiz.setdefault("node", _AKTIF_NODE.get())
    toplayici.append(temiz)


__all__ = ("IZ_ALANLARI", "aktif_node", "aktif_profil", "iz_ekle", "node_kapsami",
           "profil_kapsami")
