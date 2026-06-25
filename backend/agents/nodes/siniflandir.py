"""Görev 1 — Evrak türü sınıflandırma node'u.

# TODO(kamu-evrak): Bu STUB keyword-heuristik kullanır. Üretimde:
#   1) few-shot LLM (get_llm, JSON-schema çıktı) BİRİNCİL — ADALET nodes/triaj.py deseni,
#   2) opsiyonel DistilBERTurk kademe (ablation/yenilikçilik),
#   3) abstention: düşük güven → "belirsiz" (kendi-tanımlı kapalı-küme manipülasyonu önlenir).
# Etiket kümesi config.EVRAK_TURLERI (resmî kaynağa dayalı — docs/02).
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import EVRAK_TURU_TR
from core.text import tr_lower

log = structlog.get_logger()

# Keyword → evrak türü (öncelik sıralı; ilk eşleşen kazanır).
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


async def siniflandir_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak metninden türü belirle (STUB: keyword; üretimde few-shot LLM)."""
    text = tr_lower(state.get("evrak_text", ""))
    if not text.strip():
        return {"evrak_turu": "belirsiz", "tur_confidence": 0.0,
                "tur_reasoning": "boş metin"}

    # "İlgi" alanı + resmî başlık → cevabi yazı; yalnız resmî başlık → üst yazı.
    if "i̇lgi" in text or "ilgi :" in text or "ilgi:" in text:
        if "sayı" in text or "t.c." in text:
            return {"evrak_turu": "cevabi_yazi", "tur_confidence": 0.6,
                    "tur_reasoning": "İlgi atfı + resmî başlık (cevabi yazı)"}

    for kw, turu in _KEYWORDS:
        if tr_lower(kw) in text:
            log.info("siniflandir", turu=turu, kw=kw)
            return {"evrak_turu": turu, "tur_confidence": 0.6,
                    "tur_reasoning": f"anahtar sözcük: '{kw}'"}

    if "sayı" in text and "t.c." in text:
        return {"evrak_turu": "ust_yazi", "tur_confidence": 0.5,
                "tur_reasoning": "resmî başlık (T.C. + Sayı)"}

    return {"evrak_turu": "belirsiz", "tur_confidence": 0.3,
            "tur_reasoning": f"eşleşme yok (abstention); etiketler: {list(EVRAK_TURU_TR)[:5]}..."}


__all__ = ("siniflandir_node",)
