"""Bir kurumun resmî sayfasından ADAY birim adlarını çıkarır (dosya YAZMAZ, sadece gösterir).

`teskilat_kaynak_dogrula.py` var olan bir dosyayı kaynağa karşı DOĞRULAR; bu araç ise dosya
henüz yokken kaynağın ne söylediğini görmek için kullanılır. Çıkarım mantığı (unvan ekleri,
HTML temizliği, kısaltma açma) o modülden İÇE AKTARILIR — kopyalanmaz; iki araç aynı birim
tanımını kullanmak zorundadır, yoksa biri "var" derken diğeri "yok" der.

ÖNEMLİ: çıktı bir ÖNERİDİR, dosyaya olduğu gibi yazılmaz. Sayfadan regexle toplanan diziler
menü başlığı, haber metni veya başka kurumun adı olabilir; her aday göz denetiminden geçer.
Kaynağın söylemediği bir birim dosyaya YAZILMAZ (CLAUDE.md §1).

SSL: doğrulama KAPATILMAZ. Sertifikası doğrulanamayan kurum kaynak olarak kaydedilmez.

Kullanım:
    uv run python scripts/kurum_teskilat_cek.py https://www.ornek.gov.tr/teskilat
    uv run python scripts/kurum_teskilat_cek.py <url> --ham 4000   # ham metnin başını da bas
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from teskilat_kaynak_dogrula import (
    _ADAY_RE,
    _BASLIK,
    _ETIKET_RE,
    _pdf_metni,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _indir(url: str) -> tuple[str, str]:
    """(gövde, içerik-türü). TLS doğrulaması AÇIK — kapatma seçeneği yoktur."""
    with httpx.Client(follow_redirects=True, timeout=45.0, headers=_BASLIK, verify=True) as c:
        yanit = c.get(url)
        yanit.raise_for_status()
        tur = yanit.headers.get("content-type", "").lower()
    if "pdf" in tur or url.lower().endswith(".pdf"):
        return _pdf_metni(yanit.content), "pdf"
    return yanit.text, tur


def sayfa_metni(url: str) -> str:
    """URL'i indir ve düz metne çevir."""
    govde, tur = _indir(url)
    return govde if tur == "pdf" else _ETIKET_RE.sub(" ", govde)


def adaylar(metin: str) -> list[str]:
    """Unvan ekiyle biten aday birim adları — görünüm sırasını koruyarak tekilleştirilmiş."""
    bulunan = (re.sub(r"\s+", " ", m.group(0)).strip() for m in _ADAY_RE.finditer(metin))
    return list(dict.fromkeys(bulunan))


# Menüsü JavaScript ile çizilen sitelerde birim adları GÖRÜNÜR metinde bulunmaz ama
# bağlantı ADRESLERİNDE durur (ölçüldü 2026-08-06: sgk.gov.tr/birimler görünür metinden
# 3 aday verirken href listesinden 15 birimin tamamı çıktı). Slug'lar büyük harfli ve
# tireli olur: .../organizasyonYapisi/BILGI-TEKNOLOJILERI-GENEL-MUDURLUGU-2026-01-28-...
_HREF_RE = re.compile(r'href="([^"]+)"', re.I)
_SLUG_PARCA_RE = re.compile(r"[A-Z][A-Z0-9-]{8,}")
_TARIH_KUYRUK_RE = re.compile(r"-\d{4}(?:-\d{2}){2,5}$")


def baglanti_adaylari(govde: str) -> list[str]:
    """href'lerdeki BÜYÜK-HARFLİ slug parçalarını okunur birim adına çevirir.

    Çıktı yine ADAYdır: bağlantı slug'ı kısaltma veya sayfa adı olabilir. Türkçe harfler
    slug'da kaybolduğu için (I/İ ayrımı dahil) adlar göz denetiminde düzeltilmelidir —
    bu yüzden araç dosya yazmaz, yalnız gösterir.
    """
    bulunan: list[str] = []
    for ham in _HREF_RE.findall(govde):
        for parca in _SLUG_PARCA_RE.findall(ham):
            temiz = _TARIH_KUYRUK_RE.sub("", parca).replace("-", " ").strip()
            if len(temiz.split()) >= 2:
                bulunan.append(temiz)
    return list(dict.fromkeys(bulunan))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--ham", type=int, default=0, help="ham metnin ilk N karakterini de bas")
    ap.add_argument("--baglanti", action="store_true",
                    help="görünür metin yerine bağlantı adreslerinden çıkar (JS menülü siteler)")
    args = ap.parse_args()

    govde, tur = _indir(args.url)
    if args.baglanti:
        if tur == "pdf":
            raise SystemExit("--baglanti yalnız HTML sayfalar içindir.")
        liste = baglanti_adaylari(govde)
        metin = govde
    else:
        metin = govde if tur == "pdf" else _ETIKET_RE.sub(" ", govde)
        liste = adaylar(metin)
    print(f"[OK] {len(metin)} karakter · {len(liste)} aday birim · {args.url}")
    for ad in liste:
        print(f"  · {ad}")
    if args.ham:
        print("\n--- HAM ---")
        print(re.sub(r"\s+", " ", metin)[: args.ham])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
