/* CanliAjanAkisi.jsx — kamu-evrak "neon komuta merkezi" canlı ajan akışı görünümü.
   aktarim/ tasarımından ADAPT: görsel BİREBİR korundu; tüm paneller artık GERÇEK backend
   verisiyle beslenir (driven mod). Saf React + satır-içi stil; sadece nodeMeta/result-cards
   yardımcılarını içe alır (uygulamanın parçası).

   İKİ MOD:
   1) Demo/önizleme (started=false): 12 adımı kendi içinde canlandırır (jüri "ekran koruyucu").
   2) Gerçek (started=true + nodes/result): SSE node dizisi + ProcessResponse sahnelenir —
      ajan çıktıları summarize() ile, çıkarılan veri kanit_metadata.spanlar ile, kaynak metin
      maskeli + sarı vurgulu, taslak yazi_taslak_md, risk bandı risk_metadata.bant, HITL onay.

   Fontlar: Space Grotesk + IBM Plex Mono (index.html). */
import { useState, useEffect, useRef, useMemo } from "react";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "./result-cards.jsx";
import NeonDetay from "./NeonDetay.jsx";

// Demo (önizleme) ajan listesi — 12 adım, görsel hayatta tutar. Gerçek modda nodes kullanılır.
const AGENTS = [
  { id: "oku",          label: "Oku (OCR)",       gorev: 1, out: "OCR tamamlandı · 1 sayfa · %98.7 · TCKN/telefon maskelendi", tag: "%98.7" },
  { id: "siniflandir",  label: "Sınıflandır",     gorev: 1, out: "Evrak türü: Dilekçe · güven %91 (held-out macro-F1)",         tag: "%91" },
  { id: "cikar",        label: "Bilgi Çıkar",     gorev: 1, out: "8 bilgi unsuru çıkarıldı · PII otomatik maskelendi",          tag: "8 alan" },
  { id: "eksik_tespit", label: "Eksik Tespit",    gorev: 1, out: "Zorunlu alanlar tam — 3071 s. Kanun m.4 ✓",              tag: "tam ✓" },
  { id: "decompose",    label: "Çok-Konulu Ayır", gorev: 1, out: "Tek konu · alt-talebe ayrıştırma gerekmedi",                  tag: "tek konu" },
  { id: "mevzuat_oner", label: "Mevzuat Öner",    gorev: 1, out: "İlgili: 3071 s. Dilekçe Hakkı Kanunu m.4   ∥ paralel",   tag: "3071" },
  { id: "ozetle",       label: "Özetle",          gorev: 1, out: "Öz özet üretildi · 3 cümle   ∥ paralel",                 tag: "özet" },
  { id: "route_birim",  label: "Birim Yönlendir", gorev: 2, out: "Havale: İlgili Teknik / Ana Hizmet Dairesi",                  tag: "havale" },
  { id: "yazi_taslak",  label: "Yazı Taslağı",    gorev: 2, out: "Cevabi yazı üretildi · Yön. 2646 formatı",                    tag: "2646" },
  { id: "verify",       label: "Doğrula",         gorev: 2, out: "Uydurma-veto ✓ · format uyumlu ✓",                  tag: "veto ✓" },
  { id: "risk_guard",   label: "Risk Bandı",      gorev: 2, out: "",                                                            tag: "risk" },
  { id: "finalize",     label: "Bilgilendir",     gorev: 2, out: "Bilgilendirme + denetim izi (SDP 2005/7) yazıldı",           tag: "denetim" },
];

const RISK = {
  yesil:   { c: "#34d399", label: "YEŞİL",   out: "Risk bandı: YEŞİL · yayın-hazır, otomatik akış" },
  sari:    { c: "#fbbf24", label: "SARI",    out: "Risk bandı: SARI · memur incelemesi gerekli" },
  kirmizi: { c: "#f87171", label: "KIRMIZI", out: "Risk bandı: KIRMIZI · uydurma şüphesi, üst onay" },
};

// Demo çıkarılan veri (önizleme). [etiket, değer, görünür-eşik, renk]
const DEMO_FIELDS = [
  ["Evrak türü",   "Dilekçe · %91",        2, "#dfe5f2"],
  ["Konu",         "Park aydınlatma onarımı", 2, "#2ee6c9"],
  ["Gönderen",     "Ayşe Yılmaz",          3, "#dfe5f2"],
  ["T.C. Kimlik",  "123••••••01", 3, "#dfe5f2"],
  ["Telefon",      "0555 ••• •• 67", 3, "#dfe5f2"],
  ["Tarih",        "12.03.2026",           3, "#dfe5f2"],
  ["Eksik alan",   "Yok · tam ✓",     4, "#34d399"],
  ["Mevzuat",      "3071 s. m.4",          6, "#2ee6c9"],
  ["Hedef birim",  "İlgili Teknik Daire",  8, "#b794ff"],
  ["Risk bandı",   null,                   11, null],
];

const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const SANS = "'Space Grotesk',system-ui,sans-serif";
const T = "#2ee6c9", V = "#b794ff";
const ta = (a) => `rgba(46,230,201,${a})`;
const va = (a) => `rgba(183,148,255,${a})`;

// Klavye odak halkası — inline-style sisteminde :focus-visible yazılamaz; onFocus/onBlur ile.
const focusRing = {
  onFocus: (e) => { e.currentTarget.style.boxShadow = "0 0 0 2px #121829, 0 0 0 4px #2ee6c9"; },
  onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; },
};
const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

const KEYFRAMES = `
@keyframes cak-blink{50%{opacity:0}}
@keyframes cak-dotpulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
@keyframes cak-spin{to{transform:rotate(360deg)}}
@keyframes cak-scanv{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
@keyframes cak-thinking{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes cak-risein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes cak-ringpulse{0%{transform:translate(-50%,-50%) scale(.7);opacity:.6}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
`;

// Gerçek modda her ajan için kısa rozet (node.data'dan).
function nodeTag(n, risk) {
  const d = n.data || {};
  const pc = (x) => `%${Math.round((Number(x) || 0) * 100)}`;
  switch (n.id) {
    case "oku": return d.ocr_confidence != null ? pc(d.ocr_confidence) : "OCR";
    case "siniflandir": return d.tur_confidence != null ? pc(d.tur_confidence) : "tür";
    case "cikar": { const k = d.bilgi_unsurlari ? Object.keys(d.bilgi_unsurlari).length : 0; return k ? `${k} alan` : "çıkar"; }
    case "kanit_baglama": { const s = d.kanit_metadata?.spanlar?.length || 0; return s ? `${s} kanıt` : "kanıt"; }
    case "eksik_tespit": return (d.eksik_alanlar?.length) ? `${d.eksik_alanlar.length} eksik` : "tam ✓";
    case "decompose": { const a = d.alt_talepler?.length || 0; return a >= 2 ? `${a} talep` : "tek konu"; }
    case "mevzuat_oner": { const m = d.mevzuat_onerileri?.length || 0; return m ? `${m} mevzuat` : "mevzuat"; }
    case "ozetle": return "özet";
    case "route_birim": return "havale";
    case "yazi_taslak": return d.yazi_turu ? "2646" : "taslak";
    case "verify": return (d.verify_uyari?.length) ? "uyarı" : "veto ✓";
    case "risk_guard": return risk.label;
    case "arsiv": return "SDP";
    case "sla_triyaj": return "süre";
    case "denetim_izi": return "SHA-256";
    case "finalize": return "denetim";
    default: return "";
  }
}

// Gerçek çıkarılan-veri listesi (kanit_metadata.spanlar = etiketli + maskeli unsurlar).
function buildDrivenFields(result, risk) {
  const r = result || {};
  const conf = r.tur_confidence != null ? ` · %${Math.round(r.tur_confidence * 100)}` : "";
  const seen = new Set();
  const spanRows = [];
  for (const sp of (r.kanit_metadata?.spanlar || [])) {
    if (!sp?.label || !sp?.deger || seen.has(sp.label)) continue;
    seen.add(sp.label);
    spanRows.push([sp.label, cleanDemoText(sp.deger), "#dfe5f2"]);
  }
  const eksik = (r.eksik_alanlar || []).length;
  const mev = r.mevzuat_onerileri?.[0]?.baslik;
  return [
    ["Evrak türü", `${EVRAK_TR(r.evrak_turu)}${conf}`, "#dfe5f2"],
    ...spanRows,
    ["Eksik alan", eksik ? `${eksik} eksik` : "Yok · tam ✓", eksik ? "#fbbf24" : "#34d399"],
    mev ? ["Mevzuat", cleanDemoText(mev), "#2ee6c9"] : null,
    r.hedef_birim ? ["Hedef birim", BIRIM_LBL(r.hedef_birim), "#b794ff"] : null,
    ["Risk bandı", risk.label, risk.c],
  ].filter(Boolean);
}

// Maskeli kaynak metni span'lara göre düz/vurgulu segmentlere böl (XSS-güvenli React <mark>).
function buildSegments(metin, spanlar) {
  const segs = [];
  let cur = 0;
  for (const sp of [...spanlar].sort((a, b) => (a.start | 0) - (b.start | 0))) {
    const s = Math.max(cur, Math.min(metin.length, sp.start | 0));
    const e = Math.max(s, Math.min(metin.length, sp.end | 0));
    if (s > cur) segs.push({ t: metin.slice(cur, s) });
    if (e > s) segs.push({ t: metin.slice(s, e), mark: true });
    cur = e;
  }
  if (cur < metin.length) segs.push({ t: metin.slice(cur) });
  return segs;
}

export default function CanliAjanAkisi({
  nodes = null,
  result = null,
  busy = false,
  started = false,
  riskOutcome = "yesil",
  fileName = "cankaya_dilekce_2026.pdf",
  fileMeta = null,
  samples = [],
  onUpload = () => {},
  onPickSample = () => {},
  onApprove = () => {},
  onEdit = () => {},
  onReject = () => {},
  pendingOnay = null,
  onDownload = () => {},
  downloading = "",
  canDownload = false,
  speed = 820,
  autoLoop = true,
  glow = true,
}) {
  const driven = started && Array.isArray(nodes) && nodes.length > 0;
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(true);
  const [showSamples, setShowSamples] = useState(false);
  const timer = useRef(null);
  const traceRef = useRef(null);

  // Demo zamanlayıcısı (yalnız önizleme modunda).
  useEffect(() => {
    if (driven || !running) return () => clearTimeout(timer.current);
    const delay = stage >= 12 ? speed * 2.8 : speed;
    timer.current = setTimeout(() => {
      setStage((s) => { let n = s + 1; if (n > 12) n = autoLoop ? 0 : 12; return n; });
    }, delay);
    return () => clearTimeout(timer.current);
  }, [stage, running, speed, autoLoop, driven]);

  // İdle'a (started=false) dönülürse demo'yu baştan başlat (stage birikmesini önle).
  useEffect(() => { if (!started) setStage(0); }, [started]);

  const risk = RISK[riskOutcome] || RISK.yesil;

  // Sahnelenecek ajan listesi: gerçek (nodes) veya demo (AGENTS).
  const display = driven
    ? nodes.map((n) => ({
        id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
        out: summarize(n.id, n.data), tag: nodeTag(n, risk),
      }))
    : AGENTS.map((a, i) => ({
        id: a.id, label: a.label, gorev: a.gorev,
        status: stage === i + 1 ? "active" : stage >= i + 1 ? "done" : "pending",
        out: a.id === "risk_guard" ? risk.out : a.out,
        tag: a.id === "risk_guard" ? risk.label : a.tag,
      }));

  const total = display.length;
  const doneCount = driven ? display.filter((a) => a.status === "done").length : stage;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = driven ? (!busy && doneCount >= total) : doneCount >= 12;

  // auto-scroll trace
  useEffect(() => {
    if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight * (doneCount / (total + 1));
  }, [doneCount, total]);

  // çıkarılan veri + kaynak + taslak (gerçek veya demo)
  const drivenFields = useMemo(() => (driven && result ? buildDrivenFields(result, risk) : null), [driven, result, risk]);
  const km = driven ? result?.kanit_metadata : null;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const draftMd = driven ? result?.yazi_taslak_md : null;
  const draftReady = driven ? !!draftMd : doneCount >= 9;
  const lit = driven ? (display.find((a) => a.id === "risk_guard")?.status === "done") : doneCount >= 11;
  // HITL onay butonları: gerçek onay-bekliyor VEYA sonuç hazır (memur kararı). Demo'da bitince.
  const decisionReady = driven ? (!busy && (!!pendingOnay || !!result)) : doneCount >= 12;

  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileName) : (fileMeta?.name || fileName);
  const metaLine = buildMetaLine(driven, result, fileMeta);
  const statusText = !started
    ? "demo önizleme"
    : busy
      ? "işleniyor · " + String(doneCount).padStart(2, "0") + "/" + total
      : doneCount >= total && total ? "tamamlandı" : "sırada";

  const toggle = () => !driven && setRunning((r) => !r);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#121829", color: "#e6ebf5", fontFamily: SANS }}>
      <style>{KEYFRAMES}</style>
      {/* Ekran-okuyucu: canlı pipeline ilerleme duyurusu */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {started ? (() => {
          const act = display.find((a) => a.status === "active");
          if (act) return `${act.label} çalışıyor — adım ${display.indexOf(act) + 1} / ${total}`;
          if (allDone) return `İşleme tamamlandı — ${total} ajan başarıyla yürütüldü.`;
          return "";
        })() : ""}
      </div>

      {/* ===== Sol menü ===== */}
      <aside style={{ width: 228, flexShrink: 0, background: "#0f1626", borderRight: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", padding: "18px 14px", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 6px 18px" }}>
          <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,#5b8cff,#3a63d6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px -6px rgba(91,140,255,.7)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5" stroke="#fff" strokeWidth="1.7" /><path d="M8.5 13.5 L11 16 L16 9.5" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: MONO, fontSize: 15, fontWeight: 600, letterSpacing: "-.3px", color: "#eaf0fb" }}>kamu-evrak</h1>
            <div style={{ fontSize: 10, letterSpacing: ".5px", color: "#8b97b0" }}>TEKNOFEST 2026 · S1</div>
          </div>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: "#7d89a4", padding: "0 8px 8px" }}>ÇALIŞMA ALANI</div>
        <nav aria-label="Çalışma alanı bölümleri" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <NavItem label="Panel" icon={<IconGrid />} />
          <NavItem label="Gelen Evrak" icon={<IconInbox />} badge="14" />
          <NavItem label="İşleniyor" active icon={<IconSpin />} />
          <NavItem label="Taslaklar" icon={<IconDoc />} />
          <NavItem label="Mevzuat" icon={<IconBook />} />
          <NavItem label="Denetim İzi" icon={<IconShieldCheck />} />
        </nav>

        <button onClick={onUpload} {...focusRing} style={{ cursor: "pointer", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 11, border: "1px dashed rgba(91,140,255,.4)", background: "rgba(91,140,255,.08)", color: "#aec6ff", fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5 V19 M5 12 H19" stroke="#aec6ff" strokeWidth="1.9" strokeLinecap="round" /></svg>
          Yeni evrak yükle
        </button>

        {/* Örnek evrak hızlı başlat (demo / jüri) */}
        {samples.length > 0 && (
          <div style={{ position: "relative", marginTop: 8 }} onKeyDown={(e) => { if (e.key === "Escape") setShowSamples(false); }}>
            <button onClick={() => setShowSamples((v) => !v)} aria-expanded={showSamples} aria-haspopup="listbox" aria-controls="cak-sample-listbox" {...focusRing} style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: 9, borderRadius: 10, border: "1px solid rgba(46,230,201,.28)", background: "rgba(46,230,201,.07)", color: "#9fe6d8", fontFamily: MONO, fontSize: 11.5 }}>
              Örnek evrakla dene {showSamples ? "▴" : "▾"}
            </button>
            {showSamples && (
              <div id="cak-sample-listbox" role="listbox" aria-label="Örnek evraklar" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 280, overflowY: "auto", background: "#141c30", border: "1px solid rgba(255,255,255,.1)", borderRadius: 11, padding: 6, boxShadow: "0 18px 50px -10px rgba(0,0,0,.7)", zIndex: 30 }}>
                {samples.map((s) => (
                  <button key={s.id} role="option" aria-selected="false" onClick={() => { setShowSamples(false); onPickSample(s); }} {...focusRing} style={{ cursor: "pointer", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "#cdd6e8", fontFamily: SANS, fontSize: 12.5, display: "block" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(46,230,201,.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {s.label}<div style={{ fontSize: 10.5, color: "#8b97b0", marginTop: 1 }}>{s.aciklama}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 11, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#b794ff,#7c5ce0)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#1a1230" }}>MY</div>
          <div style={{ lineHeight: 1.3 }}><div style={{ fontSize: 12.5, color: "#dfe5f2" }}>M. Yılmaz</div><div style={{ fontSize: 10.5, color: "#8b97b0" }}>Yetkili memur</div></div>
        </div>
      </aside>

      {/* ===== Ana sütun ===== */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Üst durum çubuğu */}
        <header style={{ flexShrink: 0, padding: "15px 24px", borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(15,22,38,.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(91,140,255,.12)", border: "1px solid rgba(91,140,255,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="#aec6ff" strokeWidth="1.6" /><path d="M9 12 L11 14 L15 9.5" stroke="#aec6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 14, color: "#eaf0fb", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{fileLabel}</h2>
                <div style={{ fontSize: 11.5, color: "#7d89a4" }}>{metaLine}</div>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 20, background: allDone ? "rgba(52,211,153,.1)" : "rgba(46,230,201,.1)", border: "1px solid " + (allDone ? "rgba(52,211,153,.3)" : "rgba(46,230,201,.26)"), marginLeft: 6, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: allDone ? "#34d399" : T, animation: busy || !started ? "cak-dotpulse 1.4s ease-in-out infinite" : "none" }} />
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#cfe9e2" }}>{statusText}</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10.5, color: "#7d89a4" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: T }} />Görev 1 · Anla
                <span style={{ width: 8, height: 8, borderRadius: 2, background: V, marginLeft: 5 }} />Görev 2 · Üret
              </div>
              {!driven && (
                <button onClick={toggle} aria-label={running ? "Demo önizlemeyi duraklat" : "Demo önizlemeye devam et"} {...focusRing} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(46,230,201,.4)", background: "rgba(46,230,201,.12)", color: "#cfe9e2", fontFamily: MONO, fontSize: 12, fontWeight: 500 }}>{running ? "❚❚ Duraklat" : "▶ Devam"}</button>
              )}
              <button onClick={onUpload} aria-label="Yeni evrak yükle" {...focusRing} style={{ cursor: "pointer", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: "#9aa6c0", fontFamily: MONO, fontSize: 12 }} title="Yeni evrak">↻</button>
            </div>
          </div>
          {/* İlerleme şeridi */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 13 }}>
            {display.map((a, i) => {
              const col = a.gorev === 1 ? T : V;
              const st = a.status;
              return <div key={a.id} style={{ flex: 1, height: 5, borderRadius: 3, background: st === "done" || st === "active" ? col : "rgba(255,255,255,.2)", boxShadow: st === "active" && glow ? `0 0 10px ${col}` : "none", transform: st === "active" ? "scaleY(1.6)" : "none", transition: "all .4s" }} />;
            })}
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#7d89a4", marginLeft: 8, flexShrink: 0 }}>{pct}%</span>
          </div>
        </header>

        {/* 3 panel — komuta merkezi (ilk ekran; sayfa aşağı kaydıkça detay açılır) */}
        <section style={{ minHeight: "calc(100vh - 132px)" }}>
          <div style={{ minHeight: "100%", minWidth: 1060, display: "grid", gridTemplateColumns: "290px minmax(380px,1fr) 360px" }}>
            {/* — Kaynak belge — */}
            <div style={{ borderRight: "1px solid rgba(255,255,255,.07)", padding: 18, display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: "#7d89a4", marginBottom: 12 }}>KAYNAK BELGE</div>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#eef0f6", boxShadow: "0 12px 34px -12px rgba(0,0,0,.6)", minHeight: 300, aspectRatio: segs ? "auto" : "1 / 1.34" }}>
                {busy && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "linear-gradient(90deg,transparent,#2ee6c9,transparent)", boxShadow: "0 0 12px #2ee6c9", animation: "cak-scanv 2.8s ease-in-out infinite", zIndex: 3 }} />}
                {segs ? (
                  <pre style={{ margin: 0, padding: "18px 16px", fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: "#2a3346", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {segs.map((sg, i) => sg.mark
                      ? <mark key={i} style={{ background: "#fde68a", color: "#92400e", borderRadius: 3, padding: "0 2px" }}>{sg.t}</mark>
                      : <span key={i}>{sg.t}</span>)}
                  </pre>
                ) : (
                  <div style={{ padding: "20px 18px", fontFamily: MONO }}>
                    <Bar w="55%" mb={6} /><Bar w="40%" mb={18} />
                    <span style={{ display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fde68a", color: "#92400e", marginBottom: 12 }}>TCKN 123••••••01 · maskeli</span>
                    <Bar2 w="100%" /><Bar2 w="96%" /><Bar2 w="88%" /><Bar2 w="100%" />
                    <span style={{ display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#bbf7d0", color: "#166534", margin: "6px 0 12px" }}>Tel 0555 ••• •• 67 · maskeli</span>
                    <Bar2 w="92%" /><Bar2 w="70%" mb={0} />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 11, background: "rgba(46,230,201,.07)", border: "1px solid rgba(46,230,201,.2)", fontSize: 11.5, color: "#a7d8cd", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="6" cy="12" r="2.2" fill="#2ee6c9" /><circle cx="12" cy="12" r="2.2" fill="#2ee6c9" /><circle cx="18" cy="12" r="2.2" fill="#2ee6c9" /></svg>
                Kişisel veriler (TCKN, telefon) maskelenerek işleniyor — KVKK uyumlu.
              </div>
            </div>

            {/* — Ajan izi — */}
            <div ref={traceRef} style={{ padding: "18px 22px" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: "#7d89a4", marginBottom: 14 }}>AJAN İZİ · {total} ADIM</div>
              {display.map((a, i) => {
                const isAnla = a.gorev === 1, col = isAnla ? T : V, colA = isAnla ? ta : va;
                const st = a.status;
                const done = st === "done", active = st === "active";
                const prevGorev = i > 0 ? display[i - 1].gorev : null;
                const group = i === 0 ? "GÖREV 1 · ANLA" : (a.gorev === 2 && prevGorev === 1 ? "GÖREV 2 · ÜRET" : "");
                return (
                  <div key={a.id}>
                    {group && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "2px", color: i === 0 ? "#3f8f7f" : "#7a5fb0", margin: (i === 0 ? "0" : "18px") + " 0 8px", paddingLeft: 2 }}>{group}</div>}
                    <div style={{ display: "flex", gap: 13, padding: "10px 12px", borderRadius: 12, marginBottom: 4, background: active ? colA(0.1) : "transparent", border: "1px solid " + (active ? colA(0.3) : "transparent"), boxShadow: active && glow ? `0 8px 26px -10px ${colA(0.5)}` : "none", opacity: st === "pending" ? 0.45 : 1, transition: "all .4s cubic-bezier(.2,.8,.2,1)" }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {active && glow && <div style={{ position: "absolute", left: "50%", top: "50%", width: 30, height: 30, borderRadius: 9, border: "1px solid " + col, transform: "translate(-50%,-50%)", animation: "cak-ringpulse 1.5s ease-out infinite", pointerEvents: "none" }} />}
                        <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: (done || active) ? "#06121a" : col, background: (done || active) ? col : colA(0.14), transition: "all .4s" }}>{done ? "✓" : st === "error" ? "✕" : String(i + 1).padStart(2, "0")}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", color: active ? "#eaf6ff" : done ? "#dfe5f2" : "#7d89a4", transition: "color .4s" }}>{a.label}</span>
                          {a.tag && <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 7px", borderRadius: 7, color: a.id === "risk_guard" ? risk.c : col, background: a.id === "risk_guard" ? risk.c + "22" : colA(0.12), opacity: (done || active) ? 1 : 0.5 }}>{a.tag}</span>}
                          {active && !driven && <button onClick={toggle} aria-label="Demo önizlemeyi duraklat" {...focusRing} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "#cfe9e2", cursor: "pointer", opacity: 0.85, background: "none", border: "none", padding: "2px 4px" }}>{"❚❚ duraklat"}</button>}
                        </div>
                        <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: done ? (a.id === "risk_guard" ? risk.c : "#93a0bb") : "#7d89a4", animation: active ? "cak-thinking 1.2s ease-in-out infinite" : "none" }}>{done ? (a.out || "tamamlandı ✓") : active ? "çalışıyor…" : "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* — Sağ panel — */}
            <div style={{ borderLeft: "1px solid rgba(255,255,255,.07)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Çıkarılan veri */}
              <div style={{ borderRadius: 14, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: "#8b97b0" }}>ÇIKARILAN VERİ</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#34d399", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399" }} />maskeli</span>
                </div>
                {(driven ? (drivenFields || DEMO_FIELDS.map((d) => [d[0], "•••", "#7d89a4"])) : DEMO_FIELDS).map((d, k) => {
                  // demo: [etiket, değer|null(risk), eşik, renk] · driven: [etiket, değer, renk]
                  const vis = driven ? true : doneCount >= d[2];
                  const value = d[1] === null ? risk.label : d[1];
                  const color = d[1] === null ? risk.c : (driven ? d[2] : d[3]);
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed rgba(255,255,255,0.07)", opacity: vis ? 1 : 0.3, filter: vis ? "none" : "blur(2px)", transition: "all .5s" }}>
                      <span style={{ fontSize: 11.5, color: "#8b97b0", fontFamily: MONO }}>{d[0]}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color, fontWeight: 500, textAlign: "right" }}>{vis ? value : "•••"}</span>
                    </div>
                  );
                })}
              </div>

              {/* Risk bandı (trafik ışığı) */}
              <div style={{ borderRadius: 14, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: "#8b97b0", marginBottom: 9 }}>RİSK BANDI</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 11, background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.08)" }}>
                    {[["#34d399", "yesil"], ["#fbbf24", "sari"], ["#f87171", "kirmizi"]].map(([c, key]) => {
                      const on = lit && riskOutcome === key;
                      return <span key={key} style={{ width: 14, height: 14, borderRadius: "50%", background: on ? c : "rgba(255,255,255,0.07)", boxShadow: on ? `0 0 14px 2px ${c}` : "none", border: "1px solid " + (on ? c : "rgba(255,255,255,0.12)"), transition: "all .5s" }} />;
                    })}
                  </div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, color: lit ? risk.c : "#8b97b0", background: lit ? risk.c + "1f" : "rgba(255,255,255,.04)", border: "1px solid " + (lit ? risk.c + "66" : "rgba(255,255,255,.1)"), transition: "all .5s" }}>{lit ? risk.label : "—"}</div>
              </div>

              {/* Resmî yazı taslağı + HITL */}
              <div style={{ borderRadius: 14, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)", padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: "#8b97b0", marginBottom: 10 }}>RESMÎ YAZI TASLAĞI</div>
                {draftReady ? (
                  driven && draftMd ? (
                    <pre style={{ background: "#f4f5f9", borderRadius: 9, padding: "15px 16px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", flex: 1, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, animation: "cak-risein .5s ease both", lineHeight: 1.6 }}>{cleanDemoText(draftMd)}</pre>
                  ) : (
                    <div style={{ background: "#f4f5f9", borderRadius: 9, padding: "15px 16px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", flex: 1, overflowY: "auto", animation: "cak-risein .5s ease both" }}>
                      <div style={{ textAlign: "center", fontWeight: 600, color: "#3a4252", fontSize: 11, lineHeight: 1.5 }}>T.C.<br />ÇANKAYA BELEDİYE BAŞKANLIĞI<br /><span style={{ fontWeight: 500, color: "#5b6478" }}>İlgili Teknik / Ana Hizmet Dairesi</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: "#5b6478" }}><span>Sayı : E-…-…-2026/…</span><span>12.03.2026</span></div>
                      <div style={{ color: "#5b6478", marginTop: 2 }}>Konu : Park aydınlatma onarımı hk.</div>
                      <div style={{ height: 1, background: "#d6d9e3", margin: "10px 0" }} />
                      <div style={{ color: "#3a4252", lineHeight: 1.7 }}>İlgi : Ayşe Yılmaz tarafından verilen 12.03.2026 tarihli dilekçe.<br /><br />İlgi dilekçe ile Kızılay Mahallesi çocuk parkındaki arızalı aydınlatma direklerinin onarımı talep edilmiştir. Söz konusu talep ilgili teknik birimimizce değerlendirmeye alınmış olup, <strong style={{ color: "#1f2740" }}>3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.4</strong> uyarınca sonucundan tarafınıza bilgi verilecektir.<br /><br />Gereğini bilgilerinize rica ederim.</div>
                      <div style={{ textAlign: "right", marginTop: 10, fontSize: 9.5, color: "#8a93a6" }}>Yön. 2646 formatı · e-imza · memur onayı bekliyor</div>
                    </div>
                  )
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, justifyContent: "center", fontSize: 12, color: "#8b97b0", border: "1px dashed rgba(255,255,255,.1)", borderRadius: 9 }}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#7d89a4", animation: "cak-thinking 1.2s ease-in-out infinite" }} />
                    Taslak, "Yazı Taslağı" adımında üretilecek…
                  </div>
                )}
                <div id="cak-hitl-desc" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 11, fontSize: 10.5, color: "#7d89a4" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: V, flexShrink: 0 }} aria-hidden="true" />
                  Yapay zekâ <strong style={{ color: "#cdd6e8", fontWeight: 600 }}>öneriyor</strong> — yetkili memur <strong style={{ color: "#cdd6e8", fontWeight: 600 }}>karar verir</strong> (HITL)
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                  <button onClick={onApprove} disabled={!decisionReady} aria-label="Taslağı onayla ve gönder" aria-describedby="cak-hitl-desc" {...focusRing} style={{ flex: 1, cursor: decisionReady ? "pointer" : "not-allowed", padding: 10, borderRadius: 10, border: "none", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: decisionReady ? "#1a1230" : "#7d89a4", background: decisionReady ? "linear-gradient(135deg,#b794ff,#8b6ef0)" : "rgba(255,255,255,.05)", boxShadow: decisionReady ? "0 8px 22px -8px rgba(183,148,255,.7)" : "none", transition: "all .4s" }}><span aria-hidden="true">✓ </span>Onayla &amp; Gönder</button>
                  <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" aria-describedby="cak-hitl-desc" {...focusRing} style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: decisionReady ? "#cdd6e8" : "#7d89a4", fontFamily: SANS, fontSize: 12.5, transition: "all .4s" }}>Düzenle</button>
                  <button onClick={onReject} disabled={!decisionReady} aria-label="Taslağı reddet" aria-describedby="cak-hitl-desc" {...focusRing} style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "10px 14px", borderRadius: 10, border: "1px solid " + (decisionReady ? "rgba(248,113,113,.4)" : "rgba(255,255,255,.1)"), background: decisionReady ? "rgba(248,113,113,.08)" : "rgba(255,255,255,.03)", color: decisionReady ? "#f4a5a5" : "#7d89a4", fontFamily: SANS, fontSize: 12.5, transition: "all .4s" }}>Reddet</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ayrıntılı sonuç — sayfa aşağı kaydıkça TÜM ajan çıktıları (gerçek modda) */}
        {driven && result && (
          <NeonDetay result={result} onDownload={onDownload} downloading={downloading} canDownload={canDownload} />
        )}
      </main>
    </div>
  );
}

// Üst-bar meta satırı (gerçek: tür · sayfa · boyut · OCR% · kaynak; demo: sabit).
function buildMetaLine(driven, result, fileMeta) {
  if (!driven || !result) return "Dilekçe · 1 sayfa · 0.4 MB · OCR %98.7 · /process_doc/stream";
  const parts = [];
  if (result.evrak_turu) parts.push(EVRAK_TR(result.evrak_turu));
  if (result.page_count != null) parts.push(`${result.page_count} sayfa`);
  if (fileMeta?.kind === "file" && fileMeta.size) parts.push(`${(fileMeta.size / (1024 * 1024)).toFixed(1)} MB`);
  else if (fileMeta?.kind === "sample") parts.push(`${fileMeta.size} karakter`);
  if (result.ocr_confidence != null) parts.push(`OCR %${Math.round(result.ocr_confidence * 100)}`);
  parts.push(fileMeta?.kind === "file" ? "/process_doc/stream" : "/process_doc");
  return parts.join(" · ");
}

/* ---- küçük yardımcı bileşenler ---- */
function NavItem({ label, icon, active, badge, onClick }) {
  const base = { display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 10, fontSize: 13.5, width: "100%", textAlign: "left", fontFamily: SANS, cursor: "pointer" };
  if (active) return (
    <button type="button" aria-current="page" onClick={onClick} {...focusRing} style={{ ...base, background: "linear-gradient(90deg,rgba(46,230,201,.14),rgba(46,230,201,.03))", border: "1px solid rgba(46,230,201,.28)", color: "#eaf6ff", fontWeight: 500 }}>{icon}{label}</button>
  );
  return (
    <button type="button" onClick={onClick} {...focusRing} style={{ ...base, border: "1px solid transparent", background: "transparent", color: "#9aa6c0", justifyContent: badge ? "space-between" : "flex-start" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>{icon}{label}</span>
      {badge && <span aria-label={`${badge} bekleyen evrak`} style={{ fontFamily: MONO, fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "rgba(91,140,255,.16)", color: "#aec6ff" }}>{badge}</span>}
    </button>
  );
}
const Bar = ({ w, mb = 7 }) => <div style={{ height: 7, width: w, background: "#cdd2df", borderRadius: 3, marginBottom: mb }} />;
const Bar2 = ({ w, mb = 7 }) => <div style={{ height: 6, width: w, background: "#dde0ea", borderRadius: 3, marginBottom: mb }} />;

const sw = "#7d89a4";
const IconGrid = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={sw} strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={sw} strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={sw} strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={sw} strokeWidth="1.6" /></svg>;
const IconInbox = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5 H20 M12 8 V15 M9 12 L12 15 L15 12" stroke={sw} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 19 H20" stroke={sw} strokeWidth="1.6" strokeLinecap="round" /></svg>;
const IconSpin = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "cak-spin 2.4s linear infinite" }}><circle cx="12" cy="12" r="8" stroke="rgba(46,230,201,.25)" strokeWidth="2" /><path d="M12 4 A8 8 0 0 1 20 12" stroke="#2ee6c9" strokeWidth="2" strokeLinecap="round" /></svg>;
const IconDoc = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke={sw} strokeWidth="1.6" /><path d="M8 9 H16 M8 13 H16 M8 17 H13" stroke={sw} strokeWidth="1.6" strokeLinecap="round" /></svg>;
const IconBook = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4 H19 V20 H5 Z" stroke={sw} strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8 H15 M9 12 H15 M9 16 H13" stroke={sw} strokeWidth="1.6" strokeLinecap="round" /></svg>;
const IconShieldCheck = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke={sw} strokeWidth="1.6" /><path d="M8.5 12 L11 14.5 L15.5 9.5" stroke={sw} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
