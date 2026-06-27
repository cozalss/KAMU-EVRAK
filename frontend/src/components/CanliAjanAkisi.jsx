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
import { MONO, SANS, T, V, PAL, BANT, focusRing, SR_ONLY, EmptyState, Btn, Icon } from "./neonUi.jsx";

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
          const act = display.find((a) => a.status === "active");
          if (act) return `${act.label} çalışıyor — adım ${display.indexOf(act) + 1} / ${total}`;
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

          {/* Ajan izi */}
          <div style={{ padding: "18px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "2px", color: PAL.mut2, marginBottom: 14 }}>AJAN İZİ · {total} ADIM</div>
            {display.map((a, i) => {
              const isAnla = a.gorev === 1, col = isAnla ? T : V, colA = isAnla ? ta : va;
              const st = a.status, done = st === "done", active = st === "active";
              const prevGorev = i > 0 ? display[i - 1].gorev : null;
              const group = i === 0 ? "GÖREV 1 · ANLA" : (a.gorev === 2 && prevGorev === 1 ? "GÖREV 2 · ÜRET" : "");
              return (
                <div key={a.id}>
                  {group && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "2px", color: i === 0 ? "#3f8f7f" : "#7a5fb0", margin: (i === 0 ? "0" : "18px") + " 0 8px", paddingLeft: 2 }}>{group}</div>}
                  <div style={{ display: "flex", gap: 13, padding: "10px 12px", borderRadius: 12, marginBottom: 4, background: active ? colA(0.1) : "transparent", border: "1px solid " + (active ? colA(0.3) : "transparent"), boxShadow: active && glow ? `0 8px 26px -10px ${colA(0.5)}` : "none", opacity: st === "pending" ? 0.45 : 1, transition: "all .4s cubic-bezier(.2,.8,.2,1)" }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {active && glow && <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 30, height: 30, borderRadius: 9, border: "1px solid " + col, transform: "translate(-50%,-50%)", animation: "nu-ring 1.5s ease-out infinite", pointerEvents: "none" }} />}
                      <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: (done || active) ? "#06121a" : col, background: (done || active) ? col : colA(0.14), transition: "all .4s" }}>{done ? "✓" : st === "error" ? "✕" : String(i + 1).padStart(2, "0")}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", color: active ? "#eaf6ff" : done ? PAL.ink2 : PAL.mut2 }}>{a.label}</span>
                        {a.tag && <span style={{ fontFamily: MONO, fontSize: 9.5, padding: "2px 7px", borderRadius: 7, color: a.id === "risk_guard" ? risk.c : col, background: a.id === "risk_guard" ? risk.c + "22" : colA(0.12), opacity: (done || active) ? 1 : 0.5 }}>{a.tag}</span>}
                      </div>
                      <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: done ? (a.id === "risk_guard" ? risk.c : "#93a0bb") : PAL.mut2, animation: active ? "nu-think 1.2s ease-in-out infinite" : "none" }}>{done ? (a.out || "tamamlandı ✓") : active ? "çalışıyor…" : "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
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

            <div style={{ borderRadius: 14, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.5px", color: PAL.mut3, marginBottom: 9 }}>RİSK BANDI</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 11, background: "rgba(0,0,0,.28)", border: `1px solid ${PAL.line}` }}>
                  {[["#34d399", "yesil"], ["#fbbf24", "sari"], ["#f87171", "kirmizi"]].map(([c, key]) => {
                    const on = lit && riskOutcome === key;
                    return <span key={key} aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: on ? c : "rgba(255,255,255,0.07)", boxShadow: on ? `0 0 14px 2px ${c}` : "none", border: "1px solid " + (on ? c : "rgba(255,255,255,0.12)"), transition: "all .5s" }} />;
                  })}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, color: lit ? risk.c : PAL.mut2, background: lit ? risk.c + "1f" : "rgba(255,255,255,.04)", border: "1px solid " + (lit ? risk.c + "66" : "rgba(255,255,255,.1)") }}>{lit ? risk.l : "—"}</div>
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
