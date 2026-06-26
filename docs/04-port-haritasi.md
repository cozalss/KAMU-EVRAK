# 04 — Port Haritası: ADALET-AGENT → kamu-evrak

> ADALET-AGENT **kaynak/dokunulmaz**; bu depoya yalnız kopyalandı. KEEP = aynen; ADAPT =
> kamu-evrak alanına uyarlanmış; DROP = taşınmadı (hukuk-spesifik).

## Bu oturumda kopyalanan/uyarlanan (mevcut)

| ADALET dosyası | kamu-evrak | Karar | Not |
|---|---|---|---|
| `core/text.py` (+`chunker.sanitize_text`) | `core/text.py` | **MERGE** | tr_lower + sanitize_text birleşti (multimodal'i retrieval'den ayırdı) |
| `core/{logging,metrics,observability,openai_compat}.py` | aynı | KEEP | domain-bağımsız |
| `multimodal/ocr.py` | aynı | **KEEP** | import repoint: `retrieval.chunker`→`core.text` |
| `multimodal/{ocr_rapidocr,ocr_cloud,docx_utils}.py` | aynı | KEEP | sıfır değişiklik |
| `multimodal/pdf_utils.py` | aynı | **ADAPT** | **PyMuPDF(AGPL) → pypdfium2(Apache/BSD)** — lisans fix |
| `agents/{llm,llm_mock}.py` | aynı | KEEP | 4-impl LLM Protocol |
| `agents/dilekce/{renderer,models,template_registry}.py` | `yazi/` | KEEP/ADAPT | render motoru KEEP; şablonlar yeni |
| `retrieval/{chunker,embedding,vector_store,hybrid_search,reranker,hyde,multi_query,mcp_base,turkish_text,query_rewrite,typo_tolerance}.py` | aynı | **KEEP (team)** | mevzuat-RAG; boot-kritik değil (opsiyonel `[rag]`) |
| `eval/{stats,scorecard,judge}.py` | aynı | KEEP | Wilson/McNemar/bootstrap/LLM-judge |
| `api/routes/ask.py` | `api/routes/process_doc.py` | **ADAPT** | SSE iki-mod deseni KEEP; evrak pipeline |
| `api/routes/multimodal.py` | aynı | ADAPT (minimal) | OCR upload + boyut guard |
| `frontend/src/lib/api.js` | aynı | KEEP | SSE motoru + idle-watchdog |
| `frontend/src/components/agent-flow/*` | aynı | **KEEP — DEMO YILDIZI** | canlı LangGraph SVG (topology yeni) |
| `frontend/src/components/{ui,cards,panels,icons}.jsx` | aynı | KEEP/ADAPT | UI primitifleri |
| `Dockerfile` | aynı | ADAPT | tesseract-tur opsiyonel; pymupdf yok |

## Yeni yazılan (mevcut)

`agents/config.py` (taksonomi), `agents/state.py` (EvrakState), `agents/graph.py` (pipeline),
`agents/nodes/{siniflandir,cikar,eksik_tespit,mevzuat_oner,ozetle,route_birim,yazi_taslak,verify,arsiv,finalize}.py`
(çalışan node'lar; taslak `format_uyumlu_rate=1.0`), `api/schemas.py`,
`api/routes/process_doc.py`, `main.py`.

## DROP (taşınmadı — hukuk-spesifik)

`nodes/{emsal,eligibility,tahmin,debate,draft,triaj,clarifier,mevzuat,...}.py` (hukuk),
`retrieval/{yargi_client,live_emsal,full_decision,fulltext_store,mevzuat_urls,citation,graph_rag,raptor*}.py`,
`MursitEmbedder`, `api/routes/{dilekce,emsal,preferences,auth,conversations,feedback}.py`,
`components/LegalTooltip.jsx` + `lib/legalTerms.js`, hukuk eval'leri (`emsal*`,`nli_tr*`,`ragas*`).

## Genişletilecek / kalite borcu

- `retrieval/*` → mevzuat-RAG derinleştirme (BM25 varsayılan çalışır; Qdrant/reranker opsiyonel).
- `yazi/template_registry.py` + `data/templates/*.j2` → Yön. 2646 format kapısı
  (`format_uyumlu_rate=1.0`, ham placeholder yok).
- `eval/{scorecard,judge}.py` → `competition_scorecard.py` + evrak rubrikleriyle kullanılıyor;
  LLM-judge ayrı gate olarak genişletilebilir.
- `agents/verifier_layers.py`/`risk_guard.py` → mevcut `verify` node üstüne daha kapsamlı kurum/tarih/sayı veto katmanı.
