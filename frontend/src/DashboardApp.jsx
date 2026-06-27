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
import GidenEvrakView from "./components/GidenEvrakView.jsx";
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
  const [outbox, setOutbox] = useState([]);
  const fileRef = useRef(null);
  const lastResultRef = useRef(null);
  const pendingApprovalRef = useRef(null);   // HITL kararı damgası (resume async)
  const sentRef = useRef(new Set());          // aynı sonuç iki kez gönderilmesin

  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const riskOutcome = data?.risk_metadata?.bant || "yesil";
  const draftCount = history.filter((h) => h.result?.yazi_taslak_md).length;
  const inboxCount = Math.max(0, SAMPLE_DOCS.length - processedIds.size);
  const gidenCount = outbox.filter((o) => o.durum === "gonderildi").length;

  // Onaylanan/gönderilen evrakı Giden Evrak'a yaz (durum: gonderildi|duzenlendi|reddedildi).
  // Aynı sonuç iki kez gönderilmez (sentRef). SHA frontend'de üretilmez — backend son_hash taşınır.
  const pushOutbox = (res, fm, secim) => {
    if (!res || sentRef.current.has(res)) return false;
    sentRef.current.add(res);
    const name = fm?.kind === "sample" ? (fm.label || fm.name) : (fm?.name || "evrak");
    const durum = secim === "reddet" ? "reddedildi" : secim === "duzenle" ? "duzenlendi" : "gonderildi";
    setOutbox((o) => [{
      id: `E-G-${new Date().getFullYear()}/${String(o.length + 1).padStart(4, "0")}`,
      kaynak_evrak_adi: name, gonderim_tarihi: Date.now(),
      evrak_turu: res.evrak_turu, tur: res.yazi_turu,
      konu: res.bilgi_unsurlari?.konu || res.alt_talepler?.[0]?.ozet || "—",
      alici_birim: res.hedef_birim, risk: res.risk_metadata?.bant || "yesil",
      durum, taslak: res.yazi_taslak_md || "",
      memor_adi: "M. Yılmaz", memor_unvan: "Yetkili memur",
      ...(res.denetim_izi?.son_hash ? { son_hash: res.denetim_izi.son_hash } : {}),
    }, ...o]);
    return true;
  };

  // Sonuç kesinleşince oturum geçmişine ekle (Panel/Taslaklar/Denetim/Mevzuat bundan beslenir).
  // HITL kararı damgalanmışsa (resume sonrası) Giden Evrak kaydını burada kur (resume async).
  useEffect(() => {
    if (result && result !== lastResultRef.current) {
      lastResultRef.current = result;
      const name = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
      setHistory((h) => [{
        id: `${h.length}-${name}`, name, kind: fileMeta?.kind, ts: Date.now(),
        evrak_turu: result.evrak_turu, hedef_birim: result.hedef_birim,
        bant: result.risk_metadata?.bant, result,
      }, ...h]);
      const pa = pendingApprovalRef.current;
      if (pa) {
        pendingApprovalRef.current = null;
        pushOutbox(result, fileMeta, pa.secim);
        showToast(pa.secim === "reddet" ? "Reddedildi — Giden Evrak'a kaydedildi." : "Evrak gönderildi — Giden Evrak'a eklendi.");
      }
    }
  }, [result, fileMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const goView = (v) => setActiveView(v);
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const triggerUpload = () => { setActiveView("isleniyor"); if (!busy) fileRef.current?.click(); };
  const processSample = (s) => { setProcessedIds((p) => new Set(p).add(s.id)); setActiveView("isleniyor"); if (!busy) runSample(s); };

  // HITL açık → kararı damgala + resume (outbox kaydı result-effect'te). HITL kapalı → mevcut
  // sonuçtan senkron Giden Evrak kaydı (onayla/reddet; düzenle yalnız bilgilendirir).
  const onApprove = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "onayla", fileMeta }; resume("onayla"); }
    else if (pushOutbox(result, fileMeta, "onayla")) { showToast("Evrak onaylandı — Giden Evrak'a gönderildi."); setActiveView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onReject = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "reddet", fileMeta }; resume("reddet"); }
    else if (pushOutbox(result, fileMeta, "reddet")) { showToast("Reddedildi — Giden Evrak'a kaydedildi (denetim izi)."); setActiveView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onEdit = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "duzenle", fileMeta }; resume("duzenle"); }
    else showToast("Düzenleme: taslağı PDF/DOCX indirip değiştirebilirsiniz.");
  };
  const onResend = () => showToast("Tekrar gönderme üretim entegrasyonunda etkinleşir.");

  let view;
  if (activeView === "panel") view = <PanelView history={history} outbox={outbox} inboxCount={inboxCount} onGoInbox={() => goView("gelen")} onUpload={triggerUpload} />;
  else if (activeView === "gelen") view = <GelenEvrakView samples={SAMPLE_DOCS} processedIds={processedIds} onProcess={processSample} onUpload={triggerUpload} busy={busy} />;
  else if (activeView === "giden") view = <GidenEvrakView outbox={outbox} onUpload={triggerUpload} onGoInbox={() => goView("gelen")} onResend={onResend} />;
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

      <NeonSidebar activeView={activeView} onNavigate={goView} onUpload={triggerUpload} samples={SAMPLE_DOCS} onPickSample={processSample} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} />

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
