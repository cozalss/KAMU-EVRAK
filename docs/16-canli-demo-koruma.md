# 16 — Canlı demo koruma katmanı

> Sistemi **halka açık internete** almak için gereken para ve gizlilik korumaları.
> Tamamı `DEMO_KORUMA` bayrağına bağlıdır; bayrak yokken davranış bugünküyle
> bit-aynıdır.
>
> **İSİM NOTU:** ortam değişkeni adı tarihsel olarak `DEMO_*` kaldı, ama sistem bir
> "demo" değil **açık erişim sürümü** olarak sunuluyor: kullanıcıya görünen metinlerde
> "demo" kelimesi geçmez, sınırlar özür dilenerek değil ürün özelliği olarak yazılır
> ("Günlük belge işleme hakkınız doldu"). Ekrandaki KVKK uyarı/onam katmanı kullanıcı
> kararıyla KALDIRILDI (9 Ağu 2026) — **teknik korumalar yerinde**: belge veri tabanına
> yazılmaz (boot kapısı), diske düşmez (1 MiB gövde tavanı), log'da PII maskelidir.

## Neden gerekliydi — ölçülen üç gerçek

Katman yazılmadan önce ölçülen durum:

1. **Para koruması sıfırdı.** Belge işleme tamamen kimliksiz; bir belge ~15-20 LLM
   çağrısı yapıyor ve taranmış PDF'de buna **sayfa başına** bulut vision OCR ekleniyor.
   Ana LLM yolunda hiçbir harcama muhasebesi yoktu — tek defter `kaynak_web_arama`'da ve
   belge yolundan hiç çağrılmıyordu.
2. **KVKK log koruması belgelenmiş ama hiç kurulmamıştı.** `api/pii.py:3` bir
   `core/logging.py` processor'ünü sözleşme olarak anlatıyordu; o dosya **22c0787'de
   "ölü kod" sanılıp silinmişti.** Ölü değildi — `configure_logging()` hiçbir yerden
   çağrılmıyordu. structlog varsayılan seviyede (0) koşuyor, `log.debug` bile yayınlanıyordu.
3. **Ziyaretçi kimliği yoktu.** Kimliksiz istekte tek ayırt edici IP'ydi, o da yalnız
   slowapi kuruluysa.

## Mimari

```
İstek
 └─ MaxBodySizeMiddleware      413 (>tavan) · 411 (Content-Length yok)
     └─ SecurityHeadersMiddleware   X-Robots-Tag: noindex …
         └─ DemoKapisiMiddleware    (saf ASGI)
             1. bayrak kapalı        → geç
             2. yol ücretsiz         → geç
             3. bütçe kapalı         → 402   (kota YAKMADAN)
             4. kota dolu            → 429   (para AYIRMADAN)
             5. rezervasyon          → 402 (yetmezse)
             6. try/finally          → tek delta satırı
                 └─ pipeline
                     ├─ agents/llm.py       butce_kapisi() → çağrı → cagri_mutabakati()
                     ├─ multimodal/ocr_cloud sayfa başına goruntu_mutabakati()
                     └─ core/tts_openai      ses_mutabakati()
```

### Modüller

| Dosya | Sorumluluk |
|---|---|
| `core/gun_indeksi.py` | UTC gün indeksi; **geri gitmez** (saat geri alınarak kota yenilenemez) |
| `core/butce_defteri.py` | Ekle-yalnız JSONL defter; fail-closed okuma; rezervasyon **sığma kontrolüyle** |
| `core/demo_butce.py` | Fiyatlandırma, istek sayacı, **küresel uçuştaki harcama kümesi** |
| `core/demo_kota.py` | İki eksenli günlük kota (ziyaretçi + ağ), hep-ya-hiç |
| `api/demo_kimlik.py` | HMAC imzalı çerez + IPv4 /24 · IPv6 /64 |
| `api/middleware/demo_kapisi.py` | Saf ASGI kapı |
| `core/demo_guard.py` | Boot doğrulaması — güvensiz konfigürasyonda süreç **açılmaz** |
| `core/logging.py` | Silinen structlog processor'ü — sır redaksiyonu + PII maskeleme |

## Üç garanti ve dayanakları

### 1. Günlük para tavanı — SERT

`DEMO_AZAMI_GUNLUK_USD` aşılamaz. Dayanaklar:

- **Rezervasyon sığma kontrolü.** `kaynak_web_arama` deseninden bilinçli sapma: orası
  yalnız "açık mı" sorar ve tavanı bir rezervasyon kadar aşar (ölçüldü: tavan 0,10 ·
  rezervasyon 0,01 → 11 geçiş). Burada `harcanan + tutar <= tavan` aranır.
- **Küresel uçuştaki küme.** Yalnız kendi sayacına bakan bir kapı, N eşzamanlı isteğin
  her birine kalan bütçenin tamamını verirdi — adversarial turda ölçülen en kötü hâl
  **tavanın 4,7 katı** (N=9 → 2,34 USD). `_CANLI` kümesi bunu kapatır.
- **Gerçek token'lar.** `LLMResponse.tokens_in/out` sağlayıcının bildirdiği değerlerdir;
  tahmin kullanılmaz. `usage` yoksa **asgari bedel** yazılır — "ücretsiz çağrı" diye bir
  satır defterde asla oluşmaz.
- **Fail-closed okuma.** Bozuk satır / okunamayan dosya → `inf` → katman kapanır.
  Tavan tanımsız → kapalı. Türkçe ondalık virgül (`0,50`) → kapalı + boot reddi.

**Kalan sınır (dürüst):** kapı bir çağrıdan ÖNCE bakar, çağrının bedeli ise ancak
SONRA bilinir. Günlük toplam, tavanı **en fazla bir çağrı payı** kadar aşabilir.

### 2. Kişisel veri — katmanlı

- **Veri tabanı (9 Ağu 2026'da DEĞİŞTİ):** eskiden `DEMO_KORUMA=1` + `DB_PERSIST=1`
  **boot'u reddediyordu**; gerekçe "halka açık demoda YABANCININ belgesi DB'ye
  yazılmaz"dı ve o ürün için doğruydu. Ürün değişti: sistem anonim bir demo değil,
  **herkesin kendi hesabını açtığı bir uygulama**. Kişinin kendi belgesini kendi
  hesabında saklaması işlevin ta kendisi — kalıcı olmazsa "İşlenen Evrak" listesi her
  yenilemede boşalır ve uygulama yarım kalır. Kısıt kaldırıldı, kalıcılık AÇIK.

  **Korunan güvenceler:** `persist_run` metni `mask_pii` ile MASKELEYEREK yazar
  (TCKN/telefon/IBAN yıldızlı), dosya adı `_baslik_guvenli` ile maskelenir, kayıt
  kullanıcının KENDİ hesabına bağlanır.

  **AÇIK KALAN İŞ — saklama süresi imhası OTOMATİK DEĞİL.** `db/imha_job.py` hazır ama
  zamanlanmamış; periyodik koşturulmalı (KVKK md.7):
  `uv run python -m db.imha_job --uygula`. Boot uyarısı bunu her açılışta hatırlatır.
- **Disk:** demo gövde tavanı **tam 1 MiB** = Starlette `spool_max_size`. Gövde eşiğin
  altındaysa dosya parçası da altındadır → `SpooledTemporaryFile` diske taşmaz.
  Content-Length'siz (chunked) istek **411** alır — bu kapı olmadan Starlette gövdeyi
  parse edip diske yazıyordu (ölçüldü: 25 MiB chunked → tepe **22,9 MiB disk**).
- **Log:** `core/logging.py` zinciri her kayıtta hassas anahtarları `[REDACTED]`, string
  değerlerdeki TCKN/telefon/IBAN'ı yıldızlar. Yedi sızıntı noktası kapatıldı
  (ham dosya adı, ham LLM çıktısı, kullanıcı sorgusu ×2, sağlayıcı gövdesi, SQL echo,
  `yazi_plan` muhatap adı).
- **Dış sağlayıcı:** `yazi_plan` artık evrak metnini `mask_for_llm`'den geçirir.

**Kalan sınır:** `mask_pii` biçimsel desen tanır — TCKN/telefon/IBAN. **Ad, adres,
e-posta maskelenmez.** Bu değişiklikten önce de böyleydi; ayrı bir karardır.

### 3. Arama motoru görünürlüğü — AÇIK (9 Ağu 2026 kararı)

İlk sürüm `noindex` basıyordu ("hayalet gibi olsun, rakip bulmasın"). Karar değişti:
site bulunmak istiyor.

| Katman | Durum |
|---|---|
| `X-Robots-Tag` başlığı | **KALDIRILDI** — geri açmak tek satır (`security_headers.py`) |
| `<meta name="robots">` | **KALDIRILDI** |
| `public/robots.txt` | `Allow: /`, ama **para harcayan uçlar bota kapalı** (`/process_doc`, `/multimodal`, `/yazi`, `/mobil`, `/auth`) |

**Bedeli:** bot ve organik trafik günlük işlem kapasitesini erken doldurabilir. Ağır
uçların `Disallow` edilmesi bunu azaltır ama bitirmez; tavanın gerçek trafiğe göre
yeniden ölçülmesi gerekir.

`index.html` (landing) hiç düzenlenmedi — proje kuralı.

## Kota modeli

```
kullanıcı (JWT sub)       3 belge/gün     ← hesabın kendi hakkı
ziyaretçi (imzalı çerez)  3 belge/gün     ← adalet
ağ (IPv4 /24, IPv6 /64)  12 belge/gün     ← çerez silmenin tavanı
```

### İki açık ve kapanışı (9 Ağu 2026 — canlıda bildirildi)

**1. Restart hakları yeniliyordu.** Sayaç `core/demo_kota._SAYAC` süreç-içi bir
sözlüktü. Render ücretsiz katmanı **15 dakika hareketsizlikte uyur** ve taze bir süreçle
uyanır; her redeploy/restart da aynı. Sözlük her uyanışta boştu → "günde 3 belge" fiilen
**"uyanış başına 3 belge"** idi. Siteyi 20 dakika bekletip dönen ziyaretçi sınırsız hak
alıyordu. Sayaç artık `demo_kota` tablosunda (alembic 0007); `0006_demo_harcama` aynı
sorunu **para** için çözmüştü, bu **kota** için çözer.

**2. Çıkış/giriş taze hak veriyordu.** Kimlik yalnız çerezdeydi; çerezi silmek ya da
başka tarayıcı açmak yeni kova demekti. **Hesap ekseni** eklendi: JWT `sub` (imzası
doğrulanmış) kendi kovasını taşır, kullanıcı nereden bağlanırsa bağlansın. Çerez ekseni
**kaldırılmadı, eklendi** — yalnız hesaba bakılsaydı bu kez "çıkış yap, anonim kovadan 3
hak daha" açığı doğardı; iki eksen birlikte sayıldığı için çıkış yapmak hak üretmez.

Üçü de **hep ya hiç** değerlendirilir: hepsi kontrol edilir, sonra hepsi artar. Bir eksen
doluyken diğerlerinin hakkı **yanmaz** (tek transaction, kısmi artış geri alınır).

### Kalıcılık sözleşmesi

| Katman | Rol |
|---|---|
| `demo_kota` tablosu | **BİRİNCİL** — tek gerçek |
| `_SAYAC` sözlüğü | **YEDEK** — yalnız DB erişilemezken |

Yön, paranınkinin **tersidir** (orada dosya defteri birincil, DB dayanıklılık ekler):
paranın kararı milisaniyelik ve fail-closed olmalı; kotanınki bir adalet kararıdır ve tek
doğru cevabı ancak kalıcı sayaç verir. DB düşerse bellek yedeğine düşülür (fail-open) —
geriye kalan, bu düzeltmeden **önceki** korumanın aynısıdır ve para tavanı hiç etkilenmez.
Yedek, DB'den okunan sayaçla eşitlenir (asla azaltmaz), yani gün ortasında düşen bir DB
sayacı sıfırlamaz. Üst üste 3 arızada katman 60 sn devre dışı kalır — DB tamamen ölünce
her istek bir bağlantı zaman aşımı ödemesin diye.

Tablo **açılışta idempotent kurulur** (`tabloyu_hazirla`). Gerekçe: dağıtım yalnız
uvicorn başlatır, `alembic upgrade` koşmaz — korumanın kurulumu elle bir adıma bağlı
kalsaydı deploy sonrası katman sessizce devre dışı kalırdı. Şemanın tek kaynağı yine
`0007_demo_kota.py` + `db/schema.sql`.

- Çerez **imzalıdır** — gizlilik için değil, sözlük büyütme saldırısına karşı: yalnız
  sunucunun ürettiği anahtarlar sayaca girer.
- **Çerezsiz istekler ağ anahtarını paylaşır** → `curl` döngüsü toplam 3 belge alır,
  istek başına 3 değil.
- `X-Forwarded-For` **varsayılan olarak yok sayılır.** Ters vekil arkasındaysanız
  `DEMO_GUVENILEN_PROXY_SAYISI` verin; verilmezse tüm ziyaretçiler tek ağ kovasına
  düşer (aşırı kısıtlayıcı = güvenli yön).
- **Ölçülen +1:** çerezini saklayan tarayıcı ilk isteğini ağ kovasından harcar, sonra
  kendi kovası sıfırdan başlar → ziyaretçi başına en fazla 4. Çerez **silen** saldırgan
  hep ağ kovasına düşer ve 3'ü aşamaz.

**Dürüst sınır:** kimliksiz bir demoda kota **atlatılamaz yapılamaz.** Gerçek bir proxy
havuzu ziyaretçi kotasını yener. Kota bir *adalet* aracıdır; para garantisini **defter**
verir ve o aşılamaz.

## Sesli mod

| Uç | Demo modunda |
|---|---|
| `/sohbet/seslendir` (TTS) | **Ölçülür** — karakter başına deftere yazılır |
| `/sohbet/realtime/anahtar` | **KAPALI** |

Realtime kapalıdır çünkü o uç kısa ömürlü bir istemci anahtarı basar ve ses ondan sonra
tarayıcıdan doğrudan sağlayıcıya akar — **bu sunucudan hiç geçmez**, dolayısıyla harcama
ölçülemez. Ölçülemeyen bir kalemi tavana dâhil etmiş gibi yapmak, tavanı olduğundan
güvenli göstermek olurdu.

> Not: "auth'lu olması" koruma değildir — kayıt açıktır, iki istekte hesap açılır.

## Dağıtım kontrol listesi

```bash
DEMO_KORUMA=1
DEMO_AZAMI_GUNLUK_USD=0.50        # NOKTA ile; '0,50' boot'u reddettirir
DEMO_KOTA_SECRET=$(openssl rand -hex 32)
AUTH_JWT_SECRET=$(openssl rand -hex 32)
APP_ENV=production                 # /docs kapanır + HSTS
CORS_ORIGINS=https://<gerçek-alan> # localhost içeremez
RATE_LIMIT_ENABLED=true
DB_PERSIST=0                       # 1 olursa süreç AÇILMAZ
SQL_ECHO=0
WEB_CONCURRENCY=1                  # >1 kotayı worker sayısıyla çarpar (boot uyarır)
VITE_DEMO_MODU=1                   # frontend onam kapısı + kota sayacı
```

**Konteyner:** `--read-only --tmpfs /tmp --cap-drop ALL`, `data/` kalıcı yazılabilir
volume (defter orada durur).

**İki ayrı bütçe:** günlük en kötü hâl `DEMO_AZAMI_GUNLUK_USD + KESIF_AZAMI_HARCAMA_USD`
toplamıdır. İkisi ayrı defterdedir; birinin dolması diğerini kapatmaz.

## Doğrulama

```bash
curl -sI https://<alan>/health | grep -i x-robots-tag        # noindex
curl -s https://<alan>/demo/durum                            # kalan hak (hak yakmaz)
for i in 1 2 3 4; do curl -o /dev/null -w "%{http_code}\n" \
  -b jar -c jar -F file=@ornek.txt https://<alan>/process_doc/stream; done   # 200,200,200,429
```

Ölçülen (8 Ağu 2026, yerel koşum): 3→200, 4.→429 Türkçe mesajla · `X-Robots-Tag` var ·
1 MiB üstü → 413 · chunked → 411 · `DB_PERSIST=1` → boot reddi · log'da
`123******01` / `[REDACTED]`.

## Kapsam dışı (bilinen, ayrı iş)

1. `thread_id` ziyaretçiye bağlı değil → sızan id ile başkasının belgesi resume edilebilir.
2. `_get_hitl_graph()` `InMemorySaver` tahliye etmiyor → checkpoint sızıntısı.
3. Zip-bomb TODO (`multimodal.py`) — CPU/bellek DoS'u, para DoS'u değil.
4. `core/metrics.py` `record_event()` hâlâ çağrılmıyor (`core/logging.py` ile aynı sınıf bug).
5. `data/canli_kaynak_onbellek.json` demo bayrağından bağımsız yazılıyor — belge metni
   değil, kurum meta verisi.
6. Erişilebilirlik garanti değil: kötü niyetli biri günün tavanını sabah yakarsa demo o
   gün kapanır. Kimliksiz demoda önlenemez; kayıp tavan kadardır.
