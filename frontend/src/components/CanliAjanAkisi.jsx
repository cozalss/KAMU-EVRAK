/* CanliAjanAkisi — "İşleniyor" görünümü (canlı komuta merkezi ana içeriği).
   SADECE gerçek veri: nodes (canlı SSE/JSON) + ProcessResponse. Sahte demo auto-animasyon YOK —
   evrak işlenmiyorsa anlamlı boş durum ("Gelen Evrak'tan seçin veya yükleyin").
   Sidebar kabuğu DashboardApp'te; bu bileşen <main> içine yerleşir.
   Üst-bar (dosya meta + ilerleme) + 3-panel: SOL kaynak belge + ajan izi ↔ ORTA ayrıntılı
   sonuç (NeonDetay gömülü; koşum sürerken bekleme durumu) ↔ SAĞ çıkarılan/risk/taslak+HITL. */
import { lazy, Suspense, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, BIRIM_LBL, cleanDemoText } from "./result-cards.jsx";
import NeonDetay from "./NeonDetay.jsx";
import HataSiniri from "./HataSiniri.jsx";
import { MONO, SANS, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY, EmptyState, Btn, Icon, RiskBand } from "./neonUi.jsx";

/* ——— Evrak hattı: ajan izi, metro hat şeması dilinde ———
   Her ajan bir istasyon; Görev 1 = T hattı, Görev 2 = V hattı. Ray, adımlar tamamlandıkça
   istasyondan istasyona hat rengiyle dolar. İki hat tek kart yüzeyinde yaşar: panel genişse
   yan yana (metro şeması), darsa alt alta; Görev 2'nin başındaki kesikli parça aktarmadır
   (Görev 1 çıktısı bu hatta devreder). Düz dolgu + hairline (gradyan/glow yok); renk tek
   sinyal değil — durum her zaman işaret + metinle de verilir. Geometri: 28px oluk, ray x=13. */
const HAT = { x: 13, w: 2, merkez: 16 };

/* Oluk içi dikey ray parçası: dolu = hat rengi, boş = hairline, kesikli = aktarma. */
const Ray = ({ top, height, bottom, filled, col, dashed }) => (
  <span aria-hidden="true" style={dashed
    ? { position: "absolute", left: HAT.x, width: 0, top, height, bottom, borderLeft: `2px dashed ${PAL.lineHi}` }
    : { position: "absolute", left: HAT.x, width: HAT.w, top, height, bottom, background: filled ? col : PAL.line, transition: "background .3s ease-out" }} />
);

/* İstasyon işareti — dolu disk (bitti/hata) · halka (çalışıyor) · ara durak (sırada, ray arkadan geçer). */
function HatDurak({ st, col }) {
  const orta = { position: "absolute", left: 0, width: 28, display: "flex", justifyContent: "center" };
  if (st === "pending") return <span aria-hidden="true" style={{ ...orta, top: 11 }}><span style={{ width: 10, height: 10, borderRadius: RAD.dot, background: PAL.bg, border: `1px solid ${PAL.lineHi}` }} /></span>;
  if (st === "active") return (
    <span aria-hidden="true" style={{ ...orta, top: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: RAD.dot, background: PAL.bg, border: `2px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 6, height: 6, borderRadius: RAD.dot, background: col, animation: "nu-think 1.1s ease-in-out infinite" }} />
      </span>
    </span>
  );
  const Ic = st === "error" ? Icon.x : Icon.check;
  return (
    <span aria-hidden="true" style={{ ...orta, top: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: RAD.dot, background: st === "error" ? BANT.kirmizi.c : col, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ic width={10} height={10} />
      </span>
    </span>
  );
}

/* Hat başlığı — terminal roundeli (hat no) + görev adı + ince ayraç + adım sayısı ve hat süresi.
   devir: Görev 2 hattının başındaki kesikli giriş (Görev 1 çıktısı bu hatta devreder).
   girisAktif: ilk istasyona girildi. */
function HatTerminal({ n, col, count, sure, devir, girisAktif, glow }) {
  const pt = devir ? SP.m : 0;
  return (
    <div style={{ position: "relative", padding: `${pt}px 0 ${SP.s}px`, animation: glow ? "nu-rise .18s ease-out both" : "none" }}>
      {devir && <Ray top={0} height={pt + 2} dashed />}
      <Ray top={pt + 22} bottom={0} filled={girisAktif} col={col} />
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, height: 24 }}>
        <span style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span aria-hidden="true" style={{ position: "relative", width: 20, height: 20, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 12, lineHeight: "20px", fontWeight: 600, textAlign: "center", ...TNUM }}>{n}</span>
        </span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0 }}>{n === 2 ? "Görev 2 · Üret" : "Görev 1 · Anla"}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
        <span style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0, ...TNUM }}>{count} adım{sure ? ` · ${sure}` : ""}</span>
      </div>
    </div>
  );
}

/* Tek istasyon satırı — oluk (ray + durak) + içerik (ad · süre · sıra no · çıktı özeti). */
function HatIstasyon({ a, i, col, risk, hasTop, topFill, hasBot, glow }) {
  const done = a.status === "done", active = a.status === "active", err = a.status === "error";
  const durakCol = a.id === "risk_guard" && done ? risk.c : col;
  const ms = a.t1 - a.t0;
  const sure = done && Number.isFinite(ms) && ms >= 50 ? `${(ms / 1000).toFixed(1)}s` : null;
  const altYazi = done ? (a.out || "tamamlandı") : active ? (a.desc || "çalışıyor…") : err ? "hata · adım başarısız" : (a.desc || "—");
  const altRenk = err ? DERIN.kirmizi : done ? (a.id === "risk_guard" ? DERIN_OF(risk.c) : PAL.mut) : active ? PAL.mut : PAL.mut2;
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "28px 1fr", gap: SP.m, padding: "6px 8px 6px 0", borderRadius: RAD.ctl, background: active ? ALFA(col) : "transparent", transition: "background .25s ease-out", animation: glow ? `nu-rise .18s ease-out ${Math.min(i * 28, 420)}ms both` : "none" }}>
      <div style={{ position: "relative", minHeight: 40 }}>
        {hasTop && <Ray top={0} height={HAT.merkez} filled={topFill} col={col} />}
        {hasBot && <Ray top={HAT.merkez} bottom={0} filled={done} col={col} />}
        <HatDurak st={a.status} col={durakCol} />
      </div>
      <div style={{ minWidth: 0, opacity: a.status === "pending" ? 0.55 : 1, transition: "opacity .2s ease-out" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span style={{ ...TYPE.ui, fontWeight: 500, color: active ? PAL.ink : done ? PAL.ink2 : PAL.mut2, transition: "color .15s ease-out", minWidth: 0 }}>{a.label}</span>
          {active ? (
            <span aria-hidden="true" style={{ marginLeft: "auto", ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0, animation: glow ? "nu-think 1.2s ease-in-out infinite" : "none" }}>işleniyor</span>
          ) : (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: SP.s, flexShrink: 0, fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut3, ...TNUM }}>
              {sure && <span>{sure}</span>}
              <span style={{ opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, ...TYPE.data, color: altRenk, animation: active && glow ? "nu-think 1.3s ease-in-out infinite" : "none" }}>{altYazi}</div>
      </div>
    </div>
  );
}

/* Hat sonu — son istasyondan çıkan kısa ray + terminüs çubuğu (hat tamamlanınca dolar). */
const HatSon = ({ col, done }) => (
  <div aria-hidden="true" style={{ position: "relative", height: 12 }}>
    <Ray top={0} height={6} filled={done} col={col} />
    <span style={{ position: "absolute", top: 6, left: HAT.x - 4, width: 10, height: 4, borderRadius: RAD.chip, background: done ? col : PAL.lineHi, transition: "background .3s ease-out" }} />
  </div>
);

/* Tek hat (görev fazı) — terminal başlığı + istasyonlar + terminüs. Kart içindeki grid geniş
   panelde iki hattı yan yana koyar (metro şeması), darda alt alta yığar. Terminüs, hattın
   kendi istasyonları bitince dolar (Görev 1 hattı, Görev 2'yi beklemez); istasyon numarası
   global sıradır (01–16) — iki hat tek koşumun parçaları. */
function HatFaz({ n, items, risk, glow }) {
  const col = n === 2 ? V : T;
  const ms = items.reduce((s, a) => (a.status === "done" && Number.isFinite(a.t1 - a.t0) ? s + (a.t1 - a.t0) : s), 0);
  const sure = ms >= 100 ? `${ms < 10000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)}s` : null;
  return (
    <div style={{ minWidth: 0 }}>
      <HatTerminal n={n} col={col} count={items.length} sure={sure} devir={n === 2}
        girisAktif={items[0]?.status !== "pending"} glow={glow} />
      {items.map((a, j) => (
        <HatIstasyon key={a.id} a={a} i={a.sira} col={col} risk={risk} hasTop={j > 0}
          topFill={j > 0 && items[j - 1].status === "done"} hasBot glow={glow} />
      ))}
      <HatSon col={col} done={items.length > 0 && items.every((a) => a.status === "done")} />
    </div>
  );
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

/* Boş durum + sürükle-bırak (react-dropzone): dosya bu alana bırakılınca doğrudan işleme
   başlar; tıklama davranışı butonlarda kalır (noClick — yanlışlıkla dosya seçici açılmaz).
   Kabul edilen türler backend ACCEPT listesiyle birebir. */
const DROP_KABUL = {
  "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"], "image/tiff": [".tiff"], "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function BosDurumDropzone({ onGoInbox, onUpload, onFileDrop }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, noClick: true, noKeyboard: true, accept: DROP_KABUL,
    onDrop: (kabul) => { if (kabul?.[0]) onFileDrop(kabul[0]); },
  });
  return (
    <div {...getRootProps()} style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100vh - 1px)", padding: "0 24px", outline: "none", border: `2px dashed ${isDragActive ? T : "transparent"}`, background: isDragActive ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      <input {...getInputProps()} aria-hidden="true" />
      <EmptyState
        icon={<Icon.spin />}
        title={isDragActive ? "Bırakın — işleme başlasın" : "İşlenecek evrak seçilmedi"}
        sub={isDragActive
          ? "PDF, görsel (PNG/JPG/WEBP/TIFF), DOCX veya TXT kabul edilir."
          : "Gelen Evrak kuyruğundan bir evrak seçin, yeni bir belge yükleyin ya da dosyayı bu alana sürükleyip bırakın. Seçtiğiniz evrak burada uçtan-uca, canlı olarak işlenir."}
        actions={[
          <Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen Evrak'ı aç</Btn>,
          <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
        ]}
      />
    </div>
  );
}

/* Kaynak belge paneli — PDF yüklendiyse gerçek sayfa görüntüsü (react-pdf, tembel yüklenir,
   ana bundle büyümez) ile çıkarım-vurgulu metin arasında sekme; PDF yoksa eski davranış
   birebir. Kendi hook'ları kendi gövdesinde (CanliAjanAkisi'nin erken-dönüş deseni bozulmaz). */
const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

function KaynakBelge({ fileUrl, segs, busy, glow }) {
  const [sekme, setSekme] = useState("belge");
  const pdfGoster = !!fileUrl && (sekme === "belge" || !segs);
  const SekmeBtn = ({ id, label }) => (
    <button type="button" onClick={() => setSekme(id)} aria-pressed={sekme === id} {...focusRing}
      style={{ cursor: "pointer", padding: "2px 10px", borderRadius: RAD.chip, border: `1px solid ${sekme === id ? T : PAL.line}`, background: sekme === id ? ALFA(T) : PAL.surf, color: sekme === id ? DERIN.T : PAL.mut2, ...TYPE.meta, fontWeight: 500, transition: "background .12s ease-out" }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: PAL.mut2, flex: 1 }}>Kaynak belge</span>
        {fileUrl && segs && (<><SekmeBtn id="belge" label="Belge" /><SekmeBtn id="metin" label="Metin" /></>)}
      </div>
      <div style={{ position: "relative", borderRadius: RAD.card, overflow: "hidden", background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, minHeight: 300, aspectRatio: (segs || fileUrl) ? "auto" : "1 / 1.34" }}>
        {pdfGoster ? (
          <Suspense fallback={<div style={{ padding: SP.l, ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
            <PdfOnizleme fileUrl={fileUrl} />
          </Suspense>
        ) : segs ? (
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
  );
}

export default function CanliAjanAkisi({
  nodes = [], result = null, busy = false, started = false,
  riskOutcome = "yesil", fileMeta = null, pendingOnay = null,
  onApprove = () => {}, onEdit = () => {}, onReject = () => {},
  onDownload = () => {}, downloading = "", canDownload = false,
  onUpload = () => {}, onGoInbox = () => {}, glow = true, fileUrl = "", onFileDrop = () => {},
}) {
  // EVRAK İŞLENMİYOR → anlamlı boş durum (sahte demo yok) + sürükle-bırak yükleme alanı.
  if (!started) {
    return <BosDurumDropzone onGoInbox={onGoInbox} onUpload={onUpload} onFileDrop={onFileDrop} />;
  }

  const risk = BANT[riskOutcome] || BANT.yesil;
  const display = nodes.map((n, i) => ({
    id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
    out: summarize(n.id, n.data), desc: n.desc || "", t0: n.t0, t1: n.t1, sira: i,
  }));
  const gorevler = [...new Set(display.map((a) => a.gorev))];
  const total = display.length || 1;
  const doneCount = display.filter((a) => a.status === "done").length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = !busy && doneCount >= total;
  // Uçtan-uca gerçek koşum süresi (usePipeline t0/t1 damgaları; yoksa sessizce gizlenir).
  const toplamSn = (() => {
    if (!allDone) return null;
    const t0s = display.map((a) => a.t0).filter(Number.isFinite);
    const t1s = display.map((a) => a.t1).filter(Number.isFinite);
    if (!t0s.length || !t1s.length) return null;
    const sn = (Math.max(...t1s) - Math.min(...t0s)) / 1000;
    return sn >= 0.1 ? `${sn < 10 ? sn.toFixed(1) : Math.round(sn)} sn` : null;
  })();
  const statusText = busy ? "İşleniyor · " + String(doneCount).padStart(2, "0") + "/" + total : (allDone ? "Tamamlandı" : "Sırada");

  const drivenFields = useMemo(() => (result ? buildDrivenFields(result, risk) : null), [result, risk]);
  const km = result?.kanit_metadata;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const draftMd = result?.yazi_taslak_md;
  const lit = display.find((a) => a.id === "risk_guard")?.status === "done";
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  const metaLine = buildMetaLine(result, fileMeta);
  // Panel kartları (ajan izi + sağ sütun) — düz beyaz yüzey + 1px hairline (border-first), NeonCard ile tutarlı.
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

      {/* 3 panel — komuta merkezi. flex-wrap: geniş ekranda yan yana (kaynak+iz · ayrıntılı
          sonuç · çıktı), dar ekranda paneller alt alta düşer → yatay taşma yok. */}
      <section style={{ minHeight: "calc(100vh - 132px)" }}>
        <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap" }}>

          {/* Sol sütun — kaynak belge + altında ajan izi (dar sütunda hatlar dikey yığılır) */}
          <div style={{ flex: "1 1 320px", minWidth: 0, borderRight: `1px solid ${PAL.line}`, padding: SP.l, display: "flex", flexDirection: "column", gap: SP.l }}>
            <KaynakBelge fileUrl={fileUrl} segs={segs} busy={busy} glow={glow} />

            {/* Ajan izi — evrak hattı kartı: Görev 1 (T) ve Görev 2 (V) hatları; kart başlığında canlı telemetri */}
            <section aria-label="Ajan izi" style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.l, flexWrap: "wrap" }}>
                <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.route /></span>
                <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Ajan izi</h3>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut, ...TNUM, flexShrink: 0 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : (allDone ? BANT.yesil.c : PAL.mut2), animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
                  {busy ? "Canlı" : (allDone ? "Tamam" : "Beklemede")} · {String(doneCount).padStart(2, "0")}/{total} · %{pct}{toplamSn ? ` · ${toplamSn}` : ""}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", columnGap: SP.xl, rowGap: SP.s }}>
                {gorevler.map((g) => (
                  <HatFaz key={g} n={g} items={display.filter((a) => a.gorev === g)} risk={risk} glow={glow} />
                ))}
              </div>
            </section>
          </div>

          {/* Orta panel — ayrıntılı sonuç (tüm ajan çıktıları); koşum sürerken bekleme durumu */}
          <div style={{ flex: "99 1 480px", minWidth: 0, padding: "16px 24px" }}>
            {result ? (
              <HataSiniri baslik="Ayrıntılı sonuç gösterilemedi">
                <NeonDetay embedded result={result} onDownload={onDownload} downloading={downloading} canDownload={canDownload} />
              </HataSiniri>
            ) : (
              <div style={{ ...card, minHeight: 320, display: "flex" }}>
                <EmptyState
                  icon={busy ? <Icon.spin /> : <Icon.doc />}
                  title={busy ? "Ayrıntılı sonuç hazırlanıyor" : "Ayrıntılı sonuç burada görünecek"}
                  sub={busy
                    ? "Ajanlar çalışıyor — koşum bitince Görev 1 (anlama) ve Görev 2 (üretim) çıktılarının tamamı burada açılır."
                    : "Evrak işlenmeye başlayınca tüm ajan çıktıları bu panelde toplanır."}
                />
              </div>
            )}
          </div>

          {/* Sağ panel: çıkarılan veri + risk + taslak + HITL */}
          <div style={{ flex: "1 1 330px", minWidth: 0, borderLeft: `1px solid ${PAL.line}`, padding: SP.l, display: "flex", flexDirection: "column", gap: SP.l }}>
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
    </>
  );
}
