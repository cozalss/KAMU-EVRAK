"""Doğrulanmamış kurumlar için resmî birim sayfası TARAR — toplu kaynak avı aracı.

Canlı keşif motoru (core/canli_kaynak) çalışma anında TEK kurum için koşar ve memura link
gösterir. Bu araç aynı motoru ÇEVRİMDIŞI ve TOPLU koşar: "hangi doğrulanmamış kurum için
artık resmî bir birim sayfası bulunabiliyor?" sorusunu cevaplar.

NE YAPMAZ — bu ayrım kritiktir:
    · Korpusa YAZMAZ. Çıktısı bir ADAY LİSTESİdir.
    · Hiçbir şeyi "doğrulanmış" işaretlemez. Doğrulama zinciri değişmedi: bir insan sayfayı
      okur, `kurum_teskilat_cek.py` ile birimleri çıkarır, `kurum_teskilat_yaz.py` ile yazar,
      `kaynak_kaydet.py` ile manifeste (URL + SHA-256 + tarih + yöntem) işler.
    · Arama motoru özetini kaynak saymaz — dönen şey kurumun KENDİ sitesindeki bir sayfadır.

Bu araç yalnız o zincirin İLK adımını (doğru sayfayı bulmak) hızlandırır; elle tek tek
aranırken en çok vakit alan adım oydu.

NEZAKET: hedefler kamu kurumlarının siteleri. Eşzamanlılık düşük tutulur ve her istek
arasında kısa bir bekleme vardır; amaç tarama değil, kurum başına 1-5 sayfa okumaktır.

Kullanım:
    python scripts/canli_kaynak_tara.py --durum karantina          # ücretsiz katmanlar
    python scripts/canli_kaynak_tara.py --slug tubitak --slug ptt
    python scripts/canli_kaynak_tara.py --durum bekliyor --web     # ücretli katman AÇIK
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.canli_kaynak import canli_kaynak_bul
from core.kurum_alan import aday_alanlar
from core.sicil import sicil_cozumle
from scripts.teskilat_durum import kayitlari_topla

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_RAPOR = Path(__file__).resolve().parents[2] / "data" / "canli_kaynak_taramasi.json"
# Kamu siteleri yavaş olabiliyor; paralellik DÜŞÜK tutulur (nezaket + ölçülebilir log).
ESZAMANLI = 5
ISTEK_ARASI_SN = 0.35


@dataclass(frozen=True)
class Sonuc:
    """Tek kurumun tarama sonucu. `birimler` DOĞRULANMAMIŞ adaylardır."""

    slug: str
    ad: str
    bulundu: bool
    url: str = ""
    yol: str = ""
    birim_sayisi: int = 0
    birimler: tuple[str, ...] = ()
    alan_adaylari: tuple[str, ...] = ()
    neden: str = ""


def _hedef_sluglar(durum: str, sluglar: list[str]) -> list[str]:
    """Taranacak kurum slug'ları. Açık slug verilmişse durum süzgeci uygulanmaz."""
    if sluglar:
        return sluglar
    istenen = durum.strip().lower()
    # teskilat_durum kurum adını KLASÖR adından okur; klasör adı slug'la aynıdır.
    return sorted({
        k.kurum for k in kayitlari_topla()
        if not istenen or k.durum.lower().startswith(istenen[:4])
    })


def _tara(slug: str, *, web: bool) -> Sonuc:
    kayit = sicil_cozumle(slug)
    if not kayit:
        return Sonuc(slug=slug, ad="", bulundu=False, neden="sicilde yok")
    kayit = dict(kayit)
    ad = str(kayit.get("ad") or slug)
    adaylar = tuple(aday_alanlar(kayit))
    if not adaylar and not web:
        return Sonuc(slug=slug, ad=ad, bulundu=False,
                     neden="adres kalıbı türetilemedi (ücretsiz katman yok)")
    time.sleep(ISTEK_ARASI_SN)
    try:
        kaynak = canli_kaynak_bul(kayit, web_aramasi=web)
    except Exception as exc:                      # tek kurumun hatası taramayı düşürmez
        return Sonuc(slug=slug, ad=ad, bulundu=False, alan_adaylari=adaylar,
                     neden=f"hata: {type(exc).__name__}")
    if kaynak is None:
        return Sonuc(slug=slug, ad=ad, bulundu=False, alan_adaylari=adaylar,
                     neden="sayfa/birim bulunamadı")
    return Sonuc(slug=slug, ad=ad, bulundu=True, url=kaynak.url, yol=kaynak.yol,
                 birim_sayisi=len(kaynak.birimler), birimler=kaynak.birimler,
                 alan_adaylari=adaylar)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--durum", default="karantina",
                    help="teskilat_durum durumu (karantina/bekliyor/dogrulandi)")
    ap.add_argument("--slug", action="append", default=[], help="tek kurum (tekrarlanabilir)")
    ap.add_argument("--web", action="store_true",
                    help="ÜCRETLİ web arama katmanını aç (bütçe tavanı kendi içinde)")
    ap.add_argument("--rapor", default=str(_RAPOR), help="JSON rapor yolu")
    args = ap.parse_args()

    hedefler = _hedef_sluglar(args.durum, args.slug)
    if not hedefler:
        print("(taranacak kurum yok)")
        return
    print(f"{len(hedefler)} kurum taranıyor "
          f"(web araması {'AÇIK' if args.web else 'kapalı'}, eşzamanlı {ESZAMANLI})…\n")

    with ThreadPoolExecutor(max_workers=ESZAMANLI) as havuz:
        sonuclar = list(havuz.map(lambda s: _tara(s, web=args.web), hedefler))

    bulunan = [s for s in sonuclar if s.bulundu]
    for s in sorted(sonuclar, key=lambda s: (not s.bulundu, -s.birim_sayisi, s.slug)):
        if s.bulundu:
            ornek = ", ".join(s.birimler[:3])
            print(f"BULUNDU   {s.slug:<42}{s.birim_sayisi:>3} birim  {s.url}")
            print(f"          └ {ornek}")
        else:
            print(f"—         {s.slug:<42}{s.neden}")

    Path(args.rapor).write_text(
        json.dumps([asdict(s) for s in sonuclar], ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8", newline="\n",
    )
    print(f"\n{len(bulunan)}/{len(sonuclar)} kurumda resmî birim sayfası bulundu.")
    print(f"Rapor: {args.rapor}")
    print("Bunlar ADAYDIR — doğrulama için: kurum_teskilat_cek → _yaz → kaynak_kaydet.")


if __name__ == "__main__":
    main()
