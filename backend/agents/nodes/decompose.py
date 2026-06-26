"""Görev 1+2 (yenilikçilik) — Çok-konulu evrak ayrıştırma (decompose) node'u.

Kamu gerçeği: vatandaş TEK dilekçeye birden çok talep yazar ("çukur onarımı, AYRICA
fatura itirazı, BİR DE iş başvurusu sonucu..."). Memur o kâğıdı 3 kez fotokopileyip 3
ayrı daireye elle dağıtır. Bu node dilekçeyi alt-taleplere böler ve HER alt-talep için
ayrı {tür, birim, yazı türü, yasal cevap süresi} üretir → otomatik havale önerisi.

Tasarım (CLAUDE.md §1-2):
- DETERMİNİSTİK çekirdek: bağlaç/numara bazlı segmentasyon + keyword zenginleştirme
  (mock/CI'da anahtarsız, tekrarlanabilir). Halüsinasyon yok — tür/birim tablo dışıysa
  makul varsayılan (uydurma yok). Süre yalnız mevzuatta tanımlı (EVRAK_TO_SURE).
- LLM İYİLEŞTİRME (openai modunda): few-shot JSON ile daha iyi segmentasyon; başarısız
  olursa deterministik segmente düşer (graceful). LLM yalnız ÇOK-talep sinyalinde çağrılır
  (tek-konulu evrakta ek maliyet yok).
- PII: alt-talep özeti `mask_pii` ile maskelenir (ham TCKN/telefon arayüze ulaşmaz).
- ENV-gated (DECOMPOSE_ENABLED): kapalıyken node grafta yok → baseline birebir korunur.
  Additive — birincil tür/birim/yönlendirme/özet/taslak DEĞİŞMEZ; yalnız alt_talepler eklenir.

Çıktı SÖZLEŞMESİ (frontend + AltTalepSchema ile eşleşir — anahtarlar SABİT):
    alt_talepler = [
        {"ozet": str, "tur": str, "tur_tr": str, "birim": str, "birim_tr": str,
         "yazi_turu": str, "cevap_suresi": str, "sla_durum": str}, ...
    ]
Tek-konulu evrak → [] (frontend kartı gizlenir; gürültü yok).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

import structlog

from agents.config import (
    EVRAK_TO_BIRIM,
    EVRAK_TO_YAZI,
    EVRAK_TURU_TR,
    birim_tr,
)
from agents.nodes._llm_extract import llm_json
from agents.nodes.route_birim import _content_scores
from agents.nodes.sla_triyaj import compute_sla
from api.pii import mask_pii
from core.text import tr_lower

log = structlog.get_logger()

# Alt-talep ayraçları: bağlaçlar + noktalı virgül + numaralı/harfli madde başları.
_AYRAC = re.compile(
    r"(?:\bayrıca\b|\bbir de\b|\bbunun yanı ?sıra\b|\bbunun yanında\b|\bek olarak\b"
    r"|\bilaveten\b|\bayrıyeten\b|\bdiğer yandan\b|\böte yandan\b|\bhem de\b"
    r"|\bbir diğer\b|\bbir başka\b|;|\n\s*\d+[.)]\s|\n\s*[a-zçğşöüı][.)]\s)",
    re.IGNORECASE,
)
_MIN_SEG = 12     # bu uzunluğun altındaki parça fragment sayılır (atılır)
_MAX_OZET = 180   # alt-talep özeti üst sınırı (UI kartı)

# Resmî evrak başlık/künye/imza satırları — segmentasyondan ÖNCE atılır (gövdeye odaklan).
_BASLIK_KOK: tuple[str, ...] = (
    "t.c", "sayı", "sayi", "tarih", "konu", "adı soyad", "ad-soyad", "ad soyad",
    "adres", "telefon", "e-posta", "eposta", "e-imza", "imza", "firma", "dosya no",
    "karar no", "sicil", "ilgili", "i̇lgili", "fatura no", "kurum sicil",
)

# Tek-segment niyet → tür. SIRA önemli: bilgi_edinme/şikayet/ihbar 'talep'ten ÖNCE
# (ör. "öğrenmek istiyorum" 'istiyorum' içerir ama bilgi_edinme'dir).
_NIYET: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bilgi_edinme", ("öğrenmek", "öğrenmek ist", "sonucunu", "sonucu öğ", "akıbet",
                      "durumunu öğ", "ne zaman", "bilgi almak", "bilgi edin", "sorgu",
                      "hakkında bilgi", "sonuç bekl", "öğrenmek istiyor")),
    ("sikayet", ("şikayet", "şikâyet", "yanlış", "hatalı", "itiraz", "mağdur", "haksız",
                 "yanıltıcı", "fazla yansı", "haksızlık", "rahatsız", "yanlış oldu")),
    ("ihbar", ("ihbar", "kaçak", "usulsüz", "ruhsatsız", "bildiriyorum", "şikâyetçiyim")),
    ("talep", ("onar", "düzelt", "yapılmasını", "yapılması", "talep", "rica", "istiyorum",
               "iade", "tahsis", "temin", "kaldırılmasını", "iyileştir", "yenile",
               "tamir", "giderilme", "yapılmasin")),
)

# Belediye konu → birim (route_birim içerik-skorlamasını TAMAMLAR; konu-spesifik öncelik).
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

# ÇOK-talep ön-sinyali: ayraç VAR ya da ≥2 farklı niyet kökü → LLM/segmentasyon dene.
_SINYAL_KOK: tuple[str, ...] = tuple(
    kok for _, koks in _NIYET for kok in koks
)

_LLM_SYSTEM = (
    "Sen bir kamu evrak ayrıştırma asistanısın. Verilen dilekçe/başvuru metnindeki "
    "BİRBİRİNDEN AYRI istekleri ayrı maddelere böl. Her madde TEK somut isteği içersin "
    "(onarım, itiraz, bilgi talebi vb.). Tek istek varsa tek madde döndür. Uydurma EKLEME; "
    'her maddeyi metnin kendi ifadesiyle yaz. SADECE şu JSON: {"talepler": ["istek 1", "istek 2"]}'
)


def _coklu_sinyal(text: str) -> bool:
    """Metinde çok-talep işareti var mı (ayraç ya da ≥2 farklı niyet kökü)."""
    if _AYRAC.search(text):
        return True
    t = tr_lower(text)
    return sum(1 for kok in set(_SINYAL_KOK) if kok in t) >= 2


def _talep_iceriyor(seg: str) -> bool:
    """Segment bir istek taşıyor mu (niyet ya da konu kökü)."""
    t = tr_lower(seg)
    if any(kok in t for _, koks in _NIYET for kok in koks):
        return True
    return any(kw in t for _, kws in _KONU_BIRIM for kw in kws)


def _baslik_satiri(satir: str) -> bool:
    """Satır künye/başlık/imza mı (segmentasyondan atılır)."""
    s = tr_lower(satir.strip())
    if not s:
        return True
    if any(s.startswith(kok) for kok in _BASLIK_KOK):
        return True
    # Kısa ALL-CAPS kurum satırı (ör. 'KEÇİÖREN BELEDİYE BAŞKANLIĞINA').
    harf = [c for c in satir if c.isalpha()]
    return bool(harf) and len(satir.split()) <= 6 and sum(c.isupper() for c in harf) / len(harf) > 0.7


def _govde(text: str) -> str:
    """Künye/başlık/imza satırlarını ele → istek gövdesi (tek satır)."""
    return " ".join(s.strip() for s in text.splitlines() if not _baslik_satiri(s))


def _heuristik_segment(text: str) -> list[str]:
    """Bağlaç/numara bazlı böl → istek taşıyan, yeterince uzun segmentler."""
    segs: list[str] = []
    for parca in _AYRAC.split(text):
        s = parca.strip(" ,;.\n\t-—")
        if len(s) >= _MIN_SEG and _talep_iceriyor(s):
            segs.append(s)
    return segs


async def _llm_segment(text: str) -> list[str] | None:
    """LLM ile segmentle (openai modu). Geçersiz/yok → None (heuristiğe düşülür)."""
    obj = await llm_json(_LLM_SYSTEM, text[:4000], max_tokens=400)
    if not isinstance(obj, dict):
        return None
    talepler = obj.get("talepler")
    if not isinstance(talepler, list):
        return None
    temiz = [str(t).strip() for t in talepler if isinstance(t, str) and len(str(t).strip()) >= _MIN_SEG]
    return temiz or None


def _segment_turu(seg: str) -> str:
    """Tek segmentin türünü keyword niyetinden belirle (deterministik)."""
    t = tr_lower(seg)
    for tur, koks in _NIYET:
        if any(kok in t for kok in koks):
            return tur
    return "talep"  # vatandaş isteklerinin makul varsayılanı


def _segment_birim(seg: str, tur: str) -> str:
    """Segment birimi: konu-spesifik tablo → içerik skoru → tür config'i."""
    t = tr_lower(seg)
    for birim, kws in _KONU_BIRIM:
        if any(kw in t for kw in kws):
            return birim
    skor = _content_scores(t)
    if skor:
        return max(skor, key=lambda b: skor[b])
    return EVRAK_TO_BIRIM.get(tur, "yazi_isleri_evrak")


def _enrich(seg: str, tarih_str: str, bugun: date) -> dict[str, Any]:
    """Bir segmenti tür+birim+yazı türü+yasal süre ile zenginleştir (PII maskeli özet)."""
    tur = _segment_turu(seg)
    birim = _segment_birim(seg, tur)
    sla = compute_sla(tur, tarih_str, bugun)
    if sla.get("sure"):
        cevap = f"{sla['sure']} ({sla['mevzuat']})"
    else:
        cevap = "Yasal süre türe göre tanımlı değil"
    return {
        "ozet": mask_pii(seg).masked_text[:_MAX_OZET].strip(),
        "tur": tur,
        "tur_tr": EVRAK_TURU_TR.get(tur, tur),
        "birim": birim,
        "birim_tr": birim_tr(birim),
        "yazi_turu": EVRAK_TO_YAZI.get(tur, "cevabi_yazi"),
        "cevap_suresi": cevap,
        "sla_durum": sla.get("durum", "tanimsiz"),
    }


def compute_decomposition(
    text: str, unsurlar: dict[str, Any], bugun: date,
) -> list[dict[str, Any]]:
    """SAF + deterministik ayrıştırma (heuristik segment + zenginleştirme).

    Çok-talep sinyali yoksa ya da <2 anlamlı segment çıkarsa [] döner (tek-konulu).
    Test-edilebilir (bugün enjekte edilir). decompose_node bunu LLM segmentle iyileştirebilir.
    """
    govde = _govde(text)
    if not _coklu_sinyal(govde):
        return []
    segs = _heuristik_segment(govde)
    if len(segs) < 2:
        return []
    tarih_str = str(unsurlar.get("tarih") or "") or text
    return [_enrich(s, tarih_str, bugun) for s in segs]


async def decompose_node(state: dict[str, Any]) -> dict[str, Any]:
    """Çok-konulu evrakı alt-taleplere böl (additive, ENV-gated). LLM segment + heuristik fallback."""
    text = state.get("evrak_text", "") or ""
    unsurlar = state.get("bilgi_unsurlari") or {}
    bugun = date.today()
    govde = _govde(text)

    if not _coklu_sinyal(govde):
        return {"alt_talepler": []}  # tek-konulu → LLM çağrısı yapma

    segs = await _llm_segment(govde)
    if not segs or len(segs) < 2:
        segs = _heuristik_segment(govde)
    if len(segs) < 2:
        return {"alt_talepler": []}

    tarih_str = str(unsurlar.get("tarih") or "") or text
    alt = [_enrich(s, tarih_str, bugun) for s in segs]
    log.info("decompose", n_alt=len(alt), birimler=[a["birim"] for a in alt])
    return {"alt_talepler": alt}


__all__ = ("compute_decomposition", "decompose_node")
