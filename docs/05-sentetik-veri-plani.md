# 05 — Sentetik Veri Seti Planı

> Şartname §6.5: **gerçek kamu verisi YASAK** → sentetik/kurgu evrak + kamuya açık mevzuat.
> CLAUDE.md: **sahte PII zorunlu.** Lisans-temiz reçete (hepsi MIT/Apache).

## Üretim reçetesi (`scripts/gen_synthetic.py`)

1. Tür başına **2–4 jinja2 iskelet şablonu** (taksonomi §02 zorunlu unsurlarından).
2. **Faker `tr_TR`** ile alan doldurma: isim/adres/kurum + **checksum-geçerli SAHTE TCKN**
   (gerçek kimliklerle çakışmaz) + sahte telefon (`0555-...`).
3. Varyasyon: ton / uzunluk / **eksik-alan** (eksik-tespit gold için) / **OCR-gürültü**.
4. LLM parafraz (Qwen Apache / gpt-4o-mini) → doğal "gelen evrak" varyantları.
5. **Stratifikasyon:** tür × zorluk (kolay = tam-alanlı dijital · orta = bazı eksik · zor =
   el-yazısı/OCR-gürültülü + üslup-bozuk).
6. **Train/dev/test ayrımı** (prompt/eşik dev'de ayarlanır, test final değerlendirme).

## Gold set boyutları (Wilson %95 CI anlamlı daralsın)

| Dosya (`data/synthetic/`) | Boyut | Alanlar |
|---|---|---|
| `evrak_class_gold.jsonl` | ≥ **180** (tür-başı 8-10) | `text`, `gold_tur` |
| `routing_gold.jsonl` | ≥ **150** | `text`, `gold_birim`, `kabul_edilebilir_birimler[]` |
| `ozet_gold.jsonl` | ≥ **60** | `text`, `ref_ozet`, `kilit_unsurlar[]` |
| `yazi_taslak_gold.jsonl` | ≥ **60** | `girdi_evrak`, `yazi_turu`, `zorunlu_alanlar[]` |
| `eksik_bilgi_gold.jsonl` | ≥ **100** | `text`, `gold_eksik_alanlar[]`, `expected: clarify\|proceed` |
| `e2e_scenarios.jsonl` | ≥ **30** | uçtan-uca Görev1→Görev2 zinciri |

## Mevzuat korpusu (`data/mevzuat/`) — kamuya açık, izinli

Yön. 2646, Dilekçe 3071, Bilgi Edinme 4982, Tebligat 7201, SDP 2005/7 → mevzuat.gov.tr metni
madde-bazlı chunk'lanıp indekslenir (`scripts/seed_mevzuat.py`; BM25 varsayılan, Qdrant opsiyonel).
Mahkeme kararları YALNIZ
mevzuat-eşleştirme referansı; **eğitim/demo evrakı olarak değil**.

## PII güvenliği

- Üretilen PII **sahte** (Faker + checksum-sahte-TCKN). Sabit örnekler: `Ayşe Yılmaz`,
  `0555-123-4567`.
- Pipeline'da çıkarılan PII **maskelenir** (`cikar` node: `tckn_maskeli`/`telefon_maskeli`).
- Gerçek kişi verisi ASLA (CLAUDE.md §2).

## Blind etiketleme (etik §13.1)

Gold etiketleri **tahmin sisteminden bağımsız** kişi(ler)ce konur (kapalı-küme manipülasyon
algısını önle). Taksonomi resmî kaynağa dayalı (§02), kendi-uydurma değil.
