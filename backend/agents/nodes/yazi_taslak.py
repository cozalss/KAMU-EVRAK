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
    muzekkere_muhatabi,
)
from agents.mevzuat_kanit import mevzuat_kanit_paketi

log = structlog.get_logger()


def _hazirlayan_birim(state: dict[str, Any], yazi_turu: str) -> str:
    """Antet BİRİM satırı = yazının ÇIKTIĞI birim (Yön. m.10 üçüncü satır).

    Henüz havalesi yapılmamış bir birim vatandaşa giden ara cevabı imzalamış görünmemeli
    (2026-10-05 incelemesi: 'ANKARA İL SAĞLIK MÜDÜRLÜĞÜ / İl/İlçe Sağlık Müdürlüğü' —
    kategori etiketi; 'ÇANKAYA TAPU MÜDÜRLÜĞÜ / Tapu Dairesi Başkanlığı' — merkez birimi).
    Birim YALNIZ kaynakta doğrulanmış + otomatik havalesi kesin (durum=kaynak_dogrulandi)
    bir İÇ birimse antete girer; ust_yazi HARİÇ (orada birim muhataptır). İçerik anahtar
    sözcüğüyle seçilen servis birimi doğrulanmış sayılmaz. Aksi hâlde boş → KURUM_BIRIM
    env; o da yoksa satır basılmaz (uydurmak yerine boş).
    """
    from yazi.baslik import kategori_etiketi_mi

    if yazi_turu == "ust_yazi" or state.get("durum") != "kaynak_dogrulandi":
        return ""
    yon = state.get("yonlendirme") or {}
    birim = yon.get("birim") or {}
    if yon and (yon.get("karar") != "ICERIDE" or birim.get("bagli")):
        return ""
    ad = str(birim.get("ad") or state.get("hedef_birim") or "").strip()
    return "" if not ad or kategori_etiketi_mi(ad) else ad


def _fallback_taslak(
    yazi_turu: str, konu: str, evrak_text: str = "", idare_adi: str = "",
) -> dict[str, Any]:
    """Render motoru import edilemezse minimum güvenli iskelet (uydurmasız)."""
    konu_satir = konu if konu else "Başvuru değerlendirmesi"
    tarih = date.today().strftime("%d.%m.%Y")
    # Kurum kimliği: çağıran zaten efektif_idare_adi() ile hesaplayıp geçirir (belge hitap-
    # ekliyse doküman kurumu, değilse boş) — burada yalnız son ENV/jenerik fallback'i uygulanır.
    idare = (idare_adi or "").strip() or os.getenv("KURUM_ADI", "").strip() or "KAMU KURUMU"
    birim = os.getenv("KURUM_BIRIM", "").strip()  # yoksa satır basılmaz (uydurma birim yok)
    kapanis = {
        "cevabi_yazi": "Gereğini rica ederim.",
        "bilgilendirme": "Bilgilerinize arz ederim.",
        "olur": "Olurlarınıza arz ederim.",
        "gorus_mutalaa": "Bilgi ve gereğini arz ederim.",
    }.get(yazi_turu, "Gereğini arz ederim.")  # muzekkere/ust_yazi bu genel varsayılanı paylaşır
    ortak_baslik = (
        "                                   T.C.\n"
        f"{idare.center(43).rstrip()}\n"
        + (f"{birim.center(43).rstrip()}\n" if birim else "") + "\n"
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


def _devir_hedefi(state: dict[str, Any]) -> dict[str, Any]:
    """Devir gerekiyorsa yetkili kurum künyesi ({slug, ad}), yoksa {}.

    Öncelik Akış Y'nin `yonlendirme.devir` kararı; yoksa eski yetkisizlik hâli: route_ajan
    yetkili_kurum'u muhataptan FARKLI buldu (iki slug dolu ve farklı).
    """
    yon = state.get("yonlendirme") or {}
    if yon.get("karar") == "KARMA":
        # KARMA'da belgenin TAMAMI devredilmez: kurum içi talepler havale edilir, yalnız
        # yetki dışı talepler devredilir (yazi.paket.havale_paketi talep başına ayırır).
        return {}
    devir = yon.get("devir") or {}
    if devir.get("gerekli") and isinstance(devir.get("yetkili_kurum"), dict):
        return devir["yetkili_kurum"]
    muhatap = state.get("muhatap_kurum") or {}
    yetkili = state.get("yetkili_kurum") or {}
    ms, ys = muhatap.get("slug"), yetkili.get("slug")
    return yetkili if (ms and ys and ms != ys) else {}


def _devir_var_mi(state: dict[str, Any]) -> bool:
    """Yetkisizlik hâli: evrak muhataba gelmiş ama YETKİLİ kurum farklı (3071 m.5)."""
    return bool(_devir_hedefi(state))


def _paket_ogesi(rol: str, yazi_turu: str, muhatap: str, konu: str, md: str,
                 format_uyumlu: bool, birim: str = "") -> dict[str, Any]:
    return {"rol": rol, "yazi_turu": yazi_turu, "muhatap": muhatap, "birim": birim,
            "konu": konu, "talep_ids": [], "yazi_taslak_md": md,
            "format_uyumlu": format_uyumlu}


def _dosya_alanlari(out: dict[str, Any], result: Any) -> dict[str, Any]:
    if result.pdf_bytes:
        out["yazi_taslak_pdf_bytes"] = result.pdf_bytes
        out["yazi_taslak_pdf_filename"] = result.pdf_filename
    if result.docx_bytes:
        out["yazi_taslak_docx_bytes"] = result.docx_bytes
        out["yazi_taslak_docx_filename"] = result.docx_filename
    return out


async def _devir_taslagi(
    state: dict[str, Any], efektif_kurum: str, baglam: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Yetkisizlik → yetkili kuruma DEVİR yazısı + (vatandaş belgesinde) dilekçe sahibine
    bilgi yazısı (3071 m.5: "ayrıca dilekçe sahibine de bilgi verilir"). Deterministik.

    Antet İDARE = evrakı alan kurum; muhatap SATIRI = yetkili kurum (m.14, büyük + yönelme
    eki). Dayanak tür-duyarlı; yoksa hükme atıf yapılmaz (madde uydurulmaz).
    """
    from yazi.baslik import gelen_evrak_coz, muhatap_bicimle
    from yazi.paket import cevap_yazisi, devir_bilgi_govdesi, vatandas_belgesi_mi
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_context, devir_govdesi, ts13298_ust_veri

    baglam = baglam or {}
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""
    yetkili = _devir_hedefi(state)
    muhatap_kurum = state.get("muhatap_kurum") or {}
    idare = str(muhatap_kurum.get("ad", "") or "").strip() or efektif_kurum
    gelen = baglam.get("gelen") or gelen_evrak_coz(
        evrak_text, unsurlar, state.get("evrak_turu", ""), muhatap_idare=idare)
    dayanak = EVRAK_TO_DEVIR_DAYANAK.get(state.get("evrak_turu", ""), "")
    yetkili_ad = str(yetkili.get("ad", "") or "")
    sdp_kodu = baglam.get("sdp_kodu", "")
    ctx = build_context(
        "ust_yazi", unsurlar, devir_govdesi(str(unsurlar.get("konu", "") or ""), dayanak),
        muhatap_override=muhatap_bicimle(yetkili_ad, "kamu_idaresi") or "İLGİLİ MAKAMA",
        hazirlayan_birim="", idare_adi=idare, gelen=gelen, rol="devir",
        kaynak_metin=evrak_text, sdp_kodu=sdp_kodu,
        konu_adaylari=[unsurlar.get("konu"), gelen.get("konu_satiri")])
    result = render_yazi(ctx)
    jinja = ctx.jinja_vars()
    paket = [_paket_ogesi("devir", result.yazi_turu, ctx.muhatap, ctx.konu, result.metin,
                          result.format_uyumlu)]
    if vatandas_belgesi_mi(gelen):
        paket.append(cevap_yazisi(
            gelen, unsurlar, devir_bilgi_govdesi(gelen, yetkili_ad, dayanak),
            rol="devir_bilgi", kaynak_metin=evrak_text, idare_adi=idare, sdp_kodu=sdp_kodu))
    log.info("yazi_taslak_devir", muhatap=yetkili.get("slug"), dayanak=bool(dayanak),
             n_yazi=len(paket))
    out: dict[str, Any] = {
        "yazi_turu": result.yazi_turu,
        "yazi_taslak_md": result.metin,
        "format_uyumlu": result.format_uyumlu,
        "yazi_plan_notu": (
            f"Yetkisizlik: evrak {idare or 'kurumumuz'} adına gelmiş; konu "
            f"{yetkili_ad or 'yetkili kurum'} görev alanında. "
            f"{dayanak + ' gereğince devir' if dayanak else 'Yetkili kuruma devir'} yazısı"
            f"{' ve dilekçe sahibine bilgi yazısı' if len(paket) > 1 else ''} üretildi."
        ),
        "devir": True,
        "yazi_paketi": paket,
        "antet_meta": {
            "idare": jinja.get("idare_adi", ""), "birim": jinja.get("birim_adi", ""),
            "muhatap": jinja.get("muhatap", ""),
        },
        "ust_veri": ts13298_ust_veri(
            result.yazi_turu, ctx.konu, baglam.get("sdp"), jinja.get("sayi_satiri", ""),
            date.today().strftime("%d.%m.%Y")),
    }
    return _dosya_alanlari(out, result)


def _coklu_cikti(alt_out: list[dict[str, Any]],
                 paket: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Çok-konulu çıktı — tekil alanlar geriye-uyum için ilk havaleyi taşır; paket tamamıdır."""
    ilk = alt_out[0]
    log.info("yazi_taslak_coklu", n_birim=len(alt_out),
             n_yazi=len(paket or []), birimler=[a.get("birim") for a in alt_out])
    return {
        "yazi_turu": ilk["yazi_turu"], "yazi_taslak_md": ilk["yazi_taslak_md"],
        "format_uyumlu": ilk["format_uyumlu"], "alt_talepler": alt_out,
        "yazi_paketi": list(paket or []),
    }


def _idare_coz(state: dict[str, Any], evrak_text: str, unsurlar: dict[str, Any]) -> str:
    """Antet İDARE (m.10): belgenin kendi hitabı → route_ajan'ın kimlik kapısından geçmiş
    muhatap_kurum künyesi → boş (render env KURUM_ADI'ya düşer). Yargı kaynağı antet olamaz."""
    from agents.kurum_kimlik import is_yargi_kurumu
    from yazi.baslik import dagitim_ifadesi_mi
    from yazi.yazi_render import _kurum_adi_mi

    efektif = efektif_idare_adi(evrak_text, unsurlar)
    if efektif:
        return efektif
    muhatap = state.get("muhatap_kurum") or {}
    ad = str(muhatap.get("ad") or "").strip()
    # 'Dağıtım Yerleri' bir kurum DEĞİLDİR (m.19 dağıtım ifadesi); kurum görünümü olmayan
    # ad antete girmez → KURUM_ADI env / jenerik (2026-10-05: 'T.C. / DAĞITIM YERLERİ').
    if ad and not is_yargi_kurumu(muhatap) and not dagitim_ifadesi_mi(ad) and _kurum_adi_mi(ad):
        return ad
    return ""


async def _sdp_coz(turu: str, state: dict[str, Any]) -> dict[str, Any] | None:
    """SDP TEK motor (agents.nodes.arsiv seçimi); yazı Sayı satırı ve arşiv aynı kararı
    kullanır. SDP_ONERI kapalıysa None (Sayı placeholder kalır, arşiv kendi seçer)."""
    if not SDP_ONERI:
        return None
    from agents.nodes.arsiv import sdp_secimi_yap
    unsurlar = state.get("bilgi_unsurlari") or {}
    return await sdp_secimi_yap(turu, str(unsurlar.get("sayi") or ""), state)


def _sdp_render(secim: dict[str, Any] | None) -> dict[str, str] | None:
    """Arşiv seçimi → Sayı satırına girecek çıplak kod ([DOĞRULA] eki arşivde kalır)."""
    if not secim or not secim.get("kod"):
        return None
    kod = str(secim["kod"]).split(" ")[0]
    return {"kod": kod, "baslik": str(secim.get("ad") or "")} if kod[:1].isdigit() else None


async def _plan_ve_govde(
    turu: str, yazi_turu: str, unsurlar: dict[str, Any], evrak_text: str,
    hedef_birim: str, kanit_paketi: list[dict[str, Any]],
) -> tuple[dict[str, str] | None, Any]:
    """Dinamik plan (LLM, kapalı küme) ∥ statik türle gövde; plan farklı tür seçerse gövde
    o türle yeniden üretilir. Mock/hata → plan None, statik yol."""
    from yazi.yazi_plan import yazi_plani
    from yazi.yazi_render import build_body_sonuclu

    if "yazi_plan" in LLM_ATLA_NODELAR:
        return None, await build_body_sonuclu(
            yazi_turu, unsurlar, evrak_text, mevzuat_kanit_paketi=kanit_paketi)
    if not YAZI_PLAN_PARALEL:
        plan = await yazi_plani(turu, unsurlar, evrak_text, hedef_birim)
        return plan, await build_body_sonuclu(
            plan["yazi_turu"] if plan else yazi_turu, unsurlar, evrak_text,
            mevzuat_kanit_paketi=kanit_paketi)
    plan_gorevi = asyncio.create_task(yazi_plani(turu, unsurlar, evrak_text, hedef_birim))
    try:
        govde = await build_body_sonuclu(
            yazi_turu, unsurlar, evrak_text, mevzuat_kanit_paketi=kanit_paketi)
    except BaseException:
        plan_gorevi.cancel()
        raise
    plan = await plan_gorevi
    if plan and plan["yazi_turu"] != yazi_turu:
        log.info("yazi_plan_tur_degisti", statik=yazi_turu, plan=plan["yazi_turu"])
        govde = await build_body_sonuclu(
            plan["yazi_turu"], unsurlar, evrak_text, mevzuat_kanit_paketi=kanit_paketi)
    return plan, govde


def _hedef_muhatap(
    yazi_turu: str, plan_muhatap: str, evrak_text: str, gelen: dict[str, Any],
    hedef_birim: str,
) -> str | None:
    """m.14 muhatap — tür kuralı + tek biçim kapısı (yazi.baslik.muhatap_bicimle).
    None → build_context gönderen muhatabını (cevap rolü) kendisi kurar."""
    from yazi.baslik import gonderen_muhatabi, muhatap_bicimle
    from yazi.yazi_render import _kurum_adi_mi

    if yazi_turu == "gorus_mutalaa":
        return gorus_muhatabi(evrak_text, plan_muhatap) or None
    if yazi_turu == "muzekkere":
        return muzekkere_muhatabi(evrak_text, str(gelen.get("gonderen_ad") or "")) or None
    if yazi_turu == "ust_yazi":
        ad = plan_muhatap or birim_tr(hedef_birim)
        return muhatap_bicimle(ad, "birim") if ad else None
    if gonderen_muhatabi(gelen) or not plan_muhatap:
        return None  # cevap muhatabı göndericidir; plan yalnız gönderen bilinmiyorsa
    return muhatap_bicimle(
        plan_muhatap, "kamu_idaresi" if _kurum_adi_mi(plan_muhatap) else "gercek_kisi")


def _konu_adaylari(gelen: dict[str, Any], unsurlar: dict[str, Any]) -> list[str | None]:
    """Kurumdan gelen yazıda kendi 'Konu:' satırı resmî konudur ve önce gelir; vatandaş
    belgesinde çıkarılan özet konu önce gelir."""
    if gelen.get("gonderen_turu") == "kamu_idaresi":
        return [gelen.get("konu_satiri"), unsurlar.get("konu")]
    return [unsurlar.get("konu"), gelen.get("konu_satiri")]


def _baglam_kur(state: dict[str, Any]) -> dict[str, Any]:
    """Düğüm girdilerinden tek seferlik bağlam: tür, idare, gelen evrak, hedef birim."""
    from yazi.baslik import gelen_evrak_coz

    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""
    idare = _idare_coz(state, evrak_text, unsurlar)
    rota_var = any(state.get(alan) for alan in (
        "yonlendirme", "hedef_birim", "hedef_birim_oneri", "servis_birimi", "hedef_kategori"))
    return {
        "turu": turu, "unsurlar": unsurlar, "evrak_text": evrak_text, "idare": idare,
        "gelen": gelen_evrak_coz(evrak_text, unsurlar, turu, muhatap_idare=idare),
        "hedef_birim": etkili_birim(state) if rota_var else "",
    }


def _rol(yazi_turu: str) -> str:
    return {"olur": "olur", "ust_yazi": "havale"}.get(yazi_turu, "cevap")


async def _tekli_taslak(state: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Tek konulu evrak: plan + gövde + tek çözücüyle başlık + render."""
    from agents.nodes._llm_extract import real_llm
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_context, ts13298_ust_veri

    unsurlar, evrak_text, gelen = b["unsurlar"], b["evrak_text"], b["gelen"]
    yazi_turu = EVRAK_TO_YAZI.get(b["turu"], "cevabi_yazi")
    kanit_paketi = mevzuat_kanit_paketi(state)
    plan, govde = await _plan_ve_govde(
        b["turu"], yazi_turu, unsurlar, evrak_text, b["hedef_birim"], kanit_paketi)
    plan_yedek = (plan is None and real_llm() is not None
                  and "yazi_plan" not in LLM_ATLA_NODELAR)
    if plan:
        yazi_turu = plan["yazi_turu"]
    ctx = build_context(
        yazi_turu, unsurlar, govde.metin,
        muhatap_override=_hedef_muhatap(yazi_turu, (plan or {}).get("muhatap") or "",
                                        evrak_text, gelen, b["hedef_birim"]),
        sdp_kodu=(b["sdp"] or {}).get("kod", ""),
        hazirlayan_birim=_hazirlayan_birim(state, yazi_turu), idare_adi=b["idare"],
        gelen=gelen, kaynak_metin=evrak_text, konu_adaylari=_konu_adaylari(gelen, unsurlar))
    result = render_yazi(ctx)
    jinja = ctx.jinja_vars()
    log.info("yazi_taslak", turu=b["turu"], yazi_turu=result.yazi_turu,
             format_uyumlu=result.format_uyumlu, plan_yedek=plan_yedek)
    out: dict[str, Any] = {
        "yazi_turu": result.yazi_turu,
        "yazi_taslak_md": result.metin,
        "format_uyumlu": result.format_uyumlu,
        # Dinamik planın insan-okunur gerekçesi (boş = statik yol kullanıldı) — UI notu.
        "yazi_plan_notu": (plan or {}).get("gerekce", ""),
        # Gerçek LLM varken plan alınamadı → tür statik tablodan (görünür bayrak, sessiz değil).
        "yazi_plan_yedek": plan_yedek,
        "mevzuat_kanit_paketi": kanit_paketi,
        "mevzuat_kanit_durumu": govde.mevzuat_kanit_durumu,
        "mevzuat_kanit_uyari": list(govde.mevzuat_kanit_uyari),
        "mevzuat_kanit_atif_sayisi": govde.mevzuat_kanit_atif_sayisi,
        # Sistem-tespitli antet künyesi (grounding muafiyeti + UI şeffaflığı).
        "antet_meta": {"idare": jinja.get("idare_adi", ""), "birim": jinja.get("birim_adi", ""),
                       "muhatap": jinja.get("muhatap", "")},
        "ust_veri": ts13298_ust_veri(result.yazi_turu, ctx.konu, b["sdp"],
                                     jinja.get("sayi_satiri", ""),
                                     date.today().strftime("%d.%m.%Y")),
        "yazi_paketi": [_paket_ogesi(_rol(result.yazi_turu), result.yazi_turu, ctx.muhatap,
                                     ctx.konu, result.metin, result.format_uyumlu)],
    }
    return _dosya_alanlari(out, result)


def _talep_ogeleri(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Paket yolunun talep listesi: decompose'un alt talepleri (≥2). Yönlendirme KARMA ise
    ve alt talep listesi kurulmamışsa talepler yönlendirme kararlarından + talep kümesinden
    kurulur — KARMA belge hiçbir koşulda tek yazıya (ya da bütünüyle devre) indirgenmez."""
    alt = [a for a in (state.get("alt_talepler") or []) if isinstance(a, dict)]
    yon = state.get("yonlendirme") or {}
    if len(alt) >= 2 or yon.get("karar") != "KARMA":
        return alt
    kume = {str(t.get("id")): t for t in
            ((state.get("bilgi_unsurlari") or {}).get("talep_kumesi") or [])
            if isinstance(t, dict)}
    out = []
    for k in yon.get("talepler") or []:
        t = kume.get(str(k.get("talep_id")), {})
        out.append({"id": k.get("talep_id"), "ozet": t.get("ozet") or t.get("kanit") or "",
                    "konu": t.get("ozet") or "", "yonlendirme": k})
    return out if len(out) >= 2 else alt


async def yazi_taslak_node(state: dict[str, Any]) -> dict[str, Any]:
    """Resmî yazı taslağı + yazışma paketi (metin + PDF/DOCX).

    Çok-konulu evrak (alt_talepler >= 2) → talep başına havale (aynı birim tek havale) +
    vatandaş belgesinde başvurana tek cevap (yazi.paket). Yetkisizlik → devir + dilekçe
    sahibine bilgi. Diğer → tek yazı. Tüm başlık alanları yazi.baslik tek çözücüsünden;
    SDP tek motordan (arşiv aynı `sdp_secimi`ni okur).
    """
    b = _baglam_kur(state)
    secim = await _sdp_coz(b["turu"], state)
    b["sdp"] = _sdp_render(secim)
    b["sdp_kodu"] = (b["sdp"] or {}).get("kod", "")
    ek = {"sdp_secimi": secim} if secim else {}
    try:
        alt_talepler = _talep_ogeleri(state)
        if len(alt_talepler) >= 2:
            from yazi.paket import havale_paketi
            alt_out, paket = await havale_paketi(
                alt_talepler, b["unsurlar"], gelen=b["gelen"], kaynak_metin=b["evrak_text"],
                idare_adi=b["idare"], sdp_kodu=b["sdp_kodu"],
                yonlendirme=state.get("yonlendirme"))
            return {**_coklu_cikti(alt_out, paket), **ek}
        if _devir_var_mi(state):
            return {**await _devir_taslagi(state, b["idare"], b), **ek}
        return {**await _tekli_taslak(state, b), **ek}
    except Exception as exc:  # render altyapısı yok/hatalı → güvenli iskelet
        log.warning("yazi_taslak_fallback", err=str(exc))
        return _fallback_taslak(
            EVRAK_TO_YAZI.get(b["turu"], "cevabi_yazi"),
            str(b["unsurlar"].get("konu", "") or ""), b["evrak_text"], idare_adi=b["idare"])


__all__ = ("yazi_taslak_node",)
