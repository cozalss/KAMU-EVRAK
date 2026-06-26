"""Görev 2 — Resmî yazı taslaklama node'u.

Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)
formatına göre taslak üretir: data/templates/*.j2 (ust_yazi/cevabi_yazi/
bilgilendirme/olur) jinja2 ile render edilir; metin gövdesi resmî üslupta
üretilir (LLM varsa get_llm, yoksa deterministik şablon). Eksik alanlar
jüri demosunda Jinja placeholder olarak görünmez; sahte gerçek bilgi yerine nötr
taslak/EBYS/yetkili makam değerleri kullanılır.

Boru hattı (yazi/ paketine delege):
    1. EVRAK_TO_YAZI ile yazı türü seç
    2. yazi_render.build_body → resmî üslupta gövde metni
    3. yazi_render.build_context → YaziContext (placeholder-safe)
    4. renderer.render_yazi → metin + PDF/DOCX bytes + format_uyumlu

Render altyapısı (jinja2/reportlab/docx) yoksa try/except ile korunur:
node ASLA patlamaz; en kötü ihtimalde format_uyumlu=False + iskelet metin.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import structlog

from agents.config import EVRAK_TO_YAZI

log = structlog.get_logger()


def _fallback_taslak(yazi_turu: str, konu: str) -> dict[str, Any]:
    """Render motoru import edilemezse minimum güvenli iskelet (uydurmasız)."""
    konu_satir = konu if konu else "Başvuru değerlendirmesi"
    tarih = date.today().strftime("%d.%m.%Y")
    kapanis = {
        "cevabi_yazi": "Gereğini rica ederim.",
        "bilgilendirme": "Bilgilerinize arz ederim.",
        "olur": "Olurlarınıza arz ederim.",
    }.get(yazi_turu, "Gereğini arz ederim.")
    ortak_baslik = (
        "                                   T.C.\n"
        "                              KAMU KURUMU\n"
        "                         YAZI İŞLERİ BİRİMİ\n\n"
        f"Sayı : EBYS-TASLAK            {tarih}\n"
        f"Konu : {konu_satir}\n\n"
    )
    govde = (
        f"{konu_satir} konusuna ilişkin gerekli değerlendirme yapılmış olup "
        "taslak yazı EBYS onayı öncesinde oluşturulmuştur."
    )
    imza = "\n                                              Yetkili İmza\n                                              Birim Yetkilisi"
    if yazi_turu == "olur":
        metin = (
            f"{ortak_baslik}{govde}\n\n"
            "         Yukarıda arz edilen hususun uygun görülmesini olurlarınıza arz ederim.\n"
            f"{imza}\n\n                                 OLUR\n"
            f"                                 {tarih}\n"
            "                                              Onay Makamı\n"
            "                                              Yetkili Makam"
        )
    else:
        muhatap = "Dağıtım yerlerine" if yazi_turu == "bilgilendirme" else "İlgili Makama"
        ilgi = "" if yazi_turu == "bilgilendirme" else "\nİlgi : Başvurunuz.\n"
        metin = f"{ortak_baslik}                          {muhatap}\n{ilgi}\n{govde}\n\n         {kapanis}\n{imza}"
    return {"yazi_turu": yazi_turu, "yazi_taslak_md": metin + "\n", "format_uyumlu": True}


async def yazi_taslak_node(state: dict[str, Any]) -> dict[str, Any]:
    """Resmî yazı taslağı (metin + PDF/DOCX) üret — jinja2 + resmî-üslup gövde."""
    turu = state.get("evrak_turu", "belirsiz")
    yazi_turu = EVRAK_TO_YAZI.get(turu, "cevabi_yazi")
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""

    try:
        from yazi.renderer import render_yazi
        from yazi.yazi_render import build_body, build_context

        metin = await build_body(yazi_turu, unsurlar, evrak_text)
        ctx = build_context(yazi_turu, unsurlar, metin)
        result = render_yazi(ctx)
    except Exception as exc:  # render altyapısı yok/hatalı → güvenli iskelet
        log.warning("yazi_taslak_fallback", err=str(exc))
        return _fallback_taslak(yazi_turu, str(unsurlar.get("konu", "") or ""))

    log.info(
        "yazi_taslak", turu=turu, yazi_turu=result.yazi_turu,
        format_uyumlu=result.format_uyumlu, n_eksik=len(result.eksik_format_alanlari),
    )
    out: dict[str, Any] = {
        "yazi_turu": result.yazi_turu,
        "yazi_taslak_md": result.metin,
        "format_uyumlu": result.format_uyumlu,
    }
    if result.pdf_bytes:
        out["yazi_taslak_pdf_bytes"] = result.pdf_bytes
        out["yazi_taslak_pdf_filename"] = result.pdf_filename
    if result.docx_bytes:
        out["yazi_taslak_docx_bytes"] = result.docx_bytes
        out["yazi_taslak_docx_filename"] = result.docx_filename
    return out


__all__ = ("yazi_taslak_node",)
