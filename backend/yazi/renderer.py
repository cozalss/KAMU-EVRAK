"""Resmî yazı renderer — jinja2 (data/templates/*.j2) + reportlab PDF + python-docx.

ADALET `dilekce/renderer.py` motorundan ADAPT: aynı iki-aşamalı boru hattı
    1. Jinja2 ile YaziContext → düz-metin (deterministik, LLM YOK)
    2. Metin → reportlab PDF bytes (+ opsiyonel python-docx bytes)
ama hukuk (Domain/Citation/dilekçe) yerine kamu-evrak resmî yazı (Yön. 2646).

Resmî yazı SABİT-HİZALI layout ister (ortalanmış "T.C." / antet, sağa-ortalı
imza bloğu). Dilekçe markdown→Paragraph akışı hizayı bozardı; bunun yerine
reportlab `Preformatted` (monospace, whitespace-koruyan) kullanılır → şablonun
boşluk hizası PDF'te aynen korunur (Yön. m.10/m.17 görünüm uyumu).

Jinja undefined: LENIENT `Undefined` (StrictUndefined DEĞİL). Şablonlar
`{{ alan | default("{{ PLACEHOLDER }}") }}` deseni kullanır; eksik değişken
`default` filtresine düşer → ham `{{ PLACEHOLDER }}` görünür (uydurma yok).

Mimari:
    - PDF/DOCX in-memory bytes (disk persistence yok — test + KVKK kolaylığı).
    - Türkçe karakter: Helvetica WinAnsiEncoding ç ş ğ İ Ö Ü doğru gösterir.
    - reportlab/docx OPSİYONEL: import başarısızsa metin yine döner (bytes=None).
"""

from __future__ import annotations

import io
import os
import re
from datetime import date
from pathlib import Path

import structlog
from jinja2 import ChoiceLoader, Environment, FileSystemLoader, select_autoescape
from jinja2.exceptions import TemplateError

from yazi.models import YaziContext, YaziResult
from yazi.template_registry import template_file, template_label

log = structlog.get_logger()

# Çıktı boyut tavanı (DoS/şişme savunması). Resmî yazı tek-iki sayfa → küçük yeter.
_MAX_PDF_BYTES = int(os.getenv("YAZI_MAX_PDF_BYTES", str(2_000_000)))
_MAX_DOCX_BYTES = int(os.getenv("YAZI_MAX_DOCX_BYTES", str(2_000_000)))

# Şablon dizini: repo-root data/templates (backend/yazi → backend → repo).
# YAZI_TEMPLATES_DIR ile override edilebilir. ChoiceLoader fallback yazi/templates.
_REPO_TEMPLATES = Path(__file__).resolve().parents[2] / "data" / "templates"
_LOCAL_TEMPLATES = Path(__file__).parent / "templates"


def _build_env() -> Environment:
    """Jinja env — lenient Undefined (| default placeholder'a düşsün), autoescape KAPALI."""
    search_dirs: list[str] = []
    env_dir = os.getenv("YAZI_TEMPLATES_DIR")
    if env_dir:
        search_dirs.append(env_dir)
    search_dirs.append(str(_REPO_TEMPLATES))
    search_dirs.append(str(_LOCAL_TEMPLATES))
    return Environment(
        loader=ChoiceLoader([FileSystemLoader(d) for d in search_dirs]),
        autoescape=select_autoescape(disabled_extensions=("j2",), default=False),
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


_env = _build_env()


def render_metin(ctx: YaziContext) -> str:
    """Jinja → düz-metin resmî yazı. Template-side LLM YOK (deterministik)."""
    template = _env.get_template(f"{template_file(ctx.yazi_turu)}.j2")
    return template.render(**ctx.jinja_vars()).rstrip() + "\n"


# Render edilmiş metinde HÂLÂ duran ham placeholder'ları yakala (format uyumu).
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-ZÇĞİÖŞÜ ./]+)\s*\}\}")


def detect_eksik_format(metin: str) -> tuple[str, ...]:
    """Render sonrası kalan `{{ PLACEHOLDER }}` etiketlerini topla (eksik alanlar)."""
    return tuple(dict.fromkeys(m.group(1).strip() for m in _PLACEHOLDER_RE.finditer(metin)))


# --------------------------------------------------------------------------
#  Metin → PDF (reportlab Preformatted; sabit-hizalı resmî yazı görünümü)
# --------------------------------------------------------------------------


def _build_pdf(metin: str, title: str) -> bytes | None:
    """Düz-metin → A4 PDF bytes (in-memory). reportlab yoksa None döner."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import Preformatted, SimpleDocTemplate
    except ImportError:  # reportlab opsiyonel — metin yine döner
        log.warning("yazi_pdf_skip_no_reportlab")
        return None

    # Monospace (Courier) whitespace hizasını korur → şablonun ortalama/sağa-hizası aynen.
    style = ParagraphStyle(
        "ResmiYazi", fontName="Courier", fontSize=9.5, leading=12,
    )
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2.5 * cm, rightMargin=2 * cm,
        topMargin=2.5 * cm, bottomMargin=2 * cm,
        title=title, author="kamu-evrak",
    )
    # Preformatted XML-escape yapar (< > & güvenli); ham placeholder düz metin kalır.
    doc.build([Preformatted(metin, style)])
    pdf_bytes = buf.getvalue()
    buf.close()
    if len(pdf_bytes) > _MAX_PDF_BYTES:
        raise ValueError(f"PDF too large: {len(pdf_bytes)} > {_MAX_PDF_BYTES} bytes")
    return pdf_bytes


# --------------------------------------------------------------------------
#  Metin → DOCX (python-docx; memur düzenleyebilsin diye editlenebilir Word)
# --------------------------------------------------------------------------


def _build_docx(metin: str, title: str) -> bytes | None:
    """Düz-metin → DOCX bytes (in-memory). python-docx yoksa None döner.

    Her satır bir paragraf; monospace yazı tipiyle hiza korunur (PDF ile tutarlı).
    """
    try:
        from docx import Document
        from docx.shared import Pt
    except ImportError:  # python-docx opsiyonel
        log.warning("yazi_docx_skip_no_docx")
        return None

    doc = Document()
    doc.core_properties.title = title
    doc.core_properties.author = "kamu-evrak"
    for raw_line in metin.splitlines():
        p = doc.add_paragraph()
        run = p.add_run(raw_line)  # ham metin — XML injection riski yok (docx escape eder)
        run.font.name = "Courier New"
        run.font.size = Pt(10)

    buf = io.BytesIO()
    doc.save(buf)
    docx_bytes = buf.getvalue()
    buf.close()
    if len(docx_bytes) > _MAX_DOCX_BYTES:
        raise ValueError(f"DOCX too large: {len(docx_bytes)} > {_MAX_DOCX_BYTES} bytes")
    return docx_bytes


def _safe_filename(yazi_turu: str, tarih: str, ext: str) -> str:
    """Content-Disposition için ASCII-güvenli dosya adı (Türkçe → ASCII)."""
    tr_map = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    base = yazi_turu.translate(tr_map)
    base = re.sub(r"[^A-Za-z0-9_-]", "-", base)
    safe_tarih = re.sub(r"[^0-9A-Za-z._-]", "-", tarih)
    return f"resmi-yazi-{base}-{safe_tarih}.{ext}"


def render_yazi(
    ctx: YaziContext,
    *,
    formats: frozenset[str] = frozenset({"pdf", "docx"}),
) -> YaziResult:
    """Tek-çağrı render: YaziContext → metin → PDF (+ opsiyonel DOCX) bytes.

    Caller (yazi_taslak_node) yalnız bu fonksiyona girer. Render hatası
    (TemplateError) yukarı taşar; reportlab/docx yoksa o format None döner
    (metin + format_uyumlu yine üretilir → node asla patlamaz).

    Args:
        formats: hangi çıktılar üretilsin — {"pdf"}, {"docx"} veya ikisi.
    """
    tarih = ctx.tarih or date.today().strftime("%d.%m.%Y")
    if not ctx.tarih:
        ctx = _with_tarih(ctx, tarih)

    metin = render_metin(ctx)
    eksik = detect_eksik_format(metin)
    title = template_label(ctx.yazi_turu)

    pdf_bytes = _build_pdf(metin, title) if "pdf" in formats else None
    docx_bytes = _build_docx(metin, title) if "docx" in formats else None

    log.info(
        "yazi_rendered",
        yazi_turu=ctx.yazi_turu, n_eksik=len(eksik),
        pdf_bytes=len(pdf_bytes) if pdf_bytes else 0,
        docx_bytes=len(docx_bytes) if docx_bytes else 0,
    )
    return YaziResult(
        yazi_turu=ctx.yazi_turu,
        metin=metin,
        format_uyumlu=not eksik,
        eksik_format_alanlari=eksik,
        pdf_bytes=pdf_bytes,
        pdf_filename=_safe_filename(ctx.yazi_turu, tarih, "pdf") if pdf_bytes else "",
        docx_bytes=docx_bytes,
        docx_filename=_safe_filename(ctx.yazi_turu, tarih, "docx") if docx_bytes else "",
    )


def _with_tarih(ctx: YaziContext, tarih: str) -> YaziContext:
    """Immutable: tarih set edilmiş yeni YaziContext (coding-style: mutasyon yok)."""
    from dataclasses import replace
    return replace(ctx, tarih=tarih)


__all__ = (
    "YaziContext",
    "YaziResult",
    "render_yazi",
    "render_metin",
    "detect_eksik_format",
    "TemplateError",
)
