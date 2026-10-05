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
from agents.yonlendirme import devir_kurumu
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


def talep_yonlendirmesi(
    item: dict[str, Any], yonlendirme: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Talebin yönlendirme kararı — TEK sözleşme: agents.yonlendirme.talep_karari şekli
    ({talep_id, karar, alici_kurum, birim:{ad,…}, devir:{gerekli, yetkili_kurum, dayanak}}).

    Öncelik: alt talebe route_ajan'ın iliştirdiği karar (alt_talepleri_zenginlestir →
    item['yonlendirme']) → belge nesnesindeki talepler[] (talep_id == item['id']). Yoksa {}.
    """
    k = item.get("yonlendirme")
    if isinstance(k, dict) and k:
        return k
    tid = item.get("id")
    for t in (yonlendirme or {}).get("talepler") or []:
        if tid and isinstance(t, dict) and t.get("talep_id") == tid:
            return t
    return {}


def talep_birim_adi(item: dict[str, Any], yonlendirme: dict[str, Any] | None = None) -> str:
    """Talebin KURUM İÇİ gerçek birim adı; kaba kategori etiketi birim ADI sayılmaz → ''.

    Devir talebinin kurum içinde birimi yoktur (birim_ad '<Kurum> (devir)' gösterim metnidir,
    havale muhatabı olamaz) → ''."""
    k = talep_yonlendirmesi(item, yonlendirme)
    if devir_kurumu(k) or item.get("yetki") == "DISARIDA":
        return ""
    ad = str((k.get("birim") or {}).get("ad") or "") or str(item.get("birim_ad") or "")         or birim_tr(str(item.get("birim") or "")) or str(item.get("birim_tr") or "")
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


def devir_gruplari(
    alt_talepler: list[dict[str, Any]], yonlendirme: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(kurum içi talepler, devir grupları). Aynı yetkili kuruma düşen talepler TEK devir
    yazısında birleşir: {kurum:{slug,ad}, dayanak, talepler}."""
    ic: list[dict[str, Any]] = []
    gruplar: dict[str, dict[str, Any]] = {}
    for item in alt_talepler:
        k = talep_yonlendirmesi(item, yonlendirme)
        kurum = devir_kurumu(k)
        if not kurum:
            ic.append(item)
            continue
        grup = gruplar.setdefault(str(kurum.get("slug") or kurum["ad"]), {
            "kurum": kurum, "dayanak": str((k.get("devir") or {}).get("dayanak") or ""),
            "talepler": []})
        grup["talepler"].append(item)
    return ic, list(gruplar.values())


def cevap_govdesi(gelen: dict[str, Any], gruplar: list[dict[str, Any]],
                  konular: list[str], devirler: list[dict[str, Any]] | None = None) -> str:
    """Başvurana safahat bildirimi: hangi talep hangi birimde incelenmek üzere havale edildi;
    yetki dışı talepler hangi makama GÖNDERİLDİ (3071 m.5: 'yetkili idari makama gönderilir
    ve ayrıca dilekçe sahibine de bilgi verilir')."""
    bulunma = _CINS_BULUNMA.get(gelen.get("belge_cinsi") or "", "başvurunuzda")
    satirlar = [
        f"{i}. {konu} — {grup['birim_ad'] or 'ilgili birimimiz'}"
        for i, (konu, grup) in enumerate(zip(konular, gruplar, strict=True), start=1)]
    if not devirler:
        return (
            f"İlgi'de kayıtlı {bulunma} yer alan talepleriniz, incelenmek üzere Kurumumuzun "
            "ilgili birimlerine havale edilmiştir:\n\n" + "\n".join(satirlar) + "\n\n"
            "Talepleriniz hakkında yapılacak işlemlerin sonucu ayrıca tarafınıza "
            "bildirilecektir."
        )
    dis = [
        f"{i}. {d['konu']} — {d['kurum']['ad']} ("
        f"{d['dayanak'] + ' gereğince ' if d.get('dayanak') else ''}gönderilmiştir)"
        for i, d in enumerate(devirler, start=len(satirlar) + 1)]
    ic_metin = ("Kurumumuzun görev alanındaki talepleriniz incelenmek üzere ilgili "
                "birimlerimize havale edilmiştir:\n\n" + "\n".join(satirlar) + "\n\n"
                if satirlar else "")
    return (
        f"İlgi'de kayıtlı {bulunma} yer alan talepleriniz hakkında yapılan işlemler aşağıda "
        "bildirilmiştir.\n\n" + ic_metin
        + "Kurumumuzun görev alanı dışında kalan talepleriniz yetkili makama "
        "gönderilmiştir:\n\n" + "\n".join(dis) + "\n\n"
        "Gönderilen talepleriniz hakkındaki işlemler ve sonucu anılan makamlarca, diğer "
        "talepleriniz hakkındaki sonuç ise Kurumumuzca tarafınıza bildirilecektir."
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


async def _havale_yazisi(
    grup: dict[str, Any], unsurlar: dict[str, Any], semafor: asyncio.Semaphore,
    ortak: dict[str, Any],
) -> dict[str, Any]:
    """Kurum içi birime havale (ust_yazi). Gövde LLM'den (merkezi politika) ya da kalıptan."""
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_body, build_context

    talepler = grup["talepler"]
    ozet = "\n".join(str(t.get("ozet") or "") for t in talepler)
    # Havalenin konusu ve gövdesi YALNIZ bu havalenin taleplerinden kurulur; belge konusu
    # (tüm talepleri kapsar) başka birimin talebini bu havaleye taşıyordu (2026-10-05:
    # 'Kayıt dondurma ve yurt/burs' Öğrenci İşlerine, yurt/burs ayrıca GSB'ye devir).
    grup_unsur = {**unsurlar, "konu": grup_konusu(talepler),
                  "talepler": [str(t.get("ozet") or "") for t in talepler]}
    async with semafor:
        metin = await build_body("ust_yazi", grup_unsur, ozet)
    ctx = build_context(
        "ust_yazi", grup_unsur, metin, muhatap_override=grup["muhatap"], rol="havale",
        konu_adaylari=[grup_unsur["konu"], talepler[0].get("ozet")], **ortak)
    sonuc = render_yazi(ctx)
    return {"rol": "havale", "yazi_turu": "ust_yazi", "muhatap": ctx.muhatap,
            "birim": grup["birim_ad"], "konu": ctx.konu,
            "talep_ids": [t.get("id") for t in talepler if t.get("id")],
            "yazi_taslak_md": sonuc.metin, "format_uyumlu": sonuc.format_uyumlu}


def grup_konusu(talepler: list[dict[str, Any]]) -> str:
    """Bir havale/devir grubunun konusu: yalnız gruptaki taleplerin konuları (sırayla, tekrar
    yok). Belge konusuna geri DÖNÜLMEZ — o, diğer alıcıların taleplerini de içerir."""
    konular = list(dict.fromkeys(
        str(t.get("konu") or t.get("ozet") or "").strip() for t in talepler))
    return " ve ".join(k for k in konular if k)


def _devir_yazisi(
    grup: dict[str, Any], unsurlar: dict[str, Any], ortak: dict[str, Any],
) -> dict[str, Any]:
    """Yetki dışı talep(ler) → yetkili kuruma DEVİR yazısı (deterministik, 3071 m.5 /
    4982 m.7). Muhatap = yetkili kurum (m.14, büyük harf + yönelme eki)."""
    from yazi.renderer import render_yazi
    from yazi.yazi_render import build_context, devir_govdesi

    talepler = grup["talepler"]
    konu = grup_konusu(talepler) or str(unsurlar.get("konu") or "")
    ctx = build_context(
        "ust_yazi", {**unsurlar, "konu": konu}, devir_govdesi(konu, grup["dayanak"]),
        muhatap_override=muhatap_bicimle(grup["kurum"]["ad"], "kamu_idaresi")
        or "İLGİLİ MAKAMA", rol="devir",
        konu_adaylari=[konu, talepler[0].get("ozet")], **ortak)
    sonuc = render_yazi(ctx)
    return {"rol": "devir", "yazi_turu": "ust_yazi", "muhatap": ctx.muhatap,
            "birim": "", "kurum": grup["kurum"]["ad"], "konu": ctx.konu,
            "talep_ids": [t.get("id") for t in talepler if t.get("id")],
            "yazi_taslak_md": sonuc.metin, "format_uyumlu": sonuc.format_uyumlu}


async def havale_paketi(
    alt_talepler: list[dict[str, Any]], unsurlar: dict[str, Any], *,
    gelen: dict[str, Any], kaynak_metin: str = "", idare_adi: str = "",
    sdp_kodu: str = "", yonlendirme: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Çok talepli evrak → (alt_talepler + taslak, yazışma paketi listesi).

    Talep başına karar Akış Y'nin şeklinden okunur (talep_yonlendirmesi): kurum içi talepler
    birime HAVALE, yetki dışı talepler yetkili kuruma DEVİR (KARMA'da ikisi birlikte);
    vatandaş belgesinde başvurana ikisini birlikte bildiren TEK cevap yazısı eklenir."""
    ic, devirler = devir_gruplari(alt_talepler, yonlendirme)
    gruplar = havale_gruplari(ic, yonlendirme)
    ortak = {"sdp_kodu": sdp_kodu, "idare_adi": idare_adi, "gelen": gelen,
             "kaynak_metin": kaynak_metin}
    semafor = asyncio.Semaphore(3)
    havaleler = list(await asyncio.gather(
        *(_havale_yazisi(g, unsurlar, semafor, ortak) for g in gruplar)))
    devir_yazilari = [_devir_yazisi(g, unsurlar, ortak) for g in devirler]
    yazisi = {id(item): yazi
              for grup, yazi in zip([*gruplar, *devirler], [*havaleler, *devir_yazilari],
                                    strict=True)
              for item in grup["talepler"]}
    alt_out = [{**item, "yazi_turu": "ust_yazi", "taslak_konu": yazisi[id(item)]["konu"],
                "yazi_taslak_md": yazisi[id(item)]["yazi_taslak_md"],
                "format_uyumlu": yazisi[id(item)]["format_uyumlu"]} for item in alt_talepler]
    paket = [*havaleler, *devir_yazilari]
    if vatandas_belgesi_mi(gelen):
        dev = [{"konu": y["konu"], "kurum": g["kurum"], "dayanak": g["dayanak"]}
               for g, y in zip(devirler, devir_yazilari, strict=True)]
        paket.append(cevap_yazisi(
            gelen, unsurlar,
            cevap_govdesi(gelen, gruplar, [y["konu"] for y in havaleler], dev),
            kaynak_metin=kaynak_metin, idare_adi=idare_adi, sdp_kodu=sdp_kodu,
            rol="cevap" if havaleler else "devir_bilgi"))
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


__all__ = ("cevap_govdesi", "cevap_yazisi", "devir_bilgi_govdesi", "devir_gruplari",
           "devir_kurumu", "grup_konusu", "havale_gruplari", "havale_paketi", "talep_birim_adi",
           "talep_yonlendirmesi", "vatandas_belgesi_mi")
