/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   "Yeni evrak yükle" + "Örnek evrakla dene" dropdown girişi. Klavye erişilebilir (button + focusRing). */
import React, { useState } from "react";
import { MONO, SANS, T, PAL, focusRing, Icon } from "./neonUi.jsx";

const NAV = [
  { id: "panel", label: "Panel", icon: "grid" },
  { id: "gelen", label: "Gelen Evrak", icon: "inbox", badge: true },
  { id: "isleniyor", label: "İşleniyor", icon: "spin", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "doc", count: "drafts" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
  { id: "denetim", label: "Denetim İzi", icon: "shield" },
];

function NavBtn({ item, active, onClick, busy, inboxCount, draftCount }) {
  const Ic = Icon[item.icon];
  const base = { display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 11px", borderRadius: 10, fontSize: 13.5, fontFamily: SANS, textAlign: "left", cursor: "pointer" };
  const badgeVal = item.badge ? inboxCount : item.count === "drafts" ? draftCount : null;
  const showBadge = badgeVal != null && badgeVal > 0;
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} {...focusRing}
      style={active
        ? { ...base, background: "linear-gradient(90deg,rgba(46,230,201,.14),rgba(46,230,201,.03))", border: "1px solid rgba(46,230,201,.28)", color: "#eaf6ff", fontWeight: 500, justifyContent: showBadge ? "space-between" : "flex-start" }
        : { ...base, border: "1px solid transparent", background: "transparent", color: PAL.mut, justifyContent: showBadge ? "space-between" : "flex-start" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ color: active ? T : PAL.mut2, display: "flex" }}>{Ic && <Ic />}</span>{item.label}
      </span>
      {item.live && active && busy
        ? <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(46,230,201,.3)", borderTopColor: T, animation: "nu-spin .8s linear infinite", marginLeft: "auto" }} />
        : showBadge && <span aria-label={`${badgeVal} öğe`} style={{ fontFamily: MONO, fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "rgba(91,140,255,.16)", color: "#aec6ff" }}>{badgeVal}</span>}
    </button>
  );
}

export default function NeonSidebar({ activeView, onNavigate, onUpload, samples = [], onPickSample, busy, inboxCount = 0, draftCount = 0 }) {
  const [showSamples, setShowSamples] = useState(false);
  return (
    <aside aria-label="Çalışma alanı navigasyonu" style={{ width: 228, flexShrink: 0, background: PAL.bg2, borderRight: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", padding: "18px 14px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
      <button type="button" onClick={() => onNavigate("panel")} {...focusRing} style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 6px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,#5b8cff,#3a63d6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px -6px rgba(91,140,255,.7)" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5" stroke="#fff" strokeWidth="1.7" /><path d="M8.5 13.5 L11 16 L16 9.5" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 15, fontWeight: 600, letterSpacing: "-.3px", color: PAL.ink }}>kamu-evrak</span>
          <span style={{ display: "block", fontSize: 10, letterSpacing: ".5px", color: PAL.mut3 }}>TEKNOFEST 2026 · S1</span>
        </span>
      </button>

      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2, padding: "0 8px 8px" }}>ÇALIŞMA ALANI</div>
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} inboxCount={inboxCount} draftCount={draftCount} />)}
      </nav>

      <button type="button" onClick={onUpload} disabled={busy} {...focusRing} style={{ cursor: busy ? "not-allowed" : "pointer", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 11, border: "1px dashed rgba(91,140,255,.4)", background: "rgba(91,140,255,.08)", color: "#aec6ff", fontFamily: SANS, fontSize: 13, fontWeight: 500, opacity: busy ? 0.5 : 1 }}>
        <Icon.plus /> Yeni evrak yükle
      </button>

      {samples.length > 0 && (
        <div style={{ position: "relative", marginTop: 8 }} onKeyDown={(e) => { if (e.key === "Escape") setShowSamples(false); }}>
          <button type="button" onClick={() => setShowSamples((v) => !v)} aria-expanded={showSamples} aria-haspopup="listbox" aria-controls="nu-samples" {...focusRing} style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: 9, borderRadius: 10, border: "1px solid rgba(46,230,201,.28)", background: "rgba(46,230,201,.07)", color: "#9fe6d8", fontFamily: MONO, fontSize: 11.5 }}>
            Örnek evrakla dene {showSamples ? "▴" : "▾"}
          </button>
          {showSamples && (
            <div id="nu-samples" role="listbox" aria-label="Örnek evraklar" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 300, overflowY: "auto", background: "#141c30", border: `1px solid ${PAL.lineHi}`, borderRadius: 11, padding: 6, boxShadow: "0 18px 50px -10px rgba(0,0,0,.7)", zIndex: 30 }}>
              {samples.map((s) => (
                <button key={s.id} type="button" role="option" aria-selected="false" onClick={() => { setShowSamples(false); onPickSample(s); }} {...focusRing} style={{ cursor: "pointer", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: PAL.ink2, fontFamily: SANS, fontSize: 12.5, display: "block" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(46,230,201,.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  {s.label}<div style={{ fontSize: 10.5, color: PAL.mut3, marginTop: 1 }}>{s.aciklama}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 11, background: PAL.surfHi, border: `1px solid ${PAL.line}` }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#b794ff,#7c5ce0)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#1a1230" }}>MY</span>
        <span style={{ lineHeight: 1.3 }}><span style={{ display: "block", fontSize: 12.5, color: PAL.ink2 }}>M. Yılmaz</span><span style={{ display: "block", fontSize: 10.5, color: PAL.mut3 }}>Yetkili memur</span></span>
      </div>
    </aside>
  );
}
