"""Görev (yenilikçilik) — Denetim izi (tamper-evident SHA-256 hash-chain) node'u.

Kamu gerçeği: Sayıştay denetimi + KVKK işleme kaydı + idari şeffaflık → her kararın
DEĞİŞTİRİLEMEZ biçimde kaydı gerekir. Bu node pipeline'ın kritik kararlarını (tür,
çıkarım, eksik, mevzuat, özet, birim, yazı, doğrulama, arşiv, süre) sırayla zincirler:
her halka önceki halkanın hash'ini içerir → bir adım sonradan değişirse zincir KIRILIR
(bütünlük=False) ve hangi adımın bozulduğu tespit edilir.

Tasarım: DETERMİNİSTİK (stdlib hashlib, sıralı/kanonik JSON) — LLM yok, ek bağımlılık yok.
Additive passthrough (state'i bozmaz); arsiv/sla deseniyle finalize öncesi çalışır.

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir — anahtarlar SABİT):
    denetim_izi = {
        "zincir": [{"adim": str, "veri": dict, "hash": str, "onceki": str}, ...],
        "kok_hash": str,        # son halka hash'i (tüm akışın parmak izi)
        "adim_sayisi": int,
        "butunluk": bool,       # zincir kendi içinde tutarlı mı (üretimde True)
        "algoritma": "SHA-256 hash-chain",
    }
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

import structlog

log = structlog.get_logger()

# Genesis (sıfır) hash — zincirin ilk halkasının "öncekisi".
_GENESIS = "0" * 64


def _hash(prev: str, payload: dict[str, Any]) -> str:
    """SHA-256(önceki_hash + kanonik_json(payload)) — kanonik: sort_keys, sabit ayraç."""
    canon = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str,
                       separators=(",", ":"))
    return hashlib.sha256((prev + canon).encode("utf-8")).hexdigest()


# Denetlenecek adımlar (sıra ÖNEMLİ — pipeline kara-kutusu). Her biri state'ten
# kararı özetleyen küçük, deterministik bir sözlük çıkarır (ham PII değil, karar özeti).
_ADIMLAR: tuple[tuple[str, Callable[[dict[str, Any]], dict[str, Any]]], ...] = (
    ("siniflandir", lambda s: {
        "evrak_turu": s.get("evrak_turu"),
        "tur_confidence": round(float(s.get("tur_confidence", 0.0) or 0.0), 3),
    }),
    ("cikar", lambda s: {"unsur_anahtarlari": sorted((s.get("bilgi_unsurlari") or {}).keys())}),
    ("eksik_tespit", lambda s: {"eksik_alanlar": sorted(s.get("eksik_alanlar") or [])}),
    ("mevzuat_oner", lambda s: {
        "mevzuat": [str(m.get("baslik", "")) for m in (s.get("mevzuat_onerileri") or [])],
    }),
    ("ozetle", lambda s: {"ozet_uzunluk": len(str(s.get("ozet", "") or ""))}),
    ("route_birim", lambda s: {"hedef_birim": s.get("hedef_birim")}),
    ("yazi_taslak", lambda s: {
        "yazi_turu": s.get("yazi_turu"),
        "format_uyumlu": bool(s.get("format_uyumlu", False)),
    }),
    ("verify", lambda s: {"uyari_sayisi": len(s.get("verify_uyari") or [])}),
    # Risk bandı + memur onay kararı zincire girer → "hangi risk, kim onayladı" denetlenebilir
    # (Sayıştay/KVKK m.12 işleme kaydı). onay_durumu yoksa "otomatik" (yeşil → koşulsuz geçti).
    ("risk_guard", lambda s: {
        "risk_bant": (s.get("risk_metadata") or {}).get("bant"),
        "gerekce_sayisi": len((s.get("risk_metadata") or {}).get("gerekceler") or []),
    }),
    ("onay", lambda s: {"onay_durumu": s.get("onay_durumu") or "otomatik"}),
    ("arsiv", lambda s: {"sdp_kodu": (s.get("arsiv_metadata") or {}).get("sdp_kodu")}),
    ("sla_triyaj", lambda s: {"sla_durum": (s.get("sla_metadata") or {}).get("durum")}),
)


def build_chain(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Pipeline kararlarından tamper-evident hash-zincirini kur (deterministik)."""
    zincir: list[dict[str, Any]] = []
    prev = _GENESIS
    for adim, extract in _ADIMLAR:
        veri = extract(state)
        h = _hash(prev, {"adim": adim, "veri": veri})
        zincir.append({"adim": adim, "veri": veri, "hash": h, "onceki": prev})
        prev = h
    return zincir


def dogrula_zincir(zincir: list[dict[str, Any]]) -> tuple[bool, int]:
    """Zinciri yeniden hesaplayıp bütünlüğü doğrula → (bütün_mü, kırık_adım_index | -1).

    Bir halkanın `veri`si veya `hash`i sonradan değiştiyse yeniden hesaplanan hash
    tutmaz → (False, ilk_kırık_index). Tüm zincir tutarlıysa (True, -1).
    """
    prev = _GENESIS
    for i, e in enumerate(zincir):
        beklenen = _hash(prev, {"adim": e.get("adim"), "veri": e.get("veri")})
        if beklenen != e.get("hash") or e.get("onceki") != prev:
            return (False, i)
        prev = beklenen
    return (True, -1)


async def denetim_izi_node(state: dict[str, Any]) -> dict[str, Any]:
    """Tamper-evident SHA-256 denetim izi üret (additive, deterministik)."""
    zincir = build_chain(state)
    butun, _kirik = dogrula_zincir(zincir)
    meta: dict[str, Any] = {
        "zincir": zincir,
        "kok_hash": zincir[-1]["hash"] if zincir else _GENESIS,
        "adim_sayisi": len(zincir),
        "butunluk": butun,
        "algoritma": "SHA-256 hash-chain",
    }
    log.info("denetim_izi", adim=len(zincir), butunluk=butun, kok=meta["kok_hash"][:12])
    return {"denetim_izi": meta}


__all__ = ("build_chain", "denetim_izi_node", "dogrula_zincir")
