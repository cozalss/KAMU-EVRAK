#!/usr/bin/env python
"""Tek komut LLM duman testi (smoke) — gerçek pipeline'ı birkaç örnek evrakla koş.

Amaç: anahtar verildiğinde GERÇEK LLM (LLM_MODE=openai) ile sınıflandırma/çıkarım/taslak
çıktısını TEK komutla görmek; anahtar yoksa NET mesajla mock'a düşmek (patlamadan).

    # Gerçek LLM (en yüksek doğruluk):
    LLM_MODE=openai OPENAI_API_KEY=sk-... python scripts/run_llm_smoke.py
    # Anahtarsız demo (deterministik mock taban):
    python scripts/run_llm_smoke.py
    # Küçük gold üzerinde gerçek-LLM doğruluğu da ölç:
    LLM_MODE=openai OPENAI_API_KEY=sk-... python scripts/run_llm_smoke.py --acc 12

Bu script SADECE okur/çağırır — graph.py/node-logic'e dokunmaz. build_graph().ainvoke ile
mevcut uçtan-uca pipeline'ı kullanır (eval/evrak_class_eval ile aynı desen).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import sys
from pathlib import Path
from typing import Any

with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

# backend/ PYTHONPATH'e (script repo kökünden çağrılabilsin: `python scripts/run_llm_smoke.py`).
_REPO = Path(__file__).resolve().parent.parent
_BACKEND = _REPO / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

_GOLD = _REPO / "data" / "synthetic" / "ornek_gold.jsonl"
_BAR = "=" * 70

# Gold yoksa kullanılan gömülü yedek örnekler (sahte PII — CLAUDE.md §2).
_FALLBACK_ORNEKLER: tuple[dict[str, str], ...] = (
    {
        "etiket": "Dilekçe (su aboneliği)",
        "text": (
            "Ayşe Yılmaz\nT.C. Kimlik No: 12345678901\n"
            "Adres: Atatürk Mah. 100. Sk. No:5, Çankaya/Ankara\n\nİLGİLİ MAKAMA\n\n"
            "Tarafıma ait su aboneliği işleminin gözden geçirilmesini saygılarımla "
            "talep ederim.\n\n25.06.2026\nİmza"
        ),
    },
    {
        "etiket": "Bilgi edinme başvurusu",
        "text": (
            "İLGİLİ MAKAMA\n\n4982 sayılı Kanun kapsamında, 2025 yılı su tüketim "
            "verilerine ilişkin bilgi talep ediyorum.\n\nMehmet Demir\n"
            "0555-123-4567\n20.06.2026"
        ),
    },
)


def _mode_banner() -> tuple[str, bool]:
    """(insan-okur mod açıklaması, gerçek_llm_mu). GERÇEK aktif client tipini raporlar.

    KRİTİK: önce `agents.config` import edilir — bu modül `load_dotenv` çağırır, böylece
    `.env`'deki LLM_MODE/OPENAI_API_KEY OKUNMADAN ÖNCE yüklenir (eski hata: os.getenv
    config import'undan ÖNCE okunuyor → anahtar .env'deyken yanlışlıkla "MOCK" deniyordu).
    İstenen modu config.LLM_MODE'dan, GERÇEK çalışan client'ı get_llm() tipinden alırız;
    böylece sessiz mock-fallback (openai seçili ama anahtar yok) banner'da dürüstçe görünür.
    """
    from agents.config import LLM_MODE  # load_dotenv burada tetiklenir (.env yüklenir)
    from agents.llm import get_llm

    active = type(get_llm()).__name__  # GERÇEK seçilen client (singleton)
    if active == "OpenAIClient":
        model = getattr(get_llm(), "model", os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini"))
        return (f"GERÇEK LLM: OpenAI ({model}) — few-shot JSON çıkarımı aktif.", True)
    if active in {"LlamaCppClient", "LlamaCppServerClient"}:
        return (f"GERÇEK LLM: lokal ({LLM_MODE}) — GGUF/HTTP inference aktif.", True)
    # active == MockLLM. İstenen mod openai/llamacpp ise bu SESSİZ FALLBACK demektir.
    if LLM_MODE == "openai":
        return ("LLM_MODE=openai SEÇİLDİ ama gerçek client kurulamadı (OPENAI_API_KEY yok) "
                "→ mock'a düşüldü (graceful). Gerçek doğruluk için .env'e anahtar koyun.", False)
    if LLM_MODE in {"llamacpp", "llamacpp_server", "llama_server", "server"}:
        return (f"LLM_MODE={LLM_MODE} SEÇİLDİ ama lokal client kurulamadı → mock'a düşüldü "
                "(graceful). Model/sunucu yapılandırmasını kontrol edin.", False)
    return ("MOCK mod (anahtarsız demo tabanı): keyword+regex heuristik fallback "
            "koşar. Skorlar TABAN; gerçek LLM yükseltir.", False)


def _load_ornekler(limit: int) -> list[dict[str, str]]:
    """Gold örnekleri yükle (yoksa gömülü yedek). Her biri {etiket, text}."""
    if _GOLD.exists():
        out: list[dict[str, str]] = []
        for i, ln in enumerate(_GOLD.read_text(encoding="utf-8").splitlines()):
            if not ln.strip():
                continue
            row = json.loads(ln)
            out.append({"etiket": row.get("gold_tur", f"örnek-{i}"), "text": row["text"]})
        if out:
            return out[:limit]
    return list(_FALLBACK_ORNEKLER)[:limit]


def _ozetle_cikti(out: dict[str, Any]) -> list[str]:
    """Pipeline çıktısından sınıflandırma/çıkarım/taslak özetini satır listesine çevir."""
    tur = out.get("evrak_turu", "?")
    conf = float(out.get("tur_confidence", 0.0) or 0.0)
    bilgi = out.get("bilgi_unsurlari") or {}
    # konu/talep yalnız anlamlı metinse göster (bazı alanlar bool bayrak — onları atla).
    konu = next(
        (str(v) for k in ("konu", "talep") if isinstance((v := bilgi.get(k)), str) and v.strip()),
        "-",
    )
    birim = out.get("hedef_birim", "?")
    mevzuat = out.get("mevzuat_onerileri") or []
    mevzuat_str = mevzuat[0].get("baslik", "-") if mevzuat else "-"
    taslak = (out.get("yazi_taslak_md") or "").strip().replace("\n", " ")
    taslak_onizleme = (taslak[:90] + "…") if len(taslak) > 90 else (taslak or "-")
    return [
        f"    sınıf      : {tur}  (güven {conf:.2f})",
        f"    konu/talep : {str(konu)[:70]}",
        f"    → birim    : {birim}",
        f"    mevzuat    : {str(mevzuat_str)[:70]}",
        f"    taslak     : {taslak_onizleme}",
    ]


async def _run_ornekler(ornekler: list[dict[str, str]]) -> None:
    """Her örneği gerçek pipeline'dan geçir + özet bas (mevcut node-logic; değiştirilmez)."""
    from agents.graph import build_graph
    from agents.state import make_initial_state

    graph = build_graph()
    for i, ornek in enumerate(ornekler, 1):
        print(f"\n  [{i}/{len(ornekler)}] {ornek['etiket']}")
        try:
            out: dict[str, Any] = await graph.ainvoke(make_initial_state(ornek["text"]))
        except Exception as exc:  # smoke asla patlamamalı → hatayı bas, devam et
            print(f"    HATA: {type(exc).__name__}: {exc}")
            continue
        for satir in _ozetle_cikti(out):
            print(satir)


def _gercek_llm_dogruluk(n: int) -> None:
    """İsteğe bağlı: küçük gold örnekleminde GERÇEK pipeline sınıflandırma doğruluğu (--acc).

    eval.evrak_class_eval'ı yeniden kullanır (DRY). Tamamen graceful: gold/modül yoksa
    veya ölçüm patlarsa net mesajla atlanır — smoke akışını bozmaz."""
    try:
        from eval import evrak_class_eval
        from eval.stats import fmt_ci
    except Exception as exc:  # eval bağımlılığı eksik olabilir → atla
        print(f"\n  [doğruluk atlandı: eval import edilemedi — {type(exc).__name__}]")
        return
    try:
        rows = evrak_class_eval.load_gold()[:n]
    except FileNotFoundError as exc:
        print(f"\n  [doğruluk atlandı: {exc}]")
        return
    if not rows:
        print("\n  [doğruluk atlandı: gold boş]")
        return
    try:
        evrak_class_eval.run_pipeline(rows)  # her satıra GERÇEK pipeline koşar
    except Exception as exc:
        print(f"\n  [doğruluk atlandı: pipeline hatası — {type(exc).__name__}: {exc}]")
        return
    correct = sum(1 for r in rows if r.get("pred") == r.get("evrak_turu"))
    print(f"\n{_BAR}\n  GERÇEK-PIPELINE SINIFLANDIRMA DOĞRULUĞU (n={len(rows)} örneklem)\n{_BAR}")
    print(f"  doğru: {correct}/{len(rows)}  ·  %95 CI {fmt_ci(correct, len(rows))}")
    print("  NOT: küçük örneklem — yarışma karnesi için: python -m eval.competition_scorecard")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="LLM duman testi — gerçek pipeline örnek koşumu.")
    ap.add_argument("-n", "--num", type=int, default=2, help="işlenecek örnek sayısı (default 2)")
    ap.add_argument("--acc", type=int, nargs="?", const=12, default=0,
                    help="küçük gold örnekleminde gerçek-pipeline doğruluğu ölç (default 12)")
    args = ap.parse_args(argv)

    aciklama, gercek = _mode_banner()
    print(f"\n{_BAR}\n  KAMU-EVRAK — LLM DUMAN TESTİ\n{_BAR}")
    print(f"  Mod: {aciklama}")
    print(f"  {'Gerçek LLM ile koşuluyor.' if gercek else 'Mock taban ile koşuluyor (anahtarsız).'}")

    ornekler = _load_ornekler(max(1, args.num))
    asyncio.run(_run_ornekler(ornekler))

    if args.acc:
        _gercek_llm_dogruluk(args.acc)

    print(f"\n{_BAR}")
    if not gercek:
        print("  Bitti (MOCK). Gerçek doğruluk için: "
              "LLM_MODE=openai OPENAI_API_KEY=sk-... python scripts/run_llm_smoke.py")
    else:
        print("  Bitti (GERÇEK LLM). Tam karne: python -m eval.competition_scorecard")
    print(_BAR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
