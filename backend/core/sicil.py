"""Kurum sicili — ülke geneli kurum TANIMA katmanı (birim/görev İÇERMEZ).

Sözleşme: docs/10-kurum-sicili.md. Sicil türetilmiş/ikincil veridir:
`data/teskilat/` korpusundaki hash-kilitli, insan-doğrulamalı kayıtların YERİNE GEÇMEZ.

Verdiği tek şey kurum kimliği: slug/kısaltma → (kanonik ad, TÜR). Tür, route ajanının doğru
jenerik şablonu seçmesini sağlar (`teskilat_ara._TIP_JENERIK`). Otomatik birim havalesi
yetkisi KAZANDIRMAZ — `kurum_korpusta_var()` ve `uclu_grounding()` sicilden habersizdir (INV-1/2).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypedDict

import structlog

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[2]
_SICIL_FILE = _ROOT / "data" / "teskilat" / "sicil.json"

# Kapalı küme — üretim betiği bunun dışına çıkarsa ValueError (sessizce "diger"e DÜŞMEZ).
GECERLI_TURLER: frozenset[str] = frozenset({
    "bakanlik", "bagli_kurulus", "ilgili_kurulus", "iliskili_kurulus", "ust_kurul",
    "kit", "kalkinma_ajansi", "cumhurbaskanligi_ofis_kurul", "valilik", "kaymakamlik",
    "il_mudurlugu", "defterdarlik", "belediye", "il_ozel_idare", "universite",
    "bassavcilik", "elektrik_dagitim", "dogalgaz_dagitim", "su_kanalizasyon", "diger",
})

# INV-3: "resmi_dogrulanmis" bu kümede YOK — sicil kaydı o güveni asla taşıyamaz.
GECERLI_GUVEN: frozenset[str] = frozenset({"resmi", "ikincil", "turetilmis"})

# INV-4: sicilde birim/görev alanı bulunamaz (birim uydurma yasağı).
YASAK_ALANLAR: frozenset[str] = frozenset({"birim_ad", "gorev", "birimler", "text"})

_ZORUNLU_ALANLAR = ("slug", "ad", "tur", "kaynak_guveni")


class SicilKaydi(TypedDict, total=False):
    slug: str
    ad: str
    tur: str
    alt_tur: str
    il: str
    ilce: str
    aliaslar: list[str]
    web: str
    ust_kurum: str
    kaynak_guveni: str
    kaynak_url: str
    erisim: str
    belirsiz: bool


def kayit_dogrula(kayit: dict[str, Any]) -> list[str]:
    """Tek kaydın sözleşmeye uygunluğu — hata listesi (boş liste = geçerli)."""
    hatalar: list[str] = []
    for alan in _ZORUNLU_ALANLAR:
        if not str(kayit.get(alan, "") or "").strip():
            hatalar.append(f"zorunlu alan boş: {alan}")
    tur = kayit.get("tur", "")
    if tur and tur not in GECERLI_TURLER:
        hatalar.append(f"tur kapalı küme dışı: {tur!r}")
    guven = kayit.get("kaynak_guveni", "")
    if guven and guven not in GECERLI_GUVEN:
        hatalar.append(f"kaynak_guveni geçersiz: {guven!r}")
    yasak = YASAK_ALANLAR & set(kayit)
    if yasak:
        hatalar.append(f"sicilde bulunamaz (birim/görev): {sorted(yasak)}")
    return hatalar


def _dosya_revizyonu() -> tuple[Any, ...]:
    """Dosya değişimini süreç yeniden başlatmadan fark eden stat kimliği."""
    try:
        stat = _SICIL_FILE.stat()
        return (stat.st_mtime_ns, stat.st_size)
    except OSError:
        return (0, 0)


_YUKLU: dict[tuple[Any, ...], dict[str, Any]] = {}


def sicil_yukle() -> dict[str, Any]:
    """sicil.json ham payload. Dosya yoksa/bozuksa boş dict (çözümleme sessizce devre dışı)."""
    revizyon = _dosya_revizyonu()
    if revizyon in _YUKLU:
        return _YUKLU[revizyon]
    payload: dict[str, Any] = {}
    if _SICIL_FILE.is_file():
        try:
            okunan = json.loads(_SICIL_FILE.read_text(encoding="utf-8"))
            payload = okunan if isinstance(okunan, dict) else {}
        except (OSError, ValueError) as exc:
            log.warning("sicil.read_failed", hata=str(exc))
    _YUKLU.clear()
    _YUKLU[revizyon] = payload
    return payload


_INDEKS_MEMO: dict[int, dict[str, SicilKaydi]] = {}


def _indeks(sicil: dict[str, Any]) -> dict[str, SicilKaydi]:
    """slug + alias → kayıt haritası. BELİRSİZ kayıtlar (aynı slug iki kurumda) DIŞARIDA."""
    anahtar = id(sicil)
    if anahtar in _INDEKS_MEMO:
        return _INDEKS_MEMO[anahtar]
    harita: dict[str, SicilKaydi] = {}
    for kayit in sicil.get("kurumlar") or ():
        if not isinstance(kayit, dict) or kayit.get("belirsiz"):
            continue
        slug = str(kayit.get("slug", "") or "")
        if slug:
            harita[slug] = kayit  # type: ignore[assignment]
    for alias, hedef in (sicil.get("aliaslar") or {}).items():
        kayit = harita.get(str(hedef))
        if kayit is not None and alias not in harita:
            harita[str(alias)] = kayit
    if len(_INDEKS_MEMO) >= 4:
        _INDEKS_MEMO.clear()
    _INDEKS_MEMO[anahtar] = harita
    return harita


def sicil_cozumle(
    anahtar: str,
    *,
    sicil: dict[str, Any] | None = None,
) -> SicilKaydi | None:
    """slug veya kısaltma-alias → sicil kaydı. Bulunamaz/belirsizse None.

    Belirsiz kayıt (ör. iki ildeki "Gölbaşı Belediyesi") bilinçli olarak çözümlenmez:
    yanlış kuruma yönlendirmektense hiç yönlendirmemek doğrudur (INV-5 ile aynı mantık).
    """
    anahtar = (anahtar or "").strip()
    if not anahtar:
        return None
    payload = sicil if sicil is not None else sicil_yukle()
    return _indeks(payload).get(anahtar)


def sicil_turu(anahtar: str, *, sicil: dict[str, Any] | None = None) -> str:
    """Kurumun sicildeki TÜRÜ; bilinmiyorsa "" (çağıran mevcut davranışına düşer)."""
    kayit = sicil_cozumle(anahtar, sicil=sicil)
    return str(kayit.get("tur", "")) if kayit else ""


def onbellegi_temizle() -> None:
    """Test/operasyon: sicil ve indeks önbelleklerini temizle."""
    _YUKLU.clear()
    _INDEKS_MEMO.clear()


__all__ = (
    "GECERLI_GUVEN", "GECERLI_TURLER", "SicilKaydi", "YASAK_ALANLAR",
    "kayit_dogrula", "onbellegi_temizle", "sicil_cozumle", "sicil_turu", "sicil_yukle",
)
