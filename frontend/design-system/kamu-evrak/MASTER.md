# kamu-evrak — Tasarım Sistemi: "Antet & Damga" (v3, 2026-10)

> Tek kod kaynağı: `frontend/src/components/neonUi.jsx` (token + atom; hex değerleri
> `components/temaCss.js` → `THEME_CSS`, neonUi yeniden dışa aktarır). Bu dosya NEDEN'i ve
> kuralları anlatır. Önceki "Hero Light v2 · Sakin Ürün" tamamen emekliye ayrıldı.

## Fikir

Ürün, kamu kurumunda resmî yazışmayı yapan bir ajan sistemi. Görsel dil, bu dünyanın KENDİ
malzemelerinden gelir — jenerik SaaS panelinden değil:

| Malzeme | Arayüzdeki karşılığı |
|---|---|
| Tükenmez kalem mavisi (ıslak imza) | Birincil aksan `T` (#2b4fd6) — eylem, seçim, odak |
| Istampa moru (mühür mürekkebi) | İkincil `V` (#6b3ea6) — Görev 2 / resmî yazı, "kayıt" damgaları |
| ACELE / GİZLİ kırmızı damgası | `R` (#d93a2b) — yalnız gerçek aciliyet |
| Arşiv kâğıdı grisi | Zemin `PAL.bg` (#eceee9) — beyaz evrak yüzeyleri (`PAL.surf`) bunun üstünde durur |
| Dosya cildi (lacivert bez) | Kenar çubuğu `[data-ray]` — iki temada da koyu |
| Antet (resmî yazının üst bloğu) | `ViewWrap` başlığı: mono künye satırı + geniş başlık + çift çizgi |
| Lastik mühür | `Damga` atomu — görünümün en önemli tek olgusu |

## İmza öğeleri (bunlar sitenin "hatırlanan" yüzü — bozma)

1. **Antet başlığı** (`ViewWrap`): `KAMU-EVRAK · <KÜNYE> ———— gg.aa.yyyy` mono satırı →
   Archivo 800 / %118 genişlikte başlık → alt başlık → **çift antet çizgisi** (2px + 1px ink).
   `kunye` prop'u görünüme özgü künye yazar ("Evrak sicil defteri"). `damga={{metin, ton}}`
   başlığın yanına mühür basar.
2. **Damga** (`<Damga ton egim kucuk>`): çift çerçeve (2px kenar + 1px ofsetli outline), Archivo
   %125 geniş büyük harf, -3..-9° eğim, SVG gürültü maskesiyle mürekkep dokusu, giriş vuruşu
   `nu-damga`. **Dikkat bütçesi:** ekran başına en fazla 2 damga — artık BİLEŞEN DÜZEYİNDE
   zorlanır (`lib/damgaButce.js`): monte olan her Damga kayda girer, bütçeyi aşan damga
   silinmez, sessiz bir mono künye çipine iner (`data-damga-cip`). Öncelik: `oncelik` prop'u
   (yüksek kazanır), eşitse ilk monte olan. `ViewWrap` başlık damgası `-1` taşır → karar anının
   damgası (hüküm/onay/gönderim, varsayılan 0) her zaman basılır. `butce={false}` yalnız tek
   başına sahne gösterisi için (giriş ekranı). Her çipi damgaya çevirme; damga = "bu görünümün
   hükmü".
3. **Dosya sırtı** (kenar çubuğu aktif öğesi): seçili öğe rayın sağ kenarını aşıp sayfa
   zeminiyle birleşir (iç bükey köşeler). Sırt aktif öğenin İÇİNDE düz bir `span`'dır; girişi
   yalnız soldan açılan kısa bir `clip-path` keyframe'i (`nu-sirt`, 220 ms) — son kare her
   zaman tam sırttır. **motion `layoutId` ile öğeler arası kaydırma KULLANILMAZ:** projeksiyon
   durumu bozulunca sırt tıklamada "beyaz yanıp sönüyor", aktif metin lacivert üstünde koyu
   kalıyordu (kullanıcı bulgusu, 2026-10-03). Geri dönme.

## Kimlik: "T.C." YOK (tur 6)

Bağımsız ürün devlet kimliğini kendi anteti gibi taşımaz. Antet, iskelet, kip künyesi, giriş
satırı: `KAMU-EVRAK · …`. "T.C." yalnız bir İDARE yazısının kendi metninde (A4 taslak, örnek
evrak metni) geçer; vatandaş dilekçesi "T.C." ile başlamaz (giriş sahnesi buna uyar).
Logotype tek yazım: `LOGOTYPE = "KAMU-EVRAK"` (`kabukAtomlari.jsx`, tire; orta nokta yok).

## Token'lar

- Renk: yalnız `PAL` / `T` `V` `R` / `BANT` / `DERIN` / `ALFA()` / `IRIS`. Hex yalnız
  `THEME_CSS`'te (`temaCss.js`). Açık zeminde renkli METİN yalnız `DERIN.*` (AA).
- **Kontrast birim testte:** `lib/temaKontrast.test.js` THEME_CSS'i okuyup her metin token'ını
  her yüzeye karşı ölçer (açık · koyu · ray iki tema · koyu kâğıt) — 4,5:1 altı CI'da kırılır.
  axe'nin 2–3 sn'de yakaladığı `#767b89` türü ihlaller token değil, giriş animasyonunun
  ARA karesidir (opacity < 1); kararlı durumda 0.
- Tip: `TYPE.meta 12 · data 13 · ui 14 · read 16 · h2 20 (display) · num 26 (display) ·
  h1 38 (display) · disp 44 (display) · antet (mono 11, izlemeli) · damga (display %125)`.
  - `DISPLAY` = Archivo (genişlik ekseni 62–125, `fontStretch` ile). Yalnız başlık, büyük
    rakam, logotype, damga. Gövdeye yayılmaz.
  - `SANS` = Instrument Sans — tüm gövde/UI.
  - `MONO` = IBM Plex Mono — makine verisi (evrak no, tarih, hash, maskeli PII) + antet satırı.
- Radius `RAD`: chip 5 · ctl 8 · card 12 · pop 14. Boşluk `SP`. Gölge `SH` (border-first).
- İçerik azami genişliği `ICERIK_AZAMI` = 1600 (ViewWrap; antet çizgisi bu kutuya bağlı).
  Pencereye kilitli `ustSik` görünümler varsayılan `genis` (istisna).
- Hareket: `EASE.out / inOut / spring`; `data-press` → `:active scale(.97)`. Sözcükler:
  `nu-kagit` (diyalog inişi, 220 ms, y 8 + .985) · `nu-kagit-pop` (yerinde açılan menü/ipucu,
  .96→1, köken Radix transform-origin, 160–180 ms) · `nu-rise` (`--nu-rise-y` ile mesafe) ·
  `nu-sirt` / `nu-kulak` (dosya sırtı / mobil kulakçık girişi, clip-path). Motion ile yazılan
  kipler aynı değerleri `EASE_BEZIER.out` ile taşır.
  `prefers-reduced-motion` her animasyonu kapatır (global kural).

## Yüzey dili

- Zemin arşiv grisi; evrak/kart yüzeyleri beyaz, 1px hairline + `SH.card`. Kâğıt hissi:
  beyaz yüzey "evrak", gri zemin "masa".
- Liste satırları sicil defteri gibi: mono evrak no solda/sağda sabit sütun, başlık display
  değil gövde 600; durum çipleri küçük ve sessiz, hüküm tek damgada.
- Büyük sayılar (`TYPE.num` / `disp`) Archivo ile — sayı panelin kahramanıdır.
- Gradyan yalnız veri (IRIS süre barları). Glow yok. Uppercase yalnız antet satırı, damga,
  logotype ve risk kodu (YEŞİL/SARI/KIRMIZI).

## Koyu tema "Gece mesaisi"

`:root[data-theme="dark"]` — mavi-siyah zemin (#0c0e14), yüzey merdiveni surf2 < surf < pop,
yükseklik ışıkla (iç üst-kenar parlaması). Tur 8: kart (surf) zeminden ≥ 1,15 parlaklık oranı
(test), bant/derin aksanlar ~%85 doygunluğa kısık ("neon" okunmasın), antet çift çizgisi
`--ke-antet-cizgi` = ink2 (saf açık çizgi gece zemininde sertçe parlıyordu).

- **Ray = gece laciverdi cilt** (#121b3d, tur 4). Eski #080a15 ray ile sayfa arasında oran
  1,02'ydi: dosya sırtı koyu temada YOKTU. Ayrışma açıklıkla değil RENKLE yapılır (siyah
  dibinde açıklık farkı göze yetmez); sırt sayfa zeminini taşıdığından lacivert cildin içine
  giren koyu bir dil olarak okunur. Cilt bezi dokusu (`--ke-ray-doku`) + sağ kenar dikişi
  (`--ke-ray-kenar`) aside'a bağlıdır; sırt dikişi tam bağlandığı satırda keser.
- **Kâğıt gece de kâğıttır** (`--ke-kagit` #e4e1d8, sıcak ve kısık). A4 taslak
  (`kagitDoku.js`) ve giriş sahnesindeki dilekçe aynı kâğıttan kesilir. `[data-evrak-kagit]`
  kapsamı koyu temada alt ağacın token'larını açık kâğıt değerlerine çevirir (ray kapsamının
  tersi) — kâğıt üstündeki Damga/fiş/künye kodu değişmeden doğru renk alır.

## Kütüphaneler

`motion` · Radix · `vaul` · `embla` · `lucide-react` · `sonner` (yalnız `fisToast` üzerinden).
Tailwind YALNIZ çalışma alanında (`tailwind.app.config.js`, renkler `var(--ke-*)`,
preflight kapalı, `@tailwind base` satırı SİLİNMEZ). AGPL bağımlılık yok.

## Kabuk: asistan ve durum yüzeyleri (tur 3–4)

- **Ray'daki "Yeni evrak yükle" İKİNCİLDİR** (tur 4): cilt yüzeyi + açık çerçeve + tükenmez
  mavisi artı. Dolu mavi düğme her görünümde ekranın ikinci primary'si oluyordu; birincil
  eylem görünümün kendisinde kalır.
- **Denetim izi** ana NAV'da değil (hesap menüsü); açıkken listenin altında ayraçtan sonra
  GEÇİCİ bir sırt satırı belirir — "neredeyim" sorusu cevapsız kalmaz.
- **Asistan cevabı = danışma notu fişi** (tur 4): mono künye satırı (Karşılama · Danışma notu ·
  İşlem durdu + saat) + kesikli ayraç + gövde, sol kenarda ıstampa moru çizgi. Sık sorulanlar
  numaralı liste (01–06), hap çip değil. Panel künyesi "KAMU-EVRAK · DANIŞMA · yapay
  zekâ yanıtı | kural tabanlı yanıt" ("Havale notu" sevk notu demektir — yanlış etiketti).
  Ham kodlar (`bilgi_edinme`, `tarih_yok`) ve tek yıldızlı italik `lib/sohbetMetin` ile
  insan diline çevrilir.
- **Modal hareket sözcüğü:** `nu-kagit` (menü/ipucu: `nu-kagit-pop`) (translateY 8px + scale .985 → yerinde, 220 ms
  `--ke-ease-out`); perde `nu-sol`. Yeni diyaloglar bunu kullanır.

- **Asistan tetiği kenar çubuğundadır, yüzen düğme YOK.** Sağ-alt FAB her ekranda bir köşeyi
  örtüyordu (Panel takvim lejantı, telefonda satırın "İşle" düğmesi); güvenli alt boşluk yalnız
  sayfa sonunda işe yarar. Tetik (`[data-asistan-tetik]`) hesap kartının üstünde, ikincil dilde;
  kısayol `Ctrl/⌘ + .`. Panel cilt sırtının 12 px yanından, sol-alt kökenden `.96→1` yay ile
  açılır (hiçlikten değil), 140 ms'de aynı köşeye kapanır; telefonda tam genişlik alttan.
  Haberleşme iki window olayıyla: `ke-asistan` (aç/kapa isteği) · `ke-asistan-durum` (açık mı).
  Sesli görüşme diski panelin çapasında doğar (tam ekran değil, zeminsiz orb).
- **Asistan mesajı = havale notu fişi.** Araç sonucu kayıtlar nota zımbalı ek olarak durur;
  yalnız EN SON araç sonucu mini damga taşır ("3 kayıt · Gelen") — panel başına tek damga.
- **Antet sağ künyesi** (≥ 1200 px, tur 8): resmî yazının üst-sağ bloğu gibi 3 satır mono
  `ETİKET  DEĞER` (sol çizgili, tab-stop hizalı). Görünüm kendi bloğunu `actions` ile verirse
  (defterler: `DefterAntetKunye`, Panel) o çizilir; vermezse `ViewWrap` kabuktan
  (`AntetKunyeBaglam` → `lib/kabukAntetKunye`) yalnız bilinen sayaçları basar. Bilinmeyen sayı
  `··` (bekliyor) / `—` (yanıt yok), asla `00`. Telefonda yok.
- **Hata sınırı = "hata kaydı" fişi** (`HataSiniri`): antet künyesi + saat, ne oldu / ne
  yapılmalı, "Yeniden dene" (bölümü sıfırlar) + "Sayfayı yenile", teknik ayrıntı mono ve
  `<details>` içinde gizli. `tam` prop'u görünüm düzeyi sarmalama içindir.
- **Giriş formu = numaralı resmî form** (Form KE-01): alan numaraları mono; hatalı alan
  `aria-invalid` + kırmızı kenar; hız sınırı (429) hata değil SARI geçici kilit, düğme geri
  sayımlı (`authApi.tekrarDenemeSaniye`); büyük harf kilidi uyarısı.
- **Çevrimdışı**: kenar çubuğunda kesikli sarı "ÇEVRİMDIŞI" künyesi (`role=status`).

## Erişilebilirlik tabanı

**Odak halkası TEK KAYNAK, CSS'te** (`styles/kamu-evrak.css` "ODAK: TEK KAYNAK", tur 6):
her `:focus-visible` → çift çizgi (1 px boşluk + 2 px tükenmez + 2 px boşluk + 1 px ince),
renkler var() ile ÖĞENİN kapsamında çözülür (rayda ray mavisi, kâğıtta kâğıt mavisi).
Girdiler: kenar tükenmez + dış ince çizgi. Etkin sırt öğesinde halka çizilmez: sırt çizgisi
3→5 px + etiket altı çizgisi. `[data-odak-ic]` kaydırma kabında kırpılan satırlar için içe
tek çizgi. `focusRing` nesnesi geriye uyum için durur (işleyiciler no-op) — JS ile box-shadow
YAZMA, eski outline kuralını geri getirme (jüri: üç çizgili çamur). · renk tek sinyal değil
(ikon + metin) · telefonda 44px dokunma hedefi (`data-dokunma`) · 16px girdi puntosu (iOS
zoom) · AA kontrast iki temada (ray kapsamı artık `derin-kirmizi`/`derin-sari`yı da ölçer).

## Kabuk (tur 6)

- **Telefon (≤ 720 px) = alt kulakçık şeridi** (`KabukAltSerit`): ray gizlenir; 5 sekme
  (Panel · Gelen · Taslaklar · Giden · Daha), lacivert cilt, etkin kulakçık sayfa zemininden
  sarkar (dosya sırtının mobil ikizi). "Daha" vaul sayfası: kalan bölümler + yükle + asistan +
  hesap. Ana alan `.ke-ana` alt boşluk alır; toast şeridin üstünde.
- **Rozet = sayı + aciliyet** (`SayiRozet`): Gelen `9 / 15` (gecikmiş kısmı ACELE kırmızısı
  çerçeve). Dar ray / alt şerit tek sayılık: gecikmiş varsa KIRMIZI yazılan sayı GECİKMİŞ
  sayısıdır (toplam ipucu + aria-label'da) — kırmızı toplam "15 gecikmiş" diye okunuyordu.
  Her sayı KENDİ kaynağının durumunu taşır (`lib/kabukSicil.kabukSayaclari`, `kabukSayac.js`):
  hata + önbellek → kesikli "son bilinen"; veri HİÇ gelmedi → kesikli "—" (00 yazmak yanlış olgu).
- **Dar ray ipucu**: Radix Tooltip (`RayIpucu`, sağda, `nu-kagit-pop`) — yerel `title` yok.
  Dar rayda daralt düğmesi en altta; marka karosunda kırmızı nokta yok.
- **İkon dili**: İşlenen = arşiv kutusu, Giden = gönderim, Denetim izi = rulo kayıt, KVKK =
  kilit. Kalkan hiçbir gezinme anlamında kullanılmaz. Gezinme ikonları 18 px kutuda.
- **Günlük sicil** (`KabukSicil`): rayın orta boşluğunda mono sicil satırları — bugün işlenen ·
  bugün giden · karar bekleyen · gecikmiş (yalnız kabuğun bildiği olgulardan, `lib/kabukSicil`).
  ÜÇ hâl ayrı çizilir (tur 8): sayı · BEKLİYOR (ilk yükleme, sakin `··` nabzı `nu-think`) · YOK
  ("—", sunucu yanıtsız; başlıkta sarı "YANIT YOK"). Rozetler de bekliyorken yer tutar (`··`) →
  sayı gelince satır zıplamaz. Yükseklik ≥ 960'ta "Son kayıtlar": İKİ satır (konu + mono sicil no
  `İ-yyyy/nnnn` · saat, İşlenen defteriyle aynı numara), tıklanınca İşlenen'e götürür; boşsa
  "Henüz kayıt yok". Satırlar yalnız İLK çizimde düşer (veri tazelenince yeniden doğup opaklık
  0'da kalıyordu). Yükseklik < 820'de gizli.
- **Cilt kör baskısı** (`CiltKorBaski`, tur 8): sicil ile Asistan arasındaki lacivert bez,
  mürekkepsiz "KAMU-EVRAK / SİCİL DEFTERİ · yıl" baskısıyla biter (`--ke-kor-*`: zemin tonu +
  ışık + gölge; bilgi taşımaz). flex:1 + min-height 0 → yer yoksa çöker; < 900 px yükseklikte gizli.
- **Etkin sırt üstü renk** sayfanın token'larıdır (`--ke-sayfa*`, `--ke-sayfa-kirmizi` dahil): ray
  mercanı açık kâğıtta 1,7:1 kalıyordu. Sırt odak alt çizgisi yalnız `[data-ray-etiket]`te.
- **Dar ray rozeti** ikonun dışında, sağ üst köşeye asılı; ray/sırt renginde 2 px ayırma halkası.
  Ray genişliği kökte `--ke-ray-w` olarak yayınlanır (bildirim katmanı içerik sütununa ortalanır).
- **Tema geçişi "masa lambası"** (tur 8): sert clip-path dairesi yerine yumuşak kenarlı ışık halesi
  — radial mask, dolu yarıçap `@property --ke-lamba-yc` ile büyür, 96 px yumuşak kenar, 520 ms
  `--ke-ease-in-out`. Menü açık kalır; reduced-motion'da anında.
- **Görünüm geçişi ardışıktır** (tur 8, çift pozlama bitti): eski başlık/içerik 80 ms'de söner, yeni
  60 ms gecikmeyle girer (`ke-antet-baslik` grubu konum morfunu sürdürür). Görünümün İLK açılışında
  antet çift çizgisi soldan sağa çekilir (`ke-cizgi`, 280 ms) ve başlık 40 ms sonra yükselir; aynı
  oturumda ikinci ziyarette yalnız 120 ms çapraz geçiş.
- **Bağlantı kaydı** (`BaglantiKaydi`, tur 8): kabuk kaynaklarının HEPSİ son denemede hata verdiyse
  içerik sütununun üstünde tek satırlık sarı künye bandı ("BAĞLANTI KAYDI · saat · son bilinen
  kayıtlar" + Yeniden dene). Akış içinde durur, içerik örtülmez.
- **Durum ailesi**: hata = `HataFisi` (künye HATA/UYARI KAYDI · saat · başlık · ne yapılmalı ·
  birincil "Yeniden dene" · `<details>` teknik). HataSiniri ve ErrorBar (kompakt) bundan türer;
  görünüm bantları da bunu kullanmalı. Kabuk sorguları yeniden denenirken üstte ortalı
  `DenemeSeridi` → `DenemeKunye` ("Sunucuya 2. kez yazıldı · en çok 4"; denemeler tükenince
  görünümün kendi hata fişi devralır — aynı anda iki hata dili yok).
- **Alan hatası odakta da kırmızı**: `[aria-invalid="true"]` odak kuralının tükenmez mavisini
  ezer (kenar + halka ACELE kırmızısı); hata notu ilgili alanın HEMEN altında (kimlik reddi →
  parola altında; hız sınırı/ağ → form geneli).
- **Kip odağı girdi kipine bağlı** (`lib/girdiKipi`): klavyeyle açılan kipte kapat düğmesi (halka
  görünür), fareyle açılanda kabın kendisi (tabindex=-1, halka yok).
- **Dokunma hedefi ≥ 44 px**: parola göster, "Parolamı unuttum", toast kapat (görsel ikon küçük,
  vuruş alanı 44).
- **Bildirim = zımbalı havale pusulası** (`fisToast`): kâğıt yüzey, sol kenar ton çizgisi, zımba
  TELİ (kâğıdın üst kenarını delen iki kısa paralel tel; köşeli parantez 1x'te artık gibiydi),
  masaüstünde içerik sütununun ortasında, istif açık (`expand`), mono künye `saat · İŞLENDİ/BİLGİ/UYARI/HATA`, kesikli ayraç. Ton çağırandan
  (`showToast(m, { ton })`) ya da metinden (`lib/toastTon` — veri kaybı uyarısı başarıdan
  ayrılır). Uyarı/hata ≥ 7 sn.
- **Giriş sahnesi**: kâğıt ve havale fişi EĞİMSİZ (yalnız dikey kayma + opaklık); eğim yalnız
  damgada. Fiş imzanın ALTINA iliştirilir (vaadin görsel karşılığı açık kalır); formda hata/kilit
  varken döngü mühürlü son karede DURUR. Form hataları alan düzeyinde (`hataliAlan`), ilk hatalı
  alana odak; kimlik reddinde YALNIZ parola işaretlenir, odak parolada ve içeriği seçili. Kayıtta
  birim boş başlar ("Birim seçin"), seçilmeden gönderilmez.
- **Giriş düzeni ≥ 1100 px** (tur 8): tek 12 sütunlu ızgara — satır 1 antet (logo · tam genişlik
  çizgi · künye · tema), vaat + sahne 1–8, form kâğıdı 9–12. Form kâğıdının ÜSTÜ vaat başlığının
  üstüne SABİT: dikey ortalama yok (hata notu / Kayıt sekmesi kartı zıplatmıyordu → aşağı büyür).
  Sahnedeki kâğıt tam A4 (maske yalnız < 880 px yükseklikte); defter sütunu kâğıtla aynı tabanda biter.
- **Logotype TEK atom** (`kabukAtomlari.Logotype`: 14 px · %112 · .02em); girişte yalnız `dalga`
  (imleç genişlik dalgası) açık — girişten panele geçince marka yazısı ölçü değiştirmez.
- **Profil = personel sicil fişi**: künye "Personel kartı · Oturum açık" menüden kipe sürer; kısa
  sicil no (`P-xxxxxxxx`), noktalı kılavuzlu sicil satırları, e-imza yoksa kör baskı `YOK`; UUID
  yalnız "Teknik kimlik" `<details>` içinde. Hesap menüsü 288 px, e-posta kırpılmaz.
- **Menü öğesinde hover = klavye odağı** (bilinçli karar): Radix roving-focus ile ok tuşlarıyla
  gezilen menüde odaklı öğe fareyle üstüne gelinen öğeyle AYNI zemini alır (yerel menülerin dili);
  ayrı halka çizilmez — menü içinde aynı anda tek "etkin" satır vardır.
- **Baskı** (`@media print`, temaCss): ray/şerit/bildirim gizli, zemin beyaz, koyu tema seçili olsa
  da açık token'lar, kartlar gölgesiz, damga siyah-beyaz, animasyonlar son karede.
- `components/ui/*` (shadcn, ikinci token dünyası, hiç import edilmiyordu) SİLİNDİ; kullanılacak
  atom neonUi/kabukAtomlari'dır.

## Teslim öncesi

- [ ] 1440 / 1080p / 390 genişlikte yatay kayma yok
- [ ] Açık + koyu tema ekran görüntüsüyle bakıldı
- [ ] Ekran başına ≤2 damga (bütçe kodda zorlanır; yine de `[data-damga-cip]` sayısına bak), 1 primary buton
- [ ] `npm test` — temaKontrast sözleşmesi yeşil
- [ ] Elle hex yok (`grep '#[0-9a-f]\{6\}'` yalnız THEME_CSS)
- [ ] Telefonda (390) alt şerit içeriği örtmüyor; antet künyesinde "T.C." yok
