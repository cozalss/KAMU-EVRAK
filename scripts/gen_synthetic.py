"""Sentetik kurgu evrak üretici (STUB) — şartname §6.5 (gerçek veri YASAK).

Faker tr_TR + checksum-geçerli SAHTE TCKN + jinja2 şablon → kurgu evrak metni.
Çıktı: data/synthetic/*.jsonl ({text, gold_tur, gold_eksik_alanlar, ...}).

# TODO(kamu-evrak): tür-başına 2-4 şablon, OCR-gürültü varyasyonu, LLM parafraz,
# stratifikasyon (tür × zorluk), train/dev/test ayrımı (bkz. docs/05).

Kullanım:  uv run --extra dev python scripts/gen_synthetic.py --n 20
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "synthetic"


def fake_tckn(rng: random.Random) -> str:
    """Checksum-GEÇERLİ ama SAHTE TCKN (gerçek kimlikle çakışmaz — yalnız format testi)."""
    d = [rng.randint(0, 9) for _ in range(9)]
    d[0] = d[0] or 1  # ilk hane 0 olamaz
    d10 = ((sum(d[0:9:2]) * 7) - sum(d[1:8:2])) % 10
    d11 = (sum(d[:9]) + d10) % 10
    return "".join(map(str, [*d, d10, d11]))


def _names(rng: random.Random) -> tuple[str, str]:
    try:
        from faker import Faker  # type: ignore
        f = Faker("tr_TR")
        return f.name(), f.address().replace("\n", ", ")
    except Exception:
        ad = rng.choice(["Ayşe Yılmaz", "Mehmet Demir", "Zeynep Kaya", "Ali Çelik"])
        return ad, "Atatürk Mah. 100. Sk. No:5, Çankaya/Ankara"


# Tür → (şablon üretici, gold eksik alan enjeksiyonu)
def _dilekce(rng, ad, adres, tckn, *, eksik):  # noqa: ANN001
    satirlar = [f"{ad}",  f"T.C. Kimlik No: {tckn}", f"Adres: {adres}",
                "", "İLGİLİ MAKAMA", "",
                "Tarafıma ait işlemin gözden geçirilmesini ve gerekli düzeltmenin "
                "yapılmasını saygılarımla talep ederim.", "", "25.06.2026", "İmza"]
    if "imza" in eksik:
        satirlar = [s for s in satirlar if s != "İmza"]
    if "iletisim_adres" in eksik:
        satirlar = [s for s in satirlar if not s.startswith("Adres")]
    return "\n".join(satirlar)


def gen_one(rng: random.Random) -> dict:
    ad, adres = _names(rng)
    tckn = fake_tckn(rng)
    eksik = rng.choice([[], [], ["imza"], ["iletisim_adres"]])
    text = _dilekce(rng, ad, adres, tckn, eksik=eksik)
    return {"text": text, "gold_tur": "dilekce", "gold_eksik_alanlar": eksik, "zorluk": "kolay"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(OUT / "ornek_evrak.jsonl"))
    args = ap.parse_args()

    rng = random.Random(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    rows = [gen_one(rng) for _ in range(args.n)]
    Path(args.out).write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8",
    )
    print(f"{len(rows)} kurgu evrak yazıldı → {args.out}")  # noqa: T201


if __name__ == "__main__":
    main()
