# 08 — Aşamalı Yol Haritası

> Düzeltilmiş takvime göre (bkz. `docs/00`): ön-eleme kapıları **12 Tmz** (başvuru + ön sunum)
> ve **21 Tmz** (teknik sınav); asıl geliştirme **27 Tmz–26 Ağu** (yalnız finalist olunursa).

## Rol dağılımı (4 kişi — idari kırmızı şart)

- **Ü1** Backend / Ajan (FastAPI + LangGraph)
- **Ü2** RAG / Mevzuat / ML-sınıflandırma (embedding + Qdrant + HF)
- **Ü3** Frontend / Demo (React + SSE + Vite + a11y)
- **Ü4** Veri / Eval / Doküman (sentetik üretim + istatistik + teknik yazım)

> **✅ İdari madde KAPANDI:** Takım tam 4 kişi + 1 kaptan — şart sağlandı; diskalifiye riski yok.

## Güncel teknik durum (canlı doğrulama)

- Backend: `uv run python -m pytest -q` → **655 passed, 3 warnings**.
- Frontend: `npm.cmd run build` → **başarılı**.
- Mock karne: sınıflandırma macro-F1 **0.9493**, routing Top-1 **0.9630**, eksik-bilgi
  recall **0.9948**, özet faithfulness **1.0000**, taslak `format_uyumlu_rate` **1.0000**,
  false-veto **0**, fairness **1.0000**.

## Faz 0 — Ön eleme (şimdi → 12 Tmz)  ⚠️ EN ÖNCELİKLİ

- [ ] T3KYS başvuru + **4 kişi** teyidi + uygunluk kontrol listesi (`docs/00 §5`) — **KIRMIZI**.
- [ ] **Ön Değerlendirme Sunumu** (PDF/PPTX): problem, mimari (`docs/03`), takım, motivasyon.
- [ ] Bu iskeletin demo-GIF/screenshot'ı (OCR + canlı Ajan Akış Şeması) → sunuma güçlü kanıt.

## Faz 0.5 — Teknik sınav (17–21 Tmz)

- [ ] 4 üyenin bireysel NLP/agent/LLM yeterlilik hazırlığı (sınav tüm üyelere zorunlu).

## Hafta 0 — İskelet sağlamlaştırma (27–31 Tmz)

- [ ] `uv sync` + OCR uçtan-uca doğrula (bu iskelet); `gen_synthetic.py` v0 + ilk 50 evrak.
- [ ] Frontend `agent-flow` topology'i yeni pipeline'a göre güncelle; SSE event isimleri bağla.
- **Çıktı:** evrak yükle → OCR → canlı node akışı (uçtan-uca iskelet ayakta).

## Hafta 1 — Görev 1 çekirdeği (1–7 Ağu)

- [x] `siniflandir` few-shot LLM JSON + mock fallback + abstention.
- [ ] `cikar` LLM JSON-schema + regex + PII maskeleme entegre.
- [ ] `eksik_tespit` tür-bağımlı şema + `eksik_bilgi_gold` v1.
- [ ] `evrak_class_gold` ≥100 + `evrak_class_eval.py` ilk macro-F1.
- **Çıktı:** Görev 1 tür+alan+eksik çalışıyor, ilk skor.

## Hafta 2 — Mevzuat + Özet + Görev 2 başlangıç (8–14 Ağu)

- [ ] `seed_mevzuat.py` (2646/3071/4982/7201/SDP → Qdrant) + `mevzuat_oner` hybrid RAG.
- [ ] `ozetle` LLM/mT5 + `summary_eval.py`.
- [ ] `route_birim` içerik-temelli + `routing_gold` + `routing_eval.py`.
- [ ] `yazi/renderer.py` + ilk jinja2 şablonlar (üst/cevabi, Yön. 2646 format).
- **Çıktı:** Görev 1 tam; Görev 2 yönlendirme + taslak iskelet.

## Hafta 3 — Görev 2 tamam + Verify + Demo cilası (15–21 Ağu)

- [ ] `yazi_taslak` 4 yazı türü + `clarifier` dur-ve-sor (eksik bilgi iste).
- [x] `verify` node çalışıyor (false-veto=0); [ ] `risk_guard` genişletmesi + format kapısı düzeltmesi.
- [ ] `draft_eval.py` + `missing_info_eval.py` + `latency_eval.py`.
- [ ] Frontend: AgentFlowGraph node listesi final, ExtractedFields/Routing/DraftPreview kartları, export.
- **Çıktı:** iki görev uçtan-uca + canlı demo UI.

## Hafta 4 — Sertleştirme, ablation, teslim (22–26 Ağu)

- [ ] `competition_scorecard.py` tek-komut karne + tüm ablation A/B (McNemar/bootstrap).
- [ ] Opsiyonel SOTA (CRAG/Self-RAG/decompose) ENV-aç → Yenilikçilik kanıtı.
- [ ] `docs/` final: method, data-card, model-licenses, mevzuat-referans ([DOĞRULA] kontrolü).
- [ ] Test %80 coverage, security-scan, Docker + run-local-demo doğrula.
- [ ] İnternet-kesinti yedeği: lokal Qwen + RapidOCR offline path test.
- **Çıktı:** TAKP'a açık repo + demo videosu + dokümanlar.

## Final (Ağustos, Bilişim Vadisi Kocaeli)

- [ ] 10 dk sunum + 5 dk soru-cevap (PDF+PPTX); canlı-çalıştırma yedeği; demo veri-kaynak beyanı.
