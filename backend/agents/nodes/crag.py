"""Yenilikçilik — CRAG (Corrective Retrieval-Augmented Generation) öz-düzeltme node'u.

Akış: mevzuat_oner BM25 retrieval'ından SONRA çalışır. Retrieval GÜVENİ düşükse
(top normalize skor < CRAG_CONF_ESIK veya hiç sonuç yoksa) sorguyu GENİŞLETİP
mevzuat_oner'in aynı BM25 indeksini farklı sorguyla TEKRAR çağırır → daha alakalı
mevzuat önerisi. Düzeltme yapıldıysa `crag_corrected=True` işaretlenir (şeffaflık).

SOTA dayanak (Yan et al. 2024, "Corrective Retrieval Augmented Generation"):
düşük-güvenli retrieval'ı tespit edip sorgu-genişletme/yeniden-getirme ile düzelt.
Bizim uyarlamamızda "web arama" yerine LOKAL korpusta sorgu-genişletmeli yeniden-BM25
(kamu-evrak offline/mock modda çalışmalı — ağ bağımlılığı yok).

ENV-GATED: CRAG_ENABLED=0 (varsayılan) → no-op passthrough (boş dict döner, state
bozulmaz, baseline akış birebir korunur). Açıkken bile retrieval güveni yüksekse
düzeltme YAPMAZ (gereksiz iş yok) → yalnızca düşük-güvende devreye girer.

Return sözleşmesi: {"mevzuat_onerileri": [...]} (düzeltilmiş öneriler — operator.add
reducer ile fan-in olduğundan ÖNCEKİ önerilerin ÜZERİNE eklenmez; aşağıda not).
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import (
    CRAG_CONF_ESIK,
    CRAG_ENABLED,
    CRAG_RAW_ESIK,
    EVRAK_TO_MEVZUAT,
    EVRAK_TURU_TR,
)
from agents.nodes.mevzuat_oner import _from_config, _from_corpus, _MIN_QUERY_LEN

log = structlog.get_logger()


def _retrieval_guveni(oneriler: list[dict[str, Any]]) -> float:
    """Mevcut önerilerin retrieval güveni (0..1) — MUTLAK BM25 kalitesi temelli.

    mevzuat_oner korpus dalında `score` max-normalize'dir (top≈1.0) → güven sinyali
    OLAMAZ. Bu yüzden `raw_score` (normalizasyon öncesi ham BM25) kullanılır: ham top
    skor CRAG_RAW_ESIK'in üstündeyse güçlü eşleşme (güven→1.0'a yakın), altındaysa
    zayıf (sorgu hiçbir maddeye iyi değmedi → düzeltme adayı). Statik config fallback'te
    raw_score YOK → düşük güven (score≈0.3-0.5 normalize değerine düşülür).

    Hiç öneri yok → 0.0. Korpus top raw_score → min(top/ESIK, 1.0). config → score değeri.
    """
    if not oneriler:
        return 0.0
    raw = [float(o["raw_score"]) for o in oneriler if "raw_score" in o]
    if raw:
        return min(max(raw) / CRAG_RAW_ESIK, 1.0)
    # config fallback (raw_score yok): normalize score doğrudan güven proxy'si (0.3-0.5).
    return max((float(o.get("score", 0.0) or 0.0) for o in oneriler), default=0.0)


def _genisletilmis_sorgu(state: dict[str, Any]) -> str:
    """Düzeltme sorgusu — konu + tür + statik mevzuat başlıklarındaki anahtar terimler.

    Standart CRAG "query transform": ilk sorgu zayıf eşleştiğinde domain bilgisini
    (tür → beklenen mevzuat başlığı) sorguya enjekte ederek yeniden-getirmeyi yönlendir.
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    turu_key = (state.get("evrak_turu", "") or "").strip()
    turu = EVRAK_TURU_TR.get(turu_key, turu_key)
    # Türe ait statik mevzuat başlıkları sorguya domain-sinyali ekler (örn. "Dilekçe
    # Hakkı", "Bilgi Edinme") → korpusta doğru maddeye yönelir.
    domain_terimler = " ".join(EVRAK_TO_MEVZUAT.get(turu_key, []))
    body = (state.get("evrak_text", "") or "")[:600]
    return " ".join(p for p in (turu, konu, domain_terimler, body) if p).strip()


async def crag_node(state: dict[str, Any]) -> dict[str, Any]:
    """CRAG öz-düzeltme — düşük-güvenli retrieval'ı sorgu-genişletmeyle düzelt (ENV-gated)."""
    if not CRAG_ENABLED:
        return {}  # no-op: grafta var ama kapalı (baseline davranış birebir korunur)

    mevcut = list(state.get("mevzuat_onerileri") or [])
    guven = _retrieval_guveni(mevcut)
    if guven >= CRAG_CONF_ESIK:
        log.info("crag", durum="atlandi", guven=round(guven, 3), esik=CRAG_CONF_ESIK)
        return {"crag_corrected": False}

    sorgu = _genisletilmis_sorgu(state)
    duzeltilmis: list[dict[str, Any]] = []
    if len(sorgu) >= _MIN_QUERY_LEN:
        duzeltilmis = _from_corpus(sorgu)
    if not duzeltilmis:
        duzeltilmis = _from_config((state.get("evrak_turu", "") or "belirsiz"))

    yeni_guven = _retrieval_guveni(duzeltilmis)
    # Düzeltme yalnızca DAHA İYİ ise uygulanır (regresyon önleme — dürüstlük).
    if yeni_guven <= guven:
        log.info("crag", durum="iyilesme_yok", eski=round(guven, 3),
                 yeni=round(yeni_guven, 3))
        return {"crag_corrected": False}

    log.info("crag", durum="duzeltildi", eski=round(guven, 3),
             yeni=round(yeni_guven, 3), n=len(duzeltilmis))
    return {
        "mevzuat_onerileri_corrected": duzeltilmis,
        "crag_corrected": True,
        "crag_guven_oncesi": round(guven, 3),
        "crag_guven_sonrasi": round(yeni_guven, 3),
    }


__all__ = ("crag_node",)
