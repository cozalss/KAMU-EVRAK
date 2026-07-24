"""Havale yeteneği raporu — "hangi kuruma NE kadar iyi havale edebiliyoruz?"

Sicil kapsamı (kurum TANIMA) ile havale yeteneği (BİRİM bulma) AYRI şeylerdir. Bu betik
sicildeki kurumları örnekleyip her biri için pipeline'ın üretebileceği EN İYİ sonucu
dört kovaya ayırır:

  1. OTOMATIK   — hash-kilitli, insan-doğrulamalı kurum kaynağı var → sistem birimi
                  kendi yazabilir (uclu_grounding geçebilir).
  2. GERCEK_ADAY— kuruma ÖZEL birim listesi var ama doğrulanmamış → gerçek birim adı
                  önerilir, memur onaylar.
  3. SABLON     — kuruma özel kayıt yok; kurum TİPİNE göre jenerik şablondan aday.
  4. YOK        — hiçbir aday üretilemiyor.

    uv run python scripts/eval_havale_yetenegi.py [--ornek 400] [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from agents.nodes.teskilat_ara import kurum_korpusta_var, teskilat_birim_ara
from core.sicil import sicil_yukle

# Tür başına gerçekçi bir konu (BM25 boş dönmesin diye ayırt edici sözcükler).
_KONULAR: dict[str, str] = {
    "belediye": "ruhsat imar yol çöp park temizlik",
    "valilik": "izin kamulaştırma güvenlik denetim",
    "kaymakamlik": "izin sosyal yardım denetim",
    "il_mudurlugu": "başvuru denetim izin kayıt",
    "defterdarlik": "vergi tahsilat borç muhasebe",
    "universite": "öğrenci kayıt burs mezuniyet",
    "il_ozel_idare": "yol köy altyapı imar",
    "bakanlik": "görüş mevzuat başvuru izin",
    "ust_kurul": "lisans denetim şikayet izin",
    "kit": "abonelik arıza fatura hizmet",
    "elektrik_dagitim": "elektrik arıza abonelik sayaç aydınlatma",
    "dogalgaz_dagitim": "doğalgaz abonelik sayaç arıza",
    "su_kanalizasyon": "su abonelik kaçak sayaç kanalizasyon",
    "kalkinma_ajansi": "destek proje başvuru hibe",
    "bassavcilik": "soruşturma dosya suç duyurusu",
}
_VARSAYILAN_KONU = "başvuru talep izin denetim kayıt"


def _kova(kurum: dict[str, Any]) -> str:
    slug = str(kurum.get("slug", ""))
    if kurum.get("belirsiz"):
        return "YOK"  # belirsiz kurum bilinçli olarak çözümlenmez
    konu = _KONULAR.get(str(kurum.get("tur", "")), _VARSAYILAN_KONU)
    adaylar = teskilat_birim_ara(slug, konu, tur=str(kurum.get("tur", "")))
    if not adaylar:
        return "YOK"
    if kurum_korpusta_var(slug) and adaylar[0].get("kaynak_tipi") == "kurum_ozel":
        return "OTOMATIK"
    return "GERCEK_ADAY" if adaylar[0].get("kaynak_tipi") == "aday" else "SABLON"


def degerlendir(ornek: int) -> dict[str, Any]:
    sicil = sicil_yukle()
    kurumlar = list(sicil.get("kurumlar") or ())
    if not kurumlar:
        return {"hata": "sicil.json yok — once scripts/uret_sicil.py"}
    # Deterministik örnekleme: her N'inci kayıt (tür dağılımını korur, rastgelelik yok).
    adim = max(1, len(kurumlar) // ornek) if ornek else 1
    secilen = kurumlar[::adim]
    kovalar: Counter[str] = Counter()
    tur_kova: dict[str, Counter[str]] = {}
    for kurum in secilen:
        kova = _kova(kurum)
        kovalar[kova] += 1
        tur_kova.setdefault(str(kurum.get("tur", "")), Counter())[kova] += 1
    return {
        "sicil_kurum": len(kurumlar),
        "orneklenen": len(secilen),
        "kovalar": dict(kovalar),
        "tur_bazinda": {t: dict(c) for t, c in sorted(tur_kova.items())},
    }


def _metin(r: dict[str, Any]) -> str:
    if "hata" in r:
        return f"HATA: {r['hata']}"
    n = r["orneklenen"] or 1
    k = r["kovalar"]
    satirlar = [
        f"HAVALE YETENEGI  (sicil={r['sicil_kurum']} kurum, orneklem={n})",
        "",
        f"  OTOMATIK      {k.get('OTOMATIK', 0):5d}  (%{100 * k.get('OTOMATIK', 0) / n:5.1f})"
        "  dogrulanmis kaynak -> sistem birimi kendi yazar",
        f"  GERCEK_ADAY   {k.get('GERCEK_ADAY', 0):5d}  (%{100 * k.get('GERCEK_ADAY', 0) / n:5.1f})"
        "  kuruma OZEL birim listesi -> memur onaylar",
        f"  SABLON        {k.get('SABLON', 0):5d}  (%{100 * k.get('SABLON', 0) / n:5.1f})"
        "  kurum tipi sablonu -> genel oneri",
        f"  YOK           {k.get('YOK', 0):5d}  (%{100 * k.get('YOK', 0) / n:5.1f})"
        "  aday uretilemiyor",
        "",
        "TUR BAZINDA:",
    ]
    for tur, c in r["tur_bazinda"].items():
        ozet = " ".join(f"{ad}={sayi}" for ad, sayi in sorted(c.items()))
        satirlar.append(f"  {tur:22s} {ozet}")
    return "\n".join(satirlar)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Kurum basina havale yetenegi raporu")
    parser.add_argument("--ornek", type=int, default=400, help="ornek sayisi (0=hepsi)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    rapor = degerlendir(args.ornek)
    print(json.dumps(rapor, ensure_ascii=False, indent=2) if args.json else _metin(rapor))
    return 1 if "hata" in rapor else 0


if __name__ == "__main__":
    raise SystemExit(main())
