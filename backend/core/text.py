"""Hafif metin yardımcıları — AĞIR bağımlılık YOK (torch/qdrant/transformers çekmez).

ADALET-AGENT `core/text.py` (tr_lower) + `retrieval/chunker.sanitize_text` birleşimi.
kamu-evrak'ta `sanitize_text`'i buraya taşıdık ki `multimodal/` (OCR) `retrieval/`
paketini import etmek zorunda kalmasın (retrieval/__init__ ağır modülleri eager yükler).

Yalnız stdlib (`unicodedata`) kullanır → her yerde (policy/node/api) güvenle paylaşılır.
"""

from __future__ import annotations

import re
import unicodedata

# Yön. 2646 m.11 — Sayı üç bileşeni: DETSİS(6+ hane) - SDP kodu - kayıt no ('-' ayraçlı,
# elektronik belgede 'E-' önekli). 6+ hane eşiği ISO-tarih ("2026-07-02") yanlış-pozitifini
# eler ve cikar/verify'daki mevcut sayı desenleriyle hizalıdır. Tek kaynak: yazi_lint +
# tutarlilik buradan import eder (DRY).
SAYI_UC_BILESEN_RE = re.compile(r"E?-?\d{6,}-[\d.]+-\d+")


def tr_lower(s: str) -> str:
    """Türkçe-doğru küçük harf: İ→i, I→ı.

    Python `str.lower()` "İ"yi combining nokta'lı "i̇" yapar (anahtar eşleşmelerini
    bozar) ve "I"yı "i" yapar (Türkçe'de "ı" olmalı). Önce İ/I eşlenir, sonra lower().
    """
    return s.replace("İ", "i").replace("I", "ı").lower()


# Latin-1-in-UTF-8 Mojibake: PDF/Word kaynaklı evraklarda sık görülür.
_MOJIBAKE_FIXES = (
    ("Ã§", "ç"), ("Ã‡", "Ç"),
    ("ÄŸ", "ğ"), ("Äž", "Ğ"),
    ("Ä±", "ı"), ("Ä°", "İ"),
    ("Ã¶", "ö"), ("Ã–", "Ö"),
    ("ÅŸ", "ş"), ("Åž", "Ş"),
    ("Ã¼", "ü"), ("Ãœ", "Ü"),
    ("â€™", "'"), ("â€œ", "\""), ("â€", "\""),
    ("â€“", "–"), ("â€”", "—"),
    ("Â ", " "),  # nbsp double-encoded
    ("\xa0", " "),  # nbsp → space
)


def sanitize_text(text: str) -> str:
    """Mojibake + control char temizliği — OCR/PDF/Word çıktısı için tutarlı NFC metin."""
    if not text:
        return text
    for bad, good in _MOJIBAKE_FIXES:
        if bad in text:
            text = text.replace(bad, good)
    # Unicode normalize NFC (Türkçe karakterler için tutarlı kompozisyon)
    text = unicodedata.normalize("NFC", text)
    # Control char strip (satır sonu + tab + boşluk hariç)
    text = "".join(ch for ch in text if ch.isprintable() or ch in "\n\t ")
    return text


__all__ = ("SAYI_UC_BILESEN_RE", "sanitize_text", "tr_lower")
