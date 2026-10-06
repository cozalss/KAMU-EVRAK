/* NeonSidebar — çalışma alanı navigasyonu. Her öğe GERÇEK görünüm değiştirir (activeView).
   Tek eylem girişi: "Yeni evrak yükle". Klavye erişilebilir (button + focusRing).
   Tabandaki kullanıcı kartı HesapMenu'ye devredildi (profil/tercih/yardım/denetim izi/KVKK/çıkış
   tek menüde) — Denetim izi günlük iş akışının önünde durmasın diye ana NAV'da DEĞİL, burada.
   Örnek evrak dropdown'ı kaldırıldı; örnekler Gelen evrak görünümünden açılır. */
import React, { useState, useEffect } from "react";
import { PAL, DERIN, TYPE, TNUM, RAD, SP, EASE, MONO, SR_ONLY, focusRing, MarkaKaro } from "./neonUi.jsx";
import HesapMenu from "./HesapMenu.jsx";
import { NAV, DENETIM_OGE, NavBtn, RayIpucu, RayIpucuSaglayici } from "./kabukNav.jsx";
import { Logotype, LOGOTYPE } from "./kabukAtomlari.jsx";
import KabukSicil from "./KabukSicil.jsx";
import KabukAltSerit from "./KabukAltSerit.jsx";

/* Panel daralt/genişlet ikonu — ChatGPT kenar çubuğu toggle'ının çizgi-dili muadili. */
const PanelIkon = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

/* Telefon eşiği — ray yerine alt kulakçık şeridi (KabukAltSerit). */
const MOBIL_SORGU = "(max-width: 720px)";
function useMobil() {
  const [mobil, setMobil] = useState(() => window.matchMedia?.(MOBIL_SORGU)?.matches ?? false);
  useEffect(() => {
    const sorgu = window.matchMedia?.(MOBIL_SORGU);
    if (!sorgu) return undefined;
    const guncelle = (e) => setMobil(e.matches);
    sorgu.addEventListener?.("change", guncelle);
    return () => sorgu.removeEventListener?.("change", guncelle);
  }, []);
  return mobil;
}

/* Daralt/genişlet düğmesi — geniş rayda marka satırının sağında; DAR rayda en altta (marka karosuyla
   üst üste iki eş ağırlıklı kare "iki logo" gibi okunuyordu — jüri). */
function DaraltDugme({ dar, onClick }) {
  const etiket = dar ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt";
  return (
    <RayIpucu acik={dar} etiket={etiket}>
      <button type="button" onClick={onClick} aria-expanded={!dar} aria-label={etiket} title={dar ? undefined : etiket} {...focusRing} data-press=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = dar ? "transparent" : PAL.surf; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: dar ? "100%" : 30, height: 30, marginLeft: dar ? 0 : "auto", borderRadius: RAD.ctl, border: `1px solid ${dar ? "transparent" : PAL.line}`, background: dar ? "transparent" : PAL.surf, color: dar ? PAL.mut2 : PAL.ink2, flexShrink: 0, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
        <PanelIkon />
      </button>
    </RayIpucu>
  );
}

/* Daraltılmış ikon-ray modu — tercih kalıcı (localStorage; özel modda oturumluk kalır). */
function useDarRay() {
  const [dar, setDar] = useState(() => {
    try { return localStorage.getItem("nu-sidebar-dar") === "1"; } catch { return false; }
  });
  const degistir = () => setDar((v) => {
    const yeni = !v;
    try { localStorage.setItem("nu-sidebar-dar", yeni ? "1" : "0"); } catch { /* özel mod — tercih oturumluk kalır */ }
    return yeni;
  });
  return [dar, degistir];
}

/* Yükle — cilt üstünde İKİNCİL dil (tur 4): birincil eylem görünümün kendisinde kalır. */
function YukleDugme({ kompakt, busy, onUpload }) {
  return (
    <RayIpucu acik={kompakt} etiket="Yeni evrak yükle">
      <button type="button" onClick={onUpload} disabled={busy} aria-label={kompakt ? "Yeni evrak yükle" : undefined} {...focusRing} data-press="" data-dokunma=""
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = PAL.surfHi; }}
        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = PAL.surf; }}
        style={{
          cursor: busy ? "not-allowed" : "pointer", marginTop: SP.xl, display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s,
          padding: kompakt ? "10px 0" : "10px 14px", minHeight: 40, borderRadius: RAD.card, ...TYPE.ui, fontWeight: 600,
          border: `1px solid ${busy ? PAL.line : PAL.lineHi}`,
          background: busy ? "transparent" : PAL.surf, color: busy ? PAL.mut2 : PAL.ink,
          transition: `background .12s ease-out, transform .14s ${EASE.out}`,
        }}>
        <span aria-hidden="true" style={{ display: "flex", color: busy ? PAL.mut2 : DERIN.T }}><Icon18Arti /></span>{!kompakt && "Yeni evrak yükle"}
      </button>
    </RayIpucu>
  );
}

function NeonSidebar(props) {
  const { activeView, onNavigate, onUpload, busy, sayac, veriBayat = false, sicil, user, onLogout, tema, onTemaDegistir, kota } = props;
  const [dar, darDegistir] = useDarRay();
  const mobil = useMobil();
  if (mobil) return <KabukAltSerit {...props} />;
  const kompakt = dar;

  return (
    <RayIpucuSaglayici>
    <aside data-ray="" aria-label="Çalışma alanı navigasyonu" style={{ width: kompakt ? 64 : 236, flexShrink: 0, background: PAL.bg2,
      /* Cilt bezi dokusu + sağ kenar dikişi. Dikiş inset gölgedir: etkin sırt 1 px taşarak dikişi
         tam bağlandığı satırda keser. */
      backgroundImage: "var(--ke-ray-doku)", boxShadow: "inset -1px 0 0 var(--ke-ray-kenar, transparent)", color: PAL.ink, display: "flex", flexDirection: "column", padding: kompakt ? "16px 8px" : "16px 12px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start", transition: "width .18s ease-out, padding .18s ease-out" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: kompakt ? "center" : "flex-start", gap: SP.xs, paddingBottom: SP.l }}>
        <RayIpucu acik={kompakt} etiket={`${LOGOTYPE} · Panel`}>
          <button type="button" onClick={() => onNavigate("panel")} aria-label={`${LOGOTYPE} — Panel`} data-dokunma="" {...focusRing}
            style={{ display: "flex", alignItems: "center", gap: SP.s, padding: kompakt ? 0 : "4px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: RAD.card, minWidth: 0 }}>
            <MarkaKaro size={kompakt ? 32 : 36} nokta={false} />
            {!kompakt && <Logotype />}
          </button>
        </RayIpucu>
        {!kompakt && <DaraltDugme dar={false} onClick={darDegistir} />}
      </div>

      {!kompakt && <div style={{ ...TYPE.antet, color: PAL.mut3, padding: "8px 12px 10px", textTransform: "uppercase" }}>Çalışma alanı</div>}
      <nav aria-label="Bölümler" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((it) => <NavBtn key={it.id} item={it} active={activeView === it.id} onClick={() => onNavigate(it.id)} busy={busy} sayac={sayac} dar={kompakt} />)}
        {activeView === "denetim" && (
          <>
            <span aria-hidden="true" style={{ height: 1, margin: `${SP.s}px ${kompakt ? 6 : 12}px`, background: PAL.line }} />
            <NavBtn item={DENETIM_OGE} active onClick={() => onNavigate("denetim")} busy={busy} dar={kompakt} />
          </>
        )}
      </nav>

      <YukleDugme kompakt={kompakt} busy={busy} onUpload={onUpload} />

      <DemoKotaSayaci kota={kota} kompakt={kompakt} />
      {!kompakt && <KabukSicil sicil={sicil} bayat={veriBayat} />}

      <AsistanDugme kompakt={kompakt} />
      {kompakt && <div style={{ paddingBottom: SP.s }}><DaraltDugme dar onClick={darDegistir} /></div>}
      <HesapMenu user={user} onLogout={onLogout} onDenetimAc={() => onNavigate("denetim")}
        tema={tema} onTemaDegistir={onTemaDegistir} dar={kompakt} />
    </aside>
    </RayIpucuSaglayici>
  );
}

const Icon18Arti = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
);

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
      <RayIpucu acik={kompakt} etiket="Evrak asistanı" ek={kisayol}>
      <button type="button" data-asistan-tetik="" data-press="" data-dokunma=""
        onClick={() => window.dispatchEvent(new CustomEvent("ke-asistan", { detail: { ac: "degistir" } }))}
        aria-expanded={acik} aria-haspopup="dialog" aria-keyshortcuts={mac ? "Meta+." : "Control+."}
        aria-label={kompakt ? "Evrak asistanı" : undefined} {...focusRing}
        onMouseEnter={(e) => { if (!acik) e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = acik ? PAL.press : "transparent"; }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: kompakt ? "center" : "flex-start", gap: SP.s + 2, width: "100%", minHeight: 40, padding: kompakt ? "9px 0" : "9px 12px", borderRadius: RAD.card, border: `1px solid ${acik ? PAL.lineHi : PAL.line}`, background: acik ? PAL.press : "transparent", color: PAL.ink2, ...TYPE.ui, fontWeight: 500, textAlign: "left", transition: `background .12s ease-out, border-color .12s ease-out, transform .14s ${EASE.out}` }}>
        <span aria-hidden="true" style={{ display: "flex", color: acik ? "var(--ke-derin-t)" : PAL.mut2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6 a3 3 0 0 1 3-3 H17 a3 3 0 0 1 3 3 V13 a3 3 0 0 1-3 3 H10 L5.5 20 V16 H7 a3 3 0 0 1-3-3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8.5 8.5 H15.5 M8.5 11.5 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </span>
        {!kompakt && <span style={{ flex: 1 }}>Asistan</span>}
        {!kompakt && <kbd className="ke-kisayol" style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", padding: "0 5px", borderRadius: RAD.chip, border: `1px solid ${PAL.line}`, color: PAL.mut3, background: "transparent" }}>{kisayol}</kbd>}
      </button>
      </RayIpucu>
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
