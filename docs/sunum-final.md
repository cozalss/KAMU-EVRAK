# Final Sunumu — TEKNOFEST 2026 TYDA, 1. Senaryo

> **Aşama:** Final (fiziki, Bilişim Vadisi Kocaeli) — **10 dk sunum + 5 dk soru-cevap** (şartname §7).
> **Format:** PDF **ve** PPTX. Canlı demo senaryosu: `docs/demo-senaryosu.md` (internet-kesinti yedeği dahil).
> **İlişkili:** uyum kanıtı `docs/sartname-uyum-matrisi.md`; yöntem `docs/method.md`; karne `docs/benchmark/scorecard.md`.
>
> **Altın kural:** Demo `LLM_MODE=mock` + örnek evraklar ile koşulur → sıfır dış bağımlılık,
> internet kesintisinden etkilenmez. Skor sunulan her an "**mock taban / gerçek-LLM yükseltir**" denir.

---

## A. 10 Dakikalık Akış (zaman bütçeli)

| Süre | Bölüm | Ana mesaj | Görsel / Aksiyon |
|---|---|---|---|
| 0:00–0:40 | **Açılış + problem** | Kamu evrak yükü: hacim + yasal süre + resmî format | `docs/img/01-yukleme.png` |
| 0:40–1:40 | **Çözüm + mimari** | İki görev tek LangGraph pipeline; çok-ajan neden? | `docs/img/02-akis.png` (canlı şema) |
| 1:40–5:40 | **CANLI DEMO** (4 dk) | Uçtan-uca Görev 1 + Görev 2 real-time | Çalışan app (aşağıdaki senaryo) |
| 5:40–7:10 | **Teknik derinlik** | RAG + verify + ablasyon + istatistik disiplini | `docs/benchmark/scorecard.md` + ablation |
| 7:10–8:10 | **Dürüst skor** | **gpt-4o 0.935** held-out (dairesel-olmayan, reprodüke-edilebilir artefakt); leak-free mock 0.69 | `heldout_gpt4o_set1.json` + `llm-heldout.md` |
| 8:10–9:10 | **Yenilikçilik + ticarileşme** | PII maskeleme, ENV-gated SOTA, MIT yığın, EBYS/SaaS/on-prem | Ticarileşme slaytı (`ticarileşme.md`) |
| 9:10–10:00 | **Kapanış** | Durum + yol haritası + güçlü kapanış cümlesi | Kapanış slaytı |

### Demo bölümü (1:40–5:40) — adım adım

> Tam senaryo + kontrol listesi + internet-kesinti yedeği: **`docs/demo-senaryosu.md`**.

1. **(60 sn) Örnek evrak → canlı ajan akışı.** "Dilekçe" örneğine tıkla → Ajan Akış Şeması
   sırayla yanar: `oku → siniflandir → cikar → eksik_tespit → [mevzuat_oner ∥ ozetle] →
   route_birim → yazi_taslak → verify → arsiv → finalize`. Paralel kolu vurgula.
2. **(45 sn) Sonuç kartları.** Evrak türü + güven; 🛡️ **PII maskeli** rozet (ham TCKN arayüze
   ulaşmıyor); eksik-bilgi kontrolü; mevzuat önerisi; önerilen havale birimi.
3. **(45 sn) Görev 2: resmî yazı + indirme.** Taslak önizleme (Yön. 2646 format) → **DOCX/PDF indir** → dosya iner.
4. **(30 sn) Eksik-bilgi senaryosu.** "Şikâyet (eksik)" → sistem eksik alanı yakalar, **clarify soruları** üretir;
   "körlemesine yazı üretmez."
5. **(20 sn) Disclaimer + offline vurgu.** Her çıktıda yasal disclaimer; "bu demo mock modda,
   internet olmadan da tam çalışıyor."

---

## B. Slayt İskeleti (final 10 dk — PPTX'e aktarılacak)

1. **Kapak / takım** — proje adı, 1. Senaryo, takım + roller; 4 kişi idari şartı tamamlanmış olmalı.
2. **Problem** — kamu evrak yükü (hacim · süre · format), 3 madde.
3. **Çözüm + mimari** — iki görev tek pipeline, 10 node diyagramı (`docs/img/02-akis.png`).
4. **[CANLI DEMO]** — slayt yerine ekran paylaşımı (yedek: `docs/img/` + `demo.gif`).
5. **Görev 1 sonuçları** — sınıflandırma/çıkarım/eksik/mevzuat/özet + mock-taban skor.
6. **Görev 2 sonuçları** — yönlendirme/taslak/üslup/bilgilendirme + mock-taban skor.
7. **Teknik derinlik** — RAG b=0.3, verify false-veto=0, Wilson CI + McNemar ablasyon.
8. **Dürüst skor** — held-out **gpt-4o sıkı 0.935 / op. 0.963 / Top-1 0.954 (101/108)**, reprodüke-edilebilir artefakt; leak-free mock taban 0.69.
9. **Yenilikçilik + ticarileşme** — PII maskeleme, ENV-gated CRAG/Self-RAG, MIT; EBYS entegrasyonu, SaaS/on-prem (`ticarileşme.md`).
10. **Kapanış** — Görev 1 (6/6) + Görev 2 (5/5), backend 655 test, frontend build; format kapısı + idari yol haritası; kapanış cümlesi.

> **Kapanış cümlesi:** "Çalışan bir sistem, dürüst ölçümler — gpt-4o ile dairesel-olmayan
> held-out'ta **~%90 doğruluk** — ve temiz bir MIT lisans getirdik; internet kesilse bile
> demomuz durmuyor. Teşekkürler."

---

## C. Olası Jüri Soruları + Cevapları (5 dk soru-cevap)

> **Strateji:** Her cevap kısa, kanıt-dosyasına atıflı ve **dürüst**. Zayıf yan sorulursa savunmaya
> geçme — açıkça kabul et + nasıl kapatacağını söyle. Dürüstlük jüri güveni kazandırır.

### S1. "Doğruluk skorunuz nedir? Bu sayılar gerçekçi mi?" ⭐ (en kritik)

> **Cevap:** "Dürüst ve **ölçülmüş** bir cevap vereyim — ilerlemeyi aynı zor sette gösterebilirim:
> Canlı mock karnemiz de güçlü: sınıflandırma macro-F1 **0.9493**, accuracy **0.9491**;
> yönlendirme Top-1 **0.9630** / Top-3 **0.9815**; eksik-bilgi recall **0.9948**; özet
> faithfulness **1.0000**; taslak format uyumu **1.0000**; false-veto **0** ve fairness **1.0000**.
>
> 1. **Mock taban (anahtarsız):** `LLM_MODE=mock` — LLM yerine kural-tabanlı keyword/regex fallback.
>    CI/offline tabanı; **tavan değil.** Leak-free held-out'ta (set-2, heuristiğin uyarlanMADIĞI) sıkı
>    sadece **0.69** — bunu **gizlemiyoruz**: kural tabanı semantik genellemiyor, değer LLM modunda.
>    *(Dürüstlük: mock set-1 figürü artık ezber — heuristik o sete uyarlandı; taban olarak kullanmıyoruz.)*
> 2. **gpt-4o-mini:** Aynı held-out sette **0.61**.
> 3. **gpt-4o (üretim tavanı) — REPRODÜKE-EDİLEBİLİR ARTEFAKT:** Aynı sette **sıkı accuracy/macro-F1
>    0.935**, **operasyonel 0.963**, **yönlendirme Top-1 0.954 — 108 evrakta 101 doğru** (Wilson %95 CI'lı).
>    Commit'li: `backend/eval/runs/heldout_gpt4o_set1.json` → jüri tek komutla doğrular.
>
> Kritik nokta — bu held-out **dairesel DEĞİL:** evraklar örtük/dolaylı ifadeyle, gen_synthetic'ten
> farklı şablon ve sözlükle yazıldı; keyword sızıntısı yok. Yani gerçek genelleme: leak-free mock **0.69
> → gpt-4o 0.935** (artefakt-destekli). Eval'imiz mock taksonomi değil **gerçek LangGraph pipeline'ı**
> ölçüyor. Üretim önerimiz açık: `LLM_MODE=openai` + gpt-4o." (Kanıt:
> `docs/benchmark/llm-heldout.md`, `docs/benchmark/scorecard.md`, `docs/method.md §2.1`.)

### S2. "Gerçek kamu verisi mi kullandınız?"

> **Cevap:** "Hayır — şartname §6.5 gereği **gerçek kamu verisi yasak.** Tüm evraklar **%100
> sentetik/kurgu:** checksum-geçerli ama rastgele sahte TCKN, kurgu isim/adres, kamuya açık
> mevzuat metni (mevzuat.gov.tr). Üretim deterministik (sabit tohum). Demo verisi de bu setten
> veya sunum-anı kurgu örneklerden gelir. Hiçbir gerçek kişi/kurum verisi yok." (Kanıt: `docs/data-card.md`.)

### S3. "Sistem halüsinasyon yapar mı? Yanlış mevzuat/kurum uydurur mu?"

> **Cevap:** "Uydurma yasağı bizde bir **mimari kısıt.** `verify` node taslaktaki kurum/tarih/
> sayı/madde atfını kaynakla doğrular; doğrulanamayan içeriği **veto eder** veya `[DOĞRULA:]`
> işaretine çevirir. Kritik metrik: bu kapının **yanlış-pozitifi 0/216** — yani doğru içeriği
> yanlışlıkla vetolamadan gerçek uydurmayı yakalıyor. Özet faithfulness'ımız 1.000: özet, kaynakta
> olmayan tarih/sayı içermiyor. Üstüne her çıktıda yasal disclaimer var." (Kanıt: `agents/nodes/verify.py`, karne.)

### S4. "Çok-ajan mimari gerçekten gerekli mi, yoksa süsleme mi?"

> **Cevap:** "Bunu **ablasyonla** ölçüyoruz: çok-ajan vs tek-ajan, RAG var/yok, few-shot var/yok —
> her A/B McNemar p + bootstrap CI ile. Ayrıca error-propagation: Görev 2 yönlendirmeye gold-tür
> vs tahmin-tür besleyip çok-ajan kurgunun maliyetini nicelliyoruz. Dürüstlük kuralımız: kazanç
> anlamlı değilse '+5pp ama p=0.31, anlamlı değil' diye raporluyoruz. Yani 'açık' bayrağı yalnız
> ölçülen kazanç anlamlıysa savunuyoruz." (Kanıt: `eval/ablation_eval.py`, `docs/benchmark/ablation.md`.)

### S5. "Kişisel veri (KVKK) nasıl korunuyor?"

> **Cevap:** "`cikar` node çıkarılan TCKN/telefon/IBAN'ı **maskeler** — ve kritik: maskeleme
> çıkarımdan sonra, herhangi bir dış (bulut LLM) çağrısından **önce** uygulanır. Yani ham kişisel
> veri ne arayüze ne de buluta gider. Ekranda 🛡️ rozet bunun görünür kanıtı." (Kanıt: `agents/nodes/cikar.py`, `docs/img/03-sonuc.png`.)

### S6. "İnternet kesilirse / canlı çalıştırmamızı istersek demo çalışır mı?"

> **Cevap:** "Evet — bu bizim **altın kuralımız.** Demo varsayılan `LLM_MODE=mock` modda koşar:
> hiçbir dış API çağrısı yok, node'lar deterministik fallback'e düşer, internet olmadan tam çalışır.
> Örnek evraklar OCR'sız JSON yolundan gider. Yedekte `docs/img/demo.gif` kaydı da var. Bulut LLM'i
> yalnız 'kalite tavanı' göstermek için açıyoruz; zorunlu değil." (Kanıt: `docs/demo-senaryosu.md §2`.)

### S7. "Lisans durumunuz? Ticarileştirilebilir mi?"

> **Cevap:** "Repo **MIT.** Bağımlılık yığınımız tamamen temiz — AGPL yok; ADALET'in kullandığı
> PyMuPDF (AGPL) yerine pypdfium2 (Apache/BSD) yazdık. Büyük model ağırlıkları repoya yüklenmiyor,
> link+sürüm+lisansla dokümante. Hedef müşteri kamu kurumları ve EBYS/DYS operatörleri: değer önermesi
> evrak işleme süresinde ve havale hatasında düşüş. EBYS/e-Yazışma API'siyle entegre olur; çok-kurum
> SaaS **veya** kurum-içi on-prem (offline, KVKK) konuşlandırılır — iş modeli lisans/SaaS/kamu ihale.
> Tam anlatım `docs/ticarileşme.md`'de." (Kanıt: `docs/ticarileşme.md`, `docs/07-model-lisanslari.md`, `LICENSE`.)

### S8. "Bu projeyi ADALET-AGENT'tan mı türettiniz? Özgün mü?"

> **Cevap:** "ADALET-AGENT'tan **yeniden-kullanılabilir altyapıyı kopyaladık** (çok-ajan iskeleti,
> OCR, SSE demo motoru, eval istatistikleri) — port haritası `docs/04`'te KEEP/ADAPT/DROP olarak
> şeffaf. Ama domain tamamen yeni: hukuk değil **kamu evrak/yazışma**; node listesi, taksonomi
> (19 tür/9 birim), mevzuat korpusu (2646/3071/4982/7201/SDP), resmî-yazı şablonları hepsi yeni.
> Hukuk-spesifik bileşenler (emsal, dava tahmini) tamamen DROP edildi." (Kanıt: `docs/04-port-haritasi.md`.)

### S9. "Eksik / yapamadığınız ne var?"

> **Cevap (dürüst):** "Üç açık var, hepsini matriste işaretledik: (1) **4. takım üyesi** —
> bu idari kırmızı madde kapanmadan başvuru geçersiz olabilir; (2) blind
> insan-etiketli gold — otomatik etiketler bağımsız onaydan geçmeli; (3) canlı OCR'ın farklı
> tarama/foto kaliteleriyle saha provası genişletilmeli. Bunları gizlemiyoruz çünkü dürüst ölçüm
> jüri güveni demek." (Kanıt: `docs/benchmark/scorecard.md`, `docs/sartname-uyum-matrisi.md §G`.)

### S10. "Latency / hız? Real-time mı?"

> **Cevap:** "Şartname sabit eşik vermiyor, 'real-time **avantaj**' diyor. Biz sabit SLA iddia
> etmiyoruz; bunun yerine **TTFT (ilk-token süresi) + SSE streaming**'i öne çıkarıyoruz —
> node'lar canlı yanıyor, 'düşünen sistem' hissi. Tam-tamamlanma p95'i ayrı raporluyoruz.
> Mock mod zaten çok hızlı (dış çağrı yok)." (Kanıt: `eval/latency_eval.py`, `docs/06-eval-harness.md`.)

---

## D. Sunum Öncesi Kontrol Listesi (sunan ekip için)

- [ ] PPTX + PDF export hazır; `docs/img/01-04.png` + `demo.gif` gömülü.
- [ ] Backend mock modda ayakta (`uv run uvicorn main:app --port 8000`); `/health` 200.
- [ ] Frontend ayakta (`npm run dev` veya `dist/` + `npm run preview`).
- [ ] 5 örnek evrak tek-tıkla çalışıyor; DOCX/PDF indirme test edildi.
- [ ] **İnternet-kesinti provası:** Wi-Fi kapalıyken demo baştan sona koşturuldu.
- [ ] Skor sayıları ezberde + "mock taban" ibaresi her seferinde sözlü.
- [ ] Zaman provası: 10 dk'yı aşmıyor (demo 4 dk'da bitiyor).
- [ ] Soru-cevap: yukarıdaki 10 soru ekipçe paylaşıldı (kim hangi konuyu yanıtlıyor).
