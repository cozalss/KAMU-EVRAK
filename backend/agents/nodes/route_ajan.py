"""Yetki + birim yönlendirme ajanı — talep başına karar, kapalı kümeler, tek doğruluk kaynağı.

Akış:
  muhatap + gönderen kurum (deterministik) → TALEP listesi (talep_kumesi > alt_talepler >
  bilgi_unsurlari.talepler > konu) → muhatabın TÜM birimleri (teşkilat korpusu; valilik/
  kaymakamlıkta ilin bağlı il müdürlükleri de) + sicilden ADAY KURUMLAR (kurum_aday) →
  TEK LLM çağrısı (düşünmesiz, kapalı küme, kodla seçim): her talep için ICERIDE/DISARIDA +
  birim kodu + kurum kodu → güvenlik ağı (üçlü grounding, gönderen ≠ alıcı) →
  `yonlendirme` nesnesi (agents/yonlendirme.py) → eski düz alanlar bundan TÜRETİLİR.

Güvenlik sözleşmeleri:
  - Birim ve kurum yalnız kapalı kümeden; listede olmayan kurum adı 'doğrulanmamış' işaretlenir.
  - Otomatik havale (insan_onayi_gerekli=False) YALNIZ: model gerçekten karar verdi, tüm
    talepler içeride, seçilen birim kuruma-özel resmî kaynakta üçlü grounding'den geçti.
    Model yok/hata → deterministik öneri + insan onayı; ASLA 'kaynak_dogrulandi'.
  - DeepSeek'e giden her metin `mask_for_llm` ile maskeli (gövde, konu, talepler).
  - Canlı kaynak keşfi yalnız korpusta teşkilatı olmayan kurumda; `dogrulanmis=False`.
"""
from __future__ import annotations

import os
from typing import Any

import structlog

from agents.kurum_aday import kurum_ad_cozumle, kurum_adaylari, muhatap_kaydi
from agents.kurum_kimlik import ad_to_kurum, gonderen_kurum_tespit, muhatap_kurum_tespit
from agents.nodes._llm_extract import llm_json, real_llm
from agents.nodes.teskilat_ara import kurum_birimleri, kurum_teskilatta_var
from agents.resmi_kaynak import kurum_korpusta_var, uclu_grounding
from agents.yonlendirme import (
    alt_talepleri_zenginlestir,
    devir_dayanagi,
    duz_alanlar,
    talep_karari,
    yonlendirme_kur,
)
from api.pii import mask_for_llm
from core.canli_kaynak import kurum_icin_oneri_async

log = structlog.get_logger()

_SYSTEM = (
    "Sen bir kamu kurumunda evrak havale uzmanısın. Evrak MUHATAP kuruma gelmiştir. Her talep "
    "için ayrı karar ver: talep muhatap kurumun kanuni görev alanındaysa karar='ICERIDE' ve "
    "BİRİMLER listesinden işi asıl yürütecek birimin KODUNU seç (görev tanımına bak; yalnız "
    "kayıt alan/destek veren birimi değil konuyu inceleyip sonuçlandıran birimi seç; bağlı "
    "taşra kuruluşu da listede birim olarak yer alabilir). Talep başka bir idarenin veya kamu "
    "hizmeti sağlayıcısının görevindeyse karar='DISARIDA' ve KURUMLAR listesinden yetkili "
    "kurumun KODUNU seç; listede yoksa kurum_adi alanına resmî adını yaz. 'Şikâyet', 'dilekçe', "
    "'CİMER' evrakın biçimidir, konusu değildir. Uydurma kod yazma. Gerekçe tek kısa cümle."
)


def _arama_baglami(
    bilgi: dict[str, Any], masked_text: str, isim: str | None = None
) -> tuple[str, str]:
    """Konu + talepler + maskeli gövdeden retrieval girdisi üret (konu/talepler de maskelenir).

    KVKK: `konu`/`talepler` bilgi_unsurlari'ndan gelir ve orada kişi ADI kalır; `mask_for_llm`
    isim yokken de çağrılır çünkü TCKN/telefon/IBAN maskesini de o yapar.
    """
    def _maskele(s: str) -> str:
        return mask_for_llm(s, isim)

    konu = _maskele(str(bilgi.get("konu") or "").strip())
    talepler = bilgi.get("talepler") or []
    talep_metinleri = [_maskele(str(t).strip())
                       for t in talepler if isinstance(t, str) and t.strip()]
    govde = masked_text[:1600]
    if not konu:
        konu = (" ".join(talep_metinleri) or govde[:300]).strip()
    arama = " ".join([konu, konu, konu, *talep_metinleri, govde]).strip()
    return konu, arama[:2600]


def kesif_konusu(konu: str, masked_text: str) -> str:
    """Canlı keşfe verilecek konu: ayırt edici ≥2 kelime taşıyorsa konu, yoksa gövde öneki."""
    from core.canli_kaynak import _tokenlar

    temiz = (konu or "").strip()
    if len(_tokenlar(temiz)) >= 2:
        return temiz
    return (masked_text or "")[:300].strip() or temiz


def talep_listesi(state: dict[str, Any], konu: str, isim: str | None) -> tuple[list[dict], str]:
    """Kararın verileceği talepler [{'id','metin'}] + kaynak adı ('talep_kumesi'|'alt_talepler'|
    'bilgi'|'konu'). Metinler maskelidir."""
    bilgi = state.get("bilgi_unsurlari") or {}

    def _m(s: Any) -> str:
        return mask_for_llm(str(s or "").strip(), isim)[:400]

    kume = [t for t in (bilgi.get("talep_kumesi") or []) if isinstance(t, dict)]
    if kume:
        return [{"id": str(t.get("id") or f"t{i + 1}"),
                 "metin": _m(t.get("ozet") or t.get("kanit"))} for i, t in enumerate(kume)], \
            "talep_kumesi"
    alt = [a for a in (state.get("alt_talepler") or []) if isinstance(a, dict)]
    if len(alt) >= 2:
        return [{"id": str(a.get("id") or f"t{i + 1}"),
                 "metin": _m(a.get("ozet") or a.get("konu"))} for i, a in enumerate(alt)], \
            "alt_talepler"
    metinler = [t for t in (bilgi.get("talepler") or []) if isinstance(t, str) and t.strip()]
    if metinler:
        return [{"id": f"t{i + 1}", "metin": _m(t)} for i, t in enumerate(metinler)], "bilgi"
    return [{"id": "t1", "metin": konu[:400]}], "konu"


def _bagli_birimler(muhatap: dict[str, Any], kurumlar: list[dict[str, str]]) -> list[dict]:
    """Valilik/kaymakamlıkta ilin taşra il müdürlükleri BİRİM seçeneği olur (bağlı kuruluş).

    Sicilden gelir: doğrulanmış birim DEĞİLDİR, otomatik havale üretmez.
    """
    tur = muhatap_kaydi(muhatap).get("tur") or muhatap.get("tur")
    if tur not in ("valilik", "kaymakamlik"):
        return []
    return [{"birim_ad": k["ad"], "gorev": "İle bağlı taşra teşkilatı (il müdürlüğü).",
             "kurum_slug": k["slug"], "kaynak_tipi": "bagli_kurulus",
             "kaynak_guven": "sicil", "skor": 0.0}
            for k in kurumlar if k.get("tur") == "il_mudurlugu"]


def _birim_satirlari(birimler: list[dict[str, Any]]) -> str:
    satirlar = [f"B{i + 1} | {b.get('birim_ad')} | {(b.get('gorev') or '')[:260]}"
                for i, b in enumerate(birimler)]
    return "\n".join(satirlar) or "(muhatabın teşkilat kaydı yok)"


def _kurum_satirlari(kurumlar: list[dict[str, str]]) -> str:
    return "\n".join(
        f"{k['kod']} | {k['ad']} [{k['tur']}{', ' + k['il'] if k.get('il') else ''}]"
        for k in kurumlar)


async def _llm_karar(
    muhatap: dict[str, Any], masked: str, konu: str, talepler: list[dict],
    birimler: list[dict[str, Any]], kurumlar: list[dict[str, str]],
) -> dict[str, Any] | None:
    """Tek çağrı, düşünmesiz (kapalı küme seçimi): talep başına karar JSON'u."""
    talep_satir = "\n".join(f"{t['id']}: {t['metin']}" for t in talepler)
    return await llm_json(
        system=_SYSTEM,
        user=(
            f"MUHATAP KURUM: {muhatap.get('ad') or '(bilinmiyor)'}\n"
            f"EVRAK KONUSU: {konu}\n\nTALEPLER:\n{talep_satir}\n\n"
            f"BİRİMLER (muhatap kurumun; kod | ad | görev):\n{_birim_satirlari(birimler)}\n\n"
            f"KURUMLAR (yetki dışarıdaysa; kod | ad [tür, il]):\n{_kurum_satirlari(kurumlar)}\n\n"
            f"EVRAK METNİ (maskeli):\n{masked[:1200]}\n\n"
            'Yalnız JSON: {"talepler":[{"id":"t1","karar":"ICERIDE|DISARIDA","birim":"B?",'
            '"kurum":"K?","kurum_adi":"","gerekce":"..."}]}'
        ),
        max_tokens=160 + 110 * len(talepler),
        dusunme_kapali=True,
    )


def _birim_kaydi(aday: dict[str, Any] | None, dogrulanmis: bool) -> dict[str, Any] | None:
    if not aday or not aday.get("birim_ad"):
        return None
    return {"ad": aday["birim_ad"], "kaynak_tipi": aday.get("kaynak_tipi", ""),
            "dogrulanmis": dogrulanmis, "bagli": aday.get("kaynak_tipi") == "bagli_kurulus",
            "kurum_slug": aday.get("kurum_slug", "")}


def _kod(deger: Any, onek: str, liste: list[Any]) -> Any:
    s = str(deger or "").strip().upper()
    if not s.startswith(onek) or not s[1:].isdigit():
        return None
    i = int(s[1:]) - 1
    return liste[i] if 0 <= i < len(liste) else None


def _alici_kurum(cevap: dict[str, Any], kurumlar: list[dict[str, str]],
                 gonderen: dict[str, Any]) -> dict[str, Any] | None:
    """Kurum kodu → sicil kaydı; serbest ad → sicile çözüm, çözülemezse doğrulanmamış künye."""
    k = _kod(cevap.get("kurum"), "K", kurumlar)
    if k:
        alici = {"slug": k["slug"], "ad": k["ad"], "tur": k["tur"], "kaynak": "sicil"}
    else:
        ad = str(cevap.get("kurum_adi") or "").strip()
        kayit = kurum_ad_cozumle(ad)
        if kayit:
            alici = {"slug": kayit["slug"], "ad": kayit["ad"], "tur": kayit.get("tur", ""),
                     "kaynak": "sicil"}
        elif ad:
            serbest = ad_to_kurum(ad)
            alici = {**serbest, "ad": ad, "kaynak": "serbest_dogrulanmadi"}
        else:
            return None
    if gonderen.get("slug") and alici.get("slug") == gonderen["slug"]:
        log.info("route_ajan.gonderen_alici_reddedildi", kurum=alici.get("ad"))
        return None
    return alici if alici.get("slug") else None


def _grounded(aday: dict[str, Any] | None, metin: str, muhatap: dict[str, Any],
              gonderen: dict[str, Any]) -> bool:
    if not aday:
        return False
    if gonderen.get("slug") and str(aday.get("kurum_slug") or "") == gonderen["slug"]:
        return False  # KEMER-ASKI: gönderenin korpusundan hedef ASLA doğrulanmaz
    return uclu_grounding(aday, metin, muhatap.get("slug", ""))


def _llm_kararlari(
    obj: dict[str, Any], talepler: list[dict], birimler: list[dict], kurumlar: list[dict],
    ctx: dict[str, Any],
) -> list[dict[str, Any]] | None:
    """LLM çıktısı → talep kararları. Bozuk/eksik çıktı → None (deterministik yedek)."""
    cevaplar = {str(c.get("id")): c for c in (obj.get("talepler") or []) if isinstance(c, dict)}
    if not cevaplar:
        return None
    out = []
    for i, t in enumerate(talepler):
        c = cevaplar.get(t["id"]) or (list(cevaplar.values())[i] if i < len(cevaplar) else {})
        karar = str(c.get("karar") or "").upper()
        aday = _kod(c.get("birim"), "B", birimler)
        alici = _alici_kurum(c, kurumlar, ctx["gonderen"]) if karar == "DISARIDA" else None
        dogru = karar == "ICERIDE" and _grounded(
            aday, f"{t['metin']} {ctx['konu']}", ctx["muhatap"], ctx["gonderen"])
        out.append(talep_karari(
            t["id"], karar, alici_kurum=alici,
            birim=_birim_kaydi(aday if karar == "ICERIDE" else None, dogru),
            gerekce=str(c.get("gerekce") or "").strip()[:300], dayanak=ctx["dayanak"]))
    return out


_GUVEN_SIRASI = {"kurum_ozel": 0, "mevzuat_teskilat": 1, "aday": 2}


def _deterministik_kararlar(talepler: list[dict], muhatap: dict, arama: str) -> list[dict]:
    """Model yokken: her talep içeride varsayılır; birim = talebe eşleşen birimler içinde
    güveni en yüksek olanın en yakını (öneri). Yetki sorusu model olmadan yanıtlanmaz ve
    doğrulanmış birim üretilmez (BM25 sırası bir yargı değildir)."""
    out = []
    for t in talepler:
        sorgu = arama if len(talepler) == 1 else f"{t['metin']} {arama[:300]}"
        adaylar = [a for a in kurum_birimleri(muhatap.get("slug", ""), sorgu,
                                              tur=muhatap.get("tur", ""))
                   if float(a.get("skor") or 0) > 0]
        sirali = sorted(adaylar, key=lambda a: (_GUVEN_SIRASI.get(a.get("kaynak_tipi"), 3),
                                                -float(a.get("skor") or 0)))
        en_iyi = sirali[0] if sirali else None
        out.append(talep_karari(t["id"], "ICERIDE", birim=_birim_kaydi(en_iyi, False),
                                gerekce="Model kararı yok; öneri teşkilat kaynağı sırasından."))
    return out


def _kaynak_kunye(aday: dict[str, Any]) -> dict[str, Any]:
    """KaynakKaydi'yi state'e yazılacak künyeye indir (audit için)."""
    return {k: aday[k] for k in (
        "birim_ad", "gorev", "kaynak_kurum", "kurum_slug", "belge_basligi",
        "url_veya_belge_kimligi", "erisim_tarihi", "metin_parcasi", "icerik_hash",
        "kaynak_tipi", "kaynak_guven", "kaynak_dosya", "kaynak_sha256",
        "dogrulayan", "dogrulama_tarihi", "sablon_slug",
    ) if k in aday}


def _muhatap_ve_gonderen(state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    metin = state.get("evrak_text", "") or ""
    gonderen = gonderen_kurum_tespit(metin)
    muhatap = muhatap_kurum_tespit(metin, state.get("bilgi_unsurlari") or {})
    if not muhatap.get("slug"):
        # Hitapsız resmî evrak: muhatap BİZİZ (kurulum sabiti KURUM_ADI); tanımsızsa boş.
        muhatap = ad_to_kurum(os.getenv("KURUM_ADI", "").strip())
    return dict(muhatap), dict(gonderen)


async def route_ajan(state: dict[str, Any], det: dict[str, Any]) -> dict[str, Any]:
    """Talep bazlı yetki + birim kararı. det = _route_deterministik(state) (kategori köprüsü)."""
    bilgi = state.get("bilgi_unsurlari") or {}
    muhatap, gonderen = _muhatap_ve_gonderen(state)
    isim = bilgi.get("gonderen")
    masked = mask_for_llm(state.get("evrak_text", "") or "", isim)
    konu, arama = _arama_baglami(bilgi, masked, isim)
    talepler, kaynak = talep_listesi(state, konu, isim)
    kurumlar = kurum_adaylari(muhatap, gonderen)
    birimler = kurum_birimleri(muhatap.get("slug", ""), arama, tur=muhatap.get("tur", ""))
    birimler += _bagli_birimler(muhatap, kurumlar)
    ctx = {"muhatap": muhatap, "gonderen": gonderen, "konu": konu,
           "dayanak": devir_dayanagi(state.get("evrak_turu", ""))}

    kararlar, uretim = None, {"yol": "deterministik", "kesik": False, "yedege_dustu": False}
    if real_llm() is not None:
        obj = await _llm_karar(muhatap, masked, konu, talepler, birimler, kurumlar)
        kararlar = _llm_kararlari(obj, talepler, birimler, kurumlar, ctx) if obj else None
        uretim = {"yol": "llm" if kararlar else "deterministik", "kesik": False,
                  "yedege_dustu": kararlar is None}
    if kararlar is None:
        # Modelsiz yolda talep bölünmesi yalnız ayrıştırıcıdan geliyorsa kullanılır; çıkarıcı
        # cümleleri tek başına BM25 sorgusu olarak gürültülüdür → belge bağlamıyla tek karar.
        det_talepler = talepler if kaynak in ("talep_kumesi", "alt_talepler") else talepler[:1]
        kararlar = _deterministik_kararlar(det_talepler, muhatap, arama)
    gerekce = _gerekce_metni(kararlar, uretim)
    yon = yonlendirme_kur(kararlar, gerekce=gerekce, uretim=uretim, dayanak=ctx["dayanak"])
    return await _cikti(state, det, yon, muhatap, gonderen, birimler, kaynak, konu, masked)


def _gerekce_metni(kararlar: list[dict[str, Any]], uretim: dict[str, Any]) -> str:
    parcalar = []
    for k in kararlar:
        hedef = ((k.get("alici_kurum") or {}).get("ad") or (k.get("birim") or {}).get("ad")
                 or "belirsiz")
        parcalar.append(f"{k['talep_id']}: {k['karar']} → {hedef}"
                        + (f" — {k['gerekce']}" if k.get("gerekce") else ""))
    if uretim.get("yedege_dustu"):
        parcalar.append("Model yanıtı alınamadı; öneri teşkilat kaynağı sırasından, "
                        "memur onayı gerekli.")
    return " · ".join(parcalar)


async def _cikti(
    state: dict[str, Any], det: dict[str, Any], yon: dict[str, Any], muhatap: dict[str, Any],
    gonderen: dict[str, Any], birimler: list[dict[str, Any]], kaynak: str, konu: str,
    masked: str,
) -> dict[str, Any]:
    """`yonlendirme` + ondan türeyen eski alanlar + canlı kaynak (yalnız korpus dışı kurumda)."""
    duz = duz_alanlar(yon, muhatap)
    birim_ad = (yon.get("birim") or {}).get("ad", "")
    secilen = next((b for b in birimler if b.get("birim_ad") == birim_ad), None)
    out: dict[str, Any] = {
        **duz,
        "yonlendirme": yon,
        "muhatap_kurum": muhatap, "gonderen_kurum": gonderen,
        "hedef_kurum_adi": ((secilen or {}).get("kaynak_kurum") or duz["yetkili_kurum"].get("ad")
                            or muhatap.get("ad", "")),
        "hedef_birim_kaynak": _kaynak_kunye(secilen) if secilen else {},
        "hedef_kategori": det.get("hedef_birim"),
        "birim_alternatifleri": [b["birim_ad"] for b in birimler
                                 if b.get("birim_ad") and b["birim_ad"] != birim_ad][:3]
        or list(det.get("birim_alternatifleri", []))[:3],
        "birim_reasoning": yon["gerekce"] + ("" if not yon["insan_onayi_gerekli"]
                                             else " · Memur onayı gerekli."),
        "canli_kaynak": {},
    }
    if kaynak in ("talep_kumesi", "alt_talepler") and state.get("alt_talepler"):
        out["alt_talepler"] = alt_talepleri_zenginlestir(state["alt_talepler"], yon["talepler"])
    hedef_slug = muhatap.get("slug", "")
    korpus_var = bool(hedef_slug) and (kurum_korpusta_var(hedef_slug)
                                       or kurum_teskilatta_var(hedef_slug))
    if yon["karar"] != "DISARIDA" and hedef_slug and not korpus_var:
        out["canli_kaynak"] = await _canli(hedef_slug, konu, masked)
        if out["canli_kaynak"].get("url"):
            out["birim_reasoning"] += f" · Canlı kaynak (doğrulanmadı): {out['canli_kaynak']['url']}"
    log.info("route_ajan.karar", karar=yon["karar"], yol=yon["uretim"]["yol"],
             onay=yon["insan_onayi_gerekli"], talep=len(yon["talepler"]))
    return out


async def _canli(hedef_slug: str, konu: str, masked: str) -> dict[str, Any]:
    """Canlı kaynak keşfi — ASLA yönlendirmeyi düşürmez, otomatik havale yolu açmaz (docs/14)."""
    try:
        return await kurum_icin_oneri_async(
            hedef_slug, kesif_konusu(konu, masked), web_aramasi=False) or {}
    except Exception as exc:
        log.warning("route_ajan.canli_kaynak_hatasi", hata=type(exc).__name__)
        return {}


__all__ = ("kesif_konusu", "route_ajan", "talep_listesi")
