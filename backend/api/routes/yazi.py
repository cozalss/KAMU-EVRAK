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

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse

from agents.graph import build_graph
from agents.state import make_initial_state
from api.middleware.ratelimit import rate_limit
from api.schemas import (
    MAX_EVRAK_CHARS,
    KurulRequest,
    TaslakTuruRequest,
    YaziDayanakRequest,
    YaziDogrulaRequest,
    YaziEypRequest,
    YaziRenderRequest,
    YaziTaslakRequest,
)

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
    """Content-Disposition için güvenli dosya adı.

    Header enjeksiyonunu (CRLF `%0d%0a`, `;`, tırnak vb.) engellemek için yalnız
    alfanümerik + nokta + tire bırakılır; gerisi `_` olur. 64 karakterle sınırlanır.
    Boş/uydurma sonuç → fallback (zaten ASCII-güvenli).
    """
    name = str(state.get(f"yazi_taslak_{fmt}_filename") or "")
    safe = re.sub(r"[^\w.\-]", "_", name)[:64]
    # Yalnız ayraç/nokta kalmışsa (gerçek ad yok) fallback'e düş.
    return safe if safe.strip("._-") else fallback


@router.post("/taslak")
@rate_limit("30/minute")  # IP-başı taslak-indir limiti (slowapi yoksa etkisiz)
async def yazi_taslak(
    request: Request,
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
    except Exception as exc:
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


_MAX_UNSUR_CHARS = 300  # bilgi_unsurlari tekil alan sınırı (DoS + enjeksiyon guard)


def _sanitize_line(v: str, max_len: int = _MAX_UNSUR_CHARS) -> str:
    """Tek-satır resmî yazı alanına (konu/muhatap/ilgi) basılacak metni güvenli hâle getirir.

    Satır sonu/kontrol karakterleri (\\r\\n\\t vb.) boşluğa çevrilir — aksi hâlde istemci
    konu/gönderen gibi alanlara \\n enjekte ederek taslağa SAHTE "Sayı :" veya karar
    satırı ekleyebilirdi (SIFIR UYDURMA ilkesi: istemci girdisi olduğu gibi güvenilmez).
    Uzunluk ayrıca sınırlanır (evrak_text dışındaki alanlarda üst sınır yoktu).
    """
    return re.sub(r"[\r\n\t\x00-\x1f]+", " ", v).strip()[:max_len]


def _skaler_unsurlar(d: dict) -> dict:
    """İstemciden gelen bilgi_unsurlari'ndan yalnız GÜVENLİ düz skalerleri geçir.

    _muhatap/_ilgi_satirlari str bekler; iç içe dict/list gelirse str(dict) çöpü
    muhatap satırına sızardı. bool'lar (imza var vb.) muhatap üretiminde anlamsız → elenir.
    String değerler _sanitize_line'dan geçirilir (satır enjeksiyonu + uzunluk guard).
    """
    out: dict[str, Any] = {}
    for k, v in (d or {}).items():
        if isinstance(v, bool) or not isinstance(v, (str, int, float)):
            continue
        if isinstance(v, str):
            v = _sanitize_line(v)
            if not v:
                continue
        out[k] = v
    return out


@router.post("/taslak-turu")
@rate_limit("30/minute")
async def yazi_taslak_turu(request: Request, req: TaslakTuruRequest) -> dict[str, Any]:
    """Memurun SEÇTİĞİ yazı türü için taslağı yeniden üret (şartname: tür seçilebilmeli).

    Pipeline koşulmaz — yalnız gövde üretimi (LLM varsa; mock'ta deterministik şablon)
    + jinja render. ust_yazi'da muhatap gönderen değil hedef birimdir (Yön. m.14).
    PDF/DOCX üretilmez (metin yeterli; indirme /yazi/render'dan yapılır).
    """
    from agents.config import birim_tr
    from agents.kurum_kimlik import (
        efektif_idare_adi,
        gorus_muhatabi,
        hitap_eki,
        muzekkere_muhatabi,
    )
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_body, build_context

    text = (req.evrak_text or "").strip()[:MAX_EVRAK_CHARS]
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Evrak metni boş")
    unsurlar = _skaler_unsurlar(req.bilgi_unsurlari)
    hedef_birim = _sanitize_line(req.hedef_birim, 100) if req.hedef_birim else ""
    if req.yazi_turu == "ust_yazi" and hedef_birim:
        muhatap = hitap_eki(birim_tr(hedef_birim))  # m.14/2 BÜYÜK + yönelme eki
    elif req.yazi_turu == "gorus_mutalaa":
        # Görüşün muhatabı = görüşü talep eden birim (gelen antetten deterministik,
        # m.14/2 hitap biçimli — pipeline ile TEK ortak kapı: kurum_kimlik.gorus_muhatabi).
        muhatap = gorus_muhatabi(text) or None
    elif req.yazi_turu == "muzekkere":
        # Müzekkere muhatabı: yargı → gönderen makam; idari iç → talep eden birim.
        muhatap = muzekkere_muhatabi(text, str(unsurlar.get("gonderen", "") or "")) or None
    else:
        muhatap = None
    # Antet: belge hitap-ekli bir kuruma yazılmışsa (yargı hariç) O KURUM otomatik; değilse
    # boş → build_context env KURUM_ADI'ya düşer — pipeline (yazi_taslak_node) ile AYNI
    # kural (kurum_kimlik.efektif_idare_adi).
    hazirlayan = (birim_tr(hedef_birim)
                  if hedef_birim and req.yazi_turu != "ust_yazi" else "")
    try:
        metin = await build_body(req.yazi_turu, unsurlar, text)
        efektif_kurum = efektif_idare_adi(text, unsurlar)
        ctx = build_context(req.yazi_turu, unsurlar, metin, muhatap_override=muhatap,
                            hazirlayan_birim=hazirlayan, idare_adi=efektif_kurum)
        result = render_yazi(ctx, formats=frozenset())
    except Exception as exc:
        log.error("yazi_taslak_turu_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Taslak üretilemedi") from exc

    log.info("yazi_taslak_turu", yazi_turu=result.yazi_turu,
             format_uyumlu=result.format_uyumlu)
    return {
        "yazi_turu": result.yazi_turu,
        "yazi_taslak_md": result.metin,
        "format_uyumlu": result.format_uyumlu,
    }


@router.post("/dayanak")
@rate_limit("60/minute")  # deterministik + LLM'siz → tür-seçiminden daha gevşek limit
async def yazi_dayanak(request: Request, req: YaziDayanakRequest) -> dict[str, Any]:
    """Memurun kutucukla seçtiği mevzuatı taslağa DAYANAK olarak işle (deterministik).

    Görev 2 kurgusu: işaretlenen madde(ler) kapanıştan önce "Dayanak" bloğu olarak yazıya
    işlenir; seçim boşalınca base AYNEN döner (bire bir undo). LLM/pipeline YOK → anlık,
    ucuz, deterministik. Gövde metni DEĞİŞMEZ (yalnız atıf bloğu eklenir/çıkarılır).
    SIFIR UYDURMA: yalnız panelde görünen `baslik` taşınır (bkz. yazi.dayanak).
    """
    from yazi.dayanak import dayanak_uygula
    from yazi.renderer import detect_eksik_format

    # NOT strip(): antet ("        T.C.") ortalaması ve kapanış girintisi (anchor) korunmalı —
    # yalnız boşluk guard'ı + uzunluk sınırı uygulanır (base bire bir korunur).
    if not req.taslak_md.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Taslak metni boş")
    taslak = req.taslak_md[:MAX_EVRAK_CHARS]
    try:
        yeni = dayanak_uygula(taslak, req.secili_mevzuat)
    except Exception as exc:
        log.error("yazi_dayanak_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Dayanak işlenemedi") from exc

    n = sum(1 for m in (req.secili_mevzuat or [])
            if isinstance(m, dict) and str(m.get("baslik") or "").strip())
    log.info("yazi_dayanak", n_secili=n, degisti=(yeni != taslak))
    return {
        "yazi_taslak_md": yeni,
        "format_uyumlu": not detect_eksik_format(yeni),
        "dayanak_sayisi": n,
    }


@router.post("/render")
@rate_limit("30/minute")
async def yazi_render(
    request: Request,
    req: YaziRenderRequest,
    format: str = Query("docx", pattern="^(pdf|docx)$"),
) -> Response:
    """Verilen (elle düzenlenmiş) taslak metnini DOĞRUDAN PDF/DOCX indir — pipeline YOK.

    TaslaklarView 'DOCX indir': memurun düzenlediği gövde olduğu gibi render edilir.
    """
    from yazi.renderer import render_text_bytes

    _, media_type, fallback = _FORMAT_MAP[format]
    text = (req.text or "").strip()[:MAX_EVRAK_CHARS]
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Taslak metni boş")

    try:
        data = render_text_bytes(text, format, title=(req.title or "Resmî Yazı Taslağı"))
    except Exception as exc:
        log.error("yazi_render_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Render başarısız") from exc

    if not data:
        log.warning("yazi_render_no_bytes", format=format)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{format.upper()} üretilemedi (render altyapısı eksik olabilir)",
        )

    log.info("yazi_render_download", format=format, n_bytes=len(data))
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{fallback}"'},
    )


@router.post("/dogrula")
@rate_limit("20/minute")
async def yazi_dogrula(request: Request, req: YaziDogrulaRequest) -> dict[str, Any]:
    """Taslağı (opsiyonel doğal-dil revizyon sonrası) verify+risk_guard'dan yeniden geçir.

    HITL onayına sunulmadan/Giden Evrak'a yazılmadan ÖNCE bu uçtan geçilmesi gerekir:
    memurun elle düzenlediği taslak önceden doğrudan pushOutbox'a gidiyor, verify (uydurma-
    veto/2646-lint) ve risk_guard kapılarını atlıyordu. talimat verilirse önce DeepSeek
    taslağı revize eder (yazi_render.revize_taslak — LLM yok/hata → orijinal taslak
    değiştirilmeden korunur), ardından (revize edilmiş ya da orijinal) metin doğrulanır.

    GÜVEN SINIRI: hem taslak_md hem evrak_text/bilgi_unsurlari bu uçta İSTEMCİDEN gelir —
    uydurma-veto burada yalnız "taslak, istemcinin kendi verdiği kaynakla tutarlı mı" der,
    kaynağın GERÇEK evrağı yansıttığını doğrulamaz. Dönen risk_metadata/format_uyumlu bu
    yüzden sunucu-taraflı bir onay jetonu DEĞİLDİR — ileride otomatik onay/inceleme-atlama
    için kullanılmamalı.
    """
    taslak = req.taslak_md.strip()[:MAX_EVRAK_CHARS]
    if not taslak:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Taslak metni boş")

    talimat = _sanitize_line(req.talimat, 500) if req.talimat else ""
    revize_edildi = False
    revize_degisiklikler: list[str] = []
    revize_uygulanamayan = ""
    if talimat:
        from yazi.yazi_render import revize_taslak_yapili

        # Kaynak evrak özeti verilir ki eklenecek atıf/tarih/sayı kaynaktan alınsın;
        # kaynakta yoksa model eklemeyi reddeder ve nedeni 'uygulanamayan'da döner.
        yapili = await revize_taslak_yapili(
            taslak, talimat, evrak_ozet=(req.evrak_text or "")[:1200])
        if yapili:
            revize_uygulanamayan = yapili["uygulanamayan"]
            yeni = yapili["metin"].strip()[:MAX_EVRAK_CHARS]
            if yeni and yeni != taslak:
                taslak = yeni
                revize_edildi = True
                revize_degisiklikler = yapili["degisiklikler"]

    state: dict[str, Any] = {
        "evrak_text": (req.evrak_text or "").strip()[:MAX_EVRAK_CHARS],
        "bilgi_unsurlari": _skaler_unsurlar(req.bilgi_unsurlari),
        "yazi_taslak_md": taslak,
        "yazi_turu": req.yazi_turu,
        "evrak_turu": req.evrak_turu or "belirsiz",
        "hedef_birim": _sanitize_line(req.hedef_birim, 100) if req.hedef_birim else "",
    }
    # NOT: dayanak bloğu memur-küreli atıftır → grounding LLM'ine gövde-dışı verilir
    # (verify.dayanak_blogunu_cikar). İstemci-kontrollü "whitelist" YOK — güvenli by construction.

    from agents.nodes.risk_guard import risk_guard_node
    from agents.nodes.verify import verify_node

    try:
        v = await verify_node(state)
        state.update(v)
        r = await risk_guard_node(state)
    except Exception as exc:
        log.error("yazi_dogrula_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Doğrulama başarısız") from exc

    log.info("yazi_dogrula", revize_edildi=revize_edildi, talimat=bool(talimat),
             n_degisiklik=len(revize_degisiklikler),
             uyari=len(v.get("verify_uyari", [])),
             bant=(r.get("risk_metadata") or {}).get("bant"))

    return {
        "taslak_md": taslak,
        "revize_edildi": revize_edildi,
        "revize_degisiklikler": revize_degisiklikler,
        "revize_uygulanamayan": revize_uygulanamayan,
        "verify_notes": v.get("verify_notes", ""),
        "verify_uyari": v.get("verify_uyari", []),
        "tutarlilik_uyari": v.get("tutarlilik_uyari", []),
        "format_uyumlu": v.get("format_uyumlu", True),
        "lint_2646": v.get("lint_2646"),
        "risk_metadata": r.get("risk_metadata"),
    }


@router.post("/kurul")
@rate_limit("15/minute")  # LLM roundtable — indirme uçlarından daha pahalı, sıkı limit
async def yazi_kurul(request: Request, req: KurulRequest) -> dict[str, Any]:
    """AI Bürokrasi Kurulu: GÜNCEL taslağı DeepSeek çok-ajanlı müzakeresinden geçir.

    Sunucu sinyalleri (verify + risk_guard) taslaktan YENİDEN hesaplar (istemci sinyaline
    güvenmez, /yazi/dogrula güven-sınırıyla aynı ilke). LLM yok/mock/hata → {kaynak:
    "deterministik"} (frontend muzakere.js'e düşer, mock ayakta). Uç asla 500 vermez.
    """
    from yazi.kurul import kurul_muzakere

    taslak = req.taslak_md.strip()[:MAX_EVRAK_CHARS]
    if not taslak:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Taslak metni boş")

    # Girdi kurulumu + sinyal hesabı TEK try içinde — "uç asla 500 vermez" garantisi tam.
    try:
        sinyaller, meta = await _kurul_sinyal_meta(req, taslak)
    except Exception as exc:
        log.error("kurul_sinyal_failed", error=str(exc) or type(exc).__name__)
        return {"kaynak": "deterministik"}  # sinyal yoksa frontend deterministik motora düşer

    try:
        kurgu = await kurul_muzakere(taslak, meta=meta, sinyaller=sinyaller, olc=_olcer(req))
    except Exception as exc:
        log.error("kurul_muzakere_failed", error=str(exc) or type(exc).__name__)
        kurgu = None

    if kurgu is None:
        # LLM yok/mock/hata → frontend deterministik muzakere.js kullanır (sinyaller de döner).
        return {"kaynak": "deterministik", "sinyaller": sinyaller}

    log.info("yazi_kurul", karar=kurgu["karar"], n_tur=len(kurgu["turlar"]),
             n_oneri=len(kurgu["oneriler"]), uzlasi=kurgu["uzlasi_degisti"])
    return {**kurgu, "sinyaller": sinyaller}


async def _kurul_sinyal_meta(
    req: KurulRequest, taslak: str, *, aciklama: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Taslaktan verify+risk_guard sinyallerini SUNUCUDA yeniden hesapla (grounding + karar
    otoritesi istemciye bağlı değil) → (sinyaller, meta). /kurul ve /kurul/akis ortak kullanır.

    `aciklama=False`: yalnız SAYILAR gerekiyorsa (kurulun tur-arası yeniden ölçümü) risk
    bandının sade-dil açıklaması ÜRETİLMEZ — memura gösterilmeyecek bir metin için her turda
    LLM çağrısı yapmak saf gecikmedir. Bant/skor/gerekçe aynı kalır.
    """
    from agents.nodes.risk_guard import risk_guard_node
    from agents.nodes.verify import verify_node

    state: dict[str, Any] = {
        "risk_aciklama_atla": not aciklama,
        "evrak_text": (req.evrak_text or "").strip()[:MAX_EVRAK_CHARS],
        "bilgi_unsurlari": _skaler_unsurlar(req.bilgi_unsurlari),
        "yazi_taslak_md": taslak,
        "yazi_turu": req.yazi_turu,
        "evrak_turu": req.evrak_turu or "belirsiz",
        "hedef_birim": _sanitize_line(req.hedef_birim, 100) if req.hedef_birim else "",
    }
    v = await verify_node(state)
    state.update(v)
    r = await risk_guard_node(state)
    sinyaller = {
        "verify_uyari": v.get("verify_uyari", []),
        "lint_2646": v.get("lint_2646") or {},
        "tutarlilik_uyari": v.get("tutarlilik_uyari", []),
        "risk_metadata": r.get("risk_metadata") or {},
        # Biçim bütünlüğü — kurulun "Yazı Sorumlusu" şeridinin çapası. verify yalnız
        # ZAYIFLATMA yönünde yazar (eksik bölüm → False), yoksa alan hiç gelmez → varsayılan evet.
        "format_uyumlu": v.get("format_uyumlu", True),
    }
    meta = {
        "yazi_turu": req.yazi_turu, "evrak_turu": req.evrak_turu,
        "hedef_birim": req.hedef_birim, "bilgi_unsurlari": state["bilgi_unsurlari"],
        "evrak_text": state["evrak_text"],
        "mevzuat": req.mevzuat_onerileri, "nli": req.mevzuat_nli,
        # Muhatabın TALEPLERİ — kurulun "Muhatap Temsilcisi" şeridinin çapası. `bilgi_unsurlari`
        # yolundan GELEMEZ: orası muhatap/ilgi satırı üretimi için düz skalerlere indirgenir
        # (_skaler_unsurlar) ve listeler elenir. Ayrı alan olarak, satır-enjeksiyonuna karşı
        # temizlenmiş ve sayıca sınırlı taşınır.
        "talepler": _talep_listesi(req.bilgi_unsurlari),
    }
    return sinyaller, meta


def _talep_listesi(unsurlar: dict | None) -> list[str]:
    """`bilgi_unsurlari['talepler']` → temizlenmiş, sınırlı liste (istemci verisi = güvensiz)."""
    ham = (unsurlar or {}).get("talepler")
    if not isinstance(ham, list):
        return []
    out: list[str] = []
    for t in ham[:8]:
        if isinstance(t, (str, int, float)) and not isinstance(t, bool):
            temiz = _sanitize_line(str(t), 300)
            if temiz:
                out.append(temiz)
    return out


def _olcer(req: KurulRequest) -> Callable[[str], Awaitable[dict[str, Any]]]:
    """Kurulun DENETİM turu için yeniden-ölçüm geri çağrısı: revize taslak → GÜNCEL sinyaller.

    Kurulun tek turdan yakınsama döngüsüne geçmesinin dayanağı budur: LLM'in "düzelttim"
    iddiası kanıt değildir; kanıt, revize METİN üzerinde yeniden koşan verify + risk_guard'dır.
    İstemci verisi (evrak_text/unsurlar) sabit kalır — DEĞİŞEN yalnız taslaktır, yani ölçüm
    sunucu otoritesinde ve turlar arası karşılaştırılabilir.
    """
    async def olc(revize_taslak: str) -> dict[str, Any]:
        sinyaller, _meta = await _kurul_sinyal_meta(req, revize_taslak, aciklama=False)
        return sinyaller
    return olc


def _sse(payload: dict[str, Any]) -> str:
    """JSON → SSE 'data:' satırı (process_doc deseni)."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/kurul/akis")
@rate_limit("15/minute")  # LLM roundtable — çift çağrı, sıkı limit
async def yazi_kurul_akis(request: Request, req: KurulRequest) -> StreamingResponse:
    """AI Bürokrasi Kurulu — CANLI AKIŞ (SSE). Debate turlar hazır oldukça yayılır (dead-wait yok):
    'sinyaller' (hemen) → 'acilis' (~açılış çağrısı biter) → 'sonuc' (~çapraz çağrısı biter) → 'done'.
    LLM yok/hata → yalnız sinyaller+done; frontend deterministik muzakere.js'e düşer (mock ayakta).
    Uç asla 500 vermez: taslak boş → 422 (stream başlamadan); gerisi generator içinde yutulur."""
    from yazi.kurul import kurul_muzakere_stream

    taslak = req.taslak_md.strip()[:MAX_EVRAK_CHARS]
    if not taslak:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Taslak metni boş")

    async def gen() -> Any:
        try:
            sinyaller, meta = await _kurul_sinyal_meta(req, taslak)
        except Exception as exc:
            log.error("kurul_akis_sinyal_failed", error=str(exc) or type(exc).__name__)
            yield _sse({"tip": "deterministik"})   # sinyal bile yok → frontend yerel motora düşer
            return
        # Sinyaller ERKEN yayılır → frontend deterministik fallback'i hazırlar (LLM gelmezse anında oynar).
        yield _sse({"tip": "sinyaller", "sinyaller": sinyaller})
        try:
            async for tip, veri in kurul_muzakere_stream(
                    taslak, meta=meta, sinyaller=sinyaller, olc=_olcer(req)):
                yield _sse({"tip": tip, **veri})
        except Exception as exc:
            log.error("kurul_akis_muzakere_failed", error=str(exc) or type(exc).__name__)
        yield _sse({"tip": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream")


async def _eyp_meta_from_pipeline(req: YaziEypRequest) -> tuple[dict[str, Any], str]:
    """Yavaş yol: evrak metnini pipeline'dan geçir → (üstveri meta, taslak_md)."""
    text = (req.evrak_text or "").strip()[:MAX_EVRAK_CHARS]
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Taslak metni veya evrak metni gerekli")
    state = make_initial_state(text, filename=req.filename)
    try:
        final = await _get_graph().ainvoke(state)
    except Exception as exc:
        log.error("yazi_eyp_pipeline_failed", error=str(exc) or type(exc).__name__)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Paket üretilemedi") from exc
    arsiv = final.get("arsiv_metadata", {}) or {}
    unsur = final.get("bilgi_unsurlari", {}) or {}
    meta = {
        "filename": req.filename,
        "konu": unsur.get("konu", ""),
        "yazi_turu": final.get("yazi_turu", ""),
        "sdp_kodu": arsiv.get("sdp_kodu", ""),
        "sdp_adi": arsiv.get("sdp_adi", ""),
        "hedef_birim": final.get("hedef_birim", ""),
        "ilgi_tarih": unsur.get("tarih", ""),
        "ilgi_sayi": unsur.get("sayi", ""),
    }
    return meta, final.get("yazi_taslak_md", "") or ""


@router.post("/eyp")
@rate_limit("30/minute")
async def yazi_eyp(request: Request, req: YaziEypRequest) -> Response:
    """Taslağı EYP 2.0-uyumlu yazışma paketi İSKELETİ (ZIP) olarak indir (S5).

    Hızlı yol: frontend sonuç üstverisini gönderdiyse pipeline koşulmaz. Yalnız
    evrak_text geldiyse pipeline koşulur ve üstveri state'ten derlenir.
    """
    from yazi.eyp import build_eyp_paket

    taslak_md = (req.taslak_md or "").strip()
    if taslak_md:
        meta: dict[str, Any] = req.model_dump(exclude={"evrak_text", "taslak_md"})
    else:
        meta, taslak_md = await _eyp_meta_from_pipeline(req)

    # PDF üret (varsa pakete PDF girer; render altyapısı yoksa düz metinle devam).
    pdf: bytes | None = None
    try:
        from yazi.renderer import render_text_bytes
        pdf = render_text_bytes(taslak_md, "pdf", title="Resmî Yazı Taslağı") or None
    except Exception:
        pdf = None

    data = build_eyp_paket(meta, taslak_md=taslak_md, pdf_bytes=pdf)
    log.info("yazi_eyp_download", n_bytes=len(data), pdf=bool(pdf))
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="eyp-paket-taslak.zip"'},
    )


__all__ = ("router",)
