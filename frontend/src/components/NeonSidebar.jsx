/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   "Yeni evrak yükle" + "Örnek evrakla dene" dropdown girişi. Klavye erişilebilir (button + focusRing). */
import React, { useState } from "react";
import { MONO, SANS, T, PAL, focusRing, Icon } from "./neonUi.jsx";

const NAV = [
  { id: "panel", label: "Panel", icon: "grid" },
  { id: "gelen", label: "Gelen Evrak", icon: "inbox", badge: true },
  { id: "giden", label: "Giden Evrak", icon: "arrow", count: "giden" },
  { id: "isleniyor", label: "İşleniyor", icon: "spin", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "doc", count: "drafts" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
  { id: "denetim", label: "Denetim İzi", icon: "shield" },
];

function NavBtn({ item, active, onClick, busy, inboxCount, draftCount, gidenCount }) {
  const Ic = Icon[item.icon];
  const base = { display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 11px", borderRadius: 10, fontSize: 13.5, fontFamily: SANS, textAlign: "left", cursor: "pointer" };
  const badgeVal = item.badge ? inboxCount : item.count === "drafts" ? draftCount : item.count === "giden" ? gidenCount : null;
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

/* Örnek evrak satırı — grup rengiyle (Vatandaş=teal · Kurum=mavi · Hukuk/Mali=mor)
   renklenen chip + başlık + açıklama + hover'da kayan ok. Giriş kademeli (nu-rise-stag). */
const GRUP_RENK = { "Vatandaş": "#2ee6c9", "Kurum": "#7cb4ff", "Hukuk/Mali": "#b794ff" };

function SampleRow({ sample, index, onPick }) {
  const [hover, setHover] = useState(false);
  const c = GRUP_RENK[sample.grup] || T;
  return (
    <button type="button" role="option" aria-selected="false" title={sample.aciklama} onClick={() => onPick(sample)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} {...focusRing}
      style={{
        cursor: "pointer", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11,
        padding: "9px 10px", borderRadius: 10, border: `1px solid ${hover ? c + "44" : "transparent"}`,
        background: hover ? c + "14" : "transparent", transition: "background .18s, border-color .18s",
        animation: "nu-rise-stag .3s ease-out both", animationDelay: `${index * 38}ms`,
      }}>
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
        background: hover ? c + "26" : c + "14", border: `1px solid ${hover ? c : c + "44"}`, color: c,
        transition: "background .18s, border-color .18s",
      }}><Icon.doc /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: hover ? PAL.ink : PAL.ink2, lineHeight: 1.25 }}>{sample.label}</span>
        {sample.aciklama && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontFamily: MONO, fontSize: 10.5, color: PAL.mut3, marginTop: 2, lineHeight: 1.4 }}>{sample.aciklama}</span>}
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, color: c, opacity: hover ? 1 : 0, transform: hover ? "translateX(0)" : "translateX(-4px)", transition: "opacity .18s, transform .18s" }}><Icon.arrow /></span>
    </button>
  );
}

const ROL_TR = { memur: "Memur", yetkili: "Yetkili", yonetici: "Yönetici", sistem: "Sistem" };

function bashHarfler(ad) {
  const p = (ad || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || p[0]?.[1] || "")).toUpperCase() || "?";
}

function NeonSidebar({ activeView, onNavigate, onUpload, samples = [], onPickSample, busy, inboxCount = 0, draftCount = 0, gidenCount = 0, user, onLogout }) {
  const [showSamples, setShowSamples] = useState(false);
  return (
    <aside aria-label="Çalışma alanı navigasyonu" style={{ width: 228, flexShrink: 0, background: PAL.bg2, borderRight: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", padding: "18px 14px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
      <button type="button" onClick={() => onNavigate("panel")}
        onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = "0 0 0 2px #0f1626, 0 0 0 4px #2ee6c9"; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 6px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: 12, outline: "none" }}>
        <img src="/logo.png" alt="" width="40" height="40" style={{ display: "block", flexShrink: 0, borderRadius: 12, boxShadow: "0 6px 22px -9px rgba(46,230,201,.5), 0 4px 18px -10px rgba(183,148,255,.45)" }} />
        <span style={{
          fontFamily: SANS, fontSize: 19.5, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.05, textTransform: "uppercase",
          backgroundImage: "linear-gradient(100deg,#67e8e0 0%,#2ee6c9 32%,#7cb4ff 68%,#b794ff 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: T,
        }}>kamu-evrak</span>
      </button>

      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2, padding: "0 8px 8px" }}>ÇALIŞMA ALANI</div>
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} />)}
      </nav>

      <button type="button" onClick={onUpload} disabled={busy} {...focusRing} style={{ cursor: busy ? "not-allowed" : "pointer", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 11, border: "1px dashed rgba(91,140,255,.4)", background: "rgba(91,140,255,.08)", color: "#aec6ff", fontFamily: SANS, fontSize: 13, fontWeight: 500, opacity: busy ? 0.5 : 1 }}>
        <Icon.plus /> Yeni evrak yükle
      </button>

      {samples.length > 0 && (
        <div style={{ position: "relative", marginTop: 8 }} onKeyDown={(e) => { if (e.key === "Escape") setShowSamples(false); }}>
          <button type="button" onClick={() => setShowSamples((v) => !v)} aria-expanded={showSamples} aria-haspopup="listbox" aria-controls="nu-samples" {...focusRing}
            style={{
              cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "10px 10px", borderRadius: 11, fontFamily: MONO, fontSize: 11, letterSpacing: ".2px", color: "#9fe6d8",
              border: `1px solid ${showSamples ? "rgba(46,230,201,.5)" : "rgba(46,230,201,.28)"}`,
              background: showSamples ? "rgba(46,230,201,.13)" : "rgba(46,230,201,.07)",
              transition: "background .2s, border-color .2s",
            }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: T }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3 L13.7 8.3 L19 10 L13.7 11.7 L12 17 L10.3 11.7 L5 10 L10.3 8.3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
            </span>
            <span style={{ whiteSpace: "nowrap" }}>Örnek evrakla dene</span>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, marginLeft: 1, transition: "transform .25s", transform: showSamples ? "rotate(180deg)" : "rotate(0deg)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </button>
          {showSamples && (
            <div id="nu-samples" role="listbox" aria-label="Örnek evraklar"
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0, width: 304, maxHeight: 400, overflowY: "auto",
                background: "linear-gradient(180deg,#16203a,#121a2e)", border: `1px solid ${PAL.lineHi}`, borderRadius: 14, padding: 7,
                boxShadow: "0 24px 60px -12px rgba(0,0,0,.78), 0 0 0 1px rgba(46,230,201,.06)",
                zIndex: 40, animation: "nu-rise .22s ease-out both",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 8px 9px" }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "1.6px", color: PAL.mut2 }}>HIZLI BAŞLA</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 9.5, color: PAL.mut3 }}>{samples.length} örnek</span>
              </div>
              {samples.map((s, i) => (
                <SampleRow key={s.id} sample={s} index={i} onPick={(x) => { setShowSamples(false); onPickSample(x); }} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 11, background: PAL.surfHi, border: `1px solid ${PAL.line}` }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, background: "linear-gradient(135deg,#b794ff,#7c5ce0)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#1a1230" }}>{bashHarfler(user?.ad_soyad)}</span>
        <span style={{ lineHeight: 1.3, minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 12.5, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.ad_soyad || "Kullanıcı"}</span>
          <span style={{ display: "block", fontSize: 10.5, color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.unvan || ROL_TR[user?.rol] || "—"}</span>
        </span>
        {onLogout && (
          <button type="button" onClick={onLogout} aria-label="Çıkış yap" title="Çıkış yap" {...focusRing}
            style={{ flexShrink: 0, width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, cursor: "pointer", color: PAL.mut2, background: "transparent", border: `1px solid ${PAL.line}` }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.borderColor = "rgba(248,113,113,.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = PAL.mut2; e.currentTarget.style.borderColor = PAL.line; }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
    </aside>
  );
}

// React.memo: props (DashboardApp'te useCallback ile sabitlendi) değişmedikçe yeniden render
// olmaz → canlı akış sırasında gereksiz sidebar render'ı önlenir. Görsel/davranış aynı.
export default React.memo(NeonSidebar);
