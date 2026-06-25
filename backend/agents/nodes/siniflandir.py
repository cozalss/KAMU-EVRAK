"""Görev 1 — Evrak türü sınıflandırma node'u (LLM-birincil + keyword fallback).

Akış (CLAUDE.md v2.3): few-shot LLM JSON-schema çıktı BİRİNCİL (kapalı-küme
config.EVRAK_TURLERI); LLM yok/mock/hata → keyword-heuristik fallback (deterministik,
anahtarsız demo çalışır). Düşük güvende "belirsiz" (abstention — kendi-tanımlı
kapalı-küme F1 manipülasyon algısını önle; docs/02 §1).
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import EVRAK_TURLERI, EVRAK_TURU_TR
from agents.nodes._llm_extract import llm_json
from core.text import tr_lower

log = structlog.get_logger()

# LLM güven eşiği — altında "belirsiz"e abstain (kapalı-küme manipülasyon koruması).
_ABSTAIN_THRESHOLD = 0.45
_VALID_TURLER = set(EVRAK_TURLERI)

# Keyword → evrak türü (öncelik sıralı; ilk eşleşen kazanır) — LLM-yok fallback.
_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("bilgi edinme", "bilgi_edinme"), ("4982", "bilgi_edinme"),
    ("cimer", "cimer"),
    ("şikayet", "sikayet"), ("şikâyet", "sikayet"),
    ("ihbar", "ihbar"),
    ("tebligat", "tebligat"), ("tebliğ", "tebligat"),
    ("müzekkere", "muzekkere"),
    ("haciz", "icra_evraki"), ("icra", "icra_evraki"),
    ("duruşma", "dava_evraki"), ("dava dilekçe", "dava_evraki"), ("mahkeme", "dava_evraki"),
    ("fatura", "fatura"),
    ("tutanak", "tutanak"),
    ("mütalaa", "gorus_mutalaa"), ("hukuki görüş", "gorus_mutalaa"),
    ("olur", "genelge_talimat_olur"), ("genelge", "genelge_talimat_olur"),
    ("talimat", "genelge_talimat_olur"),
    ("rapor", "rapor"),
    ("başvuru", "basvuru"),
    ("dilekçe", "dilekce"), ("talep ederim", "dilekce"), ("arz ederim", "dilekce"),
)

# Few-shot LLM prompt — kapalı-küme + abstention talimatı (uydurma sınıf üretilemez).
_SYSTEM = (
    "Sen Türk kamu kurumlarında gelen evrakı sınıflandıran bir uzman asistansın. "
    "Verilen evrak metnini SADECE şu kapalı listeden BİR türe ata:\n"
    f"{', '.join(EVRAK_TURLERI)}\n\n"
    "Kurallar:\n"
    "- Liste DIŞINDA tür UYDURMA.\n"
    "- Emin değilsen 'belirsiz' seç ve düşük güven ver (abstention).\n"
    "- 'dilekçe' serbest vatandaş talebidir; 'bilgi_edinme' özel olarak MEVCUT kayda "
    "erişim talebidir (4982) — karıştırma.\n"
    "- 'İlgi' atfı + resmî T.C. başlık → cevabi_yazi; yalnız resmî başlık → ust_yazi.\n\n"
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"evrak_turu": "<tür>", "tur_confidence": <0..1>, "tur_reasoning": "<kısa gerekçe>"}'
)


def _heuristik(text: str) -> dict[str, Any]:
    """Keyword + resmî-başlık heuristiği (LLM-yok fallback) — eski stub mantığı korunur."""
    if "i̇lgi" in text or "ilgi :" in text or "ilgi:" in text:
        if "sayı" in text or "t.c." in text:
            return {"evrak_turu": "cevabi_yazi", "tur_confidence": 0.6,
                    "tur_reasoning": "İlgi atfı + resmî başlık (cevabi yazı) [heuristik]"}
    for kw, turu in _KEYWORDS:
        if tr_lower(kw) in text:
            return {"evrak_turu": turu, "tur_confidence": 0.6,
                    "tur_reasoning": f"anahtar sözcük: '{kw}' [heuristik]"}
    if "sayı" in text and "t.c." in text:
        return {"evrak_turu": "ust_yazi", "tur_confidence": 0.5,
                "tur_reasoning": "resmî başlık (T.C. + Sayı) [heuristik]"}
    return {"evrak_turu": "belirsiz", "tur_confidence": 0.3,
            "tur_reasoning": f"eşleşme yok (abstention); etiketler: {list(EVRAK_TURU_TR)[:5]}..."}


def _from_llm(obj: dict[str, Any]) -> dict[str, Any] | None:
    """LLM JSON'unu doğrula → geçerli kapalı-küme türü + abstention; geçersiz → None."""
    turu = str(obj.get("evrak_turu", "")).strip()
    if turu not in _VALID_TURLER:
        return None
    try:
        conf = float(obj.get("tur_confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    reasoning = str(obj.get("tur_reasoning", "") or "LLM sınıflandırması").strip()[:240]
    if turu != "belirsiz" and conf < _ABSTAIN_THRESHOLD:  # abstention kapısı
        return {"evrak_turu": "belirsiz", "tur_confidence": conf,
                "tur_reasoning": f"düşük güven ({conf:.2f}) → belirsiz; LLM önerisi: {turu}"}
    return {"evrak_turu": turu, "tur_confidence": conf, "tur_reasoning": reasoning}


async def siniflandir_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak türünü belirle — LLM-birincil (kapalı-küme + abstention), keyword fallback."""
    raw = state.get("evrak_text", "")
    text = tr_lower(raw)
    if not text.strip():
        return {"evrak_turu": "belirsiz", "tur_confidence": 0.0, "tur_reasoning": "boş metin"}

    obj = await llm_json(_SYSTEM, raw[:6000], max_tokens=200)
    if obj is not None and (result := _from_llm(obj)) is not None:
        log.info("siniflandir", turu=result["evrak_turu"],
                 conf=result["tur_confidence"], source="llm")
        return result

    result = _heuristik(text)
    log.info("siniflandir", turu=result["evrak_turu"], source="heuristik")
    return result


__all__ = ("siniflandir_node",)
