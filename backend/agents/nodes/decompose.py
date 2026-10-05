"""Görev 1+2 (yenilikçilik) — Çok-konulu evrak ayrıştırma (decompose) node'u.

Kamu gerçeği: vatandaş TEK dilekçeye birden çok talep yazar ("çukur onarımı, AYRICA
fatura itirazı, BİR DE iş başvurusu sonucu..."). Bu node her talep için ayrı {tür, birim,
yazı türü, yasal cevap süresi} üretir → otomatik havale önerisi.

TEK KAYNAK (teşhis 2026-10-05): talepler artık YALNIZ `cikar`ın talep kümesinde
(`bilgi_unsurlari['talep_kumesi']`) çıkarılır. Bu node LLM ÇAĞIRMAZ; kümeyi deterministik
olarak zenginleştirir. Eskiden ayrı bir LLM çağrısı (düşünme açık, ~7 sn, kritik yolda) ve
ayrı bir heuristik çalışıyor, cikar ile 12 metnin 9'unda farklı sayı veriyordu; "LLM tek
dedi → heuristik böler" ve "ayraçsız çok-talep hiç ayrışmaz" hataları da buradan doğuyordu.

Çıktı SÖZLEŞMESİ (frontend + AltTalepSchema — eski anahtarlar SABİT, yenileri additive):
    alt_talepler = [
        {"ozet", "tur", "tur_tr", "birim", "birim_tr", "yazi_turu", "cevap_suresi",
         "sla_durum", "id", "konu", "kanit"}, ...
    ]
Tek-konulu evrak → [] (frontend kartı gizlenir).
"""

from __future__ import annotations

from datetime import date
from typing import Any

import structlog

from agents.config import (
    EVRAK_TO_BIRIM,
    EVRAK_TO_YAZI,
    EVRAK_TURLERI,
    EVRAK_TURU_TR,
    birim_tr,
)
from agents.nodes.route_birim import _content_scores
from agents.nodes.sla_triyaj import compute_sla
from agents.talep_kumesi import heuristik_talep_kumesi, niyet_turu
from api.pii import mask_for_llm, mask_pii
from core.text import tr_lower

log = structlog.get_logger()

_MAX_OZET = 180   # alt-talep özeti üst sınırı (UI kartı)

# Belediye konu → birim (route_birim içerik-skorlamasını TAMAMLAR; yalnız birim ipucu yoksa).
_KONU_BIRIM: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ilgili_teknik_daire", ("çukur", "yol", "asfalt", "kaldırım", "altyapı", "kanalizasyon",
                             "su kaçağı", "aydınlatma", "park", "bahçe", "onarım", "tamir",
                             "imar", "inşaat", "yıkım", "tretuvar")),
    ("mali_strateji_sgb", ("fatura", "su faturas", "ödeme", "borç", "tahsilat", "vergi",
                           "harç", "tahakkuk", "meblağ", "tutar", "su faturası")),
    ("insan_kaynaklari", ("iş başvuru", "işe alım", "istihdam", "personel alım", "memur alım",
                          "işe gir", "iş ilan", "kadro talep")),
    ("teftis_ic_denetim", ("soruşturma", "usulsüzlük", "denetim talep")),
)


def _segment_turu(seg: str) -> str:
    """Tek talebin türü (deterministik yedek — tek kaynak talep_kumesi.niyet_turu)."""
    return niyet_turu(seg)


def _segment_birim(seg: str, tur: str) -> str:
    """Talep birimi (yalnız ipucu yoksa): konu-spesifik tablo → içerik skoru → tür config'i."""
    t = tr_lower(seg)
    for birim, kws in _KONU_BIRIM:
        if any(kw in t for kw in kws):
            return birim
    skor = _content_scores(t)
    if skor:
        return max(skor, key=lambda b: skor[b])
    return EVRAK_TO_BIRIM.get(tur, "yazi_isleri_evrak")


def _enrich(oge: dict[str, Any], tarih_str: str, bugun: date) -> dict[str, Any]:
    """Talep kümesi öğesini tür+birim+yazı türü+yasal süre ile zenginleştir.

    tur/birim_ipucu: cikar'ın kapalı-küme DOĞRULANMIŞ değeri (varsa); None → keyword yolu.
    Yazı türü + SLA türetimi HER ZAMAN deterministik (config). Özet PII maskeli.
    """
    kanit = mask_pii(str(oge.get("kanit") or "")).masked_text
    tur = oge.get("tur") if oge.get("tur") in EVRAK_TURLERI else _segment_turu(kanit)
    birim = oge.get("birim_ipucu") or _segment_birim(kanit, tur)
    sla = compute_sla(tur, tarih_str, bugun)
    if sla.get("sure"):
        cevap = f"{sla['sure']} ({sla['mevzuat']})"
    else:
        cevap = "Yasal süre türe göre tanımlı değil"
    return {
        "ozet": kanit[:_MAX_OZET].strip(),
        "tur": tur,
        "tur_tr": EVRAK_TURU_TR.get(tur, tur),
        "birim": birim,
        "birim_tr": birim_tr(birim),
        "yazi_turu": EVRAK_TO_YAZI.get(tur, "cevabi_yazi"),
        "cevap_suresi": cevap,
        "sla_durum": sla.get("durum", "tanimsiz"),
        # additive (talep kümesiyle bağ): kimlik + kısa resmî konu + birebir kanıt
        "id": oge.get("id"),
        "konu": mask_pii(str(oge.get("ozet") or "")).masked_text,
        "kanit": kanit,
    }


def _kume(text: str, unsurlar: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """cikar'ın talep kümesi; yoksa (eski durum/doğrudan çağrı) aynı tip deterministik."""
    kume = unsurlar.get("talep_kumesi")
    if isinstance(kume, list):
        kaynak = str(unsurlar.get("talep_kumesi_kaynagi") or "heuristik")
        return [o for o in kume if isinstance(o, dict)], kaynak
    return heuristik_talep_kumesi(mask_for_llm(text, None)), "heuristik"


def compute_decomposition(
    text: str, unsurlar: dict[str, Any], bugun: date,
) -> list[dict[str, Any]]:
    """SAF + deterministik: talep kümesinde ≥2 öğe varsa her birini zenginleştir, yoksa []."""
    kume, _ = _kume(text, unsurlar)
    if len(kume) < 2:
        return []
    tarih_str = str(unsurlar.get("tarih") or "")  # yoksa tarih_yok (tüm metni GEÇİRME)
    return [_enrich(o, tarih_str, bugun) for o in kume]


async def decompose_node(state: dict[str, Any]) -> dict[str, Any]:
    """Talep kümesinden alt talepleri türet (LLM çağrısı YOK).

    ayristirma_denendi (CLAUDE.md §10): ayrıştırma GERÇEKTEN yapıldıysa True — küme LLM'den
    geldiyse (çağrı cikar'da harcandı; "tek talep" de bir karardır) ya da ≥2 alt talep
    çıktıysa. Deterministik kümede tek talep → False ("gerekmedi" dürüst).
    """
    text = state.get("evrak_text", "") or ""
    unsurlar = state.get("bilgi_unsurlari") or {}
    _, kaynak = _kume(text, unsurlar)
    alt = compute_decomposition(text, unsurlar, date.today())
    if alt:
        log.info("decompose", n_alt=len(alt), birimler=[a["birim"] for a in alt])
    return {"alt_talepler": alt, "ayristirma_denendi": kaynak == "llm" or len(alt) >= 2}


__all__ = ("compute_decomposition", "decompose_node")
