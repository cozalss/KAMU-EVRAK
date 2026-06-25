# TEKNOFEST 2026 — 1. Senaryo Yarışma Karnesi

> Kamu Evrak ve Yazışma Süreçleri · **GERÇEK pipeline** (agents/graph.py) ölçümü · `python -m eval.competition_scorecard` ile üretilir (commit `ab6be51`, LLM_MODE=`mock`).

> **Skorlar MOCK tabandır:** LLM_MODE=mock'ta siniflandir/route keyword-heuristik fallback'i koşar. Bu metrikler TAVAN değil TABAN — gerçek LLM modu (openai/llamacpp) yükseltir. Burada KRİTİK olan, eval'in mock taksonomiyi değil GERÇEK LangGraph pipeline'ını (siniflandir→cikar→eksik_tespit→route_birim→ozetle→yazi_taslak) ölçmesidir.

Kanonik taksonomi: **19 evrak türü** (config.EVRAK_TURLERI; 'belirsiz' abstention dahil), **9 birim** (gerçek kamu verisi YOK — şartname §6.5). Vaka: sınıflandırma 216 · yönlendirme 216.

## Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1)

| Metrik | Değer | %95 CI |
|---|---|---|
| Sınıflandırma accuracy | **0.949** | [0.911, 0.971] |
| Sınıflandırma macro-F1 | **0.949** | — |
| Abstention oranı (belirsiz/düşük-güven) | 0% | — |
| Eksik-bilgi recall (β=2) | **0.995** | [0.971, 0.999] |
| Eksik-bilgi precision | 0.970 | — |
| Eksik-bilgi F-beta | 0.990 | — |
| Özet key-fact recall (mikro) | **0.981** | — |
| Özet faithfulness (sadakat) | **1.000** | [0.983, 1.000] |
| Özet ort. uzunluk | 41.6 kelime | — |

> **Faithfulness** = özetin kaynak evrakta OLMAYAN somut tarih/sayı (halüsinasyon) içermeme oranı (CLAUDE.md §1). LLM-judge kapsama opsiyonel gate'tir (`SUMMARY_JUDGE_ENABLED`; şu an `None` — kapalıyken key-fact recall raporlanır).

Zorluk kırılımı (sınıflandırma acc): {'kolay': 0.972, 'orta': 0.972, 'zor': 0.903} — stratifikasyon kanıtı (kolay→zor monoton düşüş beklenir).

## Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2)

| Metrik | Değer | %95 CI |
|---|---|---|
| Yönlendirme Top-1 (uçtan-uca) | **0.963** | [0.929, 0.981] |
| Yönlendirme Top-3 | 0.982 | — |
| Pipeline format_uyumlu | 0.000 | — |
| Yazı bileşen tam-uyum | **0.833** | — |
| Yazı türü doğruluğu | 1.000 | — |
| Yazı Türkçe saflık | 1.0000 | — |
| Uydurma-veto yanlış-pozitif | **0/216** (oran 0.000) | — |

> **Uydurma-veto false-positive** (docs/06 hedef **0**): verify node'unun "kaynakta yok" uyarısının GERÇEKTEN kaynakta var olan değeri yanlış işaretleme oranı. 0 = anti-halüsinasyon kapısı sağlıklı (gerçek uydurmayı yakalar, doğruyu vetolamaz).

## Etik §13.1 — Adillik (counterfactual isim/cinsiyet)

- Sınıf tutarlılığı: **1.0000** (%95 CI [0.974, 1.000])
- Birim tutarlılığı: **1.0000** — başvuranın ismi/cinsiyeti kararı değiştirmemeli (1.0 = yanlılıksız).

---

> Bu karne GERÇEK LangGraph pipeline'ını ölçer (mock taksonomi değil). Mock-LLM modunda deterministik (keyword/regex/eşik) fallback koşar → her commit'te CI regresyon kapısı olabilir. **Mock skorlar tavan DEĞİL tabandır.** Wilson %95 güven aralıkları küçük-N belirsizliğini dürüstçe gösterir.
