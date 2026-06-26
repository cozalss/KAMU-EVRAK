"""Görev 2 (yenilikçilik) — Risk bandı (trafik ışığı) + koşullu HITL kapısı.

Kamu gerçeği: kurum "yapay zeka çıktısını gözden geçirmeden gönderemeyiz" der. Bu node
üretilen resmî yazıya bir TRAFİK IŞIĞI atar ve koşullu onayı tetikler:

  🟢 YEŞİL  (yayın-hazır): her şey kaynaktan, format tam, şüphe yok → memur uğraşmaz.
  🟡 SARI   (memur incelesin): format eksik / [DOĞRULA] / düşük güven / eksik zorunlu alan.
  🔴 KIRMIZI(uydurma şüphesi): verify metinde OLMAYAN somut tarih/sayı yakaladı → onaysız gitmez.

Koşullu onay (graph._risk_route): YEŞİL otomatik geçer; SARI/KIRMIZI memur onayına (onay_kapisi
interrupt) düşer. Banka mantığı: küçük havale anında, büyük havale "emin misiniz?". Karar
hash-chain denetim izine (denetim_izi) düşer → "kim neyi onayladı" → denetlenebilir güven.

Tasarım: DETERMİNİSTİK — bandı `verify`'nin ürettiği sinyallerden (verify_uyari, format_uyumlu)
+ eksik_alanlar + tür güveni + taslaktaki [DOĞRULA] sayısından türetir. LLM YOK → halüsinasyon
yok, banttan bant farklı çıkmaz. ADDITIVE: yalnız risk_metadata ekler (state'i bozmaz →
denetim_izi hash-chain'i kırılmaz). ENV-gated (RISK_GUARD_ENABLED); kapalı → no-op.

Çıktı SÖZLEŞMESİ (frontend RiskBandCard ile eşleşir — anahtarlar SABİT):
    risk_metadata = {
        "bant": "yesil"|"sari"|"kirmizi",
        "skor": float,              # 0..1 (görsel sıralama)
        "gerekceler": list[str],    # bandın NEDEN'leri (memura okunur)
        "oneri": str,               # eylem önerisi
    }
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import RISK_GUARD_ENABLED, RISK_GUVEN_ESIK
from api.pii import mask_pii

log = structlog.get_logger()

# verify_uyari içindeki uydurma sinyalinin imzası (verify.py _uydurma_veto mesajı).
_UYDURMA_IMZA = "kaynak evrakta yok"
_EKSIK_IMZA = "Eksik bölüm"

_ONERI: dict[str, str] = {
    "yesil": "Yayın-hazır — içerik kaynaktan, format tam; memur onayına gerek yok.",
    "sari": "Memur incelemesi önerilir — eksik/belirsiz noktalar var; gönderim öncesi göz atın.",
    "kirmizi": "Memur onayı ZORUNLU — uydurma şüphesi yakalandı; teyit edilmeden gönderilmemeli.",
}
_SKOR: dict[str, float] = {"yesil": 0.1, "sari": 0.5, "kirmizi": 0.9}


def compute_risk(
    verify_uyari: list[str],
    *,
    format_uyumlu: bool,
    eksik_alanlar: list[str],
    tur_confidence: float,
    evrak_turu: str,
    taslak: str,
) -> dict[str, Any]:
    """verify sinyalleri + tamlık → risk bandı (SAF, deterministik).

    Öncelik: uydurma (KIRMIZI) > eksik/belirsiz (SARI) > temiz (YEŞİL). Uydurma baskındır:
    hem uydurma hem eksik varsa KIRMIZI (CLAUDE.md §1 — somut uydurma en yüksek risk).
    """
    uyarilar = verify_uyari or []
    uydurma = [u for u in uyarilar if _UYDURMA_IMZA in u]
    if uydurma:
        gerekceler = [f"Uydurma şüphesi — {u}" for u in uydurma]
        return {"bant": "kirmizi", "skor": _SKOR["kirmizi"],
                "gerekceler": gerekceler, "oneri": _ONERI["kirmizi"]}

    sari: list[str] = [u for u in uyarilar if u.startswith(_EKSIK_IMZA)]
    if format_uyumlu is False and not sari:
        sari.append("Resmî yazı zorunlu format bölümleri eksik")
    dogrula = taslak.count("[DOĞRULA")
    if dogrula:
        sari.append(f"{dogrula} alan doğrulanmalı ([DOĞRULA] işareti)")
    if eksik_alanlar:
        sari.append(f"Eksik zorunlu bilgi: {', '.join(eksik_alanlar[:3])}")
    if evrak_turu == "belirsiz":
        sari.append("Evrak türü belirsiz (sınıflandırma abstention)")
    elif tur_confidence is not None and tur_confidence < RISK_GUVEN_ESIK:
        # 0.0 dahil — "hiç güven yok" da SARI'dır (falsy tuzağına düşme).
        sari.append(f"Düşük sınıflandırma güveni ({tur_confidence:.2f})")

    if sari:
        return {"bant": "sari", "skor": _SKOR["sari"], "gerekceler": sari, "oneri": _ONERI["sari"]}
    return {"bant": "yesil", "skor": _SKOR["yesil"],
            "gerekceler": ["Tüm doğrulamalar temiz — kaynaktan, format tam, uydurma yok."],
            "oneri": _ONERI["yesil"]}


async def risk_guard_node(state: dict[str, Any]) -> dict[str, Any]:
    """Risk bandını üret (additive). Koşullu onay graph._risk_route ile bağlanır."""
    if not RISK_GUARD_ENABLED:
        return {}  # node grafta yoksa buraya gelinmez; çift-guard (baseline güvence)
    # tur_confidence: None → 1.0 (yok sayma); 0.0 KORUNUR ("hiç güven yok" gerçek sinyal).
    _conf = state.get("tur_confidence")
    meta = compute_risk(
        state.get("verify_uyari", []),
        format_uyumlu=bool(state.get("format_uyumlu", True)),
        eksik_alanlar=state.get("eksik_alanlar", []) or [],
        tur_confidence=1.0 if _conf is None else float(_conf),
        evrak_turu=state.get("evrak_turu", "belirsiz"),
        taslak=state.get("yazi_taslak_md", "") or "",
    )
    # PII güvenliği (CLAUDE.md §2): gerekçeler verify_uyari'dan türer; uydurma sayı/tarih
    # token'ı TCKN-şekilli olabilir → arayüze/onaya gitmeden maskele.
    meta["gerekceler"] = [mask_pii(g).masked_text for g in meta["gerekceler"]]
    log.info("risk_guard", bant=meta["bant"], n_gerekce=len(meta["gerekceler"]))
    return {"risk_metadata": meta}


__all__ = ("compute_risk", "risk_guard_node")
