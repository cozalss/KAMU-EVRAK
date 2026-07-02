/* CanliAjanAkisi — "İşleniyor" görünümü (canlı komuta merkezi ana içeriği).
   SADECE gerçek veri: nodes (canlı SSE/JSON) + ProcessResponse. Sahte demo auto-animasyon YOK —
   evrak işlenmiyorsa anlamlı boş durum ("Gelen Evrak'tan seçin veya yükleyin").
   Sidebar kabuğu DashboardApp'te; bu bileşen <main> içine yerleşir.
   Üst-bar (dosya meta + ilerleme) + 3-panel (kaynak ↔ ajan izi ↔ çıkarılan/risk/taslak+HITL)
   + altında NeonDetay (tüm ajan çıktıları, sayfa aşağı kaydıkça). */
import { useMemo } from "react";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "./result-cards.jsx";
import NeonDetay from "./NeonDetay.jsx";
import { MONO, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY, EmptyState, Btn, Icon, RiskBand } from "./neonUi.jsx";

function nodeTag(n, risk) {
  const d = n.data || {};
  const pc = (x) => `%${Math.round((Number(x) || 0) * 100)}`;
  switch (n.id) {
    case "oku": return d.ocr_confidence != null ? pc(d.ocr_confidence) : "OCR";
    case "siniflandir": return d.tur_confidence != null ? pc(d.tur_confidence) : "tür";
    case "cikar": { const k = d.bilgi_unsurlari ? Object.keys(d.bilgi_unsurlari).length : 0; return k ? `${k} alan` : "çıkar"; }
    case "kanit_baglama": { const s = d.kanit_metadata?.spanlar?.length || 0; return s ? `${s} kanıt` : "kanıt"; }
    case "eksik_tespit": return (d.eksik_alanlar?.length) ? `${d.eksik_alanlar.length} eksik` : "tam";
    case "decompose": { const a = d.alt_talepler?.length || 0; return a >= 2 ? `${a} talep` : "tek konu"; }
    case "mevzuat_oner": { const m = d.mevzuat_onerileri?.length || 0; return m ? `${m} mevzuat` : "mevzuat"; }
    case "ozetle": return "özet";
    case "route_birim": return "havale";
    case "yazi_taslak": return d.yazi_turu ? "2646" : "taslak";
    case "verify": return (d.verify_uyari?.length) ? "uyarı" : "veto";
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
    ["Eksik alan", eksik ? `${eksik} eksik` : "Yok · tam", eksik ? DERIN.sari : DERIN.yesil],
    mev ? ["Mevzuat", cleanDemoText(mev), DERIN.T] : null,
    r.hedef_birim ? ["Hedef birim", BIRIM_LBL(r.hedef_birim), DERIN.V] : null,
    ["Risk bandı", risk.l, DERIN_OF(risk.c)],
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
  const statusText = busy ? "İşleniyor · " + String(doneCount).padStart(2, "0") + "/" + total : (allDone ? "Tamamlandı" : "Sırada");

  const drivenFields = useMemo(() => (result ? buildDrivenFields(result, risk) : null), [result, risk]);
  const km = result?.kanit_metadata;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const draftMd = result?.yazi_taslak_md;
  const lit = display.find((a) => a.id === "risk_guard")?.status === "done";
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  const metaLine = buildMetaLine(result, fileMeta);
  // Sağ panel kartları — düz beyaz yüzey + 1px hairline (border-first), NeonCard ile tutarlı.
  const card = { position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: SP.l, boxShadow: SH.card };

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
      <header style={{ padding: "16px 24px", borderBottom: `1px solid ${PAL.line}`, background: PAL.bg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: PAL.mut }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 12 L11 14 L15 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: "18px", color: PAL.ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{fileLabel}</h2>
              <span style={{ display: "block", ...TYPE.meta, color: PAL.mut2 }}>{metaLine}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: SP.xs, padding: "2px 8px", borderRadius: RAD.chip, background: allDone ? ALFA(BANT.yesil.c) : ALFA(T), marginLeft: SP.s, flexShrink: 0 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: allDone ? BANT.yesil.c : T, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
              <span style={{ ...TYPE.meta, fontWeight: 500, color: allDone ? DERIN.yesil : DERIN.T, ...TNUM }}>{statusText}</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
            <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: T }} />Görev 1 · Anla
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: V, marginLeft: SP.xs }} />Görev 2 · Üret
            </span>
            <button onClick={onUpload} aria-label="Yeni evrak yükle" {...focusRing} title="Yeni evrak"
              onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.mut, transition: "background .12s ease-out" }}>
              <Icon.upload />
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.m }}>
          <div aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 2, background: PAL.press, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: T, transition: "width .4s ease-out" }} />
          </div>
          <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, flexShrink: 0, minWidth: 38, textAlign: "right", ...TNUM }}>{pct}%</span>
        </div>
      </header>

      {/* 3 panel — komuta merkezi */}
      <section style={{ minHeight: "calc(100vh - 132px)" }}>
        <div style={{ minHeight: "100%", minWidth: 1060, display: "grid", gridTemplateColumns: "290px minmax(380px,1fr) 360px" }}>

          {/* Kaynak belge */}
          <div style={{ borderRight: `1px solid ${PAL.line}`, padding: SP.l, display: "flex", flexDirection: "column" }}>
            <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, marginBottom: SP.m }}>Kaynak belge</div>
            <div style={{ position: "relative", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, minHeight: 300, aspectRatio: segs ? "auto" : "1 / 1.34" }}>
              {segs ? (
                <pre style={{ margin: 0, padding: SP.l, fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {segs.map((sg, i) => sg.mark ? <mark key={i} style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, padding: "0 2px" }}>{sg.t}</mark> : <span key={i}>{sg.t}</span>)}
                </pre>
              ) : (
                <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: SP.s, ...TYPE.data, color: PAL.mut2 }}>
                  <div style={{ height: 8, width: "55%", background: PAL.bg2, borderRadius: RAD.chip, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
                  <div style={{ height: 8, width: "40%", background: PAL.bg2, borderRadius: RAD.chip, marginBottom: SP.xs, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
                  {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Metin işlenecek…"}
                </div>
              )}
            </div>
            <div style={{ marginTop: SP.l, padding: SP.m, borderRadius: RAD.card, background: ALFA(T), ...TYPE.meta, color: DERIN.T, display: "flex", gap: SP.s, alignItems: "flex-start" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="6" cy="12" r="2.2" fill={T} /><circle cx="12" cy="12" r="2.2" fill={T} /><circle cx="18" cy="12" r="2.2" fill={T} /></svg>
              Kişisel veriler (TCKN, telefon) maskelenerek işleniyor — KVKK uyumlu.
            </div>
          </div>

          {/* Ajan izi — zaman çizelgesi (düz ilerleme rayı + spinner/nokta canlılığı) */}
          <div style={{ padding: "16px 24px" }}>
            {/* Başlık + kompakt telemetri */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.l }}>
              <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2 }}>Ajan izi · {total} adım</div>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : (doneCount >= total ? BANT.yesil.c : PAL.mut2), animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
                {busy ? "Canlı" : (doneCount >= total ? "Tamam" : "Beklemede")} · {String(doneCount).padStart(2, "0")}/{total} · %{pct}
              </div>
            </div>

            {/* Omurga + düğümler */}
            <div style={{ position: "relative" }}>
              {/* OMURGA — sönük taban ray + düz T ilerleme dolgusu. aria-hidden. */}
              <div aria-hidden="true" style={{ position: "absolute", left: 13, top: 14, bottom: 14, width: 2, background: PAL.line, overflow: "hidden", pointerEvents: "none" }}>
                <div style={{ position: "absolute", inset: 0, transformOrigin: "top center", transform: `scaleY(${total ? Math.max(doneCount, busy ? 0.04 : 0) / total : 0})`, background: T, transition: "transform .4s ease-out" }} />
              </div>

              {display.map((a, i) => {
                const isAnla = a.gorev === 1, col = isAnla ? T : V;
                const st = a.status, done = st === "done", active = st === "active", err = st === "error", pending = st === "pending";
                const prevGorev = i > 0 ? display[i - 1].gorev : null;
                const group = i === 0 ? "Görev 1 · Anla" : (a.gorev === 2 && prevGorev === 1 ? "Görev 2 · Üret" : "");
                return (
                  <div key={a.id}>
                    {group && (
                      <div style={{ ...TYPE.meta, fontWeight: 500, color: i === 0 ? DERIN.T : DERIN.V, margin: (i === 0 ? "0" : `${SP.xl}px`) + ` 0 ${SP.s}px`, paddingLeft: 28 + SP.m, display: "flex", alignItems: "center", gap: SP.s }}>
                        <span>{group}</span>
                        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
                      </div>
                    )}
                    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "28px 1fr", gap: SP.m, padding: `${SP.s}px ${SP.m}px ${SP.s}px 0`, borderRadius: RAD.ctl, marginBottom: SP.xs, background: active ? PAL.press : "transparent", transition: "background .15s ease-out", animation: glow ? "nu-rise .16s ease-out both" : "none" }}>
                      {/* Aktif satır göstergesi — 2px sol şerit (semantik durum) */}
                      {active && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: SP.s, bottom: SP.s, width: 2, background: col }} />}
                      {/* DÜĞÜM — omurga üstünde oturan durum işareti */}
                      <div aria-hidden="true" style={{ position: "relative", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ position: "relative", zIndex: 1, width: 20, height: 20, borderRadius: RAD.dot, display: "flex", alignItems: "center", justifyContent: "center", background: PAL.bg }}>
                          {done ? (
                            <Icon.check style={{ color: DERIN.yesil }} />
                          ) : err ? (
                            <Icon.x style={{ color: DERIN.kirmizi }} />
                          ) : active ? (
                            <span style={{ width: 8, height: 8, borderRadius: RAD.dot, background: col, animation: glow ? "nu-think 1.1s ease-in-out infinite" : "none" }} />
                          ) : (
                            <span style={{ width: 8, height: 8, borderRadius: RAD.dot, background: PAL.bg2, border: `1px solid ${PAL.lineHi}` }} />
                          )}
                        </span>
                      </div>

                      {/* İÇERİK */}
                      <div style={{ minWidth: 0, opacity: pending ? 0.5 : 1, transition: "opacity .15s ease-out" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap" }}>
                          <span style={{ ...TYPE.ui, fontWeight: 500, color: active ? PAL.ink : done ? PAL.ink2 : PAL.mut2, transition: "color .15s ease-out" }}>{a.label}</span>
                          {a.tag && <span style={{ ...TYPE.meta, ...(a.id === "risk_guard" ? { fontFamily: MONO, fontWeight: 500 } : null), color: a.id === "risk_guard" ? DERIN_OF(risk.c) : PAL.mut, opacity: done || active ? 1 : 0.45, transition: "opacity .15s ease-out", ...TNUM }}>{a.tag}</span>}
                          {active ? (
                            <span aria-hidden="true" style={{ marginLeft: "auto", ...TYPE.meta, color: DERIN_OF(col), flexShrink: 0, animation: glow ? "nu-think 1.2s ease-in-out infinite" : "none" }}>İşleniyor</span>
                          ) : (
                            <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut2, opacity: 0.65, flexShrink: 0, ...TNUM }}>{String(i + 1).padStart(2, "0")}</span>
                          )}
                        </div>
                        <div style={{ marginTop: SP.xs, ...TYPE.data, color: done ? (a.id === "risk_guard" ? DERIN_OF(risk.c) : PAL.mut) : active ? PAL.mut : err ? DERIN.kirmizi : PAL.mut2, animation: active && glow ? "nu-think 1.3s ease-in-out infinite" : "none" }}>
                          {done ? (a.out || "tamamlandı") : active ? "çalışıyor…" : err ? "hata · adım başarısız" : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sağ panel: çıkarılan veri + risk + taslak + HITL */}
          <div style={{ borderLeft: `1px solid ${PAL.line}`, padding: SP.l, display: "flex", flexDirection: "column", gap: SP.l }}>
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.s }}>
                <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3 }}>Çıkarılan veri</span>
                <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN.yesil, background: ALFA(BANT.yesil.c), padding: "2px 8px", borderRadius: RAD.chip }}>Maskeli</span>
              </div>
              {(drivenFields || [["Evrak türü", "—"], ["Konu", "—"], ["Gönderen", "—"], ["Risk bandı", "—"]]).map((d, k) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: SP.m, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
                  <span style={{ ...TYPE.meta, color: PAL.mut3 }}>{d[0]}</span>
                  <span style={{ ...TYPE.data, color: d[2] || PAL.mut2, fontWeight: 500, textAlign: "right", ...TNUM }}>{d[1]}</span>
                </div>
              ))}
            </div>

            <div style={card}>
              <RiskBand band={riskOutcome} lit={lit} />
            </div>

            <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut3, marginBottom: SP.s }}>Resmî yazı taslağı</div>
              {draftMd ? (
                <pre style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "12px 16px", ...TYPE.data, color: PAL.ink2, flex: 1, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, animation: "nu-rise .16s ease-out both", maxHeight: 420 }}>{cleanDemoText(draftMd)}</pre>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: SP.s, flex: 1, justifyContent: "center", ...TYPE.data, color: PAL.mut2, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: SP.xl }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: RAD.dot, background: PAL.mut2, animation: "nu-think 1.2s ease-in-out infinite" }} />
                  Taslak, "Yazı Taslağı" adımında üretilecek…
                </div>
              )}
              <div id="cak-hitl-desc" style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.m, ...TYPE.meta, color: PAL.mut2 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: V, flexShrink: 0 }} />
                Yapay zekâ <strong style={{ color: PAL.ink2, fontWeight: 600 }}>öneriyor</strong> — yetkili memur <strong style={{ color: PAL.ink2, fontWeight: 600 }}>karar verir</strong> (HITL)
              </div>
              <div style={{ display: "flex", gap: SP.s, marginTop: SP.s }}>
                <button onClick={onApprove} disabled={!decisionReady} aria-label="Taslağı onayla ve gönder" aria-describedby="cak-hitl-desc" {...focusRing}
                  onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.Th; }}
                  onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.T; }}
                  style={{ flex: 1, cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: "none", ...TYPE.ui, fontWeight: 500, color: decisionReady ? PAL.onAccent : PAL.mut2, background: decisionReady ? DERIN.T : PAL.press, transition: "background .12s ease-out" }}>Onayla &amp; gönder</button>
                <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" aria-describedby="cak-hitl-desc" {...focusRing}
                  onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                  onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                  style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease-out" }}>Düzenle</button>
                <button onClick={onReject} disabled={!decisionReady} aria-label="Taslağı reddet" aria-describedby="cak-hitl-desc" {...focusRing}
                  onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                  onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                  style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "8px 14px", minHeight: 36, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? DERIN.kirmizi : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease-out" }}>Reddet</button>
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
