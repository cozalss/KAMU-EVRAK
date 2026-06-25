# kamu-evrak — Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi

> **TEKNOFEST 2026 — Yapay Zeka Dil Ajanları Yarışması, 1. Senaryo**
> Çok-ajanlı (LangGraph) yapay zeka ile kamu evrakını **oku → sınıflandır → bilgi çıkar →
> eksik tespit et → mevzuat öner → özetle** (Görev 1) ve **resmî yazı taslakla → birime
> yönlendir → kullanıcıyı bilgilendir** (Görev 2).

Bu depo, mevcut **ADALET-AGENT** altyapısından (çok-ajan + OCR + Türkçe RAG + grounding +
canlı SSE demo) yeniden-kullanılabilir kod **kopyalanarak** kuruldu; ADALET'e dokunulmadı.
Lisans: **MIT** (AGPL bağımlılık yok — PyMuPDF yerine pypdfium2).

## Durum: ÇALIŞIR İSKELET

- **Gerçek çalışan:** OCR hattı (dijital PDF → pypdfium2 kusursuz Türkçe; taranmış/foto →
  RapidOCR offline; Word → python-docx; opsiyonel OpenAI vision), uçtan-uca SSE pipeline,
  canlı Ajan Akış Şeması (frontend).
- **STUB (deterministik, `# TODO(kamu-evrak)` işaretli):** sınıflandırma, bilgi çıkarımı,
  eksik tespiti, mevzuat önerisi, özetleme, birim yönlendirme, yazı taslağı. Ekip bunları
  few-shot LLM / RAG / jinja2 şablon ile dolduracak (bkz. `docs/08-yol-haritasi.md`).

## Hızlı başlangıç

```bash
# Backend (çekirdek iskelet — hafif, model indirmesi yok)
cd backend
uv sync
cp ../.env.example ../.env        # LLM_MODE=mock yeterli
uv run uvicorn main:app --reload  # http://localhost:8000/docs

# Frontend
cd ../frontend
pnpm install && pnpm dev          # http://localhost:5173
```

Mevzuat RAG (opsiyonel, ağır): `uv sync --extra rag` + `docker compose --profile rag up`.

## Uçtan-uca dene

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

## Yarışma kuralları (kritik)

- Açık kaynak (MIT) + **TAKP GitHub** zorunlu; model **ağırlıkları repoya YÜKLENMEZ** (link+lisans).
- **Gerçek kamu verisi YASAK** → sentetik/kurgu evrak + kamuya açık mevzuat (sahte PII).
- Her yanıtta uygunluk/disclaimer; uçtan-uca **canlı demo** (real-time avantaj).
- Takvim ve uygunluk kontrol listesi: [`docs/00-yarisma-uygunluk.md`](docs/00-yarisma-uygunluk.md).
