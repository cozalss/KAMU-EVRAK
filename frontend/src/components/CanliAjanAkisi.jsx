/* CanliAjanAkisi — "İşleniyor" görünümü (neon komuta merkezi ana içeriği).
   SADECE gerçek veri: nodes (canlı SSE/JSON) + ProcessResponse. Sahte demo auto-animasyon YOK —
   evrak işlenmiyorsa anlamlı boş durum ("Gelen Evrak'tan seçin veya yükleyin").
   Sidebar kabuğu DashboardApp'te; bu bileşen <main> içine yerleşir.
   Üst-bar (dosya meta + ilerleme) + 3-panel (kaynak ↔ ajan izi ↔ çıkarılan/risk/taslak+HITL)
   + altında NeonDetay (tüm ajan çıktıları, sayfa aşağı kaydıkça). */
import { useMemo } from "react";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "./result-cards.jsx";
import NeonDetay from "./NeonDetay.jsx";
import { MONO, SANS, T, V, PAL, BANT, focusRing, SR_ONLY, EmptyState, Btn, Icon, RiskBand } from "./neonUi.jsx";

const ta = (a) => `rgba(46,230,201,${a})`;
const va = (a) => `rgba(183,148,255,${a})`;

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
    case "risk_guard": return risk.l;
    case "arsiv": return "SDP";
    case "sla_triyaj": return "süre";
    case "denetim_izi": return "SHA-256";
    case "finalize": return "denetim";
    default: return "";
  }
}

function buildDrivenFields(r, risk) {
  const conf = r.tur_confidence != null ? ` · %${Math.round(r.tur_confidence * 100)}` : "";
  const seen = new Set();
  const spanRows = [];
  for (const sp of (r.kanit_metadata?.spanlar || [])) {
    if (!sp?.label || !sp?.deger || seen.has(sp.label)) continue;
    seen.add(sp.label);
    spanRows.push([sp.label, cleanDemoText(sp.deger), PAL.ink2]);
  }
  const eksik = (r.eksik_alanlar || []).length;
  const mev = r.mevzuat_onerileri?.[0]?.baslik;
  return [
    ["Evrak türü", `${EVRAK_TR(r.evrak_turu)}${conf}`, PAL.ink2],
    ...spanRows,
    ["Eksik alan", eksik ? `${eksik} eksik` : "Yok · tam ✓", eksik ? "#fbbf24" : "#34d399"],
    mev ? ["Mevzuat", cleanDemoText(mev), T] : null,
    r.hedef_birim ? ["Hedef birim", BIRIM_LBL(r.hedef_birim), V] : null,
    ["Risk bandı", risk.l, risk.c],
  ].filter(Boolean);
}

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

function buildMetaLine(r, fileMeta) {
  const parts = [];
  if (r?.evrak_turu) parts.push(EVRAK_TR(r.evrak_turu));
  if (r?.page_count != null) parts.push(`${r.page_count} sayfa`);
  if (fileMeta?.kind === "file" && fileMeta.size) parts.push(`${(fileMeta.size / (1024 * 1024)).toFixed(1)} MB`);
  else if (fileMeta?.kind === "sample") parts.push(`${fileMeta.size} karakter`);
  if (r?.ocr_confidence != null) parts.push(`OCR %${Math.round(r.ocr_confidence * 100)}`);
  parts.push(fileMeta?.kind === "file" ? "/process_doc/stream" : "/process_doc");
  return parts.join(" · ");
}

export default function CanliAjanAkisi({
  nodes = [], result = null, busy = false, started = false,
  riskOutcome = "yesil", fileMeta = null, pendingOnay = null,
  onApprove = () => {}, onEdit = () => {}, onReject = () => {},
  onDownload = () => {}, downloading = "", canDownload = false,
  onUpload = () => {}, onGoInbox = () => {}, glow = true,
}) {
  // EVRAK İŞLENMİYOR → anlamlı boş durum (sahte demo yok).
  if (!started) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100vh - 1px)", padding: "0 24px" }}>
        <EmptyState
          icon={<Icon.spin />}
          title="İşlenecek evrak seçilmedi"
          sub="Gelen Evrak kuyruğundan bir evrak seçin ya da yeni bir belge yükleyin. Seçtiğiniz evrak burada uçtan-uca, canlı olarak işlenir."
          actions={[
            <Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>,
            <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
          ]}
        />
      </div>
    );
  }

  const risk = BANT[riskOutcome] || BANT.yesil;
  const display = nodes.map((n) => ({
    id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
    out: summarize(n.id, n.data), tag: nodeTag(n, risk), t1: n.t1,
  }));
  const total = display.length || 1;
  const doneCount = display.filter((a) => a.status === "done").length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = !busy && doneCount >= total;
  const statusText = busy ? "işleniyor · " + String(doneCount).padStart(2, "0") + "/" + total : (allDone ? "tamamlandı" : "sırada");

  const drivenFields = useMemo(() => (result ? buildDrivenFields(result, risk) : null), [result, risk]);
  const km = result?.kanit_metadata;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const draftMd = result?.yazi_taslak_md;
  const lit = display.find((a) => a.id === "risk_guard")?.status === "done";
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  const metaLine = buildMetaLine(result, fileMeta);

  return (
    <>
      {/* SR: canlı ilerleme */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {(() => {
          const ai = display.findIndex((a) => a.status === "active");
          if (ai >= 0) return `${display[ai].label} çalışıyor — adım ${ai + 1} / ${total}`;
          if (allDone) return `İşleme tamamlandı — ${total} ajan başarıyla yürütüldü.`;
          return "";
        })()}
      </div>

      {/* Üst durum çubuğu */}
      <header style={{ padding: "15px 24px", borderBottom: `1px solid ${PAL.line}`, background: "rgba(15,22,38,.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(91,140,255,.12)", border: "1px solid rgba(91,140,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#aec6ff" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 12 L11 14 L15 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 14, color: PAL.ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{fileLabel}</h2>
              <span style={{ display: "block", fontSize: 11.5, color: PAL.mut2 }}>{metaLine}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 20, background: allDone ? "rgba(52,211,153,.1)" : "rgba(46,230,201,.1)", border: "1px solid " + (allDone ? "rgba(52,211,153,.3)" : "rgba(46,230,201,.26)"), marginLeft: 6, flexShrink: 0 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: allDone ? "#34d399" : T, animation: busy ? "nu-dotpulse 1.4s ease-in-out infinite" : "none" }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#cfe9e2" }}>{statusText}</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10.5, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: T }} />Görev 1 · Anla
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: V, marginLeft: 5 }} />Görev 2 · Üret
            </span>
            <button onClick={onUpload} aria-label="Yeni evrak yükle" {...focusRing} style={{ cursor: "pointer", padding: "8px 12px", borderRadius: 10, border: `1px solid ${PAL.lineHi}`, background: "rgba(255,255,255,.04)", color: PAL.mut, fontFamily: MONO, fontSize: 12 }} title="Yeni evrak">↻</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 13 }}>
          {display.map((a) => {
            const col = a.gorev === 1 ? T : V;
            return <div key={a.id} style={{ flex: 1, height: 5, borderRadius: 3, background: a.status === "done" || a.status === "active" ? col : "rgba(255,255,255,.2)", boxShadow: a.status === "active" && glow ? `0 0 10px ${col}` : "none", transform: a.status === "active" ? "scaleY(1.6)" : "none", transition: "all .4s" }} />;
          })}
          <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, marginLeft: 8, flexShrink: 0 }}>{pct}%</span>
        </div>
      </header>

      {/* 3 panel — komuta merkezi */}
      <section style={{ minHeight: "calc(100vh - 132px)" }}>
        <div style={{ minHeight: "100%", minWidth: 1060, display: "grid", gridTemplateColumns: "290px minmax(380px,1fr) 360px" }}>

          {/* Kaynak belge */}
          <div style={{ borderRight: `1px solid ${PAL.line}`, padding: 18, display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2, marginBottom: 12 }}>KAYNAK BELGE</div>
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#eef0f6", boxShadow: "0 12px 34px -12px rgba(0,0,0,.6)", minHeight: 300, aspectRatio: segs ? "auto" : "1 / 1.34" }}>
              {busy && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "linear-gradient(90deg,transparent,#2ee6c9,transparent)", boxShadow: "0 0 12px #2ee6c9", animation: "nu-scanv 2.8s ease-in-out infinite", zIndex: 3 }} />}
              {segs ? (
                <pre style={{ margin: 0, padding: "18px 16px", fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: "#2a3346", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {segs.map((sg, i) => sg.mark ? <mark key={i} style={{ background: "#fde68a", color: "#92400e", borderRadius: 3, padding: "0 2px" }}>{sg.t}</mark> : <span key={i}>{sg.t}</span>)}
                </pre>
              ) : (
                <div style={{ padding: "20px 18px", fontFamily: MONO, display: "flex", flexDirection: "column", gap: 10, color: "#9aa3b8", fontSize: 11 }}>
                  <div style={{ height: 7, width: "55%", background: "#cdd2df", borderRadius: 3 }} />
                  <div style={{ height: 7, width: "40%", background: "#cdd2df", borderRadius: 3, marginBottom: 6 }} />
                  {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Metin işlenecek…"}
                </div>
              )}
            </div>
            <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 11, background: "rgba(46,230,201,.07)", border: "1px solid rgba(46,230,201,.2)", fontSize: 11.5, color: "#a7d8cd", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="6" cy="12" r="2.2" fill="#2ee6c9" /><circle cx="12" cy="12" r="2.2" fill="#2ee6c9" /><circle cx="18" cy="12" r="2.2" fill="#2ee6c9" /></svg>
              Kişisel veriler (TCKN, telefon) maskelenerek işleniyor — KVKK uyumlu.
            </div>
          </div>

          {/* Ajan izi — neon omurga zaman çizelgesi (dolan ilerleme + akan paket + nefes alan aktif düğüm) */}
          <div style={{ padding: "18px 22px" }}>
            {/* Başlık + kompakt telemetri */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2 }}>AJAN İZİ · {total} ADIM</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 9.5, letterSpacing: "1px", color: PAL.mut3 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: busy ? T : (doneCount >= total ? BANT.yesil.c : PAL.mut2), boxShadow: busy && glow ? `0 0 8px ${T}` : "none", animation: busy && glow ? "nu-dotpulse 1.4s ease-in-out infinite" : "none" }} />
                {busy ? "CANLI" : (doneCount >= total ? "TAMAM" : "BEKLEMEDE")} · {String(doneCount).padStart(2, "0")}/{total} · %{pct}
              </div>
            </div>

            {/* Omurga + düğümler */}
            <div style={{ position: "relative" }}>
              {/* OMURGA — sönük taban ray; içinde dolan ilerleme + akan paket. aria-hidden. */}
              <div aria-hidden="true" style={{ position: "absolute", left: 13, top: 14, bottom: 14, width: 2, borderRadius: 2, background: PAL.line, overflow: "hidden", pointerEvents: "none" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: 2, transformOrigin: "top center", transform: `scaleY(${total ? Math.max(doneCount, busy ? 0.04 : 0) / total : 0})`, background: `linear-gradient(180deg, ${T} 0%, ${T} 42%, ${V} 100%)`, boxShadow: glow ? `0 0 10px ${ta(0.5)}` : "none", transition: "transform .6s cubic-bezier(.2,.8,.2,1)" }} />
                {busy && glow && (() => {
                  const ai = display.findIndex((a) => a.status === "active");
                  const flowCol = ai >= 0 ? (display[ai].gorev === 2 ? V : T) : (doneCount < Math.ceil(total / 2) ? T : V);
                  const flowColA = ai >= 0 ? (display[ai].gorev === 2 ? va : ta) : (doneCount < Math.ceil(total / 2) ? ta : va);
                  return <span style={{ position: "absolute", left: "50%", top: 0, width: 6, height: 26, marginLeft: -3, borderRadius: 6, background: `linear-gradient(180deg, transparent, ${flowCol}, transparent)`, boxShadow: `0 0 9px 1px ${flowColA(0.75)}`, animation: "nu-pkt 2.2s cubic-bezier(.5,0,.5,1) infinite", willChange: "transform, opacity" }} />;
                })()}
              </div>

              {display.map((a, i) => {
                const isAnla = a.gorev === 1, col = isAnla ? T : V, colA = isAnla ? ta : va;
                const st = a.status, done = st === "done", active = st === "active", err = st === "error", pending = st === "pending";
                const prevGorev = i > 0 ? display[i - 1].gorev : null;
                const group = i === 0 ? "GÖREV 1 · ANLA" : (a.gorev === 2 && prevGorev === 1 ? "GÖREV 2 · ÜRET" : "");
                const tagCol = a.id === "risk_guard" ? risk.c : col;
                const tagBg = a.id === "risk_guard" ? risk.c + "22" : colA(0.12);
                const tagBd = a.id === "risk_guard" ? risk.c + "3a" : colA(0.22);
                const enterDelay = `${Math.min(i * 50, 640)}ms`;
                return (
                  <div key={a.id}>
                    {group && (
                      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "2px", color: i === 0 ? "#3f8f7f" : "#7a5fb0", margin: (i === 0 ? "0" : "20px") + " 0 10px", paddingLeft: 42, display: "flex", alignItems: "center", gap: 9 }}>
                        <span>{group}</span>
                        <span aria-hidden="true" style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${i === 0 ? ta(0.4) : va(0.4)}, transparent)` }} />
                      </div>
                    )}
                    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "28px 1fr", gap: 14, padding: "9px 12px 9px 0", borderRadius: 12, marginBottom: 2, background: active ? colA(0.08) : "transparent", boxShadow: active && glow ? `inset 0 0 0 1px ${colA(0.26)}, 0 10px 30px -14px ${colA(0.55)}` : "none", transition: "background .4s, box-shadow .4s", animation: glow ? "nu-rise-stag .5s cubic-bezier(.2,.8,.2,1) both" : "none", animationDelay: glow ? enterDelay : "0ms" }}>
                      {/* DÜĞÜM — omurga üstünde oturan nokta/çember */}
                      <div aria-hidden="true" style={{ position: "relative", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {active && glow && <span style={{ position: "absolute", left: "50%", top: "50%", width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${col}`, transform: "translate(-50%,-50%)", animation: "nu-ring 1.6s ease-out infinite", pointerEvents: "none" }} />}
                        <span style={{ position: "relative", zIndex: 1, width: done || active ? 26 : 14, height: done || active ? 26 : 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: done || active ? "#06121a" : err ? BANT.kirmizi.c : col, background: done || active ? col : err ? "rgba(248,113,113,.16)" : PAL.bg2, border: done || active ? "none" : `2px solid ${err ? BANT.kirmizi.c : pending ? PAL.lineHi : colA(0.6)}`, boxShadow: active && glow ? `0 0 16px 1px ${col}` : done && glow ? `0 0 9px ${colA(0.55)}` : "none", animation: active && glow ? "nu-breathe 2s ease-in-out infinite" : done && glow ? "nu-pop .42s cubic-bezier(.34,1.56,.64,1) both" : "none", transition: "width .35s cubic-bezier(.34,1.56,.64,1), height .35s cubic-bezier(.34,1.56,.64,1), background .35s, border-color .35s" }}>
                          {done ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7" stroke="#06121a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          ) : err ? "✕" : active ? (
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#06121a", animation: glow ? "nu-think 1.1s ease-in-out infinite" : "none" }} />
                          ) : null}
                        </span>
                      </div>

                      {/* İÇERİK */}
                      <div style={{ minWidth: 0, paddingTop: 1, opacity: pending ? 0.5 : 1, transition: "opacity .4s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, color: active ? "#eaf6ff" : done ? PAL.ink2 : PAL.mut2, transition: "color .35s" }}>{a.label}</span>
                          {a.tag && <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 7px", borderRadius: 7, color: tagCol, background: tagBg, border: `1px solid ${tagBd}`, opacity: done || active ? 1 : 0.45, transition: "opacity .35s" }}>{a.tag}</span>}
                          {active ? (
                            <span aria-hidden="true" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 8.5, letterSpacing: "1.5px", color: col, opacity: 0.9, flexShrink: 0, animation: glow ? "nu-think 1.2s ease-in-out infinite" : "none" }}>İŞLENİYOR</span>
                          ) : (
                            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 9, letterSpacing: "1px", color: PAL.mut2, opacity: 0.65, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                          )}
                        </div>
                        <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: done ? (a.id === "risk_guard" ? risk.c : "#93a0bb") : active ? PAL.mut : err ? BANT.kirmizi.c : PAL.mut2, animation: active && glow ? "nu-think 1.3s ease-in-out infinite" : "none" }}>
                          {done ? (a.out || "tamamlandı ✓") : active ? "çalışıyor…" : err ? "hata · adım başarısız" : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sağ panel: çıkarılan veri + risk + taslak + HITL */}
          <div style={{ borderLeft: `1px solid ${PAL.line}`, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ borderRadius: 14, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: PAL.mut3 }}>ÇIKARILAN VERİ</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: "#34d399", display: "flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399" }} />maskeli</span>
              </div>
              {(drivenFields || [["Evrak türü", "•••"], ["Konu", "•••"], ["Gönderen", "•••"], ["Risk bandı", "•••"]]).map((d, k) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: `1px dashed ${PAL.line}` }}>
                  <span style={{ fontSize: 11.5, color: PAL.mut3, fontFamily: MONO }}>{d[0]}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: d[2] || PAL.mut2, fontWeight: 500, textAlign: "right" }}>{d[1]}</span>
                </div>
              ))}
            </div>

            <div style={{ borderRadius: 14, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: "14px 16px" }}>
              <RiskBand band={riskOutcome} lit={lit} />
            </div>

            <div style={{ borderRadius: 14, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: PAL.mut3, marginBottom: 10 }}>RESMÎ YAZI TASLAĞI</div>
              {draftMd ? (
                <pre style={{ background: "#f4f5f9", borderRadius: 9, padding: "15px 16px", fontFamily: MONO, fontSize: 10.5, color: "#3a4252", flex: 1, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, animation: "nu-rise .5s ease both", lineHeight: 1.6, maxHeight: 420 }}>{cleanDemoText(draftMd)}</pre>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, justifyContent: "center", fontSize: 12, color: PAL.mut2, border: "1px dashed rgba(255,255,255,.1)", borderRadius: 9, padding: 20 }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: PAL.mut2, animation: "nu-think 1.2s ease-in-out infinite" }} />
                  Taslak, "Yazı Taslağı" adımında üretilecek…
                </div>
              )}
              <div id="cak-hitl-desc" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 11, fontSize: 10.5, color: PAL.mut2 }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: V, flexShrink: 0 }} />
                Yapay zekâ <strong style={{ color: "#cdd6e8", fontWeight: 600 }}>öneriyor</strong> — yetkili memur <strong style={{ color: "#cdd6e8", fontWeight: 600 }}>karar verir</strong> (HITL)
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                <button onClick={onApprove} disabled={!decisionReady} aria-label="Taslağı onayla ve gönder" aria-describedby="cak-hitl-desc" {...focusRing} style={{ flex: 1, cursor: decisionReady ? "pointer" : "not-allowed", padding: 10, borderRadius: 10, border: "none", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: decisionReady ? "#1a1230" : PAL.mut2, background: decisionReady ? "linear-gradient(135deg,#b794ff,#8b6ef0)" : "rgba(255,255,255,.05)", boxShadow: decisionReady ? "0 8px 22px -8px rgba(183,148,255,.7)" : "none" }}><span aria-hidden="true">✓ </span>Onayla &amp; Gönder</button>
                <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" aria-describedby="cak-hitl-desc" {...focusRing} style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "10px 14px", borderRadius: 10, border: `1px solid ${PAL.lineHi}`, background: "rgba(255,255,255,.04)", color: decisionReady ? "#cdd6e8" : PAL.mut2, fontFamily: SANS, fontSize: 12.5 }}>Düzenle</button>
                <button onClick={onReject} disabled={!decisionReady} aria-label="Taslağı reddet" aria-describedby="cak-hitl-desc" {...focusRing} style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "10px 14px", borderRadius: 10, border: "1px solid " + (decisionReady ? "rgba(248,113,113,.4)" : "rgba(255,255,255,.1)"), background: decisionReady ? "rgba(248,113,113,.08)" : "rgba(255,255,255,.03)", color: decisionReady ? "#f4a5a5" : PAL.mut2, fontFamily: SANS, fontSize: 12.5 }}>Reddet</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ayrıntılı sonuç — sayfa aşağı kaydıkça tüm ajan çıktıları */}
      {result && <NeonDetay result={result} onDownload={onDownload} downloading={downloading} canDownload={canDownload} />}
    </>
  );
}
