/* CanliIslemAkisiKarti — AuthPage sol marka paneli süsü: 16 düğümlü boru hattının minyatür,
   sonsuz-döngülü canlı-izlenimi (gerçek veri DEĞİL — aria-hidden ebeveyn içinde salt demo).
   Adım/sayaç ilerleyişi kendi kendini zamanlayan setTimeout zinciriyle sürer (React state);
   tarama ışını yalnız CSS @keyframes ile döner ve bu döngüden bağımsız sürekli tarar.
   prefers-reduced-motion: sayaç hiç başlamaz, son (tamamlanmış) kare sabit gösterilir —
   CSS animasyonları da NEON_KEYFRAMES'teki global reduced-motion kuralıyla zaten söner. */
import { useEffect, useState } from "react";
import { MONO, PAL, T, DERIN, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon } from "./neonUi.jsx";

const NODES = [
  "oku", "siniflandir", "cikar", "eksik_tespit", "decompose", "mevzuat_oner", "ozetle",
  "route_birim", "yazi_taslak", "verify", "risk_guard", "kanit_baglama", "sdp_kod",
  "denetim_izi", "clarifier", "finalize",
];
const STEPS = [
  { label: "Oku", sub: "1 sayfa · KEP eki" },
  { label: "Sınıflandır", sub: "KEP bildirimi · Yazı İşleri" },
  { label: "Mevzuat", sub: "BEYD Yönetmeliği · 1 kaynak" },
  { label: "Resmî yazı", sub: null },
];
const LINE_W = [72, 92, 56, 84, 64, 88, 48];
const TOTAL_NODES = NODES.length;
const TICK_MS = 650, PAUSE_MS = 2000;
// Kart geneli DERIN.T (teal) kullanırken tarama ışını kasıtlı MAVİ — spesifikasyon gereği
// teal'den ayrışsın diye tek-seferlik yerel aksan (genel tasarım sistemine eklenmez).
const TARAMA_MAVI = "#3568b5";
const TARAMA_GRADIENT = `linear-gradient(180deg, transparent, color-mix(in srgb, ${TARAMA_MAVI} 25%, transparent) 35%, ${TARAMA_MAVI} 50%, color-mix(in srgb, ${TARAMA_MAVI} 25%, transparent) 65%, transparent)`;

const KEYFRAMES = `
@keyframes ke-tarama-isini{0%{transform:translateY(-26px)}100%{transform:translateY(140px)}}
@keyframes ke-belge-satir{0%,85%,100%{background:var(--ke-press)}10%{background:color-mix(in srgb, ${TARAMA_MAVI} 45%, var(--ke-press))}}
`;

function useAzaltilmisHareket() {
  const [az, setAz] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setAz(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return az;
}

function adimDurumu(i, node, done) {
  if (done) return "done";
  const start = i * 4 + 1, end = start + 3;
  if (node > end) return "done";
  if (node >= start) return "active";
  return "pending";
}

function AdimIkon({ st }) {
  if (st === "pending") return <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: RAD.dot, border: `1.5px solid ${PAL.lineHi}`, flexShrink: 0 }} />;
  if (st === "active") return (
    <span aria-hidden="true" style={{ position: "relative", width: 14, height: 14, flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 20 20" style={{ position: "absolute", inset: 0, animation: "nu-spin 1s linear infinite" }}>
        <circle cx="10" cy="10" r="8" stroke={PAL.line} strokeWidth="3" fill="none" />
        <path d="M10 2 A8 8 0 0 1 18 10" stroke={T} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
  return (
    <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: RAD.dot, background: DERIN.T, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "nu-pop .3s ease-out both" }}>
      <Icon.check width={9} height={9} />
    </span>
  );
}

export default function CanliIslemAkisiKarti() {
  const azaltilmis = useAzaltilmisHareket();
  const [node, setNode] = useState(azaltilmis ? TOTAL_NODES : 1);
  const [done, setDone] = useState(azaltilmis);

  useEffect(() => {
    if (azaltilmis) { setNode(TOTAL_NODES); setDone(true); return undefined; }
    let alive = true, n = 1, timer;
    setNode(1); setDone(false);
    const adim = () => {
      if (!alive) return;
      if (n < TOTAL_NODES) {
        n += 1; setNode(n);
        timer = setTimeout(adim, TICK_MS);
      } else {
        setDone(true);
        timer = setTimeout(() => {
          if (!alive) return;
          n = 1; setNode(1); setDone(false);
          timer = setTimeout(adim, TICK_MS);
        }, PAUSE_MS);
      }
    };
    timer = setTimeout(adim, TICK_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [azaltilmis]);

  return (
    <div aria-hidden="true" style={{
      display: "flex", gap: SP.l, padding: SP.l, marginBottom: SP.xl, maxWidth: 480,
      background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card,
      animation: "nu-rise .18s ease-out both",
    }}>
      <style>{KEYFRAMES}</style>

      {/* Sol — başlık + 16 segmentli ilerleme + 4 adım + alt bilgi */}
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
          <span style={{ width: 7, height: 7, borderRadius: RAD.dot, background: T, flexShrink: 0, animation: "nu-think 1.4s ease-in-out infinite" }} />
          <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink }}>Canlı işlem akışı</span>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>E-2026/1449 · kep_bildirim.eyp</span>
        </div>

        <div style={{ display: "flex", gap: 3, marginBottom: SP.l }}>
          {Array.from({ length: TOTAL_NODES }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < node ? T : PAL.press, transition: "background .25s ease-out" }} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: SP.s, marginBottom: SP.m }}>
          {STEPS.map((s, i) => {
            const st = adimDurumu(i, node, done);
            const sub = s.sub || (st === "done" ? "Taslak hazır" : "yazılıyor…");
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: SP.s }}>
                <AdimIkon st={st} />
                <span style={{ ...TYPE.data, fontWeight: 500, color: st === "pending" ? PAL.mut2 : PAL.ink2 }}>{s.label}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, whiteSpace: "nowrap" }}>{sub}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, paddingTop: SP.s, borderTop: `1px solid ${PAL.line}` }}>
          {done ? (
            <>
              <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3 }}>sha256: c37a5510_e2b8</span>
              <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), padding: "2px 8px", borderRadius: RAD.chip, ...TNUM }}>{BANT.yesil.l}</span>
            </>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>düğüm {String(node).padStart(2, "0")}/{TOTAL_NODES} · {NODES[node - 1]}</span>
          )}
        </div>
      </div>

      {/* Sağ — belge önizleme + mavi tarama ışını (CSS keyframes; bu döngüden bağımsız sürekli tarar) */}
      <div style={{ position: "relative", width: 76, height: 140, flexShrink: 0, borderRadius: RAD.ctl, border: `1px solid ${PAL.line}`, background: PAL.bg2, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, padding: "12px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {LINE_W.map((w, i) => (
            <span key={i} style={{ display: "block", height: 4, borderRadius: 2, width: `${w}%`, background: PAL.press, animation: `ke-belge-satir 2.4s ease-in-out ${(i * 2.4) / LINE_W.length}s infinite` }} />
          ))}
        </div>
        <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 26, background: TARAMA_GRADIENT, filter: "blur(1px)", animation: "ke-tarama-isini 2.4s linear infinite", willChange: "transform" }} />
      </div>
    </div>
  );
}
