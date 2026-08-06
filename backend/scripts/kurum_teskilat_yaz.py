"""Gözden geçirilmiş bir birim listesinden herhangi bir kurumun teşkilat dosyasını yazar.

`belediye_teskilat_yaz.py` belediyelere özeldir (5393 m.48/m.51 ve 5018 m.60 kanuni
görevlerini kendisi yazar). Bu araç TÜR-BAĞIMSIZDIR: bakanlık bağlı kuruluşu, düzenleyici
kurum, KİT, yüksek kurul — hepsinde aynı sözleşmeyi uygular.

DEĞİŞMEZLER:
  · Liste --birim ile AÇIKÇA verilir. Araç sayfadan kendi başına birim toplamaz; toplama
    işi `kurum_teskilat_cek.py`nin işidir ve çıktısı GÖZ DENETİMİNDEN geçmek zorundadır
    (menü metni, çerez uyarısı, satır kırılması artığı ve BAŞKA KURUMUN adı aday listesine
    karışabiliyor — ölçüldü: AFAD sayfasından "Kişisel Verileri Koruma Kurulu", DSİ
    sayfasından "Doğa Koruma ve Milli Parklar Genel Müdürlüğü" çıktı).
  · GÖREV UYDURULMAZ. Kaynak yalnız birim adını veriyorsa görev metni bunu açıkça söyler.
    Kaynakta görev tanımı varsa --gorev ile birim başına verilebilir.
  · Manifestte kayıtlı kardeş dosya SİLİNMEZ (bkz. `kardes_uydurmalari_sil`).
  · Taşra/eş anlamlı alias'lar korunur: --alias verilmezse mevcut dosyadaki @ALIAS satırı
    aynen taşınır. Bu satırdan taşra adlarını düşürmek yönlendirmeyi kırar.

Kullanım:
    uv run python scripts/kurum_teskilat_yaz.py <slug> --kurum "..." --belge "..." \
      --url https://... --not "..." --birim "X Daire Başkanlığı" [--gorev "X: ..."] [--yaz]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from belediye_teskilat_yaz import kardes_uydurmalari_sil  # ortak silme koruması

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
ERISIM = "2026-08-06"

VARSAYILAN_GOREV = (
    "{kurum} teşkilatında yer alan birimdir; adının işaret ettiği alanda görevleri yürütür. "
    "Kaynak birim ADINI verir, ayrıntılı görev tanımını içermez; görev bu dosyada "
    "UYDURULMAMIŞTIR."
)


def mevcut_alias(yol: Path) -> str:
    if not yol.exists():
        return ""
    for satir in yol.read_text(encoding="utf-8").splitlines():
        if satir.startswith("@ALIAS:"):
            return satir.split(":", 1)[1].strip()
    return ""


def dosya_metni(
    *, kurum: str, belge: str, url: str, alias: str, notu: str, kaynak_turu: str,
    birimler: list[str], gorevler: dict[str, str],
) -> str:
    satirlar = [
        f"@KURUM: {kurum}",
        f"@BELGE: {belge}",
        f"@KAYNAK_KIMLIK: {url}",
        f"@ERISIM: {ERISIM}",
        f"@KAYNAK_TURU: {kaynak_turu}",
        "@DOGRULAMA: resmi",
        f"@ALIAS: {alias}",
        f"@NOT: {notu}",
        "",
    ]
    for ad in birimler:
        gorev = gorevler.get(ad) or VARSAYILAN_GOREV.format(kurum=kurum)
        satirlar += [f"BİRİM: {ad}", f"GÖREV: {gorev}", ""]
    return "\n".join(satirlar).rstrip("\n") + "\n"


def _gorev_ayristir(ham: list[str]) -> dict[str, str]:
    """'--gorev \"Birim Adı: görev metni\"' çiftlerini sözlüğe çevir."""
    sonuc: dict[str, str] = {}
    for parca in ham:
        ad, ayirac, metin = parca.partition(":")
        if not ayirac or not ad.strip() or not metin.strip():
            raise SystemExit(f"--gorev biçimi 'Birim Adı: görev' olmalı: {parca[:60]}")
        sonuc[ad.strip()] = re.sub(r"\s+", " ", metin).strip()
    return sonuc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--kurum", required=True)
    ap.add_argument("--belge", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--not", dest="notu", required=True)
    ap.add_argument("--birim", action="append", required=True)
    ap.add_argument("--gorev", action="append", default=[],
                    help="'Birim Adı: görev metni' — kaynakta görev tanımı VARSA")
    ap.add_argument("--alias", default="", help="verilmezse mevcut dosyadaki @ALIAS taşınır")
    ap.add_argument("--kaynak-turu", default="resmi_teskilat")
    ap.add_argument("--yaz", action="store_true")
    args = ap.parse_args()

    if not args.url.startswith("https://"):
        raise SystemExit("Kaynak resmî HTTPS adresi olmalı.")
    yol = _TESKILAT_DIR / args.slug / "birimler.txt"
    alias = args.alias or mevcut_alias(yol) or args.slug
    gorevler = _gorev_ayristir(args.gorev)
    bilinmeyen = set(gorevler) - set(args.birim)
    if bilinmeyen:
        raise SystemExit(f"--gorev listede olmayan birim(ler) için verildi: {sorted(bilinmeyen)}")

    metin = dosya_metni(
        kurum=args.kurum, belge=args.belge, url=args.url, alias=alias, notu=args.notu,
        kaynak_turu=args.kaynak_turu, birimler=args.birim, gorevler=gorevler,
    )
    if args.yaz:
        yol.parent.mkdir(parents=True, exist_ok=True)
        for ad in kardes_uydurmalari_sil(yol):
            print(f"   silindi (manifestte yok): {ad}")
        yol.write_text(metin, encoding="utf-8", newline="\n")
    print(f"{'YAZILDI' if args.yaz else 'HAZIR  '} {args.slug}: {len(args.birim)} birim "
          f"({len(gorevler)} görevli) · alias='{alias}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
