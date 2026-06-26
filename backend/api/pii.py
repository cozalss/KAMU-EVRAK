"""PII maskeleme — log ve çıktı güvenliği (CLAUDE.md §2: gerçek PII ASLA ham).

`core/logging.py` `_mask_pii_in_strings` processor'u `mask_pii(value)` çağırır ve dönen
nesnenin `.has_pii` / `.masked_text` / `.counts` alanlarını kullanır → bu arayüz KORUNMALI.
Yapılandırılmış log'lara sızabilecek TCKN/telefon/IBAN maskelenir (savunma derinliği).
Node-seviyesi maskeleme (`agents/nodes/cikar.py`) AYRI ve birincildir; bu log katmanıdır.

`mask_pii` KENDİSİ LOG ETMEZ → core/logging re-entrancy guard'ı için güvenli (no-op).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# IBAN ÖNCE (TR + 24 hane; içindeki hane dizilerini maskeler) → sonra TCKN → sonra telefon.
_RE_IBAN = re.compile(r"\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b", re.IGNORECASE)
_RE_TCKN = re.compile(r"\b[1-9]\d{10}\b")               # 11 hane
_RE_TEL = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("iban", _RE_IBAN), ("tckn", _RE_TCKN), ("telefon", _RE_TEL),
)


@dataclass(frozen=True, slots=True)
class MaskResult:
    """mask_pii çıktısı — core/logging bu arayüze bağlı."""

    masked_text: str
    has_pii: bool
    counts: dict[str, int]


def _mask(s: str) -> str:
    """İlk 3 + son 2 görünür, ortası yıldız (kısa değer tümü yıldız). Boşluk sökülür."""
    compact = re.sub(r"\s", "", s)
    if len(compact) <= 5:
        return "*" * len(compact)
    return f"{compact[:3]}{'*' * (len(compact) - 5)}{compact[-2:]}"


def mask_pii(text: str) -> MaskResult:
    """Metindeki TCKN/telefon/IBAN'ı maskele → MaskResult(masked_text, has_pii, counts)."""
    if not isinstance(text, str) or not text:
        return MaskResult(text if isinstance(text, str) else "", False, {})
    counts: dict[str, int] = {}
    out = text
    for label, pat in _PATTERNS:
        out, n = pat.subn(lambda m: _mask(m.group(0)), out)
        if n:
            counts[label] = n
    return MaskResult(out, bool(counts), counts)


def has_pii(text: str) -> bool:
    """Metinde maskelenecek PII var mı? (hızlı kontrol)."""
    return isinstance(text, str) and bool(
        _RE_TCKN.search(text) or _RE_TEL.search(text) or _RE_IBAN.search(text),
    )


__all__ = ("MaskResult", "has_pii", "mask_pii")
