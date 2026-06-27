"""Görev 1 (yenilikçilik) — Kanıt bağlama (evidence grounding) node'u.

Şeffaflık/güven: jüri "bu sayıyı/tarihi nereden buldun?" diye sorduğunda, sistem
çıkarılan her unsuru ham evrak metnindeki TAM YERİYLE (karakter aralığı) gösterebilmeli.
Bu node bilgi_unsurlari'ndaki her değeri evrak metninde bulur ve span (start, end) üretir;
frontend bu aralıkları sarı ile vurgular → "kanıtı göster" anı.

PII GÜVENLİĞİ (CLAUDE.md §2): ham evrak metni TCKN/telefon içerebilir → frontend'e
ASLA ham gönderilmez. Span'lar `mask_pii` ile MASKELENMİŞ metin üzerinde hesaplanır;
döndürülen `metin` de maskelidir (TCKN "123******45" olarak görünür, konumu doğru).

Tasarım: DETERMİNİSTİK (substring arama) — LLM yok, ek bağımlılık yok. Bulunamayan değer
ATLANIR (uydurma konum yok). Additive passthrough; state'i bozmaz.

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir):
    kanit_metadata = {
        "metin": str,                # PII-maskeli kaynak metin (vurgulanacak)
        "spanlar": [{"start": int, "end": int, "alan": str, "label": str, "deger": str}],
    }
"""

from __future__ import annotations

from typing import Any

import structlog

from api.pii import mask_pii

log = structlog.get_logger()

# Frontend'e gönderilen maskeli metin tavanı (uzun evrakta payload + render guard).
# Span'lar bu tavanın içindekilerle sınırlanır (taşan vurgu geçersiz olmasın).
_MAX_METIN = 6000

# Vurgulanacak unsur alanları → UI etiketi. PII alanları (maskeli) DAHİL: maskeli
# değer maskeli metinde aynen geçer (mask_pii deterministik) → konum doğru, ham PII yok.
_VURGU_ALANLAR: tuple[tuple[str, str], ...] = (
    ("sayi", "Sayı"),
    ("tarih", "Tarih"),
    ("konu", "Konu"),
    ("gonderen", "Gönderen"),
    ("kurum", "Kurum"),
    ("tckn_maskeli", "T.C. Kimlik No"),
    ("telefon_maskeli", "Telefon"),
)


# Türkçe "İ".lower() == "i̇" (i + U+0307) UZUNLUĞU DEĞİŞTİRİR → str.lower() ile yapılan
# offset hesabı, metinde "İ" varsa span'ları kaydırır (ilk karakter kesilir). Bu eşleme
# İ→i, I→ı'yı 1:1 (uzunluk-koruyan) yapar; sonraki .lower() kalan harfleri 1:1 küçültür.
_TR_LOWER_MAP = str.maketrans("İI", "iı")


def _tr_low(s: str) -> str:
    """Uzunluk-koruyan Türkçe küçük-harf (offset hesabı için güvenli)."""
    return s.translate(_TR_LOWER_MAP).lower()


def _find_span(haystack_low: str, needle: str) -> tuple[int, int] | None:
    """needle'ın haystack'teki ilk konumu (küçük-harf arama) → (start, end) | None."""
    n = needle.strip()
    if len(n) < 2:
        return None
    i = haystack_low.find(_tr_low(n))
    return None if i < 0 else (i, i + len(n))


def compute_spans(evrak_text: str, unsurlar: dict[str, Any]) -> dict[str, Any]:
    """Çıkarılan unsurların MASKELİ metindeki span'larını hesapla (PII-güvenli, deterministik)."""
    masked = mask_pii(evrak_text or "").masked_text[:_MAX_METIN]
    low = _tr_low(masked)
    spanlar: list[dict[str, Any]] = []
    used: list[tuple[int, int]] = []
    for alan, label in _VURGU_ALANLAR:
        val = unsurlar.get(alan)
        if not isinstance(val, str) or not val.strip():
            continue
        sp = _find_span(low, val)
        if sp is None:
            continue
        s, e = sp
        # Çakışan vurgu (aynı aralık iki kez) → ilkini koru, sonrakini atla.
        if any(not (e <= us or s >= ue) for us, ue in used):
            continue
        used.append((s, e))
        spanlar.append({"start": s, "end": e, "alan": alan,
                        "label": label, "deger": masked[s:e]})
    spanlar.sort(key=lambda x: x["start"])
    return {"metin": masked, "spanlar": spanlar}


async def kanit_baglama_node(state: dict[str, Any]) -> dict[str, Any]:
    """Çıkarılan unsurları ham (maskeli) metindeki yerine bağla (additive, deterministik)."""
    evrak_text = state.get("evrak_text", "") or ""
    unsurlar = state.get("bilgi_unsurlari") or {}
    meta = compute_spans(evrak_text, unsurlar)
    log.info("kanit_baglama", n_span=len(meta["spanlar"]))
    return {"kanit_metadata": meta}


__all__ = ("compute_spans", "kanit_baglama_node")
