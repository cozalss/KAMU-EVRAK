"""Bir belediyenin resmî müdürlük listesinden teşkilat dosyası yazar.

Kullanım alanı: karantinadaki belediye dosyaları birim adlarını "TİPİK müdürlükler" diye
UYDURUYOR ve kendi künyelerinde bunu itiraf ediyor. Belediyenin kendi resmî sitesindeki
müdürlük listesi erişilebiliyorsa, uydurma liste gerçek listeyle değiştirilir.

GÖREV METNİ NEDEN KISA: müdürlük LİSTESİ sayfaları birim adını verir, görev tanımını
vermez. Bu araç görev uydurmaz. Bir birimin görevi yalnız iki kaynaktan yazılır:
  · 5393 m.48'in zorunlu dört birimi ile m.51 (zabıta) ve 5018 m.60 (malî hizmetler) —
    kanun bu birimlerin görevini kendisi tanımlar;
  · diğerleri için "bu kaynakta görev tanımı yer almamaktadır" denir ve birim yalnız
    ADIYLA kayda geçer. Ad tek başına yönlendirme için güçlü bir sinyaldir
    ("Ruhsat ve Denetim Müdürlüğü" ruhsat sorgusunu zaten yakalar).

Birim adları göz denetiminden GEÇMİŞ olmalıdır: sayfadan regexle toplanan diziler menü
başlığı veya satır kırılması artığı olabilir (ölçüldü: Kadıköy sayfasında "Rehberlik ve
Teftiş Kurulu" ile "Temizlik İşleri Müdürlüğü" tek adayda birleşmişti). Bu yüzden liste
--birim ile AÇIKÇA verilir; araç kendi başına sayfadan yazmaz.

Kullanım:
    uv run python scripts/belediye_teskilat_yaz.py kadikoy-belediyesi \
      --kurum "Kadıköy Belediyesi" --url https://www.kadikoy.bel.tr/mudurlukler \
      --birim "Fen İşleri Müdürlüğü" --birim "Zabıta Müdürlüğü" ... [--yaz]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
ERISIM = "2026-08-06"

# Kanunun görevini KENDİSİNİN tanımladığı birimler. Anahtar, birim adının normalize hâli.
_KANUNI_GOREV = {
    "zabita": (
        "5393 sayılı Belediye Kanunu m.48 uyarınca belediyede bulunması zorunlu dört birimden "
        "biridir. m.51: belediye zabıtası, beldede esenlik, huzur, sağlık ve düzenin "
        "sağlanmasıyla görevlidir; belediye meclisince alınan ve belediye zabıtasınca yerine "
        "getirilmesi gereken emir ve yasaklarla bunlara uymayanlar hakkında mevzuatta öngörülen "
        "ceza ve diğer yaptırımları uygular."
    ),
    "mali hizmetler": (
        "5393 sayılı Belediye Kanunu m.48 uyarınca belediyede bulunması zorunlu dört birimden "
        "biridir. Görevleri 5018 sayılı Kanun m.60'ta malî hizmetler birimleri için "
        "belirlenmiştir: stratejik plan ve performans programının hazırlanmasını koordine etmek; "
        "bütçeyi hazırlamak, izlemek ve kesin hesabı çıkarmak; muhasebe hizmetlerini yürütmek; "
        "gelirleri tahakkuk ettirmek, gelir ve alacakların takip ve tahsilini yapmak; ön malî "
        "kontrol faaliyetini yürütmek; taşınır ve taşınmaz işlemlerini yapmak."
    ),
    "fen isleri": (
        "5393 sayılı Belediye Kanunu m.48 uyarınca belediyede bulunması zorunlu dört birimden "
        "biridir; belediyenin fen işleri hizmetlerini yürütür. Bu birimin görevleri anılan "
        "Kanunda ayrı bir maddeyle düzenlenmemiştir."
    ),
    "yazi isleri": (
        "5393 sayılı Belediye Kanunu m.48 uyarınca belediyede bulunması zorunlu dört birimden "
        "biridir; belediyenin yazı işleri hizmetlerini yürütür. Bu birimin görevleri anılan "
        "Kanunda ayrı bir maddeyle düzenlenmemiştir."
    ),
}
_ASCII = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def _anahtar(birim_ad: str) -> str:
    """'Malî Hizmetler Müdürlüğü' → 'mali hizmetler' (unvan eki atılır)."""
    s = birim_ad.replace("İ", "i").translate(_ASCII).lower()
    s = re.sub(r"\b(mudurlugu|daire baskanligi|dairesi baskanligi|baskanligi|birimi)\b", " ", s)
    return re.sub(r"[^a-z0-9 ]", " ", s).strip().replace("  ", " ")


def gorev(birim_ad: str, kurum: str) -> str:
    kanuni = _KANUNI_GOREV.get(_anahtar(birim_ad))
    if kanuni:
        return kanuni
    return (
        f"{kurum} resmî teşkilat listesinde yer alan birimdir. Bu kaynak birimin ADINI verir, "
        "görev tanımını içermez; görev bu dosyada UYDURULMAMIŞTIR. Birimin görev ve çalışma "
        "esasları belediye meclisinin kabul ettiği görev ve çalışma yönetmeliğinde düzenlenir."
    )


def dosya_metni(slug: str, kurum: str, url: str, birimler: list[str], alias: str) -> str:
    notu = (
        f"Birim listesi {kurum} resmî sitesindeki müdürlükler sayfasından alınmıştır; sayfadaki "
        "ad yazımı korunmuştur. Bu dosyanın ÖNCEKİ sürümü birimleri \"ilçe belediyelerinde TİPİK "
        "müdürlükler\" diyerek kaynaksız listeliyor ve kendi künyesinde bunu itiraf ediyordu; o "
        "liste kaldırıldı. Kaynak sayfa birim ADINI verir, GÖREV tanımını vermez: yalnız 5393 "
        "m.48'in zorunlu dört birimi ile m.51 (zabıta) ve 5018 m.60 (malî hizmetler) için kanuni "
        "görev yazılmış, diğerlerinde görevin bu kaynakta bulunmadığı açıkça belirtilmiştir. "
        "Belediye teşkilatı meclis kararıyla değişebilir; liste erişim tarihindeki hâli yansıtır."
    )
    satirlar = [
        f"@KURUM: {kurum}",
        f"@BELGE: {kurum} resmî müdürlükler listesi (5393 sayılı Belediye Kanunu m.48 ve m.49 "
        f"uyarınca kurulan birimler)",
        f"@KAYNAK_KIMLIK: {url}",
        f"@ERISIM: {ERISIM}",
        "@KAYNAK_TURU: resmi_teskilat",
        "@DOGRULAMA: resmi",
        f"@ALIAS: {alias}",
        f"@NOT: {notu}",
        "",
    ]
    for ad in birimler:
        satirlar += [f"BİRİM: {ad}", f"GÖREV: {gorev(ad, kurum)}", ""]
    return "\n".join(satirlar).rstrip("\n") + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--kurum", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--birim", action="append", required=True)
    ap.add_argument("--alias", default="")
    ap.add_argument("--yaz", action="store_true")
    args = ap.parse_args()

    if not args.url.startswith("https://"):
        raise SystemExit("Kaynak resmî HTTPS adresi olmalı.")
    yol = _TESKILAT_DIR / args.slug / "birimler.txt"
    alias = args.alias
    if not alias and yol.exists():
        for satir in yol.read_text(encoding="utf-8").splitlines():
            if satir.startswith("@ALIAS:"):
                alias = satir.split(":", 1)[1].strip()
                break
    metin = dosya_metni(args.slug, args.kurum, args.url, args.birim, alias or args.slug)
    if args.yaz:
        yol.parent.mkdir(parents=True, exist_ok=True)
        for eski in yol.parent.glob("*.txt"):
            if eski.name != "birimler.txt":
                eski.unlink()
        yol.write_text(metin, encoding="utf-8", newline="\n")
    print(f"{'YAZILDI' if args.yaz else 'HAZIR  '} {args.slug}: {len(args.birim)} birim")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
