# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** kamu-evrak
**Generated:** 2026-06-26 (ui-ux-pro-max) · **Revize/aktif tema:** 2026-06-27
**Category:** Government/Public Service · **Yön:** "Neon Komuta Merkezi" (Dark, AI-native)

> **AKTİF TEMA — NEON DARK.** Tek doğru kaynak `frontend/src/components/neonUi.jsx`
> içindeki token'lardır (`MONO`, `SANS`, `T`, `V`, `PAL`, `BANT`, `focusRing`,
> `SR_ONLY`, `NEON_KEYFRAMES` + atom bileşenler). Uygulama kabuğu `DashboardApp.jsx`
> bu atomları kullanır; stil **satır-içidir** (CSS sınıf sistemi değil), yalnız
> `@keyframes` için tek bir `<style>{NEON_KEYFRAMES}</style>` vardır.
>
> **ESKİ AÇIK TEMA (legacy, yedek).** "Kurumsal Devlet" açık teması (`App.jsx` +
> `frontend/src/styles/kamu-evrak.css`, Lexend/Source Sans, lacivert/mavi) artık
> **birincil değildir.** Sadece global reset + sonuç kartı (`rc-*`) ve ajan-akış
> (`agw-*`) yardımcı stilleri için yüklenir. **Yeni iş neon temada yapılır;** açık
> tema genişletilmez.

---

## Global Rules

### Color Palette — Neon Dark

Kaynak: `neonUi.jsx` → `T`, `V`, `PAL`, `BANT`.

| Rol | Hex / değer | Token (`neonUi.jsx`) |
|------|-------------|----------------------|
| Birincil aksan (teal) | `#2ee6c9` | `T` |
| İkincil aksan (mor) | `#b794ff` | `V` |
| Ana arka plan | `#121829` | `PAL.bg` |
| Derin zemin (sidebar / odak halka tabanı) | `#0f1626` | `PAL.bg2` |
| Kart yüzeyi | `rgba(255,255,255,.025)` | `PAL.surf` |
| Yüksek yüzey | `rgba(255,255,255,.05)` | `PAL.surfHi` |
| Kenar / çizgi | `rgba(255,255,255,.08)` | `PAL.line` |
| Güçlü kenar | `rgba(255,255,255,.14)` | `PAL.lineHi` |
| Metin — başlık | `#eaf0fb` | `PAL.ink` |
| Metin — gövde | `#dfe5f2` | `PAL.ink2` |
| Metin — soluk / soluk2 / soluk3 | `#9aa6c0` / `#7d89a4` / `#8b97b0` | `PAL.mut` / `mut2` / `mut3` |
| Risk — YEŞİL (düşük) | `#34d399` | `BANT.yesil` |
| Risk — SARI (orta) | `#fbbf24` | `BANT.sari` |
| Risk — KIRMIZI (yüksek) | `#f87171` | `BANT.kirmizi` |

**Gradyanlar & ışıma:**
- Birincil buton: `linear-gradient(135deg, #2ee6c9, #1ea7d6)`, metin `#06121a`, glow `0 8px 22px -10px <accent>`.
- Logo amblemi (sidebar): `linear-gradient(135deg, #5b8cff, #3a63d6)`, glow `0 6px 20px -6px rgba(91,140,255,.7)`.
- Kullanıcı avatarı: `linear-gradient(135deg, #b794ff, #7c5ce0)`.
- Odak halkası (`focusRing`): `0 0 0 2px #0f1626, 0 0 0 4px #2ee6c9`.

**Color Notes:** Koyu lacivert zemin üzerine **teal birincil + mor ikincil** neon aksan.
Renk asla TEK sinyal değildir — her durumda ikon + metin eşlik eder (risk bandı: renk + etiket
`YEŞİL/SARI/KIRMIZI` + açıklama). Görev ayrımı renkle desteklenir (Görev 1 teal eğilimli,
Görev 2 mor eğilimli). Kontrast AA hedeflenir (ink `#eaf0fb` koyu zemin üstünde yüksek kontrast).

### Typography — Neon Dark

- **Heading / UI Font:** Space Grotesk (`SANS = "'Space Grotesk',system-ui,sans-serif"`)
- **Mono / etiket / veri Font:** IBM Plex Mono (`MONO = "'IBM Plex Mono',ui-monospace,monospace"`)
- **Mood:** technical, AI-native, command-center, precise, high-tech, confident
- **Hosting:** `frontend/index.html` → Google Fonts (`Space Grotesk` 400–700 + `IBM Plex Mono` 400–600,
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

Tümü satır-içi stil; `T`/`V`/`PAL` token'larını kullanır. Yeni UI bu atomlardan kurulur.

- **`ViewWrap({ id, title, sub, actions, children })`** — görünüm kabuğu: `h2` başlık (`SANS`),
  `MONO` alt başlık, sağ aksiyon alanı; kaydırılır sayfa (`padding: 26px 32px 48px`).
- **`NeonCard({ title, tag, tagColor, accent=T, full })`** — `PAL.surf` zemin, `PAL.line` kenar,
  **üstte 2px accent şeridi** (`borderTop`), `14px` yarıçap; başlık `MONO` uppercase eyebrow.
- **`KV({ k, v, c })`** — anahtar/değer satırı; `MONO`, alt kenar `1px dashed PAL.line`.
- **`Btn({ children, accent=T, primary, disabled })`** — `primary`: dolu teal→mavi gradyan + glow,
  metin `#06121a`; aksi halde **ghost**: `accent+"14"` zemin, `accent+"55"` kenar, accent metin.
- **`EmptyState({ icon, title, sub, actions })`** — ortalanmış boş durum; teal tonlu 64px ikon çipi,
  anlamlı yönlendirme metni + aksiyon.
- **`Icon`** — stroke (çizgi) neon ikon seti: `grid, inbox, spin, doc, book, shield, upload, plus,
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
- **Stil yaklaşımı:** satır-içi stil + `neonUi` atomları. Neon kabuk için CSS sınıf sistemi
  YOK; yalnız `@keyframes` global `<style>` bloğundadır.
- **Navigasyon:** `NeonSidebar` öğeleri gerçek `activeView` değiştirir (Panel/Gelen/İşleniyor/
  Taslaklar/Mevzuat/Denetim).
- **Legacy köprü:** `rc-*` (sonuç kartı) ve `agw-*` (ajan akış) sınıfları hâlâ `kamu-evrak.css`'te;
  bunlar açık-tema değişkenleriyle çalışır — neon ekranlarda kullanılıyorsa neon yüzeye uyarlanmalı,
  yeni açık-tema sınıfı eklenmez.

---

## Style Guidelines

**Style:** Neon Command Center (Dark, AI-native) — yine de **Accessible & Ethical** ilkeleri korunur.

**Keywords:** dark surface, neon accent (teal/violet), high contrast text, monospace data,
live/real-time feedback, keyboard navigation, screen-reader friendly, focus rings, semantic, reduced-motion.

**Best For:** AI ajan panelleri, real-time işleme/komuta merkezi, teknik gösterim (demo), govtech.

**Key Effects:** Belirgin odak halkaları (teal `4px`), ARIA etiketleri, canlı durum nabzı, tarama/akış
animasyonları, 44×44px dokunma hedefleri, `prefers-reduced-motion` desteği.

### Page Pattern

**Pattern Name:** Workspace + Live Flow

- **Sol:** kalıcı `NeonSidebar` (marka + işlevsel nav + yükle/örnek).
- **İçerik:** seçili `*View`; işleme sırasında `CanliAjanAkisi` (canlı ajan akışı = demo yıldızı).
- **Akış:** Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç oturum geçmişine → Panel'de özet.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Açık-tema (beyaz) yüzeyleri neon ekrana karıştırmak** — neon kabuk koyu kalır.
- ❌ **Token yerine elle hex** — `T`/`V`/`PAL` kullan; rastgele renk ekleme.
- ❌ **Emoji ikon** — `neonUi` `Icon` setini (stroke SVG) kullan.
- ❌ **`cursor:pointer` eksikliği** — tüm tıklanabilirlerde olmalı.
- ❌ **Görünmez odak durumu** — `focusRing` her etkileşimli öğede.
- ❌ **Renk = tek sinyal** — ikon + metin + (risk) etiket eşlik eder.
- ❌ **Layout kaydıran hover** — yalnız `transform`/`opacity` (compositor-dostu).
- ❌ **`prefers-reduced-motion` yok saymak** — animasyonlar kapanabilmeli.
- ❌ **Düşük kontrast metin** — koyu zeminde AA korunur.

> Not: Eski MASTER'daki "❌ dark mode / ❌ mor gradyan / ❌ motion" kuralları bu yön
> değişikliğiyle **geçersizdir** — aktif tema kasıtlı olarak dark + teal/mor + canlı motion.

---

## Pre-Delivery Checklist

UI kodu teslim etmeden önce doğrula:

- [ ] Renk/font/animasyon `neonUi.jsx` token'larından (elle hex yok)
- [ ] Koyu yüzey + teal/mor aksan tutarlı (açık-tema yüzey sızmamış)
- [ ] İkonlar `neonUi` `Icon` setinden (emoji yok)
- [ ] Tüm tıklanabilirlerde `cursor:pointer`
- [ ] `focusRing` ile görünür klavye odağı
- [ ] Renk tek sinyal değil (ikon + metin + etiket)
- [ ] Koyu zeminde metin kontrastı AA (≥ 4.5:1 gövde)
- [ ] Hover/aktif geçişleri yumuşak (150–300ms), layout kaydırmıyor
- [ ] `prefers-reduced-motion` karşılanıyor
- [ ] Responsive: 375px, 768px, 1024px, 1440px — yatay taşma yok
- [ ] Sabit kabuk arkasına içerik gizlenmiyor
