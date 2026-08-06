"""Resmî bir .gov.tr adresinden mevzuat PDF'i indirip metnini çıkarır.

NEDEN AYRI BİR ARAÇ: mevzuat.gov.tr TLS sertifika zincirini eksik sunuyor ve hem Node hem
Python istemcilerinde doğrulama başarısız oluyor (ölçüldü 2026-08-06: CERTIFICATE_VERIFY_FAILED).
Sertifika doğrulamasını kapatmak bu depoda YASAK — kaynak güveni zincirinin ilk halkası
budur. Bunun yerine kanun metnini KENDİ resmî .gov.tr alanında yayımlayan kurum sitesi
kullanılır (ör. 2560 için eski.gov.tr, 6085 için sayistay.gov.tr).

PDF metni pypdfium2 ile çıkarılır — PyMuPDF (AGPL) bilerek kullanılmaz (CLAUDE.md §4).

Kullanım:
    uv run python scripts/mevzuat_pdf_cek.py <url> <cikti.txt>
    uv run python scripts/mevzuat_pdf_cek.py <url> <cikti.txt> --ara "Teşkilat" "Hizmet birimleri"
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import httpx
import pypdfium2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_BASLIK = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
_RESMI_ALAN = re.compile(r"^https://([a-z0-9-]+\.)*gov\.tr(/|$)", re.I)


def indir(url: str, hedef: Path) -> str:
    """PDF'i indir, metnini çıkar, hedefe yaz ve döndür. TLS doğrulaması KAPATILMAZ."""
    if not _RESMI_ALAN.match(url):
        raise ValueError(f"Resmî .gov.tr HTTPS adresi degil: {url}")
    ham = httpx.get(url, timeout=60, follow_redirects=True, headers=_BASLIK).raise_for_status()
    gecici = hedef.with_suffix(".pdf")
    gecici.write_bytes(ham.content)
    belge = pypdfium2.PdfDocument(str(gecici))
    metin = "\n".join(sayfa.get_textpage().get_text_range() for sayfa in belge)
    belge.close()
    hedef.write_text(metin, encoding="utf-8", newline="\n")
    return metin


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("cikti", type=Path)
    ap.add_argument("--ara", nargs="*", default=[], help="metinde aranacak anahtar sözcükler")
    ap.add_argument("--baglam", type=int, default=320, help="eşleşme başına gösterilecek karakter")
    args = ap.parse_args()

    metin = indir(args.url, args.cikti)
    print(f"[OK] {len(metin)} karakter -> {args.cikti}")
    for kelime in args.ara:
        vurus = [m.start() for m in re.finditer(re.escape(kelime), metin, re.I)]
        print(f"\n=== '{kelime}' : {len(vurus)} eşleşme ===")
        for konum in vurus[:6]:
            parca = metin[konum: konum + args.baglam]
            print("  " + re.sub(r"\s+", " ", parca))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
