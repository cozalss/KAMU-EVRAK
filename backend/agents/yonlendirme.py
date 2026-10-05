"""Yönlendirme TEK DOĞRULUK KAYNAĞI — `state['yonlendirme']` nesnesi + türetilmiş alanlar.

Teşhis (docs/benchmark/teshis-2026-10-05.json, "BİRİM YÖNLENDİRME + YETKİ" (b)): birbirinden
habersiz üç birim sistemi (9'lu kategori, belediye servis müdürlüğü, teşkilat korpusu) ve
altı ayrı öncelik zinciri vardı; aynı belgede taslak 'devir: Başkent EDAŞ', bildirim
'Basın-Halkla İlişkiler'e havale edildi' diyordu. Artık karar BİR nesnede durur:

    {karar: ICERIDE|DISARIDA|YARGI|KARMA|BELIRSIZ,
     alici_kurum: {slug, ad, tur, kaynak, dogrulanmis} | None,
     birim: {ad, kaynak_tipi, dogrulanmis, bagli?} | None,
     gerekce, insan_onayi_gerekli, belirsiz_talep,
     devir: {gerekli, yetkili_kurum: {slug, ad, kaynak, dogrulanmis} | None, dayanak},
     talepler: [{talep_id, karar, alici_kurum, birim, devir, gerekce}],
     uretim: {yol: llm|llm_kismi|deterministik, kesik, kurtarildi, yedege_dustu}}

YARGI (3071 m.6/b): konu yargı merciinin görevindedir (ör. kat mülkiyeti uyuşmazlığı) →
dilekçe idarece İNCELENEMEZ ve m.5 kapsamında bir idari makama da GÖNDERİLMEZ (m.5 yalnız
"yetkili idari makam" der). Devir yazısı üretilmez; başvurana yargı yolu bildirilir.

Eski düz alanlar (hedef_birim, hedef_birim_oneri, yetkili_kurum, insan_onayi_gerekli, durum)
ve memurun göreceği tek metin `gosterim_birimi` YALNIZ buradan türetilir. Bu modül saf
veridir: ağ, LLM, dosya yok.
"""
from __future__ import annotations

from typing import Any

# 3071 s.K. m.5 "Gönderilen makamda hata" — korpusta doğrulandı (data/mevzuat/
# 3071_dilekce_hakki_kanunu.txt). 4982 m.7 son cümle bilgi edinmede aynı işi görür.
# Tek kaynak config.EVRAK_TO_DEVIR_DAYANAK'tır; bu sabit yalnız tür bilinmezken kullanılır.
VARSAYILAN_DEVIR_DAYANAGI = "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 5 inci maddesi"

KARARLAR = ("ICERIDE", "DISARIDA", "YARGI", "KARMA", "BELIRSIZ")
# 3071 m.6/b — korpusta doğrulandı (data/mevzuat/3071_dilekce_hakki_kanunu.txt, Madde 6).
YARGI_DAYANAGI = ("3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 6 ncı maddesinin "
                  "(b) bendi")
# Sicilde bulunmayan, LLM'in serbest metinle yazdığı kurum — memura doğrulanmamış görünür.
SERBEST_KAYNAK = "serbest_dogrulanmadi"
# Yönlendirme var ama kurum içi birim belirlenemedi: kaba kategori 'havale birimi' diye
# gösterilmez (9'lu kategori karar değildir); memur seçer.
BIRIM_SECILMEDI = "Birim belirlenemedi — havalede memur seçecek"
# Özel hukuk tüzel kişisi olan alıcı türleri (sicil taksonomisi, core/sicil): dağıtım
# şirketi 'idari makam' DEĞİLDİR; 3071 m.5 ("yetkili idari makama gönderilir") dayanağı bu
# alıcılara yazılmaz — iletim yine yapılır ama dayanaksız (memur kanalı seçer).
OZEL_HUKUK_TURLERI = frozenset({"elektrik_dagitim", "dogalgaz_dagitim"})


def devir_dayanagi(evrak_turu: str) -> str:
    from agents.config import EVRAK_TO_DEVIR_DAYANAK

    return str(EVRAK_TO_DEVIR_DAYANAK.get(evrak_turu) or VARSAYILAN_DEVIR_DAYANAGI)


def talep_karari(
    talep_id: str, karar: str, *, alici_kurum: dict[str, Any] | None = None,
    birim: dict[str, Any] | None = None, gerekce: str = "", dayanak: str = "",
) -> dict[str, Any]:
    """Tek talep kararı. DISARIDA ise devir bloğu dolar; birim alıcı kurumun birimi olabilir.

    Alıcının `kaynak`/`dogrulanmis` işareti devir bloğuna da TAŞINIR: sicilde olmayan serbest
    ad ('serbest_dogrulanmadi') devir yazısına ve bildirime sicil kaydıyla aynı görünümle
    girmemelidir. YARGI kararında devir de birim de YOKTUR (3071 m.6/b)."""
    karar = karar if karar in ("ICERIDE", "DISARIDA", "YARGI") else "BELIRSIZ"
    disari = karar == "DISARIDA" and bool(alici_kurum)
    alici = _alici_kunyesi(alici_kurum) if (disari and alici_kurum) else None
    idari = bool(alici) and str(alici.get("tur") or "") not in OZEL_HUKUK_TURLERI
    return {
        "talep_id": talep_id, "karar": karar if (karar != "DISARIDA" or disari) else "BELIRSIZ",
        "alici_kurum": alici,
        "birim": None if karar == "YARGI" else birim,
        "devir": {"gerekli": disari,
                  "yetkili_kurum": ({k: alici[k] for k in ("slug", "ad", "kaynak", "dogrulanmis")}
                                    if alici else None),
                  "dayanak": dayanak if (disari and idari) else "",
                  "idari_makam": idari},
        "gerekce": gerekce,
    }


def _alici_kunyesi(alici: dict[str, Any]) -> dict[str, Any]:
    """Alıcı kurum künyesi + doğrulama işareti (sicil kaydı = doğrulanmış kimlik)."""
    kaynak = str(alici.get("kaynak") or "sicil")
    return {**alici, "slug": str(alici.get("slug") or ""), "ad": str(alici.get("ad") or ""),
            "kaynak": kaynak, "dogrulanmis": kaynak != SERBEST_KAYNAK}


def kurum_dogrulanmamis_mi(kurum: dict[str, Any] | None) -> bool:
    """Alıcı/yetkili kurum sicilde doğrulanmamış (LLM'in serbest adı) mı?"""
    k = kurum or {}
    return k.get("kaynak") == SERBEST_KAYNAK or k.get("dogrulanmis") is False


def belge_karari(talepler: list[dict[str, Any]]) -> str:
    """Talep kararlarından belge kararı: hepsi aynıysa o; karışıksa KARMA.

    BELIRSIZ talep belge kararını değiştirmez (karar verilen taleplerin kararı görünür) ama
    YOK SAYILMAZ: `yonlendirme_kur` belirsiz talep varken otomatik havaleyi kapatır ve
    `belirsiz_talep` sayısını yazar — çözülemeyen talep memurun önüne düşer."""
    kararlar = {t["karar"] for t in talepler}
    if not kararlar or kararlar == {"BELIRSIZ"}:
        return "BELIRSIZ"
    kararlar.discard("BELIRSIZ")
    if len(kararlar) == 1:
        return kararlar.pop()
    return "KARMA"


def _otomatik_havale_mi(talepler: list[dict[str, Any]], uretim: dict[str, Any]) -> bool:
    """Otomatik (insansız) havale şartları — HEPSİ birlikte:
      * model gerçekten ve EKSİKSİZ karar verdi (yol == 'llm'; kısmi/kesik cevap ya da
        deterministik yedek değil),
      * en az bir talep var ve TÜM talepler ICERIDE (BELIRSIZ/DISARIDA/YARGI yok),
      * her talebin birimi var ve üçlü grounding'den geçmiş (dogrulanmis),
      * tüm talepler AYNI birime gidiyor (çok birimli dağıtım memurun kararıdır)."""
    if uretim.get("yol") != "llm" or uretim.get("kesik") or not talepler:
        return False
    birimler = [t.get("birim") or {} for t in talepler]
    return (all(t.get("karar") == "ICERIDE" for t in talepler)
            and all(b.get("ad") and b.get("dogrulanmis") for b in birimler)
            and len({str(b.get("ad")) for b in birimler}) == 1)


def yonlendirme_kur(
    talepler: list[dict[str, Any]], *, gerekce: str, uretim: dict[str, Any],
    dayanak: str, insan_onayi_zorla: bool = False,
) -> dict[str, Any]:
    """Talep kararlarından belge düzeyi yönlendirme nesnesi.

    Belge birimi = ilk ICERIDE talebin birimi (kurum içi havale yapılacak birim). Hiç içeride
    talep yoksa alıcı kurum = ilk DISARIDA talebin kurumu, birim o kurumun birimi (varsa).
    Otomatik havale şartları `_otomatik_havale_mi`'dedir; diğer her durum insan onayı ister.
    """
    karar = belge_karari(talepler)
    ic = next((t for t in talepler if t["karar"] == "ICERIDE"), None)
    dis = next((t for t in talepler if t["karar"] == "DISARIDA"), None)
    birim = (ic or {}).get("birim") if ic else (dis or {}).get("birim")
    alici = None if ic else (dis or {}).get("alici_kurum")
    otomatik = not insan_onayi_zorla and _otomatik_havale_mi(talepler, uretim)
    return {
        "karar": karar,
        "alici_kurum": alici,
        "birim": birim,
        "gerekce": gerekce,
        "insan_onayi_gerekli": not otomatik,
        "belirsiz_talep": sum(t.get("karar") == "BELIRSIZ" for t in talepler),
        "devir": {"gerekli": bool(dis),
                  "yetkili_kurum": (dis or {}).get("devir", {}).get("yetkili_kurum"),
                  "dayanak": str(((dis or {}).get("devir") or {}).get("dayanak") or "")},
        "talepler": talepler,
        "uretim": uretim,
    }


def devir_kurumu(karar: dict[str, Any]) -> dict[str, Any] | None:
    """Talep kararı DISARIDA ve yetkili kurum belliyse {slug, ad}; aksi hâlde None.
    (Tek okuyucu: yazışma paketi ve finalize bildirimi aynı kararı okur.)"""
    devir = karar.get("devir") or {}
    kurum = devir.get("yetkili_kurum")
    if (karar.get("karar") == "DISARIDA" and devir.get("gerekli")
            and isinstance(kurum, dict) and kurum.get("ad")):
        return kurum
    return None


def devir_ozeti(yon: dict[str, Any] | None) -> dict[str, Any] | None:
    """Belgede devir varsa {karar, kurumlar:[ad…], dayanak}; yoksa None.

    DISARIDA'da belge düzeyi devir bloğu, KARMA'da talep bazlı kararlar okunur. Kurum
    adları tekilleştirilir, giriş sırası korunur."""
    yon = yon or {}
    if yon.get("karar") not in ("DISARIDA", "KARMA"):
        return None
    kurumlar = [k for t in (yon.get("talepler") or []) if isinstance(t, dict)
                if (k := devir_kurumu(t))]
    belge = (yon.get("devir") or {})
    if not kurumlar and belge.get("gerekli") and (belge.get("yetkili_kurum") or {}).get("ad"):
        kurumlar = [belge["yetkili_kurum"]]
    if not kurumlar:
        return None
    # Sicilde doğrulanmamış (serbest) ad bildirimde kurum adı gibi görünmez.
    adlar = [f"{k['ad']} (doğrulanmadı)" if kurum_dogrulanmamis_mi(k) else k["ad"]
             for k in kurumlar]
    return {"karar": yon["karar"], "kurumlar": list(dict.fromkeys(adlar)),
            "dayanak": str(belge.get("dayanak") or ""),
            "dogrulanmamis": any(kurum_dogrulanmamis_mi(k) for k in kurumlar),
            "onay_bekliyor": bool(yon.get("insan_onayi_gerekli", True))}


def gosterim_birimi(yon: dict[str, Any] | None) -> str:
    """Memurun göreceği TEK birim metni (arşiv, finalize, bildirim, arayüz aynı metni basar).

    Devirde '<Kurum> (devir)'; kurum sicilde doğrulanmamışsa '(devir, doğrulanmadı)'. YARGI
    kararında yargı yolu bildirilir. Yönlendirme var ama birim yoksa açık 'memur seçecek'
    metni — kaba kategori havale birimi gibi gösterilmez."""
    if not yon:
        return ""
    if yon.get("karar") == "YARGI":
        return "Yargı yolu (3071 m.6/b — idarece incelenemez)"
    birim = yon.get("birim") or {}
    alici = yon.get("alici_kurum") or {}
    if alici.get("ad"):
        ek = f" — {birim['ad']}" if birim.get("ad") else ""
        isaret = "devir, doğrulanmadı" if kurum_dogrulanmamis_mi(alici) else "devir"
        return f"{alici['ad']}{ek} ({isaret})"
    return str(birim.get("ad") or "") or BIRIM_SECILMEDI


def duz_alanlar(yon: dict[str, Any], muhatap: dict[str, Any]) -> dict[str, Any]:
    """Geriye uyum alanları — frontend/eval/yazı bu adlarla okumaya devam ediyor."""
    birim = yon.get("birim") or {}
    alici = yon.get("alici_kurum") or {}
    dogrulanmis = bool(birim.get("dogrulanmis")) and not yon["insan_onayi_gerekli"]
    if dogrulanmis:
        durum = "kaynak_dogrulandi"
    elif (yon.get("uretim") or {}).get("yol", "").startswith("llm"):
        durum = "llm_onerisi"
    else:
        durum = "fallback_onerisi"
    yetkili = ({"ad": alici.get("ad", ""), "slug": alici.get("slug", ""),
                "tur": alici.get("tur", ""), "kaynak": alici.get("kaynak", "sicil"),
                "dogrulanmis": not kurum_dogrulanmamis_mi(alici)}
               if alici.get("slug") else dict(muhatap))
    return {
        "hedef_birim": birim.get("ad") if dogrulanmis else None,
        "hedef_birim_oneri": str(birim.get("ad") or ""),
        "yetkili_kurum": yetkili,
        "insan_onayi_gerekli": bool(yon["insan_onayi_gerekli"]),
        "durum": durum,
        "gosterim_birimi": gosterim_birimi(yon),
    }


def alt_talepleri_zenginlestir(
    alt_talepler: list[dict[str, Any]], kararlar: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Alt taleplere talep bazlı yönlendirme ekle (additive; mevcut alanlar korunur).

    Eşleşme `id` üzerinden, yoksa sıra üzerinden. Yeni kopya döner (girdi değişmez).
    """
    by_id = {k["talep_id"]: k for k in kararlar}
    out: list[dict[str, Any]] = []
    for i, alt in enumerate(alt_talepler):
        if not isinstance(alt, dict):
            out.append(alt)
            continue
        tid = str(alt.get("id") or f"t{i + 1}")
        k = by_id.get(tid) or (kararlar[i] if i < len(kararlar) else None)
        if k is None:
            out.append(dict(alt))
            continue
        alici = k.get("alici_kurum") or {}
        birim = k.get("birim") or {}
        tek = {"karar": k["karar"], "alici_kurum": alici or None, "birim": birim or None}
        out.append({
            **alt, "id": tid, "yetki": k["karar"],
            "yetkili_kurum_ad": str(alici.get("ad") or ""),
            "yetkili_kurum_dogrulanmis": (not kurum_dogrulanmamis_mi(alici)) if alici else None,
            "birim_ad": (gosterim_birimi(tek) if (alici or k["karar"] == "YARGI")
                         else str(birim.get("ad") or "")),
            "yonlendirme": k,
        })
    return out


__all__ = (
    "BIRIM_SECILMEDI", "KARARLAR", "OZEL_HUKUK_TURLERI", "SERBEST_KAYNAK", "VARSAYILAN_DEVIR_DAYANAGI",
    "YARGI_DAYANAGI", "alt_talepleri_zenginlestir", "belge_karari", "devir_dayanagi",
    "devir_kurumu", "devir_ozeti", "duz_alanlar", "gosterim_birimi", "kurum_dogrulanmamis_mi",
    "talep_karari", "yonlendirme_kur",
)
