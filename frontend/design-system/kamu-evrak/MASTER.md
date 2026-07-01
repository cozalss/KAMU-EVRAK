# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** kamu-evrak
**Generated:** 2026-06-26 (ui-ux-pro-max) · **Revize/aktif tema:** 2026-07-01
**Category:** Government/Public Service · **Yön:** "Hero Light" (Açık, herodan türetilmiş pastel)

> **AKTİF TEMA — HERO LIGHT.** Landing sayfasının hero görseli (`frontend/public/portfolio/hero.webp`
> — sıcak fildişi zemin + pudra-gül → lavanta → gök mavisi pastel gökyüzü + hero manşetindeki tek
> mercan kırmızısı nokta) çalışma-alanı temasının **tek renk kaynağıdır.** Token'lar
> `frontend/src/components/neonUi.jsx`'te (`MONO`, `SANS`, `T`, `V`, `R`, `PAL`, `BANT`,
> `focusRing`, `SR_ONLY`, `NEON_KEYFRAMES` + atom bileşenler). Uygulama kabuğu `DashboardApp.jsx`
> bu atomları kullanır; stil **satır-içidir** (CSS sınıf sistemi değil), yalnız
> `@keyframes` için tek bir `<style>{NEON_KEYFRAMES}</style>` vardır (isim `NEON_KEYFRAMES`
> tarihseldir — animasyon mekaniği renkten bağımsız, aynen korunur).
>
> **Landing page ayrı kalır.** `frontend/index.html` + `frontend/src/portfolio/**` (hero, nav,
> bölümler) bu değişiklikten **etkilenmez** — kendi açık/nötr paletini korur, buraya dokunulmaz.
> Hero'nun rengi yalnız **çalışma alanına (app.html)** referans olarak taşınır.
>
> **ESKİ AÇIK TEMA (legacy, yedek, unmounted).** "Kurumsal Devlet" teması (`App.jsx` +
> `frontend/src/styles/kamu-evrak.css`, Lexend/Source Sans) `main.jsx`'te artık render edilmiyor
> (yalnız `AuthPage`/`DashboardApp` render edilir). CSS dosyası global reset + sonuç kartı (`rc-*`)
> ve ajan-akış (`agw-*`) yardımcı stilleri için hâlâ yüklenir; `:root` token'ları Hero Light ile
> hizalandı (bkz. aşağıdaki tablo) ama sınıf bazlı kurulum genişletilmez.
>
> **NEON DARK (2026-06-27 → 2026-06-30) artık geçersiz.** Aşağıdaki tablo eski teal/mor neon
> paletini **Hero Light** değerleriyle değiştirir; MASTER.md'nin önceki revizyonlarında geçen
> `#2ee6c9`/`#b794ff`/`#121829` gibi hex'ler artık kullanılmaz.

---

## Global Rules

### Color Palette — Hero Light

Kaynak: `neonUi.jsx` → `T`, `V`, `R`, `PAL`, `BANT`. Örnekleme: `frontend/public/portfolio/hero.webp`
piksel ortalaması (blush ~`#efe7e7`, lavanta ~`#e5dce1`, gök mavisi ~`#dbe0e3`, taban krem
~`#f1eeeb`, kağıt taupe ~`#b3afac`, manşet mürekkebi `#161616`, mercan nokta `#ff3b30`).

| Rol | Hex / değer | Token (`neonUi.jsx`) |
|------|-------------|----------------------|
| Birincil aksan (hero gök mavisi, koyulaştırılmış) | `#2f8fa6` | `T` |
| İkincil aksan (hero lavantası, koyulaştırılmış) | `#8b5cb0` | `V` |
| İmza aksanı (hero'nun mercan noktası — YALNIZ küçük dokunuşlarda) | `#e0563c` | `R` |
| Ana arka plan (sıcak fildişi) | `#f7f3ee` | `PAL.bg` |
| Derin zemin (sidebar / dropdown / modal) | `#efe6da` | `PAL.bg2` |
| Kart yüzeyi | `#ffffff` | `PAL.surf` |
| Yüksek yüzey (hafif koyu leke) | `rgba(35,26,18,.05)` | `PAL.surfHi` |
| Kenar / çizgi | `rgba(35,26,18,.12)` | `PAL.line` |
| Güçlü kenar | `rgba(35,26,18,.22)` | `PAL.lineHi` |
| Metin — başlık (hero manşet siyahı) | `#161616` | `PAL.ink` |
| Metin — gövde | `#3a3229` | `PAL.ink2` |
| Metin — soluk / soluk2 / soluk3 | `#6b6255` / `#57503f` / `#8a8172` | `PAL.mut` / `mut2` / `mut3` |
| Risk — YEŞİL (düşük) | `#2f9e6e` | `BANT.yesil` |
| Risk — SARI (orta) | `#c98a1f` | `BANT.sari` |
| Risk — KIRMIZI (yüksek) | `#c9432f` | `BANT.kirmizi` |

**Gradyanlar & ışıma:**
- Birincil buton: `linear-gradient(135deg, <accent>, <accent>cc)`, metin `#fbf7f0` (açık — dolgu artık
  orta-koyu ton, koyu metin okunmaz), glow `0 8px 20px -10px <accent>99`.
- Marka wordmark (sidebar/AuthPage): `linear-gradient(100deg, R 0%, V 48%, T 100%)` — hero'nun
  pudra-gül→lavanta→gök mavisi yayının koyulaştırılmış, okunur metin versiyonu.
- Kullanıcı avatarı: `linear-gradient(135deg, V, Vcc)`.
- Odak halkası (`focusRing`): `0 0 0 2px PAL.bg, 0 0 0 4px T`.

**Color Notes:** Sıcak fildişi zemin üzerine **gök mavisi birincil + lavanta ikincil** aksan;
mercan `R` yalnız imza dokunuşlarında (sidebar wordmark noktası vb.) — buton/CTA rengi DEĞİLDİR
(kırmızı risk bandıyla karışmasın diye). Renk asla TEK sinyal değildir — her durumda ikon + metin
eşlik eder (risk bandı: renk + etiket `YEŞİL/SARI/KIRMIZI` + açıklama). Görev ayrımı renkle
desteklenir (Görev 1 gök mavisi eğilimli, Görev 2 lavanta eğilimli). Kontrast AA hedeflenir
(ink `#161616` açık zemin üstünde yüksek kontrast).

### Typography — Hero Light

- **Heading / UI Font:** Space Grotesk (`SANS = "'Space Grotesk',system-ui,sans-serif"`)
- **Mono / etiket / veri Font:** IBM Plex Mono (`MONO = "'IBM Plex Mono',ui-monospace,monospace"`)
- **Mood:** warm, editorial-technical, AI-native, calm command-center, precise, confident
- **Hosting:** `frontend/app.html` → Google Fonts (`Space Grotesk` 400–700 + `IBM Plex Mono` 400–600,
  `display=swap`). Eski açık temanın yerel woff2'leri (Lexend / Source Sans 3) yalnız legacy için durur.

**Kullanım:** Başlık/buton/gövde → `SANS`. Eyebrow, etiket (uppercase + letter-spacing), KV veri satırları,
alt başlık (subline), sayaç rozetleri → `MONO`.

### Shape & Radius

| Öğe | Yarıçap |
|------|---------|
| Kart (`NeonCard`) | `14px` (üst kenar 2px accent şeridi) |
| Buton / nav öğesi | `10px` |
| İkon çipi (büyük, 64px) | `18px` |
| Rozet / tag | `7–8px` |
| Avatar / küçük amblem | `9–11px` |

### Motion

Kaynak: `NEON_KEYFRAMES` (tek `<style>` bloğu). Tümü compositor-dostu (`transform`/`opacity`).

| Keyframe | Amaç |
|----------|------|
| `nu-dotpulse` | Canlı durum noktası nabzı |
| `nu-spin` | Yükleniyor / işleniyor spinner |
| `nu-scanv` | Dikey tarama çizgisi (OCR/işleme hissi) |
| `nu-think` | "Düşünüyor" opaklık pulsu |
| `nu-rise` | İçerik giriş animasyonu (alttan yüksel) |
| `nu-ring` | Yayılan halka (vurgu) |

`prefers-reduced-motion: reduce` mutlaka karşılanır (animasyonlar kapanır).

---

## Component Specs (neonUi.jsx atomları)

Tümü satır-içi stil; `T`/`V`/`R`/`PAL` token'larını kullanır. Yeni UI bu atomlardan kurulur.

- **`ViewWrap({ id, title, sub, actions, children })`** — görünüm kabuğu: `h2` başlık (`SANS`),
  `MONO` alt başlık, sağ aksiyon alanı; kaydırılır sayfa (`padding: 26px 32px 48px`).
- **`NeonCard({ title, tag, tagColor, accent=T, full })`** — `PAL.surf` (beyaz kağıt) zemin,
  `PAL.line` kenar, **üstte 2px accent şeridi** (`borderTop`), `14px` yarıçap; başlık `MONO`
  uppercase eyebrow. (İsim tarihseldir — "Neon"Card kalır, görünüm artık açık/kağıt.)
- **`KV({ k, v, c })`** — anahtar/değer satırı; `MONO`, alt kenar `1px dashed PAL.line`.
- **`Btn({ children, accent=T, primary, disabled })`** — `primary`: dolu accent gradyan + glow,
  metin açık `#fbf7f0` (dolgu orta-koyu, koyu metin okunmaz); aksi halde **ghost**: `accent+"14"`
  zemin, `accent+"55"` kenar, accent metin.
- **`EmptyState({ icon, title, sub, actions })`** — ortalanmış boş durum; `T` tonlu 64px ikon çipi,
  anlamlı yönlendirme metni + aksiyon.
- **`Icon`** — stroke (çizgi) ikon seti: `grid, inbox, spin, doc, book, shield, upload, plus,
  arrow, chart, clock, scale, route`. `currentColor` ile renklenir (aktifken `T`).

**a11y atomları:** `focusRing` (her tıklanabilir öğeye yayılır — `onFocus/onBlur` box-shadow halka),
`SR_ONLY` (ekran okuyucu metni).

---

## Naming & Architecture Conventions

- **Tasarım atomları:** `frontend/src/components/neonUi.jsx` (tek kaynak). Renk/font/animasyon
  buradan import edilir; **hex değer satır-içine elle yazılmaz**, token kullanılır.
- **Bileşen adlandırma:** kabuk/parça `Neon*` (`NeonSidebar`, `NeonDetay`); bölüm görünümleri
  `*View` (`PanelView`, `GelenEvrakView`, `TaslaklarView`, `MevzuatView`, `DenetimView`);
  canlı ajan akışı `CanliAjanAkisi`.
- **Stil yaklaşımı:** satır-içi stil + `neonUi` atomları. Çalışma alanı kabuğu için CSS sınıf
  sistemi YOK; yalnız `@keyframes` global `<style>` bloğundadır.
- **Navigasyon:** `NeonSidebar` öğeleri gerçek `activeView` değiştirir (Panel/Gelen/İşleniyor/
  Taslaklar/Mevzuat/Denetim).
- **Legacy köprü:** `rc-*` (sonuç kartı) ve `agw-*` (ajan akış) sınıfları hâlâ `kamu-evrak.css`'te
  (yalnız unmounted `App.jsx` yolunda render edilir); `:root` token'ları Hero Light ile hizalı.
  Aktif çalışma alanında (`DashboardApp.jsx`) kullanılmazlar — yeni iş `neonUi.jsx` atomlarından
  kurulur.

---

## Style Guidelines

**Style:** Hero Light (Açık, warm pastel, AI-native) — **Accessible & Ethical** ilkeleri korunur.

**Keywords:** warm ivory surface, hero-derived accent (dusty blue/violet), high contrast dark ink text,
monospace data, live/real-time feedback, keyboard navigation, screen-reader friendly, focus rings,
semantic, reduced-motion.

**Best For:** AI ajan panelleri, real-time işleme/komuta merkezi, teknik gösterim (demo), govtech.

**Key Effects:** Belirgin odak halkaları (`T` `4px`), ARIA etiketleri, canlı durum nabzı, tarama/akış
animasyonları, 44×44px dokunma hedefleri, `prefers-reduced-motion` desteği.

### Page Pattern

**Pattern Name:** Workspace + Live Flow

- **Sol:** kalıcı `NeonSidebar` (marka + işlevsel nav + yükle/örnek).
- **İçerik:** seçili `*View`; işleme sırasında `CanliAjanAkisi` (canlı ajan akışı = demo yıldızı).
- **Akış:** Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç oturum geçmişine → Panel'de özet.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Neon/dark yüzeyleri geri sızdırmak** — kabuk artık sıcak fildişi (`PAL.bg`) açık zemin.
- ❌ **Token yerine elle hex** — `T`/`V`/`R`/`PAL`/`BANT` kullan; rastgele renk ekleme.
- ❌ **`R` (mercan) genel buton/CTA rengi olarak kullanmak** — yalnız imza/dekoratif dokunuşlar;
  `BANT.kirmizi` (risk) ile karışmasın.
- ❌ **Emoji ikon** — `neonUi` `Icon` setini (stroke SVG) kullan.
- ❌ **`cursor:pointer` eksikliği** — tüm tıklanabilirlerde olmalı.
- ❌ **Görünmez odak durumu** — `focusRing` her etkileşimli öğede.
- ❌ **Renk = tek sinyal** — ikon + metin + (risk) etiket eşlik eder.
- ❌ **Layout kaydıran hover** — yalnız `transform`/`opacity` (compositor-dostu).
- ❌ **`prefers-reduced-motion` yok saymak** — animasyonlar kapanabilmeli.
- ❌ **Düşük kontrast metin** — açık zeminde AA korunur (ink `#161616`, mut2 `#57503f`).

---

## Pre-Delivery Checklist

UI kodu teslim etmeden önce doğrula:

- [ ] Renk/font/animasyon `neonUi.jsx` token'larından (elle hex yok)
- [ ] Sıcak fildişi yüzey + gök mavisi/lavanta aksan tutarlı (eski neon/koyu yüzey sızmamış)
- [ ] İkonlar `neonUi` `Icon` setinden (emoji yok)
- [ ] Tüm tıklanabilirlerde `cursor:pointer`
- [ ] `focusRing` ile görünür klavye odağı
- [ ] Renk tek sinyal değil (ikon + metin + etiket)
- [ ] Açık zeminde metin kontrastı AA (≥ 4.5:1 gövde)
- [ ] Hover/aktif geçişleri yumuşak (150–300ms), layout kaydırmıyor
- [ ] `prefers-reduced-motion` karşılanıyor
- [ ] Responsive: 375px, 768px, 1024px, 1440px — yatay taşma yok
- [ ] Sabit kabuk arkasına içerik gizlenmiyor
