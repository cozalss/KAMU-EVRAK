/* neonUi — kamu-evrak çalışma alanı paylaşılan tasarım atomları ("Hero Light v2 · Sakin Ürün").
   Palet herodan (frontend/public/portfolio/hero.webp) türetilmiş sıcak fildişi + gök mavisi /
   lavanta / mercan — hex'ler v1 ile bit-aynı. v2 (2026-07-02) dekorasyon dilini söker:
   border-first yüzey (gölge yalnız havada duran katman), düz dolgular (gradyan/glow yok),
   sentence case, mono yalnız makine verisi, 7 kademeli tip ölçeği (TYPE), 4+nokta radius (RAD),
   7 adımlı boşluk (SP). Spec: design-system/kamu-evrak/MASTER.md. Satır-içi stil; tek <style>
   yalnız @keyframes. a11y: focusRing + SR_ONLY + semantik. */
import React, { useState, useId } from "react";

export const MONO = "'IBM Plex Mono',ui-monospace,monospace";
export const SANS = "'IBM Plex Sans','Segoe UI',system-ui,sans-serif";
/* V (Görev 2 semantiği): lavanta → MÜHÜR moru (2026-07 revizyonu). Pastel "AI moru"ndan
   çıkış; ıstampa/mühür mürekkebi — resmî evrak dünyasının kendi rengi. Radix ruby/plum
   koyuluğunda; ivory zeminde dolgu 6.3:1, DERIN.V metin 8.3:1 (AA). */
/* Renk token'ları CSS custom property üzerinden okunur (bkz. THEME_CSS altta) — açık/koyu
   mod aynı JS sabitleriyle çalışır, yalnız kök elemandaki [data-theme] değeri değişir. */
export const T = "var(--ke-t)", V = "var(--ke-v)", R = "var(--ke-r)";
export const PAL = {
  bg: "var(--ke-bg)", bg2: "var(--ke-bg2)", surf: "var(--ke-surf)", surf2: "var(--ke-surf2)", surfHi: "var(--ke-surf-hi)",
  line: "var(--ke-line)", lineHi: "var(--ke-line-hi)",
  ink: "var(--ke-ink)", ink2: "var(--ke-ink2)", mut: "var(--ke-mut)", mut2: "var(--ke-mut2)", mut3: "var(--ke-mut3)",
  hov: "var(--ke-hov)", press: "var(--ke-press)",
  inputLine: "var(--ke-input-line)", onAccent: "var(--ke-on-accent)", inkSurf: "var(--ke-ink-surf)",
  scrim: "var(--ke-scrim)",
};
export const BANT = {
  yesil: { c: "var(--ke-bant-yesil)", l: "YEŞİL", t: "Düşük risk" },
  sari: { c: "var(--ke-bant-sari)", l: "SARI", t: "Orta risk" },
  kirmizi: { c: "var(--ke-bant-kirmizi)", l: "KIRMIZI", t: "Yüksek risk" },
};

/* Açık zemin üstünde AA kontrastlı metin/dolgu türevleri — ham T/V/R/BANT.c açık zeminde
   metin rengi OLAMAZ (T ≈3.2:1). Th = primary buton hover'ı. Koyu modda THEME_CSS ayrı
   AA-güvenli değer taşır (T/PAL ile aynı var() deseni). */
export const DERIN = {
  T: "var(--ke-derin-t)", Th: "var(--ke-derin-th)", V: "var(--ke-derin-v)", R: "var(--ke-derin-r)",
  yesil: "var(--ke-derin-yesil)", sari: "var(--ke-derin-sari)", kirmizi: "var(--ke-derin-kirmizi)",
};
/* Ham aksan → AA metin türevi eşlemesi (bilinmeyen renk aynen döner). */
export const DERIN_OF = (c) => ({
  [T]: DERIN.T, [V]: DERIN.V, [R]: DERIN.R,
  [BANT.yesil.c]: DERIN.yesil, [BANT.sari.c]: DERIN.sari, [BANT.kirmizi.c]: DERIN.kirmizi,
}[c] || c);
/* Tek izinli alfa eki: %8 tint zemin (çip/seçili durum). color-mix — hex ve var() girdisiyle
   aynı çalışır (eski hex+"14" eki var() dizgesinde kırılırdı). Başka alfa-yapıştırma yok. */
export const ALFA = (c) => `color-mix(in srgb, ${c} 8%, transparent)`;

/* Açık/koyu mod değerleri — kök [data-theme] ile seçilir (main.jsx Root ayarlar; kalıcı
   tercih localStorage "ke-tema", yoksa OS prefers-color-scheme). Hex YALNIZ burada yazılır;
   PAL/T/V/R/BANT/DERIN hep var() üzerinden okur — görünüm dosyaları hiç değişmeden iki modda
   da çalışır. */
export const THEME_CSS = `
:root{
  --ke-t:#2f8fa6; --ke-v:#8e3d66; --ke-r:#e0563c;
  --ke-bg:#f7f3ee; --ke-bg2:#efe6da; --ke-surf:#ffffff; --ke-surf2:#fdfbf7; --ke-surf-hi:rgba(35,26,18,.05);
  --ke-line:rgba(35,26,18,.12); --ke-line-hi:rgba(35,26,18,.22);
  --ke-ink:#161616; --ke-ink2:#3a3229; --ke-mut:#6b6255; --ke-mut2:#57503f; --ke-mut3:#8a8172;
  --ke-hov:rgba(35,26,18,.04); --ke-press:rgba(35,26,18,.07);
  --ke-input-line:rgba(35,26,18,.35); --ke-on-accent:#fbf7f0; --ke-ink-surf:#2a251e; --ke-scrim:rgba(35,26,18,.35);
  --ke-shadow-rgb:35,26,18;
  --ke-bant-yesil:#2f9e6e; --ke-bant-sari:#c98a1f; --ke-bant-kirmizi:#c9432f;
  --ke-derin-t:#1f6d82; --ke-derin-th:#1a5e71; --ke-derin-v:#74304f; --ke-derin-r:#a23425;
  --ke-derin-yesil:#1f7a52; --ke-derin-sari:#8a5a10; --ke-derin-kirmizi:#a23425;
}
:root[data-theme="dark"]{
  --ke-t:#4db6cf; --ke-v:#c97fa3; --ke-r:#ff7a5c;
  --ke-bg:#17140d; --ke-bg2:#100d08; --ke-surf:#221c14; --ke-surf2:#1d1811; --ke-surf-hi:rgba(255,255,255,.05);
  --ke-line:rgba(255,255,255,.10); --ke-line-hi:rgba(255,255,255,.18);
  --ke-ink:#f2ece0; --ke-ink2:#d6cdbc; --ke-mut:#a89d8a; --ke-mut2:#c1b7a1; --ke-mut3:#7c7260;
  --ke-hov:rgba(255,255,255,.05); --ke-press:rgba(255,255,255,.08);
  --ke-input-line:rgba(255,255,255,.32); --ke-on-accent:#16130d; --ke-ink-surf:#2b2418; --ke-scrim:rgba(0,0,0,.5);
  --ke-shadow-rgb:0,0,0;
  --ke-bant-yesil:#4cbf8a; --ke-bant-sari:#e0a83f; --ke-bant-kirmizi:#e2604a;
  --ke-derin-t:#7ecbdd; --ke-derin-th:#92d6e6; --ke-derin-v:#e2a8c4; --ke-derin-r:#ffa088;
  --ke-derin-yesil:#7ad9ae; --ke-derin-sari:#f0c168; --ke-derin-kirmizi:#f0917e;
}
`;

/* Tip ölçeği — bu tablo dışında fontSize yazılmaz. Sayısal kolonlarda TNUM eklenir. */
export const TYPE = {
  meta: { fontFamily: SANS, fontSize: 12, lineHeight: "16px", letterSpacing: ".32px" },
  data: { fontFamily: SANS, fontSize: 13, lineHeight: "18px", letterSpacing: ".16px" },
  ui: { fontFamily: SANS, fontSize: 14, lineHeight: "20px" },
  read: { fontFamily: SANS, fontSize: 16, lineHeight: "24px" },
  h2: { fontFamily: SANS, fontSize: 20, lineHeight: "26px", fontWeight: 600, letterSpacing: "-.01em" },
  num: { fontFamily: SANS, fontSize: 24, lineHeight: "28px", fontWeight: 600, letterSpacing: "-.015em", fontVariantNumeric: "tabular-nums" },
  h1: { fontFamily: SANS, fontSize: 28, lineHeight: "34px", fontWeight: 600, letterSpacing: "-.015em" },
};
export const TNUM = { fontVariantNumeric: "tabular-nums" };
/* Radius: chip=durum çipi · ctl=buton/input · card=kart/panel · pop=dropdown/modal/toast. */
export const RAD = { chip: 4, ctl: 6, card: 8, pop: 12, dot: "50%" };
/* Boşluk ölçeği — serbest değer yazılmaz. */
export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
/* Gölge yalnız havada duran katman: card=en fazla bu (opsiyonel) · pop=dropdown/tooltip · modal=modal/toast. */
export const SH = {
  card: "0 1px 2px rgba(var(--ke-shadow-rgb),.05)",
  pop: "0 4px 12px -2px rgba(var(--ke-shadow-rgb),.10), 0 1px 3px rgba(var(--ke-shadow-rgb),.05)",
  modal: "0 16px 40px -12px rgba(var(--ke-shadow-rgb),.18), 0 2px 8px rgba(var(--ke-shadow-rgb),.06)",
};

/* Yalnız KLAVYE odağında halka göster (:focus-visible) — fare tıklaması da native focus
   bıraktığı için onFocus her zaman tetiklenirdi; tık sonrası mavi halka "yapışık" kalırdı. */
export const focusRing = {
  onFocus: (e) => {
    if (e.currentTarget.matches(":focus-visible")) {
      e.currentTarget.style.boxShadow = `0 0 0 2px ${PAL.bg}, 0 0 0 4px ${T}`;
    }
  },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};
export const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

/* Hareket = bilgi: spin (gerçek yükleme) · think (canlılık, yalnız opacity) · rise (görünüm girişi, tek sefer).
   SAHNE istisnası (canlı ajan izi — CanliAjanAkisi): akis (ray üzerinde akan ışık; Magic UI
   "animated beam" / Aceternity "tracing beam" deseninden uyarlama) · pop (istasyon tamamlanma
   vuruşu). Yalnız canlı koşum sahnesinde; reduced-motion hepsini söndürür.
   ::view-transition — görünüm geçişi çapraz-erimesi kısa tutulur (DashboardApp.gecisle;
   reduced-motion'da geçiş zaten hiç başlatılmaz). */
export const NEON_KEYFRAMES = `
@keyframes nu-spin{to{transform:rotate(360deg)}}
@keyframes nu-think{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes nu-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes nu-akis{to{background-position:0 20px}}
@keyframes nu-tara{from{background-position:-48px 0}to{background-position:calc(100% + 48px) 0}}
@keyframes nu-pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.18);opacity:1}100%{transform:scale(1);opacity:1}}
::view-transition-old(root),::view-transition-new(root){animation-duration:.18s}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;

/* Görünüm kabuğu — başlık + alt başlık + içerik (kaydırılır sayfa). */
export function ViewWrap({ id, title, sub, actions, children }) {
  return (
    <section aria-labelledby={id} style={{ padding: "24px 32px 48px", minHeight: "calc(100vh - 1px)" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap", marginBottom: SP.xl }}>
        <div>
          <h2 id={id} style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>{title}</h2>
          {sub && <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: SP.m, flexWrap: "wrap" }}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/* Kart — düz beyaz yüzey + 1px hairline (border-first); gölge en fazla SH.card.
   Başlık: satır-içi kutusuz ikon (accent yalnız ikon rengi) + 14/600 sentence-case başlık +
   sağda düz meta metin (tag). Hover'da kalkış YOK. */
export function NeonCard({ title, tag, tagColor, accent = T, icon, children, full, style }) {
  return (
    <section style={{ position: "relative", gridColumn: full ? "1 / -1" : "auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.l, boxShadow: SH.card, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
          {icon && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN_OF(accent) }}>{icon}</span>}
          <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>{title}</h3>
          {tag && <span style={{ marginLeft: "auto", ...TYPE.meta, color: tagColor ? DERIN_OF(tagColor) : PAL.mut, ...TNUM }}>{tag}</span>}
        </div>
      )}
      <div style={{ position: "relative" }}>{children}</div>
    </section>
  );
}

export const KV = ({ k, v, c = PAL.ink2 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
    <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{k}</span>
    <span style={{ ...TYPE.data, color: c, textAlign: "right", fontWeight: 500, ...TNUM }}>{v}</span>
  </div>
);

/* Buton — primary: düz DERIN dolgu (ekran başına 1) · varsayılan (secondary): beyaz zemin +
   koyu ink kenar · disabled: baskı zemin. Gradyan/glow yok; hover yalnız zemin tonu (120ms). */
export function Btn({ children, onClick, accent = T, primary, disabled, ariaLabel, title, style }) {
  const fill = DERIN_OF(accent);
  const base = {
    cursor: disabled ? "not-allowed" : "pointer", padding: "8px 14px", minHeight: 36,
    borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease-out",
    display: "inline-flex", alignItems: "center", gap: SP.s, border: "1px solid transparent",
  };
  const skin = disabled
    ? { background: PAL.press, color: PAL.mut2 }
    : primary
      ? { background: fill, color: PAL.onAccent }
      : { background: PAL.surf, color: PAL.ink, border: `1px solid ${PAL.inputLine}` };
  const onEnter = (e) => {
    if (disabled) return;
    if (primary) { if (fill === DERIN.T) e.currentTarget.style.background = DERIN.Th; else e.currentTarget.style.filter = "brightness(.94)"; }
    else e.currentTarget.style.background = PAL.hov;
  };
  const onLeave = (e) => {
    if (disabled) return;
    if (primary) { e.currentTarget.style.background = fill; e.currentTarget.style.filter = "none"; }
    else e.currentTarget.style.background = PAL.surf;
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title}
      onMouseEnter={onEnter} onMouseLeave={onLeave} {...focusRing} style={{ ...base, ...skin, ...style }}>
      {children}
    </button>
  );
}

/* Boş durum — kutusuz soluk ikon + net yönlendirme metni + aksiyon. */
export function EmptyState({ icon, title, sub, actions }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SP.m, padding: "56px 20px", textAlign: "center", minHeight: 320 }}>
      {icon && React.isValidElement(icon) && (
        <span aria-hidden="true" style={{ display: "flex", color: PAL.mut }}>{React.cloneElement(icon, { width: 24, height: 24 })}</span>
      )}
      <div>
        <div style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink2 }}>{title}</div>
        {sub && <p style={{ margin: "6px 0 0", ...TYPE.data, color: PAL.mut2, maxWidth: 420 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: SP.m, marginTop: SP.xs, flexWrap: "wrap", justifyContent: "center" }}>{actions}</div>}
    </div>
  );
}

/* Büyüt ikonu (dört köşe ok) — belge panellerinin A4 modal tetikleyicisi (kaynak belge /
   ana taslak / birim taslağı — hepsi ortak). */
const BuyutIkon = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Panel başlığındaki küçük "büyüt" düğmesi — Kaynak belge / taslak kartlarında ortak. */
export function BuyutDugme({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Büyüt (A4 görünüm)" {...focusRing}
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.mut, flexShrink: 0, transition: "background .12s ease-out" }}>
      <BuyutIkon />
    </button>
  );
}

/* İkonlar (stroke, çizgi seti). */
export const Icon = {
  grid: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>,
  inbox: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 5 H20 M12 8 V15 M9 12 L12 15 L15 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 19 H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  spin: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "nu-spin 2.4s linear infinite" }} {...p}><circle cx="12" cy="12" r="8" stroke={`color-mix(in srgb, ${T} 25%, transparent)`} strokeWidth="2" /><path d="M12 4 A8 8 0 0 1 20 12" stroke={T} strokeWidth="2" strokeLinecap="round" /></svg>,
  doc: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 9 H16 M8 13 H16 M8 17 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  book: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 4 H19 V20 H5 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8 H15 M9 12 H15 M9 16 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  shield: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8.5 12 L11 14.5 L15.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  upload: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 16 V5 M8 9 L12 5 L16 9 M5 19 H19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  plus: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 5 V19 M5 12 H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>,
  arrow: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  chart: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 20 V10 M10 20 V4 M16 20 V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 20 H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  clock: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7.5 V12 L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  scale: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 4 V20 M7 20 H17 M5 8 H19 M5 8 L3 13 H7 L5 8Z M19 8 L17 13 H21 L19 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>,
  route: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><circle cx="6" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.6" /><circle cx="18" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" /><path d="M8.4 18 H14 a3.5 3.5 0 0 0 0-7 H9.5 a3.5 3.5 0 0 1 0-7 H15.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  info: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M12 11 V16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.6" r="1.15" fill="currentColor" /></svg>,
  check: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M5 12.5 L10 17.5 L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  x: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>,
  alert: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M12 4 L21 19 H3 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10 V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1" fill="currentColor" /></svg>,
  mic: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M6 11 a6 6 0 0 0 12 0 M12 17 V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>,
};

/* InfoTip — erişilebilir "ⓘ" ipucu. Hover + klavye odağıyla açılır, Esc/blur kapatır.
   children = ipucu gövdesi (JSX). a11y: buton + role=tooltip + aria-describedby. */
function InfoTip({ label = "Bilgi", children, width = 256, align = "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  // a11y: trigger=button, role=tooltip + aria-describedby (aria-expanded YOK — tooltip deseni).
  // Hover + klavye odağıyla açılır; Esc/blur/mouseleave kapatır. Tooltip wrapper'ın
  // alt-öğesidir + şeffaf paddingTop "köprü" ile aradaki boşlukta kapanma (WCAG 1.4.13 hoverable).
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={show} onMouseLeave={hide}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined}
        onFocus={show} onBlur={hide}
        onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
        {...focusRing}
        style={{ cursor: "pointer", width: 24, height: 24, borderRadius: RAD.dot, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${PAL.lineHi}`, background: PAL.hov, color: PAL.mut, padding: 0, flexShrink: 0 }}>
        <Icon.info />
      </button>
      {open && (
        <span role="tooltip" id={id}
          style={{ position: "absolute", top: "100%", [align === "right" ? "right" : "left"]: 0, paddingTop: SP.s, width, zIndex: 60, cursor: "default" }}>
          <span style={{ display: "block", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: "12px 14px", boxShadow: SH.pop, ...TYPE.data, color: PAL.ink2, textAlign: "left", whiteSpace: "normal", fontWeight: 400 }}>
            {children}
          </span>
        </span>
      )}
    </span>
  );
}

const RISK_ORDER = ["yesil", "sari", "kirmizi"];
const RISK_DESC = {
  yesil: "Düşük risk — taslak yayına hazır; rutin memur onayı yeterli.",
  sari: "Orta risk — yayından önce memur incelemesi önerilir.",
  kirmizi: "Yüksek risk — dikkatli memur kararı gerekir; otomatik gönderim durur.",
};

/* RiskBand — açıklamalı (tooltip'li) risk göstergesi. CanliAjanAkisi + NeonDetay ortak kullanır.
   band: "yesil|sari|kirmizi" · lit: risk_guard tamamlandı mı (yanmadan "—").
   Uppercase istisnası: YEŞİL/SARI/KIRMIZI durum kodu (BANT.l — semantik token, mono 12). */
export function RiskBand({ band = "yesil", lit = true, sub }) {
  const cur = BANT[band] || BANT.yesil;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, minWidth: 230 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
          <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Risk bandı{sub ? ` · ${sub}` : ""}</span>
          <InfoTip label="Risk bandı nedir? Açıklamayı göster" width={266}>
            <strong style={{ display: "block", ...TYPE.data, fontWeight: 600, color: PAL.ink, marginBottom: 6 }}>Risk bandı nedir?</strong>
            <span style={{ display: "block", color: PAL.mut, marginBottom: 4 }}>
              Yapay zekânın ürettiği taslağın <strong style={{ color: PAL.ink2, fontWeight: 600 }}>yayın güvenliği</strong> risk seviyesi — memurun ne kadar dikkatle incelemesi gerektiğini gösterir (trafik ışığı mantığı).
            </span>
            {RISK_ORDER.map((key) => (
              <span key={key} style={{ display: "flex", gap: SP.s, alignItems: "flex-start", marginTop: 7 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: RAD.dot, background: BANT[key].c, marginTop: 4, flexShrink: 0 }} />
                <span style={{ color: PAL.mut }}><strong style={{ color: DERIN_OF(BANT[key].c), fontWeight: 600 }}>{BANT[key].l}</strong> — {RISK_DESC[key]}</span>
              </span>
            ))}
          </InfoTip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "6px 10px", borderRadius: RAD.card, background: PAL.surfHi, border: `1px solid ${PAL.line}`, width: "fit-content" }}>
          {RISK_ORDER.map((key) => {
            const on = lit && band === key;
            return <span key={key} aria-hidden="true" title={`${BANT[key].l} — ${BANT[key].t}`} style={{ width: 12, height: 12, borderRadius: RAD.dot, background: on ? BANT[key].c : PAL.press, border: "1px solid " + (on ? BANT[key].c : PAL.lineHi), transition: "background .15s ease-out" }} />;
          })}
        </div>
      </div>
      <div role="status" aria-label={lit ? `Risk bandı: ${cur.l}, ${cur.t}` : "Risk bandı henüz belirlenmedi"}
        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, padding: "6px 10px", borderRadius: RAD.ctl, color: lit ? DERIN_OF(cur.c) : PAL.mut2, background: lit ? ALFA(cur.c) : PAL.hov }}>
        {lit ? cur.l : "—"}
      </div>
    </div>
  );
}
