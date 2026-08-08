/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   Tek eylem girişi: "Yeni evrak yükle". Klavye erişilebilir (button + focusRing).
   Tabandaki kullanıcı kartı HesapMenu'ye devredildi (profil/tercih/yardım/denetim izi/KVKK/çıkış
   tek menüde) — Denetim izi günlük iş akışının önünde durmasın diye ana NAV'da DEĞİL, burada.
   Örnek evrak dropdown'ı kaldırıldı; örnekler Gelen evrak görünümünden açılır. */
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { SANS, T, R, PAL, DERIN, ALFA, TYPE, TNUM, RAD, SP, EASE, EASE_BEZIER, focusRing, Icon, MarkaKaro } from "./neonUi.jsx";
import HesapMenu from "./HesapMenu.jsx";

// Kurgu sırası iş akışını izler: Panel (özet) → İşlenen (tüm işlemlerin arşivi, rozet YOK —
// birikimli arşive "iş bekliyor" rozeti yanlış sinyal olur) → Gelen (kuyruk) → İşleniyor
// (canlı) → Taslaklar (karar bekleyen çalışma kuyruğu) → Giden (gönderilmiş) → Mevzuat.
const NAV = [
  { id: "panel", label: "Panel", icon: "grid" },
  { id: "islenen", label: "İşlenen evrak", icon: "shield" },
  { id: "gelen", label: "Gelen evrak", icon: "inbox", badge: true },
  { id: "isleniyor", label: "İşleniyor", icon: "spin", live: true },
  { id: "taslaklar", label: "Taslaklar", icon: "doc", count: "drafts" },
  { id: "giden", label: "Giden evrak", icon: "arrow", count: "giden" },
  { id: "mevzuat", label: "Mevzuat", icon: "book" },
];

/* Panel daralt/genişlet ikonu — ChatGPT kenar çubuğu toggle'ının çizgi-dili muadili. */
const PanelIkon = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

function NavBtn({ item, active, onClick, busy, inboxCount, draftCount, gidenCount, dar }) {
  const Ic = Icon[item.icon];
  // Geri bildirim basış ANINDA (Apple response): hover zemin + data-press scale — görünüm
  // değişimini beklemeden düğme "duyduğunu" söyler.
  const base = { position: "relative", display: "flex", alignItems: "center", gap: SP.s, width: "100%", padding: dar ? "8px 0" : "8px 12px", borderRadius: RAD.ctl, ...TYPE.ui, textAlign: "left", cursor: "pointer", transition: `background .12s ease-out, transform .14s ${EASE.out}` };
  const badgeVal = item.badge ? inboxCount : item.count === "drafts" ? draftCount : item.count === "giden" ? gidenCount : null;
  const showBadge = badgeVal != null && badgeVal > 0;
  const canli = item.live && active && busy;
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined}
      aria-label={dar ? `${item.label}${showBadge ? ` (${badgeVal} öğe)` : ""}` : undefined}
      title={dar ? item.label : undefined} {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      style={active
        ? { ...base, background: ALFA(T), border: "1px solid transparent", color: PAL.ink, fontWeight: 500, justifyContent: dar ? "center" : showBadge ? "space-between" : "flex-start" }
        : { ...base, border: "1px solid transparent", background: "transparent", color: PAL.mut, justifyContent: dar ? "center" : showBadge ? "space-between" : "flex-start" }}>
      {/* Aktif-sekme çizgisi — layoutId paylaşımlı: nav değişince eski konumdan yeni konuma
          KAYAR (motion "magic move"), sekme sekme "belirir/kaybolur" değil. Ekran-içi hareket
          → EASE.inOut (MASTER.md Motion bölümü). */}
      {active && (
        <motion.span aria-hidden="true" layoutId="nu-nav-active"
          transition={{ type: "tween", duration: 0.18, ease: EASE_BEZIER.inOut }}
          style={{ position: "absolute", left: 0, top: SP.s, bottom: SP.s, width: 2, borderRadius: RAD.chip, background: T }} />
      )}
      {dar ? (
        /* İkon-ray modu: yalnız ikon; rozet/canlılık sağ-üst köşede küçük nokta olarak. */
        <span style={{ position: "relative", display: "flex" }}>
          <span style={{ color: active ? DERIN.T : PAL.mut2, display: "flex" }}>{Ic && <Ic {...(item.icon === "spin" ? { donuk: !busy } : {})} />}</span>
          {(showBadge || canli) && (
            <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -5, width: 7, height: 7, borderRadius: RAD.dot, background: T, animation: canli ? "nu-think 1.2s ease-in-out infinite" : "none" }} />
          )}
        </span>
      ) : (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: SP.s }}>
            <span style={{ color: active ? DERIN.T : PAL.mut2, display: "flex" }}>{Ic && <Ic {...(item.icon === "spin" ? { donuk: !busy } : {})} />}</span>{item.label}
          </span>
          {canli
            ? <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, border: `2px solid ${PAL.line}`, borderTopColor: T, animation: "nu-spin .8s linear infinite", marginLeft: "auto" }} />
            : showBadge && <span aria-label={`${badgeVal} öğe`} style={{ ...TYPE.meta, ...TNUM, color: PAL.mut }}>{badgeVal}</span>}
        </>
      )}
    </button>
  );
}

function NeonSidebar({ activeView, onNavigate, onUpload, busy, inboxCount = 0, draftCount = 0, gidenCount = 0, user, onLogout, tema, onTemaDegistir }) {
  // Daraltılmış ikon-ray modu (ChatGPT sidebar-toggle deseni) — tercih kalıcı (localStorage).
  const [dar, setDar] = useState(() => {
    try { return localStorage.getItem("nu-sidebar-dar") === "1"; } catch { return false; }
  });
  const [mobil, setMobil] = useState(() => window.matchMedia?.("(max-width: 720px)")?.matches ?? false);
  useEffect(() => {
    const sorgu = window.matchMedia?.("(max-width: 720px)");
    if (!sorgu) return undefined;
    const guncelle = (e) => setMobil(e.matches);
    sorgu.addEventListener?.("change", guncelle);
    return () => sorgu.removeEventListener?.("change", guncelle);
  }, []);
  const kompakt = dar || mobil;
  const darDegistir = () => setDar((v) => {
    const yeni = !v;
    try { localStorage.setItem("nu-sidebar-dar", yeni ? "1" : "0"); } catch { /* özel mod — tercih oturumluk kalır */ }
    return yeni;
  });

  return (
    <aside aria-label="Çalışma alanı navigasyonu" style={{ width: kompakt ? 64 : 228, flexShrink: 0, background: PAL.bg2, borderRight: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column", padding: kompakt ? "16px 8px" : "16px 12px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start", transition: "width .18s ease-out, padding .18s ease-out" }}>
      <div style={{ display: "flex", flexDirection: kompakt ? "column" : "row", alignItems: "center", gap: kompakt ? SP.s : SP.xs, paddingBottom: SP.l }}>
        <button type="button" onClick={() => onNavigate("panel")} title={kompakt ? "kamu-evrak — Panel" : undefined}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = `0 0 0 2px ${PAL.bg}, 0 0 0 4px ${T}`; }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          style={{ display: "flex", alignItems: "center", gap: SP.s, padding: kompakt ? 0 : "4px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: RAD.card, outline: "none", minWidth: 0 }}>
          <MarkaKaro size={kompakt ? 32 : 36} nokta={kompakt} />
          {!kompakt && (
            /* Logotype — marka istisnası olarak büyük harf; imza noktası akış İÇİNDE durur,
               toggle düğmesiyle asla çakışmaz. */
            <span style={{ display: "flex", alignItems: "baseline", gap: SP.xs, minWidth: 0 }}>
              <span style={{ fontFamily: SANS, fontSize: 16, lineHeight: "24px", fontWeight: 600, letterSpacing: ".04em", color: PAL.ink, whiteSpace: "nowrap" }}>KAMU-EVRAK</span>
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: RAD.dot, background: R, flexShrink: 0 }} />
            </span>
          )}
        </button>
        {/* Daralt/genişlet — ChatGPT panel-toggle muadili */}
        {!mobil && <button type="button" onClick={darDegistir} aria-expanded={!dar}
          aria-label={dar ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
          title={dar ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"} {...focusRing} data-press=""
          onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, marginLeft: dar ? 0 : "auto", borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.surf, color: PAL.ink2, flexShrink: 0, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
          <PanelIkon />
        </button>}
      </div>

      {!kompakt && <div style={{ ...TYPE.meta, color: PAL.mut2, padding: "0 8px 8px" }}>Çalışma alanı</div>}
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} dar={kompakt} />)}
      </nav>

      <button type="button" onClick={onUpload} disabled={busy} aria-label={kompakt ? "Yeni evrak yükle" : undefined} title={kompakt ? "Yeni evrak yükle" : undefined} {...focusRing} data-press=""
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = PAL.surf; }}
        style={{
          cursor: busy ? "not-allowed" : "pointer", marginTop: SP.l, display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s,
          padding: kompakt ? "8px 0" : "8px 14px", minHeight: 36, borderRadius: RAD.ctl, ...TYPE.ui, fontWeight: 500,
          border: busy ? "1px solid transparent" : `1px solid ${PAL.inputLine}`,
          background: busy ? PAL.press : PAL.surf, color: busy ? PAL.mut2 : PAL.ink,
          transition: `background .12s ease-out, transform .14s ${EASE.out}`,
        }}>
        <Icon.plus />{!kompakt && " Yeni evrak yükle"}
      </button>

      <HesapMenu user={user} onLogout={onLogout} onDenetimAc={() => onNavigate("denetim")}
        tema={tema} onTemaDegistir={onTemaDegistir} dar={kompakt} />
    </aside>
  );
}

// React.memo: props (DashboardApp'te useCallback ile sabitlendi) değişmedikçe yeniden render
// olmaz → canlı akış sırasında gereksiz sidebar render'ı önlenir. Görsel/davranış aynı.
export default React.memo(NeonSidebar);
