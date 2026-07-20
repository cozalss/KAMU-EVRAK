# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** kamu-evrak
**Generated:** 2026-06-26 (ui-ux-pro-max) · **Revize/aktif tema:** 2026-07-02 — **Hero Light v2 "Sakin Ürün"**
**Category:** Government/Public Service · **Yön:** açık, herodan türetilmiş palet + gerçek-ürün disiplini

> **AKTİF TEMA — HERO LIGHT v2.** Palet landing hero'sundan türetilmiş sıcak fildişi + gök
> mavisi/mercan; **2026-07 revizyonu:** Görev-2 ikincili lavanta → mühür moru (`V #8e3d66`,
> "AI pasteli"nden çıkış — T/R/nötr/BANT hex'leri v1 ile bit-aynı kaldı).
> v2 revizyonu **dekorasyon dilini söker**: border-first
> yüzey, düz dolgular (gradyan/glow sıfır), sentence case, mono yalnız makine verisi, 7 kademeli
> tip ölçeği. Referans: Geist (kenar/gölge), Radix (tip/radius adımları), IBM Carbon
> (sentence-case/spacing), GOV.UK (işlevsel renk). Token'lar
> `frontend/src/components/neonUi.jsx`'te (`MONO, SANS, T, V, R, PAL, BANT, DERIN, DERIN_OF,
> ALFA, TYPE, TNUM, RAD, SP, SH, EASE, focusRing, SR_ONLY, NEON_KEYFRAMES` + atom bileşenler).
> Stil **satır-içidir** (CSS sınıf sistemi değil); tek `<style>` yalnız `@keyframes`.
>
> **Landing page ayrı kalır.** `frontend/index.html` + `frontend/src/portfolio/**` bu temadan
> **etkilenmez** — kendi paletini korur, buraya dokunulmaz.
>
> **Süperseded:** "Neon dark" (2026-06-27→30) ve "Hero Light v1" (2026-07-01 — Space Grotesk +
> gradyan/glow/ikon-çipli kart dili). v1'in görsel süslemeleri (kart üstü accent şeridi, radyal
> köşe ışıması, hover kalkışı, uppercase mono eyebrow, gradyan buton) **artık anti-pattern'dir.**

---

## Global Rules

### 0. İlkeler

1. **Renk yalnız işlevseldir** (GOV.UK): aksan = eylem/durum; dekorasyon için renk yok.
2. **Tek derinlik dili** (border-first): statik yüzey = 1px hairline; gerçek gölge yalnız havada
   duran katman (dropdown/tooltip/modal/toast).
3. **Sentence case varsayılan**: "GELEN EVRAK" değil "Gelen evrak".
4. **Mono = makine verisi**, başka hiçbir yerde.
5. **Hareket = bilgi**: yalnız yüklenme/canlılık sinyali animasyonlu.
6. **Ölçek dışı değer yazılamaz**: tip 7 kademe (`TYPE`), radius 4 token + nokta (`RAD`),
   boşluk 7 adım (`SP`), alfa eki yalnız `ALFA()` (`"14"`). Görünüm dosyalarında elle hex = 0.

### Color Palette — Hero Light (v1 ile aynı hex'ler)

| Rol | Hex / değer | Token (`neonUi.jsx`) |
|------|-------------|----------------------|
| Birincil aksan (eylem/durum — dolgu) | `#2f8fa6` | `T` |
| İkincil aksan (yalnız Görev 2 semantiği: ikon/nokta/vurgu) — mühür moru (2026-07: lavanta `#8b5cb0` → mühür; "AI pasteli"nden çıkış, GOV.UK işlevsel renk ilkesi) | `#8e3d66` | `V` |
| İmza aksanı (yalnız marka noktası — CTA/çip/dolgu ASLA) | `#e0563c` | `R` |
| Ana arka plan (sıcak fildişi) | `#f7f3ee` | `PAL.bg` |
| Derin zemin (sidebar) | `#efe6da` | `PAL.bg2` |
| Kart yüzeyi / ikincil yüzey | `#ffffff` / `#fdfbf7` | `PAL.surf` / `PAL.surf2` |
| Kenar / güçlü kenar / form input kenarı | `rgba(35,26,18,.12/.22/.35)` | `PAL.line/lineHi/inputLine` |
| Hover / basılı-seçili zemin | `rgba(35,26,18,.04/.07)` | `PAL.hov/press` |
| Metin — başlık / gövde | `#161616` / `#3a3229` | `PAL.ink` / `ink2` |
| Metin — soluk ×3 | `#6b6255 / #57503f / #7a7060` | `PAL.mut/mut2/mut3` (mut3 2026-07-16: `#8a8172`→`#7a7060`, 12px metinde AA) |
| Koyu dolgu üstü metin | `#fbf7f0` | `PAL.onAccent` |
| Toast zemini | `#2a251e` | `PAL.inkSurf` |
| Risk YEŞİL/SARI/KIRMIZI | `#2f9e6e / #c98a1f / #c9432f` | `BANT` |

**AA metin türevleri (`DERIN`):** açık zeminde ham `T/V/R/BANT.c` **metin rengi olamaz**
(kontrast yetersiz). Renkli metin daima `DERIN.T #1f6d82 · DERIN.V #74304f · DERIN.R #a23425 ·
DERIN.yesil #1f7a52 · DERIN.sari #8a5a10 · DERIN.kirmizi #a23425`; ham→türev eşleme
`DERIN_OF(renk)`. Primary buton dolgusu `DERIN.T`, hover `DERIN.Th #1a5e71`.

**Tayın kuralları:** `T` = tek birincil eylem rengi, **ekran başına 1 primary buton**. `V` =
yalnız Görev 2 semantiği (asla yüzey dolgusu/geniş alan). `R` = tek imza dokunuşu (marka noktası).
`BANT` = yalnız gerçek risk durumu. Tint zemin yalnız `ALFA(renk)` (%8). **Gradyan ve renkli
glow tüm çalışma alanında SIFIRDIR.**

### Typography — 7 kademe (`TYPE`)

- **UI/metin:** IBM Plex Sans (`SANS`) — 400 gövde · 500 buton/form etiketi · 600 başlık (700 yok).
- **Veri:** IBM Plex Mono (`MONO`) — 400/500; **yalnız makine verisi:** evrak/kayıt no,
  tarih-saat damgası, hash, maskeli PII, dosya adı/teknik kimlik (12–13px, tracking 0).
- **Hosting:** `frontend/app.html` → Google Fonts (`IBM+Plex+Sans:400;500;600` +
  `IBM+Plex+Mono:400;500`, `display=swap`). Space Grotesk kaldırıldı.

| Token | px/lh | Kullanım |
|---|---|---|
| `TYPE.meta` | 12/16 | meta satırı, tarih etiketi, çip metni, form etiketi (500) |
| `TYPE.data` | 13/18 | tablo hücresi, KV, liste ikincil satırı |
| `TYPE.ui` | 14/20 | **UI varsayılanı** — gövde 400, buton 500, kart başlığı 600 |
| `TYPE.read` | 16/24 | uzun okuma (özet, taslak metni) |
| `TYPE.h2` | 20/26·600 | sayfa/bölüm başlığı |
| `TYPE.num` | 24/28·600 | panel metrikleri (tabular-nums) |
| `TYPE.h1` | 28/34·600 | yalnız AuthPage başlığı |
| `TYPE.disp` | 36/42·600 | **yalnız hüküm kartı** (işleniyor ekranının ilk görülen kartı): hüküm başlığı + 2 karar-kritik olgu (HukumDurak — evrak türü, hedef birim). Başka hiçbir yüzeyde kullanılmaz; enflasyon yasak |

Sayısal kolon/metrik: SANS + `TNUM` (tabular-nums) — metrikte mono yasak. Yarım piksel ve
tablo-dışı fontSize yasak. Uppercase yalnız: doğal kısaltmalar (PDF, DOCX, EYP, SHA-256, KEP,
EBYS, TCKN, SDP) + risk kodu `BANT.l` (YEŞİL/SARI/KIRMIZI, mono 12).

### Shape & Radius (`RAD`)

`chip:4` durum çipi · `ctl:6` buton/input/dropdown satırı · `card:8` kart/panel ·
`pop:12` dropdown/tooltip/modal/toast · `dot:"50%"` yalnız gerçek nokta/avatar.
Yasak: 16+ radius, 999 pill, ara değerler.

### Kenar / Gölge (`SH`) — border-first

Statik yüzey: `1px solid PAL.line` + en fazla `SH.card` (`0 1px 2px rgba(35,26,18,.05)`).
Havada duran katman: `SH.pop` (dropdown/tooltip) · `SH.modal` (modal/toast). Renkli boxShadow ve
textShadow = 0. Form input: `1px solid PAL.inputLine`. `focusRing` (2px bg + 4px T) aynen.

### Spacing (`SP`) — 7 adım

`4 / 8 / 12 / 16 / 24 / 32 / 48`. Kart iç dolgusu 16 · kart içi öğe arası 8–12 · grid gap 16 ·
bölümler arası 24 · sayfa çerçevesi `"24px 32px 48px"` (ViewWrap). Serbest değer yazılmaz.

### Motion — hareket = bilgi

Çekirdek keyframe'ler (3): `nu-spin` (gerçek yükleme) · `nu-think` (canlılık, yalnız opacity) ·
`nu-rise` (görünüm girişi, tek sefer ~160ms, stagger'sız). **SAHNE Epik istisnası** (yalnız
CanliAjanAkisi/CanliMetro canlı koşum sahnesi; 2026-07-16 kullanıcı onayıyla "sakinlik" bu
sahnede esnetildi — çekirdek tema değişmedi): `nu-iz` (aktif istasyona giren rayda çift ışık
kuyruğu) · `nu-pop` (tamamlanma vuruşu, spring easing) · `nu-halka` (tek seferlik dışa yayılan
ışıklı halka) · `nu-gezin` (kart arkası aurora sürüklenmesi) + hat renginde düşük-alfa **glow**
(`color-mix ≤%55`) ve ray/aurora'da gradyan + `NumberFlow` sayaç yuvarlanması + `EASE.spring`.
Bu sahne DIŞINDA glow/gradyan yasağı aynen sürer. Hepsi reduced-motion'da söner.
**Hover'da** transform yasak (translateY/scale yok) — hover = zemin tonu (`PAL.hov`),
120–160ms ease-out.

**Press feedback (emil-design-eng, 2026-07-13):** tıklanabilir öğe **basılınca** (`:active`)
`scale(0.97)` — "arayüz kullanıcıyı duyuyor" geri bildirimi (hareket=bilgi; hover değil press,
yasağı çiğnemez). Opt-in: öğeye `data-press=""` + transition'a `transform` eklenir;
kural `NEON_KEYFRAMES`'te `[data-press]:active:not(:disabled){transform:scale(.97)}`. Kullananlar:
`Btn`, `BuyutDugme`, `CopyChip`, HITL butonları (Onayla/Düzenle/Reddet), mevzuat seçim kutucuğu.
**Easing token'ları (`EASE`):** güçlü özel eğriler — `EASE.out cubic-bezier(0.23,1,0.32,1)`
(giriş/çıkış + press) · `EASE.inOut cubic-bezier(0.77,0,0.175,1)` (ekran-içi hareket); yerleşik
`ease-*` zayıf sayılır. Hover/renk geçişi `ease` kalır. `prefers-reduced-motion: reduce` mutlaka
karşılanır (press `:active` durum stili olduğundan orada anında/animasyonsuz uygulanır).

### Etkileşim kütüphanesi katmanı (2026-07-20 — headless/unstyled, YALNIZ bunlar)

> Önceki kural "yalnız react/react-dom" idi (bkz. `CONTRIBUTING.md`); bu revizyon onu
> **headless kütüphanelere** genişletti — hiçbiri kendi görünümünü/CSS sınıf sistemini
> getirmez, hepsi `style` prop'uyla `neonUi.jsx` token'larından boyanır. **Stilli** kütüphane
> (MUI/Chakra/shadcn/daisyUI vb.) hâlâ yasak — "Stil satır-içidir, CSS sınıf sistemi değil"
> kuralı bu kütüphanelerle de bozulmaz.

| Kütüphane | Nerede | Verdiği | Token disiplini |
|---|---|---|---|
| `motion` (framer-motion) | `NeonSidebar` (aktif-sekme `layoutId`), `BelgeModal` (giriş/çıkış) | Layout/mount animasyonu — CSS `@keyframes`'in yapamadığı "eski konumdan yeni konuma kayma" | `transition.ease` sayısal eşleniği `EASE_BEZIER` (neonUi.jsx) — `EASE`'in JS-tarafı ikizi, aynı kübik-bezier değerleri |
| `lucide-react` | `Icon.*` (neonUi.jsx) | Tutarlı stroke ikon seti | Tek `strokeWidth={1.75}`; boyutlar eski elle-çizim değerleriyle bit-aynı; `spin` istisna (elle kalır) |
| `@radix-ui/react-dialog` | `BelgeModal`, `HesapMenu`'nün `Kip` alt-modalları | Odak tuzağı/Esc/dış-tık/scroll-kilidi/odak-iade | Tamamen unstyled; `style` prop'uyla `PAL/RAD/SH` |
| `@radix-ui/react-dropdown-menu` | `HesapMenu` açılır menüsü | Roving-focus/ok-tuşu/Home-End/tip-ahead | Aynı |
| `@radix-ui/react-tooltip` | `InfoTip` (Risk bandı) | Popper konumlandırma (viewport-kaçınmalı) | Aynı |
| `vaul` | `TelefonYukle` | Alttan-açılan panel (Drawer), Radix Dialog üzerine kurulu | Aynı; `Drawer.Handle` `PAL.lineHi` ile boyanır |
| `embla-carousel-react` | `AltTaslakPager` | Dokunmatik/momentum swipe | Sıfır görsel varlık getirmez — tamamen mevcut `AltTaslakKarti` görünümü |

**MotionConfig:** `DashboardApp.jsx` kökü `<MotionConfig reducedMotion="user">` ile sarılıdır —
`prefers-reduced-motion` OS ayarı motion'ın TÜM animasyonlarını (mevcut CSS
`@media (prefers-reduced-motion: reduce)` kuralına ek olarak) otomatik söndürür.

**Portal notu:** Radix `Dialog.Portal`/`DropdownMenu.Portal` varsayılan `document.body`'ye
portallar — `AltTaslakPager` gibi `transform` uygulayan sarmalayıcıların İÇİNDE render edilen
eski hand-rolled modallerin yaşadığı "position:fixed ata-transform'a hapsolur" bug sınıfı
artık **yapısal olarak** oluşamaz (modal DOM'da o ağacın dışında).

---

## Component Specs (neonUi.jsx atomları)

- **`ViewWrap`** — `TYPE.h2` başlık + SANS `TYPE.data` alt başlık; `padding:"24px 32px 48px"`.
- **`NeonCard`** — düz `PAL.surf` + `1px PAL.line` + `RAD.card` + `SH.card`; başlık satırı:
  kutusuz 16–18px satır-içi ikon (accent yalnız ikon rengi) + SANS 14/600 sentence-case başlık +
  sağda düz `TYPE.meta PAL.mut` tag metni. Üst şerit/ikon kutusu/gradyan/hover kalkışı YOK.
  Kart içinde kart yasak — iç gruplama boşluk + gerekirse `1px PAL.line` üst çizgi.
- **`KV`** — düz `1px PAL.line` alt çizgi; anahtar `TYPE.meta PAL.mut3`, değer SANS `TYPE.data`/500+TNUM.
- **`Btn`** — primary: düz `DERIN.T` + `PAL.onAccent`, hover `DERIN.Th` · secondary (varsayılan):
  `#fff` + `1px PAL.inputLine` + `PAL.ink`, hover `PAL.hov` · disabled: `PAL.press`+`PAL.mut2`.
  36px yükseklik, `RAD.ctl`, SANS 14/500. Ekran başına 1 primary.
- **`EmptyState`** — kutusuz 24px `PAL.mut` ikon; başlık `TYPE.ui`/600; alt metin `TYPE.data`.
- **`Icon`** — stroke set + `check/x/alert` (✓/✕/⚠ karakterleri yerine SVG).
- **`RiskBand`** — "Risk bandı" `TYPE.meta` etiketi + üç düz nokta + `ALFA(BANT)` tint'li mono
  durum kodu; glow yok. `InfoTip` a11y deseni aynen.

**a11y atomları:** `focusRing`, `SR_ONLY`.

---

## Naming & Architecture Conventions

- Tasarım token'ları **yalnız** `frontend/src/components/neonUi.jsx` — görünüm dosyalarında elle
  hex/serbest fontSize/serbest radius yazılmaz.
- Bileşen adlandırma: kabuk/parça `Neon*`, görünümler `*View`, canlı akış `CanliAjanAkisi`
  (isimler tarihsel).
- Satır-içi stil + `neonUi` atomları; CSS sınıf sistemi yok; `@keyframes` tek `<style>` bloğunda.
- Legacy köprü: `rc-*`/`agw-*` sınıfları `kamu-evrak.css`'te yalnız unmounted `App.jsx` için durur.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Gradyan/glow/radyal blob** — hepsi sıfır; düz dolgu + hairline.
- ❌ **Kart üstü renkli accent şeridi, ikon çipi kutusu, hover'da kalkan kart** (v1 kalıntısı —
  "AI yaptı" imzası).
- ❌ **Uppercase+letterspaced eyebrow etiket** — sentence case; mono etiket dili yok.
- ❌ **Mono'yu başlık/etiket/buton/paragrafta kullanmak** — yalnız makine verisi.
- ❌ **Ham `T/V/R/BANT.c`'yi açık zeminde metin rengi yapmak** — `DERIN.*` kullan.
- ❌ **Çip enflasyonu** — satır başına en fazla 1 semantik durum çipi; kalanı ` · ` ayraçlı düz meta.
- ❌ **Token yerine elle hex / `+"55"` gibi alfa yapıştırma** — `PAL/DERIN/ALFA`.
- ❌ **Ölçek dışı fontSize/radius/boşluk** — `TYPE/RAD/SP`.
- ❌ Emoji ikon · `cursor:pointer` eksikliği · görünmez odak · renk=tek sinyal ·
  layout kaydıran hover · `prefers-reduced-motion` yok saymak · düşük kontrast.
- ❌ **`R` (mercan) CTA/çip/dolgu olarak** — yalnız marka noktası.

---

## Pre-Delivery Checklist

- [ ] `grep "gradient|textShadow|textTransform"` (çalışma alanı) = 0; renkli glow boxShadow = 0
- [ ] fontSize ⊆ {12,13,14,16,20,24,28} · borderRadius ⊆ {4,6,8,12,"50%"} · boşluk ⊆ SP
- [ ] Görünüm dosyalarında elle hex = 0; renkli metin yalnız `DERIN.*` (AA ≥ 4.5)
- [ ] Mono yalnız makine verisinde; metrik sayılar SANS+TNUM
- [ ] Sentence case (kısaltma + risk kodu istisna); eyebrow/tracking yok
- [ ] Ekran başına ≤ 1 primary buton; çip yalnız semantik durum
- [ ] `focusRing` tüm etkileşimlilerde · `prefers-reduced-motion` çalışıyor · keyframes = {spin, think, rise} + sahne {iz, pop, halka, gezin}
- [ ] Landing diff'i boş (`index.html`, `src/portfolio/**`) · T/R/nötr/BANT hex'leri bit-değişmemiş (V = mühür moru `#8e3d66`, 2026-07)
- [ ] Responsive: 375/768/1024/1440 — yatay taşma yok
