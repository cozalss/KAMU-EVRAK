"""Teşkilat korpusunun doğrulama durumunu tek bakışta listeler.

Güven seviyesi DOSYANIN KENDİ parmak izinden okunur (manifest + SHA-256), klasör
konumundan DEĞİL. Bu ayrım bilinçlidir: dizine dayalı güven, denetimde 1054 kurum için
uydurma birim üretilebildiği tespit edilen açığın kaynağıydı (bkz. docs/11 §8, F1).

Durumlar:
    DOĞRULANDI  manifeste kayıtlı, diskteki içeriğin SHA-256'sı manifestle birebir
    KIRIK       manifeste kayıtlı ama dosya değişmiş — güven otomatik düşer
    BEKLİYOR    künyesinde gerçek resmî URL var, manifeste henüz alınmamış
    KARANTİNA   kaynak göstermiyor; yalnız memur onayına öneri üretebilir

Kullanım:
    python scripts/teskilat_durum.py           # kurum bazında özet
    python scripts/teskilat_durum.py --detay   # dosya bazında
    python scripts/teskilat_durum.py --durum BEKLIYOR
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.kaynak_guveni import dosya_sha256

# Windows konsolu varsayılan olarak cp857/cp1254 kullanır ve "DOĞRULANDI" bozulur.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_TESKILAT_DIR = Path(__file__).resolve().parents[2] / "data" / "teskilat"
_MANIFEST = _TESKILAT_DIR / "kaynak_manifest.json"
_RESMI_DOGRULANMIS = "resmi_dogrulanmis"
_BASLIK_RE = re.compile(r"^@(\w+):\s*(.*)$")
_BIRIM_RE = re.compile(r"^BİRİM:", re.MULTILINE)

DOGRULANDI, KIRIK, BEKLIYOR, KARANTINA = "DOĞRULANDI", "KIRIK", "BEKLİYOR", "KARANTİNA"
_SIRA = {DOGRULANDI: 0, KIRIK: 1, BEKLIYOR: 2, KARANTINA: 3}


@dataclass(frozen=True)
class Kayit:
    """Tek teşkilat dosyasının doğrulama durumu."""

    dosya: str
    kurum: str
    birim: int
    durum: str
    kaynak: str
    tarih: str


_ASCII = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def _ascii_kat(s: str) -> str:
    """`--durum dogrulandi` da `--durum DOĞRULANDI` da tutsun."""
    return s.translate(_ASCII).upper()


def _kunye(metin: str) -> dict[str, str]:
    return {
        m.group(1).upper(): m.group(2).strip()
        for satir in metin.splitlines()
        if (m := _BASLIK_RE.match(satir.rstrip()))
    }


def _kisa_kaynak(kaynak: str) -> str:
    """URL ise alan adı, değilse ilk anlamlı parça — tabloyu dar tutar."""
    if kaynak.startswith("http"):
        return (urlparse(kaynak).hostname or kaynak).removeprefix("www.")
    if not kaynak or kaynak.startswith("teskilat/"):
        return "kaynak yok"
    return kaynak[:38]


def kayitlari_topla() -> list[Kayit]:
    manifest = json.loads(_MANIFEST.read_text(encoding="utf-8")).get("kaynaklar", {})
    kayitlar: list[Kayit] = []
    for yol in sorted(_TESKILAT_DIR.rglob("*.txt")):
        rel = yol.relative_to(_TESKILAT_DIR).as_posix()
        veri = yol.read_bytes()
        metin = veri.decode("utf-8", errors="replace")
        kunye = _kunye(metin)
        kayit_manifest = manifest.get(rel) or {}
        if str(kayit_manifest.get("durum", "")) == _RESMI_DOGRULANMIS:
            beklenen = str(kayit_manifest.get("icerik_sha256", ""))
            # Ortak yardimci ile AYNI normallestirme — satir sonu bicimi yanlis alarm vermesin.
            gercek = dosya_sha256(yol)
            durum = DOGRULANDI if beklenen == gercek else KIRIK
            kaynak = str(kayit_manifest.get("kaynak_url", ""))
            tarih = str(kayit_manifest.get("dogrulama_tarihi", ""))
        else:
            kaynak = kunye.get("KAYNAK_KIMLIK", "")
            tarih = kunye.get("ERISIM", "")
            durum = BEKLIYOR if kaynak.startswith("http") else KARANTINA
        kayitlar.append(
            Kayit(
                dosya=rel,
                kurum=yol.parent.name,
                birim=len(_BIRIM_RE.findall(metin)),
                durum=durum,
                kaynak=_kisa_kaynak(kaynak),
                tarih=tarih or "—",
            )
        )
    return kayitlar


def _kurum_bazinda(kayitlar: list[Kayit]) -> list[Kayit]:
    """Kurumun dosyalarını tek satırda topla; durum EN KÖTÜ dosyaya göre belirlenir."""
    gruplar: dict[str, list[Kayit]] = {}
    for k in kayitlar:
        gruplar.setdefault(k.kurum, []).append(k)
    ozet: list[Kayit] = []
    for kurum, grup in gruplar.items():
        en_kotu = max(grup, key=lambda k: _SIRA[k.durum])
        kaynaklar = sorted({k.kaynak for k in grup if k.kaynak != "kaynak yok"})
        ozet.append(
            Kayit(
                dosya=f"{len(grup)} dosya",
                kurum=kurum,
                birim=sum(k.birim for k in grup),
                durum=en_kotu.durum,
                kaynak=kaynaklar[0] if kaynaklar else "kaynak yok",
                tarih=max(k.tarih for k in grup),
            )
        )
    return ozet


def yazdir(kayitlar: list[Kayit]) -> None:
    if not kayitlar:
        print("(kayıt yok)")
        return
    kurum_gen = max(len(k.kurum) for k in kayitlar)
    for k in sorted(kayitlar, key=lambda k: (_SIRA[k.durum], -k.birim, k.kurum)):
        print(
            f"{k.durum:<11}{k.kurum:<{kurum_gen + 2}}{k.birim:>4} birim   "
            f"{k.kaynak:<34}{k.tarih}"
        )


def main() -> None:
    ayristirici = argparse.ArgumentParser(description=__doc__)
    ayristirici.add_argument("--detay", action="store_true", help="dosya bazında listele")
    ayristirici.add_argument("--durum", default="", help="tek duruma göre süz")
    args = ayristirici.parse_args()

    kayitlar = kayitlari_topla()
    gosterilecek = kayitlar if args.detay else _kurum_bazinda(kayitlar)
    if args.durum:
        aranan = _ascii_kat(args.durum)
        gosterilecek = [k for k in gosterilecek if _ascii_kat(k.durum).startswith(aranan)]
    yazdir(gosterilecek)

    print()
    for durum in (DOGRULANDI, KIRIK, BEKLIYOR, KARANTINA):
        ilgili = [k for k in kayitlar if k.durum == durum]
        if ilgili:
            kurumlar = len({k.kurum for k in ilgili})
            birim = sum(k.birim for k in ilgili)
            print(f"{durum:<11}{len(ilgili):>4} dosya  {kurumlar:>4} kurum  {birim:>5} birim")


if __name__ == "__main__":
    main()
