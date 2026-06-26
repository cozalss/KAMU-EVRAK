# 03 — Mimari (çok-ajanlı LangGraph pipeline)

ADALET-AGENT'in ENV-gated, conditional-edge, fan-in/fan-out **deseni KEEP**; node listesi
kamu-evrak iş akışına yenilendi. OCR (`oku`) graf-öncesi (API route) yapılır → graf **saf metin**
üzerinde çalışır (test-edilebilir).

## Akış

```
START → siniflandir → cikar → kanit_baglama → eksik_tespit → [decompose]
                                                                  │
                                          ┌───────────────────────┴────────┐
                                          ▼                                 ▼
                                     mevzuat_oner                        ozetle   (paralel fan-out)
                                          └───────────────┬─────────────────┘
                                                          ▼
  route_birim → yazi_taslak → verify → [risk_guard] → (🟢 geç │ 🟡🔴 → onay_kapisi*) → arsiv
            → sla_triyaj → denetim_izi → finalize → END
```

`[decompose]` (ENV-gated, **varsayılan açık**): çok-konulu evrakı alt-taleplere böler ve paralel
fan-out kaynağı olur (kapalıyken fan-out `eksik_tespit`'ten başlar — baseline birebir).

`[risk_guard]` (ENV-gated, **varsayılan açık**): verify sinyallerinden trafik ışığı bandı
(🟢 yayın-hazır / 🟡 memur incelesin / 🔴 uydurma şüphesi) üretir. HITL (`HITL_ENABLED`) açıkken
**koşullu onay**: 🟢 otomatik `arsiv`'e geçer, 🟡🔴 `onay_kapisi` interrupt'ında memura durur.

OCR: `POST /process_doc/stream` dosyayı alır → `multimodal/ocr.extract_text` → "oku" SSE event
→ graf `evrak_text` ile çağrılır.

## Node'lar (`backend/agents/nodes/`)

| Node | Görev | Durum | Köken |
|---|---|---|---|
| `oku` (route) | bytes → metin + güven + sayfa | **GERÇEK** | `multimodal/ocr.py` KEEP |
| `siniflandir` | evrak türü (18+belirsiz) | **UYGULANDI** — few-shot LLM + mock fallback | triaj deseni |
| `cikar` | bilgi unsurları + PII maskeleme | **UYGULANDI** — JSON/regex + maskeleme | yeni |
| `eksik_tespit` | zorunlu-alan → eksik + takip sorusu | **UYGULANDI** — tür şeması | clarify_slots deseni |
| `decompose` | çok-konulu evrak → alt-talepler (tür+birim+süre) | **UYGULANDI** — LLM segment + deterministik bağlaç fallback; ENV-gated (varsayılan açık) | yeni (vitrin) |
| `mevzuat_oner` | ilgili mevzuat | **UYGULANDI** — BM25 + fallback | mevzuat node |
| `ozetle` | kısa öz özet | **UYGULANDI** — key-fact odaklı özet | draft deseni |
| `route_birim` | hedef birim + top-k | **UYGULANDI** — 9 birim sınıflandırıcı | yeni |
| `yazi_taslak` | resmî yazı (Yön. 2646 format) | **UYGULANDI** — jinja2 + LLM/mock; format kapısı açık | dilekce node |
| `verify` | taslak kalite kapısı + uydurma-veto | **UYGULANDI** — false-veto=0 | yeni |
| `risk_guard` | risk bandı (🟢/🟡/🔴) + koşullu HITL | **UYGULANDI** — deterministik, verify sinyallerinden; ENV-gated (varsayılan açık) | yeni (vitrin) |
| `arsiv` | SDP 2005/7 arşiv metadata | **UYGULANDI** — additive | yeni |
| `finalize` | bilgilendirme + clarify | **UYGULANDI** — compose + disclaimer | finalize deseni |

## State (`backend/agents/state.py`)

`EvrakState` TypedDict. Reducer'lar (ADALET deseni KEEP): `bilgi_unsurlari` dict-merge,
`mevzuat_onerileri`/`errors` `operator.add` (paralel fan-in). Anahtar alanlar:
`evrak_text, evrak_turu, bilgi_unsurlari, eksik_alanlar, mevzuat_onerileri, ozet, hedef_birim,
yazi_turu, yazi_taslak_md, verify_notes, arsiv_metadata, clarify_questions, response`.
`alt_talepler` (decompose; tek-yazıcı fan-out kaynağı → plain liste, reducer gerekmez).

## Genişletme / açık kalite kapıları

- **ENV-gated SOTA** (ADALET KEEP): `crag`/`self_rag`/`decompose` → Yenilikçilik puanı.
- **Taslak format kapısı:** canlı karnede `format_uyumlu_rate=1.0`; ham `{{ }}`
  placeholder yerine EBYS/yetkili makamca tamamlanacak alanlar nötr taslak diliyle gösterilir.
- **risk_guard genişletmesi:** verify node çalışıyor; daha kapsamlı kurum/tarih/sayı veto katmanı
  finalist fazında büyütülür.
- **clarifier dur-ve-sor dalı**: eksik alan varsa conditional-edge ile kullanıcıya soru döndür,
  taslak üretmeden bekle (ADALET clarifier deseni).
- **LLM seçimi** `agents/llm.py` (KEEP, 4-impl Protocol): `LLM_MODE` ∈ mock/openai/llamacpp.

## API

- `POST /process_doc` — blocking JSON (test).
- `POST /process_doc/stream` — dosya → OCR + node SSE event'leri (canlı Ajan Akış Şeması, Demo 15p).
- `POST /multimodal/ocr` — salt OCR.
- `GET /health` — LLM modu + pipeline node listesi.
