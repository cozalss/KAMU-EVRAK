"""Görev 1 (yenilikçilik) — Mevzuat atıf-gerekçelendirme (NLI entailment) node'u.

Anti-halüsinasyon DERİNLEŞTİRME: verify node uydurma tarih/sayıyı yüzeysel string ile
veto eder; bu node bir adım öteye gider → önerilen mevzuat MADDESİNİN (premise) evrak
TALEBİNE (hypothesis) anlamsal olarak DESTEK verip vermediğini NLI entailment ile ölçer.
Entailment zayıfsa öneri "[DOĞRULA: anlamsal destek zayıf]" işaretlenir (silinmez — recall
korunur; jüriye şeffaf). Bu, CLAUDE.md §1 (alakasız/uydurma madde önerme) için ölçülebilir
semantik kanıttır.

Tasarım (rerank deseni): ENV-gated (NLI_ENABLED, varsayılan KAPALI → baseline birebir korunur).
Sağlayıcı (NLI_PROVIDER, madde 12): "deepseek" (varsayılan — llm_json entailment, model
İNDİRMEZ; öneri başına 1 mini çağrı) | "model" (mDeBERTa, rag extra — eski yol birebir).
LLM yok/mock/bozuk-çıktı veya model/lib yoksa GRACEFUL passthrough (boş dict →
mevzuat_onerileri olduğu gibi kalır). Additive: yalnız `mevzuat_nli` ek alanı yazar;
mevzuat_onerileri'ne DOKUNMAZ (operator.add reducer duplikasyonunu önler).

Çıktı: {"mevzuat_nli": [{"baslik", "entailment": bool, "skor": float, "etiket": str}, ...]}
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import NLI_ENABLED, NLI_ESIK, NLI_MODEL, NLI_PROVIDER
from agents.nodes._llm_extract import llm_json, real_llm

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


def _premise(oneri: dict[str, Any]) -> str:
    """Öneriden premise metni (snippet öncelikli; yoksa başlık)."""
    return str(oneri.get("snippet") or oneri.get("baslik") or "")


# DeepSeek yolu premise bütçesi: mini çağrı maliyeti sınırlı kalsın (öneri başına 1 çağrı).
_DS_PREMISE_KR = 400

_DS_SYSTEM = (
    "Sen bir doğal dil çıkarımı (NLI) hakemisin. Verilen MEVZUAT MADDESİ (öncül), verilen "
    "EVRAK TALEBİ iddiasını (hipotez) anlamsal olarak DESTEKLİYOR mu? Yalnız şu JSON: "
    '{"entailment": true/false, "skor": <0.0-1.0 destek olasılığı>}'
)


def _gecerli_skor(obj: Any) -> float | None:
    """LLM çıktısını kapalı-küme doğrula → [0..1] skor; bozuk → None (körü körüne güvenme).

    skor alanı bozuk/eksik ama entailment kararı NET bool ise keskin skora (1.0/0.0) düşülür —
    tek alan bozulması bütün doğrulamayı düşürmesin; ikisi de bozuksa passthrough.
    """
    if not isinstance(obj, dict):
        return None
    skor = obj.get("skor")
    if isinstance(skor, (int, float)) and not isinstance(skor, bool) and 0.0 <= float(skor) <= 1.0:
        return float(skor)
    ent = obj.get("entailment")
    if isinstance(ent, bool):
        return 1.0 if ent else 0.0
    return None


async def _skorlar_deepseek(oneriler: list[dict[str, Any]], hyp: str) -> list[float] | None:
    """DeepSeek entailment (llm_json — model indirmez). LLM yok/mock/bozuk → None (passthrough)."""
    if real_llm() is None:
        return None  # mock/anahtarsız → LLM yolu hiç açılmaz (CI deterministik, sessiz passthrough)
    skorlar: list[float] = []
    for o in oneriler:
        obj = await llm_json(
            _DS_SYSTEM,
            f"MEVZUAT MADDESİ (öncül):\n{_premise(o)[:_DS_PREMISE_KR]}\n\n"
            f"EVRAK TALEBİ (hipotez): {hyp}",
            max_tokens=80,
        )
        skor = _gecerli_skor(obj)
        if skor is None:  # bozuk/şema-dışı çıktı → mevcut sessiz passthrough (öneriler korunur)
            log.warning("mevzuat_dogrula.deepseek_bozuk_passthrough", baslik=o.get("baslik"))
            return None
        skorlar.append(skor)
    return skorlar


def _skorlar_model(oneriler: list[dict[str, Any]], hyp: str) -> list[float] | None:
    """mDeBERTa yolu (eski davranış birebir): model/lib yok → None (graceful passthrough)."""
    try:
        return [_entailment_skor(_premise(o), hyp) for o in oneriler]
    except Exception as exc:  # transformers/model yok → graceful passthrough
        log.warning(
            "mevzuat_dogrula.nli_unavailable_fallback", hata=str(exc),
            not_="NLI modeli yok (transformers + rag extra gerekir) → doğrulama atlandı.",
        )
        return None


async def mevzuat_dogrula_node(state: dict[str, Any]) -> dict[str, Any]:
    """Mevzuat önerilerini NLI entailment ile gerekçelendir (ENV-gated, graceful, additive)."""
    if not NLI_ENABLED:
        return {}  # baseline: NLI kapalı → mevzuat_oner birebir korunur
    # CRAG düzeltmesi uygulandıysa gösterilen liste _corrected altındadır (crag.py) —
    # NLI, kullanıcıya gösterilen listeyi doğrulamalı, atılmış eski listeyi değil.
    # (finalize/self_rag/mevzuat_zenginlestir ile aynı "corrected-or-original" deseni.)
    oneriler = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []
    if not oneriler:
        return {}
    hyp = _hypothesis(state)
    if NLI_PROVIDER == "deepseek":
        skorlar = await _skorlar_deepseek(oneriler, hyp)
    else:
        skorlar = _skorlar_model(oneriler, hyp)
    if skorlar is None:
        return {}  # sağlayıcı kullanılamadı → passthrough (mevzuat_onerileri olduğu gibi)
    sonuc: list[dict[str, Any]] = []
    for o, skor in zip(oneriler, skorlar, strict=True):
        gecerli = skor >= NLI_ESIK
        sonuc.append({
            "baslik": o.get("baslik"),
            "entailment": gecerli,
            "skor": round(float(skor), 3),
            "etiket": "destekleniyor" if gecerli else "[DOĞRULA: anlamsal destek zayıf]",
        })
    log.info("mevzuat_dogrula", n=len(sonuc),
             gecerli=sum(1 for s in sonuc if s["entailment"]))
    return {"mevzuat_nli": sonuc}


__all__ = ("mevzuat_dogrula_node",)
