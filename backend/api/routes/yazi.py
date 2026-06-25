"""POST /yazi/taslak — Görev 2 resmî yazı taslağını PDF/DOCX olarak indir.

Frontend "PDF indir" / "DOCX indir" butonu bu endpoint'i çağırır: evrak metni
→ uçtan-uca pipeline (process_doc deseni) → state'teki `yazi_taslak_pdf_bytes` /
`yazi_taslak_docx_bytes` → `Response` ile `Content-Disposition: attachment`.

In-memory bytes (renderer.py reportlab/python-docx üretir; disk yok). bytes
üretilemezse (render altyapısı yok ya da boş metin) 422 döner — frontend
kullanıcıya not gösterir. Mock modda çalışır: gövde deterministik üretilir,
PDF/DOCX render kütüphaneleri varsa bytes döner.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from agents.graph import build_graph
from agents.state import make_initial_state
from api.schemas import MAX_EVRAK_CHARS, YaziTaslakRequest

log = structlog.get_logger()
router = APIRouter(prefix="/yazi", tags=["yazi"])

_graph_singleton: Any = None

# format → (state byte anahtarı, MIME, fallback dosya adı)
_FORMAT_MAP: dict[str, tuple[str, str, str]] = {
    "pdf": ("yazi_taslak_pdf_bytes", "application/pdf", "resmi-yazi-taslak.pdf"),
    "docx": (
        "yazi_taslak_docx_bytes",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "resmi-yazi-taslak.docx",
    ),
}


def _get_graph() -> Any:
    global _graph_singleton
    if _graph_singleton is None:
        _graph_singleton = build_graph()
    return _graph_singleton


def _safe_attachment_name(state: dict[str, Any], fmt: str, fallback: str) -> str:
    """Renderer'ın ASCII-güvenli ürettiği dosya adı; yoksa fallback (ASCII)."""
    name = state.get(f"yazi_taslak_{fmt}_filename") or ""
    name = str(name).replace('"', "").replace("\n", "").replace("\r", "")
    return name or fallback


@router.post("/taslak")
async def yazi_taslak(
    req: YaziTaslakRequest,
    format: str = Query("pdf", pattern="^(pdf|docx)$"),
) -> Response:
    """Evrak metninden resmî yazı taslağı üret, PDF/DOCX olarak indir."""
    byte_key, media_type, fallback = _FORMAT_MAP[format]

    text = (req.evrak_text or "").strip()[:MAX_EVRAK_CHARS]
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Evrak metni boş")

    state = make_initial_state(text, filename=req.filename)
    try:
        final = await _get_graph().ainvoke(state)
    except Exception as exc:  # noqa: BLE001 — pipeline hatasını kullanıcıya temiz ilet
        log.error("yazi_taslak_pipeline_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Taslak üretilemedi",
        ) from exc

    data = final.get(byte_key)
    if not data:
        # Render altyapısı (reportlab/python-docx) yok ya da bytes üretilmedi.
        log.warning("yazi_taslak_no_bytes", format=format)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{format.upper()} taslağı üretilemedi (render altyapısı eksik olabilir)",
        )

    filename = _safe_attachment_name(final, format, fallback)
    log.info("yazi_taslak_download", format=format, n_bytes=len(data), filename=filename)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


__all__ = ("router",)
