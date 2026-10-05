"""Mevzuat önerisinin YAPISAL güvenlik ağı — çerçeve maddeleri ve evrakın kendi atıfları.

NEDEN (2026-10-05 gerçek-LLM ölçümü):
  * "Amaç" maddeleri (Hasta Hakları Yön. m.1, 2547 m.1, 6343 m.1, 4342 m.1) "esas" öneri
    olarak sunuldu. Amaç / kapsam / tanımlar / dayanak / yürürlük / yürütme maddeleri her
    mevzuatın çerçeve bölümüdür; hiçbir talebin meselesini DÜZENLEMEZ → esas dayanak olamaz.
    Bu bir kelime listesi değil, Türk mevzuat tekniğinin sabit bölüm başlıklarıdır.
  * Evrak "HMK'nın 389. maddesi" diye AÇIKÇA atıf yaptığı hâlde öneri boştu. Gönderenin
    kendi atfı en güçlü sinyaldir: korpusta varsa öneriye girer (katman="atif"); korpusta
    yoksa UYDURULMAZ — `[DOĞRULA: …]` notuyla "kapsam boşluğu" olarak raporlanır.
Kısaltmalar (HMK, İİK, TBK, İYUK…) elle yazılmaz: korpus dosyalarının başlık satırından
(baş harfler, bağlaç atlanarak) türetilir; iki kanun aynı kısaltmayı üretirse o kısaltma
belirsizdir ve kullanılmaz.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from agents.nodes import mevzuat_oner as mo

_CERCEVE_RE = re.compile(
    r"^\s*(?:(?:ek|geçici)\s+)?madde\s+\d+\S*\s*[—–\-.]\s*"
    r"(?:amaç|kapsam|tanımlar|tanım|kısaltmalar|dayanak|yürürlük|yürütme)"
    r"(?:\s*(?:ve|,)\s*(?:amaç|kapsam|tanımlar|dayanak|yürürlük|yürütme))*\s*(?:\(|$)",
    re.IGNORECASE)
_BAGLAC = {"ve", "ile", "veya", "hakkında", "dair", "ilişkin"}
_MADDE_SON = r"(?P<madde>\d{1,4})\s*(?:\.|['’]?\s*(?:inci|ıncı|nci|ncı|üncü|uncu|ncü|ünci))?\s*madde"
_SAYILI_RE = re.compile(rf"\b(?P<no>\d{{3,4}})\s+sayılı[^.\n]{{0,90}}?{_MADDE_SON}",
                        re.IGNORECASE)
_KIS_RE = re.compile(
    r"\b(?P<kis>[A-ZÇĞİÖŞÜ]{2,5})(?:['’][a-zçğıöşü]{1,4})?\s+"
    r"(?:(?:m\.|md\.?)\s*(?P<m1>\d{1,4})|(?P<m2>\d{1,4})\s*(?:\.|['’]?\s*(?:inci|ıncı|nci|ncı|"
    r"üncü|uncu|ncü))?\s*madde)")


def _tr_lower(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def cerceve_maddesi_mi(chunk: dict[str, Any]) -> bool:
    """Madde başlığı amaç/kapsam/tanımlar/dayanak/yürürlük/yürütme ise True."""
    ilk = str(chunk.get("text", "")).strip().split("\n", 1)[0]
    return bool(_CERCEVE_RE.match(_tr_lower(ilk)))


def _kisaltma(baslik: str) -> str:
    kelimeler = [k for k in re.split(r"[\s\-]+", baslik.strip()) if k]
    return "".join(k[0] for k in kelimeler if _tr_lower(k) not in _BAGLAC).upper()


@lru_cache(maxsize=1)
def kisaltma_haritasi() -> dict[str, str]:
    """Korpustaki KANUN başlıklarından türetilen kısaltma → kanun no (belirsizler elenir)."""
    aday: dict[str, set[str]] = {}
    for dosya in {mo._kaynak_dosya(c) for c in mo._load_index()}:
        no = dosya.split("_", 1)[0]
        ad = re.sub(r"^\d+\s+sayılı\s+", "", mo._resmi_ad(dosya))
        if not no.isdigit() or not mo._KANUN_SONU.search(ad):
            continue
        kis = _kisaltma(re.sub(r"\s*\([^)]*\)", "", ad))
        if 2 <= len(kis) <= 5:
            aday.setdefault(kis, set()).add(no)
    return {k: next(iter(v)) for k, v in aday.items() if len(v) == 1}


def evrak_atiflari(metin: str) -> list[tuple[str, int]]:
    """Evrak metnindeki açık (kanun no, madde no) atıfları — sırayı koruyarak, tekil."""
    out: list[tuple[str, int]] = []
    for m in _SAYILI_RE.finditer(metin or ""):
        out.append((m.group("no"), int(m.group("madde"))))
    harita = kisaltma_haritasi()
    for m in _KIS_RE.finditer(metin or ""):
        no = harita.get(m.group("kis"))
        if no:
            out.append((no, int(m.group("m1") or m.group("m2"))))
    return list(dict.fromkeys(out))


def _korpus_maddesi(no: str, madde: int) -> dict[str, Any] | None:
    return next((c for c in mo._load_index()
                 if mo._kaynak_dosya(c).startswith(f"{no}_")
                 and str(c.get("madde_no")) == str(madde)
                 and (c.get("madde_tur") or "madde") == "madde"), None)


def _kanun_korpusta(no: str) -> bool:
    return any(mo._kaynak_dosya(c).startswith(f"{no}_") for c in mo._load_index())


def atif_onerileri(metin: str) -> tuple[list[dict[str, Any]], list[str]]:
    """(korpusta bulunan atıf önerileri, korpusta OLMAYAN atıflar için [DOĞRULA] notları)."""
    oneriler: list[dict[str, Any]] = []
    eksik: list[str] = []
    for no, madde in evrak_atiflari(metin):
        chunk = _korpus_maddesi(no, madde)
        if chunk is not None:
            oneriler.append(mo._oneri(chunk, score=1.0, raw=0.0, q_token=0, katman="atif",
                                      yargic=False, gerekce="Evrakta açıkça atıf yapılan madde"))
        else:
            durum = "korpusta bu madde yok" if _kanun_korpusta(no) else "kanun korpusta yok"
            eksik.append(f"[DOĞRULA: {no} sayılı Kanun m.{madde} — evrakta atıf var, {durum}]")
    return oneriler, eksik


__all__ = ("atif_onerileri", "cerceve_maddesi_mi", "evrak_atiflari", "kisaltma_haritasi")
