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
    EVRAK_TO_DEVIR_DAYANAK,
    EVRAK_TO_YAZI,
    LLM_ATLA_NODELAR,
    SDP_ONERI,
    YAZI_PLAN_PARALEL,
    birim_tr,
    etkili_birim,
)
from agents.kurum_kimlik import (
    efektif_idare_adi,
    gorus_muhatabi,
    hitap_eki,
    muzekkere_muhatabi,
)
from agents.mevzuat_kanit import mevzuat_kanit_paketi
from agents.servis_birim import SERVIS_BIRIM_TR
from yazi.sdp_plani import sdp_bul

log = structlog.get_logger()


def _hazirlayan_birim(state: dict[str, Any], yazi_turu: str) -> str:
    """Antet BİRİM satırı = taslağı hazırlayan birim (Yön. m.10 üçüncü satır).

    Öncelik: kaynak-doğrulanmış hedef birim (evrakı cevaplayacak gerçek birim; ust_yazi
    HARİÇ — orada hedef birim MUHATAP'tır, gönderen olamaz) → içerikten türetilen servis
    müdürlüğü (dict {kod, ad, sinyal}; eski kod-string biçimi de tolere edilir) → boş
    (render KURUM_BIRIM env / tür-özgü varsayılana düşer).
    """
    if yazi_turu != "ust_yazi" and state.get("durum") == "kaynak_dogrulandi":
        hedef = state.get("hedef_birim")
        if isinstance(hedef, str) and hedef.strip():
            return hedef.strip()
    servis = state.get("servis_birimi") or {}
    if isinstance(servis, dict):
        return str(servis.get("ad", "") or "")
    return SERVIS_BIRIM_TR.get(str(servis), "")


def _fallback_taslak(
    yazi_turu: str, konu: str, evrak_text: str = "", aktif_kurum: str = "",
) -> dict[str, Any]:
    """Render motoru import edilemezse minimum güvenli iskelet (uydurmasız)."""
    konu_satir = konu if konu else "Başvuru değerlendirmesi"
    tarih = date.today().strftime("%d.%m.%Y")
    # Kurum kimliği: çağıran zaten efektif_idare_adi() ile hesaplayıp geçirir (belge hitap-
    # ekliyse doküman kurumu, değilse aktif kurum/env) — burada yalnız son ENV/jenerik
    # fallback'i uygulanır.
    idare = (aktif_kurum or "").strip() or os.getenv("KURUM_ADI", "").strip() or "KAMU KURUMU"
    birim = os.getenv("KURUM_BIRIM", "").strip() or "Yazı İşleri Birimi"
    kapanis = {
        "cevabi_yazi": "Gereğini rica ederim.",
        "bilgilendirme": "Bilgilerinize arz ederim.",
        "olur": "Olurlarınıza arz ederim.",
        "gorus_mutalaa": "Bilgi ve gereğini arz ederim.",
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
        muhatap = "DAĞITIM YERLERİNE" if yazi_turu == "bilgilendirme" else "İlgili Makama"
        ilgi = "" if yazi_turu == "bilgilendirme" else "\nİlgi : Başvurunuz.\n"
        metin = f"{ortak_baslik}                          {muhatap}\n{ilgi}\n{govde}\n\n         {kapanis}\n{imza}"
    return {"yazi_turu": yazi_turu, "yazi_taslak_md": metin + "\n", "format_uyumlu": True}


def _devir_var_mi(state: dict[str, Any]) -> bool:
    """Yetkisizlik hâli: evrak muhataba gelmiş ama YETKİLİ kurum farklı (route_ajan tespiti).

    Bu durumda yapılacak iş kurum-içi havale DEĞİL, yetkili kuruma göndermedir (devir):
    3071 m.8 / 4982 m.7. yetkili_kurum yalnız route_ajan DISARIDA dalında muhataptan
    farklılaşır; her ikisi de dolu ve slug'lar farklı olmalı.
    """
    muhatap = state.get("muhatap_kurum") or {}
    yetkili = state.get("yetkili_kurum") or {}
    ms, ys = muhatap.get("slug"), yetkili.get("slug")
    return bool(ms and ys and ms != ys)


async def _devir_taslagi(
    state: dict[str, Any], efektif_kurum: str,
) -> dict[str, Any]:
    """Yetkisizlik → yetkili kuruma DEVİR üst yazısı (deterministik, uydurmasız).

    Frontend `havaleYorum` bu hâli 'devir yazısı gerekli' diye işaretliyordu; taslak da
    artık gerçekten devir yazısı üretir (üslup/eylem tutarlılığı). Muhatap = yetkili kurum
    (üst yazı m.14); antet İDARE = evrakı alan kurum (efektif_kurum). Dayanak tür-duyarlı,
    yoksa hükme atıf yapılmaz (madde uydurulmaz).
    """
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_context, devir_govdesi, ts13298_ust_veri

    unsurlar = state.get("bilgi_unsurlari") or {}
    yetkili = state.get("yetkili_kurum") or {}
    muhatap_kurum = state.get("muhatap_kurum") or {}
    konu = str(unsurlar.get("konu", "") or "")
    dayanak = EVRAK_TO_DEVIR_DAYANAK.get(state.get("evrak_turu", ""), "")
    metin = devir_govdesi(konu, dayanak)
    # Devir yazısını GÖNDEREN, evrakı alan kurumdur → antet İDARE = muhatap_kurum (route_ajan'ın
    # güvenilir tespiti); boşsa efektif_kurum'a düş. Muhatap SATIRI ise YETKİLİ kurum (m.14),
    # BÜYÜK + yönelme eki ("...VALİLİĞİNE"; kısaltmayla biten unvana ek gelmez, büyük harf kalır).
    idare = str(muhatap_kurum.get("ad", "") or "").strip() or efektif_kurum
    muhatap = hitap_eki(str(yetkili.get("ad", "") or "")) or "İLGİLİ MAKAMA"
    ctx = build_context(
        "ust_yazi", unsurlar, metin, muhatap_override=muhatap,
        hazirlayan_birim="", idare_adi=idare)
    result = render_yazi(ctx)
    jinja = ctx.jinja_vars()
    log.info("yazi_taslak_devir", muhatap=yetkili.get("slug"), dayanak=bool(dayanak))
    out: dict[str, Any] = {
        "yazi_turu": result.yazi_turu,
        "yazi_taslak_md": result.metin,
        "format_uyumlu": result.format_uyumlu,
        "yazi_plan_notu": (
            f"Yetkisizlik: evrak {idare or 'kurumumuz'} adına gelmiş; konu "
            f"{yetkili.get('ad', 'yetkili kurum')} görev alanında. "
            f"{dayanak + ' gereğince devir' if dayanak else 'Yetkili kuruma devir'} yazısı üretildi."
        ),
        "devir": True,
        "antet_meta": {
            "idare": jinja.get("idare_adi", ""), "birim": jinja.get("birim_adi", ""),
            "muhatap": jinja.get("muhatap", ""),
        },
        "ust_veri": ts13298_ust_veri(
            result.yazi_turu, konu, None, jinja.get("sayi_satiri", ""),
            date.today().strftime("%d.%m.%Y")),
    }
    if result.pdf_bytes:
        out["yazi_taslak_pdf_bytes"] = result.pdf_bytes
        out["yazi_taslak_pdf_filename"] = result.pdf_filename
    if result.docx_bytes:
        out["yazi_taslak_docx_bytes"] = result.docx_bytes
        out["yazi_taslak_docx_filename"] = result.docx_filename
    return out


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
    # Karar kartı/finalize/arşiv ile aynı hedef çözümünü kullan: doğrulanmış birim, kaynak
    # önerisi, servis önerisi, son çare kaba kategori. Onay gerekliliği state'te ayrıca korunur.
    rota_var = any(
        state.get(alan)
        for alan in ("hedef_birim", "hedef_birim_oneri", "servis_birimi", "hedef_kategori")
    )
    hedef_birim = etkili_birim(state) if rota_var else ""
    plan_notu = ""
    kanit_paketi = mevzuat_kanit_paketi(state)
    # Antet İDARE = belge açıkça bir kuruma hitaben yazılmışsa (yönelme-ekli, yargı hariç)
    # O KURUM otomatik — sormadan/uyarmadan; değilse aktif kurum (istek-bazlı override,
    # boşsa env KURUM_ADI'ya düşer). "Biz belgeye göre hareket ediyoruz" (19 Tem 2. revizyon).
    efektif_kurum = efektif_idare_adi(
        evrak_text, unsurlar, str(state.get("aktif_kurum") or "").strip())

    try:
        from yazi.renderer import render_yazi
        from yazi.yazi_plan import yazi_plani
        from yazi.yazi_render import (
            build_alt_talep_taslaklari,
            build_body_sonuclu,
            build_context,
            hitap_bicimi,
            ts13298_ust_veri,
        )

        alt_out = await build_alt_talep_taslaklari(
            alt_talepler, unsurlar, aktif_kurum=efektif_kurum)
        if len(alt_out) >= 2:
            return _coklu_cikti(alt_out)
        # Yetkisizlik (tek-konu, farklı yetkili kurum) → devir üst yazısı; plan makinesi
        # çalıştırılmaz (tür sabittir: ust_yazi, muhatap yetkili kurum, gövde kalıp).
        if _devir_var_mi(state):
            return await _devir_taslagi(state, efektif_kurum)
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
                govde_sonucu = await build_body_sonuclu(
                    yazi_turu, unsurlar, evrak_text, mevzuat_kanit_paketi=kanit_paketi)
            except BaseException:
                plan_gorevi.cancel()
                raise
            plan = await plan_gorevi
            if plan and plan["yazi_turu"] != yazi_turu:
                log.info("yazi_plan_tur_degisti", statik=yazi_turu, plan=plan["yazi_turu"])
                govde_sonucu = await build_body_sonuclu(
                    plan["yazi_turu"], unsurlar, evrak_text, mevzuat_kanit_paketi=kanit_paketi)
        else:
            plan = None if plan_atla else await yazi_plani(
                turu, unsurlar, evrak_text, hedef_birim)
            govde_sonucu = await build_body_sonuclu(
                plan["yazi_turu"] if plan else yazi_turu,
                unsurlar,
                evrak_text,
                mevzuat_kanit_paketi=kanit_paketi,
            )
        if plan:
            yazi_turu = plan["yazi_turu"]
            plan_notu = plan["gerekce"]
        metin = govde_sonucu.metin
        # ust_yazi = kurum-içi iletim (Yön. m.14): muhatap gönderen değil hedef birim.
        # gorus_mutalaa = görüşü TALEP EDEN birime m.14/2 hitap biçimiyle — plan muhatabı
        # da AYNI biçim kapısından geçer (gerçek-LLM yolunda eksiz/karışık-kasa kalıyordu).
        plan_muhatap = (plan or {}).get("muhatap") or ""
        gonderen = str(unsurlar.get("gonderen", "") or "")
        if yazi_turu == "gorus_mutalaa":
            hedef_muhatap = gorus_muhatabi(evrak_text, plan_muhatap) or None
        elif yazi_turu == "muzekkere":
            # m.14/2 hitap biçimli + yargı/idari-iç ayrımı (kaynaktan; plan güvenilmez).
            hedef_muhatap = muzekkere_muhatabi(evrak_text, gonderen) or None
        elif yazi_turu == "ust_yazi":
            # m.14/2: hedef birim muhatabı BÜYÜK + yönelme eki ("...MÜDÜRLÜĞÜNE").
            hedef_muhatap = plan_muhatap or (
                hitap_eki(birim_tr(hedef_birim)) if hedef_birim else None)
        else:
            # cevabi_yazi/bilgilendirme: LLM planı çıplak ad döndürebilir ("Mehmet Demir");
            # _muhatap()'ın "Sayın" kapısından bu yol geçmiyordu (2026-07-19 bulgusu) —
            # hitap_bicimi ile aynı m.14 kuralına sokulur (kurum aynen, gerçek kişi Sayın).
            hedef_muhatap = hitap_bicimi(plan_muhatap) if plan_muhatap else None
        # SDP konu-kodu (Yön. m.11): evrak türü + konudan deterministik → Sayı satırı m.11-yapılı
        # gerçek koda kavuşur (ENV-gated; kapalıysa Sayı placeholder = bugünkü davranış).
        konu = str(unsurlar.get("konu", "") or "")
        sdp = sdp_bul(turu, konu, ek_metin=evrak_text) if SDP_ONERI else None
        # Antet İDARE = efektif_kurum (yukarıda hesaplandı: belge hitap-ekliyse doküman
        # kurumu, değilse aktif kurum/env) + hazırlayan BİRİM (kaynak-doğrulanmış hedef
        # birim → konuya göre servis müdürlüğü → env/tür varsayılanı).
        hazirlayan = _hazirlayan_birim(state, yazi_turu)
        ctx = build_context(yazi_turu, unsurlar, metin, muhatap_override=hedef_muhatap,
                            sdp_kodu=(sdp or {}).get("kod", ""),
                            hazirlayan_birim=hazirlayan, idare_adi=efektif_kurum)
        result = render_yazi(ctx)
        jinja = ctx.jinja_vars()
        sayi_satiri = jinja.get("sayi_satiri", "")
        # Sistem-tespitli antet/muhatap değerleri — verify grounding muafiyeti bunları
        # "kaynakta yok → uydurma" saymasın diye state ile taşınır (Sayı satırı deseni).
        antet_meta = {
            "idare": jinja.get("idare_adi", ""), "birim": jinja.get("birim_adi", ""),
            "muhatap": jinja.get("muhatap", ""),
        }
    except Exception as exc:  # render altyapısı yok/hatalı → güvenli iskelet
        log.warning("yazi_taslak_fallback", err=str(exc))
        return _fallback_taslak(
            yazi_turu, str(unsurlar.get("konu", "") or ""), evrak_text,
            aktif_kurum=efektif_kurum)

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
        # LLM'e verilen, yalnız korpus-kaynaklı madde parçaları ve kullanım sonucu.
        "mevzuat_kanit_paketi": kanit_paketi,
        "mevzuat_kanit_durumu": govde_sonucu.mevzuat_kanit_durumu,
        "mevzuat_kanit_uyari": list(govde_sonucu.mevzuat_kanit_uyari),
        "mevzuat_kanit_atif_sayisi": govde_sonucu.mevzuat_kanit_atif_sayisi,
        # Sistem-tespitli antet künyesi (grounding muafiyeti + UI şeffaflığı).
        "antet_meta": antet_meta,
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
