"""Görev 1 — Bilgi unsuru çıkarma node'u (gönderen, tarih, sayı, konu, talep, iletişim).

# TODO(kamu-evrak): Bu STUB regex kullanır. Üretimde LLM JSON-schema çıktısı BİRİNCİL
# (yapısal alanlar için), regex (tarih/sayı/T.C. formatı) yardımcı; Stanza-tr NER opsiyonel.
# PII: TCKN/telefon ÇIKARILIR ama MASKELENİR (CLAUDE.md — gerçek PII saklanmaz/sızdırılmaz).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")          # E-45678257-622.03-12345 vb.
_RE_TCKN = re.compile(r"\b[1-9]\d{10}\b")                 # 11 haneli — MASKELENİR
_RE_TEL = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")
_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
_RE_TALEP = re.compile(r"(talep ederim|rica ederim|arz ederim|gereğini|bilgilerinize)", re.IGNORECASE)


def _mask(s: str) -> str:
    """PII maskesi — ilk 3 + son 2 görünür, ortası yıldız."""
    if len(s) <= 5:
        return "*" * len(s)
    return f"{s[:3]}{'*' * (len(s) - 5)}{s[-2:]}"


async def cikar_node(state: dict[str, Any]) -> dict[str, Any]:
    """Metinden yapısal bilgi unsurlarını çıkar (STUB: regex + PII maskeleme)."""
    text = state.get("evrak_text", "")
    unsurlar: dict[str, Any] = {}

    if m := _RE_TARIH.search(text):
        unsurlar["tarih"] = m.group(0)
    if m := _RE_SAYI.search(text):
        unsurlar["sayi"] = m.group(0)
    if m := _RE_KONU.search(text):
        unsurlar["konu"] = m.group(1).strip()[:160]
    if _RE_TALEP.search(text):
        unsurlar["talep"] = True

    # PII — varlığı işaretlenir, değer MASKELENİR.
    if tckn := _RE_TCKN.search(text):
        unsurlar["tckn_maskeli"] = _mask(tckn.group(0))
        unsurlar["pii_var"] = True
    if tel := _RE_TEL.search(text):
        unsurlar["telefon_maskeli"] = _mask(re.sub(r"\s", "", tel.group(0)))
        unsurlar["pii_var"] = True
    if re.search(r"\b(adres|mahalle|cadde|sokak|no:)\b", text, re.IGNORECASE):
        unsurlar["iletisim_adres"] = True
    if re.search(r"\b(imza|e-imza|elektronik imza)\b", text, re.IGNORECASE):
        unsurlar["imza"] = True

    log.info("cikar", alanlar=list(unsurlar))
    return {"bilgi_unsurlari": unsurlar}


__all__ = ("cikar_node",)
