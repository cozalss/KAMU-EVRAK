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
from collections import OrderedDict
from typing import Any, NamedTuple

import httpx
import structlog

from agents import config
from agents.llm import ChatMessage, MockLLM, get_llm

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
    davranış ister — bkz. llm_json'daki retry kararı.
    """
    metin: str
    kesik: bool


async def _chat_dene(
    llm: Any,
    messages: list[ChatMessage],
    *,
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    json_mode: bool,
    dusunme_kapali: bool = False,
) -> CagriSonucu | None:
    """Tek LLM çağrısı — geçici/altyapı hatası → None (çağıran fallback'e düşer).

    Bütçeye düşünme marjı eklenir — bkz. dusunme_marjli. `dusunme_kapali=True` ise marj da
    gereksizdir (düşünme token'ı üretilmez) ama zararsız olduğu için tek kod yolu korunur.

    Dönüş metin DEĞİL CagriSonucu: çağıranın "cevap kesildi mi" bilgisine ihtiyacı var,
    yoksa kesilmiş bir cevaba bozuk-JSON muamelesi yapıp aynı bütçeyle boşuna yeniden
    soruyor (ölçüldü: iki node'da 4/4 başarısız retry, ~21 sn).
    """
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
                    exc_type=type(exc).__name__)
        return None
    # getattr: sahte/üçüncü-taraf istemciler finish_reason taşımayabilir → kesik değil say.
    return CagriSonucu(resp.content, getattr(resp, "finish_reason", "stop") == "length")


# Retry düzeltme mesajı — önceki ham cevapla birlikte gönderilir (geri-bildirimli).
_RETRY_DUZELTME = (
    "Önceki cevabın geçerli JSON değildi. YALNIZ istenen şemadaki geçerli JSON "
    "nesnesini döndür; açıklama, markdown veya ek metin yazma."
)


async def llm_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 512,
    temperature: float = 0.0,
    timeout_s: float = LLM_NODE_TIMEOUT_S,
    dusunme_kapali: bool = False,
    kesikte_dusunmesiz: bool = False,
) -> dict[str, Any] | None:
    """LLM'i JSON-mode'da çağır, tolerant parse et. Hata/timeout/parse-fail → None
    (çağıran node deterministik fallback'ine düşer — anahtarsız demo çalışır).

    İKİ AYRI BAŞARISIZLIK, İKİ AYRI KURTARMA (ölçülerek ayrıldı, 7 Ağu 2026):
      · DOLU AMA BOZUK  → geri-bildirimli retry (config.LLM_JSON_RETRY). Asıl işi buydu:
        model JSON'u markdown/açıklamayla sarmışsa ikinci şans verir.
      · KESİK (finish_reason=="length") → biçim sorunu DEĞİL bütçe sorunu; düşünme
        token'ları cevaba yer bırakmamıştır. Aynı bütçeyle tekrar sormak yazı-tura
        (ölçüldü: 4 denemenin 3'ü yine kesildi, ~11 sn/deneme). `kesikte_dusunmesiz=True`
        verilirse tek seferlik DÜŞÜNMESİZ yeniden çağrı yapılır — bütçenin tamamı cevaba
        kalır, kurtarma güvenilir olur ve ~3 sn'ye iner. Opt-in: yalnız ÇIKARIM işlerinde
        uygundur (bkz. config.LLM_DUSUNME_CIKARIMDA_KAPALI taksonomisi).
      · BOŞ ve KESİK DEĞİL → kurtarma yok, deterministik yedek.

    Başarılı sonuç LRU cache'e yazılır (config.LLM_CACHE_ENABLED). Mock'ta retry ve cache
    devre dışı — mock deterministiktir: retry aynı cevabı verir, cache çağrı sayısını
    değiştirirdi.

    `dusunme_kapali=True` (DeepSeek v4): gerçekleri HAZIR alan, muhakemeden çok biçim
    isteyen çağrılar için düşünmeyi kapatır — reasoning modelinde düşünme token'ları
    çıktı bütçesini yiyip yanıtı KESEBİLİYOR (kurul denetim turunda ölçüldü).
    """
    llm = get_llm()
    mock = isinstance(llm, MockLLM)
    anahtar = (
        _cache_anahtari("json", llm, system, user, max_tokens,
                        dusunme_kapali=dusunme_kapali, temperature=temperature)
        if config.LLM_CACHE_ENABLED and not mock else None
    )
    if anahtar is not None:
        onbellek = _cache_al(anahtar)
        if onbellek is not None:
            return copy.deepcopy(onbellek)  # kopya — çağıran mutasyonu cache'i kirletmesin
    messages = [
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=user),
    ]
    sonuc = await _chat_dene(llm, messages, max_tokens=max_tokens, temperature=temperature,
                             timeout_s=timeout_s, json_mode=True, dusunme_kapali=dusunme_kapali)
    if sonuc is None:
        return None
    raw = sonuc.metin
    obj = parse_json_object(raw)
    # RETRY YALNIZ "DOLU AMA BOZUK" CEVAP İÇİN (ölçüm bulgusu, 7 Ağu 2026).
    # Retry'ın işi, modelin JSON'u markdown/açıklamayla sarmasını kurtarmaktır. Cevap BOŞ ya
    # da KESİK (finish_reason=="length") ise sorun biçim değil BÜTÇEDİR: reasoning modelinde
    # düşünme token'ları çıktı bütçesini yiyip cevabı bitirmeye yer bırakmamıştır. Aynı
    # max_tokens ve aynı temperature ile tekrar sormak mekanik olarak aynı sonucu verir —
    # üstelik retry mesajı prompt'u uzatıp cevap alanını DAHA DA daraltır.
    # Ölçüldü: decompose + route_ajan'da 4/4 retry başarısız, boşuna ~21 sn.
    # Kaybedilen yetenek yok: bozuk-JSON kurtarması aynen duruyor.
    retry_hakli = bool(raw.strip()) and not sonuc.kesik
    # KESİLMİŞ CEVABIN KURTARILMASI — bütçe sorununu bütçeyle çöz, biçim mesajıyla değil.
    # Ölçüldü (A/B, 7 Ağu 2026): eski kod kesilmiş cevapta aynı bütçeyle yeniden soruyordu ve
    # 4 denemenin 3'ü yine kesildi; 1'i şans eseri tuttu. Yani kurtarma vardı ama YAZI TURA'ydı
    # ve her seferinde ~11 sn'ye mal oluyordu. Düşünme kapatılınca bütçenin tamamı cevaba
    # kalır: kurtarma güvenilir olur ve ~3 sn'ye iner.
    # OPT-IN, ÇAĞRI NOKTASI BAZINDA: yalnız ÇIKARIM işleri (kapalı-küme seçim, metinde geçeni
    # bulma) bunu ister. YARGI işlerinde (route_ajan'ın yetki-içeride/dışarıda kararı)
    # düşünme kapatmak kalite riskidir ve orada deterministik yol zaten ölçülmüş üstündür
    # (Top-1 0,907) — bu yüzden varsayılan KAPALI.
    kesik_kurtarma = (
        obj is None and sonuc.kesik and kesikte_dusunmesiz and not dusunme_kapali
        and config.LLM_JSON_RETRY and not mock
    )
    if kesik_kurtarma:
        # Düzeltme mesajı EKLENMEZ: cevap bozuk değil yarım kalmış; ek mesaj prompt'u uzatıp
        # cevap alanını daha da daraltırdı (ölçüldü: tokens_in 714 -> 775).
        sonuc2 = await _chat_dene(llm, messages, max_tokens=max_tokens,
                                  temperature=temperature, timeout_s=timeout_s,
                                  json_mode=True, dusunme_kapali=True)
        obj = parse_json_object(sonuc2.metin) if sonuc2 is not None else None
        log.debug("evrak_llm_kesik_kurtarma", basarili=obj is not None)
    elif obj is None and config.LLM_JSON_RETRY and not mock and (
            retry_hakli or not config.LLM_RETRY_SADECE_BOZUK):
        retry_msgs = [
            *messages,
            ChatMessage(role="assistant", content=raw),
            ChatMessage(role="user", content=_RETRY_DUZELTME),
        ]
        sonuc2 = await _chat_dene(llm, retry_msgs, max_tokens=max_tokens,
                                  temperature=temperature, timeout_s=timeout_s,
                                  json_mode=True, dusunme_kapali=dusunme_kapali)
        obj = parse_json_object(sonuc2.metin) if sonuc2 is not None else None
    if obj is None:
        # `bos`/`kesik`: başarısızlığın SEBEBİ artık log'dan okunuyor. Bu ayrım olmadan
        # "bütçe yetmiyor" ile "model bozuk JSON üretti" aynı satıra düşüyor ve iki node'un
        # LLM'i hiç çalıştırmadığı aylarca görünmüyordu.
        # raw ÇIKARILDI: cikar/siniflandir yanıtı ad/adres gibi kişisel alanlar taşır ve
        # bu satır halka açık demoda log'a düşerdi. Teşhis sinyali (boş mu / kesik mi /
        # retry hakkı var mı) zaten ayrı alanlarda; uzunluk onu tamamlar.
        log.debug("evrak_llm_json_parse_empty", n=len(raw),
                  bos=not raw.strip(), kesik=sonuc.kesik, retry=retry_hakli)
        return None
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
    max_tokens: int = 420,
    temperature: float = 0.2,
    timeout_s: float = LLM_NODE_TIMEOUT_S,
    dusunme_kapali: bool = False,
) -> str | None:
    """LLM'i SERBEST METİN modunda çağır (JSON değil). Mock/hata/timeout/boş → None.

    None dönerse çağıran node kendi deterministik metnine düşer (demo asla bozulmaz).
    llm_json'ın metin-üreten ikizi (DRY: route/finalize gibi prose node'ları paylaşır).

    `dusunme_kapali` llm_json'daki ile aynı anlamda (DeepSeek `thinking: disabled`):
    gerçekleri HAZIR alıp yalnız cümleye döken node'lar için muhakeme gereksizdir.
    """
    llm = real_llm()
    if llm is None:
        return None
    anahtar = (
        _cache_anahtari("text", llm, system, user, max_tokens,
                        dusunme_kapali=dusunme_kapali, temperature=temperature)
        if config.LLM_CACHE_ENABLED else None
    )
    if anahtar is not None:
        onbellek = _cache_al(anahtar)
        if onbellek is not None:
            return onbellek  # str immutable — kopya gerekmez
    sonuc = await _chat_dene(
        llm,
        [ChatMessage(role="system", content=system), ChatMessage(role="user", content=user)],
        max_tokens=max_tokens, temperature=temperature, timeout_s=timeout_s, json_mode=False,
        dusunme_kapali=dusunme_kapali,
    )
    if sonuc is None:
        return None
    txt = sonuc.metin.strip()
    if not txt:
        # Serbest metinde retry zaten yoktu; sebebi loglamak teşhisi mümkün kılar.
        log.debug("evrak_llm_text_bos", kesik=sonuc.kesik)
        return None
    if anahtar is not None:
        _cache_koy(anahtar, txt)
    return txt


__all__ = ("LLM_NODE_TIMEOUT_S", "cache_temizle", "llm_json", "llm_text",
           "parse_json_object", "real_llm")
