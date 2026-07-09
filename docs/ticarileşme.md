# Ticarileşme ve Ölçeklenebilirlik

> Şartname §8-9 "Yenilikçilik / Özgünlük / **Ticarileşme** (15 puan): literatüre göre farklılaşma,
> **ölçeklenebilirlik, sürdürülebilir değer**" kriterine doğrudan hizalı. Bu belge sistemin gerçek bir
> ürüne dönüşme yolunu — hedef kullanıcı, değer önermesi, entegrasyon, ölçeklenebilirlik, iş modeli ve
> yol haritası — kanıt-temelli ve abartısız anlatır.
>
> **Dürüstlük çerçevesi:** Üretim doğruluğu ölçüldü — dairesel-olmayan held-out sette `LLM_MODE=openai`
> + **DeepSeek-chat** ile sıkı macro-F1 **~0.89** (0.864/0.907), operasyonel **~0.94**, yönlendirme Top-1 **0.907**
> (n=108, 2 bağımsız set) — **reprodüke-edilebilir** artefakt (repoda `backend/eval/runs/heldout_deepseek_set*_n54_fixed.json`).
> Tam tablo: [`benchmark/llm-heldout.md`](benchmark/llm-heldout.md). Aşağıdaki ticarileşme iddiaları
> bu ölçülmüş başarıma dayanır; "tamamlandı" denilen tek şey çalışan pipeline + ölçülen skordur.

## 1. Problem ve pazar

Kamu kurumlarına günde **binlerce** evrak gelir: dilekçe, başvuru, şikâyet, tebligat, üst yazı, fatura,
dava/icra evrakı. Her biri doğru sınıflandırma, eksik-bilgi kontrolü, doğru mevzuat, doğru birime havale
ve resmî-format cevabi yazı gerektirir. Bugün bu iş büyük ölçüde **elle** yapılır:

- **Yavaş ve hata-açık:** tür karışır, eksik bilgi geç fark edilir, yanlış birime havale gecikme yaratır.
- **Yasal süre baskısı:** dilekçe 30 gün (3071), bilgi edinme 15 iş günü (4982), tebligat süre başlatır (7201) → kaçan süre = idari/hukuki risk.
- **Format zorunluluğu:** Resmî Yazışma Yönetmeliği (Yön. 2646) zorunlu bölümleri her yazıda tekrar elle uygulanır.

Türkiye'de tüm kamu kurumlarının (bakanlıklar, valilikler/kaymakamlıklar, belediyeler, üniversiteler,
SGK/vergi daireleri vb.) ortak bir ihtiyacı olması, pazarı **yatay ve büyük** kılar; aynı pipeline
kurumlar arasında yapılandırma ile yeniden kullanılır.

## 2. Hedef kullanıcı

| Segment | Kullanıcı | Acı noktası |
|---|---|---|
| **Birincil** | Kamu kurumları (bakanlık, valilik, belediye, üniversite) — **EBYS/DYS operatörleri**, evrak kayıt/havale memurları | Yüksek hacim + yasal süre + format yükü |
| İkincil | Kurumların bilgi-işlem / dijital dönüşüm birimleri | Mevcut EBYS'ye akıllı katman entegrasyonu |
| Genişleme | Düzenlemeye tabi özel sektör (bankacılık, sigorta, sağlık) — resmî yazışma yoğun birimler | Aynı sınıflandırma/havale/taslak ihtiyacı |

**Kullanıcı = karar-destek alan personel**, yerine geçen değil: her çıktıda yasal disclaimer + nihai
sorumluluk yetkili personelde (insan-döngüde tasarım).

## 3. Değer önermesi

| Boyut | Mevcut (manuel) | kamu-evrak ile | Kanıt |
|---|---|---|---|
| **İşleme süresi** | Evrak başına dakikalar (oku→sınıfla→havale→yaz) | Saniyeler içinde taslak + havale önerisi | Canlı SSE pipeline; mock modda dış-çağrısız hızlı |
| **Sınıflandırma/havale hatası** | Tür/birim karışması, geç fark edilen eksik | Held-out sıkı macro-F1 ~0.89, havale Top-1 0.907 (DeepSeek-chat, n=108) | [`benchmark/llm-heldout.md`](benchmark/llm-heldout.md) |
| **Eksik-bilgi kaçağı** | Geç fark, geri-istek döngüsü | Recall-öncelikli eksik tespiti, dur-ve-sor | scorecard recall(β=2) yüksek |
| **Format standardı** | Kişiden kişiye değişen kalite | Yön. 2646 şablon + Türkçe saflık + doğrulama; `format_uyumlu_rate=1.0` | scorecard: format, tür doğruluğu, saflık |
| **Halüsinasyon / yanlış mevzuat** | Risk, denetimsiz | verify node uydurma-veto (false-veto 0) + her çıktıda disclaimer | scorecard |
| **Veri koruması** | Ham PII serbest dolaşır | TCKN/telefon/IBAN backend'de maskelenir (buluta gitmeden) | 🛡️ PII maskeleme |

**Tek cümlelik değer:** *"Evrak işleme süresini ve havale hatasını düşüren, resmî-format standardını
garantileyen, halüsinasyona ve PII sızıntısına karşı korumalı bir karar-destek katmanı."*

## 4. Entegrasyon

Ürün **yeşil-saha değil, mevcut sisteme akıllı katman** olarak konumlanır — bu, kamuda satın alma direncini düşürür.

- **EBYS / DYS entegrasyonu:** Kurumların kullandığı Elektronik Belge Yönetim Sistemleri ile API üzerinden;
  gelen evrak → sınıflandırma + çıkarım + havale önerisi → EBYS'ye geri yazılır.
- **e-Yazışma / e-Yazışma Teknik Rehberi uyumu:** Resmî yazışma paketi (üst veri + imza zarfı) formatına
  taslak üretimi hedeflenir; SDP 2005/7 arşiv metadata ile uyumlu çıktı.
- **API-öncelikli mimari:** Çekirdek FastAPI servisi (`/process_doc`, `/process_doc/stream`, `/yazi/taslak`);
  EBYS, web arayüzü veya RPA bot'u aynı uçları çağırır. SSE streaming canlı-akış entegrasyonuna uygun.
- **Kimlik/erişim:** Kurum SSO (KEP/e-Devlet/AD) ile federasyon; rol-bazlı yetki (memur/havale-yetkilisi/yönetici).

## 5. Ölçeklenebilirlik

| Boyut | Yaklaşım |
|---|---|
| **Çok-kurum (multi-tenant)** | Taksonomi (19 tür) + birim eşlemesi (9 birim) **yapılandırılabilir**; her kurum kendi birim ağacı/iş kuralıyla aynı pipeline'ı koşar. |
| **Konuşlandırma esnekliği** | Aynı kod **bulut (SaaS)** veya **kurum-içi (on-prem, offline)** çalışır; `LLM_MODE` ile bulut/lokal/mock arası geçiş — kod değişmez. |
| **Gizlilik / KVKK** | Hassas kurumlar için on-prem + lokal LLM (Qwen GGUF) → veri kurumdan **hiç çıkmaz**; PII maskeleme bulut çağrısından önce uygulanır. |
| **Yatay yük** | Stateless FastAPI worker'lar → kurum hacmine göre ölçeklenir; OCR graf-öncesi (route) yapıldığı için graf saf-metinde test-edilebilir ve hafiftir. |
| **Lisans temizliği** | Tüm yığın **MIT** (AGPL bağımlılık yok — PyMuPDF yerine pypdfium2) → ticari/kamu konuşlandırmada hukuki engel yok. |
| **Sürdürülebilirlik** | Deterministik veri (sabit tohum) + tek-komut karne + CI regresyon kapısı → her sürümde kalite ölçülerek korunur. |

## 6. İş modeli

| Model | Açıklama | Uygun segment |
|---|---|---|
| **Kamu ihale / lisans** | Kurum başına yıllık lisans + kurulum/entegrasyon hizmeti (4734 sayılı KİK kapsamında) | Bakanlık/valilik/belediye |
| **SaaS (abonelik)** | Bulut, işlenen evrak hacmine göre kademeli abonelik | Küçük/orta kurum, hızlı başlangıç |
| **On-prem kurumsal** | Kurum-içi konuşlandırma + bakım/destek sözleşmesi (KVKK/gizlilik gereği) | Hassas-veri kurumları |
| **Açık-çekirdek (open-core)** | MIT çekirdek açık (güven + topluluk); kurumsal eklentiler (EBYS konektörleri, çok-kurum yönetimi, SLA) ticari | Hibrit benimseme |

Açık MIT çekirdek **benimsemeyi ve güveni** artırır; gelir entegrasyon, kurumsal özellikler, destek ve
SLA'dan gelir — kamu yazılımında sürdürülebilir bir desen.

## 7. Rekabet farklılaşması

- **Çok-ajan + ölçülmüş kurgu:** Tek-prompt monolit yerine dar-sorumlu ajanlar; değeri ablasyonla (McNemar p + bootstrap CI) nicelliyoruz — pazarlama değil ölçüm.
- **Dürüst, dairesel-olmayan değerlendirme:** Üretim skoru gerçek held-out'ta ölçüldü ve **repodaki artefaktla reprodüke-edilebilir** (DeepSeek-chat sıkı macro-F1 ~0.89) — "demo'da iyi görünen" değil, genelleyen sistem.
- **Anti-halüsinasyon kapısı:** verify node + uydurma-veto (false-positive 0) + her çıktıda disclaimer → kamuda kritik olan **güvenilirlik**.
- **PII koruması yerleşik:** maskeleme bulut çağrısından önce; on-prem + lokal LLM ile veri hiç çıkmaz.
- **Mod-bağımsız taşınabilirlik:** mock/bulut/lokal aynı pipeline → kurumun gizlilik/maliyet tercihine göre konuşlandırma.

## 8. Yol haritası

| Aşama | İçerik | Durum |
|---|---|---|
| **MVP (mevcut)** | Görev 1 (6/6) + Görev 2 (5/5) uçtan-uca; DeepSeek-chat held-out ~%90; backend 1319 test geçti; frontend build başarılı; taslak format kapısı kapandı | ✅ Çalışıyor + ölçüldü |
| **Pilot** | 2. bağımsız held-out ile çapraz-doğrulama; blind insan-etiketli gold; tek kurumda dar pilot | Sonraki |
| **EBYS konektörü** | Yaygın EBYS/DYS ürünleriyle API entegrasyon adaptörleri; e-Yazışma paket çıktısı | Planlı |
| **Çok-kurum** | Multi-tenant yapılandırma yönetimi; kurum-özel taksonomi/birim ağacı arayüzü | Planlı |
| **Kurumsal sertleştirme** | SSO federasyon, denetim izi (audit log), SLA, on-prem dağıtım paketi | Planlı |
| **Genişleme** | Düzenlemeye tabi özel sektör (banka/sigorta/sağlık) resmî yazışma | Vizyon |

---

> **İlgili belgeler:** dürüst skor [`benchmark/llm-heldout.md`](benchmark/llm-heldout.md) ·
> karne [`benchmark/scorecard.md`](benchmark/scorecard.md) · lisans [`07-model-lisanslari.md`](07-model-lisanslari.md) ·
> mimari [`03-mimari.md`](03-mimari.md) · sunum [`sunum-final.md`](sunum-final.md).
