"""Risk skoru KALİBRASYONU — sinyal başına isabet (precision) ölçümü + Brier/güvenilirlik.

NİYE VAR: `agents/risk_agirlik.CIDDIYET` bir yargıdır ("sinyal doğruysa ne kadar kötü").
Ağırlığın ikinci çarpanı olan ISABET ("sinyal ateşlendiğinde gerçekten haklı çıkıyor mu")
ise ölçülmelidir — yoksa skor, süslenmiş bir tahminden ibaret kalır. Bu harness sentetik
korpusta GERÇEK pipeline'ı koşar, her sinyali BAĞIMSIZ bir oracle ile yargılar ve
Wilson ALT sınırını ağırlığa yazar (az örnekte ağırlık şişmesin).

YALNIZ ÇIKARIM SİNYALLERİ ÖLÇÜLÜR. Gözlem sinyalleri (tutarlilik/lint/[DOĞRULA]/format)
deterministik olgudur — isabetleri tanım gereği 1.0, ölçülecek belirsizlik yoktur
(bkz. agents/risk_agirlik.GOZLEM). Onları "ölçtük" demek sahte hassasiyet olurdu.

ORACLE'LAR (her biri sinyalin kendi mantığından BAĞIMSIZ olmalı, yoksa dairesel olur):
  • uydurma_deger   → uyarıdaki somut değer kaynak evrakta GERÇEKTEN var mı?
                      (var ⇒ sinyal yanlış-pozitif). PII maskeli değer ('123***50')
                      çözülemez → ölçüme ALINMAZ (belirsiz sayılır).
  • eksik_bolum     → verify anahtar-sözcükle "yok" dedi; BAĞIMSIZ regex (2646 bileşen
                      deseni) taslakta bölümü buluyor mu? (buluyorsa yanlış-pozitif)
  • eksik_zorunlu   → tahmin edilen eksik alanlar gold `eksik_alanlar` ile kesişiyor mu?
  • dusuk_guven     → sinyal "tür yanlış olabilir" der; gold türle karşılaştır
                      (tahmin gerçekten yanlışsa sinyal haklı).
  • uydurma_grounding → yalnız --llm ile ölçülür (mock modda hiç ateşlenmez).

ÖLÇÜLEMEYEN ÇIKARIM (önsel ağırlıkta bırakılır, rapor bunu açıkça yazar):
  tur_belirsiz — abstention'da tahmin YOKtur; "haklı mıydı" sorusunun oracle'ı yok.

Korpus: evrak_class_gold.jsonl — tek dosyada hem gold `evrak_turu` hem gold
`eksik_alanlar` taşır (iki oracle aynı koşudan beslenir).

Çalıştır (backend/ içinden):  uv run python -m eval.risk_calibration
                              uv run python -m eval.risk_calibration --llm   (grounding dahil)
Çıktı: eval/runs/risk_calibration.json → agents/risk_agirlik.py otomatik okur.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

_KOK = Path(__file__).resolve().parent.parent
# Hem gold `evrak_turu` hem gold `eksik_alanlar` taşır → iki oracle tek koşudan beslenir.
GOLD = _KOK.parent / "data" / "synthetic" / "evrak_class_gold.jsonl"
CIKTI = _KOK / "eval" / "runs" / "risk_calibration.json"

# Ölçüme alınabilmesi için bir tipin en az bu kadar gözlemi olmalı; altındaysa önsel kalır.
MIN_ORNEK = 5

_RE_TIRNAK = re.compile(r"'([^']+)'")
# Bağımsız 2646 bileşen desenleri (verify'ın anahtar-sözcük listesinden AYRI kaynak).
_BOLUM_ORACLE: dict[str, re.Pattern[str]] = {
    "T.C. başlığı": re.compile(r"\bT\.?\s?C\.?\b"),
    "Sayı": re.compile(r"Sayı\s*[:：]", re.IGNORECASE),
    "Konu": re.compile(r"Konu\s*[:：]", re.IGNORECASE),
    "İmza/Ad-Soyad": re.compile(r"(arz|rica)\s+eder|imza|\{\{\s*AD[_ ]?SOYAD\s*\}\}", re.IGNORECASE),
}


def _norm(s: str) -> str:
    """Diakritik-duyarsız küçük harf (kaynak-içerme kontrolü için)."""
    return s.lower().replace("i̇", "i").replace("ı", "i")


def _maskeli(deger: str) -> bool:
    """PII maskesi ('123******50') → değer çözülemez, oracle karar veremez."""
    return "*" in deger


def oracle_uydurma_deger(gerekce: str, kaynak: str) -> bool | None:
    """True = sinyal HAKLI (değer kaynakta yok). None = karar verilemez (maskeli)."""
    m = _RE_TIRNAK.search(gerekce)
    if not m:
        return None
    deger = m.group(1)
    if _maskeli(deger):
        return None
    return _norm(deger) not in _norm(kaynak)


def oracle_eksik_bolum(gerekce: str, taslak: str) -> bool | None:
    """True = bölüm gerçekten yok (bağımsız regex de bulamadı)."""
    if ":" not in gerekce:
        return None
    etiket = gerekce.split(":", 1)[1].strip()
    desen = _BOLUM_ORACLE.get(etiket)
    return None if desen is None else not desen.search(taslak)


def oracle_dusuk_guven(tahmin_tur: str, gold_tur: str) -> bool | None:
    """True = sinyal haklı: 'emin değilim' dedi ve tahmin gerçekten yanlıştı."""
    if not gold_tur:
        return None
    return tahmin_tur != gold_tur


def oracle_grounding(gerekce: str, kaynak: str) -> bool | None:
    """True = iddia kaynakta geçmiyor (sinyal haklı). Maskeli iddia → karar yok."""
    if ":" not in gerekce:
        return None
    iddia = gerekce.split(":", 1)[1].strip()
    if not iddia or _maskeli(iddia):
        return None
    return _norm(iddia) not in _norm(kaynak)


def oracle_eksik_zorunlu(tahmin: list[str], gold: list[str]) -> bool | None:
    """True = "eksik alan var" uyarısı gerçekten eksik bir alanı işaret ediyor.

    Sinyal-düzeyi isabet: tahmin kümesi gold ile KESİŞİYORSA uyarı haklıdır (memuru
    gerçek bir eksiğe yönlendirdi). Gold yoksa karar verilemez.
    """
    if gold is None:
        return None
    return bool(set(tahmin) & set(gold))


def _wilson_alt(dogru: int, n: int) -> float:
    """Wilson %95 alt sınırı — az örnekte ağırlığı MUHAFAZAKÂR tutar."""
    from eval.stats import wilson_interval
    return round(wilson_interval(dogru, n)[0], 4)


def _yargila(tip: str, gerekce: str, satir: dict[str, Any], ra: Any) -> bool | None:
    """Sinyali tipine uygun oracle ile yargıla → True/False/None(ölçülemez).

    GÖZLEM tipleri bilerek None döner: onlar tahmin değil olgudur, isabet ölçülmez.
    """
    if tip in ra.GOZLEM:
        return None
    if tip == ra.UYDURMA_DEGER:
        return oracle_uydurma_deger(gerekce, satir["metin"])
    if tip == ra.UYDURMA_GROUNDING:
        return oracle_grounding(gerekce, satir["metin"])
    if tip == ra.EKSIK_BOLUM:
        return oracle_eksik_bolum(gerekce, satir.get("taslak", ""))
    if tip == ra.EKSIK_ZORUNLU:
        return oracle_eksik_zorunlu(satir.get("eksik_alanlar", []), satir.get("gold_eksik_alanlar"))
    if tip == ra.DUSUK_GUVEN:
        return oracle_dusuk_guven(satir.get("tahmin_tur", ""), satir.get("gold_tur", ""))
    return None  # tur_belirsiz / bilinmeyen → oracle yok, önsel ağırlıkta kalır


def _pipeline_kos(satirlar: list[dict[str, Any]]) -> None:
    """GERÇEK grafı koş → her satıra taslak/verify_uyari/tur/eksik alanlarını doldur."""
    from agents.graph import build_graph
    from agents.state import make_initial_state

    graf = build_graph()

    async def _calis() -> None:
        for i, r in enumerate(satirlar, 1):
            try:
                out = await graf.ainvoke(make_initial_state(r["metin"]))
            except Exception:
                out = {}
            r["taslak"] = out.get("yazi_taslak_md", "") or ""
            r["verify_uyari"] = out.get("verify_uyari", []) or []
            r["lint_uyari"] = (out.get("lint_2646") or {}).get("uyari", []) or []
            r["tutarlilik_uyari"] = out.get("tutarlilik_uyari", []) or []
            r["eksik_alanlar"] = out.get("eksik_alanlar", []) or []
            r["tahmin_tur"] = out.get("evrak_turu", "") or ""
            r["tur_confidence"] = out.get("tur_confidence")
            r["format_uyumlu"] = bool(out.get("format_uyumlu", True))
            if i % 25 == 0:
                print(f"  ...{i}/{len(satirlar)} belge", flush=True)

    asyncio.run(_calis())


def _gerekceleri_uret(r: dict[str, Any]) -> list[str]:
    """compute_risk'in ürettiği GERÇEK gerekçe listesi (arayüzde görünenle birebir)."""
    from agents.nodes.risk_guard import compute_risk
    conf = r.get("tur_confidence")
    meta = compute_risk(
        r["verify_uyari"], format_uyumlu=r["format_uyumlu"],
        eksik_alanlar=r["eksik_alanlar"], tur_confidence=1.0 if conf is None else float(conf),
        evrak_turu=r["tahmin_tur"] or "belirsiz", taslak=r["taslak"],
        lint_uyari=r["lint_uyari"], tutarlilik_uyari=r["tutarlilik_uyari"])
    return [] if meta["bant"] == "yesil" else meta["gerekceler"]


def isabetleri_olc(satirlar: list[dict[str, Any]], ra: Any) -> dict[str, dict[str, Any]]:
    """Her sinyal tipi için (dogru, n) say → isabet + Wilson alt sınırı."""
    sayac: dict[str, list[int]] = {}
    for r in satirlar:
        for g in _gerekceleri_uret(r):
            tip = ra.gerekce_tipi(g)
            karar = _yargila(tip, g, r, ra)
            if karar is None:
                continue
            d, n = sayac.setdefault(tip, [0, 0])
            sayac[tip] = [d + int(karar), n + 1]

    tipler: dict[str, dict[str, Any]] = {}
    for tip, (dogru, n) in sayac.items():
        if n < MIN_ORNEK:
            continue  # yetersiz gözlem → ölçüm iddia ETME, önsel kalsın
        tipler[tip] = {"n": n, "dogru": dogru, "isabet": round(dogru / n, 4),
                       "isabet_alt": _wilson_alt(dogru, n),
                       "yontem": "bagimsiz-oracle (Wilson %95 alt sinir)"}
    return tipler


def _belge_etiketi(r: dict[str, Any], ra: Any) -> bool | None:
    """y: belgede oracle-doğrulanmış GERÇEK kusur var mı? (None = hiç ölçülebilir sinyal yok)"""
    kararlar = [_yargila(ra.gerekce_tipi(g), g, r, ra) for g in _gerekceleri_uret(r)]
    olculebilir = [k for k in kararlar if k is not None]
    if not olculebilir and kararlar:
        return None          # yalnız ölçülemeyen sinyaller → Brier'e alma
    return any(olculebilir)  # sinyal yoksa da y=False (temiz belge)


def brier_ve_guvenilirlik(satirlar: list[dict[str, Any]], ra: Any) -> dict[str, Any]:
    """Brier + güvenilirlik eğrisi — KUSUR OLASILIĞI üzerinde (skor üzerinde DEĞİL).

    Skor = ciddiyet × isabet = beklenen ZARAR; bir olasılık değildir, dolayısıyla
    "gerçekten kusurlu mu" (0/1) etiketiyle Brier'e sokulamaz — kategori hatası olur.
    Kalibre edilebilir büyüklük `kusur_olasiligi`dır (yalnız isabetlerin noisy-OR'u).
    """
    ciftler: list[tuple[float, int]] = []
    for r in satirlar:
        gerekceler = _gerekceleri_uret(r)
        y = _belge_etiketi(r, ra)
        if y is None:
            continue
        p = ra.kusur_olasiligi(gerekceler) if gerekceler else 0.0
        ciftler.append((p, int(y)))

    if not ciftler:
        return {"brier": None, "n_belge": 0}
    brier = sum((s - y) ** 2 for s, y in ciftler) / len(ciftler)

    kovalar = []
    for i in range(5):
        lo, hi = i / 5, (i + 1) / 5
        grup = [(s, y) for s, y in ciftler if (lo <= s < hi or (i == 4 and s == 1.0))]
        if grup:
            kovalar.append({
                "kova": f"{lo:.1f}-{hi:.1f}", "n": len(grup),
                "ortalama_olasilik": round(sum(s for s, _ in grup) / len(grup), 4),
                "gozlenen_kusur_orani": round(sum(y for _, y in grup) / len(grup), 4)})
    return {"olculen_buyukluk": "kusur_olasiligi (skor DEĞİL — skor beklenen zarardır)",
            "brier": round(brier, 4), "n_belge": len(ciftler),
            "pozitif_oran": round(sum(y for _, y in ciftler) / len(ciftler), 4),
            "guvenilirlik": kovalar}


def main() -> int:
    ap = argparse.ArgumentParser(description="Risk skoru kalibrasyonu")
    ap.add_argument("--llm", action="store_true",
                    help="LLM açık koş (grounding sinyali de ölçülür; ücretli)")
    ap.add_argument("--limit", type=int, default=0, help="ilk N belge (hızlı deneme)")
    args = ap.parse_args()

    # LLM_MODE, agents.config import edilirken okunur → import'tan ÖNCE sabitlenmeli.
    if not args.llm:
        os.environ["LLM_MODE"] = "mock"
    import agents.risk_agirlik as ra  # geç import: env sabitlendikten sonra

    if not GOLD.exists():
        print(f"HATA: gold yok → {GOLD}\n  Üret: python scripts/gen_synthetic.py", file=sys.stderr)
        return 1
    satirlar = [json.loads(s) for s in GOLD.read_text(encoding="utf-8").splitlines() if s.strip()]
    if args.limit:
        satirlar = satirlar[:args.limit]
    # Gold'u AYRI anahtara al: _pipeline_kos tahminleri aynı adlarla üzerine yazıyor.
    for r in satirlar:
        r["gold_tur"] = r.get("evrak_turu", "")
        r["gold_eksik_alanlar"] = r.get("eksik_alanlar")

    print(f"Pipeline koşuluyor: {len(satirlar)} belge (llm={'açık' if args.llm else 'mock'})")
    _pipeline_kos(satirlar)

    tipler = isabetleri_olc(satirlar, ra)
    CIKTI.parent.mkdir(parents=True, exist_ok=True)
    rapor: dict[str, Any] = {
        "uretim": {"tarih": datetime.now(UTC).isoformat(timespec="seconds"),
                   "llm_mode": os.environ.get("LLM_MODE", "openai"),
                   "korpus": GOLD.name, "n_belge": len(satirlar)},
        "tipler": tipler,
        # Gözlem tipleri "ölçülmedi" değildir — ölçülecek belirsizlikleri yoktur (isabet 1.0).
        "gozlem_tipler": sorted(ra.GOZLEM),
        "olculmeyen_cikarim_tipler": sorted(set(ra.CIDDIYET) - set(tipler) - set(ra.GOZLEM)),
        "sinirlar": [
            "isabet yalnız bağımsız oracle'ı olan ÇIKARIM tiplerinde ölçüldü; kalanı önsel (0.70).",
            "gözlem tipleri (tutarlilik/lint/[DOĞRULA]/format) deterministik olgudur → isabet 1.0.",
            "PII maskeli değerler ('123***50') oracle ile çözülemez → ölçüme alınmadı.",
            "Korpus sentetiktir; gerçek EBYS dağılımı farklı olabilir.",
            "Brier yalnız en az bir ÖLÇÜLEBİLİR sinyali olan (ya da hiç sinyali olmayan) "
            "belgelerde hesaplanır; yalnız gözlem sinyali taşıyan belgeler dışarıda kalır.",
        ],
    }
    # Yeni ağırlıklar diske yazılır → cache temizlenip skorlar ONLARLA yeniden hesaplanır.
    CIKTI.write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")
    ra.kalibrasyon_yukle.cache_clear()
    rapor["kalibrasyon"] = brier_ve_guvenilirlik(satirlar, ra)
    CIKTI.write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'tip':22s} {'n':>5s} {'isabet':>8s} {'Wilson alt':>11s}")
    for tip, k in sorted(tipler.items()):
        print(f"{tip:22s} {k['n']:5d} {k['isabet']:8.3f} {k['isabet_alt']:11.3f}")
    print(f"\ngözlem (isabet 1.0, ölçülmez): {', '.join(rapor['gozlem_tipler'])}")
    if rapor["olculmeyen_cikarim_tipler"]:
        print(f"ölçülmeyen çıkarım (önsel 0.70): {', '.join(rapor['olculmeyen_cikarim_tipler'])}")
    kal = rapor["kalibrasyon"]
    print(f"\nBrier (kusur olasılığı) = {kal['brier']} "
          f"(n={kal['n_belge']}, pozitif oran={kal.get('pozitif_oran')})")
    for kv in kal.get("guvenilirlik", []):
        print(f"  olasılık {kv['kova']}: ortalama {kv['ortalama_olasilik']:.3f} → "
              f"gözlenen kusur {kv['gozlenen_kusur_orani']:.3f}  (n={kv['n']})")
    print(f"\nYazıldı: {CIKTI}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
