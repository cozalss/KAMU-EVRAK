/* CanliAjanAkisi — "İşleniyor" görünümü (orkestratör).
   Gerçek SSE verisini tek bir canlı işlem odağında sunar; kaynak belge her zaman erişilebilir.
   İşlem bittiğinde doğrudan memur kararı için ayrıntılı sonuç ve taslağa geçer.
   Tur 6'da parçalara ayrıldı (dosya <800, fonksiyon <50): başlık CanliBaslik · pusula
   CanliPusula · kaynak kâğıdı CanliKaynakBelge · taslak + karar CanliTaslakKarti · boş hâl
   CanliBosHal · özet şeridi CanliAkisSeridi. Durum/eşzamanlılık tek kaynaktan: akisKatman +
   SSE start.katmanlar (CLAUDE.md §8-10); bu dosyalar hiçbir adım durumunu elle türetmez. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence } from "motion/react";
import { summarize } from "../lib/nodeMeta.js";
import { motorEtiketi } from "../lib/pipelinePhases.js";
import { akanMetin } from "../lib/metinAkis.js";
import { katmanGruplari, gerekmediMi, kostuMu, kesimSirasi, adimDurumu } from "../lib/akisKatman.js";
import { useDarEkran } from "../hooks/useMedya.js";
import { EVRAK_TR, cleanDemoText } from "./result-cards.jsx";
import SonucCalismaAlani from "./SonucCalismaAlani.jsx";
import AjanAdimDetay from "./AjanAdimDetay.jsx";
import HataSiniri from "./HataSiniri.jsx";
import BelgeModal, { ScrimDugme } from "./BelgeModal.jsx";
import { T, PAL, BANT, DERIN, SR_ONLY, SP } from "./neonUi.jsx";
import { useSahneTempo, eszamanliMasalar, SAHNE_CSS } from "./CanliMetro.jsx";
import { PusulaOzeti } from "./CanliAkisSeridi.jsx";
import { KaynakBelge, KaynakSerit, buildSegments } from "./CanliKaynakBelge.jsx";
import CanliBosHal from "./CanliBosHal.jsx";
import CanliBaslik from "./CanliBaslik.jsx";
import CanliPusula from "./CanliPusula.jsx";
import CanliTaslakKarti from "./CanliTaslakKarti.jsx";

/* KAPANIŞ GEÇİŞİ (tur 6) — eskiden adsız startViewTransition tüm kökü çapraz-soluyordu:
   kapanış sahnesi ile sonuç üst üste biniyor, "15/15 Tamamlandı" sonuç kartlarının içinden
   hayalet gibi görünüyordu. Artık kök ANLIK değişir; yalnız adlandırılmış iki nesne yolculuk
   eder: pusula OPAK bir kâğıt olarak küçülüp sonuç başlığındaki "İşlem tamamlandı" satırına
   oturur (ke-pusula; yarı saydam kalsaydı sonuçla yine çift pozlama yapardı),
   kaynak kâğıdı sağ sütundan sol sütuna kayar (ke-kaynak-kagit). Kalan içerik kendi girişini
   (sc-result-page-enter) oynar. Kapsam html[data-vt="kapanis"] — diğer geçişler etkilenmez. */
const KAPANIS_VT_CSS = `
html[data-vt="kapanis"]::view-transition-old(root){animation:none;opacity:0}
html[data-vt="kapanis"]::view-transition-new(root){animation:none}
html[data-vt="kapanis"]::view-transition-group(ke-kaynak-kagit){animation-duration:.5s;animation-timing-function:cubic-bezier(.77,0,.175,1)}
html[data-vt="kapanis"]::view-transition-old(ke-kaynak-kagit){animation:none}
html[data-vt="kapanis"]::view-transition-new(ke-kaynak-kagit){animation:ke-vt-sol .14s ease-out .36s both}
html[data-vt="kapanis"]::view-transition-group(ke-pusula){animation-duration:.42s;animation-timing-function:cubic-bezier(.77,0,.175,1)}
html[data-vt="kapanis"]::view-transition-old(ke-pusula){height:100%;object-fit:cover;object-position:top left}
html[data-vt="kapanis"]::view-transition-new(ke-pusula){width:auto;height:auto;object-fit:none;object-position:top left}
html[data-vt="kapanis"]::view-transition-old(ke-pusula){animation:ke-vt-katla .42s linear both}
html[data-vt="kapanis"]::view-transition-new(ke-pusula){animation:ke-vt-sol .24s ease-out .3s both}
@keyframes ke-vt-katla{0%,72%{opacity:1}100%{opacity:0}}
@keyframes ke-vt-sol{from{opacity:0}}
`;

const bos = () => {};
const TASLAK_VARSAYILAN = {
  onApprove: bos, onEdit: bos, onReject: bos, onAltKarar: bos, onAltTurUret: () => null, onAltDuzenle: bos,
  onTurSec: bos, turUretiliyor: "", onerilenTur: "", dayanakUretiliyor: false,
};

/* Yüzen hata fişi (ErrorBar, sağ alt) yüksekliği + alt boşluğu. */
const HATA_FISI_PAYI = 152;

/* Tür adı belge adıyla aynıysa (örnek evraklarda başlık türün kendisi) tekrar etmez. */
const sade = (x) => String(x || "").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");

function buildMetaLine(r, fileMeta, { turDahil = true } = {}) {
  const parts = [];
  if (turDahil && r?.evrak_turu) parts.push(EVRAK_TR(r.evrak_turu));
  if (r?.page_count != null) parts.push(`${r.page_count} sayfa`);
  if (fileMeta?.kind === "file" && fileMeta.size) parts.push(`${(fileMeta.size / (1024 * 1024)).toFixed(1)} MB`);
  else if (fileMeta?.kind === "sample") parts.push(`${fileMeta.size} karakter`);
  if (r?.ocr_confidence != null) parts.push(`OCR %${Math.round(r.ocr_confidence * 100)}`);
  return parts.join(" · ");
}

/* Her alt taslağa ORİJİNAL 1-tabanlı sira eklenir (backend /alt-talep/{sira} tam listedeki konumu bekler). */
const altTaslaklarOf = (result) => (result?.alt_talepler || []).map((a, i) => ({ a, sira: i + 1 })).filter((x) => x.a?.yazi_taslak_md);

/* Başlık kimliği + canlı havale önerisi — yalnız SSE'de gelmiş alanlardan. */
function baslikBilgisi({ result, fileMeta, nodeById, display, sonucGoster }) {
  const fileLabel = fileMeta?.kind === "sample" ? (fileMeta.label || fileMeta.name) : (fileMeta?.name || "evrak");
  const canliMeta = result || { evrak_turu: nodeById.siniflandir?.data?.evrak_turu, page_count: nodeById.oku?.data?.page_count, ocr_confidence: nodeById.oku?.data?.ocr_confidence };
  // Tür canlı sahnede pusula künyesinde yazar; başlıkta yalnız sonuçta ve adla aynı değilse.
  const turDahil = sonucGoster && sade(EVRAK_TR(canliMeta?.evrak_turu)) !== sade(fileLabel);
  const rb = display.find((a) => a.id === "route_birim");
  const havale = rb && adimDurumu(rb) === "calisti" && rb.out ? rb.out : null;
  return { fileLabel, metaLine: buildMetaLine(canliMeta, fileMeta, { turDahil }), havale };
}

/* Kaydırma yükselmesi — şerit "yapışık" mı? 1px sentinel görünürlükten çıkınca. */
function useYapisik(started) {
  const [takili, setTakili] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!started || !el || typeof IntersectionObserver === "undefined") { setTakili(false); return undefined; }
    const io = new IntersectionObserver((g) => setTakili(!g[g.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [started]);
  return [takili, ref];
}

/* KAPANIŞ ANI — canlı izlenen koşum bitince ~1,9 sn: pusula kapanır, "İŞLENDİ" basılır, sonra
   adlandırılmış view-transition ile sonuca geçilir. Render sırasında türetilir (effect'le
   sonradan açılınca canlı sahne sıfırdan kuruluyordu). Sunum katmanıdır; veri beklemez. */
/* KAYDIRMA SÖZLEŞMESİ (tur 6 doğrulama gerilemesi): canlı akışta pusula etkin satırı görünür
   tutmak için sayfayı aşağı indirir. Kapanış anı (İŞLENDİ + 15/15) pusulanın TEPESİNDE basılır
   → kapanış başlarken sayfa yumuşakça başa döner; sonuç da daima başından açılır (karar,
   havale, gönderim kilidi ilk ekranda). İkisi de yalnız sayfa gerçekten kaymışsa çalışır. */
const basaDon = (yumusak) => {
  if (typeof window === "undefined" || window.scrollY <= 0) return;
  window.scrollTo({ top: 0, behavior: yumusak ? "smooth" : "auto" });
};

/* Koşum hata ile durunca odak kartı (sebep + kesilen masa) pusulanın tepesindedir; otomatik
   kaydırma sayfayı aşağıda bırakmışsa oraya yumuşakça dönülür. */
function useHataBasta(hata) {
  const onceki = useRef(hata);
  useEffect(() => {
    if (hata && !onceki.current) basaDon(true);
    onceki.current = hata;
  }, [hata]);
}

function useSonucBasta(sonucGoster) {
  const onceki = useRef(sonucGoster);
  // Layout effect: view-transition'ın flushSync'i içinde, YENİ kare yakalanmadan önce çalışır.
  useLayoutEffect(() => {
    if (sonucGoster && !onceki.current) basaDon(false);
    onceki.current = sonucGoster;
  }, [sonucGoster]);
}

function kapanisGecisi(bitir) {
  if (typeof document === "undefined" || !document.startViewTransition) { bitir(); return; }
  const kok = document.documentElement;
  kok.dataset.vt = "kapanis";
  const vt = document.startViewTransition(() => flushSync(bitir));
  vt.finished.finally(() => { delete kok.dataset.vt; });
}

function useKapanis({ busy, runBase, result, sunumTamam, pendingOnay }) {
  const [canliGoruldu, setCanliGoruldu] = useState(false);
  const [kapanisBitti, setKapanisBitti] = useState(false);
  useEffect(() => { setCanliGoruldu(false); setKapanisBitti(false); }, [runBase]);
  useEffect(() => { if (busy) setCanliGoruldu(true); }, [busy, runBase]);
  const azHareket = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const kapanis = canliGoruldu && !kapanisBitti && !!result && sunumTamam && !pendingOnay && !azHareket;
  useEffect(() => {
    if (!kapanis) return undefined;
    basaDon(true);
    const id = setTimeout(() => kapanisGecisi(() => setKapanisBitti(true)), 1900);
    return () => clearTimeout(id);
  }, [kapanis]);
  return kapanis;
}

/* SIRA = GRAFIN SIRASI: adımlar `katmanlar` haritasına göre dizilir, eşzamanlılar tek bloğa
   iner; numara bu dizilimden. Harita yoksa düz liste (paralellik iddia edilmez). */
function useDisplay(paced, katmanlar) {
  return useMemo(() => {
    const ham = paced.filter((n) => n.id !== "denetim_izi").map((n) => ({
      id: n.id, label: n.label || n.id, gorev: n.gorev || 1, status: n.status || "pending",
      data: n.data || null,
      out: summarize(n.id, n.id === "oku" && n.data?.engine ? { ...n.data, engine: motorEtiketi(n.data.engine) } : n.data), desc: n.desc || "", t0: n.t0, t1: n.t1,
      // durationMs SUNUCU telemetrisidir (SSE node.duration_ms); taşınmazsa istemci tahminine düşülürdü.
      durationMs: n.durationMs ?? null,
      bant: n.data?.risk_metadata?.bant || null,
      gerekmedi: gerekmediMi(n),
    }));
    let i = 0;
    const bloklar = katmanGruplari(ham, katmanlar).map((g) => ({
      ...g, items: g.items.map((x) => ({ ...x, sira: i++, katman: g.katman, esZamanli: g.paralel })),
    }));
    return { display: bloklar.flatMap((g) => g.items), gruplar: bloklar };
  }, [paced, katmanlar]);
}

/* İKİ AYRI SAYI, bilerek: `kapananCount` ilerlemeyi sürer, `kosanCount` BAŞARI beyanıdır ve yalnız
   gerçekten çalışan adımları sayar (2026-08-12 ölçümü: 17 denildi, 10 koştu). */
function durumOzeti({ display, busy, result, sunumTamam, pendingOnay }) {
  const total = display.length || 1;
  const kosanCount = display.filter(kostuMu).length;
  const atlananCount = display.filter((a) => a.status === "atlandi").length;
  const kapananCount = display.filter((a) => a.status === "done" || a.status === "atlandi" || a.status === "error").length;
  const allDone = !busy && sunumTamam && kapananCount >= total;
  const hataliAdim = display.findIndex((a) => a.status === "error");
  const kosumda = busy || (!!result && !sunumTamam);
  const hata = hataliAdim >= 0 && !kosumda;
  const onayBekliyor = !!pendingOnay && !kosumda && hataliAdim < 0;
  const toplamSn = (() => {
    if (!allDone) return null;
    const t0s = display.map((a) => a.t0).filter(Number.isFinite), t1s = display.map((a) => a.t1).filter(Number.isFinite);
    if (!t0s.length || !t1s.length) return null;
    const sn = (Math.max(...t1s) - Math.min(...t0s)) / 1000;
    return sn >= 0.1 ? `${sn < 10 ? sn.toFixed(1).replace(".", ",") : Math.round(sn)} sn` : null;
  })();
  const statusText = hata ? "İşlem kesildi" : kosumda ? "İşleniyor" : onayBekliyor ? "Onay bekliyor" : (allDone ? "İşlem tamamlandı" : "Hazır");
  const chipRenk = hata ? BANT.kirmizi.c : onayBekliyor ? BANT.sari.c : allDone ? BANT.yesil.c : kosumda ? T : PAL.mut2;
  const chipDerin = hata ? DERIN.kirmizi : onayBekliyor ? DERIN.sari : allDone ? DERIN.yesil : kosumda ? DERIN.T : PAL.mut2;
  const durdu = hataliAdim >= 0 && !busy ? { kesim: kesimSirasi(display) } : null;
  return { total, kosanCount, atlananCount, pct: Math.round((kapananCount / total) * 100), allDone, hataliAdim, kosumda, hata, onayBekliyor, toplamSn, statusText, chipRenk, chipDerin, durdu };
}

function SrDurum({ display, o }) {
  let metin = "";
  if (o.hata) metin = `İşlem hatası — ${display[o.hataliAdim].label} adımı başarısız oldu. Üst çubuktan yeniden deneyebilirsiniz.`;
  else {
    const ai = display.findIndex((a) => a.status === "active");
    const esz = eszamanliMasalar(display, ai).map((a) => a.label);
    if (ai >= 0) metin = `${[display[ai].label, ...esz].join(" ve ")} ${esz.length ? "eşzamanlı " : ""}çalışıyor — adım ${ai + 1} / ${o.total}`;
    else if (o.onayBekliyor) metin = `Memur onayı bekleniyor — ${o.kosanCount} adım yürütüldü; kalan adımlar kararınızdan sonra koşacak.`;
    else if (o.allDone) metin = `İşlem tamamlandı — ${o.kosanCount} işlem adımı yürütüldü${o.atlananCount ? `, ${o.atlananCount} adım bu koşumda çalışmadı.` : "."}`;
  }
  return <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>{metin}</div>;
}

/* Canlı künye olguları — yalnız SSE'de GELMİŞ alanlar (kişi adı yok). */
function kunyeOlgulari(result, nodeById, havale) {
  const bu = result?.bilgi_unsurlari || nodeById.cikar?.data?.bilgi_unsurlari || {};
  const tur = result?.evrak_turu || nodeById.siniflandir?.data?.evrak_turu;
  const tarih = typeof bu.tarih === "string" && bu.tarih.trim() ? bu.tarih.trim() : null;
  const sayi = typeof bu.sayi === "string" && bu.sayi.trim() ? bu.sayi.trim() : null;
  return { tur: tur ? EVRAK_TR(tur) : null, tarih, sayi, birim: havale };
}

function useAltIdx(runBase) {
  const [altIdx, setAltIdx] = useState(0);
  useEffect(() => { setAltIdx(0); }, [runBase]);
  return [altIdx, setAltIdx];
}

function useKararMuhru(runBase) {
  const [kararMuhru, setKararMuhru] = useState(null);   // null | "onay" | "ret"
  useEffect(() => { setKararMuhru(null); }, [runBase]);
  // Hüküm mührü YALNIZ kabul edilmiş karar için (§9): işleyici true döndürünce basılır.
  const kararVer = async (tur, islem) => { if ((await islem()) === true) setKararMuhru(tur); };
  return [kararMuhru, kararVer];
}

function CanliSahne({ p, o, display, gruplar, segs, kapanis, fileLabel, metaLine, olgu, havale, dar, setDetayIdx, setBelgeModal }) {
  useHataBasta(o.hata);
  const sonucGoster = !!p.result && o.sunumTamam && !kapanis;
  const kapanisBilgi = kapanis ? { baslik: "Tamamlandı", alt: `${o.kosanCount} adım yürütüldü${o.atlananCount ? ` · ${o.atlananCount} adım bu koşumda çalışmadı` : ""}${o.toplamSn ? ` · ${o.toplamSn}` : ""}` } : null;
  const kaynakAc = () => setBelgeModal("kaynak");
  if (sonucGoster) return (
    <section>
      <div className="sc-result-page">
        <HataSiniri baslik="Sonuç ekranı gösterilemedi">
          <SonucCalismaAlani result={p.result} onMevzuatAc={p.onMevzuatAc} onMevzuatSec={p.onMevzuatSec} seciliMevzuat={p.seciliMevzuat}
            solPanel={<KaynakBelge fileUrl={p.fileUrl} segs={segs} busy={p.busy} glow={p.glow} compact onBuyut={kaynakAc} />}
            yanTaslak={p.taslak} altAkis={<PusulaOzeti display={display} onDetay={setDetayIdx} toplamSn={o.toplamSn} />} />
        </HataSiniri>
      </div>
    </section>
  );
  const pusula = (
    <CanliPusula display={display} gruplar={gruplar} sahneCanli={o.kosumda} allDone={o.allDone} toplamSn={o.toplamSn} runBase={p.runBase}
      durdu={o.durdu} kapanis={kapanis} kapanisBilgi={kapanisBilgi} gelis={{ ad: fileLabel, meta: metaLine }} olgu={olgu}
      onDetay={setDetayIdx} dar={dar} hataMesaji={p.hataMesaji} onTekrarDene={p.onTekrarDene}
      kaynakSerit={dar ? <KaynakSerit segs={segs} busy={p.busy} glow={p.glow} havale={havale} onBuyut={segs ? kaynakAc : null} /> : null} />
  );
  return (
    <section style={{ minHeight: "calc(100vh - 132px)" }}>
      <HataSiniri baslik="Canlı işlem sahnesi gösterilemedi">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: SP.l, padding: dar ? `${SP.l}px ${SP.m}px 40px` : "24px clamp(16px, 3vw, 40px) 40px", maxWidth: 1540, margin: "0 auto" }}>
          <div style={{ flex: "2 1 640px", minWidth: 0, display: "flex" }}>{pusula}</div>
          {/* Kâğıt pusulayla birlikte kaymaz (hata hâlinde yüzen hata fişinin üstünde biter —
              fiş kaynak metnin son satırlarını örtüyordu): yapışkan — etkin masa aşağı inerken belge görüş
              alanında kalır (iç kaydırma). Telefonda kâğıt pusulanın içinde şerittir. */}
          {!dar && (
            <aside aria-label="Kaynak belge" style={{ flex: "1 1 340px", minWidth: 0, display: "flex", position: "sticky", top: 128, height: o.hata ? `calc(100vh - ${152 + HATA_FISI_PAYI}px)` : "calc(100vh - 152px)", minHeight: 420 }}>
              <KaynakBelge fileUrl={p.fileUrl} segs={segs} busy={p.busy} glow={p.glow} canli havale={havale} onBuyut={kaynakAc} />
            </aside>
          )}
        </div>
      </HataSiniri>
    </section>
  );
}

export default function CanliAjanAkisi(props) {
  const {
    nodes = [], katmanlar = null, result = null, busy = false, started = false, runBase = 0, fileMeta = null, pendingOnay = null,
    onDownload = bos, downloading = "", canDownload = false, onUpload = bos, onGoInbox = bos, onCancel = bos,
    glow = true, fileUrl = "", onFileDrop = bos, onTelefon = bos, hataMesaji = "", onTekrarDene = null,
  } = props;
  // Rules of Hooks: TÜM hook'lar erken dönüşten ÖNCE (started false→true'da React çökmesin).
  const [belgeModal, setBelgeModal] = useState(null);
  const [detayIdx, setDetayIdx] = useState(null);
  const [altIdx, setAltIdx] = useAltIdx(runBase);
  const [kararMuhru, kararVer] = useKararMuhru(runBase);
  const [takili, sentinelRef] = useYapisik(started);
  const dar = useDarEkran();
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  // Kaynak metin koşum SIRASINDA da: kanit_baglama SSE verisi maskeli metni + spanları getirir.
  const km = result?.kanit_metadata || nodeById.kanit_baglama?.data?.kanit_metadata || null;
  const segs = useMemo(() => (km?.metin ? buildSegments(akanMetin(km.metin), Array.isArray(km.spanlar) ? km.spanlar : []) : null), [km]);
  const { paced, sunumTamam } = useSahneTempo(nodes, { pendingOnay, glow });
  const kapanis = useKapanis({ busy, runBase, result, sunumTamam, pendingOnay });
  const { display, gruplar } = useDisplay(paced, katmanlar);
  const sonucGoster = !!result && sunumTamam && !kapanis;
  useSonucBasta(sonucGoster);

  if (!started) return <CanliBosHal onGoInbox={onGoInbox} onUpload={onUpload} onFileDrop={onFileDrop} onTelefon={onTelefon} />;

  const o = { ...durumOzeti({ display, busy, result, sunumTamam, pendingOnay }), sunumTamam };
  const draftMd = result?.yazi_taslak_md;
  const altTaslaklar = altTaslaklarOf(result);
  const decisionReady = !busy && (!!pendingOnay || !!result);
  const { fileLabel, metaLine, havale } = baslikBilgisi({ result, fileMeta, nodeById, display, sonucGoster });
  const taslak = !result ? null : (
    <CanliTaslakKarti {...TASLAK_VARSAYILAN} {...props} result={result} busy={busy} draftMd={draftMd} altTaslaklar={altTaslaklar} runBase={runBase} altIdx={altIdx} setAltIdx={setAltIdx}
      kararMuhru={kararMuhru} kararVer={kararVer} decisionReady={decisionReady} onayHazir={decisionReady && !!draftMd}
      onBuyut={() => setBelgeModal("taslak")} />
  );
  return (
    <>
      <style>{SAHNE_CSS + KAPANIS_VT_CSS}</style>
      <SrDurum display={display} o={o} />
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
      <CanliBaslik fileLabel={fileLabel} metaLine={metaLine} d={{ ...o, sonucGoster }} busy={busy} takili={takili} dar={dar}
        display={display} durdu={o.durdu} pct={o.pct} onCancel={onCancel} onUpload={onUpload} onTelefon={onTelefon} />
      <CanliSahne p={{ ...props, glow, busy, runBase, fileUrl, hataMesaji, onTekrarDene, taslak }} o={o} display={display} gruplar={gruplar} segs={segs} kapanis={kapanis}
        fileLabel={fileLabel} metaLine={metaLine} olgu={kunyeOlgulari(result, nodeById, havale)} havale={havale} dar={dar}
        setDetayIdx={setDetayIdx} setBelgeModal={setBelgeModal} />
      <CanliModallar detayIdx={detayIdx} setDetayIdx={setDetayIdx} display={display} result={result} runBase={runBase} dar={dar}
        belgeModal={belgeModal} setBelgeModal={setBelgeModal} fileLabel={fileLabel} km={km} segs={segs} fileUrl={fileUrl}
        draftMd={draftMd} onDownload={onDownload} canDownload={canDownload} downloading={downloading} />
    </>
  );
}

/* Adım detayı (satır tıklanınca; ←/→ ile gezinilir; koşum sürerken de açılır) + belge modalları. */
function CanliModallar({ detayIdx, setDetayIdx, display, result, runBase, dar, belgeModal, setBelgeModal, fileLabel, km, segs, fileUrl, draftMd, onDownload, canDownload, downloading }) {
  return (
    <>
      <AnimatePresence>
        {detayIdx != null && display[detayIdx] && (
          <AjanAdimDetay key="adim-detay" idx={detayIdx} display={display} result={result} runBase={runBase} dar={dar}
            onKapat={() => setDetayIdx(null)} onGit={setDetayIdx} />
        )}
      </AnimatePresence>
      <BelgeModal acik={belgeModal === "kaynak"} baslik="Kaynak belge" dosyaAdi={fileLabel}
        metin={km?.metin || ""} segmentler={segs} fileUrl={fileUrl} onKapat={() => setBelgeModal(null)} />
      <BelgeModal acik={belgeModal === "taslak"} baslik="Resmî yazı taslağı" dosyaAdi={fileLabel}
        metin={draftMd ? cleanDemoText(draftMd) : ""} onKapat={() => setBelgeModal(null)}
        eylemler={draftMd ? (
          <>
            <ScrimDugme onClick={() => onDownload("pdf")} disabled={!canDownload || downloading === "pdf"} title="Resmî yazıyı PDF indir">{downloading === "pdf" ? "indiriliyor…" : "PDF indir"}</ScrimDugme>
            <ScrimDugme onClick={() => onDownload("docx")} disabled={!canDownload || downloading === "docx"} title="Resmî yazıyı DOCX indir">{downloading === "docx" ? "indiriliyor…" : "DOCX"}</ScrimDugme>
          </>
        ) : null} />
    </>
  );
}
