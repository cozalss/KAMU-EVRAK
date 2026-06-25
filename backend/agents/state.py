"""LangGraph EvrakState — kamu-evrak pipeline'ının paylaşılan durum modeli.

ADALET-AGENT `agents/state.py` deseninden ADAPT: TypedDict + `operator.add` /
union-dedup reducer'lar KEEP; `Domain`/`Citation` (hukuk) yerine evrak-iş-akışı
alanları (evrak türü, bilgi unsurları, eksik alanlar, mevzuat önerisi, birim,
yazı taslağı). Görev 1 + Görev 2'yi tek uçtan-uca state ile kapsar.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, NotRequired, TypedDict


def _merge_dict(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """dict reducer — paralel node'lar (mevzuat_oner + ozetle) aynı state'e fan-in."""
    if not left:
        return right
    if not right:
        return left
    return {**left, **right}


class MevzuatOneri(TypedDict):
    """Önerilen mevzuat/yazışma kuralı referansı."""

    baslik: str          # "3071 sayılı Dilekçe Hakkı Kanunu m.4"
    snippet: NotRequired[str]
    url: NotRequired[str]
    score: NotRequired[float]


class EvrakState(TypedDict):
    # --- Giriş (OCR/route tarafından doldurulur) ---
    evrak_text: str
    filename: NotRequired[str]
    ocr_engine: NotRequired[str]
    page_count: NotRequired[int]
    ocr_confidence: NotRequired[float | None]

    # --- Görev 1: sınıflandırma + içerik analizi ---
    evrak_turu: NotRequired[str]            # EVRAK_TURLERI'nden biri
    tur_confidence: NotRequired[float]
    tur_reasoning: NotRequired[str]
    bilgi_unsurlari: Annotated[dict[str, Any], _merge_dict]  # gonderen/tarih/sayi/konu/talep...
    eksik_alanlar: NotRequired[list[str]]   # ZORUNLU_ALANLAR'dan eksik olanlar
    mevzuat_onerileri: Annotated[list[MevzuatOneri], operator.add]
    ozet: NotRequired[str]

    # --- Görev 2: resmî yazı taslaklama + birim yönlendirme ---
    hedef_birim: NotRequired[str]           # BIRIMLER'den biri
    birim_alternatifleri: NotRequired[list[str]]
    birim_reasoning: NotRequired[str]
    yazi_turu: NotRequired[str]             # YAZI_TURLERI'nden biri
    yazi_taslak_md: NotRequired[str]
    yazi_taslak_pdf_bytes: NotRequired[bytes | None]
    yazi_taslak_pdf_filename: NotRequired[str]
    yazi_taslak_docx_bytes: NotRequired[bytes | None]
    yazi_taslak_docx_filename: NotRequired[str]
    # Eksik bilgi varsa kullanıcıya sorulacak takip soruları (dur-ve-sor).
    clarify_questions: NotRequired[list[str]]

    # --- Doğrulama / kalite ---
    format_uyumlu: NotRequired[bool]        # resmî yazı zorunlu-alan checklist
    verify_notes: NotRequired[str]

    # --- Çıkış ---
    response: NotRequired[str]              # kullanıcıya özet bilgilendirme
    bilgilendirme: NotRequired[str]
    errors: Annotated[list[str], operator.add]


def make_initial_state(evrak_text: str, *, filename: str = "", **meta: Any) -> EvrakState:
    """Boş EvrakState — tüm reducer alanları başlatılır (TypedDict KeyError önlenir)."""
    return EvrakState(
        evrak_text=evrak_text,
        filename=filename,
        bilgi_unsurlari={},
        mevzuat_onerileri=[],
        eksik_alanlar=[],
        errors=[],
        **meta,
    )


__all__ = ("EvrakState", "MevzuatOneri", "make_initial_state")
