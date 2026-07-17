"""Görev 2 — Resmî yazı taslaklama node'u.

Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)
formatına göre taslak üretir: data/templates/*.j2 (ust_yazi/cevabi_yazi/
bilgilendirme/olur/muzekkere/gorus_mutalaa) jinja2 ile render edilir; metin
gövdesi resmî üslupta üretilir (LLM varsa get_llm, yoksa deterministik şablon).
Eksik alanlar
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

import asyncio
import os
from datetime import date
from typing import Any

import structlog

from agents.config import (
    EVRAK_TO_YAZI,
    LLM_ATLA_NODELAR,
    SDP_ONERI,
    YAZI_PLAN_PARALEL,
    birim_tr,
)
from yazi.sdp_plani import sdp_bul

log = structlog.get_logger()


def _fallback_taslak(yazi_turu: str, konu: str) -> dict[str, Any]:
    """Render motoru import edilemezse minimum güvenli iskelet (uydurmasız)."""
    konu_satir = konu if konu else "Başvuru değerlendirmesi"
    tarih = date.today().strftime("%d.%m.%Y")
    # Kurum kimliği ENV'den (models._DEMO_DEFAULTS ile aynı kaynak); boşsa jenerik demo korunur.
    idare = os.getenv("KURUM_ADI", "").strip() or "KAMU KURUMU"
    birim = os.getenv("KURUM_BIRIM", "").strip() or "YAZI İŞLERİ BİRİMİ"
    kapanis = {
        "cevabi_yazi": "Gereğini rica ederim.",
        "bilgilendirme": "Bilgilerinize arz ederim.",
        "olur": "Olurlarınıza arz ederim.",
        "gorus_mutalaa": "Bilgilerine arz olunur.",
    }.get(yazi_turu, "Gereğini arz ederim.")  # muzekkere/ust_yazi bu genel varsayılanı paylaşır
    ortak_baslik = (
        "                                   T.C.\n"
        f"{idare.center(43).rstrip()}\n"
        f"{birim.center(43).rstrip()}\n\n"
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


def _coklu_cikti(alt_out: list[dict[str, Any]]) -> dict[str, Any]:
    """Çok-konulu (>=2 birim) çıktı — tekil alanlar geriye-uyum için ilk birimi taşır."""
    ilk = alt_out[0]
    log.info("yazi_taslak_coklu", n_birim=len(alt_out), birimler=[a.get("birim") for a in alt_out])
    return {
        "yazi_turu": ilk["yazi_turu"], "yazi_taslak_md": ilk["yazi_taslak_md"],
        "format_uyumlu": ilk["format_uyumlu"], "alt_talepler": alt_out,
    }


async def yazi_taslak_node(state: dict[str, Any]) -> dict[str, Any]:
    """Resmî yazı taslağı (metin + PDF/DOCX) üret — jinja2 + resmî-üslup gövde.

    Çok-konulu evrakta (alt_talepler >= 2) birleşik taslak HİÇ üretilmez — her
    alt-talep kendi hedef birimine giden bağımsız bir üst yazı alır (bkz.
    yazi_render.build_alt_talep_taslaklari); tekil yazi_taslak_md alanı geriye
    uyum için ilk birim taslağını taşır, asıl N taslak alt_talepler içindedir.
    """
    turu = state.get("evrak_turu", "belirsiz")
    yazi_turu = EVRAK_TO_YAZI.get(turu, "cevabi_yazi")  # statik taban (fallback + coklu yol)
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""
    alt_talepler = state.get("alt_talepler") or []
    hedef_birim = state.get("hedef_birim", "")
    plan_notu = ""

    try:
        from yazi.renderer import render_yazi
        from yazi.yazi_plan import yazi_plani
        from yazi.yazi_render import (
            build_alt_talep_taslaklari,
            build_body,
            build_context,
            ts13298_ust_veri,
        )

        alt_out = await build_alt_talep_taslaklari(alt_talepler, unsurlar, evrak_text)
        if len(alt_out) >= 2:
            return _coklu_cikti(alt_out)
        # DİNAMİK plan (2026-07-09): LLM belgeyi anlayıp türü/muhatabı duruma göre seçer;
        # mock/hata/kapalı-küme-dışı/grounded-olmayan-muhatap → None/kısmi düşürme →
        # statik EVRAK_TO_YAZI + varsayılan muhatap yolu AYNEN devrede kalır.
        plan_atla = "yazi_plan" in LLM_ATLA_NODELAR
        if YAZI_PLAN_PARALEL and not plan_atla:
            # Hız 15c — plan ∥ gövde: gövde STATİK türle plana paralel üretilir; plan
            # farklı tür seçerse gövde o türle YENİDEN üretilir → çıktı seri yolla birebir
            # (aynı prompt'lar), tipik yolda (plan statik türü doğrular) ~1 çağrı kazanılır.
            # Mock'ta plan None + gövde deterministik → davranış/çağrı sayısı birebir.
            plan_gorevi = asyncio.create_task(
                yazi_plani(turu, unsurlar, evrak_text, hedef_birim))
            try:
                metin = await build_body(yazi_turu, unsurlar, evrak_text)
            except BaseException:
                plan_gorevi.cancel()
                raise
            plan = await plan_gorevi
            if plan and plan["yazi_turu"] != yazi_turu:
                log.info("yazi_plan_tur_degisti", statik=yazi_turu, plan=plan["yazi_turu"])
                metin = await build_body(plan["yazi_turu"], unsurlar, evrak_text)
        else:
            plan = None if plan_atla else await yazi_plani(
                turu, unsurlar, evrak_text, hedef_birim)
            metin = await build_body(
                plan["yazi_turu"] if plan else yazi_turu, unsurlar, evrak_text)
        if plan:
            yazi_turu = plan["yazi_turu"]
            plan_notu = plan["gerekce"]
        # ust_yazi = kurum-içi iletim (Yön. m.14): muhatap gönderen değil hedef birim.
        hedef_muhatap = (plan or {}).get("muhatap") or (
            birim_tr(hedef_birim) if yazi_turu == "ust_yazi" else None)
        # SDP konu-kodu (Yön. m.11): evrak türü + konudan deterministik → Sayı satırı m.11-yapılı
        # gerçek koda kavuşur (ENV-gated; kapalıysa Sayı placeholder = bugünkü davranış).
        konu = str(unsurlar.get("konu", "") or "")
        sdp = sdp_bul(turu, konu, ek_metin=evrak_text) if SDP_ONERI else None
        ctx = build_context(yazi_turu, unsurlar, metin, muhatap_override=hedef_muhatap,
                            sdp_kodu=(sdp or {}).get("kod", ""))
        result = render_yazi(ctx)
        sayi_satiri = ctx.jinja_vars().get("sayi_satiri", "")
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
        # Dinamik planın insan-okunur gerekçesi (boş = statik yol kullanıldı) — UI notu.
        "yazi_plan_notu": plan_notu,
        # TS 13298 üst-veri (EBYS metadata) — belge türü + konu + SDP + güvenlik + tarih/sayı.
        "ust_veri": ts13298_ust_veri(
            result.yazi_turu, konu, sdp, sayi_satiri,
            date.today().strftime("%d.%m.%Y")),
    }
    if result.pdf_bytes:
        out["yazi_taslak_pdf_bytes"] = result.pdf_bytes
        out["yazi_taslak_pdf_filename"] = result.pdf_filename
    if result.docx_bytes:
        out["yazi_taslak_docx_bytes"] = result.docx_bytes
        out["yazi_taslak_docx_filename"] = result.docx_filename
    return out


__all__ = ("yazi_taslak_node",)
