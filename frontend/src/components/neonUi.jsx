/* neonUi — kamu-evrak neon çalışma alanı paylaşılan tasarım atomları.
   Tüm görünümler (Panel/Gelen/İşleniyor/Taslaklar/Mevzuat/Denetim) bunları kullanır → tutarlı,
   DRY. Satır-içi stil (tek <style> yalnız @keyframes). a11y: focusRing + SR_ONLY + semantik. */
import React, { useState, useId } from "react";

export const MONO = "'IBM Plex Mono',ui-monospace,monospace";
export const SANS = "'Space Grotesk',system-ui,sans-serif";
export const T = "#2ee6c9", V = "#b794ff";
export const PAL = {
  bg: "#121829", bg2: "#0f1626", surf: "rgba(255,255,255,.025)", surfHi: "rgba(255,255,255,.05)",
  line: "rgba(255,255,255,.08)", lineHi: "rgba(255,255,255,.14)",
  ink: "#eaf0fb", ink2: "#dfe5f2", mut: "#9aa6c0", mut2: "#7d89a4", mut3: "#8b97b0",
};
export const BANT = {
  yesil: { c: "#34d399", l: "YEŞİL", t: "Düşük risk" },
  sari: { c: "#fbbf24", l: "SARI", t: "Orta risk" },
  kirmizi: { c: "#f87171", l: "KIRMIZI", t: "Yüksek risk" },
};

export const focusRing = {
  onFocus: (e) => { e.currentTarget.style.boxShadow = "0 0 0 2px #0f1626, 0 0 0 4px #2ee6c9"; },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};
export const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

export const NEON_KEYFRAMES = `
@keyframes nu-dotpulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
@keyframes nu-spin{to{transform:rotate(360deg)}}
@keyframes nu-scanv{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
@keyframes nu-think{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes nu-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes nu-ring{0%{transform:translate(-50%,-50%) scale(.7);opacity:.6}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
`;

/* Görünüm kabuğu — başlık + alt başlık + içerik (kaydırılır sayfa). */
export function ViewWrap({ id, title, sub, actions, children }) {
  return (
    <section aria-labelledby={id} style={{ padding: "26px 32px 48px", minHeight: "calc(100vh - 1px)" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 id={id} style={{ margin: 0, fontFamily: SANS, fontSize: 21, fontWeight: 600, color: PAL.ink, letterSpacing: "-.01em" }}>{title}</h2>
          {sub && <p style={{ margin: "5px 0 0", fontFamily: MONO, fontSize: 12, color: PAL.mut2 }}>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/* Neon kart. */
export function NeonCard({ title, tag, tagColor, accent = T, children, full, style }) {
  return (
    <section style={{ gridColumn: full ? "1 / -1" : "auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderTop: `2px solid ${accent}`, borderRadius: 14, padding: "16px 18px", ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontFamily: MONO, fontSize: 10.5, letterSpacing: "1.5px", color: PAL.mut, textTransform: "uppercase", fontWeight: 600 }}>{title}</h3>
          {tag && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 7, color: tagColor || accent, background: (tagColor || accent) + "22" }}>{tag}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export const KV = ({ k, v, c = PAL.ink2 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: `1px dashed ${PAL.line}` }}>
    <span style={{ fontFamily: MONO, fontSize: 11.5, color: PAL.mut3 }}>{k}</span>
    <span style={{ fontFamily: MONO, fontSize: 11.5, color: c, textAlign: "right", fontWeight: 500 }}>{v}</span>
  </div>
);

/* Buton — primary (dolu accent) veya ghost. */
export function Btn({ children, onClick, accent = T, primary, disabled, ariaLabel, title, style }) {
  const base = {
    cursor: disabled ? "not-allowed" : "pointer", padding: "9px 16px", borderRadius: 10,
    fontFamily: SANS, fontSize: 12.5, fontWeight: 600, transition: "all .25s",
    display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid",
  };
  const skin = primary
    ? { border: accent + "00", background: disabled ? "rgba(255,255,255,.05)" : `linear-gradient(135deg,${accent},#1ea7d6)`, color: disabled ? PAL.mut2 : "#06121a", boxShadow: disabled ? "none" : `0 8px 22px -10px ${accent}` }
    : { borderColor: disabled ? "rgba(255,255,255,.1)" : accent + "55", background: disabled ? "rgba(255,255,255,.03)" : accent + "14", color: disabled ? PAL.mut2 : accent };
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title} {...focusRing} style={{ ...base, ...skin, ...style }}>
      {children}
    </button>
  );
}

/* Boş durum (içerik yokken anlamlı yönlendirme). */
export function EmptyState({ icon, title, sub, actions }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "60px 20px", textAlign: "center", minHeight: 360 }}>
      <span style={{ width: 64, height: 64, borderRadius: 18, display: "grid", placeItems: "center", background: "rgba(46,230,201,.08)", border: "1px solid rgba(46,230,201,.2)", color: T }} aria-hidden="true">{icon}</span>
      <div>
        <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, color: PAL.ink2 }}>{title}</div>
        {sub && <p style={{ margin: "6px 0 0", fontFamily: MONO, fontSize: 12, color: PAL.mut2, maxWidth: 420, lineHeight: 1.6 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>{actions}</div>}
    </div>
  );
}

/* İkonlar (stroke neon). */
const sw = "#7d89a4";
export const Icon = {
  grid: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>,
  inbox: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><path d="M4 5 H20 M12 8 V15 M9 12 L12 15 L15 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 19 H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  spin: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "nu-spin 2.4s linear infinite" }} {...p}><circle cx="12" cy="12" r="8" stroke="rgba(46,230,201,.25)" strokeWidth="2" /><path d="M12 4 A8 8 0 0 1 20 12" stroke="#2ee6c9" strokeWidth="2" strokeLinecap="round" /></svg>,
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
};

/* InfoTip — erişilebilir "ⓘ" ipucu. Hover + klavye odağıyla açılır, Esc/blur kapatır.
   children = ipucu gövdesi (JSX). a11y: buton + role=tooltip + aria-describedby. */
export function InfoTip({ label = "Bilgi", children, width = 256, align = "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); } }}
        {...focusRing}
        style={{ cursor: "pointer", width: 17, height: 17, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${PAL.lineHi}`, background: "rgba(255,255,255,.05)", color: PAL.mut, padding: 0 }}>
        <Icon.info />
      </button>
      {open && (
        <span role="tooltip" id={id}
          style={{ position: "absolute", top: "calc(100% + 8px)", [align === "right" ? "right" : "left"]: 0, width, zIndex: 60, background: "#141c30", border: `1px solid ${PAL.lineHi}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 20px 54px -14px rgba(0,0,0,.78)", fontFamily: SANS, fontSize: 11.5, lineHeight: 1.55, color: PAL.ink2, textAlign: "left", whiteSpace: "normal", fontWeight: 400, cursor: "default" }}>
          {children}
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
   band: "yesil|sari|kirmizi" · lit: risk_guard tamamlandı mı (yanmadan "—"). */
export function RiskBand({ band = "yesil", lit = true }) {
  const cur = BANT[band] || BANT.yesil;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, minWidth: 230 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: PAL.mut3 }}>RİSK BANDI</span>
          <InfoTip label="Risk bandı nedir? Açıklamayı göster" width={266}>
            <strong style={{ display: "block", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: PAL.ink, marginBottom: 6 }}>Risk bandı nedir?</strong>
            <span style={{ display: "block", color: PAL.mut, marginBottom: 4 }}>
              Yapay zekânın ürettiği taslağın <strong style={{ color: PAL.ink2, fontWeight: 600 }}>yayın güvenliği</strong> risk seviyesi — memurun ne kadar dikkatle incelemesi gerektiğini gösterir (trafik ışığı mantığı).
            </span>
            {RISK_ORDER.map((key) => (
              <span key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 7 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: BANT[key].c, marginTop: 4, flexShrink: 0, boxShadow: `0 0 6px ${BANT[key].c}` }} />
                <span style={{ color: PAL.mut }}><strong style={{ color: BANT[key].c, fontWeight: 600 }}>{BANT[key].l}</strong> — {RISK_DESC[key]}</span>
              </span>
            ))}
          </InfoTip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 11, background: "rgba(0,0,0,.28)", border: `1px solid ${PAL.line}`, width: "fit-content" }}>
          {RISK_ORDER.map((key) => {
            const on = lit && band === key;
            return <span key={key} aria-hidden="true" title={`${BANT[key].l} — ${BANT[key].t}`} style={{ width: 14, height: 14, borderRadius: "50%", background: on ? BANT[key].c : "rgba(255,255,255,0.07)", boxShadow: on ? `0 0 14px 2px ${BANT[key].c}` : "none", border: "1px solid " + (on ? BANT[key].c : "rgba(255,255,255,0.12)"), transition: "all .5s" }} />;
          })}
        </div>
      </div>
      <div role="status" aria-label={lit ? `Risk bandı: ${cur.l}, ${cur.t}` : "Risk bandı henüz belirlenmedi"}
        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, color: lit ? cur.c : PAL.mut2, background: lit ? cur.c + "1f" : "rgba(255,255,255,.04)", border: "1px solid " + (lit ? cur.c + "66" : "rgba(255,255,255,.1)") }}>
        {lit ? cur.l : "—"}
      </div>
    </div>
  );
}
