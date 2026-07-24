# TEKNOFEST 2026 — 1. Senaryo Yarışma Karnesi

> Kamu Evrak ve Yazışma Süreçleri · **GERÇEK pipeline** (agents/graph.py) ölçümü · `python -m eval.competition_scorecard` ile üretilir (commit `1532a37`, LLM_MODE=`openai`, model=`deepseek-chat`).

> **Skorlar GERÇEK LLM (`deepseek-chat`) ile ölçülmüştür** — mock/keyword-heuristik fallback koşmadı. Dairesel-olmayan (held-out) doğrulama için `docs/benchmark/llm-heldout.md`'ye bakın.

> ⚠️ **MODEL DEĞİŞİKLİĞİ (2026-07-24) — bu karne TARİHSEL KAYITTIR.**
> `deepseek-chat` API'den **kaldırıldı** (HTTP 400); üretim modeli **`deepseek-v4-flash`**.
> Ölçüm kaydı korunsun diye model adı değiştirilmedi, ancak bu skorlar **yeni modelle
> yeniden ölçülmemiştir** — "üretim modunun güncel başarımı" olarak sunulamaz.
> Yeniden üretim: `uv run python -m eval.competition_scorecard` (LLM_MODE=openai).

Kanonik taksonomi: **19 evrak türü** (config.EVRAK_TURLERI; 'belirsiz' abstention dahil), **9 birim** (gerçek kamu verisi YOK — şartname §6.5). Vaka: sınıflandırma 54 · yönlendirme 54.

## Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1)

| Metrik | Değer | %95 CI |
|---|---|---|
| Sınıflandırma accuracy | **0.796** | [0.671, 0.882] |
| Sınıflandırma macro-F1 | **0.817** | — |
| Abstention oranı (belirsiz/düşük-güven) | 0% | — |
| Eksik-bilgi recall (β=2) | **0.739** | [0.597, 0.844] |
| Eksik-bilgi precision | 1.000 | — |
| Eksik-bilgi F-beta | 0.780 | — |
| Özet key-fact recall (mikro) | **0.712** | — |
| Özet faithfulness (sadakat) | **1.000** | [0.934, 1.000] |
| Özet ort. uzunluk | 19.4 kelime | — |

> **Faithfulness** = özetin kaynak evrakta OLMAYAN somut tarih/sayı (halüsinasyon) içermeme oranı (CLAUDE.md §1). LLM-judge kapsama opsiyonel gate'tir (`SUMMARY_JUDGE_ENABLED`; şu an `—` — kapalıyken key-fact recall raporlanır).

Zorluk kırılımı (sınıflandırma acc): {'kolay': 0.944, 'orta': 0.722, 'zor': 0.722} — stratifikasyon kanıtı (kolay→zor monoton düşüş beklenir).

## Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2)

| Metrik | Değer | %95 CI |
|---|---|---|
| Yönlendirme Top-1 (uçtan-uca) | **0.852** | [0.734, 0.923] |
| Yönlendirme Top-3 | 0.963 | — |
| Pipeline format_uyumlu | 1.000 | — |
| Yazı bileşen tam-uyum | **1.000** | — |
| Yazı türü doğruluğu | 0.833 | — |
| Yazı Türkçe saflık | 0.9998 | — |
| Uydurma-veto yanlış-pozitif | **0/140** (oran 0.000) | — |
| Resmî üslup (LLM-judge, `DRAFT_JUDGE_ENABLED`) | — | — |

> **Uydurma-veto false-positive** (docs/06 hedef **0**): verify node'unun "kaynakta yok" uyarısının GERÇEKTEN kaynakta var olan değeri yanlış işaretleme oranı. 0 = anti-halüsinasyon kapısı sağlıklı (gerçek uydurmayı yakalar, doğruyu vetolamaz).

## Etik §13.1 — Adillik (counterfactual isim/cinsiyet)

- Sınıf tutarlılığı: **0.9444** (%95 CI [0.819, 0.985])
- Birim tutarlılığı: **0.9444** — başvuranın ismi/cinsiyeti kararı değiştirmemeli (1.0 = yanlılıksız).

---

> Bu karne GERÇEK LangGraph pipeline'ını ölçer (mock taksonomi değil). Bu koşu gerçek `openai` modeliyle ölçülmüştür (mock fallback koşmadı). Wilson %95 güven aralıkları küçük-N belirsizliğini dürüstçe gösterir.
