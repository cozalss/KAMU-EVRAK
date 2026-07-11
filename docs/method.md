# Yöntem ve Teknik Yaklaşım

> TEKNOFEST TYDA 1. Senaryo — "Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent
> Destek Sistemi". Bu belge şartname §8 **"Yöntem ve Teknik Yaklaşım (35p)"**
> kriterini hedefler: yöntemlerin derinliği, karmaşıklığı ve teknik kurgunun
> bütünlüğü. İlgili tasarım kararları `docs/03-mimari.md`, ölçüm `docs/06-eval-harness.md`,
> veri `docs/data-card.md`, lisans `docs/07-model-lisanslari.md` belgelerindedir.

## 0. Tasarım felsefesi

1. **Çok-ajanlı, koşullu-kenarlı (conditional-edge) bir graf** tek-prompt monolitten
   üstündür: her ajan dar bir görevden sorumludur, bağımsız test edilir ve hata
   yayılımı (error-propagation) ablasyonla ölçülür.
2. **Deterministik taban + ENV-gated SOTA katmanı.** Sistem LLM olmadan da (mock)
   uçtan uca çalışır; her gelişmiş bileşen (CRAG/self-RAG/reranker/few-shot) bir ENV
   bayrağı ile açılır → jüri "varsayılan kapalı, ölçülerek açılan" disiplinini görür.
3. **Uydurma yasağı bir mimari kısıt.** Madde no/kurum/tarih/sayı **doğrulanır veya
   `[DOĞRULA:]` ile işaretlenir** (CLAUDE.md §1). `verify` node uydurmayı veto eder.
4. **Recall-öncelikli kamu disiplini.** Eksik-bilgi tespitinde yanlış-negatif (kaçan
   eksik) yanlış-pozitiften pahalıdır → F-beta (β=2) ile recall ağırlandırılır.

## 1. Çok-ajan LangGraph pipeline (10 node)

ADALET-AGENT'ten devralınan ENV-gated, fan-in/fan-out, reducer-tabanlı desen kamu-evrak
iş akışına uyarlanmıştır (ayrıntı: `docs/03-mimari.md`).

```
START → siniflandir → cikar → eksik_tespit
                                   │  (clarifier dur-ve-sor: kritik alan eksikse)
                      ┌────────────┴────────────┐
                      ▼                          ▼
                 mevzuat_oner                 ozetle      (paralel fan-out)
                      └────────────┬────────────┘
                                   ▼
                       route_birim → yazi_taslak → verify → arsiv → finalize → END
```

| Node | Görev (Görev 1 / Görev 2) | Yöntem |
|---|---|---|
| `oku` (graf-öncesi, API route) | bytes → metin + sayfa + güven | OCR/PDF/Word boru hattı (RapidOCR + pypdfium2 + python-docx) |
| `siniflandir` | evrak türü (18 + belirsiz) | few-shot LLM birincil; mock'ta anahtar-sözcük/heuristik; düşük güven → `belirsiz` (abstention) |
| `cikar` | bilgi unsurları + **PII maskeleme** | LLM JSON çıkarımı + **kanıt-alıntılı doğrulama** (Chain-of-Verification: `_kanit_gecerli` alıntının kaynak metinde birebir geçtiğini teyit eder → halüsinasyon-önleme); TCKN/telefon/IBAN regex maskeleme (`tckn_maskeli`) |
| `eksik_tespit` | zorunlu alan → eksik + takip sorusu | tür-bağımlı zorunlu küme (3071 m.4 / resmî-yazı daraltılmış); `clarify_questions` üretir |
| `mevzuat_oner` | ilgili mevzuat (Görev 1) | madde-bazlı **BM25 retrieval** (korpus) + config statik fallback |
| `ozetle` | kısa öz özet (Görev 1) | LLM/mT5 özet; anahtar-unsur (key-fact) odaklı |
| `route_birim` | hedef birim + top-k (Görev 2) | DeepSeek akıl-yürütme; fallback `EVRAK_TO_BIRIM` + sınıflandırıcı; maliyet-ağırlıklı hata değerlendirmesi |
| `yazi_taslak` | resmî yazı taslağı (Görev 2) | jinja2 iskelet (Yön. 2646 format) + LLM doldurma; zorunlu-bölüm checklist |
| `verify` | taslak kalite kapısı (Görev 2) | uydurma-veto + format uyarısı; false-veto=0 hedefi. **Elle düzenlenen/AI-revize edilen taslak da (`/yazi/dogrula` ucu) HER durumda bu kapıdan + risk-bandından yeniden geçer — bypass yok** |
| `arsiv` | arşiv metadata (Görev 2) | SDP 2005/7 dosya kodu + saklama süresi |
| `finalize` | bilgilendirme + clarify (Görev 2) | yanıt kompozisyonu; eksikse soru, tamsa taslak; **hukuki sorumluluk reddi** |

**State (`EvrakState` TypedDict):** reducer'lar paralel fan-in'i güvenli birleştirir
(`bilgi_unsurlari` dict-merge; `mevzuat_onerileri`/`errors` `operator.add`). Bu, iki
ajanın (mevzuat_oner ∥ ozetle) çıktısının yarış koşulu olmadan toplanmasını sağlar.

## 2. Few-shot LLM + mock fallback (sağlamlık) — ve modlar arası dürüstlük

- **LLM seçimi** `agents/llm.py` Protocol (4-impl): `LLM_MODE ∈ {mock, openai, llamacpp,
  llamacpp_server}`. Bulut (gpt-4o/mini) ve lokal (Qwen GGUF, Apache) eşit desteklenir;
  anahtar `.env`'de (asla hardcode). `get_llm()` ENV'e göre tek-nokta dispatch eder.

  | `LLM_MODE` | Çağrı | Anahtar/yol | Skor anlamı |
  |---|---|---|---|
  | `mock` | yok — keyword+regex heuristik | — | **taban (alt-sınır)** |
  | `openai` | bulut few-shot JSON | `OPENAI_API_KEY` (kod `OPENAI_LLM_MODEL` okur) | **gerçek doğruluk (tavan)** |
  | `llamacpp(_server)` | lokal GGUF | `LLM_MODEL_PATH` / `LLM_SERVER_URL` | offline/gizlilik |

- **Mock fallback bir tasarım hedefi, kısıt değil:** LLM erişilemese/offline'da bile
  her node deterministik bir sonuç döndürür → demo internet kesintisinde çökmez
  (şartname §7 offline yedek planı). Anahtarsız `LLM_MODE=openai` seçilse bile kod
  **patlamaz**: `get_llm()` net bir uyarıyla mock'a düşer (graceful degradation).
  Doğrula: `python scripts/run_llm_smoke.py` (anahtarsız → mock; anahtarla → gerçek LLM).
- **Mock vs gerçek-LLM skoru AYRI raporlanır — taban tavana sahte sabitlenmez.** Yayınlanan
  karne (`docs/benchmark/scorecard.md`, README "Eval skorları") **mock taban** ölçümüdür;
  gerçek `openai` modu bu metrikleri **yükseltir**. İki modun aynı **gerçek LangGraph
  pipeline'ını** koşması kritiktir → taban, sahte bir taksonomi tablosu değil, sistemin
  fallback davranışıdır.
- **Few-shot:** sınıflandırma/taslaklama prompt'ları taksonomi ve resmî-yazı
  iskeletlerinden (docs/01-02) türetilmiş örneklerle desteklenir; ablasyonda
  few-shot var/yok A/B'si ölçülür.

### 2.1 In-domain vs held-out skor + dairesellik uyarısı (dürüstlük)

Skorların yorumlanmasında iki tuzak açıkça not edilir:

1. **In-domain vs held-out.** Sentetik gold (`data/synthetic/*.jsonl`) `gen_synthetic.py`
   ile taksonomi/şablon **dağıtımından** üretilir. Aynı dağıtımdan ölçülen skor
   **in-domain**'dir → gerçek-dünya genellemesinin **üst tahmini** olabilir. Dürüst skor
   **held-out** (üretici görmediği şablon/varyasyon, ideali blind insan-etiketli) gerektirir;
   eldeki sayılar in-domain'dir ve böyle etiketlenir.
2. **Dairesellik (circularity) uyarısı.** Sınıf/birim eşleme tabloları (`config.py`)
   **hem** mock fallback'i **hem** sentetik veri üretimini besliyorsa, mock skoru kısmen
   "aynı kuralın kendini ölçmesi"dir. Bu yüzden (a) gerçek-LLM modu ayrı raporlanır —
   LLM bu tablolara bağlı değildir; (b) ablasyonlar (few-shot var/yok, çok-ajan vs tek)
   ve fairness counterfactual'ları, tek bir kural-tablosunun kendini doğrulamasının
   ötesinde sinyal verir.

## 3. Mevzuat RAG (BM25, madde-bazlı)

- **Korpus:** `data/mevzuat/*.txt` — kamuya açık mevzuat (2646, 3071, 4982, 7201,
  SDP 2005/7, **657, 4734, 2577, 5018**). Madde no'ları kamuya açık kaynaklardan
  çapraz doğrulanır; doğrulanamayan hüküm `[DOĞRULA:]` taşır (uydurma yok).
- **Chunk'lama:** `retrieval/chunker.chunk_mevzuat` `MADDE_PATTERN` ile madde-bazlı —
  her madde ayrı chunk, `madde_no` metadata'da (citation/doğrulama için). Ek/Geçici
  madde başlıkları desteklenir; çok-fıkralı uzun maddeler paragraf-aware alt-bölünür.
- **Skorlama:** `rank_bm25` BM25Okapi (varsa) yoksa stdlib term-overlap fallback.
  **Uzunluk normalizasyonu zayıflatıldı (b=0.3):** madde uzunluğu alaka ile korele
  değildir; varsayılan b=0.75 kısa/genel maddeleri aşırı kayırıp spesifik maddeyi
  geriye iter (ölçülerek düzeltildi).
- **Sorgu genişletme:** konu + Türkçe tür etiketi `_QUERY_BOOST` kez tekrarlanarak
  ağırlandırılır → boilerplate ("arz ederim") gürültüsü domain-spesifik maddeyi
  bastırmaz. Çok kısa sorguda (eşik altı) retrieval atlanır, statik config'e düşülür.
- **Seed:** `scripts/seed_mevzuat.py` korpusu JSON indekse yazar (tokenleştirme/BM25
  runtime'da → rank_bm25 kurulu olmasa da indeks geçerli). 233 dosya → 1508 madde-chunk.

## 4. Doğrulama (verify) — uydurma vetosu

ADALET'in `verifier_layers.py`/`risk_guard.py` deseni uyarlanır:

- **Uydurma vetosu:** taslaktaki kurum adı / tarih / sayı / madde atfı kaynakta
  doğrulanamazsa işaretlenir; doğrulanamayan üretim engellenir veya `[DOĞRULA:]`'ya
  çevrilir. **Hedef: false-veto = 0** (doğru içeriği yanlışlıkla veto etmemek).
- **Format-compliance:** resmî yazı taslağı zorunlu bölümleri taşımalı (T.C. başlığı,
  Sayı, Konu, imza/kapanış — `config.YAZI_ZORUNLU_BOLUMLER`). LLM'siz checklist ile
  deterministik ölçülür → her commit CI'da koşar.
- **Canlı sonuç:** mock karnede `format_uyumlu_rate=1.0`; ham Jinja placeholder yerine
  EBYS/yetkili makamca tamamlanacak alanlar nötr taslak diliyle gösterilir.
- **No-op güvenliği:** `VERIFY_ENABLED=0` ise node state'i bozmadan passthrough yapar.

## 5. Clarifier — dur-ve-sor (stop-and-ask)

- 3071 m.4: ad-soyad / imza / adres eksikse **dilekçe incelenmez** → bu, dur-ve-sor
  kuralının yasal temelidir. `eksik_tespit` kritik alan saptarsa conditional-edge
  taslak üretmeden kullanıcıya **takip sorusu** döndürür (`CLARIFY_STOP_ENABLED`).
- **Yanlış-pozitif önleme:** yalnız deterministik güvenilir tespit edilen alanlar
  (imza/adres anahtar-sözcükle) kritik sayılır; LLM-yapısal alan (gönderen ad-soyad)
  mock'ta her zaman eksik görüneceğinden kritik kabul edilmez (gereksiz dur-ve-sor yok).

## 6. ENV-gated SOTA (yenilikçilik katmanı)

Varsayılan kapalı; ölçülerek açılan ileri teknikler (Yenilikçilik 15p'ye de hizmet eder):

- **CRAG / self-RAG / decompose:** retrieval kalite-değerlendirme + öz-düzeltme.
- **Reranker (BGE-Reranker-v2-m3):** BM25 üstüne yeniden sıralama (opt-in, latency).
- **DistilBERTurk kademe:** hızlı ön-sınıflandırma triajı (opt-in).

Her biri ablasyonda izole edilir; "açık" yalnız ölçülen kazanç anlamlıysa savunulur.

## 7. PII maskeleme (ürün artısı + kullanıcı koruması)

`cikar` node çıkarılan TCKN/telefon/IBAN'ı maskeler (`tckn_maskeli`,
`telefon_maskeli`). Sentetik veri zaten sahte PII taşır (bkz. `docs/data-card.md`);
maskeleme demo ve gerçek-kullanım güvenliği için katman olarak korunur. Bulut LLM'e
ham PII gönderilmez (maskeleme çıkarımdan sonra, dış çağrıdan önce uygulanır).

## 8. Değerlendirme harness'ı + ablasyon (Yöntem kanıtı)

Yöntem derinliğinin **kanıtı ölçümdür** (ayrıntı `docs/06-eval-harness.md`):

- **Birincil metrikler:** sınıflandırma Macro-F1, yönlendirme Top-1 acc, özet
  LLM-judge kapsama, taslak format-compliance, eksik-bilgi F-beta(β=2), demo p95/TTFT.
- **İstatistiksel disiplin:** tüm oranlar **Wilson %95 CI**; A/B'ler **McNemar p +
  bootstrap Δpp CI**. Dürüstlük kuralı: "+5pp ama p=0.31 → **anlamlı DEĞİL**" raporlanır.
- **Ablasyonlar (her biri McNemar + bootstrap):** OCR var/yok · mevzuat-RAG var/yok ·
  few-shot var/yok · **çok-ajan vs tek-ajan** · reranker var/yok · DistilBERT-kademe
  var/yok. **Error-propagation:** Görev 2 yönlendirmeye gold-tür vs tahmin-tür besleme
  A/B'si → çok-ajan kurgunun maliyeti/kazancı nicelenir.
- **Fairness (etik §13.1):** farklı isim/cinsiyet/bölge sahte-PII varyantlarında
  sınıflandırma/routing tutarlılık kontrolü (`eval/fairness_eval.py`).
- **Tek-komut karne:** `eval/competition_scorecard.py` git-SHA'lı Markdown karne →
  `docs/benchmark/`. Deterministik metrikler her commit CI'da; LLM-judge ayrı gate.

## 9. Reprodüksiyon ve teslim uyumu

- **Deterministik veri:** `gen_synthetic.py` sabit tohum (seed) → aynı tohum = aynı veri
  (jüri tekrar-üretilebilirlik). Korpus seed `seed_mevzuat.py` ile yeniden kurulur.
- **Lisans-temiz yığın:** tüm bağımlılıklar MIT/Apache/BSD; AGPL (PyMuPDF) **pypdfium2**
  ile bertaraf edildi; büyük model ağırlıkları repoya yüklenmez, link+sürüm+lisans
  dokümante edilir (`docs/07-model-lisanslari.md`).
- **Türkçe + atıflı:** tüm belgeler Türkçe ve kaynaklıdır (şartname §7).
