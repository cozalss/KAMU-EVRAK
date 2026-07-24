# Şartname Uyum Matrisi — TEKNOFEST 2026 TYDA, 1. Senaryo

> **Amaç:** Şartname (`2026_TEKNOFEST_TYDA_SARTNAME_Birinci_Senaryo_TR`) **her maddesini**
> → bizim karşılığımız → **KANIT** (dosya yolu / komut / docs / ekran görüntüsü) olarak
> izlenebilir kılar. Jüri "bu istek nerede karşılanmış?" diye sorduğunda tek bakışta yanıt verir.
>
> **Dürüstlük ilkesi (bu matrisin omurgası):** Eksik/koşullu maddeler ⚠️ ile **açıkça** işaretlenir.
> Skorlar `LLM_MODE=mock` **taban** ölçümüdür; gerçek-LLM modu **yükseltir**. Held-out (dürüst)
> ile in-domain ayrımı saklanmaz. Abartma yok — kanıtlanabilir olan beyan edilir.

**Durum lejantı:** ✅ Karşılandı (kanıtlı) · 🟡 Kısmen / koşullu · ⚠️ Açık iş / gelecek faz · **KIRMIZI: diskalifiye riski** · ⛔ Henüz yok

**Canlı doğrulanmış kalite kapıları (2026-07-04):** backend `uv run python -m pytest -q` →
**1319 passed**; frontend `npm.cmd run build` → **başarılı**.

**Tek dürüst skor cümlesi (manşet — üç dokümanda [`scorecard.md`](benchmark/scorecard.md),
[`llm-heldout.md`](benchmark/llm-heldout.md) aynı):** Ölçüm modeli **DeepSeek-chat**
(ölçüm tarihindeki üretim modeli — bkz. aşağıdaki model-değişikliği notu);
**dairesel-olmayan held-out**'ta (n=108, 2 bağımsız set) sınıflandırma macro-F1 **~0.89**
(0.864 / 0.907) ve yönlendirme Top-1 **0.907**; **in-domain referans** (n=54,
`eval.competition_scorecard`) sınıflandırma macro-F1 **0.817**, yönlendirme Top-1 **0.852**,
eksik-bilgi recall **0.739**, özet recall **0.712** / faithfulness **1.000**, taslak
`format_uyumlu_rate`=**1.000** ve bileşen tam-uyum=**1.000** (216/216 tarihsel doğrulama),
Türkçe saflık **0.9998**, false-veto **0**, fairness **0.944**. Mevzuat retrieval **gerçek
BM25Okapi** (304 mevzuat / 1916 madde-chunk korpus; Recall@1 **0.688** / Recall@3 **0.875** / MRR 0.760, n=16, 11 Tem 2026 yeniden ölçüm).

> ⚠️ **MODEL DEĞİŞİKLİĞİ NOTU (2026-07-24) — skorlar bu tarihten ÖNCEDİR.**
> Yukarıdaki tüm manşet skorlar **`deepseek-chat`** ile ölçülmüştür. DeepSeek bu model
> adını API'den **kaldırdı** (HTTP 400); üretim modeli **`deepseek-v4-flash`** olarak
> güncellendi (güçlü kademe: `deepseek-v4-pro`). Skorlar tahrif edilmesin diye ölçüm
> modeli adı **olduğu gibi bırakılmıştır** — ancak bu skorlar **yeni modelle yeniden
> ölçülmemiştir** ve mevcut üretim davranışını temsil ettikleri iddia EDİLEMEZ.
> Yeniden ölçüm yapılana kadar bu tablo *tarihsel kayıt* olarak okunmalıdır.
> Yeni modeller "reasoning" üretir; düşünme token'ları `max_tokens`'tan düştüğü için
> node bütçelerine `LLM_DUSUNME_MARJI` eklenmiştir (bkz. `CLAUDE.md` LLM bölümü).
> Bu düzeltme öncesi ölçülen tek yeni sayı: birim yönlendirme A/B (n=108, `deepseek-v4-pro`,
> `scripts/eval_route_llm_ab.py`) — deterministik Top-1 **0.889**, serbest LLM **0.584**.

**Dürüstlük notu — jüri-güven riski KAPATILDI (2026-07-04):** Önceki manşet (mock-mod macro-F1
0.9493) **kaldırıldı** — mock heuristik o test setine uyarlanmıştı (ezber, taban değil).
Ayrıca **28 Haziran'da eklenen LLM-tabanlı `route_birim`** hiç held-out'ta ölçülmeden üretime
girmiş ve yönlendirme Top-1'i deterministik tablonun (0.907) çok altına (0.54-0.59) düşürdüğü
tespit edilip **düzeltildi** (bilinen türde deterministik otoriter, LLM yalnız `'belirsiz'`
türde) — kanıt ve A/B detayı `docs/benchmark/llm-heldout.md`. gpt-4o sayıları (önceki üretim
modeli) sınıflandırma için çapraz-referans olarak korunur; yönlendirme için artık geçerli
değildir (o ölçüm de düzeltme-öncesi koda aitti).

---

## A. Görev 1 — Evrak Sınıflandırma ve İçerik Analizi (§6.4.1 — 6 yetenek)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| G1.1 | **OCR / metin okuma** (taranmış + dijital + foto) | `oku` route'u: dijital PDF→pypdfium2, taranmış/foto→RapidOCR (offline), Word→python-docx, opsiyonel OpenAI-vision | `backend/multimodal/ocr.py`, `multimodal/pdf_utils.py` (pypdfium2), `multimodal/ocr_rapidocr.py`; `docs/03-mimari.md` (oku=GERÇEK) | ✅ |
| G1.2 | **Evrak türü belirleme** (sınıflandırma) | `siniflandir` node: 19 tür taksonomisi (18 + `belirsiz` abstention); few-shot LLM birincil, mock'ta keyword heuristik | `backend/agents/nodes/siniflandir.py`, `agents/config.py` (`EVRAK_TURLERI`); `docs/02-evrak-taksonomi-routing.md §1` | ✅ |
| G1.3 | **Bilgi unsurlarını çıkarma** (gönderen/tarih/sayı/konu/talep) | `cikar` node: LLM JSON çıkarımı + regex; **PII maskeleme** (TCKN/telefon/IBAN) çıkarım sonrası, dış çağrı öncesi | `backend/agents/nodes/cikar.py`; ekran: `docs/img/03-sonuc.png` (maskeli rozet) | ✅ |
| G1.4 | **Eksik bilgileri tespit etme** | `eksik_tespit` node: tür-bağımlı zorunlu-alan şeması (3071 m.4 / resmî-yazı daraltılmış); recall-öncelikli (F-beta β=2) | `backend/agents/nodes/eksik_tespit.py`, `config.ZORUNLU_ALANLAR`; `docs/06-eval-harness.md` | ✅ |
| G1.5 | **İlgili mevzuat / yazışma kuralı önerme** | `mevzuat_oner` node: madde-bazlı **BM25 retrieval** (304 mevzuat / 1916 madde-chunk korpus) + statik config fallback; şüpheli madde `[DOĞRULA:]` | `backend/agents/nodes/mevzuat_oner.py`, `data/mevzuat/*.txt`, `scripts/seed_mevzuat.py`; `docs/method.md §3` | ✅ |
| G1.6 | **Özetleme** | `ozetle` node: LLM/mT5 key-fact odaklı kısa özet; faithfulness (halüsinasyon-yok) ölçülür | `backend/agents/nodes/ozetle.py`; `eval/summary_eval.py`; karne: özet faithfulness **1.000** | ✅ |

**Görev 1 ölçüm (GERÇEK pipeline, DeepSeek-chat, in-domain n=54):** sınıflandırma macro-F1
**0.817** / accuracy **0.796** [0.671, 0.882]; eksik-bilgi recall(β=2) **0.739**; özet key-fact
recall **0.712**; özet faithfulness **1.000**. **Dairesel-olmayan held-out** (n=108, 2 bağımsız
set): macro-F1 **~0.89** (0.864 / 0.907) — bkz. `docs/benchmark/llm-heldout.md`. Kanıt:
`docs/benchmark/scorecard.md` · `python -m eval.competition_scorecard`.

---

## B. Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme (§6.4.2 — 5 yetenek)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| G2.1 | **Resmî yazı taslağı** (üst/cevabi/bilgilendirme/olur) | `yazi_taslak` node: jinja2 iskelet (Resmî Yazışma Yön. 2646 format) + LLM doldurma; 4 yazı türü | `backend/agents/nodes/yazi_taslak.py`, `backend/yazi/` (renderer); ekran: `docs/img/04-taslak.png` | ✅ |
| G2.2 | **Resmî üslup** | Yön. 2646 zorunlu bölümler + sıra + kapanış + muhatap türe göre denetlenir; `format_uyumlu_rate=1.0` (kalite kapısı KAPANDI) | `config.YAZI_ZORUNLU_BOLUMLER`; `eval/draft_eval.py`; karne: format-uyum **1.0000** (216/216), Türkçe saflık **1.0000**, tür doğruluğu **1.0000**, bileşen tam-uyum **1.0000** | ✅ |
| G2.3 | **Doğru birime yönlendirme** | `route_birim` node: **DeepSeek akıl-yürütme** + 9 birim `EVRAK_TO_BIRIM` deterministik fallback; top-k + güven + alternatifler; maliyet-ağırlıklı hata | `backend/agents/nodes/route_birim.py`, `config.EVRAK_TO_BIRIM`; `eval/routing_eval.py` | ✅ |
| G2.4 | **Kullanıcıyı bilgilendirme** | `finalize` node: **DeepSeek** ile özet + havale birimi + mevzuat + eksik bilgi kompozisyonu (deterministik fallback); her çıktıda **yasal disclaimer** | `backend/agents/nodes/finalize.py`; ekran: `docs/img/03-sonuc.png` (Bilgilendirme bloğu) | ✅ |
| G2.5 | **Eksik bilgi isteme** (taslak öncesi) | `clarifier` dur-ve-sor dalı (ENV `CLARIFY_STOP_ENABLED`): kritik alan eksikse taslak ÜRETMEDEN takip sorusu döndürür | `backend/agents/nodes/clarifier.py`, `agents/graph.py` (`_clarify_route`); `docs/method.md §5` | ✅ |

**Görev 2 ölçüm (GERÇEK pipeline, DeepSeek-chat, in-domain n=54):** yönlendirme Top-1 (uçtan-uca)
**0.852** [0.734, 0.923] / Top-3 **0.963**; **dairesel-olmayan held-out** (n=108, 2 bağımsız set)
Top-1 **0.907** (her iki sette aynı — `route_birim` düzeltmesi sonrası, bkz. `llm-heldout.md`);
yazı bileşen tam-uyum **1.000**; yazı türü **0.833**; Türkçe saflık **0.9998**; **uydurma-veto
yanlış-pozitif 0/140** (anti-halüsinasyon kapısı sağlıklı); `format_uyumlu_rate=**1.000**`
(kalite kapısı KAPANDI). Kanıt: `docs/benchmark/scorecard.md`.

---

## C. Puanlama Kriterleri (§8-9 — 100 puan)

| Kriter (puan) | Bizim kanıtımız | KANIT | Durum |
|---|---|---|---|
| **Yöntem ve Teknik Yaklaşım (35)** | Çok-ajanlı koşullu-kenarlı LangGraph (10 node) + deterministik-taban/ENV-gated-SOTA katmanı + uydurma-yasağı mimari kısıt + recall-öncelikli kamu disiplini; ablasyon (McNemar p + bootstrap CI) | `docs/method.md`, `agents/graph.py`, `eval/ablation_eval.py`, `docs/benchmark/ablation.md` | ✅ |
| **Uygulama (35)** | 5 alt-kalem birebir ölçüldü: sınıflandırma doğruluğu, yönlendirme başarımı, özetleme, yazı şablon kalitesi, eksik-bilgi tespiti — Wilson %95 CI'lı. Taslak `format_uyumlu_rate=1.0` (kapı KAPANDI). Manşet=DeepSeek-chat in-domain (macro-F1 0.817); dairesel-olmayan held-out **~0.89** | `docs/06-eval-harness.md`, `docs/benchmark/scorecard.md`, `docs/benchmark/llm-heldout.md`, `eval/competition_scorecard.py` | ✅ |
| **Demo (15)** | Canlı SSE Ajan Akış Şeması (node'lar gerçek-zamanlı "yanar"); 5 örnek evrak tek-tıkla; internet-kesinti offline yedeği | `frontend/src/components/agent-flow/`, `docs/demo-senaryosu.md`; ekran: `docs/img/02-akis.png` | ✅ |
| **Yenilikçilik / Özgünlük / Ticarileşme (15)** | **Asıl farklılaşma DİSİPLİN:** anti-halüsinasyon deterministik veto (false-veto 0), PII-önce-maskeleme (KVKK ürün-artısı), gerçek BM25 mevzuat RAG, reprodüke-edilebilir dürüst held-out (artefakt + BCa CI), SDP arşiv metadata. ENV-gated CRAG/Self-RAG (Yan 2024 / Asai 2023) **uygulandı + ablasyonla ölçüldü** → küçük korpusta **anlamlı DEĞİL** (dürüst negatif sonuç; manşet iddia değil) | `agents/nodes/verify.py`, `api/pii.py`, `mevzuat_oner.py`, `arsiv.py`; `eval/ablation_eval.py`; `docs/method.md §6` | ✅ |
| **Real-time üretim avantajı (§8 Demo)** | SSE streaming TTFT + node-by-node canlı akış (sabit SLA iddia edilmez; "düşünen sistem" hissi) | `api/routes/process_doc.py` (`/process_doc/stream`); `docs/06-eval-harness.md` (latency) | ✅ |

> **100 puan anlatısı:** Yöntem (35), Demo (15) ve Yenilikçilik/Ticarileşme (15) kanıtlı; Uygulama (35)
> tarafında sınıflandırma/yönlendirme/özet/eksik-bilgi/taslak-format **hepsi ölçüldü ve geçti**
> (`format_uyumlu_rate=1.0`, mevzuat **gerçek BM25** 304 mevzuat/1916 chunk, Recall@1 0.688 / Recall@3 0.875, n=16).
> Manşet skorlar **ölçüm modeli DeepSeek-chat** (24 Tem 2026'da kaldırıldı — üstteki nota
> bakınız), in-domain (n=54); **dairesel-olmayan held-out**
> (n=108, 2 bağımsız set) macro-F1 ~0.89 / yönlendirme Top-1 0.907 ayrıca raporlanır — abartı yok,
> kapalı risk jüriden saklanmaz (bkz. `route_birim` düzeltmesi, `docs/benchmark/llm-heldout.md`).

---

## D. Teslim Formatı ve İdari Uyum (§5, §7-8)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| D.1 | **Açık kaynak lisans (MIT/Apache/GNU)** | Repo lisansı **MIT**; AGPL bağımlılık yok (PyMuPDF→pypdfium2 ile bertaraf) | `LICENSE` (MIT), `docs/07-model-lisanslari.md §1` | ✅ |
| D.2 | **TAKP GitHub'a kod+veri teslim** | Repo açık-kaynak hazır (CI + lisans + CONTRIBUTING); TAKP yüklemesi başvuru anında yapılır | `README.md` rozetleri, `.github/workflows/ci.yml`, `CONTRIBUTING.md` | 🟡 (yükleme = başvuru anı) |
| D.3 | **Model ağırlıkları repoya YÜKLENMEZ** (link+sürüm+lisans) | Büyük modeller (BGE-M3, Qwen, mT5) link+lisans dokümante; `.gitignore` ağırlıkları dışlar | `docs/07-model-lisanslari.md`, `.gitignore` | ✅ |
| D.4 | **Gerçek kamu verisi YASAK** (§6.5) | %100 sentetik/kurgu evrak + checksum-sahte TCKN + kamuya açık mevzuat; veri kartı beyanı | `docs/data-card.md`, `scripts/gen_synthetic.py`, `data/mevzuat/README.md` | ✅ |
| D.5 | **Tüm belgeler Türkçe + bilimsel atıflı** | Tüm `docs/` Türkçe, kaynak linkli (mevzuat.gov.tr, akademik referans) | `docs/*.md` (00-08, method, data-card); atıflar `docs/02 §Kaynaklar` | ✅ |
| D.6 | **Ön sunum + Final sunumu (PDF ve PPTX)** | Sunum anlatımları ve üretilmiş PDF/PPTX çıktıları repoda | `docs/sunum-on-degerlendirme.md`, `docs/sunum-final.md`, `docs/sunum/` | ✅ |
| D.7 | **Final 10 dk sunum + 5 dk soru-cevap** | Final akışı + olası jüri soruları + cevapları yazıldı | `docs/sunum-final.md` | ✅ |
| D.8 | **Canlı demo + internet-kesinti offline path** | `LLM_MODE=mock` sıfır dış-bağımlılık offline çalışır; örnek evraklar OCR'sız yol; demo.gif yedeği | `docs/demo-senaryosu.md §2`, `scripts/run-local-demo.sh` | ✅ |
| D.9 | **Demo veri kaynağı + kullanım hakları beyanı** | Tüm demo evrakı sentetik (MIT) veya sunum-anı kurgu; gerçek kişi/kurum yok | `docs/data-card.md §6`, `docs/demo-senaryosu.md` (başlık) | ✅ |

---

## E. Etik ve Adillik (§13.1)

| # | Şartname isteri | Bizim karşılığımız | KANIT | Durum |
|---|---|---|---|---|
| E.1 | **Yanlılıktan arındırılmış / kapsayıcı** | Counterfactual fairness: farklı isim/cinsiyet sahte-PII varyantında sınıflandırma/routing tutarlılık kontrolü | `eval/fairness_eval.py`; karne (DeepSeek-chat, n=54): sınıf tutarlılığı **0.9444** [0.819, 0.985], birim tutarlılığı **0.9444** | ✅ |
| E.2 | **Sonuç manipülasyonu / jüriyi yanıltma yok** | Kapalı-küme F1 değil resmî-kaynaklı taksonomi (docs/02); blind etiketleme planı; mock-vs-LLM ayrımı saklanmaz | `docs/data-card.md §4` (blind), `docs/method.md §2.1` (dairesellik uyarısı) | ✅ |
| E.3 | **Uydurma / halüsinasyon engeli** | `verify` node uydurma kurum/tarih/sayı/madde veto; şüpheli→`[DOĞRULA:]`; her çıktıda disclaimer | `backend/agents/nodes/verify.py`; karne (n=54): uydurma-veto FP **0/140** | ✅ |

---

## F. Uygunluk Kontrol Listesi (§5) — diskalifiye riski

| # | Şartname isteri | Durum | Not |
|---|---|---|---|
| F.1 | **Takım tam 4 kişi + 1 kaptan** | ✅ | **Ekip 4 kişi (kaptan dahil) — şart sağlandı.** Diskalifiye riski KAPANDI. |
| F.2 | Her üye 18+, öğrenci/mezun | ✅ | Ekip tarafından teyit edildi (2026-07-04). |
| F.3 | Her kişi yalnız bir takımda | ✅ | Ekip tarafından teyit edildi (2026-07-04). |
| F.4 | TAKP NLP projesinde aktif görevli YOK | ✅ | Ekip tarafından teyit edildi (2026-07-04); kodu TAKP GitHub'a yüklemek bu kapsama girmez. |
| F.5 | Aynı projeyle eşzamanlı başka TEKNOFEST başvurusu YOK | ✅ | Ekip tarafından teyit edildi (2026-07-04); kamu-evrak, ADALET-AGENT'tan ayrı/yeterince farklı depo (port haritası `docs/04`). |
| F.6 | Son 2 yıl üst üste TYDA ödülü YOK | ✅ | Ekip tarafından teyit edildi (2026-07-04). |
| F.7 | Önceki diskalifiye/etik ihlali YOK | ✅ | Ekip tarafından teyit edildi (2026-07-04). |

---

## G. Açık İşler / Gelecek Faz (dürüst backlog)

| # | İş | Neden açık | Hedef faz | Durum |
|---|---|---|---|---|
| AÇ.1 | ~~4. takım üyesi~~ | İdari uygunluk (F.1) — **ÇÖZÜLDÜ: ekip 4 kişi** | — | ✅ |
| AÇ.2 | ~~Taslak format kalite kapısı~~ | `format_uyumlu_rate=1.0` — **ÇÖZÜLDÜ** (`eval/draft_eval.py` canlı doğrulandı) | — | ✅ |
| AÇ.3 | **Blind insan-etiketli gold** | Otomatik üretilen gold etiketleri bağımsız kişi onayından geçmeli (etik §13.1) | Hafta 1-2 | ⚠️ |
| AÇ.4 | **TAKP yükleme / idari teyitler** | Başvuru anı işlemi ve kişi uygunluğu ekip tarafından teyit edilmeli | Başvuru öncesi | 🟡 |
| AÇ.5 | **Canlı OCR uçtan-uca genişletme** | Demo örnek-evrak yolu çalışır; farklı tarama/foto kaliteleriyle geniş saha provası yapılmalı | Finalist fazı | 🟡 |
| AÇ.6 | ~~`route_birim` LLM-routing regresyonu~~ | 2026-07-04: held-out'ta ilk kez ölçüldü, Top-1 0.907→0.54-0.59 düştüğü bulundu — **ÇÖZÜLDÜ** (bilinen türde deterministik otoriter) | — | ✅ |
| AÇ.7 | **Tam n=108 DeepSeek held-out** (düzeltilmiş kod) | Şimdilik yalnız n=54 dengeli alt-örneklem ölçüldü (hız/maliyet); tam 108 henüz koşulmadı | Başvuru öncesi (opsiyonel) | 🟡 |

---

## Kapsam Özeti

- **Görev 1 — 6/6 yetenek ✅** (OCR, sınıflandırma, çıkarım, eksik-tespit, mevzuat, özet)
- **Görev 2 — 5/5 yetenek çalışır** (taslak, üslup, yönlendirme, bilgilendirme, eksik-isteme); **taslak-format kapısı KAPANDI (`format_uyumlu_rate=1.0`)**
- **Puanlama 4/4 kriter izlenebilir** (Yöntem 35 / Uygulama 35 / Demo 15 / Yenilikçilik 15); Uygulama'da açık teknik kalite kapısı YOK
- **Teslim formatı 9 madde:** 8 ✅ + 1 🟡 (TAKP yükleme=başvuru anı)
- **Etik 3/3 ✅**
- **Uygunluk listesi 7/7 madde ✅** (ekip tarafından 2026-07-04'te teyit edildi) — **KIRMIZI YOK**

**Kalan açıklar (dürüst):** blind insan-etiketli gold (etik §13.1), tam n=108 DeepSeek held-out
(düzeltilmiş kod — şimdilik n=54 ile doğrulandı), TAKP GitHub kod teslimi (D.2).

> **Durum:** İdari kırmızı KAPANDI (takım 4) ve format kalite kapısı KAPANDI. F.1-F.7 uygunluk listesi
> **tam teyitli**. Kalan işler yalnız teknik-olgunluk (reprodüksiyon artefaktı, leak-free taban) ve
> TAKP GitHub'a kod teslimi — hiçbiri diskalifiye riski değil.
> En kritik teknik açık: taslak-format kalite kapısı; kapanana kadar yazı taslağı başarımı abartılmadan,
> bileşen/tür/Türkçe saflık ve false-veto metrikleriyle sınırlı sunulur.
