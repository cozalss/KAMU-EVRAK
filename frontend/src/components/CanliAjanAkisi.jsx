/* CanliAjanAkisi — "İşleniyor" görünümü.
   Gerçek SSE verisini tek bir canlı işlem odağında sunar; kaynak belge her zaman yan tarafta
   erişilebilir. İşlem bittiğinde doğrudan memur kararı için ayrıntılı sonuç ve taslağa geçer. */
import { lazy, Suspense, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { summarize } from "../lib/nodeMeta.js";
import { EVRAK_TR, cleanDemoText } from "./result-cards.jsx";
import SonucCalismaAlani from "./SonucCalismaAlani.jsx";
import AjanAdimDetay from "./AjanAdimDetay.jsx";
import HataSiniri from "./HataSiniri.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import AltTaslakKarti from "./AltTaslakKarti.jsx";
import AltTaslakPager from "./AltTaslakPager.jsx";
import { Chip } from "./NeonDetayParts.jsx";

import { MONO, T, V, PAL, BANT, DERIN, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, SR_ONLY, EmptyState, Btn, Icon, BuyutDugme } from "./neonUi.jsx";
import TurSecici from "./TurSecici.jsx";
import NumberFlow from "@number-flow/react";
/* Metro şeması + sahne bileşenleri CanliMetro.jsx'te yaşar (dosya <800 kuralı + "SAHNE Epik"
   gösteri katmanı orada belgelidir). AkisSeridi: sonuç sayfası dibindeki yatay koşum özeti. */
import { SahneAkis, SahneTelemetri, Aurora, AkisSeridi, useSahneTempo } from "./CanliMetro.jsx";

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

function BosDurumDropzone({ onGoInbox, onUpload, onFileDrop, onTelefon }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, noClick: true, noKeyboard: true, accept: DROP_KABUL,
    onDrop: (kabul) => { if (kabul?.[0]) onFileDrop(kabul[0]); },
  });
  return (
    <div {...getRootProps()} style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "calc(100vh - 1px)", padding: "0 24px", outline: "none", border: `2px dashed ${isDragActive ? T : "transparent"}`, background: isDragActive ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      <input {...getInputProps()} aria-hidden="true" />
      {/* Diğer görünümlerle aynı başlık ritmi (jüri T5: İşleniyor tek başlıksız sayfaydı). */}
      <header style={{ padding: "24px 32px 0", position: "absolute", top: 0, left: 0, right: 0 }}>
        <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>İşleniyor</h2>
        <p style={{ margin: "4px 0 0", ...TYPE.data, color: PAL.mut2 }}>Seçilen evrak burada uçtan uca canlı işlenir</p>
      </header>
      <EmptyState
        icon={<Icon.doc />}
        title={isDragActive ? "Bırakın — işleme başlasın" : "İşlenecek evrak seçilmedi"}
        sub={isDragActive
          ? "PDF, görsel (PNG/JPG/WEBP/TIFF), DOCX veya TXT kabul edilir."
          : "Gelen evrak kuyruğundan bir evrak seçin, yeni bir belge yükleyin ya da dosyayı bu alana sürükleyip bırakın."}
        actions={[
          <Btn key="g" primary onClick={onGoInbox}><Icon.inbox /> Gelen evrakı aç</Btn>,
          <Btn key="u" onClick={onUpload}><Icon.upload /> Yeni evrak yükle</Btn>,
          <Btn key="t" onClick={onTelefon}><Icon.phone /> Telefonla yükle</Btn>,
        ]}
      />
    </div>
  );
}

/* Kaynak belge paneli — PDF yüklendiyse gerçek sayfa görüntüsü (react-pdf, tembel yüklenir,
   ana bundle büyümez) ile çıkarım-vurgulu metin arasında sekme; PDF yoksa eski davranış
   birebir. Kendi hook'ları kendi gövdesinde (CanliAjanAkisi'nin erken-dönüş deseni bozulmaz). */
const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

function KaynakBelge({ fileUrl, segs, busy, glow, onBuyut, compact = false, ekAksiyon = null }) {
  const [sekme, setSekme] = useState("belge");
  const pdfGoster = !!fileUrl && (sekme === "belge" || !segs);
  // İçerik hazırsa kağıt tıklanınca A4 modal açılır; klavye/SR yolu başlıktaki BuyutDugme
  // (kağıda role=button vermek tüm belge metnini tek kontrol adına düzleştiriyordu — a11y bulgusu).
  const tiklanabilir = !!onBuyut && (!!fileUrl || !!segs);
  const SekmeBtn = ({ id, label }) => (
    <button type="button" onClick={() => setSekme(id)} aria-pressed={sekme === id} {...focusRing} data-press=""
      style={{ cursor: "pointer", padding: "2px 10px", borderRadius: RAD.chip, border: `1px solid ${sekme === id ? T : PAL.line}`, background: sekme === id ? ALFA(T) : PAL.surf, color: sekme === id ? DERIN.T : PAL.mut2, ...TYPE.meta, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
      {label}
    </button>
  );
  return (
    // A4 KART (kullanıcı isteği: kaynak belge de taslak gibi A4) — başlık şeridi + beyaz A4
    // sayfası tint "masa" üstünde; height:100% ile satırdaki diğer sütunlarla eşit boy.
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.doc /></span>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 60 }}>Okunan belge</span>
        {ekAksiyon}
        {fileUrl && segs && (<><SekmeBtn id="belge" label="Belge" /><SekmeBtn id="metin" label="Metin" /></>)}
        {tiklanabilir && <BuyutDugme onClick={onBuyut} label="Okunan belgeyi A4 görünümde büyüt" />}
      </div>
      <div style={{ flex: 1, background: PAL.surf2, padding: `${SP.m}px ${SP.s}px ${SP.m}px`, display: "flex", minHeight: 0, ...(compact ? { overflowY: "auto" } : null) }}>
        <div
          {...(tiklanabilir ? { onClick: onBuyut, title: "Büyüt (A4 görünüm)" } : {})}
          style={{ flex: 1, minWidth: 0, maxWidth: 840, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "clamp(28px,3.5vw,48px) clamp(32px,4vw,60px)", boxShadow: SH.pop, cursor: tiklanabilir ? "zoom-in" : "default", overflow: "hidden", animation: "nu-rise .16s var(--ke-ease-out) both" }}>
          {pdfGoster ? (
            <Suspense fallback={<div style={{ ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
              <PdfOnizleme fileUrl={fileUrl} />
            </Suspense>
          ) : segs ? (
            <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", animation: "nu-rise .18s var(--ke-ease-out) both" }}>
              {segs.map((sg, i) => sg.mark ? <mark key={i} style={{ background: ALFA(BANT.sari.c), color: DERIN.sari, borderRadius: RAD.chip, boxDecorationBreak: "clone" }}>{sg.t}</mark> : <span key={i}>{sg.t}</span>)}
            </pre>
          ) : (
            /* Belge iskeleti — gerçek bir yazı sayfasının düşük-kontrast önizlemesi (başlık +
               paragraf satırları); şerit şerit nefes alır (nu-think, kademeli gecikme).
               NN/g: iskelet, spinner'a göre algılanan süreyi kısaltır — yerleşimi önceden çizer. */
            <div style={{ ...TYPE.data, color: PAL.mut2 }}>
              <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: SP.s, marginBottom: SP.l }}>
                <div style={{ height: 8, width: "42%", background: PAL.press, borderRadius: RAD.chip, marginBottom: SP.xs, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
                {[96, 100, 92, 88, 100, 64].map((w, i) => (
                  <div key={i} style={{ height: 8, width: `${w}%`, background: PAL.press, borderRadius: RAD.chip, animation: busy && glow ? `nu-think 1.4s ease-in-out ${i * 140}ms infinite` : "none" }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
                {busy && <Icon.spin width={14} height={14} />}
                {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Metin işlenecek…"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CanliAjanAkisi({
  nodes = [], result = null, busy = false, started = false, runBase = 0,
  fileMeta = null, pendingOnay = null,
  onApprove = () => {}, onEdit = () => {}, onReject = () => {}, onAltKarar = () => {},
  onAltTurUret = () => null, onAltDuzenle = () => {},
  onTurSec = () => {}, turUretiliyor = "", onerilenTur = "",
  onDownload = () => {}, downloading = "", canDownload = false,
  onUpload = () => {}, onGoInbox = () => {}, onCancel = () => {}, glow = true, fileUrl = "", onFileDrop = () => {},
  onTelefon = () => {}, onMevzuatAc = null,
  onMevzuatSec = null, seciliMevzuat = [], dayanakUretiliyor = false,
}) {
  // Rules of Hooks: TÜM hook'lar KOŞULSUZ ve fonksiyonun EN başında olmalı — aşağıdaki
  // `if (!started) return` erken çıkışı bu hook'lardan SONRA gelirse `started` false→true
  // olduğunda (kullanıcı "İşle"ye basınca — demonun merkez akışı) React "Rendered more
  // hooks than during the previous render" ile ÇÖKER. Bu yüzden burada, erken return'den önce.
  // A4 belge modalı — "kaynak" | "taslak" | null (paneller tıklanınca açılır).
  const [belgeModal, setBelgeModal] = useState(null);
  // İşlem adımı detay modalı — display index'i (istasyon/nokta tıklanınca açılır).
  const [detayIdx, setDetayIdx] = useState(null);
  // Çok-konulu taslak pager konumu — pager key={runBase} ile koşuma anahtarlanır (remount
  // doğal sıfırlar; eski useEffect senkronizasyonu ref-tabanlı runBase'e örtük bağımlıydı).
  const [altIdx, setAltIdx] = useState(0);
  // Sahne animasyonları her zaman açık (kullanıcı kararı, 2026-07-16 — sayfa içi durdurma
  // düğmesi kaldırıldı); prefers-reduced-motion OS düzeyinde yine tümünü söndürür.
  const efGlow = glow;
  // Node arama tek geçişte (jüri bulgusu: render başına 4 ayrı nodes.find).
  const nodeById = useMemo(() => {
    const m = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);
  // Kaynak metin KOŞUM SIRASINDA da gösterilir: kanit_baglama SSE node verisi maskeli metni +
  // kanıt spanlarını ~4. adımda getirir (backend _node_summary) — sağ panel tüm koşum boyunca
  // iskelet beklemek zorunda değil. Sonuç gelince result.kanit_metadata (aynı nesne) devralır.
  const km = result?.kanit_metadata || nodeById.kanit_baglama?.data?.kanit_metadata || null;
  const segs = useMemo(() => (km?.metin ? buildSegments(km.metin, Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  // Sunum temposu: SSE gerçeği anında saklanır, gösterim min-dwell ile sıralanır — hızlı
  // koşumda tamamlanma vuruşları izlenebilir kalır; sonuç sahnesi sunum bitince açılır.
  const { paced, sunumTamam } = useSahneTempo(nodes, { pendingOnay, glow: efGlow });
  // Denetim zinciri arka planda üretilmeye devam eder; memurun iş akışını kalabalıklaştırmamak
  // için bu görünümde bir adım ya da panel olarak sunulmaz.
  const display = useMemo(() => paced.filter((n) => n.id !== "denetim_izi").map((n, i) => ({
    id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
    // data: SSE node yükü OLDUĞU GİBİ taşınır — adım detay modalı (AjanAdimDetay) zengin
    // görünümü bundan kurar (canlı koşumda result henüz yokken tek veri kaynağı budur).
    data: n.data || null,
    out: summarize(n.id, n.data), desc: n.desc || "", t0: n.t0, t1: n.t1, sira: i,
    // risk_guard istasyonu KENDİ bandını taşır — koşum sırasında genel sonuç bandı henüz
    // oluşmadığından node verisi tek doğru kaynak (backend ile birebir uyum).
    bant: n.data?.risk_metadata?.bant || null,
  })), [paced]);

  // EVRAK İŞLENMİYOR → anlamlı boş durum (sahte demo yok) + sürükle-bırak yükleme alanı.
  if (!started) {
    return <BosDurumDropzone onGoInbox={onGoInbox} onUpload={onUpload} onFileDrop={onFileDrop} onTelefon={onTelefon} />;
  }

  // Sonuç sahnesi sunum kuyruğu boşalınca açılır — canlı sahne son vuruşlarını oynar.
  const sonucGoster = !!result && sunumTamam;
  const total = display.length || 1;
  const doneCount = display.filter((a) => a.status === "done").length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = !busy && sunumTamam && doneCount >= total;
  const hataliAdim = display.findIndex((a) => a.status === "error");
  // Uçtan-uca gerçek koşum süresi (usePipeline t0/t1 damgaları; yoksa sessizce gizlenir).
  const toplamSn = (() => {
    if (!allDone) return null;
    const t0s = display.map((a) => a.t0).filter(Number.isFinite);
    const t1s = display.map((a) => a.t1).filter(Number.isFinite);
    if (!t0s.length || !t1s.length) return null;
    const sn = (Math.max(...t1s) - Math.min(...t0s)) / 1000;
    return sn >= 0.1 ? `${sn < 10 ? sn.toFixed(1) : Math.round(sn)} sn` : null;
  })();
  // Sunum kuyruğu boşalana dek sahne "canlı"dır (busy SSE done'la erken düşer — çip
  // drenaj sırasında "Hazır" diyordu, Playwright kanıtı). Hata dalı dahil; sayaç tek
  // sözlükte — adım sayısı yalnız sahnede ("İşlem aşamaları"), % yalnız ilerleme çubuğunda.
  const kosumda = busy || (!!result && !sunumTamam);
  const statusText = hataliAdim >= 0 && !kosumda
    ? `İşlem hatası · ${hataliAdim + 1}. adımda durdu`
    : kosumda ? "İşleniyor" : (allDone ? "İşlem tamamlandı" : "Hazır");
  const chipRenk = hataliAdim >= 0 && !kosumda ? BANT.kirmizi.c : allDone ? BANT.yesil.c : kosumda ? T : PAL.mut2;

  const draftMd = result?.yazi_taslak_md;
  // Çok-konulu evrakta birim başına ayrı üst yazı taslağı — her biri kendi HITL kararını taşır.
  // Her karta ORİJİNAL 1-tabanlı sira'yı ekle: backend /alt-talep/{sira}/onayla, alt_talep'in
  // TAM listedeki (result.alt_talepler) konumunu bekler. Aşağıda yazi_taslak_md'siz olanlar
  // filtrelenir; filtrelenmiş index'i sira olarak göndermek (eski hata) bir önceki alt_talep
  // taslaksızsa sira'yı kaydırıp kararı YANLIŞ birime işliyordu (workflow bulgusu).
  const altTaslaklar = (result?.alt_talepler || [])
    .map((a, i) => ({ a, sira: i + 1 }))
    .filter((x) => x.a?.yazi_taslak_md);
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  // Başlık meta satırı koşum SIRASINDA da dolar: tür 2. adımda (siniflandir), sayfa/OCR güveni
  // 1. adımda (oku) SSE ile gelir — sonuç beklenmez, bulgular geldikçe başlığa işlenir.
  const canliMeta = result || {
    evrak_turu: nodeById.siniflandir?.data?.evrak_turu,
    page_count: nodeById.oku?.data?.page_count,
    ocr_confidence: nodeById.oku?.data?.ocr_confidence,
  };
  const metaLine = buildMetaLine(canliMeta, fileMeta);
  // Panel kartları — düz beyaz yüzey + 1px hairline (border-first), NeonCard ile tutarlı.
  const card = { position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: SP.l, boxShadow: SH.card };

  return (
    <>
      {/* SR: canlı ilerleme */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {(() => {
          if (hataliAdim >= 0 && !kosumda) return `İşlem hatası — ${display[hataliAdim].label} adımı başarısız oldu. Üst çubuktan yeniden deneyebilirsiniz.`;
          const ai = display.findIndex((a) => a.status === "active");
          if (ai >= 0) return `${display[ai].label} çalışıyor — adım ${ai + 1} / ${total}`;
          if (allDone) return `İşlem tamamlandı — ${total} işlem adımı başarıyla yürütüldü.`;
          return "";
        })()}
      </div>

      {/* Üst durum çubuğu */}
      <header style={{ padding: "16px 24px", borderBottom: `1px solid ${PAL.line}`, background: PAL.bg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: PAL.mut }}>
              <Icon.doc width={18} height={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: "18px", color: PAL.ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{fileLabel}</h2>
              <span style={{ display: "block", marginTop: 2, ...TYPE.meta, color: PAL.mut2 }}>{metaLine}</span>
            </span>
            {!sonucGoster && <span style={{ marginLeft: SP.s, flexShrink: 0 }}>
              <Chip c={chipRenk} label={`Durum: ${statusText}`}>
                {hataliAdim >= 0 && !kosumda ? <Icon.alert width={12} height={12} />
                  : allDone ? <Icon.check width={12} height={12} />
                  : kosumda ? <Icon.spin width={12} height={12} />
                  : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: PAL.mut2 }} />}
                {statusText}
              </Chip>
            </span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m }}>
            {!sonucGoster && <span style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: T }} />Görev 1 · Anla
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: V, marginLeft: SP.xs }} />Görev 2 · Üret
            </span>}
            {!sonucGoster && <span aria-hidden="true" style={{ width: 1, height: 20, background: PAL.line, flexShrink: 0 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
              {/* İptal — yalnız canlı koşumda: SSE akışını keser, boş duruma döner
                  ("Tekrar dene" ErrorBar yerine sessiz iptal; lastRun durduğundan aynı evrak
                  yeniden başlatılabilir). Düşük-vurgu ghost: yanlışlıkla basılmasın. */}
              {busy && (
                <button onClick={onCancel} aria-label="İşlemi iptal et" {...focusRing} data-press=""
                  title="İşlemi iptal et"
                  onMouseEnter={(e) => { e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "8px 12px", borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: DERIN.kirmizi, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
                  <Icon.x width={13} height={13} /> İptal
                </button>
              )}
              {/* Evrak yükleme (dosya + telefon) eylemleri BURADA YOK: ikisi de sidebar'da
                  kalıcı olarak duruyor ("Yeni evrak yükle" / "Örnek evrakla dene") ve boş
                  durumda dropzone zaten sunuyor. Aynı eylemi başlıkta tekrarlamak gürültüydü.
                  İptal kalır — akışa özgü, başka yerde karşılığı yok. */}
            </div>
          </div>
        </div>
        {!sonucGoster && <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.m }}>
          {/* Dolum scaleX (compositor); glow overflow'da kırpıldığından kaldırıldı (jüri: ölü efekt). */}
          <div aria-hidden="true" style={{ flex: 1, height: 6, borderRadius: RAD.chip, background: PAL.press, overflow: "hidden" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: RAD.chip, background: allDone ? BANT.yesil.c : T, transformOrigin: "left", transform: `scaleX(${pct / 100})`, transition: "transform .28s var(--ke-ease-out), background .2s ease" }} />
          </div>
          <span style={{ ...TYPE.data, fontWeight: 500, color: PAL.ink2, flexShrink: 0, minWidth: 38, textAlign: "right", ...TNUM }}><NumberFlow value={pct} spinTiming={{ duration: 250 }} />%</span>
        </div>}
      </header>

      {/* İşlem merkezi: canlı durumda kaynak belgeyle yan yana, sonuçta karar yüzeyiyle devam eder. */}
      {(() => {
        // Sunum kuyruğu boşalana dek sahne "canlı" görünür (busy SSE'yle erken düşer).
        const sahneCanli = kosumda;
        const islemKart = (
          <section aria-label="İşlem durumu" style={{
            ...card,
            width: "100%",
            minHeight: 440,
            padding: "clamp(20px, 3vw, 32px)",
          }}>
            {/* Epik sahne zemini: kartın arkasında yavaş gezinen aurora; içerik üstte
                (position:relative) — okunabilirlik etkilenmez, reduced-motion'da durur. */}
            {sahneCanli && efGlow && <Aurora />}
            <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: SP.m, flexWrap: "wrap", marginBottom: SP.xl }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T, paddingTop: 4 }}><Icon.sparkle /></span>
              <div style={{ minWidth: 180, flex: "1 1 260px" }}>
                <h3 style={{ margin: 0, ...TYPE.h2, color: PAL.ink }}>
                  {sahneCanli ? "Belgeniz dikkatle inceleniyor" : "Belge incelemeye hazır"}
                </h3>
                <p style={{ margin: "6px 0 0", ...TYPE.data, color: PAL.mut, maxWidth: 620 }}>
                  Sistem gerekli bilgileri çıkarıyor, ilgili kontrolleri tamamlıyor ve memur incelemesi için hazırlıyor.
                </p>
              </div>
              <SahneTelemetri busy={sahneCanli} allDone={allDone} toplamSn={toplamSn} runBase={runBase} glow={efGlow} />
            </div>
            <SahneAkis display={display} total={total} glow={efGlow} runBase={runBase} onDetay={setDetayIdx} />
            <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.xl, paddingTop: SP.m, borderTop: `1px solid ${PAL.line}`, ...TYPE.meta, color: PAL.mut2 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: sahneCanli ? T : BANT.yesil.c, animation: sahneCanli && efGlow ? "nu-think 1.3s ease-in-out infinite" : "none" }} />
              Her satır bir işlem aşamasıdır; ayrıntısını görmek için üzerine tıklayın.
            </div>
            </div>
          </section>
        );
        // Resmî yazı taslağı + HITL kararı = Görev 2 (üretim) çıktısı. Tek yerde tanımlanır;
        // SONUÇ sonrası MERKEZE (ayrıntılı sonucun/Görev 2'nin ALTINA) yerleşir, koşum sırasında
        // sağ sütunda "üretiliyor" olarak kalır. Sağ sütun sonuç gelince tümüyle kaldırılır.
        const taslakBlok = !result ? null : (
          <>
            {altTaslaklar.length < 2 && (
              <div className="sc-draft-card" style={{ ...card, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                {/* Başlık şeridi — ikon + başlık · tür seçici (dropdown, ikincil) · A4 büyüt.
                    Tür artık başlıkta metin değil; dropdown'da (belge ile ağırlıkta yarışmaz). */}
                <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
                  <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.V }}><Icon.doc /></span>
                  <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 120 }}>Resmî yazı taslağı</span>
                  {draftMd && (
                    <TurSecici secili={result?.yazi_turu} onerilen={onerilenTur}
                      uretilen={turUretiliyor} onSec={onTurSec} />
                  )}
                  {draftMd && <BuyutDugme onClick={() => setBelgeModal("taslak")} label="Resmî yazı taslağını A4 görünümde büyüt" />}
                </div>
                {/* Kağıt tezgahı — beyaz A4 sayfası tint "masa" üstünde yüzer, ortalı, gerçek A4
                    oranında (~800px) okunur kolon. Belge = kartın TEK yükseltilmiş katmanı (SH.pop);
                    başlık/seçici/footer düz kalır → hiyerarşi net, belge kahraman. */}
                <div className="sc-document-stage" style={{ background: PAL.surf2 }}>
                  {draftMd ? (
                    <div className="sc-document-paper" title="Büyüt (A4 görünüm)"
                      onClick={() => setBelgeModal("taslak")}
                      style={{ maxWidth: 860, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "clamp(28px,3.5vw,48px) clamp(32px,4vw,60px)", boxShadow: SH.pop, cursor: "zoom-in", animation: "nu-rise .16s var(--ke-ease-out) both", opacity: (turUretiliyor || dayanakUretiliyor) ? 0.55 : 1, transition: "opacity .15s ease-out" }}>
                      <pre style={{ ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{cleanDemoText(draftMd)}</pre>
                    </div>
                  ) : (
                    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: SP.s, justifyContent: "center", ...TYPE.data, color: PAL.mut2, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.card, padding: SP.xxl, background: PAL.surf }}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: RAD.dot, background: PAL.mut2, animation: "nu-think 1.2s ease-in-out infinite" }} />
                      Taslak, "Yazı Taslağı" adımında üretilecek…
                    </div>
                  )}
                </div>
                {/* HITL karar footer — belge kolonuyla hizalı (max 800, ortalı). Tek primary
                    (Onayla ve gönder, sağda); Düzenle secondary; Reddet SOLDA düşük-vurgu (ghost)
                    → sonuçlu eylem onaydan uzak (NN/g: consequential ≠ benign yan yana). */}
                <div className="sc-decision-footer" style={{ borderTop: `1px solid ${PAL.line}` }}>
                  <div style={{ maxWidth: 800, margin: "0 auto" }}>
                  <div className="sc-action-row">
                    <button onClick={onReject} disabled={!decisionReady} aria-label="Taslağı reddet" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 14px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: decisionReady ? DERIN.kirmizi : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.x /> Reddet</button>
                    <span className="sc-action-spacer" />
                    <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 16px", minHeight: 42, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.edit /> Düzenle</button>
                    <button onClick={onApprove} disabled={!decisionReady} aria-label="Taslağı onayla ve gönder" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.Th; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = DERIN.T; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 20px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", ...TYPE.ui, fontWeight: 600, color: decisionReady ? PAL.onAccent : PAL.mut2, background: decisionReady ? DERIN.T : PAL.press, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.send /> Onayla ve gönder</button>
                  </div>
                  </div>
                </div>
              </div>
            )}
            {/* Tek-taslak pager (2026-07-15: kullanıcı isteği — grid uzun dikey scroll
                yaratıyordu; sonra: kartın üstünde ayrı bir şerit/ok satırı kaynak belge ve hüküm
                kartıyla HİZAYI bozuyordu). Ok butonları artık AltTaslakKarti'nin KENDİ başlık
                satırında yaşar (üstte ayrı satır yok) → kartın dış kutusu diğer iki kolonla aynı
                y'de başlar. Her kart mounted kalır (AltTaslakPager içinde display:none), onay/red
                rozeti navigasyonda kaybolmaz. Tek alt-talep varsa pager gereksiz — doğrudan kart basılır. */}
            {altTaslaklar.length >= 2 ? (
              <AltTaslakPager key={runBase} altTaslaklar={altTaslaklar} idx={altIdx} onIdx={setAltIdx}
                onTurUret={onAltTurUret} onKarar={onAltKarar} onDuzenle={onAltDuzenle} />
            ) : (
              altTaslaklar.map(({ a, sira }, i) => (
                <AltTaslakKarti key={sira} altTalep={a} sira={i + 1}
                  onTurUret={(tur) => onAltTurUret(a, tur)}
                  onOnaylaGonder={(metin, tur) => onAltKarar(a, metin, "onayla", sira, tur)}
                  onReddet={(metin, tur) => onAltKarar(a, metin, "reddet", sira, tur)}
                  onDuzenle={(metin, tur) => onAltDuzenle(a, metin, tur, sira)} />
              ))
            )}
          </>
        );
        // "Satır gibi" ajan akışı — koşumun yatay kompakt özeti; sonuç sayfasının EN ALTINA
        // yerleşir (kullanıcı isteği, 2026-07-16). Noktalar adım detay modalını açar.
        const akisOzet = (
          /* Üst kartla arasında nefes payı (marginTop) + sağda sabit chatbot balonu şeridin
             son noktalarını örtmesin diye iç sağ pay + altta balon yüksekliği kadar boşluk. */
          <section aria-label="Ajan akışı" style={{ ...card, marginTop: SP.xl, marginBottom: SP.xxl }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.m }}>
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.route /></span>
              <h3 style={{ margin: 0, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Ajan akışı</h3>
              <span style={{ marginLeft: "auto", ...TYPE.meta, color: PAL.mut, ...TNUM }}>{total} adım{toplamSn ? ` · ${toplamSn}` : ""}</span>
            </div>
            {/* Tek satır, kaydırma yok (kullanıcı isteği) — hücreler esner, adlar 2 satıra
                sarar; sağda sabit chatbot balonu için küçük pay. */}
            <div style={{ paddingRight: SP.xl }}>
              <AkisSeridi display={display} onDetay={setDetayIdx} />
            </div>
          </section>
        );
        return (
          <section style={{ minHeight: sonucGoster ? undefined : "calc(100vh - 132px)" }}>
            {sonucGoster ? (
              /* Sonuç: panel sayfanın içinde kalır; yalnız taslak/bilgi/kontrol düğmeleri
                 kendi popup pencerelerini açar. */
              <div className="sc-result-page">
                <HataSiniri baslik="Sonuç ekranı gösterilemedi">
                  <SonucCalismaAlani result={result} onMevzuatAc={onMevzuatAc}
                    onMevzuatSec={onMevzuatSec} seciliMevzuat={seciliMevzuat}
                    solPanel={<KaynakBelge fileUrl={fileUrl} segs={segs} busy={busy} glow={efGlow} compact onBuyut={() => setBelgeModal("kaynak")} />}
                    yanTaslak={taslakBlok} altAkis={akisOzet} />
                </HataSiniri>
              </div>
            ) : (
              /* Canlı işlem: tek odak noktası solda, kaynak belge yan tarafta her zaman
                 erişilebilir. HataSiniri: bozuk SSE verisi jüri karşısında beyaz ekran
                 bırakmasın (demo sigortası — sonuç dalıyla simetrik). */
              <HataSiniri baslik="Canlı işlem sahnesi gösterilemedi">
              <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: SP.l, padding: "24px clamp(16px, 3vw, 40px) 40px", maxWidth: 1540, margin: "0 auto" }}>
                <div style={{ flex: "2 1 640px", minWidth: 0, display: "flex" }}>
                  {islemKart}
                </div>
                <aside aria-label="Kaynak belge" style={{ flex: "1 1 340px", minWidth: 0, display: "flex" }}>
                  <KaynakBelge fileUrl={fileUrl} segs={segs} busy={busy} glow={efGlow} onBuyut={() => setBelgeModal("kaynak")} />
                </aside>
              </div>
              </HataSiniri>
            )}
          </section>
        );
      })()}

      {/* İşlem adımı detayı — istasyon/nokta tıklanınca; ←/→ ile adımlar arasında
          gezinilir. Koşum CANLI sürerken de açılabilir (içerik node bittikçe dolar). */}
      {detayIdx != null && display[detayIdx] && (
        <AjanAdimDetay idx={detayIdx} display={display} result={result}
          onKapat={() => setDetayIdx(null)} onGit={setDetayIdx} />
      )}

      {/* A4 belge modalları — kaynak belge (maskeli metin / gerçek PDF sayfası) + resmî yazı
          taslağı (PDF/DOCX indirme kısayollu). Tetikleyiciler: panel tıklaması / büyüt düğmesi. */}
      <BelgeModal acik={belgeModal === "kaynak"} baslik="Kaynak belge" dosyaAdi={fileLabel} mono
        metin={km?.metin || ""} segmentler={segs} fileUrl={fileUrl} onKapat={() => setBelgeModal(null)} />
      <BelgeModal acik={belgeModal === "taslak"} baslik="Resmî yazı taslağı" dosyaAdi={fileLabel}
        metin={draftMd ? cleanDemoText(draftMd) : ""} onKapat={() => setBelgeModal(null)}
        eylemler={draftMd ? (
          <>
            <ScrimDugme onClick={() => onDownload("pdf")} disabled={!canDownload || downloading === "pdf"} title="Resmî yazıyı PDF indir">
              {downloading === "pdf" ? "indiriliyor…" : "PDF indir"}
            </ScrimDugme>
            <ScrimDugme onClick={() => onDownload("docx")} disabled={!canDownload || downloading === "docx"} title="Resmî yazıyı DOCX indir">
              {downloading === "docx" ? "indiriliyor…" : "DOCX"}
            </ScrimDugme>
          </>
        ) : null} />
    </>
  );
}
