"""Frontend örnek dilekçeleri için kaynak öncesi/sonrası birim arama karşılaştırması.

Çalıştır:
    uv run python scripts/benchmark_ornek_dilekce_yonlendirme.py
"""
from __future__ import annotations

from dataclasses import dataclass

from agents.nodes.teskilat_ara import teskilat_birim_ara


@dataclass(frozen=True)
class Ornek:
    kimlik: str
    kurum: str
    kurum_slug: str
    konu: str
    once_birim: str
    once_kaynak_tipi: str
    beklenen_birim: str


ORNEKLER = (
    Ornek(
        "basvuru",
        "Yenimahalle Belediyesi",
        "yenimahalle-belediyesi",
        "işyeri açma ve çalışma ruhsatı başvurusu kırtasiye ruhsat düzenlenmesi",
        "Ruhsat ve Denetim Müdürlüğü",
        "jenerik",
        "Ruhsat ve Denetim Müdürlüğü",
    ),
    Ornek(
        "cok_konulu/yol",
        "Keçiören Belediyesi",
        "kecioren-belediyesi",
        "sokak çukuru onarımı yol kaldırım asfalt talebi",
        "Fen İşleri Müdürlüğü",
        "jenerik",
        "Fen İşleri Müdürlüğü",
    ),
    Ornek(
        "talep_yol_tamiri",
        "Odunpazarı Belediyesi",
        "odunpazari-belediyesi",
        "yol kaldırım asfalt bakım onarım yenileme talebi",
        "Fen İşleri Müdürlüğü",
        "jenerik",
        "Fen İşleri Müdürlüğü",
    ),
    Ornek(
        "sikayet_sokak_hayvani",
        "Akdeniz Belediyesi",
        "akdeniz-belediyesi",
        "sahipsiz sokak köpekleri ihbar şikayet toplama kısırlaştırma tedavi",
        "Temizlik İşleri Müdürlüğü",
        "jenerik",
        "Veteriner İşleri Müdürlüğü",
    ),
)


def main() -> int:
    basarisiz = False
    for ornek in ORNEKLER:
        adaylar = teskilat_birim_ara(ornek.kurum_slug, ornek.konu, tur="belediye", top_k=1)
        sonuc = adaylar[0] if adaylar else {}
        birim = sonuc.get("birim_ad", "-")
        kaynak_tipi = sonuc.get("kaynak_tipi", "-")
        kurum = sonuc.get("kaynak_kurum", "-")
        basarili = birim == ornek.beklenen_birim and kaynak_tipi == "kurum_ozel"
        basarisiz = basarisiz or not basarili
        durum = "OK" if basarili else "HATA"
        print(f"[{durum}] {ornek.kimlik}")
        print(f"  once: {ornek.once_birim} ({ornek.once_kaynak_tipi})")
        print(f"  sonra: {kurum} -> {birim} ({kaynak_tipi})")
    return 1 if basarisiz else 0


if __name__ == "__main__":
    raise SystemExit(main())
