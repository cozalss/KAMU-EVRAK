/* DashboardApp — kamu-evrak dark çalışma alanı (Canlı Ajan Akışı).
   Sidebar + TopBar + İşleniyor görünümü (Kaynak Belge ↔ Ajan İzi · Çıkarılan Veri · Terminal Log).
   Tüm pipeline mantığı usePipeline hook'unda; bu bileşen yerleşim + görünüm anahtarlama.
   Eski açık-tema App.jsx dokunulmaz (geri dönüş için korunur). */
import React, { useRef, useState } from "react";
import { usePipeline, ACCEPT, MAX_UPLOAD_MB } from "./lib/usePipeline.js";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { Icon } from "./components/icons.jsx";
import { OnayPaneli } from "./components/result-cards.jsx";
import { Sidebar } from "./dashboard/Sidebar.jsx";
import { TopBar } from "./dashboard/TopBar.jsx";
import { SourceDocPanel } from "./dashboard/SourceDocPanel.jsx";
import { AgentTracePanel } from "./dashboard/AgentTracePanel.jsx";
import { TerminalLog } from "./dashboard/TerminalLog.jsx";
import { ExtractedDataPanel } from "./dashboard/ExtractedDataPanel.jsx";
import { StubViews } from "./dashboard/StubViews.jsx";

const slugifyGrup = (g) => g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SAMPLE_GROUPS = (() => {
  const order = []; const byGroup = new Map();
  for (const s of SAMPLE_DOCS) {
    const grup = s.grup || "Örnekler";
    if (!byGroup.has(grup)) { byGroup.set(grup, []); order.push(grup); }
    byGroup.get(grup).push(s);
  }
  return order.map((grup) => ({ grup, slug: slugifyGrup(grup), items: byGroup.get(grup) }));
})();

export default function DashboardApp() {
  const pipe = usePipeline();
  const {
    nodes, result, busy, error, toast, selectedSample, fileMeta, evrakText, downloading, pendingOnay,
    runFile, runSample, resume, retry, download, showToast, dismissError, canRetry,
  } = pipe;

  const [activeView, setActiveView] = useState("isleniyor");
  const [showSamples, setShowSamples] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const verifyData = nodes.find((n) => n.id === "verify")?.data;
  const started = busy || !!result || !!error || !!pendingOnay;

  const navigate = (v) => setActiveView(v);
  const triggerUpload = () => { setActiveView("isleniyor"); if (!busy) fileRef.current?.click(); };
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) runFile(f); };
  const pickSample = (s) => { setActiveView("isleniyor"); if (!busy) runSample(s); };

  return (
    <div className="ke-dash">
      <a href="#dash-main" className="dash-skip">Ana içeriğe geç</a>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} tabIndex={-1} aria-hidden="true" />

      <div className="dash-layout">
        <Sidebar activeView={activeView} onNavigate={navigate} onUpload={triggerUpload} busy={busy} />

        <div className="dash-shell">
          <TopBar fileMeta={fileMeta} result={result} nodes={nodes} busy={busy} error={error} pendingOnay={pendingOnay} />

          <main id="dash-main" className="dash-main">
            {activeView !== "isleniyor" ? (
              <StubViews view={activeView} result={result} onNavigate={navigate} />
            ) : !started ? (
              <EmptyState
                busy={busy} dragOver={dragOver} setDragOver={setDragOver}
                fileRef={fileRef} onDrop={onDrop}
                showSamples={showSamples} setShowSamples={setShowSamples}
                selectedSample={selectedSample} onPickSample={pickSample}
              />
            ) : (
              <div className="dash-work">
                {error && !busy && (
                  <ErrorBanner error={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />
                )}

                <div className="dash-grid">
                  <SourceDocPanel result={result || pendingOnay} evrakText={evrakText} busy={busy} />
                  <AgentTracePanel nodes={nodes} busy={busy} />
                </div>

                {pendingOnay && !result && (
                  <OnayPaneli data={pendingOnay} onResume={resume} busy={busy} />
                )}
                {busy && !result && !pendingOnay && <DashSkeleton />}
                {result && (
                  <ExtractedDataPanel
                    result={result} verify={verifyData}
                    onDownload={download} downloading={downloading}
                    canDownload={!!evrakText} onToast={showToast}
                  />
                )}

                <TerminalLog nodes={nodes} fileMeta={fileMeta} busy={busy} />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ekran-okuyucu + görsel toast */}
      <div className="dash-sr" role="status" aria-live="polite" aria-atomic="true">{toast}</div>
      {toast && <div className="dash-toast" aria-hidden="true">{toast}</div>}
    </div>
  );
}

/* ---------------- Empty state (upload hero + örnek toggle) ---------------- */
function EmptyState({ busy, dragOver, setDragOver, fileRef, onDrop, showSamples, setShowSamples, selectedSample, onPickSample }) {
  return (
    <div className="dash-empty">
      <div
        className={"dash-drop" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
        role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy}
        aria-label="Evrak dosyası yükle — tıkla veya sürükle bırak (PDF, görsel, Word)"
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <span className="dash-drop-ic" aria-hidden="true"><Icon.upload /></span>
        <span className="dash-drop-main">Evrakı buraya sürükle veya tıkla</span>
        <span className="dash-drop-sub">PDF · JPG/PNG · TIFF · Word (.docx) — en fazla {MAX_UPLOAD_MB} MB</span>
        <span className="dash-drop-hint"><Icon.shieldCheck aria-hidden="true" /> OCR + sınıflandırma otomatik başlar · kişisel veri maskelenir</span>
      </div>

      <div className="dash-try">
        <button
          type="button" className="dash-try-toggle"
          onClick={() => setShowSamples((v) => !v)}
          aria-expanded={showSamples} aria-controls="dash-samples-panel"
        >
          <Icon.search aria-hidden="true" />
          <span>Dosyanız yok mu? <strong>{SAMPLE_DOCS.length} örnek evrakla deneyin</strong></span>
          <span className={"dash-try-chev" + (showSamples ? " open" : "")} aria-hidden="true"><Icon.arrowRight /></span>
        </button>
        {showSamples && (
          <div id="dash-samples-panel" className="dash-samples" aria-label="Örnek evraklar">
            {SAMPLE_GROUPS.map(({ grup, slug, items }) => (
              <div className="dash-sample-group" key={grup}>
                <p id={`dash-grup-${slug}`} className="dash-sample-grup-h">{grup}</p>
                <div className="dash-samples-row" role="group" aria-labelledby={`dash-grup-${slug}`}>
                  {items.map((s) => {
                    const SampleIcon = Icon[s.icon] || Icon.file;
                    return (
                      <button
                        key={s.id} type="button"
                        className={"dash-sample" + (selectedSample === s.id ? " active" : "")}
                        onClick={() => onPickSample(s)} disabled={busy}
                        aria-pressed={selectedSample === s.id}
                      >
                        <span className="dash-sample-ic" aria-hidden="true"><SampleIcon /></span>
                        <span className="dash-sample-tx">
                          <span className="dash-sample-label">{s.label}</span>
                          <span className="dash-sample-desc">{s.aciklama}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Error banner ---------------- */
function ErrorBanner({ error, canRetry, onRetry, onDismiss }) {
  return (
    <div className="dash-error" role="alert" aria-atomic="true">
      <span className="dash-error-ic" aria-hidden="true"><Icon.alert /></span>
      <div className="dash-error-tx">
        <strong>İşlem tamamlanamadı.</strong>
        <span>{error}</span>
        <span>Geçici bir aksaklık olabilir. <strong>Tekrar dene</strong>’yi kullanın ya da bir örnek evrakla deneyin.</span>
      </div>
      <div className="dash-error-act">
        {canRetry && (
          <button type="button" className="dash-btn" onClick={onRetry}>
            <Icon.refresh aria-hidden="true" /> Tekrar dene
          </button>
        )}
        <button type="button" className="dash-btn dash-btn-icon" onClick={onDismiss} aria-label="Hata bildirimini kapat">
          <Icon.close aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Skeleton (dark) ---------------- */
function DashSkeleton() {
  return (
    <div className="dash-skel" aria-hidden="true">
      <div className="dash-skel-card">
        <span className="dash-skel-line w70" /><span className="dash-skel-line w90" /><span className="dash-skel-line w50" />
      </div>
      <div className="dash-skel-card">
        <span className="dash-skel-line w40" /><span className="dash-skel-line w90" /><span className="dash-skel-line w70" />
      </div>
    </div>
  );
}
