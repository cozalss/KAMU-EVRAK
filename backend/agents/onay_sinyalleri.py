"""Onay sinyalleri — risk bandının YÖNLENDİRME, asıl-evrak ve yargı/icra girdileri (SAF).

Teşhis (2026-10-05 incelemesi, 59 belgelik gerçek koşum): `compute_risk` yalnız taslak
sinyallerine bakıyordu. 58 belgede `yonlendirme.insan_onayi_gerekli=True` iken 47'si YEŞİL
çıktı; yeşil bant onay kapısını atladığı için devir (DISARIDA/KARMA) yazıları, çözülemeyen
(BELIRSIZ) talepler, imzası doğrulanamayan dilekçeler ve mahkeme/icra cevapları memura
"Ayrıca onaylamanıza gerek yok" diye sunuluyordu.

İLKE: otomatik ilerleme YALNIZ şu üçü birlikte sağlanınca olur —
  (1) TÜM talepler ICERIDE (BELIRSIZ ya da DISARIDA yok),
  (2) her talebin havale birimi kaynakta DOĞRULANMIŞ,
  (3) diğer bütün sinyaller temiz.
Aksi her durumda bu modül en az bir SARI (sicilde olmayan devir alıcısında KIRMIZI)
gerekçe üretir; bant SARI/KIRMIZI olunca `graph._risk_route` onay kapısına yönlendirir.

Kural tabloları kapalı kümedir (yönlendirme karar kümesi, evrak türü, gelen evrak cinsi);
belge-özel kelime listesi YOKTUR. Ağ/LLM yok.
"""
from __future__ import annotations

from typing import Any

from agents.yonlendirme import devir_ozeti

# Yönlendirme nesnesinde alıcı kurumun sicilden geldiğini söyleyen tek değer.
_SICIL_KAYNAK = "sicil"
# Mahkeme/savcılık/icra muhataplı yazışma türleri (config.EVRAK_TURLERI kapalı kümesinden)
# ve gelen evrak cinsleri (yazi.gelen_evrak.BELGE_CINSLERI kapalı kümesinden).
_YARGI_ICRA_TURLERI = frozenset({"muzekkere", "icra_evraki", "dava_evraki", "tebligat"})
_YARGI_ICRA_CINSLERI = frozenset({"muzekkere", "icra_yazisi"})


def _talepler(yon: dict[str, Any]) -> list[dict[str, Any]]:
    return [t for t in (yon.get("talepler") or []) if isinstance(t, dict)]


def _dogrulanmamis_alicilar(yon: dict[str, Any]) -> list[str]:
    """DISARIDA talepte alıcı kurum sicilden gelmiyorsa (LLM'in serbest adı) adları."""
    adlar = [str((t.get("alici_kurum") or {}).get("ad") or "")
             for t in _talepler(yon) if t.get("karar") == "DISARIDA"
             and (t.get("alici_kurum") or {}).get("kaynak", _SICIL_KAYNAK) != _SICIL_KAYNAK]
    return list(dict.fromkeys(a for a in adlar if a))


def _cozulemeyen_var(yon: dict[str, Any]) -> bool:
    """Karar verilemeyen talep var mı (belge kararı BELIRSIZ'i KARMA içinde yutabilir)."""
    if yon.get("karar") not in ("ICERIDE", "DISARIDA", "KARMA"):
        return True
    return any(t.get("karar") not in ("ICERIDE", "DISARIDA") for t in _talepler(yon))


def _dogrulanmamis_birimler(yon: dict[str, Any]) -> list[str]:
    """ICERIDE talep(ler)in doğrulanmamış ya da hiç seçilmemiş havale birimi."""
    ic = [t for t in _talepler(yon) if t.get("karar") == "ICERIDE"]
    if not ic and yon.get("karar") == "ICERIDE":  # talep listesi yoksa belge birimi
        ic = [{"birim": yon.get("birim")}]
    return [str((t.get("birim") or {}).get("ad") or "seçilmedi")
            for t in ic if not (t.get("birim") or {}).get("dogrulanmis")]


def yonlendirme_sinyalleri(yon: dict[str, Any] | None) -> tuple[list[str], list[str]]:
    """Yönlendirme nesnesinden (kirmizi, sari) gerekçeleri.

    Yönlendirme nesnesi yoksa (ROUTE_AJAN kapalı eski yol) iddia üretilmez → ([], []).
    Nesne varsa insan onayı bayrağı ile bant ÇELİŞEMEZ: bayrak True iken en az bir SARI
    gerekçe döner (nedeni bilinmese bile).
    """
    yon = yon or {}
    if not yon:
        return [], []
    kirmizi = [f"Yetkili kurum sicilde doğrulanmadı: {ad} — kurumun resmî adı ve yetkisi "
               "doğrulanmadan devir yazısı gönderilemez" for ad in _dogrulanmamis_alicilar(yon)]
    sari: list[str] = []
    devir = devir_ozeti(yon)
    if devir:
        sari.append(f"Yönlendirme: görev alanı dışı — {', '.join(devir['kurumlar'])} "
                    "kurumuna devir önerisi, memur onayı gerekir")
    if _cozulemeyen_var(yon):
        sari.append("Yönlendirme: yetkisi/birimi belirlenemeyen talep var — memur seçmeli")
    birimler = _dogrulanmamis_birimler(yon)
    if birimler:
        sari.append("Yönlendirme: havale birimi kaynakta doğrulanmadı ("
                    + ", ".join(dict.fromkeys(birimler)) + ") — memur onayı gerekir")
    if yon.get("insan_onayi_gerekli") and not (sari or kirmizi):
        sari.append("Yönlendirme: otomatik havale koşulları sağlanmadı — memur onayı gerekir")
    return kirmizi, sari


def asil_evrak_sinyalleri(notlar: list[str] | None) -> list[str]:
    """eksik_tespit'in bilgi notları: asıl evrak üzerinde memurun bakması gereken olgular
    (ör. imza metinden doğrulanamadı — 3071 m.6/c). Her not bir SARI gerekçedir."""
    return [f"Asıl evrak kontrolü: {n.strip()}" for n in (notlar or [])
            if isinstance(n, str) and n.strip()]


def yargi_icra_sinyali(evrak_turu: str, gelen_evrak: dict[str, Any] | None) -> list[str]:
    """Mahkeme/savcılık/icra yazışmasına cevap: hukuki sonuç doğurur → memur onayı."""
    cinsi = (gelen_evrak or {}).get("belge_cinsi") if isinstance(gelen_evrak, dict) else None
    if evrak_turu in _YARGI_ICRA_TURLERI or cinsi in _YARGI_ICRA_CINSLERI:
        return ["Yargı/icra yazışması: mahkeme, savcılık ya da icra dairesine verilecek cevap "
                "hukuki sonuç doğurur — içerik ve süre memurca onaylanmalı"]
    return []


__all__ = ("asil_evrak_sinyalleri", "yargi_icra_sinyali", "yonlendirme_sinyalleri")
