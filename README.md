# kamu-evrak — Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi

[![CI](https://github.com/cozalss/kamu-evrak/actions/workflows/ci.yml/badge.svg)](https://github.com/cozalss/kamu-evrak/actions/workflows/ci.yml)
![Testler](https://img.shields.io/badge/testler-1066%20(77%20mod%C3%BCl)-2f9e6e.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)
![LangGraph](https://img.shields.io/badge/LangGraph-20%20node%20multi--agent-1c3d5a.svg)
![React 18](https://img.shields.io/badge/React-18%20%2B%20Vite-61dafb.svg)

> **TEKNOFEST 2026 — Yapay Zeka Dil Ajanları Yarışması · 1. Senaryo**

Kamu kurumuna gelen evrakı **okuyan, sınıflandıran, eksiğini bulan, mevzuat öneren ve resmî
yazı taslağını hazırlayan** çok-ajanlı (LangGraph) sistem — belge başına **~10 sn ve ~$0.001**;
**anahtarsız/offline modda dahi uçtan uca çalışır**, insan onayı olmadan hiçbir yazı çıkmaz.

**Hızlı gezinme:** [Hızlı başlangıç](#-hızlı-başlangıç-anahtar-gerekmez) ·
[Mimari](#-mimari) · [Şartname eşlemesi](#-şartname--rubrik-eşlemesi) · [Skorlar](#-değerlendirme-sonuçları-dürüst) ·
[Neden farklı](#-neden-farklı)

- **Görev 1 — Anla:** oku (OCR/metin) → türü sınıflandır (19 tür) → bilgi çıkar (PII maskeli) →
  eksiği tespit et → ilgili mevzuatı öner (BM25 RAG) → özetle
- **Görev 2 — Üret:** resmî yazı taslağı — Resmî Yazışma Yönetmeliği (CB 2646/2020, kısaca
  "Yön. 2646") formatında → doğrula (uydurma-veto) → risk bandı → memur onayı (HITL) →
  doğru birime yönlendir → bilgilendir → gerekirse eksik bilgi iste

Lisans **MIT**, AGPL bağımlılığı yok (PDF için PyMuPDF yerine `pypdfium2`).

---

## 🚀 Hızlı başlangıç (anahtar gerekmez)

```bash
# Backend — LLM anahtarı GEREKMEZ (mock mod, deterministik)
cd backend
uv sync
cp ../.env.example ../.env
uv run uvicorn main:app --reload      # http://localhost:8000/docs

# Frontend
cd ../frontend
npm install
npm run dev                           # http://localhost:5173
```

Gerçek LLM (üretim doğruluğu) için `.env`:

```bash
LLM_MODE=openai
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_LLM_MODEL=deepseek-chat
OPENAI_API_KEY=sk-...
VITRIN_MODU=1        # demo profili: HITL + clarifier + CRAG + hız (belge ~10 sn)
```

Gereksinimler: **Python 3.11+ · [uv](https://docs.astral.sh/uv/) · Node 20+** (yalnız frontend) — GPU gerekmez.
Testler: `cd backend && uv run python -m pytest -q` (**1066 test · 77 modül**, CI'da mock modda koşar) ·
Mevzuat RAG ağır ekleri (opsiyonel): `uv sync --extra rag`

---

## 🧭 Mimari

Tek LangGraph boru hattı — **20 node'a kadar** (varsayılan 15; gelişmiş node'lar ENV-bayraklı).
`siniflandir ∥ cikar` ve `mevzuat_oner ∥ ozetle` **paralel** koşar; OCR graf-öncesi yapılır
(graf saf metin üzerinde → test edilebilir).

```mermaid
flowchart LR
    EVRAK["Evrak<br/>PDF · görsel · Word · metin"] --> OKU["OCR / metin çıkarımı"]
    subgraph G1["Görev 1 · Anlama"]
        SINIF["sınıflandır<br/>19 tür"]
        CIKAR["bilgi çıkar<br/>PII maskele"]
        EKSIK["eksik tespit<br/>3071 m.4"]
        DECOMP["çok-konulu ayır"]
        MEV["mevzuat öner<br/>BM25 + rerank + NLI"]
        OZET["özetle"]
        SINIF --> EKSIK
        CIKAR --> EKSIK
        EKSIK -.-> DECOMP
        DECOMP --> MEV
        DECOMP --> OZET
    end
    subgraph G2["Görev 2 · Üretim"]
        BIRIM["birim yönlendir"]
        TASLAK["resmî yazı taslağı<br/>Yön. 2646"]
        VERIFY["doğrula<br/>uydurma-veto + lint"]
        RISK["risk bandı<br/>yeşil / sarı / kırmızı"]
        HITL["memur onayı<br/>HITL"]
        BIRIM --> TASLAK --> VERIFY --> RISK
        RISK -.->|sarı·kırmızı| HITL
    end
    OKU --> SINIF
    OKU --> CIKAR
    MEV --> BIRIM
    OZET --> BIRIM
    RISK --> SON["arşiv SDP + yasal süre<br/>+ SHA-256 denetim izi"]
    HITL --> SON
    SON --> CIKTI(["yanıt + DOCX / PDF / EYP 2.0"])
```

Kesikli kenarlar ENV-bayraklı node'lar (temel akış birebir korunur, demo için açılır).
Ayrıntılı topoloji: [`docs/03-mimari.md`](docs/03-mimari.md).

**Dayanıklılık ilkesi:** LLM kullanan **her katmanın deterministik fallback'i vardır**
(keyword/regex/şablon) — anahtar yok, model çökmüş, zaman aşımı: akış hiç durmaz.
2026-07 güçlendirme dalgasıyla **10 varsayılan-açık LLM katmanı** eklendi: OCR düzeltme,
sınıflandırma eskalasyonu (→ `deepseek-reasoner`), risk açıklaması, JSON retry + önbellek,
2646 lint oto-düzeltme, verify grounding, SDP seçici, sohbet araç döngüsü, rerank, NLI —
hepsi aynı ilkeyle: **LLM iyileştirir, fallback garanti eder.** (CRAG düğümü vitrin
profilinde açılır; açıldığında o da LLM'li sürümüyle koşar.)

---

## ✨ Öne çıkanlar (her iddia koda bağlı)

| | |
|---|---|
| 🧩 **Çok-konulu ayrıştırma** | Tek dilekçedeki birden çok istek alt-taleplere bölünür; her biri ayrı **tür + birim + yasal süre** alır → otomatik havale — [`nodes/decompose.py`](backend/agents/nodes/decompose.py) |
| 🚦 **Risk bandı + koşullu onay** | Üretilen yazıya trafik ışığı: 🟢 otomatik geçer, 🟡🔴 memur onayına durur (`interrupt()` + checkpointer) — [`nodes/risk_guard.py`](backend/agents/nodes/risk_guard.py) |
| 💬 **Sohbet asistanı (araç döngülü)** | "Gecikmiş evraklarım hangileri?" → **15 niyet, 10 kullanıcı-kapsamlı veri aracı**, çok-adımlı JSON araç döngüsü (maks. 3 tur), SSE stream, onay/reddet el-sıkışması — [`api/routes/sohbet.py`](backend/api/routes/sohbet.py) · [`docs/09`](docs/09-sohbet-asistani.md) |
| 🗂️ **SDP otomatik dosya kodu** | Devlet Teşkilatı **Standart Dosya Planı (2005/7)** kodunu gerekçesiyle otomatik atar (TR'de emsalini bilmiyoruz) — [`agents/sdp_katalog.py`](backend/agents/sdp_katalog.py) |
| 📦 **EYP 2.0 paket çıktısı** | e-Yazışma Teknik Rehberi uyumlu paket iskeleti (ÜstYazı + Üstveri + SHA-512) → EBYS'ye doğrudan girebilir — [`yazi/eyp.py`](backend/yazi/eyp.py) |
| 🛡️ **PII maskeleme** | TCKN / telefon / IBAN bulut çağrısından **önce** maskelenir; ham kişisel veri sistemde tutulmaz |
| 🚫 **Anti-halüsinasyon** | Deterministik uydurma-veto (**false-veto = 0**) + NLI atıf-gerekçelendirme; emin olunmayan madde `[DOĞRULA:]` işaretli |
| 📚 **Gerçek RAG + atıf grafiği** | 233 mevzuat / 1506 madde-chunk üzerinde **BM25** + model-indirmesiz DeepSeek listwise rerank + **GraphRAG-lite**: maddenin atıf verdiği mevzuata 1-hop genişleme — [`retrieval/atif_grafi.py`](backend/retrieval/atif_grafi.py) |
| ⏰ **Yasal süre triyajı + eskalasyon** | Mevzuat-dayanaklı cevap süresi (3071 m.7 = 30 gün, 4982 m.11 = 15 iş günü) → GECİKMİŞ/KRİTİK rozetleri, kuyruk SLA önizlemesi — [`api/routes/sla.py`](backend/api/routes/sla.py) |
| 🔗 **Denetim izi** | Tamper-evident **SHA-256 hash-zinciri**: her halka öncekini mühürler; arayüzde halka halka incelenebilir + kopyalanabilir — [`nodes/denetim_izi.py`](backend/agents/nodes/denetim_izi.py) |
| 🔎 **Kanıt-vurgu** | Çıkarılan her unsurun ham (maskeli) evraktaki yeri işaretli — "bunu nereden buldun?" sorusuna görsel cevap |
| ⚡ **Gerçek zamanlı demo** | SSE ile canlı ajan hat şeması; özet ve taslak token-token; Ctrl+K komut paleti, PDF önizleme, canlı mevzuat kütüphanesi |

---

## 📋 Şartname / rubrik eşlemesi

Şartname §9'daki her zorunlu adımın koddaki karşılığı ve kanıtı:

| Şartname adımı | Pipeline karşılığı | Kanıt |
|---|---|---|
| G1 · Belgeyi oku (OCR) | pypdfium2 + RapidOCR (offline) + python-docx | [`multimodal/ocr.py`](backend/multimodal/ocr.py) · CER 0.112 ölçümü [`eval/runs/ocr_eval.json`](backend/eval/runs/ocr_eval.json) |
| G1 · Türü sınıflandır | `siniflandir` — 19 tür, few-shot + eskalasyon + fallback | [`nodes/siniflandir.py`](backend/agents/nodes/siniflandir.py) · held-out %95.5 (n=22 ön-ölçüm) |
| G1 · Bilgi unsurlarını çıkar | `cikar` — gönderen/kurum/konu/tarih/sayı/talep, PII maskeli | [`nodes/cikar.py`](backend/agents/nodes/cikar.py) |
| G1 · Eksik tespit + iste | `eksik_tespit` + `clarifier` (dur-ve-sor) | [`nodes/eksik_tespit.py`](backend/agents/nodes/eksik_tespit.py) |
| G1 · Mevzuat öner | `mevzuat_oner` — BM25 + rerank + NLI + atıf grafiği | [`nodes/mevzuat_oner.py`](backend/agents/nodes/mevzuat_oner.py) |
| G1 · Özetle | `ozetle` — key-fact koruyan sadık özet | faithfulness 1.0 ([karne](backend/eval/runs/competition_scorecard.json)) |
| G2 · Resmî yazı taslağı | `yazi_taslak` — üst/cevabi/bilgilendirme/olur, Yön. 2646 | format-uyum 1.0 · [`data/templates/`](data/templates/) (7 Jinja2 şablon) |
| G2 · Resmî üslup + doğrula | `verify` — 2646 lint (madde madde) + uydurma-veto + tutarlılık | [`nodes/verify.py`](backend/agents/nodes/verify.py) · false-veto 0 |
| G2 · Birim yönlendir | `route_birim` — 9 birim, top-k + alternatifler | [`nodes/route_birim.py`](backend/agents/nodes/route_birim.py) |
| G2 · Kullanıcıyı bilgilendir | `finalize` + sohbet asistanı | [`api/routes/sohbet.py`](backend/api/routes/sohbet.py) |

Puanlama boyutlarına göre nereye bakmalı: **Yöntem & Teknik (35)** → [Mimari](#-mimari) +
[`docs/method.md`](docs/method.md) · **Uygulama başarımı (35)** → [Skorlar](#-değerlendirme-sonuçları-dürüst) ·
**Demo (15)** → [`docs/demo-senaryosu.md`](docs/demo-senaryosu.md) · **Yenilikçilik & ticarileşme (15)** →
[Neden farklı](#-neden-farklı) + [`docs/ticarileşme.md`](docs/ticarileşme.md).
Tam matris: [`docs/sartname-uyum-matrisi.md`](docs/sartname-uyum-matrisi.md).

---

## 📊 Değerlendirme sonuçları (dürüst)

Tüm ölçümler **gerçek LangGraph pipeline'ını** koşar (`build_graph().ainvoke`); fark yalnız LLM
modu ve veri setidir. Held-out setler örtük ifadeli, üretim sözlüğünden **farklı** evraklardır
(keyword sızıntısı yok). Tüm artefaktlar repodadır — sayılar yeniden üretilebilir.

### Held-out (görülmemiş evrak) — üretim modeli DeepSeek (`deepseek-chat`)

| Metrik | DeepSeek n=22 (ön-ölçüm) | gpt-4o n=108 (çapraz-referans) |
|---|---|---|
| Sınıflandırma accuracy (sıkı) | **0.955** | 0.935 [Wilson CI 0.872–0.968] |
| Sınıflandırma macro-F1 (sıkı) | **0.933** [BCa CI 0.875–1.0] | 0.935 [BCa CI 0.881–0.978] |
| Operasyonel accuracy *(işlem-eşdeğer tür grubu doğru)* | **1.000** | 0.963 |
| Yönlendirme Top-1 | **0.955** | 0.954 |

Artefaktlar: [`heldout_deepseek_quick.json`](backend/eval/runs/heldout_deepseek_quick.json) ·
[`heldout_gpt4o_set1.json`](backend/eval/runs/heldout_gpt4o_set1.json) ·
detay [`docs/benchmark/llm-heldout.md`](docs/benchmark/llm-heldout.md).

> ⚠️ **Dürüstlük:** DeepSeek ölçümü küçük örneklem (n=22) → CI geniş; tam n=108 koşusu yol
> haritasında. gpt-4o satırı önceki üretim modelinin tam-set çapraz-referansıdır.

### Geniş in-domain karne (n=216, gerçek LLM, kasıtlı zor set)

216 evraklık set **bilerek zor** kurgulanmıştır (örtük ifade, zorluk kademeli):

| Metrik (n=216, `llm_mode=openai`) | Değer |
|---|---|
| Sınıflandırma accuracy / macro-F1 | 0.662 / 0.666 (kolay 0.75 · orta 0.72 · zor 0.51) |
| Eksik-bilgi precision / recall | **1.000** / 0.549 *(recall örtük eksiklerden düşük; precision 1.0 = yanlış alarm yok)* |
| Özet faithfulness (halüsinasyon) | **1.000** |
| Yönlendirme Top-1 / Top-3 | 0.773 / **0.917** |
| Taslak format-uyumu (2646) / false-veto | **1.000** / **0** |
| Etik tutarlılık *(kimlik takasında karar değişmezliği)* | 0.889 / 0.944 |

Artefakt: [`competition_scorecard.json`](backend/eval/runs/competition_scorecard.json)
(git-sha damgalı) · yeniden üret: `uv run python -m eval.competition_scorecard --check`.
Held-out ile fark **setin zorluğundandır** — ikisini de olduğu gibi raporluyoruz; manşet
için kolay seti seçmiyoruz. 1.0 skorlar deterministik kural-tabanlı kontrollerdir (ölçüm
tanımları: [`docs/06-eval-harness.md`](docs/06-eval-harness.md)).

### Tabanlar ve yardımcı ölçümler

- **Anahtarsız taban** (`LLM_MODE=mock`, leak-free held-out set-2): accuracy **0.694** — bu bir
  alt sınırdır; LLM'siz modda bile sistemin ayakta kaldığını gösterir.
  [`heldout_mock_set2.json`](backend/eval/runs/heldout_mock_set2.json)
  > Not: 0.694 (held-out set-2) ile 0.662 (n=216 zor in-domain) **farklı setlerdir, doğrudan
  > kıyaslanamaz.** Aynı held-out ailesinde gerçek LLM 0.935'e çıkar (set-1, n=108); mock'un
  > 216'lık zor setteki koşusu ve tam aynı-set DeepSeek karşılaştırması yol haritasındadır.
- **OCR** (taranmış PDF, RapidOCR): CER **0.112** / WER 0.514 (n=3) — [`ocr_eval.json`](backend/eval/runs/ocr_eval.json)
- **Mevzuat retrieval**: Recall@1 0.625 / Recall@3 **0.875** (n=16; ölçüm: [`docs/method.md`](docs/method.md))
- **İstatistik altyapısı**: Wilson CI + exact McNemar + bootstrap-BCa, saf Python — [`eval/stats.py`](backend/eval/stats.py)
- **KamuEvrak-Bench**: 6 görevli, %100 sentetik, veri-kartlı bench paketi — [`bench/`](bench/)

---

## 🥊 Neden farklı

| Yetenek | Manuel EBYS süreci | Tek LLM çağrısı | **kamu-evrak** |
|---|---|---|---|
| Çok-konulu dilekçe | 3 kez fotokopi, 3 ayrı havale | Tek özet, kayıp talepler | Alt-taleplere böler, her birine ayrı tür+birim+süre |
| Halüsinasyon riski | — | Kaynaksız madde uydurabilir | Uydurma-veto + NLI + `[DOĞRULA:]` protokolü |
| Kişisel veri | Fiziksel dosyada açık | Buluta ham gider | Çağrıdan **önce** maskeleme; on-prem `KVKK_MODU` |
| Denetlenebilirlik | Islak imza + zimmet defteri | Yok | SHA-256 hash-zinciri + HITL onay kaydı |
| Anahtar/internet yoksa | Çalışır (elle) | Durur | **Deterministik fallback ile uçtan uca çalışır** |
| Arşiv/EBYS entegrasyonu | Elle SDP kodu | Yok | Otomatik SDP kodu + EYP 2.0 paketi |
| Maliyet / belge | Memur-dakikaları | değişken | **~$0.001** (DeepSeek) · ~10 sn |

---

## 🤖 LLM modları — kurumun tercihine göre konuşlandırma

`.env` → `LLM_MODE`. OpenAI-uyumlu istemci `base_url` ile DeepSeek/OpenAI/Azure'a bağlanır — kod değişikliği yok.

| Mod | LLM | Anahtar | Ne için |
|---|---|---|---|
| `mock` (varsayılan) | yok — keyword+regex | gerekmez | demo / CI / offline; skor tabanı |
| `openai` | **DeepSeek `deepseek-chat`** (önerilen) / OpenAI / Azure | `OPENAI_API_KEY` | üretim doğruluğu (~$0.001/belge) |
| `llamacpp` | lokal Qwen GGUF | — | on-prem / gizlilik |

İki **profil anahtarı** hepsinin üstünde: `VITRIN_MODU=1` (jüri demosu: HITL + clarifier +
CRAG + atıf genişletme + hız profili → belge ~10 sn) · `KVKK_MODU=1` (yerel Ollama'ya zorlar —
veri kurumdan çıkmaz).

---

## 🔌 API (curl)

```bash
# Hazır metinle (OCR'sız)
curl -X POST localhost:8000/process_doc -H "Content-Type: application/json" \
  -d '{"evrak_text":"Sayın Valilik, ... talep ederim. Ad Soyad, imza"}'

# Dosya yükle → SSE (OCR + canlı pipeline node event'leri)
curl -N -X POST localhost:8000/process_doc/stream -F "file=@ornek_evrak.pdf"
```

HITL açıkken `/process_doc` taslakta durur (`onay_bekliyor: true`), karar `/process_doc/resume`
ile verilir. Diğer uçlar: `/sohbet` + `/sohbet/stream` (asistan), `/sla/onizleme`,
`/mevzuat/*` (kütüphane + BM25 derin arama), `/yazi/render` (DOCX/PDF/EYP).

---

## 🔍 Sınırlar ve doğrulama (bilerek şeffaf)

- **Mevzuat referansları karar-destek amaçlıdır**: sistem emin olmadığı maddeyi `[DOĞRULA:]`
  ile işaretler; NLI desteği zayıfsa arayüz "insan incelemesi önerilir" der. Nihai hukuki
  doğrulama mevzuat.gov.tr üzerindendir.
- **Veri %100 sentetiktir** (şartname §6.5): gerçek kamu verisi/PII kullanılmadı; TCKN'ler
  checksum-geçerli fakat sahtedir. Bench veri kartı: [`bench/`](bench/).
- **Küçük örneklemler açıkça etiketli**: DeepSeek held-out n=22, OCR n=3 — büyütme yol
  haritasında; sayı büyütülene dek CI'lar raporlanır.
- **Ablasyon dürüstlüğü**: CRAG/verify A/B ölçümünde Δ≈0 çıktı; bunu gizlemiyoruz
  ([`docs/benchmark/ablation.md`](docs/benchmark/ablation.md)).
- Her çıktıda yasal uyarı: *"Bu sistem karar-destek amaçlıdır; nihai sorumluluk yetkili
  personeldedir."*

---

## 📚 Dokümanlar (`docs/`)

| Dosya | İçerik |
|---|---|
| [`00-yarisma-uygunluk.md`](docs/00-yarisma-uygunluk.md) | Şartname özeti + uygunluk kontrol listesi |
| [`sartname-uyum-matrisi.md`](docs/sartname-uyum-matrisi.md) | Şartname maddesi → kod → test tam matrisi |
| [`method.md`](docs/method.md) | Yöntem raporu (jüri teknik değerlendirmesi için) |
| [`03-mimari.md`](docs/03-mimari.md) | LangGraph node listesi + state şeması |
| [`06-eval-harness.md`](docs/06-eval-harness.md) | Metrik → puanlama eşlemesi |
| [`09-sohbet-asistani.md`](docs/09-sohbet-asistani.md) | Sohbet asistanı: niyet + araç döngüsü spesifikasyonu |
| [`benchmark/llm-heldout.md`](docs/benchmark/llm-heldout.md) | Held-out skorları (artefakt-destekli) |
| [`benchmark/ablation.md`](docs/benchmark/ablation.md) | CRAG/verify A/B — dürüst Δ raporu |
| [`data-card.md`](docs/data-card.md) | Sentetik veri kartı |
| [`07-model-lisanslari.md`](docs/07-model-lisanslari.md) | Model/lisans + AGPL notu |
| [`ticarileşme.md`](docs/ticarileşme.md) | Hedef kullanıcı, değer, iş modeli |
| [`demo-senaryosu.md`](docs/demo-senaryosu.md) | Jüri canlı demo senaryosu + internet-kesinti yedeği |

---

## ⚖️ Yarışma kuralları ve uyum

- **Açık kaynak (MIT)** — model ağırlıkları repoya yüklenmez (yalnız link + sürüm + lisans,
  [`docs/07`](docs/07-model-lisanslari.md)).
- **Gerçek kamu verisi YASAK** → %100 sentetik/kurgu evrak + kamuya açık mevzuat.
- **API anahtarı asla commit edilmez** (`.env` `.gitignore`'da).

## 👥 Takım

**TasnifX** — TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması, "Kamu Evrak ve Resmî Yazışma
Süreçleri İçin Çok Ajanlı (Multi-Agent) Akıllı Destek Sistemi" kategorisi.
Başvuru: 04 Temmuz 2026 (Takım ID 1001572 · Başvuru ID 5372496).

- cem özal
- Gizem Fatma Kılıç
- Ecem Tüysüz
- Can Eltayeb

**Danışman:** Sevgi Koyuncu Tunç

## Lisans

[MIT](LICENSE) © kamu-evrak ekibi · Katkı: [CONTRIBUTING.md](CONTRIBUTING.md)
