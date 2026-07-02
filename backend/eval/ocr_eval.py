"""OCR mini-eval — taranmış sentetik evrakta CER/WER ölçümü (S8).

Headline yetenek olan OCR bugüne dek HİÇ ölçülmüyordu (denetim bulgusu). Bu harness
data/synthetic/taranmis/*.pdf (salt-görüntü, metin katmansız) dosyalarını gerçek
`multimodal.extract_text` yolundan geçirir ve gold .txt'e karşı Karakter Hata Oranı
(CER) + Kelime Hata Oranı (WER) raporlar → eval/runs/ocr_eval.json.

Kullanım:  cd backend && uv run python -m eval.ocr_eval
Not: OCR motoru (RapidOCR) ilk çağrıda model indirir → CI'da KOŞULMAZ; CER/WER saf
fonksiyonları birim testlidir (tests/test_ocr_eval.py).
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_VERI = _ROOT / "data" / "synthetic" / "taranmis"
_CIKTI = Path(__file__).resolve().parent / "runs" / "ocr_eval.json"


def _normalize(metin: str) -> str:
    """OCR karşılaştırması için ölçüm-normalizasyonu: TR küçük harf + boşluk sadeleştirme."""
    metin = metin.replace("İ", "i").replace("I", "ı").lower()
    return re.sub(r"\s+", " ", metin).strip()


def _levenshtein(a: list[str], b: list[str]) -> int:
    """Klasik DP edit mesafesi (ekle/sil/değiştir) — kısa belgeler için O(n·m) yeterli."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    onceki = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        simdiki = [i]
        for j, cb in enumerate(b, 1):
            simdiki.append(min(
                onceki[j] + 1,                      # silme
                simdiki[j - 1] + 1,                 # ekleme
                onceki[j - 1] + (ca != cb),         # değiştirme
            ))
        onceki = simdiki
    return onceki[-1]


def cer(referans: str, tahmin: str) -> float:
    """Karakter Hata Oranı = edit_mesafesi / referans_uzunluğu (normalize metinde)."""
    ref = list(_normalize(referans))
    return _levenshtein(ref, list(_normalize(tahmin))) / max(len(ref), 1)


def wer(referans: str, tahmin: str) -> float:
    """Kelime Hata Oranı = kelime-düzeyi edit mesafesi / referans kelime sayısı."""
    ref = _normalize(referans).split()
    return _levenshtein(ref, _normalize(tahmin).split()) / max(len(ref), 1)


async def _calistir() -> dict:
    from multimodal.ocr import extract_text

    sonuclar = []
    for pdf in sorted(_VERI.glob("*.pdf")):
        gold_yolu = pdf.parent / (pdf.stem + ".gold.txt")
        if not gold_yolu.exists():
            continue
        referans = gold_yolu.read_text(encoding="utf-8")
        res = await extract_text(pdf.read_bytes())
        sonuclar.append({
            "belge": pdf.name, "motor": res.engine,
            "cer": round(cer(referans, res.text), 4),
            "wer": round(wer(referans, res.text), 4),
            "n_char_gold": len(referans), "n_char_ocr": len(res.text),
        })
        print(f"{pdf.name}: motor={res.engine} CER={sonuclar[-1]['cer']:.3f} "
              f"WER={sonuclar[-1]['wer']:.3f}")
    if not sonuclar:
        print(f"Veri yok: {_VERI} - once scripts/gen_taranmis.py calistirin.")
        return {}
    ozet = {
        "n_belge": len(sonuclar),
        "ort_cer": round(sum(s["cer"] for s in sonuclar) / len(sonuclar), 4),
        "ort_wer": round(sum(s["wer"] for s in sonuclar) / len(sonuclar), 4),
        "belgeler": sonuclar,
    }
    _CIKTI.parent.mkdir(parents=True, exist_ok=True)
    _CIKTI.write_text(json.dumps(ozet, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"-> {_CIKTI}  (ort. CER={ozet['ort_cer']:.3f}, WER={ozet['ort_wer']:.3f})")
    return ozet


if __name__ == "__main__":
    asyncio.run(_calistir())
