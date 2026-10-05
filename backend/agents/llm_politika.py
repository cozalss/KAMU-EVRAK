"""LLM çağrı politikası — her çağrı noktasının bütçesi, düşünme ayarı ve kesilme davranışı TEK TABLODA.

NEDEN (teşhis 2026-10-05, docs/benchmark/teshis-2026-10-05.json "LLM altyapısının dayanıklılığı"):
Bütçe ve düşünme kararları 25 çağrı noktasına dağılmıştı; her biri kendi `max_tokens`'ını,
kendi düşünme bayrağını taşıyordu ve kesilmeyi yalnız biri (decompose) kurtarıyordu. Ölçülen
sonuç: route_ajan 5/15, yazi_plan 13/19, decompose 29/30 ilk denemede kesiliyor; eskalasyon
3/3 boş dönüyordu ve kimse görmüyordu. Bu modül politikayı veri olarak tek yerde tutar;
uygulama (`agents.nodes._llm_extract`) bu tabloyu okur.

KULLANIM (çağrı noktası):
    from agents.nodes._llm_extract import llm_json, llm_text
    obj = await llm_json(SYSTEM, user)                     # profil KOŞAN NODE'dan (NODE_PROFILI)
    obj = await llm_json(SYSTEM, user, gorev="yazi_plan")  # node içinde ikinci iş → kendi profili
    obj = await llm_json(SYSTEM, user, profil="route_ajan")          # açık profil (graf dışı)
    txt = await llm_text(SYSTEM, user, profil="yazi_govde", max_tokens=pay)  # dinamik bütçe ezer
    txt = await llm_text(..., kesik_kabul=True)  # yarım metin KesikMetin(.kesik=True) döner
    obj = await llm_json(..., llm=get_llm_for_model(M))    # belirli model (eskalasyon/hakem)
  Çözüm sırası: profil → gorev → graf node'u (graph._zamanli_node ContextVar'a koyar; tabloda
  olmayan node → graf_varsayilan) → graf dışı + profilsiz = SERBEST (eski anlam). Açıkça
  verilen max_tokens / dusunme_kapali / kesikte_dusunmesiz / timeout_s profilden ÖNCELİKLİ.
  Kesik (finish_reason=length ya da kapanmamış JSON) → TEK tekrar: düşünme kapalı + 2× bütçe;
  yine olmazsa None (yedek). llm_text yarım metni varsayılan olarak DÖNDÜRMEZ (None).
  İz: her çağrı agents.llm_iz'e {node, profil, deneme, kesik, kurtarildi, yedege_dustu,
  neden, sure_ms, tokens_*, onbellek} bırakır → state["llm_izleri"] (operator.add).

YENİ ÇAĞRI NOKTASI EKLERKEN: PROFILLER'e bir satır ekle (test_llm_politika her llm_json/llm_text
çağrısının bilinen bir profil adı taşıdığını AST ile doğrular). Düşünmeyi ACIK yapmak için
`gerekce` alanına ÖLÇÜMÜ yaz — gerekçesiz ACIK profil testte reddedilir.

DÜŞÜNME POLİTİKASI: varsayılan KAPALI. deepseek-v4-* reasoning modelinde düşünme token'ları
`max_tokens`'tan düşer; kapalı-küme seçim/çıkarım/biçim işinde ölçülebilir katkı vermeden
bütçeyi bitirip cevabı KESİYOR (ölçüm: düşünmesiz koşuda kararlar aynı, kesilme 0/30, süre
~6 sn → ~1,3 sn). Belirsiz girdide düşünme yakınsamıyor: 2500 token'da bile 3/10 kesildi.

ENV EZMELERİ (çağrı anında okunur; operatör kod değiştirmeden geri alabilir):
  LLM_DUSUNME_ACIK_NODELAR="route_ajan,yazi_plan"  → bu profillerde düşünme AÇIK
  LLM_DUSUNME_KAPALI_NODELAR="siniflandir_eskalasyon" → bu profillerde KAPALI (kapalı kazanır)
  Geriye uyumlu eski bayraklar (agents.config):
  LLM_DUSUNME_CIKARIMDA_KAPALI=0  → tüm profillerde düşünme AÇIK (2026-08 öncesi baseline)
  YAZI_GOVDE_DUSUNME_KAPALI=0     → yazi_govde düşünmeli
  DECOMPOSE_KESIKTE_DUSUNMESIZ=0  → decompose kesikte kurtarma yapmaz (doğrudan yedek)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from enum import StrEnum

from agents import config


class IsCinsi(StrEnum):
    """Çağrının yaptığı işin cinsi — düşünme kararının gerekçe dili."""

    CIKARIM = "cikarim"   # metinde geçeni bul, kapalı kümeden kod seç
    BICIM = "bicim"       # verilmiş kararı/gerçeği resmî cümleye dök
    YARGI = "yargi"       # adaylar arasında karar, yetki, doğrulama


class Dusunme(StrEnum):
    KAPALI = "kapali"
    ACIK = "acik"


class Kesikte(StrEnum):
    """Cevap bütçeye sığmadığında (finish_reason == "length") ne yapılır.

    DUSUNMESIZ_TEKRAR: TEK yeniden deneme — düşünme KAPALI ve cevap bütçesi 2 katı.
      "Düşünmeli + daha büyük bütçe" basamağı BİLEREK yok (ölçüm: 2500'de 3/10 yine kesik).
      Tekrar da kesilirse deterministik yedek (llm_text'te `kesik_kabul=True` ise yarım metin
      `KesikMetin` olarak döner).
    YEDEK: tekrar yok, doğrudan deterministik yedek (gecikmenin kaliteden önemli olduğu yer).
    """

    DUSUNMESIZ_TEKRAR = "dusunmesiz_tekrar"
    YEDEK = "yedek"


@dataclass(frozen=True, slots=True)
class CagriProfili:
    """Tek çağrı noktasının politikası (değişmez — ezme `dataclasses.replace` ile yeni nesne).

    cevap_butcesi: CEVABIN token tavanı. Düşünme ACIK ise istemciye `cevap_butcesi +
      dusunme_marji` gider; KAPALI ise yalnız cevap bütçesi (marj israf olurdu).
    dusunme_marji: None → config.LLM_DUSUNME_MARJI.
    timeout_s: None → _llm_extract.LLM_NODE_TIMEOUT_S (EVRAK_LLM_TIMEOUT_S).
    gerekce: ACIK düşünme ya da alışılmadık bütçe için ÖLÇÜM notu (denetlenebilirlik).
    """

    ad: str
    is_cinsi: IsCinsi
    cevap_butcesi: int
    dusunme: Dusunme = Dusunme.KAPALI
    kesikte: Kesikte = Kesikte.DUSUNMESIZ_TEKRAR
    timeout_s: float | None = None
    dusunme_marji: int | None = None
    gerekce: str = ""

    @property
    def dusunme_kapali(self) -> bool:
        return self.dusunme is Dusunme.KAPALI

    def istek_butcesi(self, *, gercek_istemci: bool) -> int:
        """İstemciye gönderilecek max_tokens. Mock'ta marj eklenmez (test determinizmi)."""
        if self.dusunme_kapali or not gercek_istemci:
            return self.cevap_butcesi
        marj = config.LLM_DUSUNME_MARJI if self.dusunme_marji is None else self.dusunme_marji
        return self.cevap_butcesi + max(0, marj)


_C, _B, _Y = IsCinsi.CIKARIM, IsCinsi.BICIM, IsCinsi.YARGI


def _p(ad: str, is_cinsi: IsCinsi, butce: int, **kw: object) -> CagriProfili:
    return CagriProfili(ad=ad, is_cinsi=is_cinsi, cevap_butcesi=butce, **kw)  # type: ignore[arg-type]


# Bütçeler CEVAP içindir (tavan; erken biten cevap bedel ödemez). Değerler: eski node bütçesi
# + düşünmesiz koşuda ölçülen çıktı (teşhis: decompose ort. 206, route_ajan 109-172, gövde
# 59-159 token) üstünde pay. Kesilirse merkez 2× bütçeyle bir kez daha dener.
PROFILLER: dict[str, CagriProfili] = {p.ad: p for p in (
    # --- Görev 1: anlama ---
    _p("siniflandir", _C, 300),
    _p("siniflandir_eskalasyon", _Y, 300, dusunme=Dusunme.ACIK, dusunme_marji=3000,
       timeout_s=config.ESKALASYON_TIMEOUT_S,
       gerekce="İkinci görüşün tek değeri güçlü modelin muhakemesi. Eski 400 token'lık "
               "toplam bütçe 3/3 boş döndü (v4-pro, tokens_out=400, içerik 0). Marj "
               "eskalasyon_marj_olcum ile ölçüldü (bkz. docs/benchmark); kesikte düşünmesiz "
               "tekrar cevabı garanti eder."),
    _p("cikar", _C, 700),
    _p("decompose", _C, 700,
       gerekce="Düşünmeli ilk çağrı 29/30 kesildi (ort. 6,2 sn), düşünmesiz kurtarma 29/29 "
               "başarılı (ort. 1,4 sn, 206 token) — ilk çağrı fiilen hiç kullanılmıyordu."),
    _p("eksik_tespit", _C, 500),
    _p("ozetle", _B, 450),
    # --- yönlendirme ---
    _p("route_ajan", _Y, 400,
       gerekce="Düşünmeli 15 çağrının 5'i kesildi (izin_meb 3/3); düşünmesiz 10/10 stop, "
               "0,9-1,6 sn; tamamlanan her vakada düşünmeli/düşünmesiz aynı birim."),
    _p("route_birim", _Y, 300),
    _p("servis_birim", _C, 250),
    # --- Görev 2: yazı ---
    _p("yazi_plan", _Y, 300,
       gerekce="Düşünmeli 19 çağrının 13'ü kesildi (yarım JSON); düşünmesiz A/B aynı tür + "
               "aynı muhatap."),
    _p("yazi_govde", _B, 400,
       gerekce="Düşünmeli koşumda üç gövdenin üçü de tavanda boş döndü (2026-08-07)."),
    _p("yazi_revize", _B, 4096),
    # --- doğrulama / risk / arşiv ---
    _p("verify_lint", _B, 1200),
    _p("verify_makam", _C, 60),
    _p("verify_grounding", _Y, 500),
    _p("risk_aciklama", _B, 400),
    _p("arsiv_sdp", _C, 250),
    # --- mevzuat ---
    _p("crag_grader", _Y, 200),
    _p("crag_rewrite", _C, 300),
    _p("mevzuat_dogrula", _Y, 120),
    _p("rerank", _Y, 240),
    # --- OCR ---
    _p("ocr_duzelt", _B, 8192),
    # --- sohbet (API) ---
    _p("sohbet_niyet", _C, 200),
    _p("sohbet_kompozisyon", _B, 400),
    _p("sohbet_arac", _Y, 300),
    # --- Bürokrasi Kurulu ---
    _p("kurul_acilis", _Y, 1600),
    _p("kurul_denetim", _Y, 7000,
       gerekce="2026-08-06: denetim turu düşünmeli koşumda 7700 tavanı tüketip kesildi."),
    _p("kurul_capraz", _Y, 7000, dusunme=Dusunme.ACIK,
       gerekce="Çapraz turda kurul gerçekten muhakeme eder (kim haklı, hangi itiraz taşır); "
               "2026-08-06 kurul ölçümünde düşünme bu turda bilerek açık bırakıldı."),
    # --- retrieval (hukuk RAG mirası) ---
    _p("hyde", _B, 200),
    _p("query_rewrite", _C, 120),
    _p("multi_query", _B, 400),
    # --- graf node'ları (LLM'i dolaylı/opsiyonel çağıranlar) ---
    _p("kanit_baglama", _C, 400),
    _p("clarifier", _B, 300),
    _p("self_rag", _Y, 300),
    _p("finalize", _B, 420),
    _p("graf_varsayilan", _C, 512),
    # --- eval ---
    _p("eval_judge", _Y, 512),
    _p("eval_uslup", _Y, 160),
)}

# Profil verilmeden (eski imza: max_tokens/dusunme_kapali) yapılan çağrıların adı.
SERBEST = "serbest"


# Graf node adı → profil adı. Profil verilmeden yapılan çağrı, o an koşan node'un (bkz.
# llm_iz.aktif_node, graph._zamanli_node) profilini alır. Bir node birden çok iş yapıyorsa
# çağrı noktası `gorev="<profil adı>"` ile daraltır. Tabloda olmayan graf node'u
# `graf_varsayilan`a düşer — graf içinde politikasız çağrı kalmaz.
NODE_PROFILI: dict[str, str] = {
    "siniflandir": "siniflandir", "cikar": "cikar", "decompose": "decompose",
    "kanit_baglama": "kanit_baglama", "eksik_tespit": "eksik_tespit", "ozetle": "ozetle",
    "mevzuat_oner": "rerank", "mevzuat_dogrula": "mevzuat_dogrula", "crag": "crag_grader",
    "route_birim": "route_ajan", "route_ajan": "route_ajan", "servis_birim": "servis_birim",
    "clarifier": "clarifier", "yazi_plan": "yazi_plan", "yazi_taslak": "yazi_govde",
    "verify": "verify_grounding", "risk_guard": "risk_aciklama", "self_rag": "self_rag",
    "arsiv": "arsiv_sdp", "finalize": "finalize",
}
GRAF_VARSAYILAN = "graf_varsayilan"


def _csv(ad: str) -> frozenset[str]:
    return frozenset(p.strip() for p in os.getenv(ad, "").split(",") if p.strip())


def _env_ezmeleri(p: CagriProfili) -> CagriProfili:
    """ENV/eski bayrak ezmeleri — çağrı anında okunur (monkeypatch ve canlı ENV çalışır)."""
    if not config.LLM_DUSUNME_CIKARIMDA_KAPALI:
        p = replace(p, dusunme=Dusunme.ACIK)
    if p.ad == "yazi_govde" and not config.YAZI_GOVDE_DUSUNME_KAPALI:
        p = replace(p, dusunme=Dusunme.ACIK)
    if p.ad == "decompose" and not config.DECOMPOSE_KESIKTE_DUSUNMESIZ:
        p = replace(p, kesikte=Kesikte.YEDEK)
    if p.ad in _csv("LLM_DUSUNME_ACIK_NODELAR"):
        p = replace(p, dusunme=Dusunme.ACIK)
    if p.ad in _csv("LLM_DUSUNME_KAPALI_NODELAR"):
        p = replace(p, dusunme=Dusunme.KAPALI)
    return p


def profil_al(ad: str) -> CagriProfili:
    """Profil adı → ENV ezmeleri uygulanmış profil. Bilinmeyen ad → KeyError (sessiz varsayılan
    YOK: yazım hatası bir çağrıyı fark edilmeden politikasız bırakmasın)."""
    return _env_ezmeleri(PROFILLER[ad])


def profil_coz(
    *, profil: str | None = None, gorev: str | None = None, node: str | None = None,
) -> CagriProfili | None:
    """Çağrının politikasını MERKEZDE çöz. Öncelik: açık `profil` (bilinmeyen → KeyError) →
    `gorev` (PROFILLER'de varsa) → koşan graf `node`'u (NODE_PROFILI, yoksa graf_varsayilan)
    → None (graf dışı, profilsiz çağrı: çağıran `serbest_profil` kullanır)."""
    if profil:
        return profil_al(profil)
    if gorev and gorev in PROFILLER:
        return profil_al(gorev)
    if node:
        return profil_al(NODE_PROFILI.get(node, GRAF_VARSAYILAN))
    return None


def serbest_profil(
    *, max_tokens: int, dusunme_kapali: bool, kesikte_dusunmesiz: bool | None,
) -> CagriProfili:
    """Eski imzalı çağrı (profilsiz) için geçici profil — eski anlam korunur: düşünme
    `dusunme_kapali` verilmedikçe AÇIK. Kesilme kurtarması artık herkes için varsayılan
    (teşhis ADIM 3); `kesikte_dusunmesiz=False` açıkça verilirse kapanır."""
    return CagriProfili(
        ad=SERBEST, is_cinsi=IsCinsi.CIKARIM, cevap_butcesi=max_tokens,
        dusunme=Dusunme.KAPALI if dusunme_kapali else Dusunme.ACIK,
        kesikte=(Kesikte.YEDEK if kesikte_dusunmesiz is False
                 else Kesikte.DUSUNMESIZ_TEKRAR),
    )


__all__ = ("GRAF_VARSAYILAN", "NODE_PROFILI", "PROFILLER", "SERBEST", "CagriProfili", "Dusunme", "IsCinsi", "Kesikte",
           "profil_al", "profil_coz", "serbest_profil")
