"""Görev-1 node'ları için paylaşılan LLM yardımcıları — JSON çağrısı + tolerant parse.

Strateji (CLAUDE.md v2.3 + multi_query.py deseni): `get_llm()` ile gerçek LLM
(LLM_MODE=openai/llamacpp), JSON-mode çıktı; LLM yok/mock/hata/timeout → çağıran
deterministik keyword+regex fallback'e düşer. Bu modül YALNIZ "LLM'i çağır + güvenli
JSON parse" sorumluluğunu taşır; her node kendi prompt'unu + fallback'ini sağlar.
Güçlendirme (2026-07): bozuk JSON'da geri-bildirimli TEK retry (config.LLM_JSON_RETRY)
+ süreç-içi LRU yanıt cache'i (config.LLM_CACHE_ENABLED) — ikisi de mock'ta devre dışı,
fallback sözleşmesi birebir korunur.

MockLLM json_mode'da {"domain": ..., "confidence": ..., "reasoning": ...} döndürür
(llm_mock._mock_json_response default'u) — node'lar bu şemayı tanımadığında fallback'e
düşer, böylece anahtarsız demo deterministik kalır.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import os
import re
import time
from collections import OrderedDict
from dataclasses import replace
from typing import Any, NamedTuple

import httpx
import structlog

from agents import config, llm_iz
from agents.llm import ChatMessage, MockLLM, get_llm
from agents.llm_politika import CagriProfili, Dusunme, Kesikte, profil_coz, serbest_profil

log = structlog.get_logger()

# LLM çağrısı bütçesi — node başına; aşılırsa fallback (demo asla asılı kalmaz).
LLM_NODE_TIMEOUT_S = float(os.getenv("EVRAK_LLM_TIMEOUT_S", "20.0"))

# multi_query.py deseni: yalnız geçici/altyapı hatalarında fallback; gerçek
# bug'lar (TypeError vb.) yutulmaz, CancelledError propagate eder.
_LLM_FALLBACK_EXCEPTIONS = (
    asyncio.TimeoutError,
    httpx.HTTPError,
    ConnectionError,
    ValueError,        # boş choices / parse-öncesi LLM hataları
    RuntimeError,      # anahtarsız openai → require_api_key, SSE sınırı vb.
)

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def parse_json_object(raw: str) -> dict[str, Any] | None:
    """LLM çıktısından ilk JSON nesnesini tolerant şekilde çıkar (markdown fence + gömülü {}).

    Geçersiz/boş → None (çağıran fallback'e düşer). multi_query._parse_json_paraphrases
    deseniyle tutarlı, ama generic nesne döndürür (paraphrase listesine bağlı değil).
    """
    if not raw:
        return None
    cleaned = _JSON_FENCE_RE.sub("", raw).strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        first, last = cleaned.find("{"), cleaned.rfind("}")
        if first == -1 or last <= first:
            return None
        try:
            obj = json.loads(cleaned[first : last + 1])
        except json.JSONDecodeError:
            return None
    return obj if isinstance(obj, dict) else None


# --- Süreç-içi LRU yanıt cache'i (config.LLM_CACHE_ENABLED) -------------------
# Neden: demo'da aynı örneğe ikinci tıklama ağ turu ödemesin (temp-0 çağrılar
# deterministik — yeniden sormak bilgi katmaz). Anahtar sha256(tür+model+system+
# user+max_tokens); 'tür' (json|text) aynı prompt'un JSON ve serbest-metin
# sonuçlarının birbirine karışmasını önler. Mock modda devre dışı (mock zaten
# anlık + mevcut çağrı-sayısı davranışı birebir korunur).
_yanit_cache: OrderedDict[str, Any] = OrderedDict()


def _model_kimligi(llm: Any) -> str:
    """Cache anahtarı için model kimliği — client tipine göre en spesifik alan."""
    for alan in ("model", "model_name", "model_path"):
        deger = getattr(llm, alan, None)
        if deger:
            return str(deger)
    return type(llm).__name__


def _cache_anahtari(tur: str, llm: Any, system: str, user: str, max_tokens: int,
                    *, dusunme_kapali: bool = False, temperature: float = 0.0) -> str:
    """Yanıt önbelleği anahtarı.

    `dusunme_kapali` ve `temperature` anahtara DAHİLDİR: ikisi de aynı prompt'tan FARKLI
    cevap üretir. Bunlar anahtarda yokken düşünme ayarını A/B ölçerken eski cevap servis
    ediliyor ve ölçüm sessizce yanlış çıkıyordu (gecikme denetimi bulgusu, 7 Ağu 2026) —
    yani hatanın bedeli yanlış bir performans sonucuna inanmaktı, çökme değil.
    """
    h = hashlib.sha256()
    for parca in (tur, _model_kimligi(llm), system, user, str(max_tokens),
                  "dk1" if dusunme_kapali else "dk0", f"{temperature:.3f}"):
        h.update(parca.encode("utf-8"))
        h.update(b"\x1f")  # alan ayracı — birleştirme çakışmalarını önler
    return h.hexdigest()


def _cache_al(anahtar: str) -> Any | None:
    deger = _yanit_cache.get(anahtar)
    if deger is not None:
        _yanit_cache.move_to_end(anahtar)  # LRU: isabet girdiyi tazeler
    return deger


def _cache_koy(anahtar: str, deger: Any) -> None:
    _yanit_cache[anahtar] = deger
    _yanit_cache.move_to_end(anahtar)
    kapasite = max(1, int(config.LLM_CACHE_BOYUT))
    while len(_yanit_cache) > kapasite:
        _yanit_cache.popitem(last=False)  # en eski tahliye


def cache_temizle() -> None:
    """Yanıt cache'ini boşalt — test izolasyonu + model/ENV değişiminde tazeleme."""
    _yanit_cache.clear()


def dusunme_marjli(llm: Any, max_tokens: int) -> int:
    """Cevap bütçesine düşünme marjını ekle (gerçek istemci) — mock'ta bütçe aynen kalır.

    Reasoning modellerinde (deepseek-v4-*) düşünme token'ları da `max_tokens`'tan düşer;
    dar cevap bütçesi tek başına gönderilirse içerik BOŞ döner ve çağıran sessizce
    deterministik yedeğe düşer. Mock'ta eklenmez → test determinizmi korunur.

    AKIŞ (chat_stream) yolları da bunu KULLANMALI: canlı ölçümde sesli sohbetin SSE
    kompozisyonu marjsız çağırıyordu, 150 token'lık sesli bütçe düşünmeye gidiyor ve her
    veri sorusu markdown şablona düşüyordu (sesli okununca tam da istenmeyen robotik cevap).
    """
    return max_tokens + (0 if isinstance(llm, MockLLM) else config.LLM_DUSUNME_MARJI)


class CagriSonucu(NamedTuple):
    """Tek LLM çağrısının sonucu — metin YETMİYOR, bitiş sebebi de gerekiyor.

    `kesik=True` (finish_reason == "length") demek: model bütçeyi doldurdu ve cevabı
    TAMAMLAYAMADI. Bu, "bozuk JSON üretti"den TAMAMEN farklı bir başarısızlıktır ve farklı
    davranış ister — bkz. llm_json'daki kurtarma kararı. Token alanları iz kaydı içindir.
    """
    metin: str
    kesik: bool
    tokens_in: int = 0
    tokens_out: int = 0
    reasoning_tokens: int = 0


class KesikMetin(str):
    """Bütçeye sığmayıp yarım kalmış serbest metin (`llm_text(..., kesik_kabul=True)`).

    `str` alt sınıfıdır (eski çağıran kırılmaz) ama `kesik` bayrağı taşır: resmî yazı gövdesi
    gibi yarım hâli kullanılamayacak yerler `getattr(txt, "kesik", False)` ile ayırt eder.
    """

    kesik = True


def _reasoning_tokens(resp: Any) -> int:
    raw = getattr(resp, "raw", None)
    if not isinstance(raw, dict):
        return 0
    detay = (raw.get("usage") or {}).get("completion_tokens_details") or {}
    return int(detay.get("reasoning_tokens") or 0) if isinstance(detay, dict) else 0


async def _chat_dene(
    llm: Any,
    messages: list[ChatMessage],
    *,
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    json_mode: bool,
    dusunme_kapali: bool = False,
    marj: int | None = None,
) -> CagriSonucu | None:
    """Tek LLM çağrısı — geçici/altyapı hatası → None (çağıran fallback'e düşer).

    `max_tokens` CEVAP bütçesidir. Düşünme açıksa düşünme marjı eklenir (bkz. dusunme_marjli;
    `marj` verilirse o kullanılır); `dusunme_kapali=True` ise düşünme token'ı üretilmez,
    marj israf olurdu → eklenmez.

    Dönüş metin DEĞİL CagriSonucu: çağıranın "cevap kesildi mi" bilgisine ihtiyacı var,
    yoksa kesilmiş bir cevaba bozuk-JSON muamelesi yapıp aynı bütçeyle boşuna yeniden
    soruyor (ölçüldü: iki node'da 4/4 başarısız retry, ~21 sn).
    """
    if dusunme_kapali:
        butce = max_tokens
    elif marj is not None and not isinstance(llm, MockLLM):
        butce = max_tokens + max(0, marj)
    else:
        butce = dusunme_marjli(llm, max_tokens)
    # `dusunme_kapali` YALNIZ istendiğinde geçirilir: parametre LLMClient protokolüne yeni
    # eklendi ve testlerdeki/üçüncü-taraf sahte istemcilerin `chat()` imzası onu tanımayabilir.
    # Koşulsuz göndermek çalışan her istemciyi TypeError'la kırardı (ölçüldü: 174 test).
    ek = {"dusunme_kapali": True} if dusunme_kapali else {}
    temel = {"messages": messages, "temperature": temperature,
             "max_tokens": butce, "json_mode": json_mode}
    try:
        try:
            resp = await asyncio.wait_for(llm.chat(**temel, **ek), timeout=timeout_s)
        except TypeError:
            # İstemci düşünme-kapatmayı tanımıyor → özelliksiz (düşünmeli) yol yine çalışsın.
            log.debug("evrak_llm_dusunme_kapali_desteklenmiyor")
            resp = await asyncio.wait_for(llm.chat(**temel), timeout=timeout_s)
    except _LLM_FALLBACK_EXCEPTIONS as exc:
        log.warning("evrak_llm_failed_fallback", error=str(exc) or type(exc).__name__,
                    exc_type=type(exc).__name__, node=llm_iz.aktif_node(),
                    profil=llm_iz.aktif_profil())
        return None
    # getattr: sahte/üçüncü-taraf istemciler finish_reason taşımayabilir → kesik değil say.
    return CagriSonucu(
        resp.content or "", getattr(resp, "finish_reason", "stop") == "length",
        int(getattr(resp, "tokens_in", 0) or 0), int(getattr(resp, "tokens_out", 0) or 0),
        _reasoning_tokens(resp))


# Retry düzeltme mesajı — önceki ham cevapla birlikte gönderilir (geri-bildirimli).
_RETRY_DUZELTME = (
    "Önceki cevabın geçerli JSON değildi. YALNIZ istenen şemadaki geçerli JSON "
    "nesnesini döndür; açıklama, markdown veya ek metin yazma."
)


def _kesik_json_mu(raw: str) -> bool:
    """finish_reason söylemese de yarım kalmış JSON (açılan süslü parantez kapanmamış)."""
    t = _JSON_FENCE_RE.sub("", raw).strip()
    return t.startswith("{") and t.count("{") > t.count("}")


def _politika(
    profil: str | None, gorev: str | None, *, max_tokens: int | None,
    dusunme_kapali: bool | None, kesikte_dusunmesiz: bool | None, varsayilan_butce: int,
) -> CagriProfili:
    """Merkezi profil çözümü + AÇIK parametre ezmeleri (açık parametre profilden önceliklidir:
    eski imzayla yazılmış çağrı noktaları birebir aynı bütçe/düşünme ile çalışır)."""
    p = profil_coz(profil=profil, gorev=gorev, node=llm_iz.aktif_node())
    if p is None:
        return serbest_profil(max_tokens=max_tokens or varsayilan_butce,
                              dusunme_kapali=bool(dusunme_kapali),
                              kesikte_dusunmesiz=kesikte_dusunmesiz)
    if max_tokens is not None:
        p = replace(p, cevap_butcesi=max_tokens)
    if dusunme_kapali is not None:
        p = replace(p, dusunme=Dusunme.KAPALI if dusunme_kapali else Dusunme.ACIK)
    if kesikte_dusunmesiz is not None:
        p = replace(p, kesikte=(Kesikte.DUSUNMESIZ_TEKRAR if kesikte_dusunmesiz
                                else Kesikte.YEDEK))
    return p


class _Iz:
    """Tek merkezi çağrının iz kaydı (KVKK: içerik YOK — yalnız ad/sayı/bayrak)."""

    def __init__(self, p: CagriProfili) -> None:
        self.p = p
        self.t0 = time.perf_counter()
        self.deneme = 0
        self.kesik = False
        self.tokens = [0, 0, 0]

    def ekle(self, s: CagriSonucu | None) -> None:
        self.deneme += 1
        if s is not None:
            self.tokens = [a + b for a, b in zip(
                self.tokens, (s.tokens_in, s.tokens_out, s.reasoning_tokens), strict=True)]

    def bitir(self, *, basarili: bool, neden: str = "", onbellek: bool = False) -> None:
        kurtarildi = basarili and self.kesik and not neden
        if not basarili:
            log.warning("evrak_llm_yedege_dustu", node=llm_iz.aktif_node(), profil=self.p.ad,
                        neden=neden, kesik=self.kesik, deneme=self.deneme)
        elif kurtarildi:
            log.info("evrak_llm_kesik_kurtarildi", node=llm_iz.aktif_node(), profil=self.p.ad)
        llm_iz.iz_ekle({
            "profil": self.p.ad, "deneme": self.deneme, "kesik": self.kesik,
            "kurtarildi": kurtarildi, "yedege_dustu": not basarili, "neden": neden or None,
            "sure_ms": round((time.perf_counter() - self.t0) * 1000),
            "tokens_in": self.tokens[0], "tokens_out": self.tokens[1],
            "reasoning_tokens": self.tokens[2], "onbellek": onbellek,
        })


async def _kurtarma_cagrisi(
    llm: Any, messages: list[ChatMessage], p: CagriProfili, iz: _Iz, *,
    temperature: float, timeout_s: float, json_mode: bool,
) -> CagriSonucu | None:
    """Kesik cevabın TEK kurtarma denemesi: düşünme KAPALI + 2× cevap bütçesi.

    Düzeltme mesajı EKLENMEZ: cevap bozuk değil yarım kalmış; ek mesaj prompt'u uzatıp
    cevap alanını daha da daraltırdı (ölçüldü: tokens_in 714 -> 775)."""
    s2 = await _chat_dene(llm, messages, max_tokens=p.cevap_butcesi * 2,
                          temperature=temperature, timeout_s=timeout_s,
                          json_mode=json_mode, dusunme_kapali=True)
    iz.ekle(s2)
    return s2


async def llm_json(
    system: str,
    user: str,
    *,
    profil: str | None = None,
    gorev: str | None = None,
    max_tokens: int | None = None,
    temperature: float = 0.0,
    timeout_s: float | None = None,
    dusunme_kapali: bool | None = None,
    kesikte_dusunmesiz: bool | None = None,
    llm: Any = None,
) -> dict[str, Any] | None:
    """LLM'i JSON-mode'da çağır, tolerant parse et. Hata/timeout/parse-fail → None
    (çağıran node deterministik fallback'ine düşer — anahtarsız demo çalışır).

    POLİTİKA (agents.llm_politika): bütçe/düşünme/kesik davranışı `profil` adından, o yoksa
    `gorev` etiketinden, o da yoksa KOŞAN GRAF NODE'unun adından (NODE_PROFILI) çözülür.
    Açıkça verilen `max_tokens`/`dusunme_kapali`/`kesikte_dusunmesiz`/`timeout_s` profilden
    ÖNCELİKLİDİR (eski imza birebir çalışır). Graf dışı + profilsiz çağrı eski anlamı korur
    (düşünme `dusunme_kapali` verilmedikçe açık). `llm`: belirli istemci (eskalasyon/hakem
    modeli); verilmezse `get_llm()`.

    ÜÇ AYRI BAŞARISIZLIK, ÜÇ AYRI DAVRANIŞ:
      · KESİK (finish_reason=="length" ya da kapanmamış JSON) → bütçe sorunu; profil
        DUSUNMESIZ_TEKRAR ise TEK tekrar: düşünme kapalı + 2× cevap bütçesi. YEDEK → None.
      · DOLU AMA BOZUK  → geri-bildirimli biçim retry'ı (config.LLM_JSON_RETRY).
      · BOŞ ve KESİK DEĞİL → kurtarma yok, deterministik yedek.
    Her çağrı `llm_iz`'e iz bırakır; yedeğe düşüş WARNING olarak loglanır. Başarılı sonuç
    LRU cache'e yazılır. Mock'ta retry/kurtarma/cache devre dışı (mock deterministiktir).
    """
    p = _politika(profil, gorev, max_tokens=max_tokens, dusunme_kapali=dusunme_kapali,
                  kesikte_dusunmesiz=kesikte_dusunmesiz, varsayilan_butce=512)
    llm = llm if llm is not None else get_llm()
    with llm_iz.profil_kapsami(p.ad):
        return await _llm_json_cagir(
            llm, p, system, user, temperature=temperature,
            timeout_s=timeout_s or p.timeout_s or LLM_NODE_TIMEOUT_S)


async def _llm_json_cagir(
    llm: Any, p: CagriProfili, system: str, user: str, *,
    temperature: float, timeout_s: float,
) -> dict[str, Any] | None:
    mock = isinstance(llm, MockLLM)
    iz = _Iz(p)
    anahtar = (
        _cache_anahtari("json", llm, system, user, p.cevap_butcesi,
                        dusunme_kapali=p.dusunme_kapali, temperature=temperature)
        if config.LLM_CACHE_ENABLED and not mock else None
    )
    if anahtar is not None and (onbellek := _cache_al(anahtar)) is not None:
        iz.bitir(basarili=True, onbellek=True)
        return copy.deepcopy(onbellek)  # kopya — çağıran mutasyonu cache'i kirletmesin
    messages = [ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user)]
    sonuc = await _chat_dene(llm, messages, max_tokens=p.cevap_butcesi,
                             temperature=temperature, timeout_s=timeout_s, json_mode=True,
                             dusunme_kapali=p.dusunme_kapali, marj=p.dusunme_marji)
    iz.ekle(sonuc)
    if sonuc is None:
        iz.bitir(basarili=False, neden="hata")
        return None
    raw = sonuc.metin
    obj = parse_json_object(raw)
    iz.kesik = obj is None and (sonuc.kesik or _kesik_json_mu(raw))
    retry_hakli = bool(raw.strip()) and not iz.kesik
    yeniden = config.LLM_JSON_RETRY and not mock
    if iz.kesik and yeniden and p.kesikte is Kesikte.DUSUNMESIZ_TEKRAR:
        s2 = await _kurtarma_cagrisi(llm, messages, p, iz, temperature=temperature,
                                     timeout_s=timeout_s, json_mode=True)
        obj = parse_json_object(s2.metin) if s2 is not None else None
    elif obj is None and yeniden and not iz.kesik and (
            retry_hakli or not config.LLM_RETRY_SADECE_BOZUK):
        retry_msgs = [*messages, ChatMessage(role="assistant", content=raw),
                      ChatMessage(role="user", content=_RETRY_DUZELTME)]
        s2 = await _chat_dene(llm, retry_msgs, max_tokens=p.cevap_butcesi,
                              temperature=temperature, timeout_s=timeout_s, json_mode=True,
                              dusunme_kapali=p.dusunme_kapali, marj=p.dusunme_marji)
        iz.ekle(s2)
        obj = parse_json_object(s2.metin) if s2 is not None else None
    if obj is None:
        # raw LOGA YAZILMAZ (cikar/siniflandir yanıtı kişisel alan taşır) — yalnız sebep.
        iz.bitir(basarili=False,
                 neden="kesik" if iz.kesik else ("bos" if not raw.strip() else "bozuk_json"))
        return None
    iz.bitir(basarili=True)
    if anahtar is not None:
        _cache_koy(anahtar, copy.deepcopy(obj))  # kopya sakla — dönen nesne serbest
    return obj


def real_llm() -> Any | None:
    """GERÇEK LLM client (DeepSeek/yerel); MockLLM veya yoksa None.

    None dönerse node deterministik mantığını kullanır. Özellikle serbest-metin
    node'larında (finalize) MockLLM jenerik metin döndürür ve anahtarsız/mock demoyu
    bozardı — bu yüzden mock modda LLM yolu HİÇ açılmaz (testler deterministik kalır).
    """
    llm = get_llm()
    return None if isinstance(llm, MockLLM) else llm


async def llm_text(
    system: str,
    user: str,
    *,
    profil: str | None = None,
    gorev: str | None = None,
    max_tokens: int | None = None,
    temperature: float = 0.2,
    timeout_s: float | None = None,
    dusunme_kapali: bool | None = None,
    kesikte_dusunmesiz: bool | None = None,
    kesik_kabul: bool = False,
    llm: Any = None,
) -> str | None:
    """LLM'i SERBEST METİN modunda çağır (JSON değil). Mock/hata/timeout/boş → None.

    Politika çözümü llm_json ile aynıdır (profil → gorev → koşan node → serbest).
    KESİK (finish_reason=="length"): profil DUSUNMESIZ_TEKRAR ise TEK tekrar (düşünme
    kapalı, 2× bütçe). Yine kesikse VARSAYILAN None — yarım metin (ör. yarım resmî yazı
    gövdesi) asla sessizce tam metin gibi dönmez. `kesik_kabul=True` verilirse yarım metin
    `KesikMetin` (str alt sınıfı, `.kesik=True`) olarak döner; çağıran karar verir.
    """
    p = _politika(profil, gorev, max_tokens=max_tokens, dusunme_kapali=dusunme_kapali,
                  kesikte_dusunmesiz=kesikte_dusunmesiz, varsayilan_butce=420)
    llm = llm if llm is not None else real_llm()
    if llm is None or isinstance(llm, MockLLM):
        return None
    with llm_iz.profil_kapsami(p.ad):
        return await _llm_text_cagir(
            llm, p, system, user, temperature=temperature, kesik_kabul=kesik_kabul,
            timeout_s=timeout_s or p.timeout_s or LLM_NODE_TIMEOUT_S)


async def _llm_text_cagir(
    llm: Any, p: CagriProfili, system: str, user: str, *,
    temperature: float, timeout_s: float, kesik_kabul: bool,
) -> str | None:
    iz = _Iz(p)
    anahtar = (
        _cache_anahtari("text", llm, system, user, p.cevap_butcesi,
                        dusunme_kapali=p.dusunme_kapali, temperature=temperature)
        if config.LLM_CACHE_ENABLED else None
    )
    if anahtar is not None and (onbellek := _cache_al(anahtar)) is not None:
        iz.bitir(basarili=True, onbellek=True)
        return onbellek  # str immutable — kopya gerekmez
    messages = [ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user)]
    sonuc = await _chat_dene(llm, messages, max_tokens=p.cevap_butcesi,
                             temperature=temperature, timeout_s=timeout_s, json_mode=False,
                             dusunme_kapali=p.dusunme_kapali, marj=p.dusunme_marji)
    iz.ekle(sonuc)
    if sonuc is None:
        iz.bitir(basarili=False, neden="hata")
        return None
    iz.kesik = sonuc.kesik
    if sonuc.kesik and p.kesikte is Kesikte.DUSUNMESIZ_TEKRAR:
        s2 = await _kurtarma_cagrisi(llm, messages, p, iz, temperature=temperature,
                                     timeout_s=timeout_s, json_mode=False)
        if s2 is not None and (s2.metin.strip() or not sonuc.metin.strip()):
            sonuc = s2
    txt = sonuc.metin.strip()
    if not txt or sonuc.kesik:
        iz.bitir(basarili=bool(txt) and kesik_kabul, neden="kesik" if sonuc.kesik else "bos")
        return KesikMetin(txt) if txt and kesik_kabul else None
    iz.bitir(basarili=True)
    if anahtar is not None:
        _cache_koy(anahtar, txt)
    return txt


__all__ = ("LLM_NODE_TIMEOUT_S", "CagriSonucu", "KesikMetin", "cache_temizle", "llm_json",
           "llm_text", "parse_json_object", "real_llm")
