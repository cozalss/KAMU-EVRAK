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

1. **Antet başlığı** (`ViewWrap`): `T.C. · KAMU-EVRAK  <KÜNYE> ———— gg.aa.yyyy` mono satırı →
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
- Hareket: `EASE.out / inOut / spring`; `data-press` → `:active scale(.97)`.
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
yükseklik ışıkla (iç üst-kenar parlaması).

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

`motion` · Radix · `vaul` · `embla` · `lucide-react` · shadcn/ui (`src/components/ui/`).
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
  numaralı liste (01–06), hap çip değil. Panel künyesi "T.C. · KAMU-EVRAK · DANIŞMA · yapay
  zekâ yanıtı | kural tabanlı yanıt" ("Havale notu" sevk notu demektir — yanlış etiketti).
  Ham kodlar (`bilgi_edinme`, `tarih_yok`) ve tek yıldızlı italik `lib/sohbetMetin` ile
  insan diline çevrilir.
- **Modal hareket sözcüğü:** `nu-kagit` (translateY 8px + scale .985 → yerinde, 220 ms
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
- **Hata sınırı = "hata kaydı" fişi** (`HataSiniri`): antet künyesi + saat, ne oldu / ne
  yapılmalı, "Yeniden dene" (bölümü sıfırlar) + "Sayfayı yenile", teknik ayrıntı mono ve
  `<details>` içinde gizli. `tam` prop'u görünüm düzeyi sarmalama içindir.
- **Giriş formu = numaralı resmî form** (Form KE-01): alan numaraları mono; hatalı alan
  `aria-invalid` + kırmızı kenar; hız sınırı (429) hata değil SARI geçici kilit, düğme geri
  sayımlı (`authApi.tekrarDenemeSaniye`); büyük harf kilidi uyarısı.
- **Çevrimdışı**: kenar çubuğunda kesikli sarı "ÇEVRİMDIŞI" künyesi (`role=status`).

## Erişilebilirlik tabanı

`focusRing` her tıklanabilirde — **çift çizgi halka** (`FOCUS_HALKA`: 2 px tükenmez + 2 px
boşluk + 1 px ince; antet çizgisi/Damga çerçevesiyle aynı dil) · renk tek sinyal değil (ikon +
metin) · telefonda 44px dokunma hedefi (`data-dokunma`) · 16px girdi puntosu (iOS zoom) · AA
kontrast iki temada.

## Teslim öncesi

- [ ] 1440 / 1080p / 390 genişlikte yatay kayma yok
- [ ] Açık + koyu tema ekran görüntüsüyle bakıldı
- [ ] Ekran başına ≤2 damga (bütçe kodda zorlanır; yine de `[data-damga-cip]` sayısına bak), 1 primary buton
- [ ] `npm test` — temaKontrast sözleşmesi yeşil
- [ ] Elle hex yok (`grep '#[0-9a-f]\{6\}'` yalnız THEME_CSS)
