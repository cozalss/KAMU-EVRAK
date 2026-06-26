# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** kamu-evrak
**Generated:** 2026-06-26 (ui-ux-pro-max) · **Shipped/uyarlanmış:** 2026-06-26
**Category:** Government/Public Service · **Yön:** "Kurumsal Devlet" (Accessible & Ethical)

> **NOT:** Bu dosya **fiilen yüklenen (shipped)** tasarım kararlarını yansıtacak biçimde
> güncellenmiştir. Tek doğru kaynak `frontend/src/styles/kamu-evrak.css` içindeki `:root`
> token'larıdır. (İlk üretimde önerilen EB Garamond/Lato + turuncu CTA bilinçli olarak
> reddedildi; kurumsal Lexend/Source Sans + lacivert/mavi tercih edildi.)

---

## Global Rules

### Color Palette

| Rol | Hex | CSS değişkeni (kamu-evrak.css) |
|------|-----|--------------|
| Marka (lacivert) | `#0f2a4a` | `--brand` |
| Birincil etkileşim (mavi) | `#1d4ed8` | `--accent` |
| Görev 1 — Anla (teal) | `#0f766e` | `--g1` |
| Görev 2 — Üret (indigo) | `#4338ca` | `--g2` |
| Arka plan | `#eef2f7` | `--bg` |
| Yüzey / kart | `#ffffff` | `--surface` |
| Metin — başlık | `#0f1b2d` | `--ink` |
| Metin — gövde | `#2f3e52` | `--ink-2` |
| Uyarı (amber) | `#b45309` | `--warn` |
| Hata (kırmızı) | `#b91c1c` | `--danger` |

**Color Notes:** Yüksek kontrast lacivert/mavi + nötr slate (gov.uk/USWDS ciddiyeti).
Turuncu CTA KULLANILMADI. Renk asla tek sinyal değil — her durumda ikon+metin eşlik eder.

### Typography

- **Heading Font:** Lexend (okunabilirlik için tasarlandı; `--font-display`)
- **Body Font:** Source Sans 3 (`--font-body`)
- **Mood:** corporate, trustworthy, accessible, readable, professional, clean
- **Hosting:** Yerel woff2 (offline-güvenli) — `frontend/public/fonts/` + `src/styles/fonts.css`,
  `font-display: swap`, latin + latin-ext alt kümeleri (Türkçe ç/ş/ğ/İ tam). Google CDN bağımlılığı YOK.

**Yükleme:** `main.jsx` → `import "./styles/fonts.css"` (CSS @import çoğullaması yok).

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button — kurumsal mavi (turuncu CTA değil) */
.btn-primary {
  background: #1d4ed8;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #2563EB;
  border: 2px solid #2563EB;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #2563EB;
  outline: none;
  box-shadow: 0 0 0 3px #2563EB20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Accessible & Ethical

**Keywords:** High contrast, large text (16px+), keyboard navigation, screen reader friendly, WCAG compliant, focus state, semantic

**Best For:** Government, healthcare, education, inclusive products, large audience, legal compliance, public

**Key Effects:** Clear focus rings (3-4px), ARIA labels, skip links, responsive design, reduced motion, 44x44px touch targets

### Page Pattern

**Pattern Name:** Minimal & Direct

- **CTA Placement:** Above fold
- **Section Order:** Hero > Features > CTA

---

## Anti-Patterns (Do NOT Use)

- ❌ Ornate design
- ❌ Low contrast
- ❌ Motion effects
- ❌ AI purple/pink gradients

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
