"""Mevzuat önerisi şeffaflık zenginleştirme (B2) — kaynak/güven/dayanak yüzeye çıkar.

"Kaynak göstermeyen öneri = güven kaybı" (kamu kullanımı). Bu modül pipeline state'inden
HER ZAMAN üretilebilen sinyalleri (retrieval skoru + [DOĞRULA] işareti + dayanak cümlesi)
ile NLI (varsa, ENV-gated) birleştirip her öneriye güven seviyesi + "insan incelemesi
önerilir" bayrağı ekler. SIFIR UYDURMA (CLAUDE.md §1): yürürlük yalnız başlıkta zaten VAR
olan parantezli sürümden alınır (örn. '(CB 2646/2020)'); üretilmez.
"""
from __future__ import annotations

import re
from typing import Any

# Başlıkta zaten bulunan parantezli sürüm/yıl (uydurma değil — kaynak metni yüzeye çıkarır).
_YURURLUK_RE = re.compile(r"\(([^()]*\b(?:19|20)\d{2}\b[^()]*)\)")
_GUVEN_YUKSEK = 0.6   # ScoreBar eşiğiyle uyumlu (%60)
_GUVEN_ORTA = 0.4


def _yururluk(baslik: str) -> str:
    m = _YURURLUK_RE.search(baslik or "")
    return m.group(1).strip() if m else ""


def _guven(score: float, dogrula: bool, nli_destek: bool | None) -> tuple[str, bool]:
    """(güven_seviyesi, inceleme_oner). NLI > [DOĞRULA] > retrieval skoru önceliği."""
    if nli_destek is False:               # NLI açık + anlamsal destek YOK → en zayıf
        return "düşük", True
    if dogrula:                           # [DOĞRULA] işareti → memur teyit etsin
        return "orta", True
    if score >= _GUVEN_YUKSEK:
        return "yüksek", False
    if score >= _GUVEN_ORTA:
        return "orta", False
    return "düşük", True


def zenginlestir_mevzuat(state: dict[str, Any]) -> list[dict[str, Any]]:
    """state.mevzuat_onerileri → şeffaflık alanları eklenmiş liste (additive; sıra korunur)."""
    oneriler = state.get("mevzuat_onerileri") or []
    nli = {str(n.get("baslik", "")): n for n in (state.get("mevzuat_nli") or [])}
    konu = str((state.get("bilgi_unsurlari") or {}).get("konu") or "").strip()
    dayanak = f"“{konu}” talebi" if konu else "evrak içeriği"

    out: list[dict[str, Any]] = []
    for o in oneriler:
        baslik = str(o.get("baslik", "") or "")
        snippet = o.get("snippet")
        dogrula = "[DOĞRULA" in baslik or "[DOĞRULA" in str(snippet or "")
        n = nli.get(baslik)
        nli_destek = bool(n.get("entailment")) if n else None
        score = float(o.get("score") or 0)
        guven, incele = _guven(score, dogrula, nli_destek)
        out.append({
            "baslik": baslik, "snippet": snippet, "url": o.get("url"), "score": score,
            "dayanak": dayanak, "guven": guven, "inceleme_oner": incele,
            "dogrula": dogrula, "nli_etiket": (n.get("etiket", "") if n else ""),
            "yururluk": _yururluk(baslik),
            "atif_genisletme": bool(o.get("atif_genisletme")),
        })
    return out


__all__ = ("zenginlestir_mevzuat",)
