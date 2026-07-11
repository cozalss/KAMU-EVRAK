# Veri Kartı (Data Card) — Sentetik Kamu-Evrak Veri Seti

> TEKNOFEST TYDA 1. Senaryo. Bu kart şartname §6.5 (**gerçek kamu verisi YASAK**),
> §7 (lisans/teslim) ve §13.1 (etik/fairness) gereği veri kökeni, üretim yöntemi,
> sahte-PII güvenliği, gold set boyutları, lisans ve kullanım haklarını beyan eder.
> Üretici kod: `scripts/gen_synthetic.py`. Plan: `docs/05-sentetik-veri-plani.md`.
> Mevzuat korpusu kartı: `data/mevzuat/README.md`.

## 1. Özet

| Alan | Değer |
|---|---|
| Veri türü | **%100 sentetik/kurgu** kamu evrakı + altın (gold) etiketler |
| Gerçek kişi/kurum verisi | **YOK** (CLAUDE.md §2; şartname §6.5) |
| PII | **yalnız sahte** (Faker tarzı sabit havuz + checksum-geçerli sahte TCKN) |
| Taksonomi | `agents/config.py` tek-kaynak (18 üretilen tür + `belirsiz` abstention) |
| Üretim | şablon-tabanlı + zorluk stratifikasyonu + eksik-alan enjeksiyonu |
| Determinizm | sabit tohum (seed=20260625) → aynı tohum = aynı veri |
| Lisans | üretici kod ve üretilen veri **MIT** (repo lisansı) |
| Mevzuat korpusu | kamuya açık mevzuat metni (mevzuat.gov.tr), ayrı kart |

## 2. Üretim yöntemi (`scripts/gen_synthetic.py`)

1. **Tek-kaynak taksonomi:** türler/birimler/zorunlu alanlar/eşlemeler doğrudan
   `agents.config`'ten import edilir (`EVRAK_TURLERI`, `BIRIMLER`, `EVRAK_TO_BIRIM`,
   `ZORUNLU_ALANLAR`, `EVRAK_TO_YAZI`, `EVRAK_TO_MEVZUAT`). Modülün eski "kendi
   uydurma taksonomisi" kaldırılmıştır → gold gerçek pipeline türleriyle etiketlenir.
2. **Şablon doldurma:** tür × zorluk için gövde cümlesi (`_GOVDE`) + türe-özel konu
   havuzu (`_KONULAR`) ile resmî evrak metni render edilir (T.C. başlığı + alan
   blokları + standart kapanış). Alan etiketleri (`Tarih:`, `Konu:`, `Adres:`,
   `T.C. Kimlik No:`) `cikar` node'unun regex/anahtar-sözcük görünürlüğü ile uyumludur.
3. **Sahte PII enjeksiyonu** (bkz. §3).
4. **Zorluk stratifikasyonu** (`ZORLUK = kolay/orta/zor`, idx % 3 ile döngüsel):
   - **kolay:** belirgin tür-imzası (anahtar sözcük), 0-1 eksik alan.
   - **orta:** orta belirginlik, 1 eksik alan.
   - **zor:** örtük ifade (heuristik fallback kaçırabilir → gerçekçi düşük skor /
     abstention sinyali), 1-2 eksik alan.
5. **Eksik-alan enjeksiyonu** (`_inject_missing`): silinebilir alanlardan
   (`tarih`, `tckn_veya_kurum`, `iletisim_adres`, `imza`) zorluk'a göre çıkarılır;
   `konu`/`talep` asla silinmez (sınıflandırma çökmesin). Resmî-yazı türlerinde
   daraltılmış zorunlu küme (`konu`/`tarih`/`imza`) — `eksik_tespit_node` ile birebir.
6. **Ground-truth etiket** (`_ground_truth_present`): metinde **objektif** bulunan
   alanlar; gold = insan-doğrulanabilir gerçek. NOT: mock pipeline (LLM yok) gönderen
   adını regex ile çıkaramaz → gold'da mevcut olsa bile mock eksik işaretler; bu, mock
   taban için **dürüst recall açığıdır** (gerçek-LLM modunda kapanır). Eval bunu olduğu
   gibi raporlar — tavan 1.0'a sahte sabitlenmez.

> **LLM parafraz (opsiyonel, plan):** Qwen/gpt-4o ile doğal "gelen evrak" varyantları
> üretilebilir (docs/05 §4). Şablon tabanı determinizm ve denetlenebilirlik için
> esastır; parafraz çeşitlilik içindir ve sahte-PII kuralını bozmaz.

## 3. Sahte PII üretimi (CLAUDE.md §2 — gerçek PII ASLA)

| Alan | Üretim | Güvence |
|---|---|---|
| **TCKN** | `fake_tckn`: 11 hane, ilk hane ≠ 0; d10/d11 checksum kuralına uygun | **Checksum-geçerli ama rastgele** → format-doğru, gerçek vatandaşa ait DEĞİL |
| Telefon | `fake_phone`: `05XX XXX XX XX`, rastgele blok | gerçek operatör bloğu değil |
| Ad-soyad | `fake_name`: sabit ad/soyad havuzundan | kurgu (örn. `Ayşe Yılmaz`) |
| Adres | `fake_address`: mahalle/sokak/no/il kombinasyonu | kurgu |
| Tarih / evrak no | `fake_date` / `fake_evrak_no` | kurgu, 2026 |

**TCKN gerekçesi:** checksum-geçerli üretmek, `cikar` node'unun TCKN doğrulama/maskeleme
yolunu gerçekçi test eder; rastgele üretildiği için gerçek kimlikle çakışmaz. Pipeline'da
çıkarılan TCKN/telefon ayrıca **maskelenir** (`tckn_maskeli`) — sahte veri + maskeleme
çift güvence sağlar.

## 4. Gold (altın) setleri — `data/synthetic/`

Hedef boyutlar (docs/05; Wilson %95 CI anlamlı daralacak şekilde). `--per-type N`
ile ölçeklenir; 18 tür × N örnek. Her set gerçek `config` tür/birim key'leriyle etiketlidir.

| Dosya | Hedef boyut | Alanlar | Ölçtüğü görev |
|---|---|---|---|
| `evrak_class_gold.jsonl` | ≥ 180 (tür-başı 8-10) | `metin`, `evrak_turu`, `zorluk`, `mevcut/eksik_alanlar`, `anahtar_unsurlar`, beklenen birim/mevzuat/yazı | Görev 1 sınıflandırma (+ özet/eksik-alan) |
| `routing_gold.jsonl` | ≥ 150 | `metin`, `evrak_turu`, `beklenen_birim` | Görev 2 birim yönlendirme |
| `ozet_gold.jsonl` | ≥ 60 | `metin`, `anahtar_unsurlar` | Görev 1 özet (key-fact recall) |
| `yazi_taslak_gold.jsonl` | ≥ 60 | `metin`, `beklenen_yazi_turu` | Görev 2 taslak türü/format |
| `eksik_bilgi_gold.jsonl` | ≥ 100 | `metin`, `zorunlu_alanlar`, `eksik_alanlar` | eksik-bilgi tespiti (set-P/R/F-beta) |
| `e2e_scenarios.jsonl` | ≥ 30 | uçtan-uca (her iki görev zinciri) | Görev 1 → Görev 2 |

**Stratifikasyon raporu:** üretici, çalıştırmada zorluk dağılımını (kolay/orta/zor) ve
eksik-alanlı evrak sayısını yazdırır → veri çeşitliliği şeffaf (şartname: çeşitlilik artı puan).

**Blind etiketleme (etik §13.1):** gold etiketleri tahmin sisteminden **bağımsız**
kişi(ler)ce doğrulanmalı; taksonomi resmî kaynağa dayalı (docs/02), kendi-uydurma değil
→ kapalı-küme F1 manipülasyon algısı önlenir.

## 5. Mevzuat korpusu (`data/mevzuat/`) — ayrı, kamuya açık

Sentetik evraktan ayrı; **kamuya açık mevzuat metni** (mevzuat.gov.tr): **233 mevzuat**
(kanun + yönetmelik + CBK); çekirdek Resmî Yazışma Yön. 2646, Dilekçe 3071, Bilgi Edinme
4982, Tebligat 7201, SDP 2005/7, 657 DMK, 4734 Kamu İhale, 2577 İYUK, 5018 Kamu Mali
Yönetimi + çok-alanlı genişletme (vergi, belediye, çevre, sosyal güvenlik, ceza...). Madde-başlıklı özet
(lafzî tam metin değil); madde no'lar çapraz doğrulanır, şüpheli → `[DOĞRULA:]`. Mahkeme
kararları YALNIZ mevzuat-eşleştirme referansı; **eğitim/demo evrakı değil**. Kart:
`data/mevzuat/README.md`. Seed: `scripts/seed_mevzuat.py` → **233 mevzuat / 1508 madde-chunk**.

## 6. Lisans ve kullanım hakları beyanı (şartname §6.5, §7)

- **Üretici kod (`gen_synthetic.py`, `seed_mevzuat.py`) ve üretilen sentetik veri:**
  **MIT** (repo lisansı, `LICENSE`). Serbestçe çoğaltılır/değiştirilir.
- **Mevzuat korpusu:** kamuya açık resmî mevzuat metni (mevzuat.gov.tr / Resmî Gazete);
  erişimi kamuya serbesttir. Korpus, özet/alıntı biçiminde ve kaynak linkiyle tutulur.
- **Üçüncü-taraf model ağırlıkları:** depoya **yüklenmez** → yalnız erişim linki +
  sürüm + lisans (`docs/07-model-lisanslari.md`).
- **Demo veri kaynağı (§7):** demoda gösterilen tüm evraklar **bu sentetik veri
  setinden** veya jüri/sunum anında girilen **kurgu** örneklerden gelir. **Gerçek kamu
  evrakı, gerçek kişi/kurum verisi kullanılmaz.** Kullanım hakkı: sentetik veri ekibe
  ait MIT lisanslı; kullanımda kısıt yoktur.

## 7. Bilinen sınırlar (dürüstlük)

- **Şablon kökenli stil tekrarı:** saf şablon metni gerçek evrak çeşitliliğinin
  altındadır → opsiyonel LLM parafraz ile çeşitlendirilir; eval bunu mock-taban olarak
  raporlar.
- **Mock recall açığı:** LLM-yapısal alanlar (gönderen ad-soyad) mock modda tespit
  edilemez; bu, kasıtlı değil tabanın gerçek sınırıdır (gerçek-LLM modunda kapanır).
- **Gold blind-doğrulama gerekir:** otomatik üretilen etiketler bağımsız kişi onayından
  geçirilmelidir (etik §13.1) — bu kart üretimi tarif eder, blind onay ayrı adımdır.
