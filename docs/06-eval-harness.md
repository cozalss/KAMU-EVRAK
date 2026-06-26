# 06 — Değerlendirme Harness'ı (metrik → puanlama eşleme)

Şartname §9 "Uygulama 35p" 5 alt-kalemi birebir ölçülür. Tüm oranlar **Wilson %95 CI**;
ablation A/B'leri **McNemar p + bootstrap Δpp CI** (`eval/stats.py` KEEP).

| Uygulama alt-kalemi (35p) | Birincil metrik | İkincil | Harness | Köken |
|---|---|---|---|---|
| **Sınıflandırma doğruluğu** | **Macro-F1** | accuracy, confusion-matrix, per-class Wilson-CI, abstention@precision | `evrak_class_eval.py` | sklearn + stats(KEEP) |
| **Yönlendirme başarımı** | **Top-1 acc** | Top-3/Recall@3, MRR, maliyet-ağırlıklı hata | `routing_eval.py` | YENİ + stats(KEEP) |
| **Özetleme** | **LLM-judge kapsama** | ROUGE-L, BERTScore-tr, key-fact recall, faithfulness | `summary_eval.py` | judge.py(KEEP, rubrik yeni) |
| **Yazı şablon kalitesi** | **Format-compliance rate** (zorunlu-alan checklist, LLM'siz) | LLM-judge üslup-resmilik, turkish_purity, truncation, **uydurma-veto (false-veto=0)** | `draft_eval.py` | draft_quality.py ADAPT |
| **Eksik bilgi tespiti** | **F-beta (β=2)** (recall-öncelikli — kamuda FN>FP) | set-P/R/F1, per-field confusion, clarify-decision acc | `missing_info_eval.py` | eligibility+policy ADAPT |
| **Demo (15p)** | **uçtan-uca p95** + **TTFT** | p50/p99, offline-fallback latency | `latency_eval.py` | quality_gate.py ADAPT |

> **Latency:** şartname sayısal eşik vermez ("real-time **avantaj**"). Sabit SLA gibi sunma;
> **TTFT (stream ilk-token) + streaming**'i öne çıkar ("düşünen sistem"); tam-tamamlanma p95 ayrı raporla.

## Tek-komut karne

`eval/competition_scorecard.py` (scorecard.py ADAPT) → 5 alt-metriği git-SHA'lı tek Markdown
karneye topla → `docs/benchmark/`. Deterministik metrikler (macro-F1 sabit-gold, format-checklist,
set-F1, latency) **her commit CI'da**; LLM-judge + BERTScore ayrı gerçek-LLM gate.

## Ablation (YÖNTEM 35p kanıtı)

OCR var/yok · mevzuat-RAG var/yok · few-shot var/yok · **çok-ajan vs tek-ajan** · reranker
var/yok · DistilBERT-kademe var/yok → her A/B McNemar p + bootstrap CI. Dürüstlük:
"+5pp ama p=0.31 → **anlamlı DEĞİL**" raporla (jüri güveni). **Error-propagation:** Görev2
yönlendirmeye gold-tür vs tahmin-tür besleme A/B.

## Fairness (etik §13.1)

Farklı isim/cinsiyet/bölge sahte-PII varyantlarında sınıflandırma/routing **tutarlılık** kontrolü
(düşük maliyet, etik-madde kapsama). Canlı karne fairness **1.0000** raporlar (`eval/fairness_eval.py`).
