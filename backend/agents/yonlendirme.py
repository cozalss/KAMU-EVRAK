"""Yönlendirme TEK DOĞRULUK KAYNAĞI — `state['yonlendirme']` nesnesi + türetilmiş alanlar.

Teşhis (docs/benchmark/teshis-2026-10-05.json, "BİRİM YÖNLENDİRME + YETKİ" (b)): birbirinden
habersiz üç birim sistemi (9'lu kategori, belediye servis müdürlüğü, teşkilat korpusu) ve
altı ayrı öncelik zinciri vardı; aynı belgede taslak 'devir: Başkent EDAŞ', bildirim
'Basın-Halkla İlişkiler'e havale edildi' diyordu. Artık karar BİR nesnede durur:

    {karar: ICERIDE|DISARIDA|KARMA|BELIRSIZ,
     alici_kurum: {slug, ad, tur} | None,
     birim: {ad, kaynak_tipi, dogrulanmis, bagli?} | None,
     gerekce, insan_onayi_gerekli,
     devir: {gerekli, yetkili_kurum: {slug, ad} | None, dayanak},
     talepler: [{talep_id, karar, alici_kurum, birim, devir, gerekce}],
     uretim: {yol: llm|llm_dusunmesiz|deterministik, kesik, yedege_dustu}}

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

KARARLAR = ("ICERIDE", "DISARIDA", "KARMA", "BELIRSIZ")


def devir_dayanagi(evrak_turu: str) -> str:
    from agents.config import EVRAK_TO_DEVIR_DAYANAK

    return str(EVRAK_TO_DEVIR_DAYANAK.get(evrak_turu) or VARSAYILAN_DEVIR_DAYANAGI)


def talep_karari(
    talep_id: str, karar: str, *, alici_kurum: dict[str, Any] | None = None,
    birim: dict[str, Any] | None = None, gerekce: str = "", dayanak: str = "",
) -> dict[str, Any]:
    """Tek talep kararı. DISARIDA ise devir bloğu dolar; birim alıcı kurumun birimi olabilir."""
    karar = karar if karar in ("ICERIDE", "DISARIDA") else "BELIRSIZ"
    disari = karar == "DISARIDA" and bool(alici_kurum)
    return {
        "talep_id": talep_id, "karar": karar if (karar != "DISARIDA" or disari) else "BELIRSIZ",
        "alici_kurum": alici_kurum if disari else None,
        "birim": birim,
        "devir": {"gerekli": disari,
                  "yetkili_kurum": ({"slug": alici_kurum.get("slug", ""),
                                     "ad": alici_kurum.get("ad", "")} if disari else None),
                  "dayanak": dayanak if disari else ""},
        "gerekce": gerekce,
    }


def belge_karari(talepler: list[dict[str, Any]]) -> str:
    """Talep kararlarından belge kararı: hepsi aynıysa o; karışıksa KARMA."""
    kararlar = {t["karar"] for t in talepler}
    if not kararlar or kararlar == {"BELIRSIZ"}:
        return "BELIRSIZ"
    kararlar.discard("BELIRSIZ")
    if len(kararlar) == 1:
        return kararlar.pop()
    return "KARMA"


def yonlendirme_kur(
    talepler: list[dict[str, Any]], *, gerekce: str, uretim: dict[str, Any],
    dayanak: str, insan_onayi_zorla: bool = False,
) -> dict[str, Any]:
    """Talep kararlarından belge düzeyi yönlendirme nesnesi.

    Belge birimi = ilk ICERIDE talebin birimi (kurum içi havale yapılacak birim). Hiç içeride
    talep yoksa alıcı kurum = ilk DISARIDA talebin kurumu, birim o kurumun birimi (varsa).
    Otomatik havale yalnız: model GERÇEKTEN karar verdi (yol=llm), tüm talepler içeride, belge
    birimi doğrulanmış. Diğer her durum insan onayı ister.
    """
    karar = belge_karari(talepler)
    ic = next((t for t in talepler if t["karar"] == "ICERIDE"), None)
    dis = next((t for t in talepler if t["karar"] == "DISARIDA"), None)
    birim = (ic or {}).get("birim") if ic else (dis or {}).get("birim")
    alici = None if ic else (dis or {}).get("alici_kurum")
    otomatik = (
        not insan_onayi_zorla and uretim.get("yol") == "llm" and karar == "ICERIDE"
        and bool(birim and birim.get("dogrulanmis"))
    )
    return {
        "karar": karar,
        "alici_kurum": alici,
        "birim": birim,
        "gerekce": gerekce,
        "insan_onayi_gerekli": not otomatik,
        "devir": {"gerekli": bool(dis),
                  "yetkili_kurum": (dis or {}).get("devir", {}).get("yetkili_kurum"),
                  "dayanak": dayanak if dis else ""},
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
    adlar = [k["ad"] for t in (yon.get("talepler") or []) if isinstance(t, dict)
             if (k := devir_kurumu(t))]
    belge = (yon.get("devir") or {})
    if not adlar and belge.get("gerekli") and (belge.get("yetkili_kurum") or {}).get("ad"):
        adlar = [belge["yetkili_kurum"]["ad"]]
    if not adlar:
        return None
    return {"karar": yon["karar"], "kurumlar": list(dict.fromkeys(adlar)),
            "dayanak": str(belge.get("dayanak") or "")}


def gosterim_birimi(yon: dict[str, Any] | None) -> str:
    """Memurun göreceği TEK birim metni (arşiv, finalize, bildirim, arayüz aynı metni basar)."""
    if not yon:
        return ""
    birim = yon.get("birim") or {}
    alici = yon.get("alici_kurum") or {}
    if alici.get("ad"):
        ek = f" — {birim['ad']}" if birim.get("ad") else ""
        return f"{alici['ad']}{ek} (devir)"
    return str(birim.get("ad") or "")


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
                "tur": alici.get("tur", "")} if alici.get("slug") else dict(muhatap))
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
            "birim_ad": gosterim_birimi(tek) if alici else str(birim.get("ad") or ""),
            "yonlendirme": k,
        })
    return out


__all__ = (
    "KARARLAR", "VARSAYILAN_DEVIR_DAYANAGI", "alt_talepleri_zenginlestir", "belge_karari",
    "devir_dayanagi", "devir_kurumu", "devir_ozeti", "duz_alanlar", "gosterim_birimi", "talep_karari", "yonlendirme_kur",
)
