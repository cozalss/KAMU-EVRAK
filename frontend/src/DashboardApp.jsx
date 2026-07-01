/* DashboardApp — kamu-evrak neon çalışma alanı kabuğu + oturum kurgusu.
   Sidebar (işlevsel nav) + görünüm anahtarlama (Panel/Gelen/İşleniyor/Taslaklar/Mevzuat/Denetim).
   usePipeline tek evrak işler; sonuçlar OTURUM GEÇMİŞİNE eklenir → Panel/Taslaklar/Denetim beslenir.
   Akış: Gelen Evrak'tan seç (veya yükle) → İşleniyor (canlı) → sonuç geçmişe → Panel'de özet.
   Eski açık-tema App.jsx korunur (geri dönüş: main.jsx). */
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePipeline, ACCEPT } from "./lib/usePipeline.js";
import { apiGet, apiPost, cachedDashboard } from "./lib/authApi.js";
import { useAuth } from "./lib/useAuth.jsx";
import { SAMPLE_DOCS } from "./lib/sampleDocs.js";
import { PAL, T, SANS, MONO, SR_ONLY, NEON_KEYFRAMES } from "./components/neonUi.jsx";
import NeonSidebar from "./components/NeonSidebar.jsx";
// PanelView VARSAYILAN açılış görünümü → EAGER: her refresh'te lazy chunk beklemesi
// ("yükleniyor…" flash) yaşanmasın, panel anında görünsün. Bağımlılıkları (neonUi +
// result-cards) zaten usePipeline→nodeMeta zinciriyle ana bundle'da olduğundan ilk yük
// indirmesine pratikte ağırlık eklemez.
import PanelView from "./components/PanelView.jsx";
// Diğer görünümler TEMBEL yüklenir (kod bölme) → ilk yük bundle'ı küçülür; görünümler birebir
// aynı kalır, yalnız ilgili görünüme ilk geçişte küçük bir chunk indirilir. NeonSidebar
// her zaman görünür (nav) olduğundan eager kalır.
const CanliAjanAkisi = lazy(() => import("./components/CanliAjanAkisi.jsx"));
const GelenEvrakView = lazy(() => import("./components/GelenEvrakView.jsx"));
const GidenEvrakView = lazy(() => import("./components/GidenEvrakView.jsx"));
const TaslaklarView = lazy(() => import("./components/TaslaklarView.jsx"));
const MevzuatView = lazy(() => import("./components/MevzuatView.jsx"));
const DenetimView = lazy(() => import("./components/DenetimView.jsx"));

// DB geçmişinden taslak listesi türet (yazi_taslak_md olanlar). Hem açılış hidrasyonunda
// hem de DB reconcile'ında aynı eşlemeyi kullan → iki yol tutarlı kalsın.
const draftsFromHistory = (items) =>
  (items || []).filter((x) => x.result?.yazi_taslak_md).map((x) => ({
    ...x,
    id: `db-taslak-${x.id}`,
    name: x.name || "Kalıcı taslak",
  }));

export default function DashboardApp() {
  const {
    nodes, result, busy, error, toast, fileMeta, pendingOnay, evrakText, downloading,
    runFile, runSample, resume, download, showToast, dismissError, canRetry, retry,
  } = usePipeline();

  const { user, logout } = useAuth();
  // Optimistik açılış: son bilinen panel verisini (history/outbox) localStorage'dan ANINDA kur
  // → refresh'te boş→dolu ("Henüz evrak işlenmedi") flash'ı yok. Arka plandaki DB fetch (aşağıdaki
  // effect) uzak Supabase'ten tazeleyip günceller; değişince persist effect önbelleği yeniler.
  const [cachedDash] = useState(() => cachedDashboard.get(user?.id));
  const [activeView, setActiveView] = useState("panel");
  const [history, setHistory] = useState(() => cachedDash?.history || []);
  const [processedIds, setProcessedIds] = useState(() => new Set());
  // Onaylanıp/reddedilip Giden Evrak'a düşen örnekler (id) → artık işlenmiş VE gitmiş
  // sayılır, Gelen Evrak kuyruğunda görünmez ("Düzenle" ile taslağa alınanlar hariç,
  // onlar henüz gönderilmediği için kuyrukta kalır).
  const [sentSampleIds, setSentSampleIds] = useState(() => new Set());
  const [outbox, setOutbox] = useState(() => cachedDash?.outbox || []);
  const [drafts, setDrafts] = useState(() => draftsFromHistory(cachedDash?.history));   // DB/önbellek taslakları + "Düzenle" ile eklenenler
  const fileRef = useRef(null);
  const lastResultRef = useRef(null);
  const pendingApprovalRef = useRef(null);   // HITL kararı damgası (resume async)
  const sentRef = useRef(new Set());          // aynı sonuç iki kez gönderilmesin
  const draftedRef = useRef(new Set());       // aynı sonuç iki kez taslağa eklenmesin

  const started = busy || !!result || !!error || !!pendingOnay;
  const data = result || pendingOnay;
  const riskOutcome = data?.risk_metadata?.bant || "yesil";
  const draftCount = drafts.length;
  const inboxCount = Math.max(0, SAMPLE_DOCS.length - sentSampleIds.size);
  const gidenCount = outbox.filter((o) => o.durum === "gonderildi").length;

  // Onaylanan/gönderilen evrakı Giden Evrak'a yaz (durum: gonderildi|duzenlendi|reddedildi).
  // Aynı sonuç iki kez gönderilmez (sentRef). SHA frontend'de üretilmez — backend son_hash taşınır.
  const pushOutbox = (res, fm, secim) => {
    if (!res || sentRef.current.has(res)) return false;
    sentRef.current.add(res);
    if (fm?.kind === "sample" && fm.id) setSentSampleIds((s) => new Set(s).add(fm.id));
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
      // Liste zenginleştirme (kategori filtresi + satır): güven / evrak tarihi / SLA durumu.
      guven: typeof res.tur_confidence === "number" ? res.tur_confidence : null,
      evrak_tarihi: res.bilgi_unsurlari?.tarih || "",
      sla_durum: res.sla_metadata?.durum || "",
      ...(res.denetim_izi?.son_hash ? { son_hash: res.denetim_izi.son_hash } : {}),
    }, ...o]);
    return true;
  };

  // "Düzenle" → taslağı Taslaklar kuyruğuna ekle (YALNIZ kullanıcı Düzenle dediğinde;
  // aynı sonuç iki kez eklenmez). Taslak yoksa (yazi_taslak_md boş) eklenmez.
  const pushDraft = (res, fm) => {
    if (!res || !res.yazi_taslak_md || draftedRef.current.has(res)) return false;
    draftedRef.current.add(res);
    const name = fm?.kind === "sample" ? (fm.label || fm.name) : (fm?.name || "evrak");
    setDrafts((d) => [{
      id: `T-${Date.now()}-${d.length}-${name}`, name, kind: fm?.kind, ts: Date.now(),
      evrak_turu: res.evrak_turu, hedef_birim: res.hedef_birim,
      bant: res.risk_metadata?.bant, result: res,
    }, ...d]);
    return true;
  };

  const persistDecision = useCallback(async (res, secim) => {
    if (!res?.islem_id || secim === "duzenle") return;
    try {
      await apiPost(`/islem/${encodeURIComponent(res.islem_id)}/onayla`, { secim });
    } catch (err) {
      console.warn("Onay/giden evrak DB'ye yazılamadı", err);
      showToast("Evrak oturumda görünüyor; DB onay kaydı yazılamadı.");
    }
  }, [showToast]);

  // Sayfa yenilendiğinde kalıcı DB geçmişini yeniden kur. Pipeline sonucu yine canlı state'e
  // eklenir; bu yükleme yalnız açılışta DB'den son kayıtları geri getirir.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet("/islemler?limit=100");
        if (cancelled) return;
        const items = Array.isArray(data?.kayitlar) ? data.kayitlar : [];
        setHistory(items);
        setDrafts(draftsFromHistory(items));
      } catch (err) {
        console.warn("Kalıcı işlem geçmişi alınamadı", err);
      }

      try {
        const data = await apiGet("/giden-evrak?limit=100");
        if (cancelled) return;
        const rows = Array.isArray(data?.kayitlar) ? data.kayitlar : [];
        setOutbox(rows.map((r) => ({
          id: r.giden_no || r.id,
          kaynak_evrak_adi: r.kaynak_evrak_adi || "Kalıcı kayıt",
          gonderim_tarihi: Date.parse(r.gonderim_tarihi || "") || Date.now(),
          evrak_turu: r.evrak_turu || "",
          tur: r.yazi_turu_kod || r.tur || "",
          konu: r.konu || "—",
          alici_birim: r.alici_birim || "",
          risk: r.risk || "yesil",
          durum: r.durum || "gonderildi",
          taslak: r.taslak || "",
          memor_adi: user.ad_soyad || "Memur",
          memor_unvan: user.unvan || "",
          son_hash: r.son_hash || "",
        })));
      } catch (err) {
        console.warn("Kalıcı giden evrak alınamadı", err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // history/outbox her değiştiğinde (DB reconcile VEYA canlı işlem sonucu eklenince) optimistik
  // önbelleği tazele → bir sonraki refresh son veriyi ANINDA gösterir. Yazma seyrek (kesikli
  // olaylar), stream sırasında tetiklenmez.
  useEffect(() => {
    if (user?.id) cachedDashboard.set(user.id, { history, outbox });
  }, [history, outbox, user]);

  // Sonuç kesinleşince oturum geçmişine ekle (Panel/Taslaklar/Denetim/Mevzuat bundan beslenir).
  // HITL kararı damgalanmışsa (resume sonrası) Giden Evrak kaydını burada kur (resume async).
  useEffect(() => {
    if (result && result !== lastResultRef.current) {
      lastResultRef.current = result;
      const name = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
      setHistory((h) => [{
        id: `${Date.now()}-${h.length}-${name}`, name, kind: fileMeta?.kind, ts: Date.now(),
        evrak_turu: result.evrak_turu, hedef_birim: result.hedef_birim,
        bant: result.risk_metadata?.bant, result,
      }, ...h]);
      const pa = pendingApprovalRef.current;
      if (pa) {
        pendingApprovalRef.current = null;
        if (pa.secim === "duzenle") {
          pushDraft(result, fileMeta);
          showToast("Taslak düzenlemeye alındı — Taslaklar'a eklendi.");
          setActiveView("taslaklar");
        } else {
          pushOutbox(result, fileMeta, pa.secim);
          persistDecision(result, pa.secim);
          showToast(pa.secim === "reddet" ? "Reddedildi — Giden Evrak'a kaydedildi." : "Evrak gönderildi — Giden Evrak'a eklendi.");
        }
      }
    }
  }, [result, fileMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  // useCallback: NeonSidebar (React.memo) için kararlı referans → akış sırasında (busy/counts
  // sabitken nodes saniyede onlarca kez değişir) sidebar gereksiz yere yeniden render olmaz.
  const goView = useCallback((v) => setActiveView(v), []);
  // Taslak düzenle (metni güncelle) / sil — Taslaklar görünümünden çağrılır.
  const updateDraft = useCallback((id, md) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, result: { ...x.result, yazi_taslak_md: md } } : x))), []);
  const deleteDraft = useCallback((id) => setDrafts((d) => d.filter((x) => x.id !== id)), []);
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runFile(f); };
  const triggerUpload = useCallback(() => { setActiveView("isleniyor"); if (!busy) fileRef.current?.click(); }, [busy]);
  const processSample = useCallback((s) => { setProcessedIds((p) => new Set(p).add(s.id)); setActiveView("isleniyor"); if (!busy) runSample(s); }, [busy, runSample]);

  // HITL açık → kararı damgala + resume (outbox kaydı result-effect'te). HITL kapalı → mevcut
  // sonuçtan senkron Giden Evrak kaydı (onayla/reddet; düzenle yalnız bilgilendirir).
  const onApprove = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "onayla", fileMeta }; resume("onayla"); }
    else if (pushOutbox(result, fileMeta, "onayla")) { persistDecision(result, "onayla"); showToast("Evrak onaylandı — Giden Evrak'a gönderildi."); setActiveView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onReject = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "reddet", fileMeta }; resume("reddet"); }
    else if (pushOutbox(result, fileMeta, "reddet")) { persistDecision(result, "reddet"); showToast("Reddedildi — Giden Evrak'a kaydedildi (denetim izi)."); setActiveView("giden"); }
    else showToast("Önce bir evrak işleyin.");
  };
  const onEdit = () => {
    if (pendingOnay) { pendingApprovalRef.current = { secim: "duzenle", fileMeta }; resume("duzenle"); }
    else if (pushDraft(result, fileMeta)) { showToast("Taslak düzenlemeye alındı — Taslaklar'a eklendi."); setActiveView("taslaklar"); }
    else showToast("Önce taslak üreten bir evrak işleyin.");
  };
  const onResend = () => showToast("Tekrar gönderme üretim entegrasyonunda etkinleşir.");

  let view;
  if (activeView === "panel") view = <PanelView history={history} outbox={outbox} inboxCount={inboxCount} onGoInbox={() => goView("gelen")} onUpload={triggerUpload} user={user} />;
  else if (activeView === "gelen") view = <GelenEvrakView samples={SAMPLE_DOCS.filter((s) => !sentSampleIds.has(s.id))} processedIds={processedIds} onProcess={processSample} onUpload={triggerUpload} busy={busy} />;
  else if (activeView === "giden") view = <GidenEvrakView outbox={outbox} onUpload={triggerUpload} onGoInbox={() => goView("gelen")} onResend={onResend} />;
  else if (activeView === "taslaklar") view = <TaslaklarView drafts={drafts} onGoInbox={() => goView("gelen")} onUpdate={updateDraft} onDelete={deleteDraft} onToast={showToast} />;
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
    <>
      <style>{NEON_KEYFRAMES}</style>

      <div style={{
        display: "flex", minHeight: "100vh", background: PAL.bg, color: PAL.ink, fontFamily: SANS,
      }}>
        <a href="#nu-main" style={{ position: "absolute", left: -9999, top: 0, zIndex: 100, background: T, color: "#fbf7f0", padding: "8px 14px", borderRadius: "0 0 8px 0", fontWeight: 700 }} onFocus={(e) => (e.currentTarget.style.left = "0")} onBlur={(e) => (e.currentTarget.style.left = "-9999px")}>Ana içeriğe geç</a>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} tabIndex={-1} aria-hidden="true" />

        <NeonSidebar activeView={activeView} onNavigate={goView} onUpload={triggerUpload} samples={SAMPLE_DOCS} onPickSample={processSample} busy={busy} inboxCount={inboxCount} draftCount={draftCount} gidenCount={gidenCount} user={user} onLogout={logout} />

        <main id="nu-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Suspense fallback={<ViewFallback />}>{view}</Suspense>
        </main>

        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{toast}</div>
        {toast && <Toast msg={toast} />}
        {error && !busy && <ErrorBar msg={error} canRetry={canRetry} onRetry={retry} onDismiss={dismissError} />}
      </div>
    </>
  );
}

// Tembel görünüm chunk'ı inerken (yalnız ilk geçişte, çok kısa) gösterilen sade, tema-uyumlu
// yer tutucu — görünüm tasarımını değiştirmez, layout çökmesini önler.
function ViewFallback() {
  return (
    <div aria-hidden="true" style={{ flex: 1, display: "grid", placeItems: "center", minHeight: "60vh", color: PAL.mut2, fontFamily: MONO, fontSize: 12, letterSpacing: ".5px" }}>
      yükleniyor…
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#2a251e", color: "#fbf7f0", border: "1px solid rgba(255,255,255,.12)", padding: "11px 18px", borderRadius: 12, boxShadow: "0 18px 44px -10px rgba(35,26,18,.5)", fontFamily: SANS, fontSize: 13.5, fontWeight: 500 }}>{msg}</div>
  );
}

function ErrorBar({ msg, canRetry, onRetry, onDismiss }) {
  return (
    <div role="alert" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "center", gap: 14, background: "#fbe4e1", color: "#a23425", border: "1px solid rgba(201,67,47,.4)", padding: "12px 16px", borderRadius: 12, boxShadow: "0 18px 44px -10px rgba(35,26,18,.3)", fontFamily: SANS, fontSize: 13 }}>
      <span>⚠ {msg}</span>
      {canRetry && <button onClick={onRetry} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(201,67,47,.45)", background: "rgba(201,67,47,.1)", color: "#a23425", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}>Tekrar dene</button>}
      <button onClick={onDismiss} aria-label="Kapat" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(35,26,18,.15)", background: "transparent", color: "#7a3a30", fontFamily: "inherit", fontSize: 12.5 }}>✕</button>
    </div>
  );
}
