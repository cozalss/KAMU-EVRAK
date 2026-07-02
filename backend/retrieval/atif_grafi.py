"""GraphRAG-lite — mevzuat atıf grafiği üzerinden 1-hop retrieval genişletme (S7).

FİKİR (GraphRAG'ın hafif, deterministik uyarlaması): mevzuat maddeleri birbirine
atıf verir ("... 3071 sayılı Kanun uyarınca ..."). BM25 top sonuçlarının METNİNDEN
atıf verilen kanun numaraları çıkarılır; o kanunlara ait en iyi sıralı chunk'lar
öneri listesine EK aday olarak eklenir → "önerilen madde, atıf verdiği mevzuatla
birlikte gelir" (multi-hop bağlam, vektör DB'siz, modelsiz).

Atıf deseni BİLİNÇLİ dar: yalnız "<no> sayılı" kalıbı + SDP genelgesi (2005/7) —
yıl/tutar gibi çıplak sayılar atıf SAYILMAZ (yanlış-pozitif koruması).
Tamamen deterministik + saf stdlib → mock/CI'da birebir aynı çıktı.
"""

from __future__ import annotations

import re
from typing import Any

# "3071 sayılı", "4982 SAYILI" (İ/ı varyantları) + "2005/7" (SDP genelgesi).
_ATIF_RE = re.compile(r"\b(\d{3,4})\s+say[ıiIİ]l[ıiIİ]\b|\b(2005[/-]7)\b", re.IGNORECASE)
# Mevzuat ETİKETİNDEN numara (etiketler "3071", "2646_resmi_yazisma..." gibi no taşır).
_ETIKET_NO_RE = re.compile(r"\b(2005[-/]7)\b|\b(\d{3,4})\b")


def atif_nolari(metin: str) -> set[str]:
    """Chunk metninden atıf verilen kanun/genelge numaraları ('sayılı'-çapalı)."""
    nolar: set[str] = set()
    for m in _ATIF_RE.finditer(metin or ""):
        no = m.group(1) or m.group(2)
        if no:
            nolar.add(no.replace("/", "-"))
    return nolar


def _etiket_nolari(etiket: str) -> set[str]:
    nolar: set[str] = set()
    for m in _ETIKET_NO_RE.finditer(etiket or ""):
        no = m.group(1) or m.group(2)
        if no:
            nolar.add(no.replace("/", "-"))
    return nolar


def atif_ek_adaylar(
    top: list[tuple[float, dict[str, Any]]],
    siralanmis: list[tuple[float, dict[str, Any]]],
    *,
    k_ek: int = 2,
) -> list[tuple[float, dict[str, Any]]]:
    """Top sonuçların atıf verdiği mevzuattan, sıralı listeden EK adaylar seç.

    top: hâlihazırda dönecek (skor, chunk) listesi; siralanmis: dedup'lu tam BM25
    sıralaması (aday havuzu). Dönen ekler top'ta OLMAYAN mevzuat chunk'larıdır;
    skorları BM25 sıralamasından taşınır (uydurma skor yok). En fazla k_ek aday.
    """
    if not top:
        return []
    kendi: set[str] = set()
    atifli: set[str] = set()
    secili_anahtar = {(str(c.get("mevzuat", "")), c.get("madde_no")) for _, c in top}
    for _, chunk in top:
        kendi |= _etiket_nolari(str(chunk.get("mevzuat", "")))
        atifli |= atif_nolari(str(chunk.get("text", "")))
    hedef = atifli - kendi
    if not hedef:
        return []

    ekler: list[tuple[float, dict[str, Any]]] = []
    bulunan_no: set[str] = set()
    for skor, chunk in siralanmis:
        if len(ekler) >= k_ek:
            break
        anahtar = (str(chunk.get("mevzuat", "")), chunk.get("madde_no"))
        if anahtar in secili_anahtar:
            continue
        eslesen = _etiket_nolari(str(chunk.get("mevzuat", ""))) & hedef
        # Aynı mevzuattan tek ek aday (çeşitlilik) — no başına ilk (en yüksek skorlu) chunk.
        if eslesen and not (eslesen & bulunan_no):
            ekler.append((skor, chunk))
            secili_anahtar.add(anahtar)
            bulunan_no |= eslesen
    return ekler


__all__ = ("atif_ek_adaylar", "atif_nolari")
