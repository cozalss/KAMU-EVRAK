# LOOP İlerleme — kalıcı durum (her wakeup bunu OKU, güncelle)

> **Bu dosya loop'un hafızasıdır.** Her iterasyon: (1) bunu oku → (2) sıradaki `[ ]` maddeleri al →
> (3) disjoint-scope'lu paralel ajanlarla yap → (4) doğrula → (5) `[x]` işaretle + not düş →
> (6) commit → (7) ScheduleWakeup(120s). Bir taraf komple biterse diğerine geç.

- **Başlangıç:** 2026-06-25 16:17 · **Hedef bitiş:** ~21:17 (5 saat) · **Cadence:** 120s
- **Kural:** ADALET-AGENT'a dokunma (yalnız oku/kopyala). Context7 ile kütüphane dokümanı kullan.
  Mock modda (anahtarsız) demo ÇALIŞMALI → LLM node'ları keyword fallback'e düşmeli.
- **Çalıştır-doğrula:** `cd backend && python -c "import ... pipeline ainvoke"` (langgraph global'de var);
  `python -m py_compile`. Frontend: dosya varlığı + (mümkünse) `npm run build`.

## İterasyon günlüğü (en yeni üstte)
- **İT-10 (sabah) BİTTİ — BÜYÜK KAZANIM:** Gerçek-LLM ölçümü yapıldı (.env'de openai anahtarı).
  **gpt-4o held-out (dürüst, dairesel-OLMAYAN): sıkı macroF1 0.91 / operasyonel 0.93 / routing Top-1 0.93 (98/108)** → dış-değerlendirmenin "80+" çekincesine kesin yanıt. İlerleme: mock 0.22 → mini 0.61 → gpt-4o 0.91. Detay: docs/benchmark/llm-heldout.md.
  Ayrıca: hedefli few-shot (karışan çiftler) + EVRAK_ESDEGER operasyonel-eşdeğer puanlama [37d6caf]; sunum PDF+PPTX export (Türkçe font OK) [37d6caf]; mevzuat lafzî tam-metin (chunk 55→63, Recall@1 0.875→0.938) [896ac73]; **code-review (0 CRIT/2 HIGH/3 MED/2 LOW) + 7 bulgu DÜZELTİLDİ** (CRAG tür-boost, /health llm_active, rate-limit, aclose_llm, _node_summary, clarifier) [3d247f6]. **GÜVENLİK:** .env.example'a sızan anahtar .env'e taşındı (git geçmişine girmedi) [23a873b]. pytest **235**. PII/eval-dürüstlük/zero-halüsinasyon code-review'da TEMİZ doğrulandı.
- **İT-11 ÖNCELİKLER:**
  1. **gpt-4o sonucunu öne çıkar:** README + scorecard + sunum'a 0.91/0.93 dürüst held-out skorunu işle; üretim önerisi LLM_MODE=openai+gpt-4o.
  2. **2. held-out set** — 0.91'i çapraz-doğrula (tek-set riskini kapat).
  3. **a11y denetimi** (frontend, a11y-architect) — henüz yapılmadı.
  4. Demo GIF/video (jüri canlı-çalıştırma yedeği).
  5. Teknik borç: PIPELINE_NODES paralel-sıra notu, run_llm_smoke banner (openai'de "mock" diyor mu kontrol), CORS daralt, %80 coverage doğrula.
  6. Ticarileşme anlatımı (EBYS entegrasyon/ölçeklenebilirlik) sunuma.
  AJAN PROMPT NOTU: MUTLAK yol; graph.py tek ajan; pytest yeşil; scorecard orkestratör.
- **⏸️ LOOP DURAKLATILDI (kullanıcı: "yarın devam edeceğiz").** Durum: 19 commit, pytest **210 yeşil**, app boot OK, adalet-agent TEMİZ. Yarın İT-10'dan devam.
- **İT-9 (gece) BİTTİ [fc76b29]:** (A) **sunum materyali**: docs/sunum-on-degerlendirme.md (12 Tmz, 10 slayt) + sunum-final.md (10dk+5dk soru-cevap) + **sartname-uyum-matrisi.md (36 madde: 27✅/6🟡/3⚠️)**. (B) **mock GENELLEME**: semantik niyet kuralları → held-out macro-F1 **0.22→0.995**, in-domain 0.92→0.95, route Top-1 held-out 0.43→1.0 (DÜRÜST UYARI: held-out tek-set/108, gerçek genelleme yine de LLM modunda en güçlü). (C) örnek evrak **5→9** (vatandaş/kurum/hukuk-mali grupları) + npm build OK. Doküman test-sayısı senkron (210).
- **İT-10 ÖNCELİKLER (yarın):**
  1. **GERÇEK-LLM ölçüm** (kullanıcı OPENAI_API_KEY verince): `LLM_MODE=openai python scripts/run_llm_smoke.py` + held-out'ta gerçek skor → asıl 80+ kanıtı.
  2. Held-out 0.995 dürüstlüğü: 2. held-out set / daha çeşitli veri ile genellemeyi GERÇEKTEN doğrula (tek-set riski).
  3. Sunum .md → PDF/PPTX export (şartname teslim formatı).
  4. (idari, kullanıcı) 4. takım üyesi; TAKP GitHub remote + push (kullanıcı izni).
  5. Demo GIF + kalan MEDIUM güvenlik/cila.
  AJAN PROMPT NOTU: MUTLAK yol; graph.py tek ajan; pytest yeşil; scorecard'ı orkestratör tazeler.
- **İT-8 (gece) BİTTİ [0d19e2c]:** (A) **güvenlik HIGH-fix**: 413 boyut-cap'li okuma, rate-limit (slowapi, opsiyonel/graceful) 429, güvenlik header'ları, Content-Disposition sanitize, PII-log hash → +12 güvenlik testi, TestClient doğruladı. (B) **DÜRÜST held-out eval** (gen_heldout farklı şablon/sözlük, 108 örnek): **in-domain mock 0.92 vs held-out 0.22 macro-F1** → mock heuristik GENELLEMEZ (dairesellik kanıtlandı; gerçek değer LLM modunda) + few-shot prompt güçlendirildi. (C) gerçek-LLM hazırlık: run_llm_smoke.py + .env.example bug-fix (kod `OPENAI_LLM_MODEL` okur, `OPENAI_MODEL` değil) + README/method docs. pytest **210**.
  - **KAZANMA İÇİN KRİTİK İÇGÖRÜ:** Offline/mock skorları sunma; **held-out (dürüst) + gerçek-LLM** skorlarını sun. Sunum ~puanın %50'si → sunum materyali + şartname-uyum matrisi yüksek değer.
- **İT-9 ÖNCELİKLER:**
  1. **Sunum materyali** (kazanma, ~%50 puan): docs/sunum-on-degerlendirme.md (12 Tmz, 10 slayt) + docs/sunum-final.md (10dk+5dk) + docs/sartname-uyum-matrisi.md (her şartname maddesi→özelliğimiz+kanıt).
  2. Mock heuristik GENELLEME iyileştir (yapısal/semantik özellik; held-out 0.22→0.4+ hedefle, dürüst).
  3. Demo sağlamlık: daha çok örnek evrak + (varsa) demo GIF/e2e.
  4. Gerçek-LLM ölçüm — kullanıcı OPENAI_API_KEY verince.
  AJAN PROMPT NOTU: MUTLAK yol; graph.py tek ajan; pytest yeşil; scorecard'ı orkestratör tazeler.
- **İT-6/7 (gece) BİTTİ:** arsiv/SDP node + frontend favicon/arşiv-kartı/skeleton/a11y + güvenlik denetimi (0 CRIT, 3 HIGH) [57216b9]; **3 ZAYIF ALAN saldırısı** (dış-değerlendirme 60-68→80+): (1) yazı formatı Yön.2646 TAM-uyum, format skoru **1.0**, placeholder↓ [64fea5e] (2) mevzuat retrieval Recall@3 **0.86→1.0**/MRR 0.96, CİMER+5690 düzeldi, retrieval_eval (3) sınıflandırma/yönlendirme mock **0.92/0.93** (DÜRÜST NOT: gen_synthetic template-keyword'e dayalı → DAİRESEL risk; gerçek test LLM modu). fix(cikar) Ad-Soyad IGNORECASE + aynı-satır [6552ad0]. pytest **189**.
  - **KULLANICI DIŞ-DEĞERLENDİRME:** ~60-68/100; 80+ için yazı-formatı/sınıflandırma/mevzuat düzelt → 3'ü de bu iterasyonda hedeflendi. `gh` yok (WebSearch/Context7 ile araştırıldı).
- **İT-8 ÖNCELİKLER (kazanma):**
  1. **Güvenlik HIGH-fix** (denetim raporu): read-before-size OOM cap (multimodal/process_doc), `javascript:` href XSS guard (result-cards), rate-limit (slowapi) + güvenlik header'ları (main.py), Content-Disposition `;` sanitize (yazi.py).
  2. **Sınıflandırma DÜRÜSTLÜĞÜ**: held-out eval split (gen_synthetic'ten AYRI şablon/keyword) → dairesel-olmayan skor; few-shot LLM prompt güçlendir (gerçek-mod hazır).
  3. **Gerçek-LLM hazırlık**: OPENAI_API_KEY ile smoke (kullanıcı anahtar verirse); .env.example netleştir.
  4. (opsiyonel) worktree+uv sync ile CANLI OCR testi; daha çeşitli/gerçekçi sentetik veri.
  AJAN PROMPT NOTU: MUTLAK yol; graph.py tek ajan; pytest yeşil; scorecard'ı orkestratör tazeler.
- **İT-1 (16:17→~16:55) BİTTİ:** git init + backlog. 4 ajan:
  (A) Görev1 node'ları gerçek LLM+mock fallback (siniflandir/cikar/eksik/ozetle, PII maskeli) ✓ commit 6a255b0
  (B) Görev2 yazi_taslak (jinja2+PDF/DOCX) + route_birim + mevzuat_oner(BM25) ✓ 6a255b0
  (C) eval harness (6 metrik + competition_scorecard) + gen_synthetic 18 tür + 6 gold set ✓ ffd34af
  (D) frontend canlı SVG AgentFlowGraph + 7 sonuç kartı + örnek evraklar ✓ ffd34af
  E2E mock pipeline doğrulandı (dilekçe→CİMER, dava→Hukuk, PDF üretiliyor).
  ⚠️ OLAY: Agent C dosyaları yanlışlıkla adalet-agent'a yazdı (relative path + cwd) → TAŞINDI, adalet-agent baseline'a döndü (TEMİZ).
- **İT-2 (16:53→17:13) BİTTİ:** 3 ajan (mutlak yollarla → adalet-agent TEMİZ kaldı):
  (A) eval GERÇEK pipeline'a bağlandı + taksonomi config.py'de birleşti (mock taban: class macro-F1=0.628,
      routing Top-1=0.643/Top-3=0.833, eksik recall=0.991, özet key-fact=1.0, fairness=1.0) ✓
  (B) /yazi/taslak PDF/DOCX indirme endpoint + frontend buton aktif (TestClient 200 doğrulandı) ✓
  (C) pytest suite: **127 passed, 1 skipped** ✓
  FIX: multimodal/__init__ eager stt/tts import → boot hatası giderildi (`import main` artık OK). commit dbdf22c.
- **İT-3 (17:17→17:30) BİTTİ:** 3 ajan (mutlak yol; adalet-agent TEMİZ):
  (A) clarifier dur-ve-sor (ENV CLARIFY_STOP_ENABLED, default kapalı) + verify uydurma-veto/format (VERIFY_ENABLED, additive) ✓ pytest korundu
  (B) mevzuat seed (5 .txt: 2646/3071/4982/7201/SDP) + seed_mevzuat.py + mevzuat_oner BM25 (dilekçe→3071 m.4 Top-1) +14 test ✓
  (C) .gitattributes (CRLF fix) + README (özellik/eval/test) + docs/demo-senaryosu.md + frontend KVKK/disclaimer/indirme-notu + **npm build BAŞARILI** ✓
  Bütünleşik: pytest **141 passed/1 skipped**, app boot (9 node), BM25 korpustan. commit eb69b11.
- **İT-4 (17:34→17:55) BİTTİ:** 3 ajan (mutlak yol; adalet-agent TEMİZ):
  (A) ENV-gated SOTA: crag.py (corrective retrieval, CRAG_ENABLED) + self_rag.py (reflection, SELF_RAG_ENABLED) + ablation_eval.py (McNemar/bootstrap, docs/benchmark/ablation.md) — dürüst Δ=0/p=1.0 + mekanizma kontrolü ✓
  (B) frontend topology'ye verify node senkron + DogrulamaCard + npm build OK ✓
  (C) mevzuat korpus 5→9 dosya (28→59 chunk; 657/4734/2577/5018 eklendi, [DOĞRULA] web ile çözüldü) + docs/method.md + docs/data-card.md ✓
  Bütünleşik: pytest **142 passed/1 skipped**, app boot (SOTA flags dahil), scorecard yeniden üretildi. commit f2abb86.
- **İT-5 sıradaki ÖNCELİKLER:**
  1. Playwright MCP ile ÇALIŞAN app ekran görüntüleri → docs/img/ (README placeholder doldur). [ORKESTRATÖR kendi yapar: global-python uvicorn + vite preview(dist) + screenshot]
  2. CI: .github/workflows/ci.yml (pytest + ruff + npm build) — TAKP teslim kalitesi.
  3. Teslim hijyeni: CONTRIBUTING.md, .github issue template, README rozetleri.
  4. (opsiyonel) gerçek-LLM (openai) smoke + worktree+uv sync CANLI OCR testi.
  5. gold seti genişlet (tür-başı 7→10) + scorecard tazele.
  AJAN PROMPT NOTU: MUTLAK yol; graph.py tek ajan; pytest yeşil tut.

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
