/* CanliAjanAkisi — "İşleniyor" görünümü.
   Gerçek SSE verisini tek bir canlı işlem odağında sunar; kaynak belge her zaman yan tarafta
   erişilebilir. İşlem bittiğinde doğrudan memur kararı için ayrıntılı sonuç ve taslağa geçer. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useDropzone } from "react-dropzone";
import { summarize } from "../lib/nodeMeta.js";
import { gorevFaz, motorEtiketi } from "../lib/pipelinePhases.js";
import { akanMetin } from "../lib/metinAkis.js";
import { katmanGruplari, gerekmediMi, kostuMu, kesimSirasi } from "../lib/akisKatman.js";
import { EVRAK_TR, cleanDemoText } from "./result-cards.jsx";
import SonucCalismaAlani from "./SonucCalismaAlani.jsx";
import AjanAdimDetay from "./AjanAdimDetay.jsx";
import HataSiniri from "./HataSiniri.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import AltTaslakKarti from "./AltTaslakKarti.jsx";
import A4Belge from "./A4Belge.jsx";
import HukumMuhru from "./HukumMuhru.jsx";
import AltTaslakPager from "./AltTaslakPager.jsx";
import { Chip } from "./NeonDetayParts.jsx";
import { ParlaKenar } from "./gorsel.jsx";
import AjanOrb from "./AjanOrb.jsx";
import { adimDurumu } from "../lib/akisKatman.js";

import { T, V, PAL, BANT, DERIN, ALFA, CAM, TYPE, TNUM, RAD, SP, SH, MONO, focusRing, SR_ONLY, EmptyState, Btn, Icon, BuyutDugme, Damga, ViewWrap } from "./neonUi.jsx";
import TurSecici from "./TurSecici.jsx";
import NumberFlow from "@number-flow/react";
/* Metro şeması + sahne bileşenleri CanliMetro.jsx'te yaşar (dosya <800 kuralı + "SAHNE Epik"
   gösteri katmanı orada belgelidir). AkisSeridi: sonuç sayfası dibindeki yatay koşum özeti. */
import { SahneAkis, SahneTelemetri, AkisSeridi, useSahneTempo, MerkezKart, merkezIndeksi, eszamanliMasalar, IsaretCetveli, SAHNE_CSS } from "./CanliMetro.jsx";

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
    <div {...getRootProps()} style={{ position: "relative", outline: "none", border: `2px dashed ${isDragActive ? T : "transparent"}`, background: isDragActive ? ALFA(T) : "transparent", transition: "background .15s ease-out, border-color .15s ease-out" }}>
      <input {...getInputProps()} aria-hidden="true" />
      {/* Diğer görünümlerle AYNI antet (ViewWrap: künye satırı + geniş başlık + çift çizgi).
          Eskiden yalnız bu görünüm küçük h2'li "başlıksız" sayfaydı; iptal sonrası da buraya
          dönüldüğünden kimliği tutarsız kalıyordu. */}
      <ViewWrap id="isleniyor-h" title="İşleniyor" kunye="Canlı işlem masası" sub="Seçilen evrak burada uçtan uca, adım adım canlı işlenir.">
      <div style={{ minHeight: "calc(100vh - 340px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
      </ViewWrap>
    </div>
  );
}

/* Kaynak belge paneli — PDF yüklendiyse gerçek sayfa görüntüsü (react-pdf, tembel yüklenir,
   ana bundle büyümez) ile çıkarım-vurgulu metin arasında sekme; PDF yoksa eski davranış
   birebir. Kendi hook'ları kendi gövdesinde (CanliAjanAkisi'nin erken-dönüş deseni bozulmaz). */
const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

function KaynakBelge({ fileUrl, segs, busy, glow, onBuyut, compact = false, ekAksiyon = null, canli = false, havale = null }) {
  const [sekme, setSekme] = useState("belge");
  /* Kaynak metin UI okuma tipografisinde (TYPE.read, 16px) kalır. Bir kez ters yön denendi —
     kâğıdın ölçeğine indirilip taslakla eşitlendi — ve metin okunamayacak kadar küçüldü
     (2026-08-11). Eşitlik kâğıdı BÜYÜTEREK sağlanır (A4Belge sigdir="genislik"), küçülterek
     değil: bu panel okunmak için var. */
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
    <div data-kd="kaynak-kart" style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.doc /></span>
        <span style={{ ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 60 }}>Okunan belge</span>
        {ekAksiyon}
        {fileUrl && segs && (<><SekmeBtn id="belge" label="Belge" /><SekmeBtn id="metin" label="Metin" /></>)}
        {tiklanabilir && <BuyutDugme onClick={onBuyut} label="Okunan belgeyi A4 görünümde büyüt" />}
      </div>
      <div data-kd="kaynak-masa" style={{ flex: 1, background: PAL.surf2, padding: `${SP.m}px ${SP.s}px ${SP.m}px`, display: "flex", minHeight: 0, ...(compact ? { overflowY: "auto" } : null) }}>
        <div data-kd="kaynak-kagit"
          {...(tiklanabilir ? { onClick: onBuyut, title: "Büyüt (A4 görünüm)" } : {})}
          style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 840, margin: "0 auto", background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, padding: "clamp(24px,3.5vw,48px) clamp(20px,4vw,60px)", boxShadow: SH.pop, cursor: tiklanabilir ? "zoom-in" : "default", overflow: "hidden", animation: "nu-rise .16s var(--ke-ease-out) both" }}>
          {/* OKUMA ÇİZGİSİ — koşum sürerken sayfanın üstünden dibine tükenmez mavisi bir tarayıcı
              çizgisi iner (yalnız transform; reduced-motion'da .ke-e-tarayici gizlenir). Belge
              okunuyor/işleniyor olgusunun görsel karşılığı; koşum bitince kalkar. */}
          {/* Yalnız metin HENÜZ yokken (okuma sürüyor): tur-4'te ışın metin geldikten sonra da
              iniyor ve okunan satırları kesiyordu. Metin belirince okuma bitmiştir — ışın söner. */}
          {canli && busy && !segs && !pdfGoster && (
            <span aria-hidden="true" className="ke-e-tarayici" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, background: `linear-gradient(180deg, transparent calc(100% - 110px), color-mix(in srgb, ${T} 11%, transparent) calc(100% - 2px), ${T} calc(100% - 2px))`, animation: "ke-e-tara 2.8s cubic-bezier(.45,0,.55,1) infinite" }} />
          )}
          {/* HAVALE ÖNERİSİ — birim yönlendirme adımı GERÇEKTEN çalışıp bir birim önerdiğinde,
              memurun kenar notu gibi sayfanın üstüne düşer. "Öneri"dir, otomatik havale DEĞİL
              (CLAUDE.md §5) — damga değil, tükenmez kalem notu. */}
          {canli && havale && (
            <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", marginBottom: SP.l, paddingBottom: SP.s, animation: "nu-rise .3s var(--ke-ease-out) both" }}>
              <span style={{ ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>Havale önerisi</span>
              <span style={{ position: "relative", ...TYPE.ui, fontWeight: 600, color: DERIN.T }}>
                → {havale}
                <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 2, background: T, borderRadius: 2, transformOrigin: "left", animation: "ke-e-cizgi .6s var(--ke-ease-out) .25s both" }} />
              </span>
            </div>
          )}
          {pdfGoster ? (
            <Suspense fallback={<div style={{ ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
              <PdfOnizleme fileUrl={fileUrl} />
            </Suspense>
          ) : segs ? (
            <pre style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", animation: "nu-rise .18s var(--ke-ease-out) both" }}>
              {/* Fosfor kalem: kanıt spanları canlı koşumda soldan sağa sırayla boyanır (çıkarım
                  "şimdi" işaretleniyor); sonuç ekranında statik. */}
              {(() => { let m = 0; return segs.map((sg, i) => sg.mark ? (
                <mark key={i} data-kd="alan-vurgu" style={{ background: "none", backgroundImage: `linear-gradient(color-mix(in srgb, ${BANT.sari.c} 24%, transparent), color-mix(in srgb, ${BANT.sari.c} 24%, transparent))`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", color: DERIN.sari, borderRadius: 3, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", animation: canli ? `ke-e-fosfor .55s var(--ke-ease-out) ${Math.min(m++ * 140, 800)}ms both` : "none" }}>{sg.t}</mark>
              ) : <span key={i}>{sg.t}</span>); })()}
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
                {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Bu koşumda kaynak metin alınamadı."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CanliAjanAkisi({
  nodes = [], katmanlar = null, result = null, busy = false, started = false, runBase = 0,
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
  // Çok-konulu taslak pager konumu. DİKKAT: pager'ın key={runBase} remount'u yalnız pager'ı
  // sıfırlar — altIdx BU bileşenin state'i ve CanliAjanAkisi key'siz mount'lu; yeni koşumda
  // sıfırlanmayınca pager eski konumdan (örn. 3/3) açılıyordu (bug avı bulgusu) → effect'le sıfırla.
  const [altIdx, setAltIdx] = useState(0);
  useEffect(() => { setAltIdx(0); }, [runBase]);
  // Kararın mühürlenmesi — onay/ret anında taslak kartının kenarında tek turluk ışık.
  // Ürünün doruk anı burası ve kart ekranda KALIYOR (gönderim başka görünüme navigasyon
  // yapmaz), yani efekt gerçekten görülüyor. Yeni koşumda sıfırlanır, yoksa bir sonraki
  // belge daha karar verilmeden mühürlü açılırdı.
  const [kararMuhru, setKararMuhru] = useState(null);   // null | "onay" | "ret"
  useEffect(() => { setKararMuhru(null); }, [runBase]);
  // Kaydırma yükselmesi — şerit "yapışık" mı (altından içerik akıyor mu)? Header'dan hemen
  // önceki 1px sentinel görünürlükten çıkınca yapışık sayılır. IntersectionObserver scroll
  // dinleyicisinden ucuzdur: eşik geçişinde BİR kez tetiklenir, kare başına iş yok (perf
  // kuralı). Sinyal çift kanallı verilir (gölge + kenar tonu): koyu temada siyah zeminde
  // gölge görünmez, sinyali kenar taşır. Hook koşulsuz (Rules of Hooks — yukarıdaki not);
  // sentinel yalnız started'da render edildiğinden effect started'a bağlı.
  const [takili, setTakili] = useState(false);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    // started düşünce sıfırla: iptal→yeni koşum döngüsünde header ilk kareyi bayat
    // "yapışık" stille çizmesin (IO'nun ilk callback'i asenkron gelir).
    if (!started || !el || typeof IntersectionObserver === "undefined") { setTakili(false); return undefined; }
    // SON kayıt okunur: IO tek callback'te birden çok kronolojik geçiş teslim edebilir
    // (hızlı aşağı-yukarı kaydırma); ilk kayıt en eski durumdur, sonuncusu günceldir.
    const io = new IntersectionObserver((girisler) => setTakili(!girisler[girisler.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [started]);
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
  // akanMetin: paragraf içi tek "\n" boşluğa döner (dar sütunda testere dişi kenar yok);
  // uzunluk birebir korunur → kanıt span ofsetleri aynı metne işaret eder.
  const segs = useMemo(() => (km?.metin ? buildSegments(akanMetin(km.metin), Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  // Sunum temposu: SSE gerçeği anında saklanır, gösterim min-dwell ile sıralanır — hızlı
  // koşumda tamamlanma vuruşları izlenebilir kalır; sonuç sahnesi sunum bitince açılır.
  const { paced, sunumTamam } = useSahneTempo(nodes, { pendingOnay, glow: efGlow });
  // KAPANIŞ ANI — canlı izlenen koşum bitince sonuç ekranına geçmeden önce ~1,9 sn: pusula
  // kapanır, ıstampanın üstüne "İŞLENDİ" damgası basılır. YALNIZ bu mount'ta canlı görülen
  // koşumda (geri dönüşte sahte kapanış oynamaz) ve hareket kısıtlı değilse; hata dalında yok
  // (result gelmez). Sunum katmanıdır: hiçbir veri/karar bunu beklemez.
  //
  // Kapanış RENDER SIRASINDA türetilir (effect'le sonradan açılmaz). Eskiden sonuç gelince
  // önce bir kare sonuç sahnesi çiziliyor, effect kapanışı açınca canlı sahne SIFIRDAN yeniden
  // kuruluyordu: ıstampanın WebGL bağlamı yeniden yaratılıyor, fosfor vurguları baştan
  // boyanıyordu ve ekran bir kare "sonuca zıplayıp geri dönüyordu" (2026-10 ölçümü: kaynak
  // paneli ve işlem kartı DOM düğümleri sonuç anında değişiyordu).
  const [canliGoruldu, setCanliGoruldu] = useState(false);
  const [kapanisBitti, setKapanisBitti] = useState(false);
  useEffect(() => { setCanliGoruldu(false); setKapanisBitti(false); }, [runBase]);
  useEffect(() => { if (busy) setCanliGoruldu(true); }, [busy, runBase]);
  const azHareket = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const kapanis = canliGoruldu && !kapanisBitti && !!result && sunumTamam && !pendingOnay && !azHareket;
  useEffect(() => {
    if (!kapanis) return undefined;
    // Sahne → sonuç GEÇİŞİ (tur-4: tek karede kesiliyordu): View Transition ile pusula
    // sonuca çapraz-solar. Yalnız kompozitör (anlık görüntü opaklığı); destek yoksa ya da
    // hareket kısıtlıysa doğrudan geçer — hiçbir veri/karar bu geçişi beklemez.
    const id = setTimeout(() => {
      const bitir = () => setKapanisBitti(true);
      if (typeof document !== "undefined" && document.startViewTransition) document.startViewTransition(() => flushSync(bitir));
      else bitir();
    }, 1900);
    return () => clearTimeout(id);
  }, [kapanis]);
  // Denetim zinciri arka planda üretilmeye devam eder; memurun iş akışını kalabalıklaştırmamak
  // için bu görünümde bir adım ya da panel olarak sunulmaz (sonuç başlığında rozet olarak çıkar).
  //
  // SIRA = GRAFIN SIRASI, listenin değil. Adımlar `katmanlar` haritasına göre gerçek çalışma
  // sırasına dizilir ve eşzamanlı olanlar tek bloğa iner; numaralandırma (01, 02…) bu dizilim
  // üzerinden verilir. Düz liste hem paralelliği gizliyordu hem de `decompose`/`eksik_tespit`
  // çiftinde sırayı TERS gösteriyordu. Harita yoksa davranış birebir eskisi gibi kalır.
  const { display, gruplar } = useMemo(() => {
    const ham = paced.filter((n) => n.id !== "denetim_izi").map((n) => ({
      id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
      // data: SSE node yükü OLDUĞU GİBİ taşınır — adım detay modalı (AjanAdimDetay) zengin
      // görünümü bundan kurar (canlı koşumda result henüz yokken tek veri kaynağı budur).
      data: n.data || null,
      // oku: motorun ham adı ("text-plain") memur diline çevrilir — özet satırı ham ad taşımaz.
      out: summarize(n.id, n.id === "oku" && n.data?.engine ? { ...n.data, engine: motorEtiketi(n.data.engine) } : n.data), desc: n.desc || "", t0: n.t0, t1: n.t1,
      // durationMs SUNUCU telemetrisidir (SSE node.duration_ms) ve t0/t1'den önceliklidir
      // (nodeDurationMs). Bu haritada taşınmazsa sahne sessizce istemci tahminine düşerdi:
      // paralel/gizli bekleme sıradaki görünür düğüme yazılır ve süreler şişerdi.
      durationMs: n.durationMs ?? null,
      // risk_guard istasyonu KENDİ bandını taşır — koşum sırasında genel sonuç bandı henüz
      // oluşmadığından node verisi tek doğru kaynak (backend ile birebir uyum).
      bant: n.data?.risk_metadata?.bant || null,
      // Adım koştu ama yapacak iş YOKTU (dijital metin → OCR gerekmedi; tek-konulu →
      // ayrıştırma gerekmedi). Yeşil tik almaz; gri "gerekmedi" olarak gösterilir ki
      // 15 tikin hepsi eşit katkı sanılmasın.
      gerekmedi: gerekmediMi(n),
    }));
    // sira DİZİLİMDEN SONRA verilir: hem ekrandaki numara hem detay modalının indeksi
    // (display[detayIdx]) aynı sırayı görür.
    let i = 0;
    const bloklar = katmanGruplari(ham, katmanlar)
      // katman + esZamanli düğüme de damgalanır: yatay şerit (AkisSeridi) komşuları
      // karşılaştırıp eşzamanlı bağı kesikli çizsin diye (blok bilgisi orada yok).
      .map((g) => ({
        ...g,
        items: g.items.map((x) => ({ ...x, sira: i++, katman: g.katman, esZamanli: g.paralel })),
      }));
    return { display: bloklar.flatMap((g) => g.items), gruplar: bloklar };
  }, [paced, katmanlar]);

  // EVRAK İŞLENMİYOR → anlamlı boş durum (sahte demo yok) + sürükle-bırak yükleme alanı.
  if (!started) {
    return <BosDurumDropzone onGoInbox={onGoInbox} onUpload={onUpload} onFileDrop={onFileDrop} onTelefon={onTelefon} />;
  }

  // Sonuç sahnesi sunum kuyruğu boşalınca açılır — canlı sahne son vuruşlarını oynar.
  const sonucGoster = !!result && sunumTamam && !kapanis;
  const total = display.length || 1;
  // İKİ AYRI SAYI, bilerek: `kapananCount` ilerleme çubuğunu sürer (atlanan adım çubuğu
  // sonsuza dek askıda bırakmasın), `kosanCount` ise BAŞARI beyanıdır ve yalnız gerçekten
  // çalışan adımları sayar. Eskiden tek sayaç vardı ve koşum bitince tüm bekleyen adımlar
  // "done" işaretlendiği için, dur-ve-sor dalında hiç çalışmamış adımlar da "başarıyla
  // yürütüldü" diye sayılıyordu (2026-08-12 adversarial ölçümü: 17 denildi, 10 koştu).
  const kosanCount = display.filter(kostuMu).length;
  const atlananCount = display.filter((a) => a.status === "atlandi").length;
  const kapananCount = display.filter((a) => a.status === "done" || a.status === "atlandi" || a.status === "error").length;
  const pct = Math.round((kapananCount / total) * 100);
  const allDone = !busy && sunumTamam && kapananCount >= total;
  const hataliAdim = display.findIndex((a) => a.status === "error");
  // DURDU — koşum hata ile kesildiyse bekleyen masalar "sırada" değildir: akış onlara hiç
  // ulaşmayacak. Kesimin olduğu masa "kesildi", sonrakiler "işlenmedi" (tamamlandı/atlandı
  // DEĞİL — CLAUDE.md §9). Tek kaynak akisKatman.kesimSirasi.
  const durduKesim = kesimSirasi(display);
  const durdu = hataliAdim >= 0 && !busy ? { kesim: durduKesim } : null;
  // Uçtan-uca gerçek koşum süresi (usePipeline t0/t1 damgaları; yoksa sessizce gizlenir).
  const toplamSn = (() => {
    if (!allDone) return null;
    const t0s = display.map((a) => a.t0).filter(Number.isFinite);
    const t1s = display.map((a) => a.t1).filter(Number.isFinite);
    if (!t0s.length || !t1s.length) return null;
    const sn = (Math.max(...t1s) - Math.min(...t0s)) / 1000;
    return sn >= 0.1 ? `${sn < 10 ? sn.toFixed(1).replace(".", ",") : Math.round(sn)} sn` : null;
  })();
  // Sunum kuyruğu boşalana dek sahne "canlı"dır (busy SSE done'la erken düşer — çip
  // drenaj sırasında "Hazır" diyordu, Playwright kanıtı). Hata dalı dahil; sayaç tek
  // sözlükte — adım sayısı yalnız sahnede ("İşlem aşamaları"), % yalnız ilerleme çubuğunda.
  const kosumda = busy || (!!result && !sunumTamam);
  // Memur onayı bekleyen koşum BİTMEDİ, duraklatıldı (§9): ne "tamamlandı" ne "Hazır".
  const onayBekliyor = !!pendingOnay && !kosumda && hataliAdim < 0;
  const statusText = hataliAdim >= 0 && !kosumda
    ? `İşlem hatası · ${hataliAdim + 1}. adımda durdu`
    : kosumda ? "İşleniyor" : onayBekliyor ? "Onay bekliyor" : (allDone ? "İşlem tamamlandı" : "Hazır");
  const chipRenk = hataliAdim >= 0 && !kosumda ? BANT.kirmizi.c : onayBekliyor ? BANT.sari.c : allDone ? BANT.yesil.c : kosumda ? T : PAL.mut2;

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
  // Taslak yoksa onaylanacak/gönderilecek bir yazı da yoktur (D-3 bulgusu).
  const onayHazir = decisionReady && !!draftMd;
  // Hüküm mührü YALNIZ kabul edilmiş karar için (§9): işleyici gerçekten kabul ettiğinde
  // `true` döndürür; reddedilen/başarısız/bilinmeyen sonuçta mühür basılmaz.
  const kararVer = async (tur, islem) => {
    const kabul = await islem();
    if (kabul === true) setKararMuhru(tur);
  };
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  // Başlık meta satırı koşum SIRASINDA da dolar: tür 2. adımda (siniflandir), sayfa/OCR güveni
  // 1. adımda (oku) SSE ile gelir — sonuç beklenmez, bulgular geldikçe başlığa işlenir.
  const canliMeta = result || {
    evrak_turu: nodeById.siniflandir?.data?.evrak_turu,
    page_count: nodeById.oku?.data?.page_count,
    ocr_confidence: nodeById.oku?.data?.ocr_confidence,
  };
  const metaLine = buildMetaLine(canliMeta, fileMeta);
  // Havale önerisi kenar notu — yalnız birim yönlendirme adımı GERÇEKTEN iş yaptıysa (olgu).
  const rb = display.find((a) => a.id === "route_birim");
  const havaleOnerisi = rb && adimDurumu(rb) === "calisti" && rb.out ? rb.out : null;
  // Panel kartları — düz beyaz yüzey + 1px hairline (border-first), NeonCard ile tutarlı.
  const card = { position: "relative", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, padding: SP.l, boxShadow: SH.card };

  return (
    <>
      <style>{SAHNE_CSS}</style>
      {/* SR: canlı ilerleme */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {(() => {
          if (hataliAdim >= 0 && !kosumda) return `İşlem hatası — ${display[hataliAdim].label} adımı başarısız oldu. Üst çubuktan yeniden deneyebilirsiniz.`;
          const ai = display.findIndex((a) => a.status === "active");
          const esz = eszamanliMasalar(display, ai).map((a) => a.label);
          if (ai >= 0) return `${[display[ai].label, ...esz].join(" ve ")} ${esz.length ? "eşzamanlı " : ""}çalışıyor — adım ${ai + 1} / ${total}`;
          // Beyan yalnız GERÇEKTEN koşan adımları sayar; koşullu dalda atlananlar ayrıca
          // söylenir (eskiden hepsi "başarıyla yürütüldü" diye sayılıyordu).
          if (onayBekliyor) return `Memur onayı bekleniyor — ${kosanCount} adım yürütüldü; kalan adımlar kararınızdan sonra koşacak.`;
          if (allDone) {
            return `İşlem tamamlandı — ${kosanCount} işlem adımı yürütüldü`
              + (atlananCount ? `, ${atlananCount} adım bu koşumda çalışmadı.` : ".");
          }
          return "";
        })()}
      </div>

      {/* Kaydırma sentineli — header'ın HEMEN önünde, akış içinde ama görünmez (1px, negatif
          marginle net sıfır yer kaplar). Görünürlükten çıktığı an şerit "yapışık" demektir. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />

      {/* Üst durum çubuğu — kabuk tam genişlik (buzlu cam + tam-genişlik hairline = uygulama
          kromu), İÇERİK 1540 kolonda. Altındaki her iki durum da 1540 ortalı akar (canlı:
          maxWidth 1540 · sonuç: .sc-workspace); şerit tam-genişlik serilince 2560px ekranda
          ad solda, butonlar sağ dipte "çorak" kalıyordu (kullanıcı bulgusu, 2026-08-03).
          BUZLU CAM (kullanıcı seçimi): CAM token'ının kendi yorumu tam bu durumu — kaydırılan
          içeriğin üstünde duran yüzey — kutsuyor; modal jank yasağı buraya uzanmaz (scroll
          pürüzsüzlüğü Playwright'la ölçüldü). Kenar cam üstünde CAM.line (opak çizgi camda
          sert duruyordu); yapışınca PAL.lineHi + SH.card — çift kanal, çünkü koyu temada
          siyah zeminde gölge görünmez, sinyali kenar taşır. */}
      <header style={{
        padding: `${SP.l}px clamp(${SP.l}px, 2.4vw, ${SP.xxl}px)`,
        position: "sticky", top: 0, zIndex: 20,
        background: CAM.bg, backdropFilter: CAM.blur, WebkitBackdropFilter: CAM.blur,
        borderBottom: `1px solid ${takili ? PAL.lineHi : CAM.line}`,
        boxShadow: takili ? SH.card : "none",
        transition: "box-shadow .16s ease, border-color .16s ease",
      }}>
        {/* Çift perde — cam tek katmanda %55 saydam: koyu temada altından BEYAZ A4 kâğıdı
            geçerken kompozit zemin griye açılıyor, 13px meta ≈2.0:1'e düşüyordu (yargıç
            ölçümü — AA ihlali; eski opak header'a göre gerçek gerileme olurdu). CAM.bg bir
            kez daha bindirilince efektif örtü ~%80: en kötü durumda (saf beyaz kâğıt) meta
            ≈4.6:1 ile AA'yı geçer, buzlu his korunur. Token dışına çıkılmaz; gradyan ve
            renkli gölge kullanılmaz (yasa). İçerik sarmalı position:relative ile üstte. */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: CAM.bg, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1540, margin: "0 auto", position: "relative" }}>
          {/* minHeight 36 = Btn'nin onaylı yüksekliği (satırın en uzun sakini): çip/lejant/
              butonlar durumdan duruma takılıp çıkarken satır yüksekliği oynamasın (CLS koruması). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, flexWrap: "wrap", minHeight: 36 }}>
            {/* Koşum sürerken sağda yalnız küçük "İptal" var: sol blok esnek tabanla (0) satırı
                paylaşır ki 390px'te İptal tek başına ikinci satıra düşmesin (başlık kısalır). */}
            <div style={{ display: "flex", alignItems: "center", gap: SP.m, minWidth: 0, flex: "1 1 260px" }}>
              {/* Kutusuz aksan ikonu — NeonCard ev stili ("accent yalnız ikon rengi", 16-18px
                  sınırı); ikon KUTUSU MASTER.md anti-pattern'i, bilerek yok. */}
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}>
                <Icon.doc width={18} height={18} />
              </span>
              <span style={{ minWidth: 0 }}>
                {/* Belge kimliği görünümün başlığıdır — 14px UI satırı değil 16/600 okuma
                    kademesi; geniş ekranda erken kırpılmasın (360px sabiti kalktı). */}
                <h2 style={{ margin: 0, ...TYPE.h2, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "min(52vw, 680px)" }}>{fileLabel}</h2>
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: SP.xs, marginTop: SP.xs, ...TYPE.data, color: PAL.mut2, ...TNUM }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metaLine}</span>
                  {/* Sonuç durumunda çip kalkar (büyük hüküm aşağıda — çip tekrarı yasak);
                      tamamlanma bilgisi meta satırında sakin bir segment olarak yaşar. */}
                  {sonucGoster && onayBekliyor && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap", color: DERIN.sari }}>
                      <span style={{ color: PAL.mut3 }}>·</span>
                      <span aria-hidden="true" style={{ display: "flex" }}><Icon.alert width={12} height={12} /></span>
                      Memur onayı bekliyor
                    </span>
                  )}
                  {sonucGoster && allDone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap" }}>
                      <span style={{ color: PAL.mut3 }}>·</span>
                      <span aria-hidden="true" style={{ display: "flex", color: DERIN.yesil }}><Icon.check width={12} height={12} /></span>
                      İşlem tamamlandı{toplamSn ? ` · ${toplamSn}` : ""}
                    </span>
                  )}
                </span>
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
            {/* Sağ yuva SABİT genişlikte ve sağa yaslı: koşum biterken "İptal" (76px) yerini iki
                yükleme düğmesine (313px) bırakınca yuvanın sol kenarı kayıyordu (tur-4 CLS 0,051'in
                bir parçası). Yuva en geniş içeriği baştan ayırır; içerik içinde değişir. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: SP.m, minWidth: "min(320px, 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: SP.s, flex: 1 }}>
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
                {/* Yeni evrak kısayolları — YALNIZ boşta (!busy). Önceki tasarım "sidebar'da zaten
                    var" diyordu ama "Telefonla yükle" YALNIZ boş dropzone durumunda (!started)
                    erişilebilirdi; bir sonuç görüntülenirken (started=true) bu ekrana geri dönüşü
                    YOKTU — sidebar'ın "Yeni evrak yükle"si native dosya seçiciyi doğrudan açıyor,
                    seçici iptal edilince memur eski sonuçla burada MAHSUR kalıyordu, tek çıkış
                    sekme yenilemekti (kullanıcı bulgusu, 2026-07-20). bekleyenKararUyar (DashboardApp)
                    önceki kararın kalıcı kayda yazılamadığını zaten toast'la uyarıyor — ekstra guard
                    gerekmez. Düşük-vurgu (Btn secondary): tek primary "Onayla ve gönder" kalır.
                    nu-rise: koşum bitip butonlar belirirken tek seferlik sakin giriş (izinli
                    çekirdek keyframe; reduced-motion global kuralı söndürür). */}
                {!busy && (
                  <div style={{ display: "flex", alignItems: "center", gap: SP.s, animation: "nu-rise .16s var(--ke-ease-out) both" }}>
                    <Btn onClick={onTelefon}><Icon.phone width={14} height={14} /> Telefonla yükle</Btn>
                    <Btn onClick={onUpload}><Icon.upload width={14} height={14} /> Yeni evrak yükle</Btn>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* İŞARET CETVELİ — eski ince ilerleme çubuğu yerine adım başına bir çentik (graf
              sırası). Biçim adimDurumu'ndan; yüzde yalnız burada, kapanan adım sayısından. */}
          {/* Cetvel SONUÇTA DA durur: kalkınca başlık 33px kısalıp sonuç sayfası yukarı zıplıyordu
              (tur-4 CLS 0,017). Sonuçta koşumun adım-adım özetidir (koştu/gerekmedi/atlandı).
              Yüzde: "%" NumberFlow öneki — ayrı metin düğümü rakam rulosuyla taban çizgisi
              kaydırıyordu; kap sabit satır yüksekliği + clip ile rulo taşmaz. */}
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, marginTop: SP.m }}>
            <IsaretCetveli display={display} durdu={durdu} />
            <span style={{ fontFamily: MONO, fontSize: 13, lineHeight: "18px", height: 18, overflow: "clip", fontWeight: 500, color: hataliAdim >= 0 && !kosumda ? DERIN.kirmizi : PAL.ink2, flexShrink: 0, minWidth: 44, textAlign: "right", ...TNUM }}><NumberFlow value={pct} prefix="%" spinTiming={{ duration: 250 }} /></span>
          </div>
        </div>
      </header>

      {/* İşlem merkezi: canlı durumda kaynak belgeyle yan yana, sonuçta karar yüzeyiyle devam eder. */}
      {(() => {
        // Sunum kuyruğu boşalana dek sahne "canlı" görünür (busy SSE'yle erken düşer).
        const sahneCanli = kosumda;
        const pad = "clamp(16px, 2.4vw, 28px)";
        const merkezIdx = merkezIndeksi(display);
        const kapanisBilgi = kapanis ? {
          baslik: "Tamamlandı",
          alt: `${kosanCount} adım yürütüldü${atlananCount ? ` · ${atlananCount} adım bu koşumda çalışmadı` : ""}${toplamSn ? ` · ${toplamSn}` : ""}`,
        } : null;
        const islemKart = (
          /* HAVALE PUSULASI — sahnenin tek kâğıdı: antet künyesi + çift çizgi · ıstampa (mürekkep
             havuzu) ile odaktaki masa yan yana · altta kendini çizen pusula. */
          <section aria-label="İşlem durumu" style={{ ...card, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ padding: `${pad} ${pad} 0` }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: SP.m, rowGap: SP.xs, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", minWidth: 0 }}>
                <span style={{ whiteSpace: "nowrap" }}>Havale pusulası ·</span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, color: PAL.mut }}>{canliMeta?.evrak_turu ? EVRAK_TR(canliMeta.evrak_turu) : "tür belirleniyor"}</span>
                <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
                <SahneTelemetri busy={sahneCanli} allDone={allDone} toplamSn={toplamSn} runBase={runBase} durdu={!!durdu} />
              </div>
              <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: pad, padding: pad, alignItems: "center" }}>
              <div style={{ position: "relative", minWidth: 0 }}>
                {/* Istampa kutusu — teneke çerçeve (surf2 + iç hairline) içinde keçe. */}
                <div style={{ padding: SP.s, borderRadius: RAD.pop, background: PAL.surf2, boxShadow: `inset 0 0 0 1px ${PAL.lineHi}, ${SH.card}` }}>
                  <AjanOrb display={display} kosumda={sahneCanli} yukseklik={188} runBase={runBase}
                    gelis={{ ad: fileLabel, meta: metaLine }} />
                </div>
                <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.s, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", flexWrap: "wrap" }}>
                  <span>Istampa</span>
                  <span style={{ flex: 1, minWidth: 8 }} />
                  <span style={{ width: 8, height: 8, borderRadius: RAD.dot, background: T }} />{gorevFaz(1).uzun}
                  <span style={{ width: 8, height: 8, borderRadius: RAD.dot, background: V, marginLeft: SP.xs }} />{gorevFaz(2).uzun}
                </div>
                {kapanis && (
                  <div aria-hidden="true" style={{ position: "absolute", inset: 0, bottom: 24, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <Damga ton={V} egim={-8} oncelik={1} style={{ fontSize: 30, lineHeight: "32px", padding: "10px 22px", borderWidth: 3, background: `color-mix(in srgb, ${PAL.surf} 55%, transparent)` }}>İşlendi</Damga>
                  </div>
                )}
              </div>
              <MerkezKart a={display[merkezIdx]} total={total} runBase={runBase} kapanis={kapanisBilgi} kosumda={sahneCanli} esz={eszamanliMasalar(display, merkezIdx)} />
            </div>
            <div style={{ padding: `0 ${pad} ${pad}` }}>
              <SahneAkis display={display} gruplar={gruplar} onDetay={setDetayIdx} durdu={durdu} runBase={runBase} />
              <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.l, ...TYPE.meta, color: PAL.mut2 }}>
                <Icon.info width={13} height={13} />
                Her satır bir masadır; paraf, o masanın işini gerçekten yaptığını gösterir. Ayrıntı için satıra tıklayın.
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
                {/* Karar mührü — kenarda TEK TUR dolaşan ışık. Renk kararı taşır (yeşil onay,
                    kırmızı ret) ama renk tek sinyal değil: karar zaten Giden/İşlenen
                    görünümlerinde metinle de yazılı. Sonsuz döngü yok, reduced-motion'da hiç
                    kurulmaz — hareket burada bilgi değil, bilginin VURGUSU. */}
                {kararMuhru && (
                  <ParlaKenar anahtar={kararMuhru}
                    renk={kararMuhru === "onay" ? BANT.yesil.c : BANT.kirmizi.c} />
                )}
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
                    <div className="sc-document-paper" style={{ maxWidth: 860, margin: "0 auto" }}>
                      <A4Belge metin={cleanDemoText(draftMd)} onAc={() => setBelgeModal("taslak")}
                        solgun={turUretiliyor || dayanakUretiliyor} sigdir="genislik"
                        imzaKatmani={kararMuhru ? <HukumMuhru key={kararMuhru} karar={kararMuhru} /> : null} />
                    </div>
                  ) : (
                    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", gap: SP.s, justifyContent: "center", ...TYPE.data, color: PAL.mut2, border: `1px dashed ${PAL.lineHi}`, borderRadius: RAD.card, padding: SP.xxl, background: PAL.surf }}>
                      <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: RAD.dot, background: PAL.mut2, animation: busy ? "nu-think 1.2s ease-in-out infinite" : "none" }} />
                      {busy ? "Taslak, \"Yazı Taslağı\" adımında üretilecek…" : "Bu koşumda yazı taslağı üretilmedi."}
                    </div>
                  )}
                </div>
                {/* HITL karar footer — belge kolonuyla hizalı (max 800, ortalı). Tek primary
                    (Onayla ve gönder, sağda); Düzenle secondary; Reddet SOLDA düşük-vurgu (ghost)
                    → sonuçlu eylem onaydan uzak (NN/g: consequential ≠ benign yan yana). */}
                <div className="sc-decision-footer" style={{ borderTop: `1px solid ${PAL.line}` }}>
                  <div style={{ maxWidth: 800, margin: "0 auto" }}>
                  <div className="sc-action-row">
                    <button onClick={() => kararVer("ret", onReject)} disabled={!decisionReady} aria-label="Taslağı reddet" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = ALFA(BANT.kirmizi.c); }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 14px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", background: "transparent", color: decisionReady ? DERIN.kirmizi : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.x /> Reddet</button>
                    <span className="sc-action-spacer" />
                    <button onClick={onEdit} disabled={!decisionReady} aria-label="Taslağı düzenle" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.hov; }}
                      onMouseLeave={(e) => { if (decisionReady) e.currentTarget.style.background = PAL.surf; }}
                      style={{ cursor: decisionReady ? "pointer" : "not-allowed", padding: "9px 16px", minHeight: 42, borderRadius: RAD.ctl, border: `1px solid ${decisionReady ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: decisionReady ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.edit /> Düzenle</button>
                    <button onClick={() => kararVer("onay", onApprove)} disabled={!onayHazir} aria-label="Taslağı onayla ve gönder" {...focusRing} data-press=""
                      onMouseEnter={(e) => { if (onayHazir) e.currentTarget.style.background = DERIN.Th; }}
                      onMouseLeave={(e) => { if (onayHazir) e.currentTarget.style.background = DERIN.T; }}
                      style={{ cursor: onayHazir ? "pointer" : "not-allowed", padding: "9px 20px", minHeight: 42, borderRadius: RAD.ctl, border: "1px solid transparent", ...TYPE.ui, fontWeight: 600, color: onayHazir ? PAL.onAccent : PAL.mut2, background: onayHazir ? DERIN.T : PAL.press, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}><Icon.send /> Onayla ve gönder</button>
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
                  <KaynakBelge fileUrl={fileUrl} segs={segs} busy={busy} glow={efGlow} canli havale={havaleOnerisi} onBuyut={() => setBelgeModal("kaynak")} />
                </aside>
              </div>
              </HataSiniri>
            )}
          </section>
        );
      })()}

      {/* İşlem adımı detayı — istasyon/nokta tıklanınca; ←/→ ile adımlar arasında
          gezinilir. Koşum CANLI sürerken de açılabilir (içerik node bittikçe dolar).
          AnimatePresence: kapanışta giriş yolunun tersinden çıkar (spatial consistency). */}
      <AnimatePresence>
        {detayIdx != null && display[detayIdx] && (
          <AjanAdimDetay key="adim-detay" idx={detayIdx} display={display} result={result} runBase={runBase}
            onKapat={() => setDetayIdx(null)} onGit={setDetayIdx} />
        )}
      </AnimatePresence>

      {/* A4 belge modalları — kaynak belge (maskeli metin / gerçek PDF sayfası) + resmî yazı
          taslağı (PDF/DOCX indirme kısayollu). Tetikleyiciler: panel tıklaması / büyüt düğmesi. */}
      <BelgeModal acik={belgeModal === "kaynak"} baslik="Kaynak belge" dosyaAdi={fileLabel}
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
