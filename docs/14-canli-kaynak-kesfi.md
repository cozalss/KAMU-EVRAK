# Canlı kaynak keşfi — doğrulanmamış kuruma evrak düştüğünde

Korpusta 4066 kurum var; teşkilat kaydı **doğrulanmış** olan 121'i. Geri kalanına evrak
geldiğinde sistem eskiden ya susuyor ya da kurumun kendi adını tekrar eden jenerik bir
kategori öneriyordu ("İl/İlçe Sağlık Müdürlüğü"). Memurun elinde doğrulanacak hiçbir şey
olmuyordu; Google'a girmesi gerekiyordu.

Canlı keşif bu boşluğu kapatır: kurumun **kendi resmî sitesini** çalışma anında bulur,
birim sayfasını keşfeder, konuya uyan birimi çıkarır ve memura **tıklanabilir kaynak
linkiyle** gösterir.

> **Bu bir doğrulama mekanizması DEĞİLDİR.** Bulunan sayfa manifest + SHA-256 + insan
> incelemesinden geçmemiştir. Çıktı daima `dogrulanmis=False` taşır, arayüzde sarı
> gösterilir ve otomatik havale ASLA üretmez. Doğrulama zinciri (INV-1…INV-9,
> bkz. `10-kurum-sicili.md`) değişmedi.

## Katmanlar — ucuzdan pahalıya, ilk tutan kazanır

| # | Katman | Süre | Maliyet | Kapsam |
|---|--------|------|---------|--------|
| 0 | Önbellek | 0,008 sn | $0 | ikinci evraktan itibaren |
| 1 | Alan kalıbı (`core/kurum_alan.py`) | ~1 sn | $0 | 4066 kurumun **2838**'i (%69,8) + 227 merkezî kurum |
| 2 | Site içi sayfa keşfi (`core/sayfa_kesif.py`) | ~1 sn | $0 | 1. katman açıldıysa |
| 3 | Web araması (`core/kaynak_web_arama.py`) | ~8 sn | ~$0,008 | yalnız 1-2 tutmazsa; **çalışma anında KAPALI** |
| 4 | Kimlik kapısı (`core/kurum_kimligi.py`) | 0 sn | $0 | her sayfaya uygulanır |
| 5 | Birim çıkarımı (`core/canli_kaynak.py`) | 0 sn | $0 | — |

Çalışma anında 3. katman kapalıdır (`web_aramasi=False`): ücretsiz katmanlar ~1,2 sn
sürerken web araması ~8 sn sürüyor ve memuru ekranda bekletmek kabul edilemez. Ücretli
katman yalnız çevrimdışı toplu zenginleştirmede (`scripts/canli_kaynak_tara.py --web`)
açılır.

## Alan adı kalıpları — ölçüldü, uydurulmadı

Sicilde `web` alanı 4066 kaydın yalnız 26'sında dolu (%0,6). Ama Türk kamu kurumlarının
alan adları kalıplı: `nilufer.bel.tr`, `kayseri.gov.tr`, `konyaism.saglik.gov.tr`.

Her kalıp **gerçek istekle sınandıktan sonra** eklendi; sınanmamış tür için kalıp
uydurmak yerine boş dönülür (yanlış siteye gitmektense hiç gitmemek doğrudur).

- Tür kalıpları: belediye · valilik · kaymakamlık · il özel idare · defterdarlık
- İl müdürlüğü kalıpları (bakanlığa göre ayrı): sağlık · MEB · tarım-orman · vergi
  dairesi · nüfus · kültür-turizm · CSB · müftülük
- **Merkezî kurumlar** (`diger`/`kit`/`ust_kurul`/…): `<slug>.gov.tr` — 90 karantina
  kurumunda ölçüldü, **19'u tuttu** (BOTAŞ, BTK, DHMİ, EPDK, EÜAŞ, KOSGEB, MTA, ÖSYM,
  RTÜK, SPK, TCDD, TEİAŞ, TİHEK, TKİ, TPAO, TÜBİTAK, EGO, ESHOT, İETT)
- **Üniversite kalıbı BİLEREK YOK**: adlar kısaltmaya dönüşüyor (Abdullah Gül →
  `agu.edu.tr`) ama bazıları tam ad kullanıyor (`hacettepe.edu.tr`). Addan türetilemez.

## İki çakışma kapısı — kalıbın güvenlik şartı

Kalıp yaklaşımının doğal riski, **yanlış kurumun sitesine düşmektir**. Bu, hiç öneri
vermemekten kötüdür: memur öneriyi resmî bir linkle gördüğü için sorgulamaz. İki ayrı
çakışma ölçüldü ve iki ayrı kapı gerekti.

### 1. Kısaltma çakışması → kimlik kapısı (`kurum_kimligi.py`)

`ttk.gov.tr` **Türk Tarih Kurumu**na aittir. Sicildeki `ttk` ise **Türkiye Taşkömürü
Kurumu**dur. Kapı olmasaydı taşkömürü evrakına tarih kurumunun birimleri önerilecekti.

**Kural:** kurum adının ayırt edici kelimelerinin en az yarısı (asgari 1) sayfa metninde
KÖK olarak geçmeli. Türkçe çekim için ilk 6 harf karşılaştırılır. "Türkiye", "Genel",
"Müdürlüğü" gibi her kurumda geçen kelimeler ve 3 harfli kısaltmalar ayırt edici
sayılmaz — ayırt edici kelime hiç kalmıyorsa kapı KAPALI sayılır.

Gerçek sayfalarda ölçüldü: **29 kurum · 0 yanlış-pozitif · 0 etkin yanlış-negatif**
(reddedilen tek sayfa — BOTAŞ, JS ile çizilen — zaten 0 birim veriyordu).

### 2. Yer adı çakışması → aday kapısı (`kurum_alan.py`)

"Adıyaman Kaymakamlığı" → `adiyaman.gov.tr`, ki bu Adıyaman **Valiliği**nin sitesidir.
Kimlik kapısı bunu yakalayamaz: her iki kurumun tek ayırt edici kelimesi "adıyaman"dır ve
valilik sayfasında da geçer.

**Kural:** kaymakamlık kaydında ilçe adı il adına eşitse aday üretilmez. Kapsam
çalışmasında ayrıca ölçülmüştü: büyükşehir olmayan illerin merkez ilçesinde kaymakamlık
zaten yoktur, görevi vali yürütür. Regresyon testi sicildeki **tüm** kaymakamlıkları
tarar; biri valilik adresine düşerse kırılır.

## Ağ güvenliği (2026-08-06 denetiminde sertleşti)

Bu katman dış girdiyle ağa çıkar. Denetim, "istek atıldı ama sonucu kullanılmadı"
biçiminde iki gerçek açık buldu — sonucu inceleyen hiçbir test bunları göremezdi.

| Kural | Önce | Şimdi |
|---|---|---|
| Yönlendirme | httpx zinciri kendi izliyor, yalnız NİHAİ adres sınanıyordu → izinsiz ara adrese (127.0.0.1, 169.254.169.254) istek **fiilen atılıyordu** (kör SSRF) | `follow_redirects=False`; her sıçrama ayrı sınanır, en fazla 3 hop |
| İç ağ | kontrol yok | çözülen IP özel/loopback/link-local ise reddedilir |
| Gövde sınırı | `len(yanit.content)` — indirme BİTTİKTEN sonra; 3 MB tavanı belleği hiç korumuyordu (sıkıştırma bombası → OOM) | akışla indirilir, sınır **indirme sırasında** uygulanır |
| İçerik türü | kontrol yok | yalnız HTML/metin; `.pdf/.zip/.mp4/…` uzantılı bağlantı aday bile olmaz |
| Süre | istek başına 12 sn, toplam sınır yok → ölçülen en kötü hâl ~96 sn | toplam bütçe 6 sn + düğümde 8 sn dış sınır |
| İş havuzu | paylaşımlı varsayılan executor → yavaş kurum siteleri giriş/mevzuat/mobil dâhil her şeyi açlığa düşürüyordu | ayrılmış 2 işçilik havuz (OCR'daki desenin ikizi) |

TLS doğrulaması hiçbir yerde kapatılmaz. İzinli sonekler: `.gov.tr` `.bel.tr` `.edu.tr`
`.pol.tr` `.tsk.tr`.

## Bütçe tavanı — defter (ledger) modeli

Ücretli katmanın tek freni harcama tavanıdır. Denetim tavanın **üç ayrı yoldan
delindiğini ölçtü**:

1. **Yarış** — `oku → ekle → yaz` kilitsizdi. 20 iş parçacığı × 10 artım × $0,001'de
   beklenen $0,20 yerine dosyaya **$0,007** yazıldı; paranın %96,5'i kayboldu.
2. **Fail-open** — `write_text` dosyayı önce boşaltıyordu. Yarım okuma/çökme sonrası
   sayaç 0 sayılıyor ve tavan **sıfırdan başlıyordu**.
3. **Eksik maliyet modeli** — yalnız token sayılıyordu; `web_search` aracının çağrı
   başına ücreti hiç yoktu. Deponun kendi ölçümüyle hesap arasında **3,4 kat** fark
   vardı, yani $1,50 tavanı gerçekte ~$5 harcandığında devreye giriyordu.

Sayaç artık **yalnız ekleme yapılan bir defterdir**: her çağrı bir satır ekler, bakiye
satırların toplamıdır. Kimse kimsenin satırını ezemez, çökme en fazla son satırı bozar ve
defter denetlenebilirdir. Dört kural:

- **FAIL-CLOSED okuma** — defter VAR ama bozuksa bakiye sonsuz sayılır, katman kapanır.
  Dosyanın hiç olmaması meşrudur (ilk çalıştırma) ve 0 sayılır.
- **REZERVASYON** — para istekten ÖNCE düşülür, yanıt gelince gerçekle mutabakat yapılır.
  Timeout/çökmede rezervasyon yerinde kalır: fazla saymak güvenli yön.
- **Yazamıyorsak harcamıyoruz** — defter yazılamazsa katman o süreçte kapanır.
- **Tek çağrı da sınırlı** — `max_output_tokens=120`, `max_tool_calls=2`; sınırsız
  bırakılırsa tek bir çağrı tavanı tek başına aşabilir.

Ölçüldü (regresyon testi): 20 iş parçacığı × 200 artım → defter toplamı **birebir**
doğru. Tavana kıl payı kala 25 iş parçacığıyla 100 çağrıda geçen çağrı sayısı tavanın
izin verdiği sayıyı aşmıyor.

ENV: `KESIF_OPENAI_API_KEY` · `KESIF_ARAMA_MODEL` (varsayılan `gpt-5.6-luna`) ·
`KESIF_AZAMI_HARCAMA_USD` (tanımsız/0 → katman KAPALI) · `KESIF_MAX_WORKERS` ·
`KESIF_TOPLAM_SN`.

## "Doğrulanmamış" sözleşmesi — dört yerde kilitli

Bu özelliğin tamamı tek bir dürüstlük şartına dayanır: canlı bulunan veri, doğrulanmış
veriden **ayırt edilebilir** olmalı. Sözleşme bilerek dört ayrı yerde tutulur; biri
bozulursa diğerleri tutar.

1. `agents/resmi_kaynak.uclu_grounding` — `kaynak_tipi == "kurum_ozel"` şartı canlı veriyi
   kabul etmez, yani otomatik havale üretemez.
2. `route_ajan` çıktısı — `hedef_birim=None`, `insan_onayi_gerekli=True`; canlı veri
   `hedef_birim_kaynak` künyesine **sızmaz**, ayrı `canli_kaynak` anahtarında durur.
3. `CanliKaynak.kunye()` — `dogrulanmis` alanı kodda SABİT `False`.
4. `frontend/src/lib/detayYorum.canliKaynakYorum` — künyeyi KATI okur (`=== true`),
   adresi yerelde yeniden doğrular, arayüzde daima sarı + "doğrulanmadı" gösterir.

## State sözleşmesi — sessiz düşme tuzağı

`canli_kaynak`, `EvrakState` · `ProcessResponse` · SSE alan haritasının **üçünde birden**
tanımlı olmalıdır. **LangGraph şemada olmayan anahtarı hata vermeden atar.** Bu bir kez
yaşandı: düğüm künyeyi doğru üretiyordu, düğümü doğrudan çağıran testler geçiyordu, ama
özellik ağa çıkıp önbelleğe yazdıktan sonra API'ye hiç ulaşmıyordu ve hiçbir test bunu
görmüyordu.

Ders: **"düğüm döndürdü" ≠ "state'e yazıldı".** Regresyon testi grafı gerçekten koşar
(`tests/test_canli_kaynak_state_sozlesmesi.py`).

## Toplu kaynak avı — motoru korpus üreticisi olarak kullanmak

`scripts/canli_kaynak_tara.py` aynı motoru çevrimdışı ve toplu koşar: "hangi
doğrulanmamış kurum için artık resmî bir birim sayfası bulunabiliyor?"

```
python scripts/canli_kaynak_tara.py --durum karantina        # ücretsiz katmanlar
python scripts/canli_kaynak_tara.py --slug tubitak --slug ptt
python scripts/canli_kaynak_tara.py --durum bekliyor --web   # ücretli katman AÇIK
```

Çıktısı bir **aday listesidir**, korpus değil. Doğrulama zinciri değişmez:
`kurum_teskilat_cek.py` → `kurum_teskilat_yaz.py` → `kaynak_kaydet.py` (URL + SHA-256 +
tarih + yöntem) → `seed_teskilat.py`. Araç yalnız o zincirin en çok vakit alan ilk
adımını — doğru sayfayı bulmayı — hızlandırır.

İlk koşum (99 karantina kurumu, ücretsiz katmanlar): **26 kurumda** resmî birim sayfası
bulundu.

## Bilinen sınırlar (dürüst liste)

- **JS ile çizilen siteler** birim listesi vermez (BOTAŞ, PTT, YÖK, TSE…). Ham HTML'de
  menü yoktur; çözüm ya kurumun ayrı bir statik sayfası ya da web aramasıdır.
- **Valilik "hizmet birimleri" sayfaları** valiliğin kendi birimlerini değil ildeki AYRI
  KURUMLARI listeler (İl Emniyet Müdürlüğü vb.). Bunlar valiliğin birimi değildir; bu da
  önerinin neden daima memur onayına gittiğinin bir sebebidir.
- **Kişi adı sızıntısı** kök nedeninden çözüldü (blok etiketleri satır sonuna çevrilir,
  aday sağdan kırpılır), ama düz metin hâlinde bitişik yazılmış adlar için teorik risk
  sürüyor. Bu değerler korpusa yazılmaz; memurun gördüğü öneri listesinde kalır.
- **Çok-süreçli dağıtımda** harcama kilidi paylaşılmaz; defter toplamı yine doğru kalır,
  tavan en fazla bir rezervasyon kadar aşılabilir.
- **DNS rebinding**'e karşı tam koruma yoktur (bağlantı anında IP sabitlemek gerekir).
  Bu katman yalnız GET yaptığı ve içeriği doğrulanmadan kullanmadığı için kabul edilen
  risktir.
