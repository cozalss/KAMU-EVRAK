"""POST /process_doc — evrakı uçtan-uca işle (Görev 1 + Görev 2).

İki mod (ADALET ask.py deseninden ADAPT):
  POST /process_doc          → tek seferlik blocking JSON (ProcessResponse)
  POST /process_doc/stream   → SSE; OCR + her pipeline node'u bittiğinde event yayar
                               (canlı Ajan Akış Şeması / "düşünen sistem" demosu — Demo 15p)

Girdi: multipart `file` (OCR yapılır) VEYA JSON `{evrak_text}`. LangGraph zinciri
compile-once; lazy singleton ile cache'lenir.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from agents.config import HITL_ENABLED, llm_profil
from agents.graph import PIPELINE_NODES, build_graph
from agents.state import make_initial_state
from api.mevzuat_zenginlestir import zenginlestir_mevzuat
from api.middleware.ratelimit import rate_limit
from api.pii import mask_pii
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
        mevzuat_onerileri=zenginlestir_mevzuat(state),  # B2: güven/dayanak/[DOĞRULA] yüzeye çıkar
        mevzuat_nli=state.get("mevzuat_nli", []),
        # LLM özet yolu ham evrak metnini görür → TCKN/telefon kaçağına karşı sınırda maskele
        # (deterministik fallback zaten maskeli; burada savunma derinliği).
        ozet=mask_pii(state.get("ozet", "") or "").masked_text,
        hedef_birim=state.get("hedef_birim", ""),
        birim_alternatifleri=state.get("birim_alternatifleri", []),
        yazi_turu=state.get("yazi_turu", ""),
        yazi_taslak_md=state.get("yazi_taslak_md", ""),
        format_uyumlu=bool(state.get("format_uyumlu", False)),
        # PII güvenliği: uydurma-veto uyarıları somut tarih/sayı token'ı içerir (TCKN-şekilli
        # olabilir) → API sınırında maskele (savunma derinliği; risk_guard gerekçeleri de maskeli).
        verify_uyari=[mask_pii(u).masked_text for u in state.get("verify_uyari", [])],
        verify_notes=mask_pii(state.get("verify_notes", "") or "").masked_text,
        lint_2646=state.get("lint_2646", {}),
        tutarlilik_uyari=[mask_pii(u).masked_text
                          for u in state.get("tutarlilik_uyari", [])],
        lint_duzeltme_md=state.get("lint_duzeltme_md", ""),
        llm_profil=llm_profil(),
        bilgilendirme=state.get("bilgilendirme", ""),
        arsiv_metadata=state.get("arsiv_metadata", {}),
        sla_metadata=state.get("sla_metadata", {}),
        denetim_izi=state.get("denetim_izi", {}),
        kanit_metadata=state.get("kanit_metadata", {}),
        alt_talepler=state.get("alt_talepler", []),
        risk_metadata=state.get("risk_metadata", {}),
        onay_durumu=state.get("onay_durumu", ""),
        onay_gerekce=state.get("onay_gerekce", ""),
        ocr_engine=ocr_meta.get("ocr_engine"),
        page_count=ocr_meta.get("page_count"),
        ocr_confidence=ocr_meta.get("ocr_confidence"),
    )


async def _owner_id_from_request(request: Request) -> UUID | None:
    """Bearer access token varsa aktif kullanıcı id'sini döndür.

    Token yoksa demo uyumluluğu için None döner. Token varsa ama geçersiz/süresi dolmuşsa
    401 döndürür; frontend bu sayede refresh token ile yenileyip isteği tekrarlar.
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        from auth.security import token_coz
        from db.models import Kullanici
        from db.session import session_factory

        payload = token_coz(token, "access")
        if not payload:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token.")
        user_id = UUID(str(payload.get("sub")))
        async with session_factory() as session:
            user = await session.get(Kullanici, user_id)
            if user is None or not user.aktif:
                raise HTTPException(
                    status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı veya pasif.")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token."
        ) from None


async def _persist_sonrasi(request: Request, state: dict[str, Any],
                           response: ProcessResponse, kaynak_metin: str,
                           filename: str) -> str:
    """Persist + owner çözümü TEK kapıdan: DB_PERSIST kapalıyken owner sorgusu da atlanır
    (eski kod, persist kapalıyken bile koşulsuz bir uzak DB turu atıyordu — Supabase soğuk
    havuzunda ~20 sn). Akış gövdesinde 401 dönülemez (başlıklar gitti) → token hatası
    loglanır, persist sistem kullanıcısına düşer, akış ölmez."""
    if os.getenv("DB_PERSIST", "0") != "1":
        return ""
    try:
        owner_id = await _owner_id_from_request(request)
    except HTTPException as exc:
        log.warning("persist_owner_dogrulama_hatasi", detail=str(exc.detail)[:100])
        owner_id = None
    return await _maybe_persist(state, response, kaynak_metin, filename, owner_id)


# Arka plan persist görevlerine GÜÇLÜ referans: event loop task'lara yalnız weak-ref tutar —
# istemci `done`dan hemen sonra koparsa generator çerçevesi yıkılır, referanssız task GC'ye
# gidebilirdi (asyncio docs uyarısı). Bitince set'ten düşer; sessiz hata loglanır.
_persist_tasks: set[asyncio.Task] = set()


def _persist_task_bitti(task: asyncio.Task) -> None:
    _persist_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        log.warning("persist_task_hata", hata=str(task.exception())[:200])


def _persist_task_baslat(request: Request, state: dict[str, Any],
                         response: ProcessResponse, kaynak_metin: str,
                         filename: str) -> asyncio.Task:
    task = asyncio.create_task(
        _persist_sonrasi(request, state, response, kaynak_metin, filename))
    _persist_tasks.add(task)
    task.add_done_callback(_persist_task_bitti)
    return task


async def _maybe_persist(state: dict[str, Any], response: ProcessResponse,
                         kaynak_metin: str, filename: str,
                         owner_id: UUID | None = None) -> str:
    """DB_PERSIST=1 ise koşumu DB'ye yaz (gelen_evrak+islem+denetim). ENV-gated + lazy.

    Demo güvenliği: DATABASE_URL/DB yoksa veya yazma hata verirse YANITI BOZMAZ
    (yalnız uyarı loglanır). Kalıcılaştırma opsiyoneldir; stateless demo birebir korunur.
    """
    if os.getenv("DB_PERSIST", "0") != "1":
        return ""
    try:
        from db.repositories.persist_run import persist_pipeline_run
        islem_id = await persist_pipeline_run(
            state=state, response=response, kaynak_metin=kaynak_metin, filename=filename,
            owner_id=owner_id)
        response.islem_id = str(islem_id)
        log.info("db_persist", islem_id=str(islem_id))
        return str(islem_id)
    except Exception as e:
        log.warning("db_persist_hata", hata=str(e)[:200])
        return ""


@router.post("", response_model=ProcessResponse)
@rate_limit("20/minute")  # IP-başı limit (/stream ile aynı desen; slowapi yoksa etkisiz)
async def process(request: Request, req: ProcessRequest) -> ProcessResponse:
    """Hazır metinle blocking pipeline (OCR'sız). HITL açıksa taslakta durup onay bekler."""
    t0 = time.monotonic()

    def sure() -> int:  # üç dönüş yolu ortak ölçüm
        return int((time.monotonic() - t0) * 1000)

    text, _ = await _ocr_or_text(None, req.evrak_text)
    state = make_initial_state(text[:MAX_EVRAK_CHARS], filename=req.filename)
    if HITL_ENABLED:
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
            resp.sure_ms = sure()
            return resp
        resp = _to_response(out, {})
        resp.sure_ms = sure()
        await _persist_sonrasi(request, out, resp, text, req.filename)
        return resp
    final = await _get_graph().ainvoke(state)
    resp = _to_response(final, {})
    resp.sure_ms = sure()
    await _persist_sonrasi(request, final, resp, text, req.filename)
    return resp


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
    """Dosya yükle → OCR + pipeline node event'lerini SSE ile yayınla.

    M5: OCR AKIŞ İÇİNDE çalışır → taranmış PDF'te jüri 30s boş ekran görmez; 'oku' node'u
    önce 'active' (canlı), OCR bitince 'done' yayılır. Dosya okuma (hızlı) request
    context'inde kalır ki >20MB'de 413 düzgün HTTP yanıtı olsun; ağır extract_text akışa girer.
    """
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Dosya çok büyük")
    filename = file.filename or ""

    async def gen() -> AsyncIterator[str]:
        t0 = time.monotonic()  # uçtan-uca süre (OCR dahil) — sure_ms yanıtta taşınır
        yield _sse({"event": "start", "nodes": ["oku", *PIPELINE_NODES]})
        # OCR'ı akış içinde yap: önce 'oku' CANLI (active) yansın, sonra sonuç (done).
        yield _sse({"event": "node", "node": "oku", "status": "active"})
        try:
            res = await extract_text(data)
        except Exception as exc:
            log.error("stream_ocr_failed", error=str(exc) or type(exc).__name__)
            yield _sse({"event": "error", "message": "OCR hatası"})
            return
        text = res.text
        ocr_meta: dict[str, Any] = {"ocr_engine": res.engine, "page_count": res.page_count,
                                    "ocr_confidence": res.confidence, "filename": filename}
        yield _sse({"event": "node", "node": "oku", "status": "done",
                    "data": {"engine": res.engine, "n_chars": len(text),
                             "page_count": res.page_count, "ocr_confidence": res.confidence}})
        if not text.strip():
            yield _sse({"event": "error", "message": "Belgeden metin çıkarılamadı"})
            return
        state = make_initial_state(text[:MAX_EVRAK_CHARS], filename=filename)
        # Akış HER ZAMAN checkpointer'lı graf + thread_id: (1) final state get_state ile okunur →
        # LangGraph reducer'ları (operator.add / _merge_dict fan-in) DOĞRU uygulanır — plain
        # dict.update fan-in'i bozardı (HIGH-8); (2) HITL koşullu onayda interrupt PERSIST eder
        # (resume mümkün, bypass YOK). onay_kapisi yalnız HITL_ENABLED iken grafta (baseline korunur).
        graph = _get_hitl_graph()
        cfg = {"configurable": {"thread_id": uuid4().hex}}
        try:
            async for update in graph.astream(state, cfg, stream_mode="updates"):
                for node, slice_ in update.items():
                    if node == "__interrupt__":
                        continue  # interrupt aşağıda snap.next ile ele alınır
                    yield _sse({"event": "node", "node": node, "status": "done",
                                "data": _node_summary(node, slice_ or {})})
        except Exception as exc:
            log.error("process_stream_failed", error=str(exc) or type(exc).__name__)
            yield _sse({"event": "error", "message": "İşleme hatası"})
            return
        # Final state: reducer'lar uygulanmış halde (birikimli dict.update yerine).
        snap = await graph.aget_state(cfg)
        if HITL_ENABLED and snap.next:  # interrupt'ta duruldu (sarı/kırmızı risk) → memur onayı
            final_state = dict(snap.values)
            resp = _to_response(final_state, ocr_meta)
            resp.onay_bekliyor = True
            resp.thread_id = cfg["configurable"]["thread_id"]
            resp.sure_ms = int((time.monotonic() - t0) * 1000)
            yield _sse({"event": "done", "result": resp.model_dump()})
            return
        final_state = dict(snap.values)
        resp = _to_response(final_state, ocr_meta)
        resp.sure_ms = int((time.monotonic() - t0) * 1000)
        # SONUÇ ÖNCE: `done` persist'i BEKLEMEZ — uzak Supabase (soğuk havuz) yazımı
        # sonucu ~20 sn geciktiriyordu. islem_id sonradan `persist` event'iyle tamamlanır.
        yield _sse({"event": "done", "result": resp.model_dump()})
        # shield + _persist_tasks referansı: istemci `done`'dan hemen sonra koparsa
        # generator iptali await'i keser ama görev tamamlanır (kayıt kaybolmaz).
        islem_id = await asyncio.shield(
            _persist_task_baslat(request, final_state, resp, text, filename))
        if islem_id:
            yield _sse({"event": "persist", "islem_id": islem_id})

    return StreamingResponse(gen(), media_type="text/event-stream")


def _node_summary(node: str, slice_: dict[str, Any]) -> dict[str, Any]:
    """SSE node event'i için kompakt özet (büyük alanları kısalt)."""
    keys = {
        "siniflandir": ("evrak_turu", "tur_confidence"),
        "cikar": ("bilgi_unsurlari",),
        "kanit_baglama": ("kanit_metadata",),
        "eksik_tespit": ("eksik_alanlar",),
        # decompose (ENV-gated): çok-konulu evrak alt-talepleri SSE'ye taşınsın (canlı kart).
        "decompose": ("alt_talepler",),
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
        "verify": ("format_uyumlu", "verify_uyari", "verify_notes",
                   "lint_2646", "tutarlilik_uyari", "lint_duzeltme_md"),
        # risk_guard (ENV-gated): trafik ışığı bandı SSE'ye taşınsın (canlı kart).
        "risk_guard": ("risk_metadata",),
        # self_rag / onay_kapisi (ENV-gated): SSE'de boş kalmasın.
        "self_rag": ("self_rag_tam", "self_rag_eksikler", "self_rag_notu"),
        "onay_kapisi": ("onay_durumu",),
        "arsiv": ("arsiv_metadata",),
        "sla_triyaj": ("sla_metadata",),
        "denetim_izi": ("denetim_izi",),
        "finalize": (),
    }.get(node, ())
    return {k: slice_.get(k) for k in keys if k in slice_}


__all__ = ("router",)
