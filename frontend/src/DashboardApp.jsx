/* DashboardApp — kamu-evrak neon çalışma alanı kabuğu + oturum kurgusu.
   Sidebar (işlevsel nav) + görünüm anahtarlama (Panel/Gelen/İşleniyor/Taslaklar/Mevzuat/Denetim).
   usePipeline tek evrak işler; sonuçlar OTURUM GEÇMİŞİNE eklenir → Panel/Taslaklar/Denetim beslenir.
   Akış: Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç geçmişe → Panel'de özet.
   Eski açık-tema App.jsx korunur (geri dönüş: main.jsx). */
import React, { useEffect, useRef, useState } from "react";
import { usePipeline, ACCEPT } from "./lib/usePipeline.js";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { PAL, SANS, MONO, SR_ONLY, NEON_KEYFRAMES } from "./components/neonUi.jsx";
import NeonSidebar from "./components/NeonSidebar.jsx";
import CanliAjanAkisi from "./components/CanliAjanAkisi.jsx";
import PanelView from "./components/PanelView.jsx";
import GelenEvrakView from "./components/GelenEvrakView.jsx";
import TaslaklarView from "./components/TaslaklarView.jsx";
import MevzuatView from "./components/MevzuatView.jsx";
import DenetimView from "./components/DenetimView.jsx";

export default function DashboardApp() {
  const {
    nodes, result, busy, error, toast, fileMeta, pendingOnay, evrakText, downloading,
    runFile, runSample, resume, download, showToast, dismissError, canRetry, retry,
  } = usePipeline();

  const [activeView, setActiveView] = useState("panel");
  const [history, setHistory] = useState([]);
  const [processedIds, setProcessedIds] = useState(() => new Set());
  const fileRef = useRef(null);
  const lastResultRef = useRef(null);

  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const riskOutcome = data?.risk_metadata?.bant || "yesil";
  const draftCount = history.filter((h) => h.result?.yazi_taslak_md).length;
  const inboxCount = Math.max(0, SAMPLE_DOCS.length - processedIds.size);

  // Sonuç kesinleşince oturum geçmişine ekle (Panel/Taslaklar/Denetim/Mevzuat bundan beslenir).
  useEffect(() => {
    if (result && result !== lastResultRef.current) {
      lastResultRef.current = result;
      const name = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
      setHistory((h) => [{
        id: `${h.length}-${name}`, name, kind: fileMeta?.kind, ts: Date.now(),
        evrak_turu: result.evrak_turu, hedef_birim: result.hedef_birim,
        bant: result.risk_metadata?.bant, result,
      }, ...h]);
    }
  }, [result, fileMeta]);

  const goView = (v) => setActiveView(v);
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const triggerUpload = () => { setActiveView("isleniyor"); if (!busy) fileRef.current?.click(); };
  const processSample = (s) => { setProcessedIds((p) => new Set(p).add(s.id)); setActiveView("isleniyor"); if (!busy) runSample(s); };

  const onApprove = () => { if (pendingOnay) resume("onayla"); else showToast("Taslak onaylandı — memur kaydı alındı."); };
  const onEdit = () => { if (pendingOnay) resume("duzenle"); else showToast("Düzenleme: taslağı indirip değiştirebilirsiniz."); };
  const onReject = () => { if (pendingOnay) resume("reddet"); else showToast("Taslak reddedildi — yeniden üretilebilir."); };

  let view;
  if (activeView === "panel") view = <PanelView history={history} inboxCount={inboxCount} onGoInbox={() => goView("gelen")} onUpload={triggerUpload} />;
  else if (activeView === "gelen") view = <GelenEvrakView samples={SAMPLE_DOCS} processedIds={processedIds} onProcess={processSample} onUpload={triggerUpload} busy={busy} />;
  else if (activeView === "taslaklar") view = <TaslaklarView history={history} onGoInbox={() => goView("gelen")} />;
  else if (activeView === "mevzuat") view = <MevzuatView history={history} />;
  else if (activeView === "denetim") view = <DenetimView history={history} onGoInbox={() => goView("gelen")} />;
  else view = (
    <CanliAjanAkisi
      nodes={nodes} result={data} busy={busy} started={started}
      riskOutcome={riskOutcome} fileMeta={fileMeta} pendingOnay={pendingOnay}
      onApprove={onApprove} onEdit={onEdit} onReject={onReject}
      onDownload={download} downloading={downloading} canDownload={!!evrakText}
      onUpload={triggerUpload} onGoInbox={() => goView("gelen")}
    />
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: PAL.bg, color: PAL.ink, fontFamily: SANS }}>
      <style>{NEON_KEYFRAMES}</style>
      <a href="#nu-main" style={{ position: "absolute", left: -9999, top: 0, zIndex: 100, background: "#2ee6c9", color: "#06121a", padding: "8px 14px", borderRadius: "0 0 8px 0", fontWeight: 700 }} onFocus={(e) => (e.currentTarget.style.left = "0")} onBlur={(e) => (e.currentTarget.style.left = "-9999px")}>Ana içeriğe geç</a>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} tabIndex={-1} aria-hidden="true" />

      <NeonSidebar activeView={activeView} onNavigate={goView} onUpload={triggerUpload} samples={SAMPLE_DOCS} onPickSample={processSample} busy={busy} inboxCount={inboxCount} draftCount={draftCount} />

      <main id="nu-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {view}
      </main>

      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{toast}</div>
      {toast && <Toast msg={toast} />}
      {error && !busy && <ErrorBar msg={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />}
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#18203a", color: "#eaf0fb", border: "1px solid rgba(255,255,255,.14)", padding: "11px 18px", borderRadius: 12, boxShadow: "0 18px 50px -10px rgba(0,0,0,.6)", fontFamily: SANS, fontSize: 13.5, fontWeight: 500 }}>{msg}</div>
  );
}

function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  return (
    <div role="alert" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "center", gap: 14, background: "#3a1616", color: "#fca5a5", border: "1px solid rgba(248,113,113,.45)", padding: "12px 16px", borderRadius: 12, boxShadow: "0 18px 50px -10px rgba(0,0,0,.6)", fontFamily: SANS, fontSize: 13 }}>
      <span>⚠ {msg}</span>
      {canRetry && <button onClick={onRetry} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.5)", background: "rgba(248,113,113,.12)", color: "#fca5a5", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}>Tekrar dene</button>}
      <button onClick={onDismiss} aria-label="Kapat" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#cdd6e8", fontFamily: "inherit", fontSize: 12.5 }}>✕</button>
    </div>
  );
}
