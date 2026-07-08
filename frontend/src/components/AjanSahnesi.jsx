/* AjanSahnesi — AuthPage hero'sunun demo yıldızı: bir A4 evrağın 16 ajanlı boru hattından
   CANLI geçişi. Sol: taranan A4 belge (sweep beam + OCR satır pırıltısı + finalde "imzaya
   hazır" damgası). Sağ: 16 ajanın canlı durum rayı — her ajanın NE YAPTIĞI yazılı. Belgenin
   üzerinde: çıkarılan veri kabarcıkları (tür/birim/risk) düğüm ilerledikçe belirir.
   Gerçek veri DEĞİL — aria-hidden salt-sunum demo. Adım ilerleyişi kendi kendini zamanlayan
   setTimeout zinciriyle sürer (React state); beam + satır pırıltısı bağımsız CSS @keyframes.
   Hareket = bilgi. prefers-reduced-motion: zamanlayıcı hiç başlamaz, son (tamamlanmış) kare
   sabit gösterilir — global reduced-motion kuralı CSS animasyonlarını da söndürür. */
import { useEffect, useState } from "react";
import { MONO, T, PAL, DERIN, ALFA, BANT, TYPE, TNUM, RAD, SP, SH, Icon } from "./neonUi.jsx";

// 16 çekirdek node — her biri "ne yaptığını anlatan" kısa not ile (graph.py topolojisiyle hizalı).
const AJANLAR = [
  { id: "oku", ad: "Oku", not: "OCR + metin çıkarımı" },
  { id: "siniflandir", ad: "Sınıflandır", not: "Evrak türü" },
  { id: "cikar", ad: "Bilgi çıkar", not: "Kişi · tarih · sayı" },
  { id: "eksik_tespit", ad: "Eksik tespit", not: "Zorunlu alanlar" },
  { id: "decompose", ad: "Konu ayır", not: "Çok konulu ayrıştır" },
  { id: "mevzuat_oner", ad: "Mevzuat öner", not: "İlgili maddeler" },
  { id: "ozetle", ad: "Özetle", not: "Yönetici özeti" },
  { id: "route_birim", ad: "Birim yönlendir", not: "Sorumlu birim" },
  { id: "yazi_taslak", ad: "Yazı taslağı", not: "Resmî üslup" },
  { id: "verify", ad: "Doğrula", not: "İddia · kanıt" },
  { id: "risk_guard", ad: "Risk bandı", not: "Yayın güvenliği" },
  { id: "kanit_baglama", ad: "Kanıt bağla", not: "Kaynak izleme" },
  { id: "sdp_kod", ad: "SDP kodu", not: "Saklama planı" },
  { id: "denetim_izi", ad: "Denetim izi", not: "SHA-256 zinciri" },
  { id: "clarifier", ad: "Netleştir", not: "Eksik bilgi iste" },
  { id: "finalize", ad: "Tamamla", not: "İmzaya hazır" },
];
const N = AJANLAR.length;
const A4_W = 280, A4_H = 396;
const TICK = 520, PAUSE = 2000;
// A4 gövde satır genişlikleri (%). 0 = paragraf boşluğu.
const SATIRLAR = [90, 74, 0, 84, 96, 68, 88, 0, 92, 60, 82, 70];
// Belge üzerinde beliren çıkarım kabarcıkları — hangi düğümden SONRA görünür + konum (A4 içi, px).
const KABARCIKLAR = [
  { sonra: 2, etiket: "Tür", deger: "KEP bildirimi", yer: { top: 26, left: A4_W - 104 } },
  { sonra: 7, etiket: "Birim", deger: "Yazı İşleri Md.", yer: { top: 176, left: A4_W - 76 } },
  { sonra: 11, etiket: "Risk", deger: "YEŞİL", bant: true, yer: { top: 306, left: A4_W - 92 } },
];

const KEYFRAMES = `
@keyframes as-tarama{0%{transform:translateY(-44px)}100%{transform:translateY(${A4_H + 8}px)}}
@keyframes as-oku{0%,72%,100%{background:var(--ke-press)}16%{background:color-mix(in srgb, ${T} 44%, var(--ke-press))}}
`;
const ISIN_ZEMIN = `linear-gradient(180deg, transparent, color-mix(in srgb, ${T} 20%, transparent) 62%, color-mix(in srgb, ${T} 55%, transparent))`;

function useAzHareket() {
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

// A4 belge — üst şerit + başlık + gövde (OCR pırıltısı) + tarama ışını + finalde imza damgası.
function Belge({ tamam }) {
  return (
    <div style={{ position: "relative", flex: `0 0 ${A4_W}px`, height: A4_H, background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, boxShadow: SH.card, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut3 }}>T.C. · EVRAK</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: PAL.mut3 }}>E-2026/1449</span>
        </div>
        <span style={{ display: "block", height: 7, width: "56%", margin: "0 auto 7px", borderRadius: 2, background: PAL.lineHi }} />
        <span style={{ display: "block", height: 7, width: "34%", margin: "0 auto 18px", borderRadius: 2, background: PAL.line }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SATIRLAR.map((w, i) => w === 0
            ? <span key={i} aria-hidden="true" style={{ height: 7 }} />
            : <span key={i} aria-hidden="true" style={{ height: 7, width: `${w}%`, borderRadius: 2, background: PAL.press, animation: `as-oku 3s ease-in-out ${(i * 3 / SATIRLAR.length).toFixed(2)}s infinite` }} />)}
        </div>
      </div>
      {tamam && (
        <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: RAD.chip, background: ALFA(T), border: `1px solid ${DERIN.T}`, animation: "nu-pop .34s ease-out both" }}>
          <span style={{ display: "flex", color: DERIN.T }}><Icon.check width={12} height={12} /></span>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, color: DERIN.T }}>İMZAYA HAZIR</span>
        </div>
      )}
      <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 44, background: ISIN_ZEMIN, animation: "as-tarama 2.6s linear infinite", willChange: "transform" }} />
    </div>
  );
}

// Tek ajan durumu — pending (boş halka) · active (spinner) · done (dolu tik).
function Durum({ durum }) {
  if (durum === "active") {
    return (
      <span aria-hidden="true" style={{ position: "relative", width: 13, height: 13, flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 20 20" style={{ animation: "nu-spin 1s linear infinite" }}>
          <circle cx="10" cy="10" r="8" stroke={PAL.line} strokeWidth="3" fill="none" />
          <path d="M10 2 A8 8 0 0 1 18 10" stroke={T} strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (durum === "done") {
    return (
      <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, background: DERIN.T, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "nu-pop .3s ease-out both" }}>
        <Icon.check width={8} height={8} />
      </span>
    );
  }
  return <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: RAD.dot, border: `1.5px solid ${PAL.lineHi}`, flexShrink: 0 }} />;
}

function AjanSatiri({ a, durum }) {
  const aktif = durum === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.s, height: 22, padding: "0 8px", borderRadius: RAD.chip, background: aktif ? ALFA(T) : "transparent", boxShadow: aktif ? `inset 2px 0 0 ${DERIN.T}` : "none", transition: "background .2s ease-out" }}>
      <Durum durum={durum} />
      <span style={{ ...TYPE.meta, fontWeight: aktif ? 600 : 500, color: durum === "pending" ? PAL.mut3 : PAL.ink2, whiteSpace: "nowrap" }}>{a.ad}</span>
      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: PAL.mut3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.not}</span>
    </div>
  );
}

// 16-segment ilerleme + başlık.
function Ilerleme({ node }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: T, flexShrink: 0, animation: "nu-think 1.4s ease-in-out infinite" }} />
        <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink }}>Canlı ajan hattı</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>{String(Math.min(node, N)).padStart(2, "0")}/{N}</span>
      </div>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: N }, (_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < node ? T : PAL.press, transition: "background .25s ease-out" }} />)}
      </div>
    </div>
  );
}

// Sağ ray — 16 ajanın canlı durumu (i < node-1 → done · i === node-1 → active · sonrası pending).
function Ray({ node, tamam }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <Ilerleme node={node} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: SP.m }}>
        {AJANLAR.map((a, i) => {
          const durum = tamam || i < node - 1 ? "done" : i === node - 1 ? "active" : "pending";
          return <AjanSatiri key={a.id} a={a} durum={durum} />;
        })}
      </div>
    </div>
  );
}

function Kabarcik({ k }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: k.yer.top, left: k.yer.left, zIndex: 5, display: "flex", flexDirection: "column", gap: 2, padding: "7px 11px", background: PAL.surf, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.ctl, boxShadow: SH.pop, animation: "nu-pop .34s ease-out both" }}>
      <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{k.etiket}</span>
      {k.bant
        ? <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: DERIN.yesil, ...TNUM }}>{k.deger}</span>
        : <span style={{ ...TYPE.data, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap" }}>{k.deger}</span>}
    </div>
  );
}

export default function AjanSahnesi() {
  const az = useAzHareket();
  const [node, setNode] = useState(az ? N : 1);
  const [tamam, setTamam] = useState(az);

  useEffect(() => {
    if (az) { setNode(N); setTamam(true); return undefined; }
    let alive = true, n = 1, timer;
    setNode(1); setTamam(false);
    const adim = () => {
      if (!alive) return;
      if (n < N) { n += 1; setNode(n); timer = setTimeout(adim, TICK); }
      else {
        setTamam(true);
        timer = setTimeout(() => {
          if (!alive) return;
          n = 1; setNode(1); setTamam(false); timer = setTimeout(adim, TICK);
        }, PAUSE);
      }
    };
    timer = setTimeout(adim, TICK);
    return () => { alive = false; clearTimeout(timer); };
  }, [az]);

  return (
    <div aria-hidden="true" style={{ width: "100%", maxWidth: 720, margin: "0 auto", marginBottom: SP.xl, textAlign: "left", animation: "nu-rise .2s ease-out both" }}>
      <style>{KEYFRAMES}</style>
      <div style={{ position: "relative", display: "flex", gap: SP.l, alignItems: "stretch" }}>
        <Belge tamam={tamam} />
        <Ray node={node} tamam={tamam} />
        {KABARCIKLAR.map((k, i) => (tamam || node > k.sonra) && <Kabarcik key={i} k={k} />)}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, marginTop: SP.m, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>
          {tamam ? "sha256: c37a5510_e2b8" : `düğüm ${String(node).padStart(2, "0")}/${N} · ${AJANLAR[Math.min(node, N) - 1].id}`}
        </span>
        {tamam
          ? <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), padding: "2px 8px", borderRadius: RAD.chip, ...TNUM }}>{BANT.yesil.l}</span>
          : <span style={{ ...TYPE.meta, color: PAL.mut2 }}>işleniyor…</span>}
      </div>
    </div>
  );
}
