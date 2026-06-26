# kamu-evrak — Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-009688.svg)
![LangGraph](https://img.shields.io/badge/LangGraph-multi--agent-1c3d5a.svg)
![React 18](https://img.shields.io/badge/React-18-61dafb.svg)
[![Katkı](https://img.shields.io/badge/Katk%C4%B1-CONTRIBUTING-brightgreen.svg)](CONTRIBUTING.md)

> **TEKNOFEST 2026 — Yapay Zeka Dil Ajanları Yarışması, 1. Senaryo**

Çok-ajanlı (LangGraph) bir yapay zeka asistanı. Kamu kurumuna gelen evrakı uçtan uca işler:

- **Görev 1 — Anla:** oku (OCR/metin) → türü sınıflandır → bilgi çıkar → eksiği tespit et → ilgili mevzuatı öner → özetle
- **Görev 2 — Üret:** resmî yazı taslağı hazırla → doğru birime yönlendir → kullanıcıyı bilgilendir → gerekirse eksik bilgi iste

Tek bir LangGraph boru hattı; **bulut (gpt-4o), lokal (Qwen GGUF) veya anahtarsız (offline)** modlarda aynı şekilde çalışır — fark yalnız kalitededir. Lisans **MIT**, AGPL bağımlılık yok (PDF için PyMuPDF yerine pypdfium2).

---

## ✨ Öne çıkanlar

| | |
|---|---|
| 🧩 **Çok-konulu ayrıştırma** | Tek dilekçedeki birden çok istek **alt-taleplere bölünür**; her biri ayrı **tür + birim + yasal süre** alır → otomatik havale (memurun "3 kez fotokopileyip 3 daireye dağıtma" derdini çözer) |
| 🎯 **Dürüst değerlendirme** | Üretim modeli **DeepSeek-V4** — held-out ön-ölçüm (n=22) **acc 0.955 / op 1.0**; çapraz-referans gpt-4o (n=108) **0.935** [BCa CI]; reprodüke-edilebilir artefaktlar repoda |
| 🛡️ **PII maskeleme** | TCKN / telefon / IBAN bulut çağrısından **önce** maskelenir; ham kişisel veri arayüze hiç ulaşmaz |
| 🚫 **Anti-halüsinasyon** | Deterministik uydurma-veto (false-positive 0) + NLI atıf-gerekçelendirme; emin olunmayan madde `[DOĞRULA:]` |
| 📚 **Gerçek RAG** | Madde-bazlı **BM25Okapi** mevzuat retrieval + opsiyonel cross-encoder rerank (bge-reranker-v2-m3) |
| 👤 **İnsan-döngüde (HITL)** | Resmî yazı taslağı **memur onayına** sunulur: onayla / düzenle / reddet (kamu imza akışının ajan karşılığı) |
| ⏰ **Yasal süre triyajı** | Mevzuat-dayanaklı cevap süresi (3071 m.7 = 30 gün, 4982 m.11 = 15 iş günü) → **GECİKMİŞ / KRİTİK** uyarısı |
| 🔗 **Denetim izi** | Tamper-evident **SHA-256 hash-chain** (Sayıştay / KVKK işleme kaydı) |
| 🔎 **Kanıt-vurgu** | Çıkarılan her unsurun ham (maskeli) evraktaki yeri işaretli — "bunu nereden buldun?" |
| ⚡ **Gerçek zamanlı demo** | SSE ile canlı ajan akış şeması; özet ve taslak token-token yazılır |

---

## 🧭 Mimari

```
START → siniflandir → cikar → kanit_baglama → eksik_tespit → [decompose]
                                                                   │
                                          ┌────────────────────────┴────────────┐
                                          ▼                                      ▼
                                     mevzuat_oner ──(rerank? crag? NLI?)     ozetle   (paralel)
                                          └────────────────────────┬────────────┘
                                                                   ▼
                              route_birim → yazi_taslak → [onay_kapisi*] → verify
                                   → arsiv → sla_triyaj → denetim_izi → finalize → END
```

- `[decompose]` çok-konulu evrakı alt-taleplere böler (paralel fan-out kaynağı; `DECOMPOSE_ENABLED`, **varsayılan açık** — additive, baseline metriklerini değiştirmez).
- `*` ve `?` ile işaretli node'lar **ENV-gated** (varsayılan kapalı) → temel akış birebir korunur, demo için açılır.
- OCR (`oku`) graf-öncesi (API route'unda) yapılır; graf saf metin üzerinde çalışır → test-edilebilir.
- Detay: [`docs/03-mimari.md`](docs/03-mimari.md).

---

## 🔧 Özellikler

### Görev 1 — Sınıflandırma ve İçerik Analizi
- **OCR / metin:** dijital PDF → pypdfium2 (tam Türkçe); taranmış/foto → RapidOCR (offline); Word → python-docx; opsiyonel OpenAI vision.
- **Çok-konulu ayrıştırma (decompose):** tek dilekçedeki birden çok istek alt-taleplere bölünür; her biri ayrı tür+birim+yasal süre alır → otomatik havale önerisi. LLM segment (DeepSeek) + deterministik bağlaç/madde fallback; alt-talep özeti PII-maskeli. Tek-konulu evrak → bölme yok.
- **Sınıflandırma:** 19 evrak türü (`belirsiz` abstention dahil) — few-shot LLM + çok-katmanlı keyword/semantik-kök fallback.
- **Bilgi çıkarımı:** gönderen / kurum / konu / tarih / sayı / talep — **PII maskelenerek**.
- **Eksik-bilgi tespiti:** tür-bağımlı zorunlu-alan şeması (3071 m.4); eksikse takip soruları üretir.
- **Mevzuat önerisi:** 10 kanun / 63 madde-chunk korpusu üzerinde **BM25 retrieval** (Recall@1 0.938) + statik fallback.
- **Özet:** key-fact koruyan kısa, sadık (halüsinasyonsuz) özet.

### Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme
- **Birim yönlendirme:** 9 birim arasında top-k öneri + güven + alternatifler.
- **Resmî yazı taslağı:** üst / cevabi / bilgilendirme / olur — Resmî Yazışma Yön. 2646 formatı (jinja2 + resmî üslup).
- **PDF / DOCX indirme** (`/yazi/taslak`).
- **Doğrulama kapısı:** zorunlu bölüm kontrolü + uydurma somut tarih/sayı vetosu.

### Gelişmiş node'lar (ENV-gated — demoda açılır)
| Node | Açıklama | Bayrak |
|---|---|---|
| `onay_kapisi` | Memur onay/düzenle/reddet — LangGraph `interrupt()` + checkpointer | `HITL_ENABLED=1` |
| `mevzuat_oner` + rerank | BM25 top-30 → cross-encoder top-3 (bge-reranker-v2-m3) | `RERANK_ENABLED=1` |
| `mevzuat_dogrula` | NLI entailment (madde ⊨ talep) — mDeBERTa-v3-xnli | `NLI_ENABLED=1` |
| `crag` / `self_rag` | Corrective-RAG / reflection (Yan 2024 / Asai 2023) | `CRAG_ENABLED` / `SELF_RAG_ENABLED` |
| `clarifier` | Dur-ve-sor: kritik eksikte taslak üretmeden bilgi iste | `CLARIFY_STOP_ENABLED=1` |

`sla_triyaj`, `denetim_izi`, `kanit_baglama`, `arsiv` her zaman additive çalışır (deterministik, halüsinasyonsuz).

---

## 📊 Skorlar

Tüm ölçümler **gerçek LangGraph pipeline**'ını (`build_graph().ainvoke`) koşar; fark yalnız **LLM modu** ve **veri setidir**.

Held-out: örtük ifadeli, üretim sözlüğünden **farklı** evrak (keyword sızıntısı yok).

### Üretim modeli: DeepSeek-V4 (`deepseek-chat`, OpenAI-uyumlu)

Tercih sebebi: **ucuz** (V4 Flash $0.14/$0.28 per 1M — gpt-4o-mini'den de ucuz) + **güçlü Türkçe**. Held-out **ön-ölçüm (n=22, dağıtılmış örneklem)**:

| Metrik (DeepSeek-V4, n=22 ön-ölçüm) | Değer |
|---|---|
| Sınıflandırma accuracy (sıkı) | **0.955** (21/22) |
| Sınıflandırma macro-F1 (sıkı) | **0.933** [BCa %95 CI 0.875–1.0] |
| Operasyonel accuracy | **1.000** |
| Yönlendirme Top-1 | **0.955** |

> ⚠️ **Dürüstlük:** Küçük örneklem (n=22) → güven aralığı geniş; tam 108-evrak ölçümü sonraki adımdır. Artefakt: [`backend/eval/runs/heldout_deepseek_quick.json`](backend/eval/runs/heldout_deepseek_quick.json).

### Çapraz-referans: gpt-4o (n=108, artefakt-destekli)

Tam 108-evrak held-out'ta (önceki üretim modeli, reprodüke-edilebilir):

| Metrik (n=108) | gpt-4o-mini | **gpt-4o** |
|---|---|---|
| Sınıflandırma macro-F1 (sıkı) | 0.612 | **0.935** [BCa CI 0.881–0.978] |
| Sınıflandırma accuracy (sıkı) | 0.620 | **0.935** [Wilson CI 0.872–0.968] |
| Operasyonel accuracy | 0.768 | **0.963** |
| Yönlendirme Top-1 | 0.778 | **0.954** |
| Doğru / 108 | 67 | **101** |

Artefakt: [`backend/eval/runs/heldout_gpt4o_set1.json`](backend/eval/runs/heldout_gpt4o_set1.json) (PII-maskeli, anahtar yok). Detay: [`docs/benchmark/llm-heldout.md`](docs/benchmark/llm-heldout.md).

### Mock taban (anahtarsız — CI / offline)

`LLM_MODE=mock` keyword/regex fallback ile koşar; bu bir **alt-sınırdır, tavan değildir**. In-domain karne (`competition_scorecard.json`): sınıflandırma macro-F1 0.949, eksik-bilgi recall 0.995, özet faithfulness 1.0, yönlendirme Top-1 0.963, taslak format-uyumu 1.0, false-veto 0, fairness 1.0.

> **Dürüstlük notu:** Mock held-out set-1 figürü artık ezberdir (heuristik o sete uyarlandı) → taban olarak kullanılmaz; leak-free mock taban = set-2 **0.69**. Dairesel-olmayan iddia yalnız gerçek-LLM + set-2'de geçerlidir.

**Kalite kapıları:** kapsamlı test paketi (**700+ backend testi**) ve frontend production build yeşil; istatistik: Wilson CI + exact McNemar + bootstrap-BCa (saf-Python, bağımlılıksız).

---

## 🤖 LLM modları (mock taban → bulut tavan)

`.env` içindeki `LLM_MODE` ile seçilir. **Üretim sağlayıcı: DeepSeek-V4** (OpenAI-uyumlu —
`OPENAI_BASE_URL=https://api.deepseek.com`, `OPENAI_LLM_MODEL=deepseek-chat`); ucuz + güçlü Türkçe.
OpenAI client'ı base_url override ile DeepSeek/OpenAI/Azure'a bağlanır — **kod değişikliği yok**.

| `LLM_MODE` | LLM çağrısı | Anahtar | Ne için |
|---|---|---|---|
| `mock` (varsayılan) | yok — keyword+regex fallback | gerekmez | demo / CI / offline; **skor tabanı** |
| `openai` | **DeepSeek-V4** (önerilen) / OpenAI / Azure — OpenAI-uyumlu | `OPENAI_API_KEY` | **üretim doğruluğu** |
| `llamacpp_server` | lokal Qwen GGUF | — | on-prem / gizlilik (veri kurumdan çıkmaz) |

Üç mod da **aynı pipeline** → kurumun gizlilik/maliyet/internet tercihine göre konuşlandırma.

---

## 🚀 Hızlı başlangıç

```bash
# Backend (çekirdek — hafif, model indirmesi yok)
cd backend
uv sync
cp ../.env.example ../.env          # LLM_MODE=mock yeterli (anahtar gerekmez)
uv run uvicorn main:app --reload    # http://localhost:8000/docs

# Frontend (saf React + Vite)
cd ../frontend
npm install
npm run dev                         # http://localhost:5173
```

Testler: `cd backend && uv run python -m pytest -q`
Mevzuat RAG + rerank (opsiyonel, ağır): `uv sync --extra rag`

---

## 🔌 API (curl)

```bash
# Hazır metinle (OCR'sız)
curl -X POST localhost:8000/process_doc -H "Content-Type: application/json" \
  -d '{"evrak_text":"Sayın Valilik, ... talep ederim. Ad Soyad, imza"}'

# Dosya yükle → SSE (OCR + canlı pipeline node event'leri)
curl -N -X POST localhost:8000/process_doc/stream -F "file=@ornek_evrak.pdf"
```

HITL açıkken `/process_doc` taslakta durur (`onay_bekliyor: true`), karar `/process_doc/resume` ile verilir.

---

## 📚 Dokümanlar (`docs/`)

| Dosya | İçerik |
|---|---|
| `00-yarisma-uygunluk.md` | Şartname özeti + uygunluk kontrol listesi |
| `01-resmi-yazisma-mevzuati.md` | Resmî Yazışma Yön. 2646 + SDP + e-Yazışma |
| `02-evrak-taksonomi-routing.md` | Evrak türleri + birim havale + zorunlu alanlar |
| `03-mimari.md` | LangGraph node listesi + state şeması |
| `06-eval-harness.md` | Metrik → puanlama eşlemesi |
| `07-model-lisanslari.md` | Model/lisans + AGPL notu |
| `benchmark/llm-heldout.md` | **Dürüst gerçek-LLM held-out skorları** (artefakt-destekli) |
| `benchmark/scorecard.md` | Tek-komut mock karne |
| `ticarileşme.md` | Hedef kullanıcı, değer, ölçeklenebilirlik, iş modeli |
| `demo-senaryosu.md` | Jüri canlı demo senaryosu + internet-kesinti yedeği |

---

## ⚖️ Yarışma kuralları ve uyum

- **Açık kaynak (MIT)** — model **ağırlıkları repoya yüklenmez** (yalnız link + sürüm + lisans, [`docs/07`](docs/07-model-lisanslari.md)).
- **Gerçek kamu verisi YASAK** → %100 sentetik/kurgu evrak + kamuya açık mevzuat (checksum-sahte PII).
- **API anahtarı asla commit edilmez** (`.env` `.gitignore`'da).
- Her çıktıda yasal disclaimer: *"Bu sistem karar-destek amaçlıdır; nihai sorumluluk yetkili personeldedir."*

## Lisans

[MIT](LICENSE) © kamu-evrak ekibi · Katkı: [CONTRIBUTING.md](CONTRIBUTING.md)
