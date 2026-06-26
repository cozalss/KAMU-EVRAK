"""Görev 2 (yenilikçilik) — Memur onay kapısı (human-in-the-loop / HITL).

Kamu gerçeği: resmî yazı GÖNDERİLMEDEN önce yetkili memur ONAYLAR (ıslak/e-imza). Bu
node, AI'ın ürettiği taslağı memurun denetimine sunan ajan karşılığıdır: yazi_taslak
sonrası LangGraph `interrupt()` ile akışı DURDURUR, memurun kararını bekler:
  - ONAYLA  → taslak olduğu gibi verify/arşiv'e akar (onay_durumu="onaylandı").
  - DÜZENLE → memurun düzelttiği gövde state'e yazılır, akış onunla sürer.
  - REDDET  → gerekçe kaydedilir (onay_durumu="reddedildi"); jüriye şeffaf.

clarifier "EKSİK BİLGİ sorar" (üretim ÖNCESİ); onay_kapisi "ÜRETİLEN çıktıyı insana
imzalatır" (üretim SONRASI) → farklı katman, kamu imza akışının ajan karşılığı.

ENV-gated (HITL_ENABLED): yalnız açıkken + checkpointer'lı grafa eklenir → baseline
(kesintisiz) akış birebir korunur. `interrupt()` checkpointer ister (build_graph verir).

Resume sözleşmesi — `Command(resume=...)` değeri:
    {"secim": "onayla"|"duzenle"|"reddet", "metin": "<düzenlenmiş gövde>", "gerekce": "<red gerekçesi>"}
"""

from __future__ import annotations

from typing import Any

import structlog
from langgraph.types import interrupt

from agents.config import HITL_ENABLED

log = structlog.get_logger()


async def onay_kapisi_node(state: dict[str, Any]) -> dict[str, Any]:
    """Taslağı memur onayına sun — interrupt() ile dur, karara göre devam et."""
    if not HITL_ENABLED:
        return {}  # node grafta yoksa buraya gelinmez; çift-guard (baseline güvence)

    # Risk bandı (varsa) interrupt'a taşınır → memur NEDEN durduğunu görür (koşullu onay).
    risk = state.get("risk_metadata") or {}
    karar = interrupt({
        "tip": "memur_onay",
        "mesaj": "Resmî yazı taslağı hazır. Onaylıyor, düzenliyor ya da reddediyor musunuz?",
        "taslak": state.get("yazi_taslak_md", ""),
        "yazi_turu": state.get("yazi_turu", ""),
        "risk_band": risk.get("bant", ""),
        "risk_gerekceler": risk.get("gerekceler", []),
        "secenekler": ["onayla", "duzenle", "reddet"],
    })

    secim = str((karar or {}).get("secim", "onayla")).strip().lower()
    if secim == "duzenle":
        yeni = str((karar or {}).get("metin", "") or "").strip()
        out: dict[str, Any] = {"onay_durumu": "düzenlendi"}
        if yeni:
            out["yazi_taslak_md"] = yeni  # memur gövdesi taslağı ezer (insan otoritesi)
        log.info("onay_kapisi", karar="duzenle", metin_uzunluk=len(yeni))
        return out
    if secim == "reddet":
        gerekce = str((karar or {}).get("gerekce", "") or "").strip()
        log.info("onay_kapisi", karar="reddet")
        return {"onay_durumu": "reddedildi", "onay_gerekce": gerekce}

    log.info("onay_kapisi", karar="onayla")
    return {"onay_durumu": "onaylandı"}


__all__ = ("onay_kapisi_node",)
