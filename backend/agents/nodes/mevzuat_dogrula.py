"""Görev 1 (yenilikçilik) — Mevzuat atıf-gerekçelendirme (NLI entailment) node'u.

Anti-halüsinasyon DERİNLEŞTİRME: verify node uydurma tarih/sayıyı yüzeysel string ile
veto eder; bu node bir adım öteye gider → önerilen mevzuat MADDESİNİN (premise) evrak
TALEBİNE (hypothesis) anlamsal olarak DESTEK verip vermediğini NLI entailment ile ölçer.
Entailment zayıfsa öneri "[DOĞRULA: anlamsal destek zayıf]" işaretlenir (silinmez — recall
korunur; jüriye şeffaf). Bu, CLAUDE.md §1 (alakasız/uydurma madde önerme) için ölçülebilir
semantik kanıttır.

Tasarım (rerank deseni): ENV-gated (NLI_ENABLED, varsayılan KAPALI → baseline birebir korunur).
Açıkken model/lib (transformers + mDeBERTa-v3-xnli, rag extra) yoksa GRACEFUL passthrough
(WARN log, boş dict → mevzuat_onerileri olduğu gibi kalır). Additive: yalnız `mevzuat_nli`
ek alanı yazar; mevzuat_onerileri'ne DOKUNMAZ (operator.add reducer duplikasyonunu önler).

Çıktı: {"mevzuat_nli": [{"baslik", "entailment": bool, "skor": float, "etiket": str}, ...]}
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import NLI_ENABLED, NLI_ESIK, NLI_MODEL

log = structlog.get_logger()

_PIPE: Any = None


def _get_pipe() -> Any:
    """mDeBERTa-v3-xnli text-classification pipeline (lazy singleton; ağır — rag extra)."""
    global _PIPE
    if _PIPE is None:
        from transformers import pipeline

        _PIPE = pipeline("text-classification", model=NLI_MODEL, top_k=None)
    return _PIPE


def _entailment_skor(premise: str, hypothesis: str) -> float:
    """(premise ⊨ hypothesis) entailment olasılığı [0..1] — NLI model çağrısı (ağır).

    Test/monkeypatch noktası: testler bunu mock'lar → gerçek model gerekmeden wiring sınanır.
    """
    pipe = _get_pipe()
    out = pipe({"text": premise[:1000], "text_pair": hypothesis[:500]})
    for d in out if isinstance(out, list) else [out]:
        if str(d.get("label", "")).lower().startswith("entail"):
            return float(d.get("score", 0.0))
    return 0.0


def _hypothesis(state: dict[str, Any]) -> str:
    """Evrak talebini tek cümle hypothesis'e çevir (konu → 'Bu evrak ... ile ilgilidir')."""
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu") or "").strip()
    if konu:
        return f"Bu evrak {konu} konusuyla ilgili bir taleptir."
    return (state.get("evrak_text", "") or "")[:300]


async def mevzuat_dogrula_node(state: dict[str, Any]) -> dict[str, Any]:
    """Mevzuat önerilerini NLI entailment ile gerekçelendir (ENV-gated, graceful, additive)."""
    if not NLI_ENABLED:
        return {}  # baseline: NLI kapalı → mevzuat_oner birebir korunur
    oneriler = state.get("mevzuat_onerileri") or []
    if not oneriler:
        return {}
    hyp = _hypothesis(state)
    try:
        sonuc: list[dict[str, Any]] = []
        for o in oneriler:
            premise = str(o.get("snippet") or o.get("baslik") or "")
            skor = _entailment_skor(premise, hyp)
            gecerli = skor >= NLI_ESIK
            sonuc.append({
                "baslik": o.get("baslik"),
                "entailment": gecerli,
                "skor": round(float(skor), 3),
                "etiket": "destekleniyor" if gecerli else "[DOĞRULA: anlamsal destek zayıf]",
            })
    except Exception as exc:  # transformers/model yok → graceful passthrough
        log.warning(
            "mevzuat_dogrula.nli_unavailable_fallback", hata=str(exc),
            not_="NLI modeli yok (transformers + rag extra gerekir) → doğrulama atlandı.",
        )
        return {}
    log.info("mevzuat_dogrula", n=len(sonuc),
             gecerli=sum(1 for s in sonuc if s["entailment"]))
    return {"mevzuat_nli": sonuc}


__all__ = ("mevzuat_dogrula_node",)
