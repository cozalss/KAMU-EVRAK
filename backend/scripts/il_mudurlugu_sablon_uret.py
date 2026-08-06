"""Bir bakanlık taşra müdürlüğü türü için mevzuat-teşkilat şablonu üretir.

NEDEN BU ARAÇ: sicildeki 4066 kurumun 1377'si il müdürlüğüdür ve bunlar 17 TÜRÜN 81 ile
tekrarıdır (17 x 81 = 1377). Her tür için birim listesi o bakanlığın taşra yönetmeliğinde
TÜR GENELİ olarak belirlenir — yani tek doğrulanmış kaynak 81 kurumu birden açar. Bu,
belediye/üniversite/il özel idaresi şablonlarıyla aynı mekanizmadır (docs/11).

Şablon kalıbı mevcut sözleşmeye uyar:
    @KAPSAM_KALIP: {alan}-<tür kuyruğu>      ör. {alan}-il-milli-egitim-mudurlugu
    @KAPSAM_AD_KALIP: {ad} <Resmî Ad>
    @KAPSAM_ALAN_DOSYA: _kapsam/iller.txt    (81 il, hâlihazırda doğrulanmış)

GÖREV METNİ: yönetmelikte her birimin kendi maddesi varsa BİREBİR alınır. Yoksa görev
UYDURULMAZ; birimin yalnız hangi maddede sayıldığı yazılır.

Kullanım (birim/görev çiftleri JSON olarak verilir — sayfadan körlemesine yazılmaz):
    uv run python scripts/il_mudurlugu_sablon_uret.py <sablon-slug> --girdi <json> [--yaz]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
ERISIM = "2026-08-06"


def sablon_metni(tanim: dict) -> str:
    satirlar = [
        f"@KURUM: {tanim['sablon_kurum']}",
        f"@BELGE: {tanim['belge']}",
        f"@KAYNAK_KIMLIK: {tanim['url']}",
        f"@ERISIM: {ERISIM}",
        "@KAYNAK_TURU: resmi_mevzuat_teskilat",
        "@DOGRULAMA: resmi",
        f"@KAPSAM_KALIP: {{alan}}-{tanim['kuyruk']}",
        f"@KAPSAM_AD_KALIP: {{ad}} {tanim['ad_kalip']}",
        f"@KAPSAM_ALAN_DOSYA: {tanim['kapsam_dosya']}",
        f"@NOT: {tanim['not']}",
        "",
    ]
    for birim in tanim["birimler"]:
        satirlar += [f"BİRİM: {birim['ad']}", f"GÖREV: {birim['gorev']}", ""]
    return "\n".join(satirlar).rstrip("\n") + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sablon_slug", help="_mevzuat- ile başlamalı")
    ap.add_argument("--girdi", type=Path, required=True)
    ap.add_argument("--yaz", action="store_true")
    args = ap.parse_args()

    if not args.sablon_slug.startswith("_mevzuat-"):
        raise SystemExit("Şablon dizini '_mevzuat-' ile başlamalı (INV-7).")
    tanim = json.loads(args.girdi.read_text(encoding="utf-8"))
    if not tanim.get("url", "").startswith("https://"):
        raise SystemExit("Kaynak resmî HTTPS adresi olmalı.")
    kapsam = _TESKILAT_DIR / tanim["kapsam_dosya"]
    if not kapsam.is_file():
        raise SystemExit(f"Kapsam dosyası yok: {tanim['kapsam_dosya']}")

    metin = sablon_metni(tanim)
    yol = _TESKILAT_DIR / args.sablon_slug / "birimler.txt"
    if args.yaz:
        yol.parent.mkdir(parents=True, exist_ok=True)
        yol.write_text(metin, encoding="utf-8", newline="\n")
    gorevli = sum(1 for b in tanim["birimler"] if b.get("gorev_kaynakta"))
    print(f"{'YAZILDI' if args.yaz else 'HAZIR  '} {args.sablon_slug}: "
          f"{len(tanim['birimler'])} birim ({gorevli} tanesinin görevi kaynaktan) "
          f"· kalıp {{alan}}-{tanim['kuyruk']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
