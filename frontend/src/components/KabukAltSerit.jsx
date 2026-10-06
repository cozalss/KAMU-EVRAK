/* KabukAltSerit — telefonda (≤ 720 px) gezinme: alttan, güvenli alanlı beş KULAKÇIK
   (tur 6, A-kabuk; jüri: kalıcı 64 px ikon rayı genişliğin %16'sını yiyordu, künye "SABA…"
   diye kırpılıyordu, gezinme başparmağın ulaşamadığı sol kenardaydı).

   Dil masaüstüyle AYNI: şerit lacivert cilttir ([data-ray] kapsamı); etkin kulakçık sayfa
   zemininden sarkıp cilde girer — dosya sırtının mobil ikizi (iç bükey üst köşeler, sayfadan
   uzak kenarda 3 px tükenmez çizgi). Giriş clip-path ile yukarıdan aşağı açılır (nu-kulak).
   Gelen kulakçığında gecikmiş varsa sayı ACELE kırmızısı çerçeveli durur. "Daha" vaul sayfası
   dosyanın arka yaprağı gibi açılır: kalan bölümler + yükle + asistan + hesap kartı.
   Etkin görünüm "Daha" grubundaysa Daha kulakçığı etkin görünür ("neredeyim" cevapsız kalmaz). */
import { useState } from "react";
import { Drawer } from "vaul";
import { Ellipsis } from "lucide-react";
import { PAL, TYPE, RAD, SP, SH, DISPLAY, SR_ONLY, Icon, focusRing } from "./neonUi.jsx";
import { NAV, DENETIM_OGE, NavIkon, rozetDegeri, rozetCizilir, rozetAdEki } from "./kabukNav.jsx";
import { SayiRozet } from "./kabukAtomlari.jsx";
import HesapMenu from "./HesapMenu.jsx";

const ANA = ["panel", "gelen", "taslaklar", "giden"];
const DAHA = NAV.filter((n) => !ANA.includes(n.id));
const DahaIkon = (p) => <Ellipsis size={18} strokeWidth={1.75} aria-hidden="true" {...p} />;

const ALT_CSS = `
.ke-alt-serit{position:fixed;left:0;right:0;bottom:0;z-index:90;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));
  padding:0 6px env(safe-area-inset-bottom);background:var(--ke-bg);background-image:var(--ke-ray-doku);
  box-shadow:0 -1px 0 var(--ke-ray-kenar, var(--ke-line))}
@keyframes nu-kulak{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 -12px 0 -12px)}}`;

/* Kulakçık — etkin sekmenin sayfaya bağlanan dili. */
function Kulakcik() {
  return (
    <span aria-hidden="true" style={{ position: "absolute", zIndex: 0, left: 4, right: 4, top: -1, bottom: 6, background: "var(--ke-sayfa)", borderRadius: `0 0 ${RAD.card}px ${RAD.card}px`, animation: "nu-kulak .22s var(--ke-ease-out) both",
      /* Koyu temada sayfa siyahı lacivert şeritten yalnız 1,16:1 ayrışıyordu (jüri): kenar dikişi
         (--ke-kulak-kenar; açık temada tanımsız → saydam) yanlara ve alta çizilir, üst sayfaya açık kalır. */
      boxShadow: "inset 1px 0 0 var(--ke-kulak-kenar, transparent), inset -1px 0 0 var(--ke-kulak-kenar, transparent), inset 0 -1px 0 var(--ke-kulak-kenar, transparent)" }}>
      <span style={{ position: "absolute", left: -10, top: 0, width: 10, height: 10, background: "radial-gradient(circle at 0 100%, transparent 9.5px, var(--ke-sayfa) 10px)" }} />
      <span style={{ position: "absolute", right: -10, top: 0, width: 10, height: 10, background: "radial-gradient(circle at 100% 100%, transparent 9.5px, var(--ke-sayfa) 10px)" }} />
      <span data-sirt-cizgi="" style={{ position: "absolute", left: 14, right: 14, bottom: 0, height: 3, borderRadius: 2, background: "var(--ke-sayfa-t)" }} />
    </span>
  );
}

function Sekme({ item, etkin, onClick, rozet, canli, ikon }) {
  return (
    <button type="button" onClick={onClick} aria-current={etkin ? "page" : undefined} {...focusRing} data-press="" data-odak-ic=""
      aria-label={`${item.label}${rozetAdEki(rozet)}`}
      style={{ position: "relative", minHeight: 58, display: "grid", placeItems: "center", alignContent: "center", gap: 3, padding: "6px 2px 10px", border: "none", background: "transparent", cursor: "pointer", color: etkin ? "var(--ke-sayfa-ink)" : PAL.mut, transition: "transform .14s var(--ke-ease-out)", borderRadius: RAD.card }}>
      {etkin && <Kulakcik />}
      <span style={{ position: "relative", zIndex: 1, display: "flex", color: etkin ? "var(--ke-sayfa-t)" : PAL.mut2 }}>
        {ikon || <NavIkon item={item} busy={false} canli={false} />}
        {rozetCizilir(rozet) && <span style={{ position: "absolute", top: -7, left: 12 }}><SayiRozet n={rozet.n} acil={rozet.acil} bayat={rozet.bayat} kucuk /></span>}
        {canli && <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -6, width: 7, height: 7, borderRadius: RAD.dot, background: "var(--ke-t)", animation: "nu-think 1.2s ease-in-out infinite" }} />}
      </span>
      <span aria-hidden="true" style={{ position: "relative", zIndex: 1, ...TYPE.meta, lineHeight: "14px", fontWeight: etkin ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{item.short || item.label.replace(" evrak", "")}</span>
    </button>
  );
}

/* Daha sayfasının satırı — 48 px dokunma, ikon + etiket + (etkinse) sırt çizgisi. */
function DahaSatir({ item, etkin, onClick, busy }) {
  return (
    <button type="button" onClick={onClick} aria-current={etkin ? "page" : undefined} {...focusRing} data-press=""
      style={{ display: "flex", alignItems: "center", gap: SP.m, width: "100%", minHeight: 48, padding: "0 14px", borderRadius: RAD.card, border: `1px solid ${etkin ? PAL.lineHi : "transparent"}`, background: etkin ? PAL.surf : "transparent", color: PAL.ink, ...TYPE.read, fontWeight: etkin ? 600 : 500, textAlign: "left", cursor: "pointer", boxShadow: etkin ? "inset 3px 0 0 var(--ke-derin-t)" : "none" }}>
      <span style={{ display: "flex", color: etkin ? "var(--ke-derin-t)" : PAL.mut2 }}><NavIkon item={item} busy={busy} canli={false} /></span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.live && busy && <span style={{ ...TYPE.antet, textTransform: "uppercase", color: "var(--ke-derin-t)" }}>Sürüyor</span>}
    </button>
  );
}

export default function KabukAltSerit({ activeView, onNavigate, onUpload, busy, sayac, user, onLogout, tema, onTemaDegistir, kota }) {
  const [acik, setAcik] = useState(false);
  const dahaEtkin = !ANA.includes(activeView);
  const git = (id) => { setAcik(false); onNavigate(id); };
  const dahaListe = activeView === "denetim" ? [...DAHA, DENETIM_OGE] : DAHA;
  return (
    <>
      <style>{ALT_CSS}</style>
      <nav data-ray="" className="ke-alt-serit" aria-label="Çalışma alanı navigasyonu">
        {ANA.map((id) => {
          const item = NAV.find((n) => n.id === id);
          return <Sekme key={id} item={item} etkin={activeView === id} onClick={() => onNavigate(id)} rozet={rozetDegeri(item, sayac)} />;
        })}
        <Drawer.Root open={acik} onOpenChange={setAcik}>
          <Sekme item={{ id: "daha", label: "Daha" }} etkin={dahaEtkin} onClick={() => setAcik(true)} canli={busy} ikon={<DahaIkon />} />
          <Drawer.Portal>
            <Drawer.Overlay style={{ position: "fixed", inset: 0, zIndex: 320, background: PAL.scrim }} />
            <Drawer.Content aria-describedby={undefined} data-kaydirma-kapsa=""
              style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 320, maxHeight: "88vh", display: "flex", flexDirection: "column", background: PAL.bg, borderTop: `1px solid ${PAL.lineHi}`, borderTopLeftRadius: RAD.pop, borderTopRightRadius: RAD.pop, boxShadow: SH.modal, outline: "none", willChange: "transform", paddingBottom: "env(safe-area-inset-bottom)" }}>
              <Drawer.Handle style={{ margin: "10px auto 0", width: 36, height: 4, background: PAL.lineHi, borderRadius: RAD.dot, flexShrink: 0 }} />
              <div style={{ padding: `${SP.m}px ${SP.l}px ${SP.l}px`, overflowY: "auto", display: "grid", gap: SP.xs }}>
                <div aria-hidden="true" style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", display: "flex", alignItems: "center", gap: SP.m }}>
                  <span>KAMU-EVRAK · Gezinme</span><span style={{ flex: 1, height: 1, background: PAL.line }} />
                </div>
                <Drawer.Title style={{ margin: `${SP.xs}px 0 ${SP.s}px`, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: 22, lineHeight: "26px", letterSpacing: "-.01em", color: PAL.ink }}>Diğer bölümler</Drawer.Title>
                <span style={SR_ONLY}>Kalan görünümler, evrak yükleme, asistan ve hesap</span>
                {dahaListe.map((it) => <DahaSatir key={it.id} item={it} etkin={activeView === it.id} onClick={() => git(it.id)} busy={busy} />)}
                <div aria-hidden="true" style={{ height: 1, background: PAL.line, margin: `${SP.s}px 0` }} />
                <button type="button" onClick={() => { setAcik(false); onUpload?.(); }} disabled={busy} {...focusRing} data-press=""
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, minHeight: 48, borderRadius: RAD.card, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: busy ? PAL.mut2 : PAL.ink, ...TYPE.read, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}>
                  <span aria-hidden="true" style={{ display: "flex", color: "var(--ke-derin-t)" }}><Icon.plus /></span>Yeni evrak yükle
                </button>
                <button type="button" onClick={() => { setAcik(false); window.dispatchEvent(new CustomEvent("ke-asistan", { detail: { ac: "degistir" } })); }} {...focusRing} data-press=""
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: SP.s, minHeight: 48, borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: "transparent", color: PAL.ink2, ...TYPE.read, fontWeight: 500, cursor: "pointer" }}>
                  Evrak asistanı
                </button>
                {kota?.aktif && <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut, textAlign: "center" }}>Bugün kalan belge hakkı: {kota.kalan ?? 0} / {kota.gunluk ?? 0}</p>}
                <div style={{ marginTop: SP.s }}>
                  <HesapMenu user={user} onLogout={onLogout} onDenetimAc={() => git("denetim")} tema={tema} onTemaDegistir={onTemaDegistir} />
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </nav>
    </>
  );
}
