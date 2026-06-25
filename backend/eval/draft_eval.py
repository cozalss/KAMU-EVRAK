"""Görev 2 — Resmî yazı taslağı değerlendirmesi (TEKNOFEST 1. Senaryo).

Şartname §6.4.2 ("uygun bir taslak oluşturma", "resmî üsluba uygun olması")
+ §9 ("yazı şablon oluşturma kalitesi"). docs/06: birincil **format-compliance**,
ikincil turkish_purity + truncation + **uydurma-veto (false-veto=0)**.

ÖLÇÜM HEDEFİ: GERÇEK pipeline koşulur; `out['yazi_taslak_md']`, `out['format_uyumlu']`,
`out['yazi_turu']`, `out['verify_uyari']` (yazi_taslak + verify node çıktısı) ölçülür.

LLM'siz deterministik metrikler:
  - format_uyumlu rate: pipeline'ın kendi format-uyum bayrağı (resmî zorunlu alan checklist)
  - component-compliance: taslak metni Yön. 2646 zorunlu bileşenleri içeriyor mu —
    T.C. başlığı / Sayı / Konu / İlgi / imza-bloku / **resmî kapanış (arz/rica ederim)** —
    bağımsız regex çapraz-kontrol (pipeline'dan bağımsız ikinci görüş)
  - yazi_turu accuracy: pipeline yazı türü == gold beklenen_yazi_turu (EVRAK_TO_YAZI)
  - turkish_purity: resmî üslup Türkçe saflığı (yabancı-harf sızıntısı yok)
  - truncation: taslak yarıda kesilmiş mi (eksik kapanış işareti)
  - **uydurma-veto false-positive**: verify node'unun "kaynakta yok" uyarısı GERÇEKTEN
    kaynakta olan değeri yanlışça işaretlemiş mi? (docs/06 hedef: false-veto=0)

Çalıştır (PYTHONPATH=...\\backend): python -m eval.draft_eval
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import re
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

from agents.graph import build_graph  # noqa: E402
from agents.state import make_initial_state  # noqa: E402
from eval.stats import fmt_ci, wilson_interval  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent.parent / "data" / "synthetic" / "yazi_taslak_gold.jsonl"
PURITY_MIN = 0.98  # resmî üslup: neredeyse saf Türkçe (yabancı-harf sızıntısı yok)

# Zorunlu bileşen → tespit regex'i (Resmî Yazışma Yön. 2646 / 3071 minimum seti).
# Ayrıntılandırma: 'kapanis' (arz/rica/sunulur) eklendi → resmî üslup kapanışı
# bileşen-uyum kapsamına alınır (yarıda kesik taslak yakalanır).
_COMPONENT_PATTERNS: dict[str, re.Pattern] = {
    "tc_baslik": re.compile(r"\bT\.?\s?C\.?\b"),
    "sayi": re.compile(r"Sayı\s*[:：]", re.IGNORECASE),
    "konu": re.compile(r"Konu\s*[:：]", re.IGNORECASE),
    "ilgi": re.compile(r"İlgi\s*[:：]|İlgi'", re.IGNORECASE),
    # İmza/unvan bloğu — dolu (e-imza/Başkan/Müdür) VEYA resmî şablon placeholder
    # slotu ({{ AD SOYAD }}/{{ UNVAN }}). Yapısal slot mevcudiyeti ölçülür; alanın
    # doldurulup doldurulmadığını ayrıca pipeline.format_uyumlu raporlar.
    "imza_bloku": re.compile(
        r"e-imza|imza|Başkan|Müdür|Vali|\{\{\s*AD SOYAD\s*\}\}|\{\{\s*UNVAN\s*\}\}",
        re.IGNORECASE),
    # Resmî kapanış ibaresi — taslak yarıda kesilmediğinin (truncation) sinyali.
    "kapanis": re.compile(
        r"arz ederim|rica ederim|arz olunur|rica olunur|sunulur|bilgilerinize",
        re.IGNORECASE),
}

# Türkçe saflık — resmî yazıda olması beklenen karakter kümesi (ASCII + Türkçe).
_TR_ALLOWED = set("abcçdefgğhıijklmnoöprsştuüvyzqwxABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX")

# Uydurma-veto false-positive tespiti — verify uyarısından somut değeri çıkar
# ('Taslaktaki '10.04.2026' tarihi kaynak evrakta yok' → 10.04.2026).
_RE_VETO_DEGER = re.compile(r"'([^']+)'")


def turkish_purity(text: str) -> float:
    """Metnin harf karakterlerinin Türkçe-uyumlu (ASCII+TR) oranı → [0,1].

    Yabancı alfabe (Yunan/Kiril/Arap) sızıntısı saflığı düşürür. Yalnız harf
    karakterleri sayılır (rakam/noktalama/boşluk yok sayılır). Boş/harfsiz → 1.0.
    """
    harfler = [c for c in text if c.isalpha()]
    if not harfler:
        return 1.0
    ok = sum(1 for c in harfler if c in _TR_ALLOWED)
    return ok / len(harfler)


def load_gold(path: Path = GOLD) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Gold yok: {path} — önce gen_synthetic.py koşun.")
    return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def run_pipeline(rows: list[dict]) -> None:
    """GERÇEK pipeline'ı koş → taslak + format_uyumlu + yazi_turu + verify_uyari doldur."""
    graph = build_graph()

    async def _run() -> None:
        for r in rows:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(r["metin"]))
            r["taslak"] = out.get("yazi_taslak_md", "") or ""
            r["format_uyumlu"] = bool(out.get("format_uyumlu", False))
            r["yazi_turu"] = out.get("yazi_turu", "")
            r["verify_uyari"] = out.get("verify_uyari", []) or []

    asyncio.run(_run())


def check_components(taslak: str) -> dict[str, bool]:
    """Her zorunlu bileşen taslakta var mı → {bileşen: bool}."""
    return {name: bool(pat.search(taslak)) for name, pat in _COMPONENT_PATTERNS.items()}


def _norm(s: str) -> str:
    """Diakritik-duyarsız küçük-harf (kaynak-içerme kontrolü için)."""
    return s.lower().replace("i̇", "i").replace("ı", "i")


def false_veto_count(verify_uyari: list[str], kaynak: str) -> tuple[int, list[str]]:
    """Uydurma-veto uyarılarından YANLIŞ olanları say → (false_veto_sayısı, örnekler).

    'kaynak evrakta yok' diyen uyarıdaki somut değer GERÇEKTEN kaynak metinde geçiyorsa
    bu YANLIŞ-veto'dur (verify'ın hatalı halüsinasyon alarmı). docs/06 hedef: 0.
    'Eksik bölüm:' uyarıları uydurma-veto değildir → sayılmaz.
    """
    src = _norm(kaynak)
    yanlis: list[str] = []
    for uyari in verify_uyari:
        if "kaynak evrakta yok" not in uyari:
            continue
        if m := _RE_VETO_DEGER.search(uyari):
            deger = m.group(1)
            if _norm(deger) in src:  # kaynakta VAR ama uyarı 'yok' demiş → false-veto
                yanlis.append(deger)
    return len(yanlis), yanlis


def evaluate(rows: list[dict]) -> dict:
    """Format-compliance + component checklist + yazi_turu acc + purity + false-veto."""
    run_pipeline(rows)
    n_components = len(_COMPONENT_PATTERNS)
    fmt_uyumlu = comp_fully = yazi_turu_ok = purity_ok = 0
    comp_hits: dict[str, int] = {k: 0 for k in _COMPONENT_PATTERNS}
    purities: list[float] = []
    veto_uyari_toplam = false_veto_toplam = 0
    false_veto_ornek: list[dict] = []
    for r in rows:
        taslak = r["taslak"]
        comp = check_components(taslak)
        comp_fully += int(all(comp.values()))
        for k, v in comp.items():
            comp_hits[k] += int(v)
        fmt_uyumlu += int(r["format_uyumlu"])
        yazi_turu_ok += int(r["yazi_turu"] == r.get("beklenen_yazi_turu"))
        pur = turkish_purity(taslak)
        purities.append(pur)
        purity_ok += int(pur >= PURITY_MIN)
        veto_uyari = [u for u in r["verify_uyari"] if "kaynak evrakta yok" in u]
        veto_uyari_toplam += len(veto_uyari)
        fv, ornekler = false_veto_count(r["verify_uyari"], r["metin"])
        false_veto_toplam += fv
        if fv and len(false_veto_ornek) < 10:
            false_veto_ornek.append({"id": r.get("id"), "yanlis_veto": ornekler})
    n = len(rows)
    lo, hi = wilson_interval(comp_fully, n)
    return {
        "n": n, "n_components": n_components,
        "format_uyumlu_rate": round(fmt_uyumlu / n, 4) if n else 0.0,
        "format_uyumlu": fmt_uyumlu,
        "compliance_rate": round(comp_fully / n, 4) if n else 0.0,
        "fully_compliant": comp_fully,
        "compliance_ci95": [round(lo, 3), round(hi, 3)],
        "yazi_turu_acc": round(yazi_turu_ok / n, 4) if n else 0.0,
        "per_component": {k: round(v / n, 3) if n else 0.0 for k, v in comp_hits.items()},
        "avg_turkish_purity": round(sum(purities) / n, 4) if n else 0.0,
        "purity_ok": purity_ok, "purity_ok_rate": round(purity_ok / n, 4) if n else 0.0,
        "veto_uyari_toplam": veto_uyari_toplam, "false_veto": false_veto_toplam,
        "false_veto_rate": round(false_veto_toplam / veto_uyari_toplam, 4)
        if veto_uyari_toplam else 0.0,
        "false_veto_ornek": false_veto_ornek,
    }


def main() -> int:
    res = evaluate(load_gold())
    bar = "=" * 66
    print(f"\n{bar}\n  GÖREV 2 — RESMÎ YAZI TASLAĞI (GERÇEK pipeline, format-uyum)\n{bar}")
    print(f"  Vaka: {res['n']}  ·  zorunlu bileşen sayısı: {res['n_components']}")
    print(f"  Pipeline format_uyumlu  : {res['format_uyumlu_rate']:.3f} "
          f"({res['format_uyumlu']}/{res['n']})")
    print(f"  Bileşen tam-uyum (regex): {res['compliance_rate']:.3f}  "
          f"(%95 CI {fmt_ci(res['fully_compliant'], res['n'])})")
    print(f"  Yazı türü doğruluğu     : {res['yazi_turu_acc']:.3f}  (EVRAK_TO_YAZI gold)")
    print(f"  Türkçe saflık           : ort {res['avg_turkish_purity']:.4f}  "
          f"(≥{PURITY_MIN}: {res['purity_ok']}/{res['n']})")
    print(f"  Uydurma-veto yanlış-poz : {res['false_veto']}/{res['veto_uyari_toplam']} "
          f"(false-veto-rate {res['false_veto_rate']:.3f}; docs/06 hedef 0)")
    if res["false_veto_ornek"]:
        print("    UYARI — YANLIŞ veto (değer kaynakta VAR ama 'yok' işaretlenmiş):")
        for it in res["false_veto_ornek"][:5]:
            print(f"      [{it['id']}] {it['yanlis_veto']}")
    print("\n  Bileşen kapsamı (oran):")
    for k, v in res["per_component"].items():
        print(f"    {k:14s} {v:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
