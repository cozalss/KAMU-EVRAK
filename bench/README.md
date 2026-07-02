# KamuEvrak-Bench

Türk kamu evrak ve yazışma süreçleri (dilekçe, bilgi edinme, CİMER, tebligat, fatura…)
için **%100 sentetik** değerlendirme seti — TEKNOFEST 2026 "Yapay Zeka Dil Ajanları /
Kamu Evrak" senaryosu kapsamında üretildi. Taramamızda bu alan için yayımlanmış açık
Türkçe benchmark bulunamadı (Temmuz 2026) [DOĞRULA: yayın öncesi literatür taraması].

## Bileşim

| Dosya | Görev | İçerik | Örnek |
|---|---|---|---|
| data/evrak_class_gold.jsonl | Görev 1.2 | Evrak türü sınıflandırma (19 tür, zorluk katmanlı) | 216 |
| data/eksik_bilgi_gold.jsonl | Görev 1.4 | Eksik zorunlu alan tespiti (3071 m.4) | 216 |
| data/mevzuat_gold.jsonl | Görev 1.5 | İlgili mevzuat önerisi (retrieval gold) | 16 |
| data/ozet_gold.jsonl | Görev 1.6 | Özetleme (anahtar-olgu recall) | 216 |
| data/routing_gold.jsonl | Görev 2.3 | Birim yönlendirme (9 birim) | 216 |
| data/yazi_taslak_gold.jsonl | Görev 2.1-2.2 | Resmî yazı taslağı format/bileşen | 216 |
| data/heldout_gold.jsonl | Held-out 1 | Kör değerlendirme seti (leak-free üretim) | 108 |
| data/heldout2_gold.jsonl | Held-out 2 | İkinci kör set (çapraz doğrulama) | 108 |
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
`KamuEvrak-Bench (2026), TEKNOFEST Yapay Zeka Dil Ajanları — Kamu Evrak senaryosu`.
