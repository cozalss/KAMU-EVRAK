# 03 — Mimari (çok-ajanlı LangGraph pipeline)

ADALET-AGENT'in ENV-gated, conditional-edge, fan-in/fan-out **deseni KEEP**; node listesi
kamu-evrak iş akışına yenilendi. OCR (`oku`) graf-öncesi (API route) yapılır → graf **saf metin**
üzerinde çalışır (test-edilebilir).

## Akış

```
START → siniflandir → cikar → eksik_tespit
                                   │
                      ┌────────────┴────────────┐
                      ▼                          ▼
                 mevzuat_oner                 ozetle      (paralel fan-out)
                      └────────────┬────────────┘
                                   ▼
                              route_birim → yazi_taslak → finalize → END
```

OCR: `POST /process_doc/stream` dosyayı alır → `multimodal/ocr.extract_text` → "oku" SSE event
→ graf `evrak_text` ile çağrılır.

## Node'lar (`backend/agents/nodes/`)

| Node | Görev | Durum | Köken |
|---|---|---|---|
| `oku` (route) | bytes → metin + güven + sayfa | **GERÇEK** | `multimodal/ocr.py` KEEP |
| `siniflandir` | evrak türü (18+belirsiz) | STUB→few-shot LLM | triaj deseni |
| `cikar` | bilgi unsurları + PII maskeleme | STUB→LLM JSON | yeni |
| `eksik_tespit` | zorunlu-alan → eksik + takip sorusu | STUB→şema | clarify_slots deseni |
| `mevzuat_oner` | ilgili mevzuat | STUB→hybrid RAG | mevzuat node |
| `ozetle` | kısa öz özet | STUB→LLM/mT5 | draft deseni |
| `route_birim` | hedef birim + top-k | STUB→sınıflandırıcı | yeni |
| `yazi_taslak` | resmî yazı (Yön. 2646 format) | STUB→jinja2+LLM | dilekce node |
| `finalize` | bilgilendirme + clarify | STUB→compose | finalize deseni |

## State (`backend/agents/state.py`)

`EvrakState` TypedDict. Reducer'lar (ADALET deseni KEEP): `bilgi_unsurlari` dict-merge,
`mevzuat_onerileri`/`errors` `operator.add` (paralel fan-in). Anahtar alanlar:
`evrak_text, evrak_turu, bilgi_unsurlari, eksik_alanlar, mevzuat_onerileri, ozet, hedef_birim,
yazi_turu, yazi_taslak_md, clarify_questions, response`.

## Üretimde eklenecekler (`# TODO(kamu-evrak)`)

- **ENV-gated SOTA** (ADALET KEEP): `crag`/`self_rag`/`decompose` → Yenilikçilik puanı.
- **verify / risk_guard**: uydurma kurum/tarih/sayı **veto** + resmî-yazı format-compliance
  (false-veto=0 hedefi). ADALET `verifier_layers.py`/`risk_guard.py` ADAPT.
- **clarifier dur-ve-sor dalı**: eksik alan varsa conditional-edge ile kullanıcıya soru döndür,
  taslak üretmeden bekle (ADALET clarifier deseni).
- **LLM seçimi** `agents/llm.py` (KEEP, 4-impl Protocol): `LLM_MODE` ∈ mock/openai/llamacpp.

## API

- `POST /process_doc` — blocking JSON (test).
- `POST /process_doc/stream` — dosya → OCR + node SSE event'leri (canlı Ajan Akış Şeması, Demo 15p).
- `POST /multimodal/ocr` — salt OCR.
- `GET /health` — LLM modu + pipeline node listesi.
