# kamu-evrak — Sinematik Ürün/Landing Promptu

> **Hedef:** TEKNOFEST 2026 jürisinin ve kamu BT geliştiricisinin ekrana bakıp "wow, bu gerçek bir sistem" dediği bir tanıtım/landing sayfası. Aşağıdaki prompt, mevcut sistemimize **birebir sadık** (uydurma özellik yok): 22-node LangGraph pipeline, neon-dark dashboard, SSE canlı ajan akışı, ~200 mevzuat RAG, SHA-256 denetim izi, KVKK PII maskeleme, HITL memur onayı. Spectra şablonunun yapısını aynalar; içeriği kamu-evrak domainine çevirir.

---

## 1. Ürün Adı + Çarpıcı Slogan

**Ürün adı:** `kamu-evrak`

**Birincil slogan:**
> **"Yığından imzaya. Saniyeler içinde."**

**Alt slogan (eyebrow, IBM Plex Mono):**
> `KAMU EVRAK & YAZIŞMA İÇİN YAPAY ZEKA AJAN SİSTEMİ · TEKNOFEST 2026 · S1`

**Destek cümlesi (hero alt metni):**
> Gelen evrakı okur, sınıflandırır, mevzuatı bulur, resmî yazıyı yazar — memuru karar koltuğunda tutarak. Her adım denetlenebilir, her veri maskeli, her madde doğrulanmış.

---

## 2. HERO — Sinematik Video Konsepti

**Sahne yönü:** Tek kesintisiz match-cut zinciri, ~8 saniye, sesle senkron. Kamera yavaş, kararlı, "sistem nefes alıyor" hissi. Zemin `#121829`.

**Plan plan akış (match-cut):**

1. **AÇILIŞ (0.0–1.5s):** Loş bir devlet bürosu masası. Üst üste yığılmış sararmış kâğıt evrak destesi — köşeleri kıvrık, kaşeli, elle yazılı. Tek bir masa lambası. Sessizlik. *(Gerçeklik vurgusu: kamunun bugünkü hali.)*

2. **MATCH-CUT 1 — Tek dilekçe (1.5–3.0s):** Yığının tepesinden **tek bir dilekçe** kameraya doğru kalkar, dikleşir, ekranı kaplar. Üzerinde okunabilir başlık: *"…valiliğine — Konu: Su faturası itirazı"*. Gönderen satırında TCKN görünür: `12345678901`.

3. **MATCH-CUT 2 — Veri-noktalarına ayrışma (3.0–4.8s):** Kâğıdın üzerindeki harfler **ışıyan teal `#2ee6c9` veri-noktalarına** ayrışır — sözcükler boşlukta yüzen düğümlere dönüşür. TCKN anında **maskelenir**: `123****8901` → kırmızımsı bir flaş + mor `#b794ff` "KVKK" mührü belirir. *(PII koruması görsel olarak kanıtlanır.)*

4. **MATCH-CUT 3 — Ajan grafiği (4.8–6.5s):** Veri-noktaları kendi aralarında çizgilerle bağlanır ve **canlı ajan-akış grafiğine** dönüşür: soldan sağa node zinciri yanmaya başlar — `oku → siniflandir → cikar → mevzuat_oner → risk_guard → yazi_taslak`. Her node yandığında altından bir neon-tarama çizgisi (`nu-scanv`) geçer. Bir kenarda mevzuat maddeleri parlar: *"3071 s.K. m.4"*, *"4982 s.K. m.11"*.

5. **FİNAL VURUŞ (6.5–8.0s):** Grafiğin sonundaki son node patlar → boş bir **resmî yazı sayfası** (T.C. antetli) belirir ve kendini doldurur. Sağ altta yeşil bant `#34d399` "🟢 YEŞİL — otomatik geç" yanıp söner. Ardından **"Onayla & Gönder"** butonu pulse'lar (`nu-breathe`). Buton basılır → e-imza mührü + karekod patlamayla yerine oturur.

**Hero overlay (video üzerine, sayfa yüklendiğinde `nu-rise`):**
- Dev başlık (Space Grotesk, `clamp` ile büyük): **"Yığından imzaya. Saniyeler içinde."**
- Altında iki buton: **`▶ Canlı demoyu izle`** (primary, teal gradient `linear-gradient(135deg,#2ee6c9,#1ea7d6)`) ve **`Sistemi keşfet`** (ghost).
- Sağ altta küçük mono rozet: `22 AJAN · 16 AKTIF · ~200 MEVZUAT · SHA-256 DENETİM`

---

## 3. MONTAJ — 16-Ajan Pipeline Hızlı Kesme

**Sahne yönü:** Hero'dan sonra dikey scroll-tetikli montaj. Her ajan **kendi mikro-anlatımı** (≈1.8s), aralarda **neon-tarama-çizgisi geçişi** (yatay `#2ee6c9` çizgi ekranı süpürür, `nu-scanv`). Her kart sol-üstte mono node-adı + sağda durum noktası (`nu-dotpulse`).

| # | Node | Mikro-anlatım (ekranda görünen) | Görsel vuruş |
|---|------|----------------------------------|--------------|
| 1 | `oku` | Bulanık tarama → keskin metin | OCR tarama çizgisi yukarıdan aşağı |
| 2 | `siniflandir` | "dilekce · güven 0.92" rozeti oturur | 18 tür çarkı durur, biri yanar |
| 3 | `cikar` | Gönderen/tarih/konu alanları dolar | TCKN `123****8901` maskeli belirir |
| 4 | `kanit_baglama` | Metinde sarı highlight span'lar | "burada buldum" oku işaret eder |
| 5 | `eksik_tespit` | 3071 m.4 checklist ✓✓✓ | Eksikse kırmızı uyarı yanar |
| 6 | `mevzuat_oner` | "3071 m.4 · 4982 m.11" kartları | RAG ışını korpustan madde çeker |
| 7 | `ozetle` | 2 satır özet yazılır (typewriter) | Mono metin akar |
| 8 | `route_birim` | "→ Basın/Halkla İlişkiler-CİMER" | Birim rozeti sola kayar |
| 9 | `yazi_taslak` | Boş T.C. antet → gövde dolar | Jinja2 şablon satır satır yazılır |
| 10 | `verify` | "Uydurma yok · format tam" ✓ | Kaynak-token eşleşmesi yeşil çakar |
| 11 | `risk_guard` | 🟢/🟡/🔴 trafik ışığı bandı | Üç nokta — biri parlar |
| 12 | `onay_kapisi` | "Memur onayı bekleniyor" (HITL) | Akış DURUR, kart titrer |
| 13 | `arsiv` | SDP kodu + saklama süresi | Klasör mührü vurulur |
| 14 | `sla_triyaj` | "Son tarih: 30 gün · NORMAL" | Takvim sayacı döner |
| 15 | `denetim_izi` | SHA-256 zincir halkaları kenetlenir | Hash blokları birbirine kilitlenir |
| 16 | `finalize` | ProcessResponse paketi mühürlenir | Tüm kartlar tek pakete toplanır |

**Geçiş kuralı:** Her ajan arası neon-tarama çizgisi + `prefers-reduced-motion` aktifse tüm montaj statik kart-grid'e düşer (a11y).

---

## 4. DUYGUSAL AN — Gece Yarısı Memuru

**Sahne yönü:** Tempo düşer. Sıcak ama yalnız bir kare. Bu bölüm ürünün *neden* var olduğunu anlatır.

- **Görüntü:** Gece 02:47. Boş ofis. Tek bir memur (silüet), ekranında **canlı ajan akışı** (SSE) gerçek zamanlı akıyor — node'lar sırayla yanıyor, sayaç `mm:ss` ilerliyor. Masada hâlâ küçük bir evrak yığını ama artık çok daha küçük.
- **Metin overlay (sola hizalı, büyük):**
  > *"Eskiden bu yığın sabahı bulurdu."*
  > *"Şimdi ajanlar okuyor, mevzuatı buluyor, yazıyı yazıyor."*
  > **"Karar hâlâ memurun."**
- **Kilit an — "Onayla & Gönder":** Ekranda bir **risk bandı 🟡 SARI** belirir ("orta risk — inceleme önerilir"). Memur taslağı okur, **`Onayla & Gönder`** butonuna basar (`nu-breathe` → `nu-pop`). 
- **Mühür anı:** Buton basılır basılmaz **denetim izi mührü** ekranın altında SHA-256 halkasıyla kenetlenir — `butunluk: ✓`. Mor `#b794ff` bir dalga (`nu-ring`) dışa açılır. *İnsan onayladı, sistem değiştirilemez şekilde kaydetti.*

**Bu bölümün mesajı:** kamu-evrak insanı *yerine* koymaz, *yanına* koyar. (HITL = jürinin "sorumlu AI" puanı.)

---

## 5. FİNAL — E-İmza & Mühür

**Sahne yönü:** Kapanış. Tek odak. Sayfa sonu CTA bölümü.

- **Görüntü:** Ekranın ortasında **boş bir resmî yazı sayfası** (T.C. antetli, `ust_yazi.j2` formatı). Yukarıdan aşağı kendini doldurur: Sayı, Konu, Muhatap, Gövde, kapanış.
- **Kapanış cümlesi yazılır (typewriter, Space Grotesk):**
  > **"Gereğini arz ederim."**
- **E-imza mührü oturur:** Sayfanın altında **"Bu belge, güvenli elektronik imza ile imzalanmıştır"** dipnotu belirir (Yön. 2646 m.23 uyumlu, `eimza_blogu` makrosu). Yanında **karekod** parça parça çizilir (`nu-pop`).
- **Son flaş:** Karekod tamamlanınca tüm sayfa mühürlenir, kenarları teal `#2ee6c9` ışıkla çerçevelenir.
- **Final CTA:**
  - Dev başlık: **"Evrakınız hazır. Sıra sizde."**
  - Buton: **`▶ Demoyu başlat`** (primary teal gradient) · **`GitHub'da incele`** (ghost, MIT açık-kaynak rozeti yanında)
  - Alt mono satır: `MIT LİSANS · SENTETİK VERİ · KAMUYA AÇIK MEVZUAT · §6.5 UYUMLU`

---

## 6. RENK + FONT — Neon-Dark Palet (Gerçek Tokenlar)

> **Tek kaynak:** `frontend/src/components/neonUi.jsx`. Hex elle yazılmaz; token kullanılır. Aşağıdaki değerler koddan **birebir** alınmıştır.

**Palet (named + hex):**

| Rol | Token | Hex | Kullanım |
|-----|-------|-----|----------|
| Birincil aksan — Teal | `T` | `#2ee6c9` | Ana aksiyon, focus, aktif node |
| İkincil aksan — Mor | `V` | `#b794ff` | KVKK/mühür, avatar, ikincil vurgu |
| Zemin | `PAL.bg` | `#121829` | Çalışma alanı |
| Derin zemin | `PAL.bg2` | `#0f1626` | Sidebar, focus ring tabanı |
| Metin (başlık) | `PAL.ink` | `#eaf0fb` | Yüksek kontrast (~13.5:1) |
| Metin (gövde) | `PAL.ink2` | `#dfe5f2` | Standart metin |
| Soluk metin | `PAL.mut` | `#9aa6c0` | İkincil etiket |
| **Risk · YEŞİL** | `BANT.yesil` | `#34d399` | Düşük risk — otomatik geç |
| **Risk · SARI** | `BANT.sari` | `#fbbf24` | Orta risk — inceleme önerilir |
| **Risk · KIRMIZI** | `BANT.kirmizi` | `#f87171` | Yüksek risk — onay zorunlu |

**Gradyanlar/ışımalar:**
- Birincil buton: `linear-gradient(135deg,#2ee6c9,#1ea7d6)` + glow `0 8px 22px -10px`
- Avatar: `linear-gradient(135deg,#b794ff,#7c5ce0)`
- Focus ring (çift katman): `0 0 0 2px #0f1626, 0 0 0 4px #2ee6c9`
- Cam yüzey: `rgba(255,255,255,.025)` + `backdrop-filter: blur(10px)`

**Font (Google Fonts, `index.html`):**
- **Başlık/UI:** `Space Grotesk` (`SANS`), 400–700
- **Veri/etiket/mono:** `IBM Plex Mono` (`MONO`), 400–600 — eyebrow, KV satırları, node adları, rozetler
- `font-display: swap` (blocking yok)

**Hareket dili (gerçek `NEON_KEYFRAMES`):** `nu-dotpulse` (canlı nokta), `nu-scanv` (tarama çizgisi/geçiş), `nu-rise` (içerik girişi), `nu-breathe` (CTA nefesi), `nu-pop` (mühür oturuşu), `nu-ring` (onay dalgası). `prefers-reduced-motion` → tümü kapanır.

---

## 7. AUTH + DB — Profiller ve Veri Modeli

> Landing'in "Sistem mimarisi" bölümü. Rol-tabanlı erişim + denetlenebilir kayıt.

**Profiller (3 rol):**

| Rol | Yetki | Görür |
|-----|-------|-------|
| **Memur** | Evrak işler, taslak üretir, kendi kuyruğunu yönetir | Gelen/Giden/Taslaklar/İşleniyor |
| **Yetkili (Onaylayan)** | HITL onay kapısı — Onayla / Düzenle / Reddet | + Onay kuyruğu, risk bandı kararları |
| **Yönetici** | Tüm birimler, denetim izi denetimi, mevzuat korpus yönetimi | + Denetim İzi, Mevzuat, tüm panel |

**Veri varlıkları (DB tabloları):**
- **profiller** — rol, birim, e-imza yetkisi
- **gelen_evrak** — OCR metni, evrak_turu, çıkarılan unsurlar (PII **maskeli** saklanır), risk bandı
- **giden_evrak** — taslak, onay_durumu (`gonderildi`/`duzenlendi`/`reddedildi`), ID `E-G-YYYY/0001`
- **taslaklar** — yazı metni + PDF/DOCX, format_uyumlu bayrağı
- **denetim_izi** — SHA-256 hash-chain (adım/veri/hash/önceki), `kok_hash`, `butunluk`
- **mevzuat_korpus** — ~200 mevzuat, madde-bazlı chunk, BM25 indeks (Qdrant opsiyonel)

**Güvenlik notu (landing'de görünür):** Her giden evrak hash-zincire mühürlenir → Sayıştay/KVKK denetlenebilir. PII çıkış sınırında maskeli. Sentetik veri + kamuya açık mevzuat (§6.5).

---

## 8. 5 NUMARALI ÖZELLİK — Gerçek kamu-evrak Yetenekleri

> Spectra'nın "5 numbered features" yapısı. Her özellik **mevcut sistemde çalışır** (uydurma yok).

### Özellik 1 — Görev 1: Anlama Pipeline'ı (Gelen Evrak Analizi)
OCR ile okur → **18 evrak türü + belirsiz** sınıflandırır (LLM JSON + keyword fallback) → bilgi unsurlarını çıkarır → **kanıt bağlama** ile her unsuru kaynak metinde sarı span olarak gösterir → 3071 m.4 uyumuyla eksikleri tespit eder → mevzuat önerir → özetler. *Belirsizlikte "belirsiz" der (manipülasyon koruması), uydurmaz.*

### Özellik 2 — Görev 2: Resmî Yazı Üretimi + HITL Onay
6 şablon türü (`ust_yazi` / `cevabi_yazi` / `bilgilendirme` / `olur` / `muzekkere` / `gorus_mutalaa`, Jinja2, **Yön. 2646 uyumlu**) → resmî üslupla gövde → **verify** anti-halüsinasyon (kaynakta olmayan tarih/sayı → 🔴) → **risk_guard** trafik ışığı → **onay_kapisi (HITL)**: LangGraph `interrupt()` ile akış durur, memur **Onayla / Düzenle / Reddet**. PDF + DOCX + Markdown çıktı.

### Özellik 3 — Mevzuat-RAG (~200 Mevzuat Korpusu)
Madde-bazlı tokenize ~200 mevzuat (Yön. 2646, 3071, 4982, 7201, 6698 KVKK, 5070 e-imza, Sayıştay 6085, SDP 2005/7 …), BM25 birincil retrieval (Qdrant vektör opsiyonel). Her öneri **kaynak link + güven skoru** taşır. **CRAG** (sorgu genişletme ile düşük-güvenli düzeltme) ve **NLI atıf** (madde ⊨ talep entailment) ENV-gated. *Madde no şüpheliyse `[DOĞRULA: …]` bırakır — uydurmaz.*

### Özellik 4 — Denetim İzi + Filtreleme (Tamper-Evident)
13-adımlı **SHA-256 hash-chain**: `hash = SHA256(önceki + kanonik_JSON(karar))`, genesis 0×64. Sonradan bir adım değişirse zincir kırılır → `butunluk=False`, hangi adımın bozulduğu tespit edilir. **Sayıştay denetimi + KVKK işleme kaydı** için değiştirilemez. Gelen/Giden/Taslak kuyrukları filtrelenir; çift işleme/gönderme `processedIds`/`sentRef` ile önlenir.

### Özellik 5 — Gelen/Giden Evrak + Risk Bandı + KVKK Maskeleme
Canlı **SSE akışı** (`/process_doc/stream`): node-by-node animasyon, `mm:ss` zamanlama. **Risk bandı** 🟢🟡🔴 → yeşil otomatik geçer, sarı/kırmızı memur onayına gider. **SLA triyaj** yasal süreyi hesaplar (dilekçe 30 gün / bilgi edinme 15 iş günü) → GECİKMİŞ/KRİTİK/NORMAL rozeti. **KVKK maskeleme** TCKN/telefon/IBAN'ı çıkış sınırında maskeler (`123****8901`); kanıt span'ları bile maskeli metin üzerinde hesaplanır.

---

## 9. TASARIM — Neon-Dark Spesifikasyon

**Görsel kimlik:** AI-native komuta merkezi — teknik, gerçek-zamanlı, kendinden emin. Derin lacivert substrat (`#121829`), sidebar daha derin (`#0f1626`). Neon teal birincil, mor ikincil, risk renkleri yalnız risk için. Glassmorphism (saydam cam yüzey + blur), radial köşe ışımaları, butonlarda neon glow.

**Kabuk yapısı (`DashboardApp.jsx` aynalanır):**
- Sol: **NeonSidebar** (228px, sticky) — logo (gradyan), nav (Panel / Gelen / Giden / İşleniyor / Taslaklar / Mevzuat / Denetim İzi) + badge sayaçları + "Yeni evrak yükle" (dashed) + "Örnek evrakla dene" (dropdown) + memur avatarı.
- Sağ: aktif görünüm — `ViewWrap` (h2 + alt başlık + sağ aksiyon + scroll içerik).

**Atomlar (`neonUi.jsx`):** `ViewWrap`, `NeonCard` (14px radius, 2px teal üst-border, hover -3px kalkış, radial köşe glow), `KV` (mono, dashed ayraç), `Btn` (primary gradient / ghost), `EmptyState`, `Icon` (stroke SVG seti — emoji yok), `InfoTip` (erişilebilir tooltip), `RiskBand` (3-nokta glow + etiket + tooltip).

**Tipografi ölçeği:** Sayfa başlığı 21px/600 SANS · kart eyebrow 10.5px/600 MONO uppercase · buton 12.5px/600 SANS · KV 11.5px MONO · rozet 10px MONO.

**Şekil/boşluk:** Kart radius 14px (pad 16/18) · buton 10px · ikon çip 64px→18px radius · sidebar pad 18/14, nav gap 3px · ViewWrap pad 26/32/48.

**a11y (zorunlu):** Her tıklanabilirde `focusRing` (çift katman teal) + `cursor:pointer`; renk **tek sinyal değil** (ikon + metin + etiket — özellikle risk bandında); `SR_ONLY` ile ekran okuyucu; semantik HTML (`section[aria-labelledby]`, `nav`, `button`, `role=tooltip/status`); `prefers-reduced-motion` tüm hareketi kapatır; koyu zeminde AA kontrast (ink ≈ 13.5:1).

**Responsive:** 375 / 768 / 1024 / 1440 — yatay taşma yok, sidebar daralır/drawer'a düşer, içerik reflow.

**Yasaklar:** Açık/beyaz yüzey neon kabukta · elle hex (token kullan) · emoji ikon · görünmez focus · renk-tek-sinyal · layout-kaydıran hover (yalnız transform/opacity) · `prefers-reduced-motion` yok sayma.

---

## Teslim Notu (jüri/geliştirici için)

Bu landing **gerçek sistemi** anlatır: 22-node LangGraph topolojisi (16 aktif baseline + 6 ENV-gated), FastAPI SSE streaming, React/neon dashboard, ~200 mevzuat BM25 RAG, SHA-256 denetim izi, KVKK maskeleme, HITL memur onayı, Yön. 2646 uyumlu 6 resmî yazı şablonu. **Her sahne demoda canlı gösterilebilir** — sinematik abartı değil, çalışan pipeline'ın görselleştirmesi. Demo avantajı (real-time SSE) + sorumlu AI (HITL + denetim izi + PII maskeleme) jüri puanlamasının "Demo 15" ve "Yenilikçilik 15" kalemlerini doğrudan hedefler.
