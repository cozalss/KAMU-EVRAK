"""KamuEvrak-Bench dışa aktarım (S9) — sentetik gold setleri yayın paketine derle.

"Türk kamu evrakı sınıflandırma + bilgi çıkarımı" için yayımlanmış açık benchmark
taramada bulunamadı (Tem 2026) → projenin sentetik gold setleri "KamuEvrak-Bench"
adıyla paylaşılabilir paket haline getirilir (HuggingFace/TAKP yüklemesine hazır):
bench/ altına veri kopyaları + README (bileşim tablosu + dürüstlük notları + lisans).

Kullanım:  python scripts/export_bench.py   → bench/
Veri kuralı: %100 sentetik (şartname §6.5) — data/data-card.md ile birlikte yayınlanır.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KAYNAK = ROOT / "data" / "synthetic"
HEDEF = ROOT / "bench"

# dosya → (görev, açıklama) — bileşim tablosu README'ye yazılır.
SETLER: dict[str, tuple[str, str]] = {
    "evrak_class_gold.jsonl": ("Görev 1.2", "Evrak türü sınıflandırma (19 tür, zorluk katmanlı)"),
    "eksik_bilgi_gold.jsonl": ("Görev 1.4", "Eksik zorunlu alan tespiti (3071 m.4)"),
    "mevzuat_gold.jsonl": ("Görev 1.5", "İlgili mevzuat önerisi (retrieval gold)"),
    "ozet_gold.jsonl": ("Görev 1.6", "Özetleme (anahtar-olgu recall)"),
    "routing_gold.jsonl": ("Görev 2.3", "Birim yönlendirme (9 birim)"),
    "yazi_taslak_gold.jsonl": ("Görev 2.1-2.2", "Resmî yazı taslağı format/bileşen"),
    "heldout_gold.jsonl": ("Held-out 1", "Kör değerlendirme seti (leak-free üretim)"),
    "heldout2_gold.jsonl": ("Held-out 2", "İkinci kör set (çapraz doğrulama)"),
}

README_SABLON = """# KamuEvrak-Bench

Türk kamu evrak ve yazışma süreçleri (dilekçe, bilgi edinme, CİMER, tebligat, fatura…)
için **%100 sentetik** değerlendirme seti — kamu-evrak projesi kapsamında üretildi. Taramamızda bu alan için yayımlanmış açık
Türkçe benchmark bulunamadı (Temmuz 2026) [DOĞRULA: yayın öncesi literatür taraması].

## Bileşim

| Dosya | Görev | İçerik | Örnek |
|---|---|---|---|
{tablo}
| taranmis/ (3 PDF + gold) | Görev 1.1 | Salt-görüntü "taranmış" evrak + gold metin (OCR CER/WER) | 3 |

## Ölçüm

Metrik betikleri ana repodadır (`backend/eval/`): sınıflandırma acc/macro-F1,
eksik-bilgi P/R, özet key-fact recall, yönlendirme Top-1/Top-3/MRR, taslak format
uyumu, OCR CER/WER (`eval/ocr_eval.py`), istatistik (Wilson/McNemar) `eval/stats.py`.

## Dürüstlük notları

- Veri LLM+şablon karışımı sentetiktir; **kör insan etiketlemesi yapılmamıştır**
  (etik açık nokta — data-card §7). Şablon stil tekrarı held-out setlerde azaltıldı.
- TCKN'ler checksum-geçerli fakat SAHTEDİR; tüm kişi/kurum adları kurgudur (§6.5).
- Ayrıntı: `data-card.md` (paketle birlikte kopyalanır).

## Lisans ve atıf

Kod MIT (ana repo); veri **CC-BY-4.0** önerilir [kesinleştirilecek]. Atıf:
`KamuEvrak-Bench (2026), kamu-evrak — Türkçe kamu evrak ve yazışma değerlendirme seti`.
"""


def main() -> None:
    veri_dir = HEDEF / "data"
    veri_dir.mkdir(parents=True, exist_ok=True)
    satirlar = []
    for ad, (gorev, aciklama) in SETLER.items():
        kaynak = KAYNAK / ad
        if not kaynak.exists():
            print(f"UYARI: {ad} bulunamadi, atlandi")
            continue
        shutil.copy2(kaynak, veri_dir / ad)
        n = sum(1 for satir in kaynak.read_text(encoding="utf-8").splitlines() if satir.strip())
        satirlar.append(f"| data/{ad} | {gorev} | {aciklama} | {n} |")
        print(f"  data/{ad} ({n} ornek)")
    taranmis = KAYNAK / "taranmis"
    if taranmis.exists():
        shutil.copytree(taranmis, veri_dir / "taranmis", dirs_exist_ok=True)
        print("  data/taranmis/ (OCR seti)")
    data_card = ROOT / "docs" / "data-card.md"
    if data_card.exists():
        shutil.copy2(data_card, HEDEF / "data-card.md")
    (HEDEF / "README.md").write_text(
        README_SABLON.format(tablo="\n".join(satirlar)), encoding="utf-8")
    print(f"-> {HEDEF} hazir (HF/TAKP yuklemesi icin)")


if __name__ == "__main__":
    main()
