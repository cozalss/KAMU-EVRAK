# kamu-evrak — Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)
![React 18](https://img.shields.io/badge/React-18-61dafb.svg)
[![Katkı](https://img.shields.io/badge/Katk%C4%B1-CONTRIBUTING-brightgreen.svg)](CONTRIBUTING.md)

> **TEKNOFEST 2026 — Yapay Zeka Dil Ajanları Yarışması, 1. Senaryo**
> Çok-ajanlı (LangGraph) yapay zeka ile kamu evrakını **oku → sınıflandır → bilgi çıkar →
> eksik tespit et → mevzuat öner → özetle** (Görev 1) ve **resmî yazı taslakla → birime
> yönlendir → kullanıcıyı bilgilendir** (Görev 2).

Bu depo, mevcut **ADALET-AGENT** altyapısından (çok-ajan + OCR + Türkçe RAG + grounding +
canlı SSE demo) yeniden-kullanılabilir kod **kopyalanarak** kuruldu; ADALET'e dokunulmadı.
Lisans: **MIT** (AGPL bağımlılık yok — PyMuPDF yerine pypdfium2).

## Özellikler

### Görev 1 — Evrak Sınıflandırma ve İçerik Analizi
- **OCR / metin okuma:** dijital PDF → pypdfium2 (kusursuz Türkçe); taranmış/foto → RapidOCR
  (offline); Word → python-docx; opsiyonel OpenAI vision.
- **Sınıflandırma:** 19 evrak türü (config taksonomisi; `belirsiz` abstention dahil) — few-shot
  LLM + keyword pre-filter + mock fallback.
- **Bilgi çıkarımı:** gönderen / kurum / konu / tarih / sayı / talep — **PII (TCKN, telefon)
  maskelenerek**; ham kişisel veri arayüze ulaşmaz.
- **Eksik-bilgi tespiti:** tür-bağımlı zorunlu-alan şeması → eksikse clarify soruları üretir.
- **Mevzuat önerisi:** kamuya açık mevzuat üzerinde BM25/keyword retrieval (RAG opsiyonel).
- **Özet:** key-fact'leri koruyan kısa özet.

### Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme
- **Birim yönlendirme:** 9 birim arasında top-k öneri + güven + alternatifler.
- **Resmî yazı taslağı:** üst / cevabi / bilgilendirme / olur — jinja2 şablon + resmî üslup.
- **Taslak indirme:** **PDF / DOCX** çıktı (`/yazi/taslak`).
- **Bilgilendirme:** vatandaşa/kullanıcıya özet + eksik bilgi talebi.

### Demo / arayüz
- **Canlı Ajan Akış Şeması:** SSE ile node'lar gerçek zamanlı "yanar" (düşünen-sistem hissi).
- **Sonuç kartları:** evrak türü + güven, çıkarılan alanlar (🛡️ maskeli rozet), eksik bilgi,
  mevzuat, birim, yazı taslağı önizleme + indirme.
- **5 örnek evrak** (sahte-PII) — jüri dosya bulmadan tek tıkla farklı türleri canlı işletir.
- **Yasal disclaimer** her sonuçta: "Bu sistem karar-destek amaçlıdır; nihai sorumluluk
  yetkili personeldedir."
- a11y: klavye gezinme, ARIA, `prefers-reduced-motion`; saf React/Vite (ek dep yok).

## Eval skorları (mock taban → mini → gpt-4o tavan)

> İki ayrı ölçüm var, ikisi de **GERÇEK LangGraph pipeline**'ı (`build_graph().ainvoke`) koşar;
> fark yalnız **LLM modu** ve **veri setidir**. Dürüst okuma için ikisini birlikte bakın.
>
> - **Mock taban (anahtarsız):** `LLM_MODE=mock` → keyword/regex fallback. CI/offline taban; **tavan değildir.**
> - **Gerçek-LLM held-out (dürüst, dairesel-OLMAYAN):** `LLM_MODE=openai` → örtük ifadeli, gen_synthetic'ten
>   **farklı şablon/sözlükle** yazılmış 108-evrak held-out sette (keyword sızıntısı yok). Tam tablo +
>   mock→mini→gpt-4o ilerlemesi: [`docs/benchmark/llm-heldout.md`](docs/benchmark/llm-heldout.md).

| Metrik (aynı held-out set) | Mock (taban) | gpt-4o-mini | **gpt-4o (üretim tavanı)** |
|---|---|---|---|
| Sınıflandırma macro-F1 (sıkı) | 0.218 | 0.612 | **0.908** |
| Sınıflandırma accuracy (sıkı) | 0.213 | 0.620 | **0.907** [%95 CI 0.838–0.949] |
| Operasyonel accuracy (eşdeğer-grup) | — | 0.768 | **0.935** [%95 CI 0.872–0.968] |
| Yönlendirme Top-1 | 0.426 | 0.778 | **0.926** [%95 CI 0.861–0.962] |
| Yönlendirme Top-3 | 0.463 | 0.870 | **0.944** |
| Doğru / 108 | 23 | 67 | **98** |

> **Üretim önerisi:** `LLM_MODE=openai` + **gpt-4o** → dairesel-olmayan held-out'ta **sıkı macro-F1
> ~0.91 / operasyonel ~0.93 / yönlendirme Top-1 ~0.93** (98/108). Mock = **anahtarsız taban** (CI/offline
> demo), tavan değil. İlerleme: mock **0.22** → mini **0.61** → gpt-4o **0.91** — mimari sağlam, gerçek
> değer semantik LLM modunda. (Mock in-domain karnesi: [`docs/benchmark/scorecard.md`](docs/benchmark/scorecard.md).)

Test paketi: **210 passed, 1 skipped** (`cd backend && uv run python -m pytest`).

## Gerçek LLM modu (mock taban → bulut tavan)

Sistem üç LLM modunda **uçtan uca aynı pipeline'ı** çalıştırır; fark yalnız **kalitededir**.
Mod `.env` içindeki `LLM_MODE` ile seçilir (örnek: `.env.example`).

| `LLM_MODE` | LLM çağrısı | Anahtar | Ne için |
|---|---|---|---|
| `mock` (varsayılan) | yok — keyword+regex heuristik fallback | gerekmez | demo / CI / offline; **skor tabanı** |
| `openai` | OpenAI bulut (few-shot JSON çıkarımı) | `OPENAI_API_KEY` zorunlu | **gerçek doğruluk** (skor tavanı) |
| `llamacpp` | lokal Qwen GGUF | `LLM_MODEL_PATH` | offline / gizlilik |

**Tek komutla aç + ölç** (anahtar `.env`'de ya da satır-içi; asla commit edilmez):

```bash
# Gerçek LLM ile birkaç örnek evrakı pipeline'dan geçir (sınıf/çıkarım/birim/taslak):
LLM_MODE=openai OPENAI_API_KEY=sk-... python scripts/run_llm_smoke.py
# Küçük gold örnekleminde gerçek-LLM sınıflandırma doğruluğunu da ölç:
LLM_MODE=openai OPENAI_API_KEY=sk-... python scripts/run_llm_smoke.py --acc 12
# Anahtarsız: NET mesajla mock'a düşer, PATLAMAZ (demo/CI):
python scripts/run_llm_smoke.py
```

> **Dürüst not (skorların anlamı):** `docs/benchmark/scorecard.md` karnesi **`LLM_MODE=mock`** ile
> ölçülmüştür — sınıflandırma/çıkarım few-shot LLM yerine deterministik keyword/regex fallback ile koşar.
> Bu **tavan değil tabandır (alt-sınır).** "Yükseltir" iddiası artık **ölçüldü:** dairesel-olmayan
> held-out sette `LLM_MODE=openai` + **gpt-4o** → sıkı macro-F1 **0.908**, operasyonel **0.935**,
> yönlendirme Top-1 **0.926** (98/108). İlerleme mock **0.22** → mini **0.61** → gpt-4o **0.91**.
> Tam tablo: [`docs/benchmark/llm-heldout.md`](docs/benchmark/llm-heldout.md). Ölçüm yöntemi:
> [`docs/method.md`](docs/method.md).

## Ekran görüntüleri

> _Placeholder — gerçek görseller `docs/img/` altına eklenecek (PNG/GIF)._

| | |
|---|---|
| ![Yükleme + örnek evraklar](docs/img/01-yukleme.png) | ![Canlı ajan akış şeması](docs/img/02-akis.png) |
| ![Sonuç kartları (PII maskeli)](docs/img/03-sonuc.png) | ![Resmî yazı taslağı + indirme](docs/img/04-taslak.png) |

Canlı akışı kayıt olarak görmek için: `docs/img/demo.gif` (internet-kesinti yedeği — bkz.
[`docs/demo-senaryosu.md`](docs/demo-senaryosu.md)).

## Hızlı başlangıç

```bash
# Backend (çekirdek iskelet — hafif, model indirmesi yok)
cd backend
uv sync
cp ../.env.example ../.env         # LLM_MODE=mock yeterli (anahtar gerekmez)
uv run uvicorn main:app --reload   # http://localhost:8000/docs

# Frontend (saf React + Vite; react/react-dom dışında ek dep yok)
cd ../frontend
npm install
npm run dev                        # http://localhost:5173
npm run build                      # üretim derlemesi → dist/
```

Tek komutla demo: `bash scripts/run-local-demo.sh`.
Mevzuat RAG (opsiyonel, ağır): `uv sync --extra rag` + `docker compose --profile rag up`.

## Demo akışı (jüri için)

1. **Örnek evrak** seç (ör. "Dilekçe") → ajan akış şeması canlı "yanar".
2. Sonuç kartlarını oku → 🛡️ **kişisel veri maskeli** rozeti, eksik-bilgi kontrolü, mevzuat,
   önerilen havale birimi.
3. **Resmî Yazı Taslağı** kartından **PDF/DOCX indir** (örnek-evrak akışında etkin).
4. "Şikâyet (eksik)" örneği → sistem eksik alanı yakalar, **clarify soruları** üretir.

Tam senaryo + **internet-kesinti yedeği**: [`docs/demo-senaryosu.md`](docs/demo-senaryosu.md).

## Uçtan-uca dene (curl)

```bash
# Hazır metinle (OCR'sız)
curl -X POST localhost:8000/process_doc -H "Content-Type: application/json" \
  -d '{"evrak_text":"Sayın Valilik, ... talep ederim. Ad Soyad, imza"}'

# Dosya yükle → SSE (OCR + pipeline node event'leri)
curl -N -X POST localhost:8000/process_doc/stream -F "file=@ornek_evrak.pdf"
```

## Mimari (özet)

```
START → siniflandir → cikar → eksik_tespit → [mevzuat_oner ∥ ozetle]
      → route_birim → yazi_taslak → finalize → END
```

Detaylar: [`docs/03-mimari.md`](docs/03-mimari.md). OCR graf-öncesi (API route) yapılır.

## Dokümanlar (`docs/`)

| Dosya | İçerik |
|---|---|
| `00-yarisma-uygunluk.md` | Şartname özeti + **takvim** + uygunluk kontrol listesi + teslim formatı |
| `01-resmi-yazisma-mevzuati.md` | Resmî Yazışma Yön. 2646 madde-madde + SDP + e-Yazışma |
| `02-evrak-taksonomi-routing.md` | Evrak türleri + birim havale + zorunlu alanlar |
| `03-mimari.md` | LangGraph node listesi + state şeması |
| `04-port-haritasi.md` | ADALET → kamu-evrak (KEEP/ADAPT/DROP) |
| `05-sentetik-veri-plani.md` | Sahte-PII veri üretimi + gold set |
| `06-eval-harness.md` | Metrik → puanlama (35/35/15/15) |
| `07-model-lisanslari.md` | Açık-kaynak model/lisans + AGPL notu |
| `08-yol-haritasi.md` | Düzeltilmiş takvim + haftalık plan |
| `demo-senaryosu.md` | **Jüri canlı demo senaryosu + internet-kesinti yedeği** |
| `benchmark/scorecard.md` | Tek-komut yarışma karnesi (GERÇEK pipeline ölçümü) |

## Yarışma kuralları (kritik)

- Açık kaynak (MIT) + **TAKP GitHub** zorunlu; model **ağırlıkları repoya YÜKLENMEZ** (link+lisans).
- **Gerçek kamu verisi YASAK** → sentetik/kurgu evrak + kamuya açık mevzuat (sahte PII).
- Her yanıtta uygunluk/disclaimer; uçtan-uca **canlı demo** (real-time avantaj).
- Takvim ve uygunluk kontrol listesi: [`docs/00-yarisma-uygunluk.md`](docs/00-yarisma-uygunluk.md).
