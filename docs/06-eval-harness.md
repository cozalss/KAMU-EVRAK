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

## Mevzuat güven bandı kalibrasyonu (`eval/mevzuat_guven_kalibrasyon.py`)

"İlgili mevzuat" kartındaki **güven çipi** eskiden max-normalize `score`tan geliyordu. `score`
liderin kendine bölünmesiyle üretilir (`mevzuat_oner._from_corpus`) → **top-1 daima 1.0** →
çip retrieval kalitesinden **bağımsız olarak** daima "yüksek güven" yazıyordu. Altın sette
ölçülen gerçek top-1 isabeti ise **0.598**: rozet her 5 evrakın 2'sinde yanılıyor, memura
bunu söylemiyordu. Aynı gerekçeyle kartın "%60 ilgililik eşiği" çentiği de kaldırıldı —
göreli bir çubuğun üzerinde mutlak eşik çizmek anlamsızdı.

Ölçülen sinyal: **`norm_score = raw_score / sorgu_token_sayısı`** (uzunluk-düzeltilmiş BM25).
Ham BM25 sorgu uzunluğuyla ölçeklenir → belgeler arası karşılaştırılamaz; token sayısına
bölünce karşılaştırılabilir olur. Aday sinyallerin ayırt ediciliği (AUC, top-1 doğru/yanlış):

| sinyal | AUC |
|---|---|
| `raw_score` (ham BM25) | 0.877 |
| **`raw_score / sorgu_token`** | **0.964** ← seçilen |
| `raw1/raw2` (lider marjı) | 0.717 |

Bantlar ve **ölçülen** isabetleri (n=204 evrak, taban 0.598):

| bant | kenar | n | ölçülen top-1 isabet |
|---|---|---|---|
| yüksek | `norm ≥ 1.40` | 103 | **0.971** |
| orta | `1.20 ≤ norm < 1.40` | 32 | 0.562 |
| düşük | `norm < 1.20` | 69 | **0.058** → insan incelemesi |

```
uv run python -m eval.mevzuat_guven_kalibrasyon           # bantları yeniden ölç
uv run python -m eval.mevzuat_guven_kalibrasyon --json    # CI
```

Sabitler `api/mevzuat_zenginlestir._BANT_ISABET` içindedir; **korpus ya da BM25 parametreleri
(k1/b/tür-boost) değişirse burada yeniden ölçülüp güncellenmelidir**, aksi halde "yüksek güven"
iddiası dayanaksız kalır. Ölçülen isabet arayüzde **yalnız ilk öneriye** iliştirilir: altın set
her evrak için ~tek beklenen kanun listeler, dolayısıyla "bu öneri doğru mu?" sorusu ancak
top-1'de temiz ölçülebilir (alt sıralarda bant gösterilir, oran iddia edilmez). `[DOĞRULA]`
işaretli öneri hiçbir koşulda "yüksek" olamaz; NLI "destek yok" derse bant düşüğe çekilir.

## Risk skoru kalibrasyonu (`eval/risk_calibration.py`)

Risk bandı **kararı** deterministik kural zinciridir ve ölçümden etkilenmez (CLAUDE.md).
Ölçülen şey **skor**: `ağırlık(tip) = ciddiyet × isabet`, belge skoru `1 − Π(1 − ağırlıkᵢ)`
(noisy-OR → kanıt arttıkça monoton artar). Sözleşme: `agents/risk_agirlik.py`.

**Sinyaller iki epistemik türdür — kalibrasyonun temeli budur:**

| Tür | Örnek | isabet | Neden |
|---|---|---|---|
| **Gözlem** | TCKN checksum tutmuyor · `[DOĞRULA]` işareti · 2646 lint ihlali · format checklist | **1.0 (ölçülmez)** | Deterministik olgu; tahmin değil. "Ölçtük" demek sahte hassasiyet olurdu. |
| **Çıkarım** | uydurma iddia (LLM grounding) · uydurma tarih/sayı · eksik bölüm · eksik zorunlu alan · düşük tür güveni | **ölçülür** | Sinyal bir tahmindir, yanılabilir → bağımsız oracle ile sayılır. |

Her çıkarım sinyali, **kendi mantığından bağımsız** bir oracle ile yargılanır (yoksa dairesel olur):
uydurma → değer kaynak evrakta gerçekten var mı; eksik bölüm → bağımsız 2646 regex bölümü
buluyor mu; eksik zorunlu → tahmin gold `eksik_alanlar` ile kesişiyor mu; düşük güven →
tahmin gold türden farklı mı. Ağırlığa **Wilson %95 alt sınırı** yazılır (az örnekte şişmesin);
ölçülmeyen çıkarım tipi `önsel 0.70` + `kalibrasyon: onsel` bayrağıyla arayüzde açıkça belirtilir.
PII maskeli değerler (`123***50`) oracle ile çözülemez → ölçüme alınmaz.

**Skor bir olasılık DEĞİLDİR** (ciddiyetle çarpılmıştır → *beklenen zarar*). Kalibre edilebilir
büyüklük ayrı bir fonksiyondur: `kusur_olasiligi` = yalnız isabetlerin noisy-OR'u. Brier ve
güvenilirlik eğrisi **onun** üzerinde hesaplanır; skoru 0/1 etiketle Brier'e sokmak kategori hatasıdır.

```
uv run python -m eval.risk_calibration            # mock (ücretsiz, deterministik)
uv run python -m eval.risk_calibration --llm      # grounding/uydurma sinyalleri de ölçülür
```
Çıktı `eval/runs/risk_calibration.json` → `risk_agirlik.py` otomatik okur; dosya yoksa
sistem önsel ağırlıklarla ayakta kalır. **Ölçüm koşulu rapora yazılır** (`llm_mode`): mock ve
gerçek-LLM koşuları farklı çıkarım yollarını ölçer, karıştırılmaz.

## Fairness (etik §13.1)

Farklı isim/cinsiyet/bölge sahte-PII varyantlarında sınıflandırma/routing **tutarlılık** kontrolü
(düşük maliyet, etik-madde kapsama). Canlı karne fairness **1.0000** raporlar (`eval/fairness_eval.py`).
