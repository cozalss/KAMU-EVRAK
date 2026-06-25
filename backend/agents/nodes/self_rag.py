"""Yenilikçilik — Self-RAG (reflection) çıktı tamlık öz-değerlendirme node'u.

Akış: verify'dan SONRA, finalize'dan ÖNCE çalışır. Pipeline'ın ürettiği çıktının
TAMLIĞINI öz-değerlendirir: beklenen çekirdek alanlar (evrak_turu + hedef_birim +
ozet + mevzuat önerisi + yazı taslağı) dolu mu? Eksik varsa şeffaf bir not düşer.

SOTA dayanak (Asai et al. 2023, "Self-RAG: Learning to Retrieve, Generate, and
Critique through Self-Reflection"): model kendi çıktısını "yeterli mi / destekli mi"
diye eleştirir. Bizim uyarlamamız LLM-eleştirisi yerine DETERMİNİSTİK tamlık-kontrolü
(halüsinasyon riski yok, mock modda da çalışır, anahtarsız demo deterministik kalır).

ENV-GATED: SELF_RAG_ENABLED=0 (varsayılan) → no-op passthrough (boş dict döner,
state bozulmaz, baseline akış birebir korunur). ADDITIVE: yalnız self_rag_* alanlarını
ekler; mevcut çıktıyı ASLA değiştirmez (gözlemci/şeffaflık katmanı).

Return sözleşmesi: {"self_rag_tam": bool, "self_rag_eksikler": [...], "self_rag_notu": str}.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import SELF_RAG_ENABLED

log = structlog.get_logger()

# Çıktıda bulunması beklenen çekirdek alanlar → okunabilir Türkçe etiket.
# (alan_anahtarı, etiket). 'belirsiz' tür düşük-bilgili abstention'dır → eksik sayılmaz.
_BEKLENEN_ALANLAR: tuple[tuple[str, str], ...] = (
    ("evrak_turu", "evrak türü"),
    ("hedef_birim", "önerilen birim"),
    ("ozet", "özet"),
    ("yazi_taslak_md", "resmî yazı taslağı"),
)


def _alan_dolu(state: dict[str, Any], anahtar: str) -> bool:
    """Bir çıktı alanı anlamlı dolu mu (None/boş-string/boş-liste → boş)."""
    val = state.get(anahtar)
    if val is None:
        return False
    if isinstance(val, str):
        return bool(val.strip())
    if isinstance(val, (list, tuple, dict)):
        return len(val) > 0
    return True


def _mevzuat_dolu(state: dict[str, Any]) -> bool:
    """Mevzuat önerisi var mı — CRAG düzeltilmiş liste varsa o, yoksa baseline."""
    corrected = state.get("mevzuat_onerileri_corrected")
    if corrected:
        return True
    return bool(state.get("mevzuat_onerileri"))


def _eksik_alanlar(state: dict[str, Any]) -> list[str]:
    """Beklenen çıktı alanlarından dolu OLMAYANLARIN okunabilir etiketleri."""
    eksik = [etiket for anahtar, etiket in _BEKLENEN_ALANLAR if not _alan_dolu(state, anahtar)]
    if not _mevzuat_dolu(state):
        eksik.append("ilgili mevzuat")
    return eksik


async def self_rag_node(state: dict[str, Any]) -> dict[str, Any]:
    """Çıktı tamlık öz-değerlendirmesi — additive reflection notu (ENV-gated)."""
    if not SELF_RAG_ENABLED:
        return {}  # no-op: grafta var ama kapalı (baseline davranış birebir korunur)

    eksikler = _eksik_alanlar(state)
    tam = not eksikler
    notu = (
        "Öz-değerlendirme: çıktı tam — evrak türü, önerilen birim, özet, mevzuat ve "
        "taslak mevcut."
        if tam
        else "Öz-değerlendirme: çıktıda eksik bölüm(ler) var → " + ", ".join(eksikler)
        + " (tamamlanması önerilir)."
    )
    log.info("self_rag", tam=tam, eksikler=eksikler)
    return {"self_rag_tam": tam, "self_rag_eksikler": eksikler, "self_rag_notu": notu}


__all__ = ("self_rag_node",)
