"""PDF yardımcıları — pypdfium2 ile dijital metin + tarama render.

LİSANS NOTU (kamu-evrak): ADALET-AGENT bu modülü **PyMuPDF (fitz)** ile yazmıştı.
PyMuPDF **AGPL-3.0** lisanslıdır → MIT açık-kaynak repo iddiasını BOZAR (viral copyleft).
Bu yüzden burada **pypdfium2 (Apache-2.0 / BSD-3)** ile yeniden yazıldı; API/davranış aynı.

Kamu evrakının çoğu **dijital PDF**'tir (EBYS/e-imza çıktıları, Word export): gömülü
metin katmanı vardır → OCR'a gerek yok, `extract_pdf_text` ile kusursuz + Türkçe-diakritikli
metin alınır. Yalnız **taranmış** PDF'lerde (fotokopi/scan) sayfalar görsele render edilip
(`render_pdf_to_images`) OCR motoruna verilir.

Gizlilik: PDF içeriği yalnız bellekte işlenir; diske yazılmaz.

ENV:
    OCR_PDF_MAX_PAGES=10   — DoS/latency guard: bu kadar sayfa işlenir
    OCR_PDF_DPI=200        — tarama render çözünürlüğü (yüksek=daha iyi OCR, yavaş)
    OCR_PDF_MAX_PIXELS     — pixmap bellek-bombası guard (devasa MediaBox)
"""

from __future__ import annotations

import io
import os

import structlog

log = structlog.get_logger()

# Tarama PDF'inde işlenecek azami sayfa (DoS/latency guard; upload sınırıyla ikinci savunma).
MAX_PDF_PAGES = int(os.getenv("OCR_PDF_MAX_PAGES", "10"))
# Tarama sayfasını görsele çevirirken hedef DPI. 200 = OCR için yeterli/hızlı denge.
PDF_RENDER_DPI = int(os.getenv("OCR_PDF_DPI", "200"))
# GÜVENLİK (pixmap bellek bombası): kötücül PDF küçük dosyada DEVASA MediaBox bildirebilir
# → render GB'larca RAM ayırır → OOM. Render öncesi tahmini piksel sayısını sınırla.
MAX_RENDER_PIXELS = int(os.getenv("OCR_PDF_MAX_PIXELS", str(40_000_000)))


def is_pdf(data: bytes) -> bool:
    """İlk byte'lardan PDF imzası (`%PDF-`) tespit et."""
    return len(data) >= 5 and data[:5] == b"%PDF-"


def _open(data: bytes):
    """pypdfium2 PdfDocument aç. Şifreli/bozuk PDF'te PdfiumError → çağıran yakalar."""
    import pypdfium2 as pdfium

    return pdfium.PdfDocument(data)


def extract_pdf_text(data: bytes, *, max_pages: int = MAX_PDF_PAGES) -> tuple[str, int]:
    """Dijital PDF'in gömülü metin katmanını çıkar.

    Returns:
        (text, page_count). Metin katmanı yoksa (taranmış) text="" döner —
        çağıran bu durumda render+OCR yoluna düşer.

    Şifreli/bozuk PDF'te ("", 0) döner (graceful; iç detay sızdırılmaz).
    """
    parts: list[str] = []
    page_count = 0
    pdf = None
    try:
        pdf = _open(data)
        page_count = len(pdf)
        for idx in range(min(page_count, max_pages)):
            page = pdf[idx]
            textpage = page.get_textpage()
            parts.append(textpage.get_text_range())
            textpage.close()
            page.close()
        if page_count > max_pages:
            log.info("pdf_text_page_cap", capped_at=max_pages, total=page_count)
    except Exception as exc:
        # Bozuk/şifreli PDF iç detay sızdırabilir → log'a, çağırana boş.
        log.warning("pdf_text_extract_failed", error=str(exc) or type(exc).__name__)
        return "", page_count
    finally:
        if pdf is not None:
            pdf.close()
    return "\n".join(parts).strip(), page_count


def render_pdf_to_images(
    data: bytes, *, max_pages: int = MAX_PDF_PAGES, dpi: int = PDF_RENDER_DPI,
) -> list[bytes]:
    """Taranmış PDF sayfalarını PNG byte'larına render et (OCR girdisi).

    Returns:
        Sayfa başına PNG bytes listesi (azami `max_pages`). Bozuk/şifreli PDF'te [].
    """
    images: list[bytes] = []
    pdf = None
    try:
        pdf = _open(data)
        n = len(pdf)
        scale = dpi / 72.0
        for idx in range(min(n, max_pages)):
            page = pdf[idx]
            # GÜVENLİK: render öncesi tahmini piksel sayısı (boyut_pt * dpi). Devasa
            # sayfayı render ETMEDEN atla → OOM guard.
            w_pt, h_pt = page.get_size()
            est_px = (w_pt / 72 * dpi) * (h_pt / 72 * dpi)
            if est_px > MAX_RENDER_PIXELS:
                log.warning(
                    "pdf_page_too_large", idx=idx,
                    width_pt=round(w_pt), height_pt=round(h_pt), est_pixels=int(est_px),
                )
                page.close()
                continue
            bitmap = page.render(scale=scale)
            pil = bitmap.to_pil()
            # Defense-in-depth: gerçek piksel sayısını da doğrula.
            if pil.width * pil.height > MAX_RENDER_PIXELS:
                log.warning("pdf_pixmap_too_large", idx=idx, w=pil.width, h=pil.height)
                bitmap.close()
                page.close()
                continue
            buf = io.BytesIO()
            pil.save(buf, format="PNG")
            images.append(buf.getvalue())
            bitmap.close()
            page.close()
    except Exception as exc:
        log.warning("pdf_render_failed", error=str(exc) or type(exc).__name__)
        return []
    finally:
        if pdf is not None:
            pdf.close()
    return images


__all__ = (
    "MAX_PDF_PAGES", "MAX_RENDER_PIXELS", "PDF_RENDER_DPI",
    "extract_pdf_text", "is_pdf", "render_pdf_to_images",
)
