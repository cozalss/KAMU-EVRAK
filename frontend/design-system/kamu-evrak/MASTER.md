# kamu-evrak — Tasarım Sistemi: "Antet & Damga" (v3, 2026-10)

> Tek kod kaynağı: `frontend/src/components/neonUi.jsx` (token + atom). Bu dosya NEDEN'i ve
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
   `nu-damga`. **Dikkat bütçesi:** ekran başına en fazla 1–2 damga. Her çipi damgaya çevirme;
   damga = "bu görünümün hükmü".
3. **Dosya sırtı** (kenar çubuğu aktif öğesi): seçili öğe rayın sağ kenarını aşıp sayfa
   zeminiyle birleşir (iç bükey köşeler), `layoutId` ile öğeler arasında kayar.

## Token'lar

- Renk: yalnız `PAL` / `T` `V` `R` / `BANT` / `DERIN` / `ALFA()` / `IRIS`. Hex yalnız
  `THEME_CSS`'te. Açık zeminde renkli METİN yalnız `DERIN.*` (AA).
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
yükseklik ışıkla (iç üst-kenar parlaması). Ray daha da koyu (#07080d); dosya sırtı yine
sayfa zeminine bağlanır (`--ke-sayfa*` token'ları :root'ta hesaplanıp miras alınır).

## Kütüphaneler

`motion` · Radix · `vaul` · `embla` · `lucide-react` · shadcn/ui (`src/components/ui/`).
Tailwind YALNIZ çalışma alanında (`tailwind.app.config.js`, renkler `var(--ke-*)`,
preflight kapalı, `@tailwind base` satırı SİLİNMEZ). AGPL bağımlılık yok.

## Erişilebilirlik tabanı

`focusRing` her tıklanabilirde · renk tek sinyal değil (ikon + metin) · telefonda 44px
dokunma hedefi (`data-dokunma`) · 16px girdi puntosu (iOS zoom) · AA kontrast iki temada.

## Teslim öncesi

- [ ] 1440 / 1080p / 390 genişlikte yatay kayma yok
- [ ] Açık + koyu tema ekran görüntüsüyle bakıldı
- [ ] Ekran başına ≤2 damga, 1 primary buton
- [ ] Elle hex yok (`grep '#[0-9a-f]\{6\}'` yalnız THEME_CSS)
