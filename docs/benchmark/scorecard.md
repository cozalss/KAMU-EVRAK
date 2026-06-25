# TEKNOFEST 2026 — 1. Senaryo Yarışma Karnesi

> Kamu Evrak ve Yazışma Süreçleri · **GERÇEK pipeline** (agents/graph.py) ölçümü · `python -m eval.competition_scorecard` ile üretilir (commit `0c6f8c7`, LLM_MODE=`mock`).

> **Skorlar MOCK tabandır:** LLM_MODE=mock'ta siniflandir/route keyword-heuristik fallback'i koşar. Bu metrikler TAVAN değil TABAN — gerçek LLM modu (openai/llamacpp) yükseltir. Burada KRİTİK olan, eval'in mock taksonomiyi değil GERÇEK LangGraph pipeline'ını (siniflandir→cikar→eksik_tespit→route_birim→ozetle→yazi_taslak) ölçmesidir.

Kanonik taksonomi: **19 evrak türü** (config.EVRAK_TURLERI; 'belirsiz' abstention dahil), **9 birim** (gerçek kamu verisi YOK — şartname §6.5). Vaka: sınıflandırma 126 · yönlendirme 126.

## Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1)

| Metrik | Değer | %95 CI |
|---|---|---|
| Sınıflandırma accuracy | **0.587** | [0.500, 0.669] |
| Sınıflandırma macro-F1 | **0.628** | — |
| Abstention oranı (belirsiz/düşük-güven) | 0% | — |
| Eksik-bilgi recall (β=2) | **0.991** | [0.951, 0.998] |
| Eksik-bilgi precision | 0.441 | — |
| Eksik-bilgi F-beta | 0.793 | — |
| Özet key-fact recall (mikro) | **1.000** | — |
| Özet ort. uzunluk | 40.7 kelime | — |

Zorluk kırılımı (sınıflandırma acc): {'kolay': 0.796, 'orta': 0.667, 'zor': 0.194} — stratifikasyon kanıtı (kolay→zor monoton düşüş beklenir).

## Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2)

| Metrik | Değer | %95 CI |
|---|---|---|
| Yönlendirme Top-1 (uçtan-uca) | **0.643** | [0.556, 0.721] |
| Yönlendirme Top-3 | 0.833 | — |
| Pipeline format_uyumlu | 0.000 | — |
| Yazı bileşen tam-uyum | **0.897** | — |
| Yazı türü doğruluğu | 0.936 | — |
| Yazı Türkçe saflık | 0.9999 | — |

## Etik §13.1 — Adillik (counterfactual isim/cinsiyet)

- Sınıf tutarlılığı: **1.0000** (%95 CI [0.956, 1.000])
- Birim tutarlılığı: **1.0000** — başvuranın ismi/cinsiyeti kararı değiştirmemeli (1.0 = yanlılıksız).

---

> Bu karne GERÇEK LangGraph pipeline'ını ölçer (mock taksonomi değil). Mock-LLM modunda deterministik (keyword/regex/eşik) fallback koşar → her commit'te CI regresyon kapısı olabilir. **Mock skorlar tavan DEĞİL tabandır.** Wilson %95 güven aralıkları küçük-N belirsizliğini dürüstçe gösterir.
