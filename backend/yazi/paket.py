"""Yazışma PAKETİ — gelen evraka karşılık üretilecek yazıların tamamı (teşhis ADIM 4).

Gerçek işleyişte bir vatandaş dilekçesi tek yazıyla kapanmaz:
  * havale — her talep yetkili birime iç yazıyla iletilir; AYNI birime düşen talepler TEK
    havalede birleşir (iki ayrı üst yazı gereksiz evrak üretir);
  * cevap — dilekçe sahibine talepleri ve hangi birimde incelendiğini bildiren TEK yazı
    (3071 s.K. m.7 sonucun/safahatın bildirilmesi);
  * devir + devir_bilgi — yetkisizlikte yetkili makama gönderme yazısı VE "ayrıca dilekçe
    sahibine de bilgi verilir" (3071 s.K. m.5 lafzı) gereği başvurana bilgi yazısı.

Başlık alanları (konu/muhatap/ilgi) yazi.baslik tek çözücüsünden gelir; bu modül yalnız
paketin hangi yazılardan oluştuğunu ve gövdelerini kurar. Cevap ve devir-bilgi gövdeleri
DETERMİNİSTİKTİR (kalıp yazı; LLM yalnız uydurma riski ekler, mock/CI'da da üretilir).
"""

from __future__ import annotations

import asyncio
from typing import Any

from agents.config import birim_tr
from yazi.baslik import (
    kategori_etiketi_mi,
    kategori_yer_tutucu,
    muhatap_bicimle,
)

VATANDAS_CINSLERI = frozenset(
    {"dilekce", "basvuru", "cimer_basvurusu", "bilgi_edinme_basvurusu"})
_CINS_BULUNMA = {"dilekce": "dilekçenizde", "basvuru": "başvurunuzda",
                 "cimer_basvurusu": "CİMER başvurunuzda",
                 "bilgi_edinme_basvurusu": "bilgi edinme başvurunuzda"}


def vatandas_belgesi_mi(gelen: dict[str, Any]) -> bool:
    return (gelen.get("belge_cinsi") in VATANDAS_CINSLERI
            and gelen.get("gonderen_turu") in ("gercek_kisi", "tuzel_kisi"))


def _yonlendirme_birimi(item: dict[str, Any], yonlendirme: dict[str, Any] | None) -> str:
    """Akış Y'nin talep başına kararı (varsa) — talep_id eşleşmesiyle birim adı."""
    tid = item.get("id")
    for t in (yonlendirme or {}).get("talepler") or []:
        if tid and t.get("talep_id") == tid and isinstance(t.get("birim"), dict):
            return str(t["birim"].get("ad") or "")
    return ""


def talep_birim_adi(item: dict[str, Any], yonlendirme: dict[str, Any] | None = None) -> str:
    """Talebin gerçek birim adı; kaba kategori etiketi birim ADI sayılmaz → ''."""
    ad = _yonlendirme_birimi(item, yonlendirme) or str(item.get("birim_ad") or "") \
        or birim_tr(str(item.get("birim") or "")) or str(item.get("birim_tr") or "")
    return "" if kategori_etiketi_mi(ad) else ad


def havale_gruplari(
    alt_talepler: list[dict[str, Any]], yonlendirme: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Aynı birime düşen talepleri tek havalede topla (giriş sırası korunur). Gerçek birim
    adı yoksa kaba kategori yalnız açık yer tutucu içinde ÖNERİ olarak görünür."""
    gruplar: dict[str, dict[str, Any]] = {}
    for item in alt_talepler:
        ad = talep_birim_adi(item, yonlendirme)
        kategori = "" if ad else (birim_tr(str(item.get("birim") or ""))
                                  or str(item.get("birim_tr") or ""))
        anahtar = ad or ("kategori=" + kategori)
        grup = gruplar.setdefault(anahtar, {
            "birim_ad": ad,
            "muhatap": muhatap_bicimle(ad, "birim") if ad else kategori_yer_tutucu(kategori),
            "talepler": []})
        grup["talepler"].append(item)
    return list(gruplar.values())


def cevap_govdesi(gelen: dict[str, Any], gruplar: list[dict[str, Any]],
                  konular: list[str]) -> str:
    """Başvurana safahat bildirimi: hangi talep hangi birimde incelenmek üzere havale edildi."""
    bulunma = _CINS_BULUNMA.get(gelen.get("belge_cinsi") or "", "başvurunuzda")
    satirlar = [
        f"{i}. {konu} — {grup['birim_ad'] or 'ilgili birimimiz'}"
        for i, (konu, grup) in enumerate(zip(konular, gruplar, strict=True), start=1)]
    return (
        f"İlgi'de kayıtlı {bulunma} yer alan talepleriniz, incelenmek üzere Kurumumuzun "
        "ilgili birimlerine havale edilmiştir:\n\n" + "\n".join(satirlar) + "\n\n"
        "Talepleriniz hakkında yapılacak işlemlerin sonucu ayrıca tarafınıza bildirilecektir."
    )


def devir_bilgi_govdesi(gelen: dict[str, Any], yetkili_ad: str, dayanak: str) -> str:
    """3071 m.5: devirde dilekçe sahibine bilgi. Dayanak boşsa hükme atıf yapılmaz."""
    bulunma = _CINS_BULUNMA.get(gelen.get("belge_cinsi") or "", "başvurunuzda")
    hukum = f"{dayanak} gereğince " if dayanak else ""
    makam = yetkili_ad or "yetkili makam"
    return (
        f"İlgi'de kayıtlı {bulunma} yer alan konunun Kurumumuzun görev alanı dışında kalıp "
        f"{makam} görev alanına girdiği anlaşıldığından, başvurunuz {hukum}{makam} "
        "makamına gönderilmiştir.\n\n"
        "Başvurunuza ilişkin işlemler ve sonucu anılan makam tarafından tarafınıza "
        "bildirilecektir."
    )


async def havale_paketi(
    alt_talepler: list[dict[str, Any]], unsurlar: dict[str, Any], *,
    gelen: dict[str, Any], kaynak_metin: str = "", idare_adi: str = "",
    sdp_kodu: str = "", yonlendirme: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Çok talepli evrak → (alt_talepler + taslak, yazışma paketi listesi)."""
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_body, build_context

    gruplar = havale_gruplari(alt_talepler, yonlendirme)
    semafor = asyncio.Semaphore(3)

    async def _havale(grup: dict[str, Any]) -> dict[str, Any]:
        talepler = grup["talepler"]
        ozet = "\n".join(str(t.get("ozet") or "") for t in talepler)
        adaylar = ([talepler[0].get("konu"), talepler[0].get("ozet")]
                   if len(talepler) == 1 else []) + [unsurlar.get("konu")]
        async with semafor:
            metin = await build_body("ust_yazi", {**unsurlar, "talepler": [
                str(t.get("ozet") or "") for t in talepler]}, ozet)
        ctx = build_context(
            "ust_yazi", unsurlar, metin, muhatap_override=grup["muhatap"], sdp_kodu=sdp_kodu,
            idare_adi=idare_adi, gelen=gelen, rol="havale", kaynak_metin=kaynak_metin,
            konu_adaylari=adaylar)
        sonuc = render_yazi(ctx)
        return {"rol": "havale", "yazi_turu": "ust_yazi", "muhatap": ctx.muhatap,
                "birim": grup["birim_ad"], "konu": ctx.konu,
                "talep_ids": [t.get("id") for t in talepler if t.get("id")],
                "yazi_taslak_md": sonuc.metin, "format_uyumlu": sonuc.format_uyumlu}

    paket = list(await asyncio.gather(*(_havale(g) for g in gruplar)))
    yazisi = {id(item): yazi for grup, yazi in zip(gruplar, paket, strict=True)
              for item in grup["talepler"]}
    alt_out = [{**item, "yazi_turu": "ust_yazi", "taslak_konu": yazisi[id(item)]["konu"],
                "yazi_taslak_md": yazisi[id(item)]["yazi_taslak_md"],
                "format_uyumlu": yazisi[id(item)]["format_uyumlu"]} for item in alt_talepler]
    if vatandas_belgesi_mi(gelen):
        paket.append(cevap_yazisi(
            gelen, unsurlar, cevap_govdesi(gelen, gruplar, [y["konu"] for y in paket]),
            kaynak_metin=kaynak_metin, idare_adi=idare_adi, sdp_kodu=sdp_kodu, rol="cevap"))
    return alt_out, paket


def cevap_yazisi(
    gelen: dict[str, Any], unsurlar: dict[str, Any], metin: str, *, rol: str,
    kaynak_metin: str = "", idare_adi: str = "", sdp_kodu: str = "",
    hazirlayan_birim: str = "",
) -> dict[str, Any]:
    """Başvurana yazı (cevap / devir_bilgi) — muhatap gönderen, ilgi 2. şahıs."""
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_context

    ctx = build_context(
        "cevabi_yazi", unsurlar, metin, sdp_kodu=sdp_kodu, idare_adi=idare_adi,
        hazirlayan_birim=hazirlayan_birim, gelen=gelen, rol=rol, kaynak_metin=kaynak_metin,
        konu_adaylari=[unsurlar.get("konu"), gelen.get("konu_satiri")])
    sonuc = render_yazi(ctx)
    return {"rol": rol, "yazi_turu": "cevabi_yazi", "muhatap": ctx.muhatap, "birim": "",
            "konu": ctx.konu, "talep_ids": [], "yazi_taslak_md": sonuc.metin,
            "format_uyumlu": sonuc.format_uyumlu}


__all__ = ("cevap_govdesi", "cevap_yazisi", "devir_bilgi_govdesi", "havale_gruplari",
           "havale_paketi", "talep_birim_adi", "vatandas_belgesi_mi")
