# kamu-evrak — AI Asistan Bağlam Dosyası

> **Kamu Evrak ve Yazışma Süreçleri için Akıllı Agent Destek Sistemi** — canlıya çıkan
> bağımsız ürün (herhangi bir yarışmayla ilgisi yoktur; metinlerde yarışma adı geçmez). Bu depo ADALET-AGENT'tan kod kopyalanarak
> kuruldu; **ADALET-AGENT ayrı bir projedir, oraya dokunulmaz.**

## Klasörler

| Klasör | Dil | Çalıştır |
|--------|-----|----------|
| `frontend/` | JS (Vite + React) | `npm install` → `npm run dev` |
| `backend/` | Python 3.11 (FastAPI + LangGraph) | `uv run main.py` (reload + LAN varsayılan — mobil QR sözleşmesi) |
| `backend/agents/` | Pipeline node'ları (Görev 1+2) | — |
| `backend/multimodal/` | OCR (PDF/görsel/Word) — KEEP | — |
| `backend/retrieval/` | Mevzuat RAG (KEEP, opsiyonel) | — |
| `backend/yazi/` | Resmî yazı taslak render (dilekçe'den ADAPT) | — |
| `backend/core/` | Sicil, kurum kimliği, **canlı kaynak keşfi** (`docs/14`) | — |
| `data/` | Sentetik evrak + şablon + mevzuat | — |
| `docs/` | Araştırma + plan | — |

## Asla Yapma

1. **Hukuki/mevzuat referansı uydurma.** Madde no şüpheliyse `[DOĞRULA: ...]` bırak;
   üretimden önce mevzuat.gov.tr'de doğrula.
2. **Gerçek kamu verisi / gerçek PII (TCKN/telefon/isim) kullanma.** Şartname §6.5: yalnız
   sentetik/kurgu evrak + kamuya açık mevzuat. Sahte: `Ayşe Yılmaz`, `0555-123-4567`,
   checksum-geçerli SAHTE TCKN.
3. **Hardcoded secret.** `.env` kullan (`.gitignore`'da). Model **ağırlıklarını repoya yükleme**
   (şartname §7: link+sürüm+lisans yeterli).
4. **AGPL bağımlılık ekleme** (PyMuPDF gibi) — MIT açık-kaynak repo iddiasını bozar. PDF için
   pypdfium2 (Apache/BSD).
5. **Canlı bulunan kaynağı "doğrulanmış" sayma.** `dogrulanmis=False` sözleşmesi dört yerde
   kilitli (`uclu_grounding` · `route_ajan` çıktısı · `CanliKaynak.kunye()` · frontend
   `canliKaynakYorum`). Bu yoldan otomatik havale ASLA üretilmez. Bkz. `docs/14`.
6. **TLS doğrulamasını kapatma** (`verify=False`) ve izinli alan listesini gevşetme. Dış
   ağa yalnız `sayfa_kesif` çıkar; yönlendirmenin HER sıçraması ayrı sınanır.
7. **Risk skorunu yüzde ile sunma.** `risk_metadata.skor` beklenen zarardır
   (`Σ⊕ ciddiyet × isabet`), olasılık DEĞİL — "%87 ihtimalle kusurlu" diye okunamaz. Birimsiz
   puandır (`0,87 / 1`). Yüzde gösterilebilen tek alan `kusur_olasiligi`'dır (`Σ⊕ isabet`).
   Tek biçimlendirme kaynağı `detayYorum.riskOlcuEtiketi`; elle `%${skor*100}` yazma.
8. **Adım eşzamanlılığını elle haritalama.** Canlı akıştaki paralel bloklar + adım SIRASI,
   SSE `start.katmanlar` haritasından gelir; harita `agents/katman.py` ile DERLENMİŞ grafın
   kendi kenarlarından hesaplanır (`graph.pipeline_katmanlari`, singleton başına önbellekli).
   Frontend'e sabit yedek harita yazma: ENV bayrakları (`PARALEL_ANLAMA`/`PARALEL_TRIYAJ`/
   `PARALEL_KAPANIS`/`CRAG`/`NLI`/`VITRIN_MODU`) topolojiyi değiştirdiğinde yalan söyler —
   eski `VARSAYILAN_KATMAN` sabiti tam da bu yüzden silindi. Harita yoksa/eksikse paralellik
   İDDİA EDİLMEZ → düz liste.
9. **Koşmayan adımı "tamamlandı" sayma.** Backend akışın başında TÜM olası adımları duyurur;
   koşullu dal (clarifier · yeşil bantta atlanan `onay_kapisi`) seçilmeyeni hiç çalıştırmaz.
   Kapanış kuralı tek yerde: `akisKatman.kapanisDurumlari` — `active`→tamamlandı,
   `pending`+koşum bitti→**atlandi**, `pending`+onay bekliyor→**sırada kalır**. Backend her adım BAŞLARKEN `status:"active"` yayar (LangGraph `tasks` modu, yalnız
   ad+durum — task girdisi maskesiz PII taşır, SSE'ye konmaz); interrupt'ta duran onay kapısı
   başlar ama bitmez → duraklamada `active`→**sırada** (tamamlandı DEĞİL). Başarı beyanı
   (`kosanCount`, ekran-okuyucu metni) yalnız gerçekten koşanları sayar; ilerleme çubuğu ayrı
   sayaçtır. Eşzamanlılık etiketi de olguya bağlıdır: `ParalelBaslik` ancak grubun ≥2 üyesi
   GERÇEKTEN koştuysa basılır. Ölçüm: 2026-08-12 adversarial denetimi (18 duyuruldu, 15 koştu).
10. **Adım durumunu yerel olarak türetme.** `gerekmedi` (koştu, işi yoktu) yalnız backend'in
   söylediğine dayanır — `oku.engine` metin motoruysa, `decompose.ayristirma_denendi=false`
   ise. Boş `alt_talepler`den çıkarım YAPMA: LLM çağrılıp anlamlı bölünme çıkmadığında da
   liste boştur ve o koşum gerçek bir çağrı harcamıştır. Tüm durum kararı
   `akisKatman.adimDurumu`'ndan okunur (sahne · şerit · detay modalı aynı kaynağı görür).

## Her Zaman Yap

1. Dosya < 800 satır, fonksiyon < 50 satır.
2. Yeni özellik için test (TDD); deterministik metrikler CI'da.
3. Türkçe karakterler içerikte tam (ç, ş, ğ, İ); değişken isimleri Latin (`evrak_turu`).
4. Yeni node eklerken `agents/graph.py` topolojisine + frontend `agent-flow/topology.js`'e ekle.
5. Çıkarılan PII'yi **maskele** (kullanıcı koruması + jüri "wow").
6. **UI = "Antet & Damga" teması (2026-10).** Renk/font/hareket `frontend/src/components/neonUi.jsx`
   token'larından (`T`/`V`/`R`/`PAL`/`BANT`/`DERIN`/`TYPE`) gelir — elle hex yazma. Tam spesifikasyon:
   `frontend/design-system/kamu-evrak/MASTER.md`.

## Tasarım / UI — "Antet & Damga" (aktif tema, 2026-10)

> Tek kaynak: `frontend/src/components/neonUi.jsx`. Spesifikasyon + gerekçe:
> `frontend/design-system/kamu-evrak/MASTER.md`. Hero Light v2 "Sakin Ürün" emekliye ayrıldı
> (kullanıcı kararı: hedef ödül düzeyinde görsellik, eski kısıtlar kaldırıldı).

- **Fikir:** resmî yazışma dünyasının kendi malzemeleri — tükenmez mavisi `T`, ıstampa moru `V`,
  ACELE kırmızısı `R`, arşiv kâğıdı zemini, lacivert dosya cildi kenar çubuğu.
- **İmza öğeleri (bozma):** `ViewWrap` antet başlığı (mono künye + Archivo geniş başlık + çift
  çizgi; `kunye`/`damga` prop'ları) · `Damga` lastik mühür atomu (ekran başına ≤2) · kenar
  çubuğunda sayfaya bağlanan "dosya sırtı" aktif sekme (`[data-ray]` token kapsamı + `--ke-sayfa*`).
- **Font:** Archivo (`DISPLAY`, genişlik ekseni — yalnız başlık/rakam/damga) · Instrument Sans
  (`SANS`, gövde/UI) · IBM Plex Mono (`MONO`, makine verisi + antet satırı).
- **Kütüphane:** motion · Radix · vaul · embla · lucide · @number-flow/react · shadcn/ui
  (`src/components/ui/`). Tailwind yalnız çalışma alanında, renkler `var(--ke-*)`. Legacy
  `styles/kamu-evrak.css` değişkenleri dosya sonundaki köprüyle `--ke-*`'ye bağlı.
- **a11y:** focusRing, renk tek sinyal değil, reduced-motion, telefonda 44px hedef + 16px girdi.
- **Ayrı tanıtım (landing) sayfası YOK** (2026-10-04 kullanıcı kararı: ürün memurun iş aracıdır).
  `index.html` yalnız `/app.html`'e yönlendirir; backend `/` → 307 `/app.html`. Giriş ekranında
  "Ana sayfa" bağlantısı yok. Yeniden landing önerme; eski sürümler `landing-onceki` dalında ve
  masaüstündeki `kamu-evrak-landing-onceki` / `kamu-evrak-landing-yeni` klasörlerinde.

## İki Zorunlu Görev (biri eksikse sistem tamamlanmamış sayılır — şartname §9)

- **Görev 1:** oku (OCR/metin) → tür sınıflandır → bilgi unsuru çıkar → eksik tespit →
  mevzuat öner → özetle.
- **Görev 2:** resmî yazı taslağı (üst/cevabi/bilgilendirme/olur) → resmî üslup → birim
  yönlendir → kullanıcıyı bilgilendir → gerekirse eksik bilgi iste.

## Puanlama (100)

Yöntem & Teknik 35 · Uygulama 35 (sınıflandırma/yönlendirme/özet/yazı-kalitesi/eksik-tespit) ·
Demo 15 (real-time avantaj) · Yenilikçilik/Özgünlük/Ticarileşme 15.

## LLM entegrasyonu + fallback

> **MODEL ADI UYARISI (2026-07-24):** DeepSeek eski adları KALDIRDI — `deepseek-chat` ve
> `deepseek-reasoner` artık HTTP 400 döndürüyor. Geçerli adlar: **`deepseek-v4-flash`**
> (varsayılan) ve **`deepseek-v4-pro`**. İkisi de REASONING modeli: düşünme token'ları
> `max_tokens`'tan düşer, bu yüzden node bütçelerine `LLM_DUSUNME_MARJI` (varsayılan 700)
> `_llm_extract._chat_dene`'de EKLENİR. Marj olmadan dar bütçeli node'lar BOŞ cevap alıp
> sessizce deterministik yedeğe düşer (ölçüldü: 28 çağrının 13'ü boş → marj sonrası 0).

Çekirdek anlama/üretim node'ları **gerçek LLM (DeepSeek, `LLM_MODE=openai`,
`deepseek-v4-flash`)** kullanır — **sınıflandır · bilgi çıkar · çok-konulu ayır · eksik tespit ·
özetle · yazı taslağı · birim yönlendir · bilgilendir** (8 çekirdek node). 2026-07
güçlendirme dalgası (14 madde, hepsi ENV-gated + deterministik fallback'li): OCR imla
düzeltme (`OCR_LLM_DUZELT`, WER %51→%29) · sınıflandırmada güçlü-model (`deepseek-v4-pro`)
eskalasyonu (`SINIFLANDIR_ESKALASYON`) · risk bandı doğal dil açıklaması · llm_json
parse-retry + LRU cache · 2646 lint auto-fix önerisi (`LINT_AUTOFIX`) · iddia-düzeyi
grounding (`VERIFY_GROUNDING_LLM`, yalnız bandı sertleştirir) · DeepSeek listwise rerank
(`RERANK_PROVIDER=deepseek`, Recall@1 0.65→1.00) · CRAG LLM grader+rewrite · decompose
kapalı-küme tür/birim · SDP kapalı-küme seçici · NLI `NLI_PROVIDER=deepseek` ·
eval LLM-judge (özet+üslup, default kapalı) · sohbet araç döngüsü (`SOHBET_ARAC_DONGUSU`,
maks 3 tur + geçmiş) · anlama fan-out (`PARALEL_ANLAMA`, sınıflandır ∥ çıkar).
Her LLM noktasında yok/mock/hata/timeout → **deterministik fallback**: mock modda uçtan-uca
akış ayakta kalır, CI deterministik geçer. **Mevzuat öner = BM25 RAG birincil** (LLM yalnız
rerank/doğrulama katmanı); risk bandı KARARI daima deterministik (LLM yalnız sunar/sertleştirir).
Risk **skoru** sabit değil **ölçülmüştür**: `ağırlık = ciddiyet × isabet`, belge skoru noisy-OR
(`agents/risk_agirlik.py`); isabet `eval/risk_calibration.py`'de bağımsız oracle'la sayılıp Wilson
alt sınırı olarak yazılır. Gözlem sinyalleri (checksum/lint/`[DOĞRULA]`) ölçülmez → isabet 1.0.
Skor bir olasılık DEĞİL, beklenen zarardır; kalibre edilen ayrı büyüklük `kusur_olasiligi`'dır.
Maliyet ~$0.001-0.002/belge. Eval: `eval/` (bkz. `docs/06-eval-harness.md`).

## Canlı kaynak keşfi (2026-08-06) — korpusta OLMAYAN kuruma evrak gelince

Sicildeki 4066 kurumun 128'i doğrulanmış teşkilat kaydına sahip; 2210'u mevzuat şablonu
kapsamında. Kalanına evrak düştüğünde sistem artık **kurumun kendi resmî sitesini çalışma
anında bulur**, birim sayfasını okur ve memura **tıklanabilir kaynak + birim önerisi**
gösterir. Katmanlar (ucuzdan pahalıya): önbellek → alan kalıbı (`core/kurum_alan.py`,
kurumların %69,8'i + 227 merkezî kurum) → site içi sayfa keşfi (`core/sayfa_kesif.py`) →
**ücretli** web araması (`core/kaynak_web_arama.py`, çalışma anında KAPALI) → kimlik kapısı
(`core/kurum_kimligi.py`) → birim çıkarımı. Orkestratör: `core/canli_kaynak.py`.

Bozulmaması gereken üç şey:
1. **`dogrulanmis=False`** dört yerde kilitli (yukarıda §5). UI'da sarı, yeşil değil.
2. **İki çakışma kapısı** — kimlik kapısı (`ttk.gov.tr` = Türk TARİH Kurumu, oysa sicildeki
   `ttk` Türkiye TAŞKÖMÜRÜ Kurumu) ve aday kapısı (merkez ilçe kaymakamlığı valiliğin
   adresine düşer). İkisi de ölçümle bulundu; kaldırılırsa yanlış kurumun birimleri
   resmî görünümlü bir linkle önerilir.
3. **Ağ ve para sınırları** — yönlendirmenin her sıçraması ayrı sınanır (kör SSRF), gövde
   sınırı indirme SIRASINDA uygulanır, harcama yalnız-ekleme defteriyle + rezervasyonla
   tutulur (`KESIF_AZAMI_HARCAMA_USD`; tanımsız → katman KAPALI).

Aynı motor `scripts/canli_kaynak_tara.py` ile çevrimdışı toplu **kaynak avcısı** olarak
koşar; çıktısı ADAY listesidir, korpusa yazmaz. Tam mimari + ölçümler + dürüst sınırlar:
**`docs/14-canli-kaynak-kesfi.md`**.
