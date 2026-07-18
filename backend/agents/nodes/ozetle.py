"""Görev 1 — Evrak özeti node'u (LLM kısa-öz + deterministik kısaltma fallback).

Akış: LLM (get_llm) ile tür + konu + kilit unsurlara dayalı kısa, olgusal özet üretir;
LLM yok/mock/hata → tür + konu + ilk cümleler naif kısaltma fallback (deterministik,
anahtarsız demo çalışır). Mevzuat madde UYDURMA (CLAUDE.md §1) — özet yalnız evrak metnine
dayanır; LLM şüpheli madde no üretirse prompt'la engellenir, kalan risk fallback'te yok.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import evrak_turu_tr
from agents.nodes._llm_extract import llm_json
from api.pii import mask_for_llm, mask_pii

log = structlog.get_logger()

_SYSTEM = (
    "Sen kamu evrakını özetleyen bir asistansın. Verilen evrakı tek paragrafta, en fazla "
    "2-3 cümlede, resmî ve olgusal bir dille özetle. SADECE metinde geçenleri yaz — "
    "mevzuat maddesi veya kurum adı UYDURMA. Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"ozet": "<kısa özet>"}'
)


def _kilit_unsurlar(unsurlar: dict[str, Any]) -> str:
    """Özet prompt'una bağlam — çıkarılan kilit alanlar (ham PII YOK; zaten maskeli)."""
    parts = []
    for key, etiket in (("gonderen", "Gönderen"), ("kurum", "Kurum"),
                        ("konu", "Konu"), ("tarih", "Tarih")):
        if val := unsurlar.get(key):
            parts.append(f"{etiket}: {val}")
    return "; ".join(parts)


# Fallback özet gövdesi bu boyu aşarsa kelime sınırında kırpılır: tam gövdeyi
# aynen döndüren çıktı "özet" değildir (LLM'siz modda da kısa öz sözleşmesi korunur).
_FALLBACK_OZET_CHARS = 280


def _fallback_ozet(text: str, turu: str, konu: str | None) -> str:
    """Deterministik özet (LLM yok/hata) — tür + konu + KISALTILMIŞ gövde (PII redakteli)."""
    govde = " ".join(mask_pii(text).masked_text.split())
    if len(govde) > _FALLBACK_OZET_CHARS:
        kirpik = govde[:_FALLBACK_OZET_CHARS]
        bosluk = kirpik.rfind(" ")  # kelime ortasından kesme (yarım kelime yanıltır)
        govde = kirpik[: bosluk if bosluk > 0 else _FALLBACK_OZET_CHARS].rstrip() + " …"
    parcalar = [f"**{evrak_turu_tr(turu)}**"]
    if konu:
        parcalar.append(f"Konu: {konu}")
    parcalar.append(govde or "_metin boş_")
    return " — ".join(parcalar)


async def ozetle_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak için kısa öz özet üret — LLM-birincil, deterministik kısaltma fallback."""
    text = (state.get("evrak_text") or "").strip()
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = unsurlar.get("konu")

    if not text:
        return {"ozet": f"**{evrak_turu_tr(turu)}** — _metin boş_"}

    baglam = _kilit_unsurlar(unsurlar)
    # KVKK: LLM'e ham TCKN/telefon/IBAN gitmez (isim korunur → özet adı içerebilir).
    user = f"Tür: {evrak_turu_tr(turu)}\n{baglam}\n\nEvrak metni:\n{mask_for_llm(text, None)[:6000]}"
    obj = await llm_json(_SYSTEM, user, max_tokens=300, temperature=0.2)
    if obj is not None and isinstance(obj.get("ozet"), str) and obj["ozet"].strip():
        # LLM evrak metnindeki bir TCKN/telefonu ozetinde tekrarlayabilir (prompt bunu
        # acikca yasaklamiyor) — fallback yolu gibi burada da maskele (CLAUDE.md §5).
        llm_ozet = mask_pii(obj["ozet"].strip()).masked_text
        ozet = f"**{evrak_turu_tr(turu)}** — {llm_ozet}"
        log.info("ozetle", turu=turu, n_chars=len(ozet), source="llm")
        return {"ozet": ozet}

    ozet = _fallback_ozet(text, turu, konu)
    log.info("ozetle", turu=turu, n_chars=len(ozet), source="fallback")
    return {"ozet": ozet}


__all__ = ("ozetle_node",)
