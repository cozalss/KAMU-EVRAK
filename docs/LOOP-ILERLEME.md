# LOOP İlerleme — kalıcı durum (her wakeup bunu OKU, güncelle)

> **Bu dosya loop'un hafızasıdır.** Her iterasyon: (1) bunu oku → (2) sıradaki `[ ]` maddeleri al →
> (3) disjoint-scope'lu paralel ajanlarla yap → (4) doğrula → (5) `[x]` işaretle + not düş →
> (6) commit → (7) ScheduleWakeup(120s). Bir taraf komple biterse diğerine geç.

- **Başlangıç:** 2026-06-25 16:17 · **Hedef bitiş:** ~21:17 (5 saat) · **Cadence:** 120s
- **Kural:** ADALET-AGENT'a dokunma (yalnız oku/kopyala). Context7 ile kütüphane dokümanı kullan.
  Mock modda (anahtarsız) demo ÇALIŞMALI → LLM node'ları keyword fallback'e düşmeli.
- **Çalıştır-doğrula:** `cd backend && python -c "import ... pipeline ainvoke"` (langgraph global'de var);
  `python -m py_compile`. Frontend: dosya varlığı + (mümkünse) `npm run build`.

## İterasyon günlüğü
- **İT-1 (16:17):** git init + backlog. Ajanlar: gerçek LLM siniflandir/cikar, yazi_taslak+ozetle,
  eval harness+gen_synthetic, frontend AgentFlowGraph+kartlar, pytest. → (sonuç güncellenecek)

---

## BACKEND backlog (Görev 1+2 gerçek implementasyon — Uygulama 35p)

### Görev 1
- [ ] `siniflandir`: get_llm few-shot JSON sınıflandırma + keyword pre-filter + mock fallback + abstention
- [ ] `cikar`: LLM JSON-schema alan çıkarımı (gönderen/tarih/sayı/konu/talep) + regex + PII maskeleme güçlendir
- [ ] `eksik_tespit`: tür-bağımlı zorunlu-alan şeması (dilekçe vs üst yazı farklı)
- [ ] `mevzuat_oner`: data/mevzuat üzerinde BM25/keyword retrieval (RAG opsiyonel) + madde DOĞRULA guard
- [ ] `ozetle`: get_llm özet + key-fact + mock fallback
- [ ] `route_birim`: LLM/few-shot + top-k + güven
- [ ] `verify`/`risk_guard`: uydurma kurum/tarih/sayı veto + resmî-yazı format-compliance checklist

### Görev 2
- [ ] `yazi_taslak`: yazi/renderer + data/templates/*.j2 (üst/cevabi/bilgilendirme/olur) + LLM gövde + PDF/DOCX çıktı
- [ ] `clarifier` dur-ve-sor dalı: eksik alanda taslak üretmeden soru döndür (graph conditional edge)
- [ ] Yazı taslağı indirme endpoint'i (PDF/DOCX)

### Altyapı / kanıt
- [ ] LLM entegrasyon: get_llm mock/openai/llamacpp doğrula; mock deterministik mantıklı çıktı
- [ ] Mevzuat seed: data/mevzuat/*.txt (kamuya açık alıntılar) + chunk
- [ ] gen_synthetic: 18 türün hepsi + zorluk stratifikasyonu + gold setler (class/routing/ozet/eksik/e2e)
- [ ] Eval harness: evrak_class_eval, routing_eval, missing_info_eval, summary_eval, draft_eval, competition_scorecard
- [ ] Ablation: çok-ajan vs tek, RAG var/yok (McNemar/bootstrap — stats.py KEEP)
- [ ] Fairness eval (etik §13.1)
- [ ] pytest test suite (node'lar + pipeline + eval), %80 hedef
- [ ] ENV-gated SOTA (crag/self_rag) opsiyonel — Yenilikçilik
- [ ] Rate-limit + güvenlik guard (api/middleware KEEP entegre)

## FRONTEND backlog (Demo 15p)
- [ ] AgentFlowGraph: gerçek SVG, canlı node durumu (yeni topology), Görev1/Görev2 renk ayrımı
- [ ] Sonuç kartları: EvrakTürü, ÇıkarılanAlanlar (PII maskeli rozet), EksikBilgi, Mevzuat, Birim, YazıTaslağı önizleme
- [ ] Taslak indirme (PDF/DOCX) butonu
- [ ] Örnek evraklar (dene) + drag-drop yükleme
- [ ] Bilgilendirme/clarify akışı (eksik bilgi sorularını göster)
- [ ] a11y (klavye, ARIA, kontrast) + responsive
- [ ] vite build temiz + (varsa) basit test

## TESLİM / kanıt (yarışma)
- [ ] README güncel + ekran görüntüleri/GIF
- [ ] docs güncel (method, data-card, model-licenses, mevzuat [DOĞRULA] kontrol)
- [ ] competition_scorecard tek-komut karne çıktısı docs/benchmark/
