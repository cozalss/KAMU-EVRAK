/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   "Yeni evrak yükle" + "Örnek evrakla dene" dropdown girişi. Klavye erişilebilir (button + focusRing). */
import React, { useState } from "react";
import { MONO, T, V, R, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, Icon } from "./neonUi.jsx";

const NAV = [
  { id: "panel", label: "Panel", icon: "grid" },
  { id: "gelen", label: "Gelen evrak", icon: "inbox", badge: true },
  { id: "giden", label: "Giden evrak", icon: "arrow", count: "giden" },
  { id: "isleniyor", label: "İşleniyor", icon: "spin", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "doc", count: "drafts" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
  { id: "denetim", label: "Denetim izi", icon: "shield" },
];

function NavBtn({ item, active, onClick, busy, inboxCount, draftCount, gidenCount }) {
  const Ic = Icon[item.icon];
  const base = { position: "relative", display: "flex", alignItems: "center", gap: SP.s, width: "100%", padding: "8px 12px", borderRadius: RAD.ctl, ...TYPE.ui, textAlign: "left", cursor: "pointer" };
  const badgeVal = item.badge ? inboxCount : item.count === "drafts" ? draftCount : item.count === "giden" ? gidenCount : null;
  const showBadge = badgeVal != null && badgeVal > 0;
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} {...focusRing}
      style={active
        ? { ...base, background: ALFA(T), border: "1px solid transparent", color: PAL.ink, fontWeight: 500, justifyContent: showBadge ? "space-between" : "flex-start" }
        : { ...base, border: "1px solid transparent", background: "transparent", color: PAL.mut, justifyContent: showBadge ? "space-between" : "flex-start" }}>
      {active && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: SP.s, bottom: SP.s, width: 2, background: T }} />}
      <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        <span style={{ color: active ? DERIN.T : PAL.mut2, display: "flex" }}>{Ic && <Ic />}</span>{item.label}
      </span>
      {item.live && active && busy
        ? <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, border: `2px solid ${PAL.line}`, borderTopColor: T, animation: "nu-spin .8s linear infinite", marginLeft: "auto" }} />
        : showBadge && <span aria-label={`${badgeVal} öğe`} style={{ ...TYPE.meta, ...TNUM, color: PAL.mut }}>{badgeVal}</span>}
    </button>
  );
}

/* Örnek evrak satırı — nötr ikon + başlık + açıklama; hover'da zemin tonu + görünen ok.
   Giriş tek sefer nu-rise. */
function SampleRow({ sample, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="option" aria-selected="false" title={sample.aciklama} onClick={() => onPick(sample)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} {...focusRing}
      style={{
        cursor: "pointer", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: SP.m,
        padding: SP.s, borderRadius: RAD.ctl, border: "none",
        background: hover ? PAL.hov : "transparent", transition: "background .12s ease-out",
        animation: "nu-rise .16s ease-out both",
      }}>
      <span aria-hidden="true" style={{ flexShrink: 0, display: "flex", color: hover ? DERIN.T : PAL.mut2, transition: "color .12s ease-out" }}><Icon.doc /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", ...TYPE.data, fontWeight: 500, color: hover ? PAL.ink : PAL.ink2 }}>{sample.label}</span>
        {sample.aciklama && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", ...TYPE.data, color: PAL.mut3, marginTop: SP.xs }}>{sample.aciklama}</span>}
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, display: "flex", color: DERIN.T, opacity: hover ? 1 : 0, transition: "opacity .12s ease-out" }}><Icon.arrow /></span>
    </button>
  );
}

const ROL_TR = { memur: "Memur", yetkili: "Yetkili", yonetici: "Yönetici", sistem: "Sistem" };

function bashHarfler(ad) {
  const p = (ad || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || p[0]?.[1] || "")).toUpperCase() || "?";
}

function NeonSidebar({ activeView, onNavigate, onUpload, samples = [], onPickSample, busy, inboxCount = 0, draftCount = 0, gidenCount = 0, user, onLogout, onPalet }) {
  const [showSamples, setShowSamples] = useState(false);
  return (
    <aside aria-label="Çalışma alanı navigasyonu" style={{ width: 228, flexShrink: 0, background: PAL.bg2, borderRight: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", padding: "16px 12px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
      <button type="button" onClick={() => onNavigate("panel")}
        onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = `0 0 0 2px ${PAL.bg}, 0 0 0 4px ${T}`; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
        style={{ display: "flex", alignItems: "center", gap: SP.m, padding: "4px 8px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: RAD.card, outline: "none" }}>
        <img src="/logo.png" alt="" width="40" height="40" style={{ display: "block", flexShrink: 0, borderRadius: RAD.card }} />
        <span style={{ position: "relative", ...TYPE.h2, color: PAL.ink }}>kamu-evrak
          <span aria-hidden="true" style={{ position: "absolute", right: -9, bottom: 2, width: 5, height: 5, borderRadius: RAD.dot, background: R }} />
        </span>
      </button>

      <div style={{ ...TYPE.meta, color: PAL.mut2, padding: "0 8px 8px" }}>Çalışma alanı</div>
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} />)}
      </nav>

      <button type="button" onClick={onUpload} disabled={busy} {...focusRing}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = PAL.surf; }}
        style={{
          cursor: busy ? "not-allowed" : "pointer", marginTop: SP.l, display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s,
          padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500,
          border: busy ? "1px solid transparent" : `1px solid ${PAL.inputLine}`,
          background: busy ? PAL.press : PAL.surf, color: busy ? PAL.mut2 : PAL.ink,
          transition: "background .12s ease-out",
        }}>
        <Icon.plus /> Yeni evrak yükle
      </button>

      {samples.length > 0 && (
        <div style={{ position: "relative", marginTop: SP.s }} onKeyDown={(e) => { if (e.key === "Escape") setShowSamples(false); }}>
          <button type="button" onClick={() => setShowSamples((v) => !v)} aria-expanded={showSamples} aria-haspopup="listbox" aria-controls="nu-samples" {...focusRing}
            style={{
              cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s,
              padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500, color: DERIN.T,
              border: `1px solid ${showSamples ? PAL.lineHi : PAL.line}`,
              background: showSamples ? ALFA(T) : "transparent",
              transition: "background .12s ease-out, border-color .12s ease-out",
            }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3 L13.7 8.3 L19 10 L13.7 11.7 L12 17 L10.3 11.7 L5 10 L10.3 8.3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
            </span>
            <span style={{ whiteSpace: "nowrap" }}>Örnek evrakla dene</span>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, transition: "transform .15s ease-out", transform: showSamples ? "rotate(180deg)" : "rotate(0deg)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </button>
          {showSamples && (
            <div id="nu-samples" role="listbox" aria-label="Örnek evraklar"
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0, width: 304, maxHeight: 400, overflowY: "auto",
                background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, padding: SP.s,
                boxShadow: SH.pop, zIndex: 40, animation: "nu-rise .16s ease-out both",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "4px 8px 8px" }}>
                <span style={{ ...TYPE.meta, color: PAL.mut2 }}>Hızlı başla</span>
                <span style={{ marginLeft: "auto", ...TYPE.meta, ...TNUM, color: PAL.mut3 }}>{samples.length} örnek</span>
              </div>
              {samples.map((s) => (
                <SampleRow key={s.id} sample={s} onPick={(x) => { setShowSamples(false); onPickSample(x); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Komut paleti kısayolu — keşfedilebilirlik (Ctrl+K her yerden de açar). */}
      {onPalet && (
        <button type="button" onClick={onPalet} {...focusRing}
          onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{ cursor: "pointer", marginTop: SP.s, display: "flex", alignItems: "center", gap: SP.s, padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500, color: PAL.mut2, border: `1px solid ${PAL.line}`, background: "transparent", transition: "background .12s ease-out" }}>
          <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <span style={{ flex: 1, textAlign: "left" }}>Komut paleti</span>
          <kbd style={{ fontFamily: MONO, fontSize: 12, color: PAL.mut3, border: `1px solid ${PAL.line}`, borderRadius: RAD.chip, padding: "1px 6px" }}>Ctrl K</kbd>
        </button>
      )}

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: SP.m, padding: SP.m, borderRadius: RAD.card, background: PAL.surfHi, border: `1px solid ${PAL.line}` }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: RAD.dot, background: V, display: "flex", alignItems: "center", justifyContent: "center", ...TYPE.meta, fontWeight: 500, color: PAL.onAccent }}>{bashHarfler(user?.ad_soyad)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", ...TYPE.data, color: PAL.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.ad_soyad || "Kullanıcı"}</span>
          <span style={{ display: "block", ...TYPE.meta, color: PAL.mut3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.unvan || ROL_TR[user?.rol] || "—"}</span>
        </span>
        {onLogout && (
          <button type="button" onClick={onLogout} aria-label="Çıkış yap" title="Çıkış yap" {...focusRing}
            style={{ flexShrink: 0, width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: RAD.ctl, cursor: "pointer", color: PAL.mut2, background: "transparent", border: `1px solid ${PAL.line}`, transition: "color .12s ease-out, border-color .12s ease-out" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = DERIN.kirmizi; e.currentTarget.style.borderColor = PAL.lineHi; }}
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
