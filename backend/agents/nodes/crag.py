"""Yenilikçilik — CRAG (Corrective Retrieval-Augmented Generation) öz-düzeltme node'u.

Akış: mevzuat_oner BM25 retrieval'ından SONRA çalışır. Retrieval GÜVENİ düşükse
(top normalize skor < CRAG_CONF_ESIK veya hiç sonuç yoksa) sorguyu GENİŞLETİP
mevzuat_oner'in aynı BM25 indeksini farklı sorguyla TEKRAR çağırır → daha alakalı
mevzuat önerisi. Düzeltme yapıldıysa `crag_corrected=True` işaretlenir (şeffaflık).

SOTA dayanak (Yan et al. 2024, "Corrective Retrieval Augmented Generation"):
düşük-güvenli retrieval'ı tespit edip sorgu-genişletme/yeniden-getirme ile düzelt.
Bizim uyarlamamızda "web arama" yerine LOKAL korpusta sorgu-genişletmeli yeniden-BM25
(kamu-evrak offline/mock modda çalışmalı — ağ bağımlılığı yok).

ENV-GATED: CRAG_ENABLED=0 (varsayılan) → no-op passthrough (boş dict döner, state
bozulmaz, baseline akış birebir korunur). Açıkken bile retrieval güveni yüksekse
düzeltme YAPMAZ (gereksiz iş yok) → yalnızca düşük-güvende devreye girer.

LLM güçlendirme (CRAG_LLM, yalnız düşük-güven dalında): (1) retrieval-evaluator
(grader) top-3 adaya correct/ambiguous/incorrect verir — hepsi correct ise düzeltme
gereksizdir (erken çıkış); (2) incorrect/ambiguous varsa talep mevzuat terminolojisine
çevrilir ve dönen terimler DETERMİNİSTİK genişletilmiş sorguya EKLENİR (değiştirmez).
LLM yok/mock/hata/bozuk çıktı → mevcut deterministik genişletme BİREBİR (sözleşme).
Kullanım izi structlog'a düşer ("crag_llm" event'i — şeffaflık).

Return sözleşmesi: {"mevzuat_onerileri": [...]} (düzeltilmiş öneriler — operator.add
reducer ile fan-in olduğundan ÖNCEKİ önerilerin ÜZERİNE eklenmez; aşağıda not).
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from agents.config import (
    CRAG_CONF_ESIK,
    CRAG_ENABLED,
    CRAG_LLM,
    CRAG_RAW_ESIK,
    EVRAK_TURU_TR,
)
from agents.nodes._llm_extract import llm_json, real_llm
from agents.nodes.mevzuat_oner import (
    _MIN_QUERY_LEN,
    _domain_terimleri,
    _from_config,
    _from_corpus,
)
from api.pii import mask_for_llm

log = structlog.get_logger()

# Grader kapalı kümesi (Yan et al. 2024 üçlüsü) — LLM çıktısı Python tarafında bu
# kümeye karşı doğrulanır; küme dışı etiket/eksik hiza → çıktı geçersiz → fallback.
_KARAR_KUMESI = frozenset({"correct", "ambiguous", "incorrect"})
_GRADER_ADAY_N = 3            # yalnız top-3 değerlendirilir (hafif çağrı)
_GRADER_SNIPPET_CHARS = 200
_MAX_TERIM = 8                # yeniden yazımdan alınacak en fazla arama terimi
_MAX_TERIM_UZUNLUK = 80       # tek terim üst sınırı (paragraf-kaçağı önleme)

_GRADER_SYSTEM = (
    "Sen kamu evrakları için mevzuat arama sonuçlarını değerlendiren bir uzmansın "
    "(retrieval evaluator). Evrak konusuna göre HER adayı değerlendir: "
    "'correct' = doğrudan ilgili, 'ambiguous' = kısmen/belirsiz ilgili, "
    "'incorrect' = alakasız. Yalnız şu JSON'u döndür: "
    '{"kararlar": ["correct|ambiguous|incorrect", ...]} — aday sırasıyla, aday sayısı kadar.'
)

_TERIM_SYSTEM = (
    "Sen Türk kamu mevzuatı arama uzmanısın. Verilen evrak talebini Türk mevzuat "
    "terminolojisiyle 5-8 kısa arama terimine çevir (kanun adı, hukuki kavram, resmî "
    "yazışma terimi). Madde numarası UYDURMA; yalnız terminoloji üret. Yalnız şu "
    'JSON\'u döndür: {"terimler": ["terim", ...]}'
)


def _retrieval_guveni(oneriler: list[dict[str, Any]]) -> float:
    """Mevcut önerilerin retrieval güveni (0..1) — MUTLAK BM25 kalitesi temelli.

    mevzuat_oner korpus dalında `score` max-normalize'dir (top≈1.0) → güven sinyali
    OLAMAZ. Bu yüzden `raw_score` (normalizasyon öncesi ham BM25) kullanılır: ham top
    skor CRAG_RAW_ESIK'in üstündeyse güçlü eşleşme (güven→1.0'a yakın), altındaysa
    zayıf (sorgu hiçbir maddeye iyi değmedi → düzeltme adayı). Statik config fallback'te
    raw_score YOK → düşük güven (score≈0.3-0.5 normalize değerine düşülür).

    Hiç öneri yok → 0.0. Korpus top raw_score → min(top/ESIK, 1.0). config → score değeri.
    """
    if not oneriler:
        return 0.0
    raw = [float(o["raw_score"]) for o in oneriler if "raw_score" in o]
    if raw:
        return min(max(raw) / CRAG_RAW_ESIK, 1.0)
    # config fallback (raw_score yok): normalize score doğrudan güven proxy'si (0.3-0.5).
    return max((float(o.get("score", 0.0) or 0.0) for o in oneriler), default=0.0)


def _genisletilmis_sorgu(state: dict[str, Any]) -> str:
    """Düzeltme sorgusu — konu + tür + statik mevzuat başlıklarındaki anahtar terimler.

    Standart CRAG "query transform": ilk sorgu zayıf eşleştiğinde domain bilgisini
    (tür → beklenen mevzuat başlığı) sorguya enjekte ederek yeniden-getirmeyi yönlendir.
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    turu_key = (state.get("evrak_turu", "") or "").strip()
    turu = EVRAK_TURU_TR.get(turu_key, turu_key)
    # Türe ait statik mevzuat başlıkları sorguya domain-sinyali ekler (örn. "Dilekçe
    # Hakkı", "Bilgi Edinme") → korpusta doğru maddeye yönelir. Hijyen mevzuat_oner
    # ile ortak: madde atıfları ("m.4"→"madde4" her kanunla eşleşir) ve [DOĞRULA:]
    # meta-notları sorguya girmez.
    domain_terimler = _domain_terimleri(turu_key)
    body = (state.get("evrak_text", "") or "")[:600]
    return " ".join(p for p in (turu, konu, domain_terimler, body) if p).strip()


def _konu_metni(state: dict[str, Any]) -> str:
    """LLM prompt'ları için evrak konusu — çıkarılan konu birincil, yoksa metin başı.

    KVKK: yalnız LLM prompt'larında (grader + terimler) kullanılır → metin-başı fallback'i
    maskeli döner (ham TCKN/telefon DeepSeek'e gitmesin; cikar/route ile aynı ilke).
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    return konu or mask_for_llm((state.get("evrak_text", "") or "")[:300], None)


async def _llm_grader(
    oneriler: list[dict[str, Any]], state: dict[str, Any]
) -> list[str] | None:
    """Retrieval-evaluator: top-3 adaya correct/ambiguous/incorrect. Bozuk çıktı → None.

    Kapalı-küme doğrulaması Python'da: karar sayısı aday sayısına EŞİT ve her etiket
    _KARAR_KUMESI içinde olmalı — aksi halde çıktıya güvenilmez (fallback sözleşmesi).
    """
    adaylar = [{
        "baslik": str(o.get("baslik", "") or ""),
        "snippet": str(o.get("snippet", "") or "")[:_GRADER_SNIPPET_CHARS],
    } for o in oneriler[:_GRADER_ADAY_N]]
    obj = await llm_json(
        _GRADER_SYSTEM,
        (f"EVRAK KONUSU: {_konu_metni(state)}\n\n"
         f"MEVZUAT ADAYLARI:\n{json.dumps(adaylar, ensure_ascii=False)}"),
        max_tokens=120,
    )
    kararlar = (obj or {}).get("kararlar")
    if not isinstance(kararlar, list) or len(kararlar) != len(adaylar):
        return None
    normal = [str(k).strip().lower() for k in kararlar]
    return normal if all(k in _KARAR_KUMESI for k in normal) else None


async def _llm_mevzuat_terimleri(state: dict[str, Any]) -> list[str] | None:
    """Talebi mevzuat terminolojisine çeviren 5-8 arama terimi. Bozuk/boş çıktı → None."""
    turu_key = (state.get("evrak_turu", "") or "").strip()
    obj = await llm_json(
        _TERIM_SYSTEM,
        (f"EVRAK TÜRÜ: {EVRAK_TURU_TR.get(turu_key, turu_key) or 'belirsiz'}\n"
         f"EVRAK KONUSU/TALEBİ: {_konu_metni(state)}\n\n"
         # KVKK: ham metin başı DeepSeek'e maskeli gider (TCKN/telefon künye satırları sık).
         f"METİN (ilk bölüm):\n{mask_for_llm((state.get('evrak_text', '') or '')[:600], None)}"),
        max_tokens=200,
    )
    ham = (obj or {}).get("terimler")
    if not isinstance(ham, list):
        return None
    terimler: list[str] = []
    for t in ham:
        s = t.strip() if isinstance(t, str) else ""
        if s and len(s) <= _MAX_TERIM_UZUNLUK and s not in terimler:
            terimler.append(s)
    return terimler[:_MAX_TERIM] or None


async def _llm_sorgu_guclendir(
    state: dict[str, Any], mevcut: list[dict[str, Any]], sorgu: str
) -> tuple[str, bool]:
    """CRAG_LLM dalı — (sorgu, duzeltme_gereksiz) döner. İki hafif llm_json adımı.

    LLM yok/mock/hata/bozuk çıktı → (sorgu, False): deterministik genişletme BİREBİR
    korunur. Hiç aday yoksa grader atlanır (değerlendirilecek şey yok) → doğrudan
    yeniden yazım. Terimler mevcut sorguya yalnız EKLENİR (değiştirmez).
    """
    if not CRAG_LLM or real_llm() is None:
        return sorgu, False  # mock/anahtarsız → eski yol (CI deterministik kalır)
    if mevcut:
        kararlar = await _llm_grader(mevcut, state)
        if kararlar is None:
            return sorgu, False  # bozuk grader çıktısı → deterministik yol birebir
        if all(k == "correct" for k in kararlar):
            log.info("crag_llm", adim="grader", sonuc="hepsi_correct", n=len(kararlar))
            return sorgu, True  # öneriler zaten doğru → düzeltme gereksiz (erken çık)
        log.info("crag_llm", adim="grader", sonuc="duzeltme_gerekli", kararlar=kararlar)
    terimler = await _llm_mevzuat_terimleri(state)
    if not terimler:
        return sorgu, False  # bozuk/boş yeniden yazım → deterministik sorgu birebir
    log.info("crag_llm", adim="sorgu_yeniden_yazim", terimler=terimler)
    return f"{sorgu} {' '.join(terimler)}".strip(), False


async def crag_node(state: dict[str, Any]) -> dict[str, Any]:
    """CRAG öz-düzeltme — düşük-güvenli retrieval'ı sorgu-genişletmeyle düzelt (ENV-gated)."""
    if not CRAG_ENABLED:
        return {}  # no-op: grafta var ama kapalı (baseline davranış birebir korunur)

    if state.get("mevzuat_yargic_calisti"):
        # İçerik odaklı yolda alaka kararını yargıç verdi (boş sonuç dahil). Ham BM25/12
        # eşiği tür tekrarıyla şişen skorda hep 1.0 çıkıyordu (teşhis 2026-10-05) ve tür
        # odaklı yeniden getirme, yargıcın bilinçli boş sonucunu alakasız dolguyla ezerdi.
        log.info("crag", durum="atlandi", neden="alaka_yargici_karar_verdi")
        return {"crag_corrected": False}
    mevcut = list(state.get("mevzuat_onerileri") or [])
    guven = _retrieval_guveni(mevcut)
    if guven >= CRAG_CONF_ESIK:
        log.info("crag", durum="atlandi", guven=round(guven, 3), esik=CRAG_CONF_ESIK)
        return {"crag_corrected": False}

    sorgu = _genisletilmis_sorgu(state)
    # CRAG_LLM güçlendirme: grader "hepsi correct" derse düzeltme gereksiz; aksi halde
    # mevzuat-dili terimler deterministik sorguya EKLENİR. LLM'siz yolda sorgu değişmez.
    sorgu, duzeltme_gereksiz = await _llm_sorgu_guclendir(state, mevcut, sorgu)
    if duzeltme_gereksiz:
        return {"crag_corrected": False}
    duzeltilmis: list[dict[str, Any]] = []
    if len(sorgu) >= _MIN_QUERY_LEN:
        # Tür→mevzuat BOOST'u koru: turu geçilmezse _from_corpus boost UYGULAMAZ
        # (beklenen=set()) → düzeltme tür-sinyalsiz retrieval'a düşer (ECC HIGH-1).
        duzeltilmis = _from_corpus(sorgu, turu=state.get("evrak_turu", "") or "")
    if not duzeltilmis:
        duzeltilmis = _from_config(state.get("evrak_turu", "") or "belirsiz")

    yeni_guven = _retrieval_guveni(duzeltilmis)
    # Düzeltme yalnızca DAHA İYİ ise uygulanır (regresyon önleme — dürüstlük).
    if yeni_guven <= guven:
        log.info("crag", durum="iyilesme_yok", eski=round(guven, 3),
                 yeni=round(yeni_guven, 3))
        return {"crag_corrected": False}

    log.info("crag", durum="duzeltildi", eski=round(guven, 3),
             yeni=round(yeni_guven, 3), n=len(duzeltilmis))
    return {
        "mevzuat_onerileri_corrected": duzeltilmis,
        "crag_corrected": True,
        "crag_guven_oncesi": round(guven, 3),
        "crag_guven_sonrasi": round(yeni_guven, 3),
    }


__all__ = ("crag_node",)
