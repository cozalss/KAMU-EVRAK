/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   Tek eylem girişi: "Yeni evrak yükle". Klavye erişilebilir (button + focusRing).
   Tabandaki kullanıcı kartı HesapMenu'ye devredildi (profil/tercih/yardım/denetim izi/KVKK/çıkış
   tek menüde) — Denetim izi günlük iş akışının önünde durmasın diye ana NAV'da DEĞİL, burada.
   Örnek evrak dropdown'ı kaldırıldı; örnekler Gelen evrak görünümünden açılır. */
import React, { useState, useEffect } from "react";
import { DISPLAY, T, R, PAL, DERIN, TYPE, TNUM, RAD, SP, EASE, MONO, SR_ONLY, focusRing, FOCUS_HALKA, Icon, MarkaKaro } from "./neonUi.jsx";
import { Activity } from "lucide-react";
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

/* "İşleniyor" ikonu: boşta DURAĞAN yarım yay "donmuş spinner" gibi okunuyordu (iptal
   sonrası "hâlâ dönüyor mu?" şüphesi — tur 3 gözlemi). Boşta nabız çizgisi; yay yalnız
   koşum GERÇEKTEN sürerken (busy) ve döner. Hareket = bilgi. */
const BostaNabiz = ({ donuk: _donuk, ...p }) => <Activity size={18} strokeWidth={1.75} aria-hidden="true" {...p} />;

function NavBtn({ item, active, onClick, busy, inboxCount, draftCount, gidenCount, dar }) {
  const Ic = item.icon === "spin" && !busy ? BostaNabiz : Icon[item.icon];
  // Geri bildirim basış ANINDA (Apple response): hover zemin + data-press scale — görünüm
  // değişimini beklemeden düğme "duyduğunu" söyler.
  const base = { position: "relative", display: "flex", alignItems: "center", gap: SP.s, width: "100%", padding: dar ? "10px 0" : "9px 12px", borderRadius: RAD.card, ...TYPE.ui, textAlign: "left", cursor: "pointer", transition: `background .12s ease-out, transform .14s ${EASE.out}` };
  const badgeVal = item.badge ? inboxCount : item.count === "drafts" ? draftCount : item.count === "giden" ? gidenCount : null;
  const showBadge = badgeVal != null && badgeVal > 0;
  const canli = item.live && active && busy;
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined}
      aria-label={dar ? `${item.label}${showBadge ? ` (${badgeVal} öğe)` : ""}` : undefined}
      title={dar ? item.label : undefined} {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={active
        ? { ...base, background: "transparent", border: "1px solid transparent", color: "var(--ke-sayfa-ink)", fontWeight: 600, justifyContent: dar ? "center" : showBadge ? "space-between" : "flex-start" }
        : { ...base, border: "1px solid transparent", background: "transparent", color: PAL.mut, justifyContent: dar ? "center" : showBadge ? "space-between" : "flex-start" }}>
      {/* DOSYA SIRTI — aktif öğe rayın sağ kenarına kadar uzanıp sayfa zeminiyle birleşir
          (iç bükey köşeler iki küçük radyal maskeyle). DÜZ öğe, animasyon katmanına BAĞLI DEĞİL:
          önceki sürüm motion layoutId ile öğeler arası kayıyordu; projeksiyon durumu bozulunca
          (HMR sonrası, kullanıcı bulgusu 2026-10-03) sırt "beyaz yanıp" kayboluyor, aktif metin
          lacivert üstünde koyu kalıyordu. Şimdi sırt HER ZAMAN çizilir; giriş yalnız soldan
          açılan kısa bir clip-path (nu-sirt) — başarısız olsa bile son kare tam sırttır. */}
      {active && (
        <span aria-hidden="true"
          style={{ position: "absolute", zIndex: 0, left: 0, right: dar ? -9 : -13, top: 0, bottom: 0, background: "var(--ke-sayfa)", borderRadius: `${RAD.card}px 0 0 ${RAD.card}px`, animation: `nu-sirt .22s ${EASE.out} both` }}>
          <span style={{ position: "absolute", right: 0, top: -12, width: 12, height: 12, background: "radial-gradient(circle at 0 0, transparent 11.5px, var(--ke-sayfa) 12px)" }} />
          <span style={{ position: "absolute", right: 0, bottom: -12, width: 12, height: 12, background: "radial-gradient(circle at 0 100%, transparent 11.5px, var(--ke-sayfa) 12px)" }} />
          <span style={{ position: "absolute", left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: "var(--ke-sayfa-t)" }} />
        </span>
      )}
      {dar ? (
        /* İkon-ray modu: yalnız ikon; rozet/canlılık sağ-üst köşede küçük nokta olarak. */
        <span style={{ position: "relative", display: "flex" }}>
          <span style={{ position: "relative", zIndex: 1, color: active ? "var(--ke-sayfa-t)" : PAL.mut2, display: "flex" }}>{Ic && <Ic {...(item.icon === "spin" ? { donuk: !busy } : {})} />}</span>
          {(showBadge || canli) && (
            <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -5, width: 7, height: 7, borderRadius: RAD.dot, background: T, animation: canli ? "nu-think 1.2s ease-in-out infinite" : "none" }} />
          )}
        </span>
      ) : (
        <>
          <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: SP.s + 2 }}>
            <span style={{ color: active ? "var(--ke-sayfa-t)" : PAL.mut2, display: "flex" }}>{Ic && <Ic {...(item.icon === "spin" ? { donuk: !busy } : {})} />}</span>{item.label}
          </span>
          {canli
            ? <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, border: `2px solid ${PAL.line}`, borderTopColor: "var(--ke-sayfa-t)", animation: "nu-spin .8s linear infinite", marginLeft: "auto", position: "relative", zIndex: 1 }} />
            : showBadge && <span aria-label={`${badgeVal} öğe`} style={{ position: "relative", zIndex: 1, ...TYPE.meta, ...TNUM, fontWeight: 600, minWidth: 22, textAlign: "center", padding: "1px 6px", borderRadius: 999, color: active ? "var(--ke-sayfa-ink)" : PAL.ink2, background: active ? "transparent" : PAL.surfHi }}>{badgeVal}</span>}
        </>
      )}
    </button>
  );
}

function NeonSidebar({ activeView, onNavigate, onUpload, busy, inboxCount = 0, draftCount = 0, gidenCount = 0, user, onLogout, tema, onTemaDegistir, kota }) {
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
    <aside data-ray="" aria-label="Çalışma alanı navigasyonu" style={{ width: kompakt ? 64 : 236, flexShrink: 0, background: PAL.bg2, color: PAL.ink, display: "flex", flexDirection: "column", padding: kompakt ? "16px 8px" : "16px 12px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start", transition: "width .18s ease-out, padding .18s ease-out" }}>
      <div style={{ display: "flex", flexDirection: kompakt ? "column" : "row", alignItems: "center", gap: kompakt ? SP.s : SP.xs, paddingBottom: SP.l }}>
        <button type="button" onClick={() => onNavigate("panel")} title={kompakt ? "kamu-evrak — Panel" : undefined} data-dokunma=""
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) e.currentTarget.style.boxShadow = FOCUS_HALKA; }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          style={{ display: "flex", alignItems: "center", gap: SP.s, padding: kompakt ? 0 : "4px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: RAD.card, outline: "none", minWidth: 0 }}>
          <MarkaKaro size={kompakt ? 32 : 36} nokta={kompakt} />
          {!kompakt && (
            /* Logotype — marka istisnası olarak büyük harf; imza noktası akış İÇİNDE durur,
               toggle düğmesiyle asla çakışmaz. */
            <span style={{ display: "flex", alignItems: "baseline", gap: SP.xs, minWidth: 0 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 14, lineHeight: "24px", fontWeight: 800, fontStretch: "112%", letterSpacing: ".01em", color: PAL.ink, whiteSpace: "nowrap" }}>KAMU·EVRAK</span>
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

      {!kompakt && <div style={{ ...TYPE.antet, color: PAL.mut3, padding: "8px 12px 10px", textTransform: "uppercase" }}>Çalışma alanı</div>}
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} dar={kompakt} />)}
      </nav>

      <button type="button" onClick={onUpload} disabled={busy} aria-label={kompakt ? "Yeni evrak yükle" : undefined} title={kompakt ? "Yeni evrak yükle" : undefined} {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = DERIN.Th; }}
        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = T; }}
        style={{
          cursor: busy ? "not-allowed" : "pointer", marginTop: SP.xl, display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s,
          padding: kompakt ? "10px 0" : "10px 14px", minHeight: 40, borderRadius: RAD.card, ...TYPE.ui, fontWeight: 600,
          border: "1px solid transparent",
          background: busy ? PAL.press : T, color: busy ? PAL.mut2 : PAL.onAccent,
          transition: `background .12s ease-out, transform .14s ${EASE.out}`,
        }}>
        <Icon.plus />{!kompakt && " Yeni evrak yükle"}
      </button>

      {/* Demo hak sayacı — sınırladığı kontrolün HEMEN ALTINDA. `kota` verilmediğinde
          (demo kapalı) null render eder → bugünkü görünüm birebir korunur. */}
      <DemoKotaSayaci kota={kota} kompakt={kompakt} />

      <AsistanDugme kompakt={kompakt} />
      <HesapMenu user={user} onLogout={onLogout} onDenetimAc={() => onNavigate("denetim")}
        tema={tema} onTemaDegistir={onTemaDegistir} dar={kompakt} />
    </aside>
  );
}

/* Asistan tetiği — "havale notu" kenar çubuğunda durur (yüzen düğme içeriği örtüyordu; bkz.
   ChatbotWidget başı). Navigasyon öğesi DEĞİL (görünüm değiştirmez) → nav listesinin dışında,
   hesap kartının hemen üstünde; ikincil (çerçeveli) dilde, birincil "Yeni evrak yükle" ile
   yarışmaz. Kısayol ipucu yalnız fare/klavye cihazında (pointer:fine) görünür.
   Çevrimdışı uyarısı da burada: kenar çubuğu her görünümde sabit tek yüzeydir. */
function AsistanDugme({ kompakt }) {
  const [acik, setAcik] = useState(false);
  const [cevrimdisi, setCevrimdisi] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const durum = (e) => setAcik(!!e.detail?.acik);
    const ag = () => setCevrimdisi(navigator.onLine === false);
    window.addEventListener("ke-asistan-durum", durum);
    window.addEventListener("online", ag); window.addEventListener("offline", ag);
    return () => { window.removeEventListener("ke-asistan-durum", durum); window.removeEventListener("online", ag); window.removeEventListener("offline", ag); };
  }, []);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
  const kisayol = mac ? "⌘ ." : "Ctrl .";
  return (
    <div style={{ marginTop: "auto", display: "grid", gap: SP.s, paddingBottom: SP.s }}>
      {cevrimdisi && (
        <div role="status" title="Bağlantı yok — değişiklikler gönderilemez" style={{ display: "flex", alignItems: "center", justifyContent: kompakt ? "center" : "flex-start", gap: SP.s, padding: kompakt ? "6px 0" : "6px 10px", borderRadius: RAD.ctl, border: `1px dashed ${DERIN.sari}`, color: DERIN.sari, ...TYPE.antet, textTransform: "uppercase" }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: DERIN.sari, flexShrink: 0 }} />
          {kompakt ? <span style={SR_ONLY}>Çevrimdışı</span> : "Çevrimdışı"}
        </div>
      )}
      <button type="button" data-asistan-tetik="" data-press="" data-dokunma=""
        onClick={() => window.dispatchEvent(new CustomEvent("ke-asistan", { detail: { ac: "degistir" } }))}
        aria-expanded={acik} aria-haspopup="dialog" aria-keyshortcuts={mac ? "Meta+." : "Control+."}
        aria-label={kompakt ? "Evrak asistanı" : undefined} title={kompakt ? `Evrak asistanı (${kisayol})` : undefined} {...focusRing}
        onMouseEnter={(e) => { if (!acik) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = acik ? PAL.press : "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: kompakt ? "center" : "flex-start", gap: SP.s + 2, width: "100%", minHeight: 40, padding: kompakt ? "9px 0" : "9px 12px", borderRadius: RAD.card, border: `1px solid ${acik ? PAL.lineHi : PAL.line}`, background: acik ? PAL.press : "transparent", color: PAL.ink2, ...TYPE.ui, fontWeight: 500, textAlign: "left", transition: `background .12s ease-out, border-color .12s ease-out, transform .14s ${EASE.out}` }}>
        <span aria-hidden="true" style={{ display: "flex", color: acik ? "var(--ke-derin-t)" : PAL.mut2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8.5 8.5 H15.5 M8.5 11.5 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </span>
        {!kompakt && <span style={{ flex: 1 }}>Asistan</span>}
        {!kompakt && <kbd className="ke-kisayol" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", padding: "0 5px", borderRadius: RAD.chip, border: `1px solid ${PAL.line}`, color: PAL.mut3, background: "transparent" }}>{kisayol}</kbd>}
      </button>
      <style>{"@media (pointer: coarse){.ke-kisayol{display:none}}"}</style>
    </div>
  );
}

function DemoKotaSayaci({ kota, kompakt }) {
  if (!kota?.aktif) return null;
  const kalan = Number(kota.kalan ?? 0);
  const gunluk = Number(kota.gunluk ?? 0);
  const bitti = kalan <= 0 || kota.butce_acik === false;
  const tamMetin = kota.butce_acik === false
    ? "Günlük işlem kapasitesi doldu — yarın yenilenir"
    : `Bugün kalan belge hakkı: ${kalan} / ${gunluk}`;
  return (
    <div
      title={tamMetin}
      aria-label={tamMetin}
      style={{
        marginTop: SP.s, padding: kompakt ? "4px 0" : "4px 8px",
        display: "flex", alignItems: "center", justifyContent: kompakt ? "center" : "flex-start",
        gap: SP.xs, ...TYPE.meta, ...TNUM,
        color: bitti ? DERIN.sari : PAL.mut,
      }}
    >
      {kompakt ? <span>{kalan}</span> : <span>{tamMetin}</span>}
    </div>
  );
}

// React.memo: props (DashboardApp'te useCallback ile sabitlendi) değişmedikçe yeniden render
// olmaz → canlı akış sırasında gereksiz sidebar render'ı önlenir. Görsel/davranış aynı.
export default React.memo(NeonSidebar);
