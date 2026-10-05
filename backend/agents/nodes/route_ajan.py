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
import re
from typing import Any

import structlog

from agents import llm_iz
from agents.config import evrak_turu_tr
from agents.kurum_aday import (
    ayni_aile,
    gonderen_aileleri,
    kurum_ad_cozumle,
    kurum_adaylari,
    kurum_aile_anahtari,
    muhatap_kaydi,
    yerel_tasra_tercih,
)
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
    "taşra kuruluşu da listede birim olarak yer alabilir). Listede uygun birim yoksa birim "
    "alanını boş bırak (memur seçer); muhatap kurumun kendisini birim seçme. Talep başka bir "
    "idarenin veya kamu hizmeti sağlayıcısının görevindeyse karar='DISARIDA' ve KURUMLAR "
    "listesinden yetkili kurumun KODUNU seç; listede yoksa kurum_adi alanına resmî adını yaz. "
    "İşi yerinde yürüten taşra birimi (il müdürlüğü) listede varsa bakanlık/genel müdürlük "
    "yerine onu seç. Özel şirket (dağıtım şirketi) idari makam değildir; yine KURUMLAR'dan seç. "
    "Konu bir yargı merciinin görevindeyse (özel hukuk uyuşmazlığı: kat mülkiyeti, kira, "
    "miras paylaşımı, alacak davası vb.) karar='YARGI' (idare inceleyemez, devir yapılmaz). "
    "Evrak bir kamu kurumunun yazısıysa ve muhatap kurumdan bilgi/işlem/cevap istiyorsa cevap "
    "yükümlüsü MUHATAPTIR: karar='ICERIDE'; yazıyı gönderen kurum asla yetkili kurum değildir. "
    "Birim ADINDAKİ sözcük benzerliğine değil GÖREV tanımındaki işe bak (bir verginin, harcın "
    "ya da ücretin tahakkuk ve tahsili gelir/mali hizmetler işidir). "
    "'Şikâyet', 'dilekçe', 'CİMER' evrakın biçimidir, konusu değildir; ancak BİLGİ EDİNME "
    "başvurusu (4982) usul gereği bilgi edinme / halkla ilişkiler birimince karşılanır — "
    "listede böyle bir birim varsa onu seç (konu birimi yalnız bilgi sağlar). Uydurma kod "
    "yazma. Gerekçe tek kısa cümle."
)

# Bilgi edinme başvurusunu usulen karşılayan birimin adında geçen kökler (4982 m.7 akışı).
# Ad eşleşmesi kelime sınırıyla yapılır: 'Bilgi İşlem' bu kümeye girmez.
_BILGI_EDINME_BIRIM = re.compile(
    r"\bbilgi\s+edinme|\bhalkla\s+ili[sş]ki|\bbas[ıi]n\b|\bcimer\b|\ba[cç][ıi]k\s+kap[ıi]",
    re.IGNORECASE)


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
    birimler: list[dict[str, Any]], kurumlar: list[dict[str, str]], ctx: dict[str, Any],
) -> dict[str, Any] | None:
    """Tek çağrı, düşünmesiz (kapalı küme seçimi): talep başına karar JSON'u.

    Evrak türü ve gönderen kurum istemde AÇIKTIR: bilgi edinme usulü (4982) ve 'gelen kurum
    yazısında cevap yükümlüsü muhataptır' kuralı türü/göndereni bilmeden uygulanamaz."""
    talep_satir = "\n".join(f"{t['id']}: {t['metin']}" for t in talepler)
    gonderen = (ctx.get("gonderen") or {}).get("ad") or "(gerçek kişi / belirtilmemiş)"
    return await llm_json(
        system=_SYSTEM,
        user=(
            f"MUHATAP KURUM: {muhatap.get('ad') or '(bilinmiyor)'}\n"
            f"GÖNDEREN: {gonderen}\n"
            f"EVRAK TÜRÜ: {evrak_turu_tr(ctx.get('evrak_turu') or 'belirsiz')}\n"
            f"EVRAK KONUSU: {konu}\n\nTALEPLER:\n{talep_satir}\n\n"
            f"BİRİMLER (muhatap kurumun; kod | ad | görev):\n{_birim_satirlari(birimler)}\n\n"
            f"KURUMLAR (yetki dışarıdaysa; kod | ad [tür, il]):\n{_kurum_satirlari(kurumlar)}\n\n"
            f"EVRAK METNİ (maskeli):\n{masked[:1200]}\n\n"
            'Yalnız JSON: {"talepler":[{"id":"t1","karar":"ICERIDE|DISARIDA|YARGI",'
            '"birim":"B?","kurum":"K?","kurum_adi":"","gerekce":"..."}]}'
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
                 gonderen: dict[str, Any],
                 gonderen_aile: set[str] | None = None) -> dict[str, Any] | None:
    """Kurum kodu → sicil kaydı; serbest ad → sicile çözüm, çözülemezse doğrulanmamış künye.

    Gönderen ile AYNI KURUM AİLESİ (antetin üst kurumu/alt birimi, sicil üst kurumu; slug
    birebir eşitliği yetmez) alıcı olamaz: kurumun kendi işine dair gelen yazıyı yazana
    'devretmek' cevap vermemektir (ölçüldü: yazi_sgk_cevabi → Ankara SGK İl Md. devri)."""
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
    if ((gonderen.get("slug") and alici.get("slug") == gonderen["slug"])
            or ayni_aile(alici, gonderen_aile or set())):
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


def _birim_uygun(aday: dict[str, Any] | None, muhatap: dict[str, Any]) -> bool:
    """Seçilen birim gerçekten muhatabın İÇ birimi mi?

    Ret: (a) birim muhatap kurumun kendisi ('İl/İlçe Sağlık Müdürlüğü' → Ankara İl Sağlık
    Müdürlüğü; kurum kendine havale edemez), (b) birim sicilde AYRI bir kurum (merkez
    teşkilatı ya da kardeş il müdürlüğü; bu bir iç havale değil devirdir ve '(devir)' eki
    olmadan iç havale gibi görünürdü). Valilik/kaymakamlığın bağlı il müdürlükleri (sicilden,
    'bagli_kurulus') bilinçli istisnadır."""
    if not aday:
        return False
    if aday.get("kaynak_tipi") == "bagli_kurulus":
        return True
    ad = str(aday.get("birim_ad") or "")
    muhatap_aile = kurum_aile_anahtari(str(muhatap.get("ad") or ""))
    if muhatap_aile and kurum_aile_anahtari(ad) == muhatap_aile:
        return False
    kayit = kurum_ad_cozumle(ad)
    return not (kayit and kayit.get("slug") not in ("", muhatap.get("slug")))


def _bilgi_edinme_birimleri(birimler: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bilgi edinme başvurusunu usulen karşılayan birimler (ada göre; 'Bilgi İşlem' değil)."""
    return [b for b in birimler if _BILGI_EDINME_BIRIM.search(str(b.get("birim_ad") or ""))]


def _talep_icin_karar(
    t: dict, c: dict[str, Any], birimler: list[dict], kurumlar: list[dict],
    ctx: dict[str, Any],
) -> dict[str, Any]:
    """Tek talebin LLM cevabı → güvenlik ağından geçmiş talep kararı."""
    karar = str(c.get("karar") or "").upper()
    gerekce = str(c.get("gerekce") or "").strip()[:300]
    alici = None
    if karar == "YARGI" and not _dilekce_turu_mu(ctx.get("evrak_turu", "")):
        # 3071 m.6/b DİLEKÇEYE dair incelenemezlik kuralıdır; mahkeme müzekkeresi ya da kurum
        # yazısı muhataptan işlem/bilgi ister → cevap yükümlüsü muhataptır.
        karar = "ICERIDE"
        gerekce = (gerekce + " · Kurum/yargı yazısı dilekçe değildir; muhatap işlem "
                   "yapar (3071 m.6/b uygulanmaz).").strip(" ·")
    if karar == "DISARIDA":
        alici = yerel_tasra_tercih(
            _alici_kurum(c, kurumlar, ctx["gonderen"], ctx.get("gonderen_aile")), kurumlar)
        if alici is None and ctx.get("gonderen_aile") and _kurum_gonderen_mi(c, ctx):
            # Gelen kurum yazısında 'yetkili kurum = gönderen' → cevap yükümlüsü muhataptır.
            karar = "ICERIDE"
            gerekce = (gerekce + " · Gönderen kuruma devir yapılmaz; cevap yükümlüsü "
                       "muhatap kurumdur.").strip(" ·")
    aday = _kod(c.get("birim"), "B", birimler) if karar == "ICERIDE" else None
    if aday is not None and not _birim_uygun(aday, ctx["muhatap"]):
        log.info("route_ajan.birim_reddedildi", birim=aday.get("birim_ad"))
        aday = None
    dogru = karar == "ICERIDE" and _grounded(
        aday, f"{t['metin']} {ctx['konu']}", ctx["muhatap"], ctx["gonderen"])
    birim = _birim_kaydi(aday, dogru)
    if karar == "ICERIDE" and birim is None:
        birim = _yedek_birim(t, ctx)
    return talep_karari(t["id"], karar, alici_kurum=alici, birim=birim, gerekce=gerekce,
                        dayanak=ctx["dayanak"])


def _dilekce_turu_mu(evrak_turu: str) -> bool:
    """3071 kapsamındaki başvuru türü mü? (devir dayanağı 3071 olan türler — veriden)."""
    from agents.config import EVRAK_TO_DEVIR_DAYANAK

    return str(EVRAK_TO_DEVIR_DAYANAK.get(evrak_turu) or "").startswith("3071")


def _kurum_gonderen_mi(c: dict[str, Any], ctx: dict[str, Any]) -> bool:
    """LLM'in DISARIDA için gösterdiği kurum, gelen yazının gönderen ailesinden mi?"""
    k = _kod(c.get("kurum"), "K", ctx.get("tum_kurumlar") or [])
    ad = (k or {}).get("ad") or str(c.get("kurum_adi") or "")
    kayit = kurum_ad_cozumle(ad) or {}
    return bool(ad) and ayni_aile({"ad": ad, "slug": kayit.get("slug", "")},
                                  ctx.get("gonderen_aile") or set())


def _yedek_birim(t: dict, ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Model içeride dedi ama geçerli birim vermedi → deterministik öneri (doğrulanmamış)."""
    det = _deterministik_kararlar([t], ctx["muhatap"], ctx.get("arama", ""),
                                  ctx.get("evrak_turu", ""))
    return (det[0].get("birim") if det else None) or None


def _llm_kararlari(
    obj: dict[str, Any], talepler: list[dict], birimler: list[dict], kurumlar: list[dict],
    ctx: dict[str, Any],
) -> tuple[list[dict[str, Any]] | None, int]:
    """LLM çıktısı → (talep kararları, cevapsız talep sayısı). Hiç cevap yok → (None, n).

    Cevapsız talep BELIRSIZ olur ve sayısı döner: çağıran üretim yolunu 'llm_kismi' işaretler
    (otomatik havale kapanır — modelin karar vermediği talep memura düşer)."""
    cevaplar = {str(c.get("id")): c for c in (obj.get("talepler") or []) if isinstance(c, dict)}
    if not cevaplar:
        return None, len(talepler)
    sirali = list(cevaplar.values())
    # Sıra eşlemesi YALNIZ hiçbir kimlik tutmadığında (model id'leri yeniden adlandırdıysa);
    # aksi hâlde cevapsız talebe başka talebin cevabı yapışırdı.
    sira_ile = not any(t["id"] in cevaplar for t in talepler)
    out, cevapsiz = [], 0
    for i, t in enumerate(talepler):
        c = cevaplar.get(t["id"]) or (sirali[i] if sira_ile and i < len(sirali) else {})
        cevapsiz += not c
        out.append(_talep_icin_karar(t, c, birimler, kurumlar, ctx))
    return out, cevapsiz


_GUVEN_SIRASI = {"kurum_ozel": 0, "mevzuat_teskilat": 1, "aday": 2}


def _deterministik_kararlar(talepler: list[dict], muhatap: dict, arama: str,
                            evrak_turu: str = "") -> list[dict]:
    """Model yokken: her talep içeride varsayılır; birim = talebe eşleşen birimler içinde
    güveni en yüksek olanın en yakını (öneri). Yetki sorusu model olmadan yanıtlanmaz ve
    doğrulanmış birim üretilmez (BM25 sırası bir yargı değildir). Bilgi edinmede usul birimi
    (4982) skor beklemeden önce gelir — 'bilgi' sözcüğü BM25'i 'Bilgi İşlem'e çekiyordu."""
    out = []
    for t in talepler:
        sorgu = arama if len(talepler) == 1 else f"{t['metin']} {arama[:300]}"
        tumu = kurum_birimleri(muhatap.get("slug", ""), sorgu, tur=muhatap.get("tur", ""))
        usul = _bilgi_edinme_birimleri(tumu) if evrak_turu == "bilgi_edinme" else []
        adaylar = usul or [a for a in tumu if float(a.get("skor") or 0) > 0]
        sirali = sorted(adaylar, key=lambda a: (_GUVEN_SIRASI.get(a.get("kaynak_tipi"), 3),
                                                -float(a.get("skor") or 0)))
        en_iyi = next((a for a in sirali if _birim_uygun(a, muhatap)), None)
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


def antet_satirlari(evrak_text: str) -> list[str]:
    """Gelen resmî yazının antet satırları: 'T.C.'den sonra 'Sayı'ya kadar en çok 3 satır
    (üst kurum + alt birim). Gönderen kimliği yalnız ilk satır değildir: SGK yazısında
    'SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI / Ankara Sosyal Güvenlik İl Müdürlüğü'."""
    satirlar = [s.strip() for s in (evrak_text or "")[:800].splitlines() if s.strip()]
    tc = next((i for i, s in enumerate(satirlar[:4])
               if s.lower().replace(" ", "").startswith("t.c")), None)
    if tc is None:
        return []
    out = []
    for s in satirlar[tc + 1: tc + 4]:
        if re.match(r"(?i)^\s*(sayı|sayi|konu|tarih)\s*:", s):
            break
        out.append(s)
    return out


def _birim_secenekleri(muhatap: dict[str, Any], arama: str, kurumlar: list[dict[str, str]],
                       evrak_turu: str) -> list[dict[str, Any]]:
    """Muhatabın birim kapalı kümesi. Bilgi edinme başvurusunda (4982) usulen karşılayan
    birim(ler) varsa küme ONLARLA sınırlanır — konu birimi bilgiyi sağlar, başvuruyu
    karşılamaz (ölçüldü: Çankaya bilgi edinme → Fen İşleri; deterministik yedekte BM25
    'bilgi' sözcüğüyle 'Bilgi İşlem'e düşüyordu)."""
    birimler = kurum_birimleri(muhatap.get("slug", ""), arama, tur=muhatap.get("tur", ""))
    birimler += _bagli_birimler(muhatap, kurumlar)
    if evrak_turu == "bilgi_edinme":
        usul = _bilgi_edinme_birimleri(birimler)
        if usul:
            return usul
    return birimler


async def _llm_yolu(
    muhatap: dict[str, Any], masked: str, talepler: list[dict], birimler: list[dict],
    kurumlar: list[dict], ctx: dict[str, Any],
) -> tuple[list[dict[str, Any]] | None, dict[str, Any]]:
    """LLM kararı + üretim izi. Kesilip kurtarılan ya da kısmi cevap 'llm' sayılmaz →
    otomatik havale kapanır (yonlendirme._otomatik_havale_mi)."""
    once = len(llm_iz.toplanan_izler())
    obj = await _llm_karar(muhatap, masked, ctx["konu"], talepler, birimler, kurumlar, ctx)
    izler = llm_iz.toplanan_izler()[once:]
    kesik = any(iz.get("kesik") for iz in izler)
    kurtarildi = any(iz.get("kurtarildi") for iz in izler)
    kararlar, cevapsiz = (_llm_kararlari(obj, talepler, birimler, kurumlar, ctx)
                          if obj else (None, len(talepler)))
    yol = "deterministik" if kararlar is None else ("llm_kismi" if cevapsiz else "llm")
    return kararlar, {"yol": yol, "kesik": kesik, "kurtarildi": kurtarildi,
                      "yedege_dustu": kararlar is None, "cevapsiz_talep": cevapsiz}


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
    gonderen_aile = (gonderen_aileleri(gonderen, antet_satirlari(state.get("evrak_text", "")))
                     if gonderen.get("slug") else set())
    kurumlar = kurum_adaylari(muhatap, gonderen, gonderen_aile)
    birimler = _birim_secenekleri(muhatap, arama, kurumlar, state.get("evrak_turu", ""))
    ctx = {"muhatap": muhatap, "gonderen": gonderen, "konu": konu, "arama": arama,
           "gonderen_aile": gonderen_aile, "tum_kurumlar": kurumlar,
           "evrak_turu": state.get("evrak_turu", ""),
           "dayanak": devir_dayanagi(state.get("evrak_turu", ""))}

    kararlar, uretim = None, {"yol": "deterministik", "kesik": False, "yedege_dustu": False}
    if real_llm() is not None:
        kararlar, uretim = await _llm_yolu(muhatap, masked, talepler, birimler, kurumlar, ctx)
    if kararlar is None:
        # Modelsiz yolda talep bölünmesi yalnız ayrıştırıcıdan geliyorsa kullanılır; çıkarıcı
        # cümleleri tek başına BM25 sorgusu olarak gürültülüdür → belge bağlamıyla tek karar.
        det_talepler = talepler if kaynak in ("talep_kumesi", "alt_talepler") else talepler[:1]
        kararlar = _deterministik_kararlar(det_talepler, muhatap, arama,
                                           state.get("evrak_turu", ""))
    gerekce = _gerekce_metni(kararlar, uretim)
    yon = yonlendirme_kur(kararlar, gerekce=gerekce, uretim=uretim, dayanak=ctx["dayanak"])
    return await _cikti(state, det, yon, muhatap, gonderen, birimler, kaynak, konu, masked)


def _gerekce_metni(kararlar: list[dict[str, Any]], uretim: dict[str, Any]) -> str:
    parcalar = []
    for k in kararlar:
        hedef = ((k.get("alici_kurum") or {}).get("ad") or (k.get("birim") or {}).get("ad")
                 or ("yargı yolu (3071 m.6/b)" if k["karar"] == "YARGI" else "belirsiz"))
        parcalar.append(f"{k['talep_id']}: {k['karar']} → {hedef}"
                        + (f" — {k['gerekce']}" if k.get("gerekce") else ""))
    if uretim.get("cevapsiz_talep"):
        parcalar.append(f"Model {uretim['cevapsiz_talep']} talep için karar vermedi; "
                        "memur onayı gerekli.")
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
    if yon["karar"] not in ("DISARIDA", "YARGI") and hedef_slug and not korpus_var:
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
