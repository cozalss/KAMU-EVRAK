/* DashboardApp — kamu-evrak neon komuta merkezi (CanliAjanAkisi) sarmalayıcısı.
   usePipeline (tüm SSE/JSON/HITL/indirme mantığı) → CanliAjanAkisi görünümüne gerçek veri besler.
   Dosya girişi + örnek seçimi + HITL onay + toast/hata burada; görsel tamamen CanliAjanAkisi'nde.
   Eski açık-tema App.jsx korunur (geri dönüş: main.jsx). */
import React, { useRef } from "react";
import { usePipeline, ACCEPT } from "./lib/usePipeline.js";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import CanliAjanAkisi from "./components/CanliAjanAkisi.jsx";

export default function DashboardApp() {
  const {
    nodes, result, busy, error, toast, fileMeta, pendingOnay,
    runFile, runSample, resume, showToast, dismissError, canRetry, retry,
  } = usePipeline();

  const fileRef = useRef(null);
  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const riskOutcome = data?.risk_metadata?.bant || "yesil";

  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const triggerUpload = () => { if (!busy) fileRef.current?.click(); };

  // HITL: gerçek onay-bekliyorsa pipeline'ı sürdür; aksi halde (HITL kapalı) bilgilendir.
  const onApprove = () => { if (pendingOnay) resume("onayla"); else showToast("Taslak onaylandı — memur kaydı alındı."); };
  const onEdit = () => { if (pendingOnay) resume("duzenle"); else showToast("Düzenleme: taslağı indirip değiştirebilirsiniz."); };
  const onReject = () => { if (pendingOnay) resume("reddet"); else showToast("Taslak reddedildi — yeniden üretilebilir."); };

  return (
    <>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} tabIndex={-1} aria-hidden="true" />

      <CanliAjanAkisi
        nodes={nodes}
        result={data}
        busy={busy}
        started={started}
        riskOutcome={riskOutcome}
        fileMeta={fileMeta}
        samples={SAMPLE_DOCS}
        onUpload={triggerUpload}
        onPickSample={(s) => !busy && runSample(s)}
        onApprove={onApprove}
        onEdit={onEdit}
        onReject={onReject}
        pendingOnay={pendingOnay}
      />

      {/* SR canlı bölge + görsel toast */}
      <div style={srOnly} role="status" aria-live="polite" aria-atomic="true">{toast}</div>
      {toast && <Toast msg={toast} />}
      {error && !busy && <ErrorBar msg={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />}
    </>
  );
}

const srOnly = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#18203a", color: "#eaf0fb", border: "1px solid rgba(255,255,255,.14)", padding: "11px 18px", borderRadius: 12, boxShadow: "0 18px 50px -10px rgba(0,0,0,.6)", fontFamily: "'Space Grotesk',system-ui,sans-serif", fontSize: 13.5, fontWeight: 500 }} aria-hidden="true">
      {msg}
    </div>
  );
}

function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  return (
    <div role="alert" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "center", gap: 14, background: "#3a1616", color: "#fca5a5", border: "1px solid rgba(248,113,113,.45)", padding: "12px 16px", borderRadius: 12, boxShadow: "0 18px 50px -10px rgba(0,0,0,.6)", fontFamily: "'Space Grotesk',system-ui,sans-serif", fontSize: 13 }}>
      <span>⚠ {msg}</span>
      {canRetry && <button onClick={onRetry} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.5)", background: "rgba(248,113,113,.12)", color: "#fca5a5", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}>Tekrar dene</button>}
      <button onClick={onDismiss} aria-label="Kapat" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#cdd6e8", fontFamily: "inherit", fontSize: 12.5 }}>✕</button>
    </div>
  );
}
