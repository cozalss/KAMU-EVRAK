"""Yetkili kurum için KAPALI KÜME — sicilden aday kurumlar + serbest adın sicile çözümü.

Teşhis (docs/benchmark/teshis-2026-10-05.json, "BİRİM YÖNLENDİRME + YETKİ" (d)): model
DISARIDA dediğinde yetkili kurumu SERBEST METİN yazıyordu ve ad `ad_to_kurum` ile slug'a
çevriliyordu; 'Ankara Su ve Kanalizasyon İdaresi (ASKİ) Genel Müdürlüğü' → 'genel-mudurlugu'.
Oysa 4066 kurumluk sicilde ASKİ kayıtlı. Bu modül iki iş yapar:

  1. `kurum_adaylari(muhatap, gonderen)` — muhatabın iline/ilçesine ve türüne göre sicilden
     aday kurum listesi kurar: aynı ilin valiliği, büyükşehri, ilçe belediyeleri, aynı ilçenin
     kaymakamlığı, il müdürlükleri, su/kanalizasyon idaresi; ülke geneli elektrik ve doğalgaz
     dağıtım şirketleri (hizmet bölgesi sicilde doğrulanmış olmadığı için hepsi); merkezî
     kuruluşlar. Hepsi VERİDEN gelir — kelime listesi yoktur. Gönderen kurum listeden çıkar.
  2. `kurum_ad_cozumle(ad)` — serbest addan sicil kaydı: parantez içi kısaltma ('ASKİ'),
     ad slug'ı, kanonik ad eşleşmesi. Bulunamazsa None (çağıran 'doğrulanmamış' işaretler).

Sicil yalnız KİMLİK verir; buradan gelen hiçbir kurum otomatik havale yetkisi kazanmaz
(core/sicil INV-1/2). Seçim her durumda insan onayına gider.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from agents.kurum_kimlik import _slug
from core.sicil import sicil_cozumle, sicil_yukle

# Ülke geneli adaylar (il bağımsız): hizmet bölgesi doğrulanmamış dağıtım şirketleri +
# merkezî kuruluşlar. Tür kümesi sicilin kendi taksonomisidir (core/sicil.GECERLI_TURLER).
_ULKE_GENELI_TURLER = frozenset({"elektrik_dagitim", "dogalgaz_dagitim"})
_MERKEZI_TURLER = frozenset({"bakanlik", "diger", "ust_kurul", "kit",
                             "cumhurbaskanligi_ofis_kurul", "bagli_kurulus", "ilgili_kurulus",
                             "iliskili_kurulus"})
_AZAMI_ADAY = 320


def _katla(ad: str) -> str:
    return " ".join(re.findall(r"[0-9a-z]+", _slug(ad).replace("-", " ")))


def _tekil(kayitlar: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aynı kurumun çift kaydını (aynı kanonik ad) teke indir; ilk görülen kalır."""
    gorulen: set[str] = set()
    out: list[dict[str, Any]] = []
    for k in kayitlar:
        anahtar = _katla(str(k.get("ad") or ""))
        if anahtar and anahtar not in gorulen:
            gorulen.add(anahtar)
            out.append(k)
    return out


@lru_cache(maxsize=4)
def _gruplar(_rev: int) -> dict[str, Any]:
    kurumlar = [k for k in (sicil_yukle().get("kurumlar") or [])
                if isinstance(k, dict) and not k.get("belirsiz")]
    il_index: dict[str, list[dict[str, Any]]] = {}
    for k in kurumlar:
        if k.get("il"):
            il_index.setdefault(str(k["il"]), []).append(k)
    ulke = _tekil([k for k in kurumlar if k.get("tur") in _ULKE_GENELI_TURLER])
    merkezi = _tekil([k for k in kurumlar
                      if k.get("tur") in _MERKEZI_TURLER and not k.get("il")])
    return {"il": il_index, "ulke": ulke, "merkezi": merkezi}


def _grup() -> dict[str, Any]:
    return _gruplar(id(sicil_yukle()))


def muhatap_kaydi(muhatap: dict[str, Any] | None) -> dict[str, Any]:
    """Muhatap künyesinin sicil kaydı (slug/alias ya da ad üzerinden); yoksa boş dict."""
    m = muhatap or {}
    kayit = sicil_cozumle(str(m.get("slug") or "")) or kurum_ad_cozumle(str(m.get("ad") or ""))
    return dict(kayit or {})


def _il_grubu(kayit: dict[str, Any]) -> list[dict[str, Any]]:
    """Muhatabın ilindeki kurumlar — tür önceliğiyle (üst idare önce)."""
    il, ilce = str(kayit.get("il") or ""), str(kayit.get("ilce") or "")
    if not il:
        return []
    sira = {"valilik": 0, "belediye": 1, "kaymakamlik": 2, "il_mudurlugu": 3,
            "su_kanalizasyon": 4, "defterdarlik": 5, "il_ozel_idare": 6}
    secilen = []
    for k in _grup()["il"].get(il, []):
        tur = k.get("tur")
        if tur not in sira:
            continue
        # Kaymakamlıklardan yalnız muhatabın ilçesindeki (il geneli 25-39 kaymakamlık gürültüdür).
        if tur == "kaymakamlik" and (not ilce or k.get("ilce") != ilce):
            continue
        secilen.append(k)
    return sorted(secilen, key=lambda k: (sira[k["tur"]], str(k.get("ad"))))


def kurum_adaylari(
    muhatap: dict[str, Any] | None, gonderen: dict[str, Any] | None = None,
    gonderen_aile: set[str] | None = None,
) -> list[dict[str, str]]:
    """Muhatap için yetkili-kurum kapalı kümesi: [{'kod','slug','ad','tur','il'}].

    Muhatabın kendisi ve gönderen listede YOKTUR (yetki dışarıdaysa alıcı başka kurumdur;
    gönderen hiçbir zaman alıcı olamaz). Kod ('K1'..) modelin seçimi birebir kopyalamasını
    gerektirmez — uzun kurum adlarında harf hatası seçimi düşürmez.
    """
    kayit = muhatap_kaydi(muhatap)
    haric = {str((muhatap or {}).get("slug") or ""), str(kayit.get("slug") or ""),
             str((gonderen or {}).get("slug") or "")}
    haric_ad = {_katla(str((muhatap or {}).get("ad") or "")), _katla(str(kayit.get("ad") or ""))}
    havuz = _il_grubu(kayit) + _grup()["ulke"] + _grup()["merkezi"]
    out: list[dict[str, str]] = []
    for k in _tekil(havuz):
        if k.get("slug") in haric or _katla(str(k.get("ad") or "")) in haric_ad:
            continue
        if gonderen_aile and ayni_aile(k, gonderen_aile):
            continue  # gelen yazıyı yazan kurum ailesi alıcı olamaz (yazi_sgk_cevabi)
        out.append({"kod": f"K{len(out) + 1}", "slug": str(k["slug"]), "ad": str(k["ad"]),
                    "tur": str(k.get("tur") or ""), "il": str(k.get("il") or "")})
        if len(out) >= _AZAMI_ADAY:
            break
    return out


# Kurum AİLE anahtarında atılan örgütsel sözcükler (katlanmış). Kalan çekirdek kurumun
# kimliğidir: 'Ankara Sosyal Güvenlik İl Müdürlüğü', 'Sosyal Güvenlik Kurumu Başkanlığı' ve
# 'Keçiören Sosyal Güvenlik Merkezi Müdürlüğü' → 'sosyal guvenlik'. Çekirdek boş kalırsa
# (belediye/valilik: kimlik yer adıdır) tam ad kullanılır — 'kecioren belediyesi'.
_ORGUT_SOZCUKLERI = frozenset({
    "il", "ilce", "mudurlugu", "mudurlukleri", "genel", "baskanligi", "baskanlik", "kurumu",
    "merkezi", "merkez", "daire", "dairesi", "sube", "subesi", "bolge", "bolgesi", "t", "c",
    "tc", "ve", "idaresi", "buyuksehir", "belediyesi", "belediye", "valiligi", "kaymakamligi",
    "bakanligi", "mudurluk", "baskan", "yardimciligi", "koordinatorlugu", "sgk", "a", "s",
})


@lru_cache(maxsize=1)
def _yer_adlari(_rev: int) -> frozenset[str]:
    """Sicildeki il ve ilçe adlarının katlanmış sözcükleri (aile anahtarından atılır)."""
    out: set[str] = set()
    for k in sicil_yukle().get("kurumlar") or []:
        if isinstance(k, dict):
            for alan in ("il", "ilce"):
                out.update(_katla(str(k.get(alan) or "")).split())
    return frozenset(out)


def kurum_aile_anahtari(ad: str) -> str:
    """Kurum ailesi anahtarı: yer adı + örgüt sözcüğü atılmış çekirdek; boşsa tam katlama."""
    tam = _katla(_PARANTEZ_RE.sub(" ", ad or ""))
    yer = _yer_adlari(id(sicil_yukle()))
    cekirdek = [s for s in tam.split() if s not in _ORGUT_SOZCUKLERI and s not in yer]
    return " ".join(cekirdek) or tam


def gonderen_aileleri(gonderen: dict[str, Any] | None, antet_satirlari: list[str]) -> set[str]:
    """Gönderen kurumun TÜM kimlikleri: tespit edilen künye + sicil kaydı + antet satırları
    (üst kurum + alt birim) + sicildeki üst kurum adı. Alıcı bunlardan biriyle aynı ailedeyse
    'yetkili kurum' olamaz — gelen yazıyı yazana devir, cevap vermemenin kılığıdır."""
    g = gonderen or {}
    adlar = [str(g.get("ad") or ""), *antet_satirlari]
    kayit = muhatap_kaydi(g) if (g.get("slug") or g.get("ad")) else {}
    adlar += [str(kayit.get("ad") or ""), str(kayit.get("ust_kurum") or "")]
    return {a for a in (kurum_aile_anahtari(x) for x in adlar if x.strip()) if a}


def ayni_aile(kurum: dict[str, Any], aileler: set[str]) -> bool:
    """Kurum (adı ya da sicil üst kurumu) verilen ailelerden biriyle aynı mı?"""
    if not aileler:
        return False
    kayit = sicil_cozumle(str(kurum.get("slug") or "")) or {}
    adlar = [str(kurum.get("ad") or ""), str(kayit.get("ust_kurum") or "")]
    return any(kurum_aile_anahtari(a) in aileler for a in adlar if a.strip())


def yerel_tasra_tercih(
    alici: dict[str, Any] | None, kurumlar: list[dict[str, str]],
) -> dict[str, Any] | None:
    """Merkezî alıcı (bakanlık/genel müdürlük) yerine muhatabın İLİNDEKİ aynı aile taşra
    birimi (il müdürlüğü / defterdarlık) aday listesinde varsa onu döndür.

    Dilekçe işi yapacak yerel birime gider (ölçüldü: Ankara Valiliği miras intikalini
    'Tapu ve Kadastro Genel Müdürlüğüne' devrediyordu). Aile eşleşmesi sicil verisinden
    (ad çekirdeği); taşra kaydı sicilde yoksa merkez kalır ve `merkez_teskilati` işaretlenir
    — memur yerel birimi kendisi belirler."""
    if not alici or str(alici.get("tur") or "") not in _MERKEZI_TURLER:
        return alici
    aile = kurum_aile_anahtari(str(alici.get("ad") or ""))
    yerel = next((k for k in kurumlar
                  if k.get("tur") in ("il_mudurlugu", "defterdarlik") and k.get("il")
                  and kurum_aile_anahtari(str(k.get("ad") or "")) == aile), None)
    if yerel is None:
        return {**alici, "merkez_teskilati": True}
    return {"slug": yerel["slug"], "ad": yerel["ad"], "tur": yerel["tur"], "kaynak": "sicil",
            "merkez_yerine": str(alici.get("ad") or "")}


_PARANTEZ_RE = re.compile(r"\(([^()]{2,60})\)")


def kurum_ad_cozumle(ad: str) -> dict[str, Any] | None:
    """Serbest kurum adı → sicil kaydı. Sıra: tam slug/alias, parantez içi kısaltma veya ad,
    parantezsiz ad, kanonik ad eşleşmesi. Bulunamazsa None — tahmin yapılmaz."""
    ad = (ad or "").strip()
    if not ad:
        return None
    adaylar = [ad, *_PARANTEZ_RE.findall(ad), _PARANTEZ_RE.sub(" ", ad)]
    for parca in adaylar:
        parca = parca.strip()
        for anahtar in (_slug(parca), parca.lower(), parca):
            kayit = sicil_cozumle(anahtar) if anahtar else None
            if kayit:
                return dict(kayit)
    hedef = _katla(_PARANTEZ_RE.sub(" ", ad))
    for k in sicil_yukle().get("kurumlar") or []:
        if isinstance(k, dict) and not k.get("belirsiz") and _katla(str(k.get("ad"))) == hedef:
            return dict(k)
    return None


__all__ = ("ayni_aile", "gonderen_aileleri", "kurum_ad_cozumle", "kurum_adaylari",
           "kurum_aile_anahtari", "muhatap_kaydi", "yerel_tasra_tercih")
