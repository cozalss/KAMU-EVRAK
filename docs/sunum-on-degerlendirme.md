# Ön Değerlendirme Sunumu — TEKNOFEST 2026 TYDA, 1. Senaryo

> **Teslim:** 12 Temmuz (son başvuru + Ön Değerlendirme Sunumu) — bkz. `docs/00-yarisma-uygunluk.md §4`.
> **Format:** PDF **ve** PPTX (şartname §7). Bu dosya **10 slaytlık anlatım + konuşma notları**dır;
> slayt görselleri için `docs/img/` ekran görüntüleri kullanılır.
> **İçerik kapsamı (§3.1):** proje + mimari + takım özeti + motivasyon.
>
> **Sunum disiplini:** Her slaytta tek ana mesaj. Abartma yok — kanıtlanabilir olan gösterilir.
> Skor sunulduğunda **mock taban** olduğu ve gerçek-LLM modunun yükselttiği **mutlaka** söylenir.

---

## Slayt 1 — Kapak / Takım

**Başlık:** kamu-evrak — Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi
**Alt başlık:** TEKNOFEST 2026 · Yapay Zeka Dil Ajanları Yarışması (TYDA) · 1. Senaryo
**Takım:** [Takım adı] · [Kaptan + üyeler] · Roller: Backend/Ajan · RAG/ML · Frontend/Demo · Veri/Eval

> **Konuşma notu (20 sn):** "Merhaba, biz [takım]. Kamu kurumlarının her gün karşılaştığı evrak
> ve yazışma yükünü çok-ajanlı bir yapay zeka sistemiyle hafifletiyoruz. 10 dakikada problemi,
> çözümümüzü ve çalışan demomuzu göstereceğiz." (Görsel: temiz kapak; logo + 1. Senaryo etiketi.)

---

## Slayt 2 — Problem: Kamu Evrak Yükü

**Mesaj:** Kamu kurumlarına günde **binlerce** evrak gelir — dilekçe, başvuru, şikâyet, tebligat,
üst yazı, fatura, dava/icra evrakı. Her biri: doğru sınıflandırma, eksik-bilgi kontrolü, doğru
mevzuat, doğru birime havale ve resmî-format cevabi yazı gerektirir.

- **Manuel süreç yavaş ve hata-açık:** tür karışır, eksik bilgi geç fark edilir, yanlış birime havale gecikme yaratır.
- **Yasal süre baskısı:** dilekçe 30 gün (3071), bilgi edinme 15 iş günü (4982), tebligat süre başlatır (7201).
- **Resmî format zorunluluğu:** Resmî Yazışma Yönetmeliği (Yön. 2646) zorunlu bölümleri.

> **Konuşma notu (40 sn):** "Bu işler bugün büyük ölçüde elle yapılıyor: memur evrakı okuyor,
> türünü anlıyor, eksikse geri istiyor, mevzuatı buluyor, doğru birime gönderiyor, sonra resmî
> yazıyı yazıyor. Hacim büyük, süreler yasal, hata maliyeti yüksek. Tam da dil-ajanlarının
> değer katacağı bir alan."

---

## Slayt 3 — Çözüm: Çok-Ajanlı Pipeline (Görev 1 + Görev 2 tek uçtan-uca)

**Mesaj:** Tek bir LangGraph boru hattı **iki zorunlu görevi** birlikte çözer:
**oku → sınıflandır → bilgi çıkar → eksik tespit → mevzuat öner → özetle** (Görev 1) ve
**birime yönlendir → resmî yazı taslakla → doğrula → bilgilendir** (Görev 2).

- **Neden çok-ajan?** Her ajan dar bir görevden sorumlu → bağımsız test edilir, hata yayılımı ölçülür (tek-prompt monolitin aksine).
- **Deterministik taban + ENV-gated SOTA:** LLM olmadan da (mock) uçtan-uca çalışır; ileri teknikler bayrakla açılır.

> **Konuşma notu (40 sn):** "Çözümümüz tek bir akış: belge giriyor, dokuz-on ajan sırayla
> çalışıyor — biri türü buluyor, biri bilgileri çıkarıp kişisel veriyi maskeliyor, biri eksiği
> yakalıyor, biri mevzuatı öneriyor, biri özetliyor; sonra ikinci görev: doğru birime havale,
> resmî yazı taslağı, doğrulama, bilgilendirme. İki görev, tek pipeline."

---

## Slayt 4 — Mimari (Diyagram + Ekran Görüntüsü)

**Görsel:** `docs/img/02-akis.png` (canlı Ajan Akış Şeması — Görev 1 yeşil / Görev 2 mavi renk ayrımı).

```
START → siniflandir → cikar → eksik_tespit
                                   │
                      ┌────────────┴────────────┐   (paralel fan-out)
                      ▼                          ▼
                 mevzuat_oner                 ozetle
                      └────────────┬────────────┘
                                   ▼
              route_birim → yazi_taslak → verify → arsiv → finalize → END
```

- **10 node** + **ENV-gated** crag / self_rag / clarifier (varsayılan kapalı).
- **State reducer'lar** paralel kolu (mevzuat ∥ özet) yarış-koşulsuz birleştirir.
- **OCR graf-öncesi** (API route) → graf saf metin üzerinde çalışır → test-edilebilir.

> **Konuşma notu (45 sn):** "Mimarimiz koşullu-kenarlı bir LangGraph. Ekranda gördüğünüz şema
> demo sırasında canlı yanıyor. Yeşil node'lar Görev 1, mavi node'lar Görev 2. Şu paralel kol —
> mevzuat önerisi ve özetleme aynı anda koşuyor. CRAG ve Self-RAG gibi ileri teknikler birer
> ENV bayrağıyla açılıyor: varsayılan kapalı, ölçülerek açılıyor."

---

## Slayt 5 — Görev 1: Sınıflandırma + İçerik Analizi

**Görsel:** `docs/img/03-sonuc.png` (sonuç kartları — PII maskeli rozet).

| Yetenek | Nasıl | Kanıt (mock taban) |
|---|---|---|
| Tür belirleme | 19 tür taksonomisi + abstention (`belirsiz`) | macro-F1 **0.9493** / acc **0.9491** |
| Bilgi çıkarımı | gönderen/tarih/sayı/konu/talep + **PII maskeleme** | 🛡️ ham TCKN/telefon arayüze ulaşmaz |
| Eksik tespiti | tür-bağımlı zorunlu-alan (recall-öncelikli) | recall(β=2) **0.9948** |
| Mevzuat önerisi | madde-bazlı BM25 (198 mevzuat / 1285 chunk) | Recall@3 **0.875** [0.64, 0.97], n=16 |
| Özet | key-fact odaklı | recall **0.9810**, faithfulness **1.0000** |

> **Konuşma notu (45 sn):** "Görev 1'de evrak türünü buluyoruz, bilgileri çıkarıyoruz — ve
> kritik: kişisel veriyi backend'de maskeliyoruz, ham TCKN arayüze hiç ulaşmıyor. Eksik bilgiyi
> recall-öncelikli yakalıyoruz, çünkü kamuda kaçan eksik, yanlış-alarmdan pahalıdır. Mevzuatı
> öneriyor, özeti çıkarıyoruz. Skorlar mock taban — gerçek-LLM modu yükseltir; birazdan dürüstçe açacağım."

---

## Slayt 6 — Görev 2: Resmî Yazı + Birim Yönlendirme

**Görsel:** `docs/img/04-taslak.png` (resmî yazı taslağı + PDF/DOCX indir).

| Yetenek | Nasıl | Kanıt (mock taban) |
|---|---|---|
| Birim yönlendirme | 9 birim eşleme + top-k + güven | Top-1 **0.9630** / Top-3 **0.9815** |
| Resmî yazı taslağı | Yön. 2646 jinja2 iskelet + LLM doldurma (üst/cevabi/bilgilendirme/olur) | tür doğruluğu **1.0000** |
| Resmî üslup | zorunlu bölüm checklist + Türkçe saflık | format uyumu **1.0000**, bileşen tam-uyum **1.0000**, saflık **1.0000** |
| Bilgilendirme | özet + birim + mevzuat + disclaimer | her çıktıda yasal disclaimer |
| Eksik isteme | clarifier dur-ve-sor (kritik alan eksikse taslak yok) | dur-ve-sor dalı |

> **Konuşma notu (45 sn):** "Görev 2'de doğru birime havale öneriyoruz, sonra resmî yazı
> taslağını üretiyoruz — T.C. başlığı, Sayı, Konu, İlgi, kapanış: Yön. 2646 formatına uygun.
> Memur tek tıkla PDF veya DOCX indiriyor. Eksik bilgi varsa sistem körlemesine yazmaz —
> durur, vatandaştan bilgi ister."

---

## Slayt 7 — Teknik Derinlik (RAG · Verify · Ablation)

**Mesaj:** Yöntem derinliğinin **kanıtı ölçümdür.**

- **Mevzuat RAG:** madde-bazlı chunk + BM25 (uzunluk-norm b=0.3 ölçülerek ayarlandı, kısa-madde kayırması düzeltildi).
- **Verify / uydurma-veto:** kurum/tarih/sayı/madde kaynakta yoksa veto; **false-veto = 0/216** (doğruyu vetolamaz, uydurmayı yakalar).
- **İstatistiksel disiplin:** tüm oranlar **Wilson %95 CI**; ablasyon A/B'leri **McNemar p + bootstrap Δpp CI**.
- **Dürüstlük kuralı:** "+5pp ama p=0.31 → **anlamlı DEĞİL**" diye raporlanır.

> **Konuşma notu (50 sn):** "Teknik derinliği iddiayla değil ölçümle gösteriyoruz. Mevzuat
> aramada BM25 uzunluk normalizasyonunu ölçerek ayarladık. Anti-halüsinasyon kapımız doğru
> içeriği yanlışlıkla vetolamıyor — yanlış-pozitif sıfır. Tüm skorları Wilson güven aralığıyla,
> ablasyonları McNemar testiyle veriyoruz; anlamsız farkı 'anlamlı değil' diye yazıyoruz. Bu jüriye güven verir."

---

## Slayt 8 — Demo (Real-Time Üretim Avantajı)

**Görsel:** `docs/img/01-yukleme.png` (yükleme + 5 örnek evrak) + `docs/img/02-akis.png` (canlı akış).

- **Canlı SSE Ajan Akış Şeması:** node'lar gerçek-zamanlı "yanar" → "düşünen sistem" hissi (Demo 15p).
- **5 örnek evrak** tek tıkla (Dilekçe, Bilgi Edinme, Üst Yazı, Tebligat, Şikâyet-eksik) → jüri dosya aramadan çalıştırır.
- **İnternet-kesinti yedeği:** `LLM_MODE=mock` sıfır dış-bağımlılık offline çalışır; örnek evraklar OCR'sız yol.

> **Konuşma notu (40 sn):** "Demomuz canlı: belge giriyor, ajan şeması gerçek zamanlı yanıyor.
> Beş hazır örnek var, dosya aramaya gerek yok. En önemlisi — şartname internet-kesintisini
> önemsiyor: bizim varsayılan modumuz mock, hiçbir dış çağrı yapmıyor, internet olmadan da tam çalışıyor.
> Bu, jüri canlı çalıştırma istediğinde bizi güvende tutar." (Detay: `docs/demo-senaryosu.md`.)

---

## Slayt 9 — Yenilikçilik / Özgünlük / Ticarileşme

- **Özgünlük:** çok-ajan vs tek-ajan **ablasyonla** kanıtlanan kurgu; ENV-gated CRAG (Yan 2024) / Self-RAG (Asai 2023); error-propagation ölçümü.
- **Ürün artısı:** belge PII maskeleme (kullanıcı koruması + jüri "wow"); SDP 2005/7 arşiv metadata.
- **Hedef kullanıcı + değer:** kamu kurumları / EBYS-DYS operatörleri → evrak işleme süresi↓, sınıflandırma/havale hatası↓, resmî-format standardı.
- **Ticarileşme / ölçeklenebilirlik:** lisans-temiz MIT yığın (AGPL yok); EBYS/e-Yazışma API entegrasyonu; çok-kurum SaaS **veya** kurum-içi (on-prem, offline, KVKK) konuşlandırma; iş modeli lisans/SaaS/kamu ihale.
- **Sürdürülebilirlik:** deterministik veri (sabit tohum), tek-komut karne, CI regresyon kapısı.

> Detaylı ticarileşme/ölçeklenebilirlik anlatımı (şartname "Ticarileşme Potansiyeli 15p"): [`docs/ticarileşme.md`](ticarileşme.md).

> **Konuşma notu (45 sn):** "Yeniliğimiz hem mimaride hem üründe. Çok-ajan kurgunun değerini
> ablasyonla nicelliyoruz. PII maskeleme gerçek bir ürün koruması. Lisansımız tamamen temiz MIT —
> AGPL bağımlılık yok, bu ticarileşme için kritik. Sistem hem bulutta hem kurum-içi offline
> çalışabildiği için kamu gizliliği için biçilmiş kaftan."

---

## Slayt 10 — Kapanış: Durum + Dürüstlük + Sonraki Adım

- **Hazır:** Görev 1 (6/6) + Görev 2 (5/5) uçtan-uca çalışıyor; backend **655 passed, 3 warnings**;
  frontend build başarılı; CI; güvenlik denetimi (0 CRITICAL).
- **Dürüst skor beyanı (REPRODÜKE-EDİLEBİLİR ARTEFAKT):** **dairesel-olmayan held-out** sette
  (örtük ifadeli, farklı sözlük) gpt-4o: **sıkı accuracy/macro-F1 0.935 · operasyonel 0.963 · yönlendirme
  Top-1 0.954 (101/108)** — repodaki `backend/eval/runs/heldout_gpt4o_set1.json` ile doğrulanabilir.
  Leak-free mock taban (set-2) **0.69**; mock = anahtarsız taban (CI/offline), tavan değil.
- **Sonraki adım (finalist olunursa):** blind insan-etiketli gold, ablasyon genişletme,
  canlı OCR saha provası ve kuruma özgü EBYS/e-Yazışma entegrasyonu.

> **Konuşma notu (50 sn):** "Kapatırken en önemli şeyi söyleyeyim: dürüstüz ve artık ölçtük.
> Yayınladığımız mock karne anahtarsız tabandır. Gerçek değeri kasıtlı zor — örtük ifadeli, farklı
> sözlükle yazılmış — bir held-out sette ölçtük: gpt-4o sıkı accuracy 0.935'e çıkıyor; operasyonel
> doğruluk 0.963, doğru birime yönlendirme 0.954 (108'de 101). Bu sayıyı repodaki bir artefakta
> bağladık — jüri tek komutla doğrular. Leak-free mock taban ise sadece 0.69; yani ilerleme dairesel
> değil, aynı zor sette ölçülmüş. Pipeline her modda aynı — değişen sadece kalite. Teşekkürler."

---

## Ek — Sunum Hazırlık Notları (sunan için)

- **Süre hedefi:** ~7 dk anlatım (slayt başı ~40-50 sn) → ön-eleme sunumu kısadır; final 10 dk ayrı (`docs/sunum-final.md`).
- **Görseller:** `docs/img/01-04.png` slaytlara gömülür; mümkünse `docs/img/demo.gif` Slayt 8'e.
- **PDF/PPTX:** bu Markdown → slayt aracına aktarılır; her slayt başlık + 3-5 madde + 1 görsel + konuşma notu (notlar PPTX "speaker notes"a).
- **Kırmızı çizgi:** skor sunulan her slaytta "**mock taban**" ibaresi sözlü tekrarlanır (jüri güveni > yüksek-ama-şişirilmiş sayı).
- **İdari hatırlatma:** 4. takım üyesi (uygunluk §5) başvuru öncesi tamamlanmalı — `docs/sartname-uyum-matrisi.md §F.1`.
