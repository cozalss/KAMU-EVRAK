"""Kurum sicili kapsam + isabet ölçümü (deterministik, ağ YOK).

Üç ölçüm:

1. KAPSAM   — sicil kaç kurumu, hangi türde tanıyor.
2. ÇAPRAZ DOĞRULAMA — insan-küratörlü `data/teskilat/<kurum>/` korpusundaki kurumların
   kaç tanesi sicilde de var? Korpus bağımsız bir "gerçek" listesi olduğu için bu, üretim
   hattının isabetine dair ölçülebilir bir sinyaldir (sicil kendi kendini doğrulayamaz).
3. YÖNLENDİRME ETKİSİ — sicil devrede/devre dışıyken kaç kurum DOĞRU tip şablonuna
   düşüyor (aday üretimi); "karışık havuz" oranındaki düşüş.

    uv run python scripts/eval_sicil_kapsam.py [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from agents.nodes.teskilat_ara import _TIP_JENERIK, _bagsiz
from core.sicil import sicil_cozumle, sicil_turu, sicil_yukle

_ROOT = Path(__file__).resolve().parents[2]
_TESKILAT_DIR = _ROOT / "data" / "teskilat"


def _korpus_kurumlari() -> list[str]:
    """Kuruma-özel korpus dizinleri (jenerik `_genel-*` şablonlar hariç)."""
    return sorted(
        p.name for p in _TESKILAT_DIR.glob("*")
        if p.is_dir() and not p.name.startswith("_") and any(p.glob("*.txt"))
    )


def _capraz_dogrulama(sicil: dict[str, Any]) -> dict[str, Any]:
    """Korpustaki kurumların sicilde bulunma oranı + bulunamayanların listesi."""
    korpus = _korpus_kurumlari()
    # Karşılaştırma çalışma zamanıyla AYNI normalizasyonu kullanır (bağlaçsız anahtar);
    # aksi hâlde "aile-ve-sosyal..." ↔ "aile-sosyal..." farkı yapay eksik üretir.
    normal = {_bagsiz(k["slug"]): k for k in sicil.get("kurumlar") or ()}
    bulunan, eksik = [], []
    for slug in korpus:
        var = sicil_cozumle(slug, sicil=sicil) or normal.get(_bagsiz(slug))
        (bulunan if var else eksik).append(slug)
    return {
        "korpus_kurum": len(korpus),
        "sicilde_var": len(bulunan),
        "oran": round(len(bulunan) / len(korpus), 3) if korpus else 0.0,
        "eksik_ornek": eksik[:15],
        "eksik_sayisi": len(eksik),
    }


def _yonlendirme_etkisi(sicil: dict[str, Any]) -> dict[str, Any]:
    """Sicil olmadan/olunca kaç kurum belirli bir tip şablonuna düşüyor.

    Sicilsiz taban: çağıran tipi bilmiyorsa (tur="") karışık havuza düşerdi. Sicil TÜR
    verdiğinde tip şablonu belirginleşir. Belirsiz kayıtlar kapsam dışıdır (çözümlenmez).
    """
    kurumlar = [k for k in sicil.get("kurumlar") or () if not k.get("belirsiz")]
    tipli = sum(1 for k in kurumlar if sicil_turu(k["slug"], sicil=sicil) in _TIP_JENERIK)
    return {
        "cozumlenebilir_kurum": len(kurumlar),
        "tip_sablonuna_dusen": tipli,
        "oran": round(tipli / len(kurumlar), 3) if kurumlar else 0.0,
        "sablonu_olmayan_turler": sorted({
            k["tur"] for k in kurumlar if k["tur"] not in _TIP_JENERIK
        }),
    }


def degerlendir() -> dict[str, Any]:
    sicil = sicil_yukle()
    if not sicil:
        return {"hata": "sicil.json yok — once scripts/uret_sicil.py calistirin"}
    return {
        "kapsam": {
            "kurum_sayisi": sicil.get("kurum_sayisi", 0),
            "belirsiz_sayisi": sicil.get("belirsiz_sayisi", 0),
            "alias_sayisi": len(sicil.get("aliaslar") or {}),
            "cakisan_alias": sicil.get("cakisan_aliaslar") or [],
            "tur_dagilimi": sicil.get("tur_dagilimi") or {},
            "guven_dagilimi": _guven_dagilimi(sicil),
        },
        "capraz_dogrulama": _capraz_dogrulama(sicil),
        "yonlendirme_etkisi": _yonlendirme_etkisi(sicil),
    }


def _guven_dagilimi(sicil: dict[str, Any]) -> dict[str, int]:
    sayac: dict[str, int] = {}
    for kurum in sicil.get("kurumlar") or ():
        anahtar = str(kurum.get("kaynak_guveni", ""))
        sayac[anahtar] = sayac.get(anahtar, 0) + 1
    return dict(sorted(sayac.items()))


def _metin(rapor: dict[str, Any]) -> str:
    if "hata" in rapor:
        return f"HATA: {rapor['hata']}"
    k, c, y = rapor["kapsam"], rapor["capraz_dogrulama"], rapor["yonlendirme_etkisi"]
    satirlar = [
        "SICIL KAPSAM RAPORU",
        f"  kurum={k['kurum_sayisi']}  belirsiz={k['belirsiz_sayisi']}  "
        f"alias={k['alias_sayisi']}  cakisan_alias={len(k['cakisan_alias'])}",
        f"  guven: {k['guven_dagilimi']}",
        "",
        "CAPRAZ DOGRULAMA (insan-kuratorlu korpus vs sicil)",
        f"  korpus kurum={c['korpus_kurum']}  sicilde var={c['sicilde_var']}  "
        f"oran={c['oran']:.1%}",
        f"  eksik={c['eksik_sayisi']} ornek: {', '.join(c['eksik_ornek'][:8]) or '-'}",
        "",
        "YONLENDIRME ETKISI",
        f"  cozumlenebilir kurum={y['cozumlenebilir_kurum']}  "
        f"tip sablonuna dusen={y['tip_sablonuna_dusen']} ({y['oran']:.1%})",
        f"  sablonu OLMAYAN turler: {', '.join(y['sablonu_olmayan_turler']) or '-'}",
    ]
    return "\n".join(satirlar)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Kurum sicili kapsam/isabet olcumu")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    rapor = degerlendir()
    print(json.dumps(rapor, ensure_ascii=False, indent=2) if args.json else _metin(rapor))
    return 1 if "hata" in rapor else 0


if __name__ == "__main__":
    raise SystemExit(main())
