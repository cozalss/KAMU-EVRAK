"""POST /process_doc — evrakı uçtan-uca işle (Görev 1 + Görev 2).

İki mod (ADALET ask.py deseninden ADAPT):
  POST /process_doc          → tek seferlik blocking JSON (ProcessResponse)
  POST /process_doc/stream   → SSE; OCR + her pipeline node'u bittiğinde event yayar
                               (canlı Ajan Akış Şeması / "düşünen sistem" demosu — Demo 15p)

Girdi: multipart `file` (OCR yapılır) VEYA JSON `{evrak_text}`. LangGraph zinciri
compile-once; lazy singleton ile cache'lenir.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from agents.config import HITL_ENABLED
from agents.graph import PIPELINE_NODES, build_graph
from agents.state import make_initial_state
from api.middleware.ratelimit import rate_limit
from api.schemas import (
    MAX_EVRAK_CHARS,
    OnayResumeRequest,
    ProcessRequest,
    ProcessResponse,
)
from multimodal.ocr import extract_text

log = structlog.get_logger()
router = APIRouter(prefix="/process_doc", tags=["process_doc"])

_graph_singleton: Any = None
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def _get_graph() -> Any:
    global _graph_singleton
    if _graph_singleton is None:
        _graph_singleton = build_graph()
    return _graph_singleton


# HITL grafı AYRI singleton: InMemorySaver checkpointer ile derlenir → /process_doc ve
# /process_doc/resume ÇAĞRILARI ARASINDA state korunur (interrupt → memur kararı → resume).
_hitl_graph_singleton: Any = None


def _get_hitl_graph() -> Any:
    global _hitl_graph_singleton
    if _hitl_graph_singleton is None:
        from langgraph.checkpoint.memory import InMemorySaver
        _hitl_graph_singleton = build_graph(checkpointer=InMemorySaver())
    return _hitl_graph_singleton


def _sse(payload: dict[str, Any]) -> str:
    """JSON → SSE 'data:' satırı."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _ocr_or_text(
    file: UploadFile | None, evrak_text: str | None,
) -> tuple[str, dict[str, Any]]:
    """Dosya geldiyse OCR; yoksa düz metin. (text, ocr_meta) döner."""
    if file is not None:
        # DoS guard: üst sınır + 1 bayt oku → tüm dosyayı belleğe almadan büyük dosyayı yakala.
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Dosya çok büyük")
        res = await extract_text(data)
        return res.text, {"ocr_engine": res.engine, "page_count": res.page_count,
                          "ocr_confidence": res.confidence, "filename": file.filename or ""}
    return (evrak_text or ""), {}


def _to_response(state: dict[str, Any], ocr_meta: dict[str, Any]) -> ProcessResponse:
    return ProcessResponse(
        evrak_turu=state.get("evrak_turu", "belirsiz"),
        tur_confidence=state.get("tur_confidence", 0.0),
        bilgi_unsurlari=state.get("bilgi_unsurlari", {}),
        eksik_alanlar=state.get("eksik_alanlar", []),
        clarify_questions=state.get("clarify_questions", []),
        mevzuat_onerileri=state.get("mevzuat_onerileri", []),
        mevzuat_nli=state.get("mevzuat_nli", []),
        ozet=state.get("ozet", ""),
        hedef_birim=state.get("hedef_birim", ""),
        birim_alternatifleri=state.get("birim_alternatifleri", []),
        yazi_turu=state.get("yazi_turu", ""),
        yazi_taslak_md=state.get("yazi_taslak_md", ""),
        format_uyumlu=bool(state.get("format_uyumlu", False)),
        verify_uyari=state.get("verify_uyari", []),
        verify_notes=state.get("verify_notes", ""),
        bilgilendirme=state.get("bilgilendirme", ""),
        arsiv_metadata=state.get("arsiv_metadata", {}),
        sla_metadata=state.get("sla_metadata", {}),
        denetim_izi=state.get("denetim_izi", {}),
        kanit_metadata=state.get("kanit_metadata", {}),
        onay_durumu=state.get("onay_durumu", ""),
        onay_gerekce=state.get("onay_gerekce", ""),
        ocr_engine=ocr_meta.get("ocr_engine"),
        page_count=ocr_meta.get("page_count"),
    )


@router.post("", response_model=ProcessResponse)
@rate_limit("20/minute")  # IP-başı limit (/stream ile aynı desen; slowapi yoksa etkisiz)
async def process(request: Request, req: ProcessRequest) -> ProcessResponse:
    """Hazır metinle blocking pipeline (OCR'sız). HITL açıksa taslakta durup onay bekler."""
    text, _ = await _ocr_or_text(None, req.evrak_text)
    state = make_initial_state(text[:MAX_EVRAK_CHARS], filename=req.filename)
    if HITL_ENABLED:
        from uuid import uuid4

        thread_id = uuid4().hex
        g = _get_hitl_graph()
        cfg = {"configurable": {"thread_id": thread_id}}
        out = await g.ainvoke(state, cfg)
        if "__interrupt__" in out:
            # Memur onayı bekleniyor → o ana kadarki state + onay bayrağı + thread_id döndür.
            snap = await g.aget_state(cfg)
            resp = _to_response(dict(snap.values), {})
            resp.onay_bekliyor = True
            resp.thread_id = thread_id
            return resp
        return _to_response(out, {})
    final = await _get_graph().ainvoke(state)
    return _to_response(final, {})


@router.post("/resume", response_model=ProcessResponse)
@rate_limit("20/minute")
async def resume(request: Request, req: OnayResumeRequest) -> ProcessResponse:
    """HITL memur kararı → duraklamış pipeline'ı sürdür (onayla/düzenle/reddet)."""
    if not HITL_ENABLED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "HITL kapalı")
    from langgraph.types import Command

    g = _get_hitl_graph()
    cfg = {"configurable": {"thread_id": req.thread_id}}
    karar = {"secim": req.secim, "metin": req.metin, "gerekce": req.gerekce}
    try:
        final = await g.ainvoke(Command(resume=karar), cfg)
    except Exception as exc:  # bilinmeyen/expire thread → 404
        log.warning("hitl_resume_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Onay oturumu bulunamadı veya süresi doldu") from exc
    return _to_response(final, {})


@router.post("/stream")
@rate_limit("20/minute")  # IP-başı akış limiti (slowapi yoksa etkisiz)
async def process_stream(request: Request, file: UploadFile = File(...)) -> StreamingResponse:
    """Dosya yükle → OCR + pipeline node event'lerini SSE ile yayınla."""
    text, ocr_meta = await _ocr_or_text(file, None)

    async def gen() -> AsyncIterator[str]:
        yield _sse({"event": "start", "nodes": ["oku", *PIPELINE_NODES]})
        # OCR adımı (graf-öncesi).
        yield _sse({"event": "node", "node": "oku", "status": "done",
                    "data": {"engine": ocr_meta.get("ocr_engine"),
                             "n_chars": len(text), "page_count": ocr_meta.get("page_count")}})
        if not text.strip():
            yield _sse({"event": "error", "message": "Belgeden metin çıkarılamadı"})
            return
        state = make_initial_state(text[:MAX_EVRAK_CHARS], filename=ocr_meta.get("filename", ""))
        accumulated: dict[str, Any] = dict(state)
        try:
            async for update in _get_graph().astream(state, stream_mode="updates"):
                for node, slice_ in update.items():
                    if isinstance(slice_, dict):
                        accumulated.update(slice_)
                    yield _sse({"event": "node", "node": node, "status": "done",
                                "data": _node_summary(node, slice_ or {})})
        except Exception as exc:
            log.error("process_stream_failed", error=str(exc) or type(exc).__name__)
            yield _sse({"event": "error", "message": "İşleme hatası"})
            return
        yield _sse({"event": "done", "result": _to_response(accumulated, ocr_meta).model_dump()})

    return StreamingResponse(gen(), media_type="text/event-stream")


def _node_summary(node: str, slice_: dict[str, Any]) -> dict[str, Any]:
    """SSE node event'i için kompakt özet (büyük alanları kısalt)."""
    keys = {
        "siniflandir": ("evrak_turu", "tur_confidence"),
        "cikar": ("bilgi_unsurlari",),
        "kanit_baglama": ("kanit_metadata",),
        "eksik_tespit": ("eksik_alanlar",),
        "mevzuat_oner": ("mevzuat_onerileri",),
        # CRAG (ENV-gated) öz-düzeltme: SSE'de boş kalmasın (ECC LOW-5).
        "crag": ("crag_corrected", "crag_guven_oncesi", "crag_guven_sonrasi"),
        # NLI atıf-gerekçelendirme (ENV-gated): entailment işaretleri SSE'ye taşınsın.
        "mevzuat_dogrula": ("mevzuat_nli",),
        "ozetle": ("ozet",),
        "route_birim": ("hedef_birim",),
        # clarifier (ENV-gated) dur-ve-sor: sorular + durdurma işareti SSE'ye taşınsın.
        "clarifier": ("clarify_questions", "want_stop", "clarify_stop"),
        "yazi_taslak": ("yazi_turu", "format_uyumlu"),
        "verify": ("format_uyumlu", "verify_uyari", "verify_notes"),
        "arsiv": ("arsiv_metadata",),
        "sla_triyaj": ("sla_metadata",),
        "denetim_izi": ("denetim_izi",),
        "finalize": (),
    }.get(node, ())
    return {k: slice_.get(k) for k in keys if k in slice_}


__all__ = ("router",)
