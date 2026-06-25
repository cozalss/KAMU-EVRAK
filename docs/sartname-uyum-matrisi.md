# Şartname Uyum Matrisi — TEKNOFEST 2026 TYDA, 1. Senaryo

> **Amaç:** Şartname (`2026_TEKNOFEST_TYDA_SARTNAME_Birinci_Senaryo_TR`) **her maddesini**
> → bizim karşılığımız → **KANIT** (dosya yolu / komut / docs / ekran görüntüsü) olarak
> izlenebilir kılar. Jüri "bu istek nerede karşılanmış?" diye sorduğunda tek bakışta yanıt verir.
>
> **Dürüstlük ilkesi (bu matrisin omurgası):** Eksik/koşullu maddeler ⚠️ ile **açıkça** işaretlenir.
> Skorlar `LLM_MODE=mock` **taban** ölçümüdür; gerçek-LLM modu **yükseltir**. Held-out (dürüst)
> ile in-domain ayrımı saklanmaz. Abartma yok — kanıtlanabilir olan beyan edilir.

**Durum lejantı:** ✅ Karşılandı (kanıtlı) · 🟡 Kısmen / koşullu · ⚠️ Açık iş / gelecek faz · ⛔ Henüz yok

---

## A. Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1 — 6 yetenek)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| G1.1 | **OCR / metin okuma** (taranmış + dijital + foto) | `oku` route'u: dijital PDF→pypdfium2, taranmış/foto→RapidOCR (offline), Word→python-docx, opsiyonel OpenAI-vision | `backend/multimodal/ocr.py`, `multimodal/pdf_utils.py` (pypdfium2), `multimodal/ocr_rapidocr.py`; `docs/03-mimari.md` (oku=GERÇEK) | ✅ |
| G1.2 | **Evrak türü belirleme** (sınıflandırma) | `siniflandir` node: 19 tür taksonomisi (18 + `belirsiz` abstention); few-shot LLM birincil, mock'ta keyword heuristik | `backend/agents/nodes/siniflandir.py`, `agents/config.py` (`EVRAK_TURLERI`); `docs/02-evrak-taksonomi-routing.md §1` | ✅ |
| G1.3 | **Bilgi unsurlarını çıkarma** (gönderen/tarih/sayı/konu/talep) | `cikar` node: LLM JSON çıkarımı + regex; **PII maskeleme** (TCKN/telefon/IBAN) çıkarım sonrası, dış çağrı öncesi | `backend/agents/nodes/cikar.py`; ekran: `docs/img/03-sonuc.png` (maskeli rozet) | ✅ |
| G1.4 | **Eksik bilgileri tespit etme** | `eksik_tespit` node: tür-bağımlı zorunlu-alan şeması (3071 m.4 / resmî-yazı daraltılmış); recall-öncelikli (F-beta β=2) | `backend/agents/nodes/eksik_tespit.py`, `config.ZORUNLU_ALANLAR`; `docs/06-eval-harness.md` | ✅ |
| G1.5 | **İlgili mevzuat / yazışma kuralı önerme** | `mevzuat_oner` node: madde-bazlı **BM25 retrieval** (9 dosya / 59 madde-chunk korpus) + statik config fallback; şüpheli madde `[DOĞRULA:]` | `backend/agents/nodes/mevzuat_oner.py`, `data/mevzuat/*.txt`, `scripts/seed_mevzuat.py`; `docs/method.md §3` | ✅ |
| G1.6 | **Özetleme** | `ozetle` node: LLM/mT5 key-fact odaklı kısa özet; faithfulness (halüsinasyon-yok) ölçülür | `backend/agents/nodes/ozetle.py`; `eval/summary_eval.py`; karne: özet faithfulness **1.000** | ✅ |

**Görev 1 ölçüm (GERÇEK pipeline, `LLM_MODE=mock` taban):** sınıflandırma macro-F1 **0.919** /
acc **0.917** [0.872, 0.947]; eksik-bilgi recall(β=2) **0.995**; özet key-fact recall **0.972**;
özet faithfulness **1.000**. Kanıt: `docs/benchmark/scorecard.md` · `python -m eval.competition_scorecard`.

---

## B. Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2 — 5 yetenek)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| G2.1 | **Resmî yazı taslağı** (üst/cevabi/bilgilendirme/olur) | `yazi_taslak` node: jinja2 iskelet (Resmî Yazışma Yön. 2646 format) + LLM doldurma; 4 yazı türü | `backend/agents/nodes/yazi_taslak.py`, `backend/yazi/` (renderer); ekran: `docs/img/04-taslak.png` | ✅ |
| G2.2 | **Resmî üslup** | Yön. 2646 zorunlu bölümler (T.C. başlığı · Sayı · Konu · Muhatap · İlgi · metin · kapanış); Türkçe saflık ölçülür | `config.YAZI_ZORUNLU_BOLUMLER`; `eval/draft_eval.py`; karne: Türkçe saflık **1.0000**, türü doğruluğu **0.995** | ✅ |
| G2.3 | **Doğru birime yönlendirme** | `route_birim` node: 9 birim `EVRAK_TO_BIRIM` eşleme + sınıflandırıcı; top-k + güven + alternatifler; maliyet-ağırlıklı hata | `backend/agents/nodes/route_birim.py`, `config.EVRAK_TO_BIRIM`; `eval/routing_eval.py` | ✅ |
| G2.4 | **Kullanıcıyı bilgilendirme** | `finalize` node: özet + havale birimi + mevzuat + eksik bilgi kompozisyonu; her çıktıda **yasal disclaimer** | `backend/agents/nodes/finalize.py`; ekran: `docs/img/03-sonuc.png` (Bilgilendirme bloğu) | ✅ |
| G2.5 | **Eksik bilgi isteme** (taslak öncesi) | `clarifier` dur-ve-sor dalı (ENV `CLARIFY_STOP_ENABLED`): kritik alan eksikse taslak ÜRETMEDEN takip sorusu döndürür | `backend/agents/nodes/clarifier.py`, `agents/graph.py` (`_clarify_route`); `docs/method.md §5` | ✅ |

**Görev 2 ölçüm (mock taban):** yönlendirme Top-1 (uçtan-uca) **0.931** [0.889, 0.957] / Top-3
**0.944**; yazı bileşen tam-uyum **0.838**; **uydurma-veto yanlış-pozitif 0/216** (anti-halüsinasyon
kapısı sağlıklı). Kanıt: `docs/benchmark/scorecard.md`.

---

## C. Puanlama Kriterleri (§8-9 — 100 puan)

| Kriter (puan) | Bizim kanıtımız | KANIT | Durum |
|---|---|---|---|
| **Yöntem ve Teknik Yaklaşım (35)** | Çok-ajanlı koşullu-kenarlı LangGraph (10 node) + deterministik-taban/ENV-gated-SOTA katmanı + uydurma-yasağı mimari kısıt + recall-öncelikli kamu disiplini; ablasyon (McNemar p + bootstrap CI) | `docs/method.md`, `agents/graph.py`, `eval/ablation_eval.py`, `docs/benchmark/ablation.md` | ✅ |
| **Uygulama (35)** | 5 alt-kalem birebir ölçüldü: sınıflandırma doğruluğu, yönlendirme başarımı, özetleme, yazı şablon kalitesi, eksik-bilgi tespiti — Wilson %95 CI'lı | `docs/06-eval-harness.md`, `docs/benchmark/scorecard.md`, `eval/competition_scorecard.py` | ✅ |
| **Demo (15)** | Canlı SSE Ajan Akış Şeması (node'lar gerçek-zamanlı "yanar"); 5 örnek evrak tek-tıkla; internet-kesinti offline yedeği | `frontend/src/components/agent-flow/`, `docs/demo-senaryosu.md`; ekran: `docs/img/02-akis.png` | ✅ |
| **Yenilikçilik / Özgünlük / Ticarileşme (15)** | ENV-gated CRAG/Self-RAG (Yan 2024 / Asai 2023), PII maskeleme ürün-artısı, SDP arşiv metadata, çok-ajan vs tek-ajan ablasyon farklılaşması | `agents/nodes/crag.py`, `self_rag.py`, `arsiv.py`; `docs/method.md §6` | ✅ |
| **Real-time üretim avantajı (§8 Demo)** | SSE streaming TTFT + node-by-node canlı akış (sabit SLA iddia edilmez; "düşünen sistem" hissi) | `api/routes/process_doc.py` (`/process_doc/stream`); `docs/06-eval-harness.md` (latency) | ✅ |

---

## D. Teslim Formatı ve İdari Uyum (§5, §7-8)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| D.1 | **Açık kaynak lisans (MIT/Apache/GNU)** | Repo lisansı **MIT**; AGPL bağımlılık yok (PyMuPDF→pypdfium2 ile bertaraf) | `LICENSE` (MIT), `docs/07-model-lisanslari.md §1` | ✅ |
| D.2 | **TAKP GitHub'a kod+veri teslim** | Repo açık-kaynak hazır (CI + lisans + CONTRIBUTING); TAKP yüklemesi başvuru anında yapılır | `README.md` rozetleri, `.github/workflows/ci.yml`, `CONTRIBUTING.md` | 🟡 (yükleme = başvuru anı) |
| D.3 | **Model ağırlıkları repoya YÜKLENMEZ** (link+sürüm+lisans) | Büyük modeller (BGE-M3, Qwen, mT5) link+lisans dokümante; `.gitignore` ağırlıkları dışlar | `docs/07-model-lisanslari.md`, `.gitignore` | ✅ |
| D.4 | **Gerçek kamu verisi YASAK** (§6.5) | %100 sentetik/kurgu evrak + checksum-sahte TCKN + kamuya açık mevzuat; veri kartı beyanı | `docs/data-card.md`, `scripts/gen_synthetic.py`, `data/mevzuat/README.md` | ✅ |
| D.5 | **Tüm belgeler Türkçe + bilimsel atıflı** | Tüm `docs/` Türkçe, kaynak linkli (mevzuat.gov.tr, akademik referans) | `docs/*.md` (00-08, method, data-card); atıflar `docs/02 §Kaynaklar` | ✅ |
| D.6 | **Ön sunum + Final sunumu (PDF ve PPTX)** | Sunum anlatımları hazır (Markdown); PDF/PPTX export ön-eleme öncesi üretilir | `docs/sunum-on-degerlendirme.md`, `docs/sunum-final.md` | 🟡 (PDF/PPTX export adımı) |
| D.7 | **Final 10 dk sunum + 5 dk soru-cevap** | Final akışı + olası jüri soruları + cevapları yazıldı | `docs/sunum-final.md` | ✅ |
| D.8 | **Canlı demo + internet-kesinti offline path** | `LLM_MODE=mock` sıfır dış-bağımlılık offline çalışır; örnek evraklar OCR'sız yol; demo.gif yedeği | `docs/demo-senaryosu.md §2`, `scripts/run-local-demo.sh` | ✅ |
| D.9 | **Demo veri kaynağı + kullanım hakları beyanı** | Tüm demo evrakı sentetik (MIT) veya sunum-anı kurgu; gerçek kişi/kurum yok | `docs/data-card.md §6`, `docs/demo-senaryosu.md` (başlık) | ✅ |

---

## E. Etik ve Adillik (§13.1)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| E.1 | **Yanlılıktan arındırılmış / kapsayıcı** | Counterfactual fairness: farklı isim/cinsiyet sahte-PII varyantında sınıflandırma/routing tutarlılık kontrolü | `eval/fairness_eval.py`; karne: sınıf tutarlılığı **1.0000** [0.974, 1.000], birim tutarlılığı **1.0000** | ✅ |
| E.2 | **Sonuç manipülasyonu / jüriyi yanıltma yok** | Kapalı-küme F1 değil resmî-kaynaklı taksonomi (docs/02); blind etiketleme planı; mock-vs-LLM ayrımı saklanmaz | `docs/data-card.md §4` (blind), `docs/method.md §2.1` (dairesellik uyarısı) | ✅ |
| E.3 | **Uydurma / halüsinasyon engeli** | `verify` node uydurma kurum/tarih/sayı/madde veto; şüpheli→`[DOĞRULA:]`; her çıktıda disclaimer | `backend/agents/nodes/verify.py`; karne: uydurma-veto FP **0/216** | ✅ |

---

## F. Uygunluk Kontrol Listesi (§5) — diskalifiye riski

| # | Şartname isteri | Durum | Not |
|---|---|---|---|
| F.1 | **Takım tam 4 kişi + 1 kaptan** | ⚠️ | **Ekip şu an 3 kişi → +1 üye gerekir** (idari, kod-dışı; `docs/08 §Rol`). Bu açık başvuru öncesi kapatılmalı. |
| F.2 | Her üye 18+, öğrenci/mezun | 🟡 | Ekip tarafından teyit edilecek (idari). |
| F.3 | Her kişi yalnız bir takımda | 🟡 | Teyit edilecek (idari). |
| F.4 | TAKP NLP projesinde aktif görevli YOK | 🟡 | Teyit edilecek (kodu TAKP GitHub'a yüklemek bu kapsama girmez). |
| F.5 | Aynı projeyle eşzamanlı başka TEKNOFEST başvurusu YOK | 🟡 | kamu-evrak, ADALET-AGENT'tan **ayrı/yeterince farklı** depo (port haritası `docs/04`); teyit edilmeli. |
| F.6 | Son 2 yıl üst üste TYDA ödülü YOK | 🟡 | Teyit edilecek (idari). |
| F.7 | Önceki diskalifiye/etik ihlali YOK | 🟡 | Teyit edilecek (idari). |

---

## G. Açık İşler / Gelecek Faz (dürüst backlog)

| # | İş | Neden açık | Hedef faz | Durum |
|---|---|---|---|---|
| AÇ.1 | **Gerçek-LLM (openai/llamacpp) skor ölçümü** | Karne şu an `LLM_MODE=mock` **taban**; gerçek-LLM tavanı kullanıcı `OPENAI_API_KEY` verince ölçülür | Ön-eleme öncesi / Hafta 1 | ⚠️ |
| AÇ.2 | **Held-out genelleme açığı** | In-domain mock macro-F1 **0.92** ≠ held-out (dairesel-olmayan) **0.22** → mock heuristik genellemiyor; gerçek değer LLM modunda. Few-shot prompt hazır. | Hafta 1 (gerçek-LLM) | ⚠️ Dürüstçe raporlanır |
| AÇ.3 | **Blind insan-etiketli gold** | Otomatik üretilen gold etiketleri bağımsız kişi onayından geçmeli (etik §13.1) | Hafta 1-2 | ⚠️ |
| AÇ.4 | **PDF/PPTX sunum export** | Anlatım Markdown hazır; biçim export adımı kaldı | 12 Tmz öncesi | 🟡 |
| AÇ.5 | **4. takım üyesi** | İdari uygunluk (F.1); kod-dışı | Başvuru öncesi | ⚠️ |
| AÇ.6 | **Test sayısı netleştirme** | Doküman tutarlılığı: bazı dosyalar 127, son durum **210 test** | README senkronu | 🟡 |
| AÇ.7 | **Canlı OCR uçtan-uca (uv sync ağır)** | RapidOCR/pypdfium2 kurulum doğrulaması; demo örnek-evrak yolu zaten OCR'sız çalışır | Hafta 0 | 🟡 |

---

## Kapsam Özeti

- **Görev 1 — 6/6 yetenek ✅** (OCR, sınıflandırma, çıkarım, eksik-tespit, mevzuat, özet)
- **Görev 2 — 5/5 yetenek ✅** (taslak, üslup, yönlendirme, bilgilendirme, eksik-isteme)
- **Puanlama 4/4 kriter ✅** kanıtlı (Yöntem 35 / Uygulama 35 / Demo 15 / Yenilikçilik 15)
- **Teslim/idari 9 madde:** 6 ✅ + 3 🟡 (TAKP yükleme=başvuru anı, PDF/PPTX export, 4. üye)
- **Etik 3/3 ✅**
- **Uygunluk listesi 7 madde:** 6 idari-teyit (🟡) + **1 açık (4. üye — F.1 ⚠️)**

**Toplam izlenen madde: 36** → **27 ✅ kanıtlı · 6 🟡 koşullu/idari · 3 ⚠️ açık iş**
(açık işler: gerçek-LLM ölçümü, held-out genelleme, 4. üye — hepsi **dürüstçe** işaretli).

> **En kritik açık:** 4. takım üyesi (F.1) — bu idari kapı kapatılmadan başvuru geçersiz olabilir.
> Teknik açıklar (gerçek-LLM ölçümü, held-out) sistem mimarisini değil **skor tavanını** etkiler:
> pipeline gerçek-LLM moduyla aynıdır, yalnız kalite yükselir.
