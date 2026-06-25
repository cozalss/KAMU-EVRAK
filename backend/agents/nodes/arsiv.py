"""Görev 2 (yenilikçilik) — Arşivleme metadata node'u (Standart Dosya Planı 2005/7).

Şartname "arşivleme" teması: gelen/üretilen evrak kurumun Standart Dosya Planı'na
(Başbakanlık Genelgesi 2005/7) göre dosyalanır → aranabilirlik + saklama + arşiv.
Bu node pipeline çıktısından (evrak_turu + bilgi_unsurlari + hedef_birim) arşiv
metadata üretir: SDP konu kodu, saklama süresi, sayı, tarih, konu, birim.

Tasarım: DETERMİNİSTİK (config tabloları + çıkarılan unsurlar) → halüsinasyon riski yok.
SDP kodu/saklama süresi config.EVRAK_TO_SDP / EVRAK_TO_SAKLAMA'dan gelir; kuruma-özgü
ana hizmet kodu (100-599) belge konusuna göre değişebileceğinden kaba kod + [DOĞRULA:]
işareti taşır (CLAUDE.md §1 — şüpheli kod uydurulmaz).

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir — anahtarlar SABİT):
    arsiv_metadata = {
        "sdp_kodu": str, "saklama_suresi": str, "konu": str,
        "sayi": str, "tarih": str, "birim": str,
    }
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import (
    EVRAK_TO_SDP,
    birim_tr,
    saklama_suresi,
    sdp_kodu,
)

log = structlog.get_logger()

# SDP koduyla başlangıç sayı biçimi: <SDP-konu-kodu> (DETSİS+kayıt no kuruma özgü).
# Çıkarılan resmî sayıdan SDP konu kodu okunabiliyorsa (E-XXXX-622.03-YYY) o tercih edilir.
_KONU_BELIRSIZ = "[DOĞRULA: konu evraktan okunamadı]"
_TARIH_BELIRSIZ = "[DOĞRULA: tarih evrakta tespit edilemedi]"


def _sdp_from_sayi(sayi: str) -> str | None:
    """Resmî sayıdan SDP konu kodunu çıkar (E-<DETSİS>-<SDP>-<kayıt> → orta segment).

    Örn 'E-45678257-622.03-12345' → '622.03'. Segment 3+ haneli sayısal (nokta ile alt
    kod) ise SDP konu kodu kabul edilir; aksi halde None (config kaba koduna düşülür).
    """
    parts = [p for p in sayi.replace("E-", "").split("-") if p]
    for p in parts:
        core = p.replace(".", "")
        if core.isdigit() and 3 <= len(core) <= 7 and not p.startswith("0000"):
            # DETSİS no genelde uzun (8 hane düz); SDP konu kodu 3-6 hane + nokta.
            if "." in p or 3 <= len(p) <= 6:
                return p
    return None


def _sdp_kodu_for(turu: str, sayi: str) -> str:
    """SDP konu kodu: evrak sayısından okunabilirse o, değilse config kaba kodu.

    Kaba config kodu (kuruma-özgü ana hizmet 100-599) şüpheli olabileceğinden, türü
    config'de tanımlı olmayan ya da ana-hizmet aralığındaki kodlar [DOĞRULA:] ile işaretlenir.
    """
    if sayi and (okunan := _sdp_from_sayi(sayi)):
        return okunan
    kod = sdp_kodu(turu)
    # 100-599 ana hizmet aralığı kuruma özgüdür → kaba kod doğrulanmalı (uydurma değil, kaba).
    kok = kod.split(".")[0]
    if turu not in EVRAK_TO_SDP or (kok.isdigit() and 100 <= int(kok) <= 599):
        return f"{kod} [DOĞRULA: kuruma-özgü ana hizmet kodu]"
    return kod


def _konu_for(unsurlar: dict[str, Any]) -> str:
    konu = unsurlar.get("konu")
    if isinstance(konu, str) and konu.strip():
        return konu.strip()
    return _KONU_BELIRSIZ


async def arsiv_node(state: dict[str, Any]) -> dict[str, Any]:
    """SDP 2005/7 tabanlı arşiv metadata üret (additive — verify→arsiv→finalize)."""
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    hedef_birim = state.get("hedef_birim", "yazi_isleri_evrak")

    sayi = str(unsurlar.get("sayi") or "")
    tarih = str(unsurlar.get("tarih") or "") or _TARIH_BELIRSIZ
    kod = _sdp_kodu_for(turu, sayi)

    metadata: dict[str, Any] = {
        "sdp_kodu": kod,
        "saklama_suresi": saklama_suresi(turu),
        "konu": _konu_for(unsurlar),
        "sayi": sayi or f"{kod} (DETSİS+kayıt no kurum sisteminde atanır)",
        "tarih": tarih,
        "birim": birim_tr(hedef_birim),
    }
    log.info("arsiv", turu=turu, sdp=metadata["sdp_kodu"],
             saklama=metadata["saklama_suresi"], birim=hedef_birim)
    return {"arsiv_metadata": metadata}


__all__ = ("arsiv_node",)
