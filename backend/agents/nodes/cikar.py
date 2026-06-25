"""Görev 1 — Bilgi unsuru çıkarma node'u (gönderen, tarih, sayı, konu, talep, kurum, iletişim).

Akış: LLM JSON-mode YAPISAL alanları (gonderen/konu/talep/kurum/iletisim_adres/imza) çıkarır;
tarih/sayı + PII (TCKN/telefon) HER ZAMAN regex ile tespit edilir. LLM yok/mock/hata →
tam regex+keyword fallback (deterministik, anahtarsız demo çalışır).

PII GÜVENLİĞİ (CLAUDE.md §2): TCKN/telefon ASLA ham saklanmaz/döndürülmez. LLM'in
maskelemesine GÜVENİLMEZ — maskeleme deterministik regex ile uygulanır; LLM'in döndürdüğü
gonderen/konu alanları da PII-tarayıcıdan geçirilip maskelenir (sızıntı önlenir).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.nodes._llm_extract import llm_json

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")          # E-45678257-622.03-12345 vb.
_RE_TCKN = re.compile(r"\b[1-9]\d{10}\b")                 # 11 haneli — MASKELENİR
_RE_TEL = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")
_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
_RE_TALEP = re.compile(r"(talep ederim|rica ederim|arz ederim|gereğini|bilgilerinize)", re.IGNORECASE)

# LLM'in serbest-metin alanlarına TCKN/telefon sızarsa maskelemek için (sızıntı önle).
_PII_SCAN: tuple[re.Pattern[str], ...] = (_RE_TCKN, _RE_TEL)

_SYSTEM = (
    "Sen kamu evrakından yapısal bilgi çıkaran bir asistansın. Verilen evrak metninden "
    "şu alanları çıkar (yoksa null bırak — UYDURMA):\n"
    "- gonderen: gönderen kişi adı-soyadı veya tüzel kişi\n"
    "- kurum: gönderen/muhatap kurum adı (varsa)\n"
    "- konu: evrakın konusu (kısa)\n"
    "- talep: evrakta somut bir talep/istek var mı? (true/false)\n"
    "- iletisim_adres: bir iletişim/tebligat adresi var mı? (true/false)\n"
    "- imza: imza/e-imza ibaresi var mı? (true/false)\n\n"
    "TCKN, telefon, tarih, sayı çıkarma — bunlar ayrıca işlenir.\n"
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"gonderen": null, "kurum": null, "konu": null, "talep": false, '
    '"iletisim_adres": false, "imza": false}'
)


def _mask(s: str) -> str:
    """PII maskesi — ilk 3 + son 2 görünür, ortası yıldız."""
    if len(s) <= 5:
        return "*" * len(s)
    return f"{s[:3]}{'*' * (len(s) - 5)}{s[-2:]}"


def _scrub_pii(value: str) -> str:
    """Serbest-metin alanındaki ham TCKN/telefon'u maskele (LLM sızıntısına karşı)."""
    out = value
    for pat in _PII_SCAN:
        out = pat.sub(lambda m: _mask(re.sub(r"\s", "", m.group(0))), out)
    return out


def _regex_unsurlar(text: str) -> dict[str, Any]:
    """Deterministik tespit: PII maskeleme ÖNCE + tarih/sayı/konu + adres/imza/talep keyword.

    PII (TCKN/telefon) ÖNCE tespit edilir ve metinden REDAKTE edilir; sayı/konu çıkarımı bu
    redakte metinde koşar → açgözlü 'sayi' regex'i TCKN'yi ham yakalayamaz (sızıntı önlenir).
    """
    unsurlar: dict[str, Any] = {}
    # 1) PII — varlık işaretlenir, değer MASKELENİR (asla ham) + redakte metin kurulur.
    redacted = text
    if tckn := _RE_TCKN.search(text):
        unsurlar["tckn_maskeli"] = _mask(tckn.group(0))
        unsurlar["pii_var"] = True
    if tel := _RE_TEL.search(text):
        unsurlar["telefon_maskeli"] = _mask(re.sub(r"\s", "", tel.group(0)))
        unsurlar["pii_var"] = True
    redacted = _scrub_pii(text)  # TCKN/telefon span'ları maskeyle değiştir

    # 2) Yapısal alanlar — redakte metinde (sayi/konu ham PII yakalayamaz).
    if m := _RE_TARIH.search(redacted):
        unsurlar["tarih"] = m.group(0)
    if m := _RE_SAYI.search(redacted):
        unsurlar["sayi"] = m.group(0)
    if m := _RE_KONU.search(redacted):
        unsurlar["konu"] = m.group(1).strip()[:160]
    if _RE_TALEP.search(text):
        unsurlar["talep"] = True
    if re.search(r"\b(adres|mahalle|cadde|sokak|no:)\b", text, re.IGNORECASE):
        unsurlar["iletisim_adres"] = True
    if re.search(r"\b(imza|e-imza|elektronik imza)\b", text, re.IGNORECASE):
        unsurlar["imza"] = True
    return unsurlar


def _merge_llm(unsurlar: dict[str, Any], obj: dict[str, Any]) -> None:
    """LLM yapısal alanlarını birleştir (regex'i ezmeden; serbest-metin PII-scrub'lanır)."""
    for key in ("gonderen", "kurum", "konu"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip() and not unsurlar.get(key):
            unsurlar[key] = _scrub_pii(val.strip()[:160])
    for key in ("talep", "iletisim_adres", "imza"):
        if obj.get(key) is True and not unsurlar.get(key):
            unsurlar[key] = True


async def cikar_node(state: dict[str, Any]) -> dict[str, Any]:
    """Yapısal bilgi unsurlarını çıkar — LLM (semantik alanlar) + regex (tarih/sayı/PII)."""
    text = state.get("evrak_text", "")
    unsurlar = _regex_unsurlar(text)  # PII maskeleme HER ZAMAN deterministik

    obj = await llm_json(_SYSTEM, text[:6000], max_tokens=300)
    source = "regex"
    if obj is not None:
        _merge_llm(unsurlar, obj)
        source = "llm+regex"

    log.info("cikar", alanlar=list(unsurlar), pii=bool(unsurlar.get("pii_var")), source=source)
    return {"bilgi_unsurlari": unsurlar}


__all__ = ("cikar_node",)
