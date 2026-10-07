/* CanliKaynakBelge — canlı sahnenin ve sonuç ekranının "okunan belge" kâğıdı (tur 6'da
   CanliAjanAkisi'nden ayrıldı: dosya <800 kuralı).
   · KaynakBelge: masaüstü paneli (A4 kâğıt "masa" üstünde; PDF ↔ maskeli metin sekmesi).
   · KaynakSerit: TELEFON — pusulanın içinde katlanmış kâğıt şeridi (ilk ~6 satır + fosfor).
     Tur 6 jüri bulgusu: telefonda kaynak 15 satırlık metronun ~2400px altına düşüyor, fosfor
     kalem anı canlı koşumda hiç görülmüyordu.
   Kâğıt koyu temada da KÂĞITTIR: `data-evrak-kagit` kapsamı (temaCss) alt ağacı açık "gece
   kâğıdı" token'larına çevirir — fosfor vurgusu kahverengi zeminde sarı metin olmaz.
   `viewTransitionName: ke-kaynak-kagit`: canlı → sonuç geçişinde AYNI kâğıt sağ sütundan sol
   sütuna kayar (tur 6: bir yanda kaybolup öbür yanda beliriyordu). Aynı anda tek örnek var. */
import { lazy, Suspense, useState } from "react";
import { T, PAL, BANT, DERIN, ALFA, TYPE, RAD, SP, SH, focusRing, Icon, BuyutDugme } from "./neonUi.jsx";

export const KAGIT_VT = "ke-kaynak-kagit";

export function buildSegments(metin, spanlar) {
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

/* Fosfor kalem: kanıt spanları canlı koşumda soldan sağa sırayla boyanır (çıkarım "şimdi"
   işaretleniyor); sonuç ekranında statik. */
export function FosforMetin({ segs, canli, style = null }) {
  let m = 0;
  return (
    <pre style={{ margin: 0, ...TYPE.read, color: PAL.ink2, whiteSpace: "pre-wrap", wordBreak: "break-word", animation: "nu-rise .18s var(--ke-ease-out) both", ...style }}>
      {segs.map((sg, i) => sg.mark ? (
        <mark key={i} data-kd="alan-vurgu" style={{ background: "none", backgroundImage: `linear-gradient(color-mix(in srgb, ${BANT.sari.c} 26%, transparent), color-mix(in srgb, ${BANT.sari.c} 26%, transparent))`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", color: DERIN.sari, borderRadius: 3, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", animation: canli ? `ke-e-fosfor .55s var(--ke-ease-out) ${Math.min(m++ * 140, 800)}ms both` : "none" }}>{sg.t}</mark>
      ) : <span key={i}>{sg.t}</span>)}
    </pre>
  );
}

/* HAVALE ÖNERİSİ — birim yönlendirme adımı GERÇEKTEN bir birim önerdiğinde memurun kenar notu
   gibi sayfanın üstüne düşer. "Öneri"dir, otomatik havale DEĞİL (CLAUDE.md §5). */
function HavaleNotu({ havale, sik = false }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", marginBottom: sik ? SP.s : SP.l, paddingBottom: sik ? 0 : SP.s, animation: "nu-rise .3s var(--ke-ease-out) both" }}>
      <span style={{ ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>Havale önerisi</span>
      <span style={{ position: "relative", ...TYPE.ui, fontWeight: 600, color: DERIN.T }}>
        → {havale}
        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 2, background: T, borderRadius: 2, transformOrigin: "left", animation: "ke-e-cizgi .6s var(--ke-ease-out) .25s both" }} />
      </span>
    </div>
  );
}

/* Belge iskeleti — gerçek bir yazı sayfasının düşük-kontrast önizlemesi; şerit şerit nefes
   alır. NN/g: iskelet, spinner'a göre algılanan süreyi kısaltır. */
function BelgeIskeleti({ busy, glow, satir = [96, 100, 92, 88, 100, 64] }) {
  return (
    <div style={{ ...TYPE.data, color: PAL.mut2 }}>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: SP.s, marginBottom: SP.l }}>
        <div style={{ height: 8, width: "42%", background: PAL.press, borderRadius: RAD.chip, marginBottom: SP.xs, animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
        {satir.map((w, i) => (
          <div key={i} style={{ height: 8, width: `${w}%`, background: PAL.press, borderRadius: RAD.chip, animation: busy && glow ? `nu-think 1.4s ease-in-out ${i * 140}ms infinite` : "none" }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s }}>
        {busy && <Icon.spin width={14} height={14} />}
        {busy ? "Kaynak metin okunuyor; unsurlar maskelenip işaretlenecek…" : "Bu koşumda kaynak metin alınamadı."}
      </div>
    </div>
  );
}

const PdfOnizleme = lazy(() => import("./PdfOnizleme.jsx"));

function SekmeBtn({ id, label, sekme, setSekme }) {
  const on = sekme === id;
  return (
    <button type="button" onClick={() => setSekme(id)} aria-pressed={on} {...focusRing} data-press=""
      style={{ cursor: "pointer", padding: "2px 10px", borderRadius: RAD.chip, border: `1px solid ${on ? T : PAL.line}`, background: on ? ALFA(T) : PAL.surf, color: on ? DERIN.T : PAL.mut2, ...TYPE.meta, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
      {label}
    </button>
  );
}

/* OKUMA ÇİZGİSİ — yalnız metin HENÜZ yokken (okuma sürüyor) sayfanın üstünden dibine iner;
   metin belirince okuma bitmiştir, ışın söner (reduced-motion'da .ke-e-tarayici gizli). */
const Tarayici = () => (
  <span aria-hidden="true" className="ke-e-tarayici" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, background: `linear-gradient(180deg, transparent calc(100% - 110px), color-mix(in srgb, ${T} 11%, transparent) calc(100% - 2px), ${T} calc(100% - 2px))`, animation: "ke-e-tara 2.8s cubic-bezier(.45,0,.55,1) infinite" }} />
);

export function KaynakBelge({ fileUrl, segs, busy, glow, onBuyut, compact = false, ekAksiyon = null, canli = false, havale = null }) {
  const [sekme, setSekme] = useState("belge");
  /* Kaynak metin UI okuma tipografisinde (TYPE.read, 16px) kalır — bu panel okunmak için var. */
  const pdfGoster = !!fileUrl && (sekme === "belge" || !segs);
  // Klavye/SR yolu başlıktaki BuyutDugme (kâğıda role=button vermek tüm metni tek kontrol
  // adına düzleştiriyordu — a11y bulgusu); fare için kâğıdın kendisi tıklanabilir.
  const tiklanabilir = !!onBuyut && (!!fileUrl || !!segs);
  /* CANLI KİPTE KÂĞIT DOĞRUDAN MASADA (tur 8): kart içinde kart (çift çerçeve) dar bir şerit
     gibi okunuyordu. Canlı sahnede dış kart yok — üstte antet künyesi + hairline, altında kâğıt
     sayfa zemininde (SH.kagit) durur; okuma puntosu 14/22 (satır başına ~45 karakter). */
  const masada = canli && !compact;
  const kabStil = masada
    ? { display: "flex", flexDirection: "column", minWidth: 0, width: "100%", height: "100%" }
    : { display: "flex", flexDirection: "column", minWidth: 0, width: "100%", height: "100%", borderRadius: RAD.card, background: PAL.surf, border: `1px solid ${PAL.line}`, boxShadow: SH.card, overflow: "hidden" };
  return (
    <div data-kd="kaynak-kart" style={kabStil}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, padding: masada ? `0 0 ${SP.s}px` : `${SP.m}px ${SP.l}px`, borderBottom: `1px solid ${masada ? PAL.lineHi : PAL.line}`, flexWrap: "wrap", minHeight: masada ? 36 : undefined }}>
        {!masada && <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: DERIN.T }}><Icon.doc /></span>}
        <span style={masada ? { ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", flex: 1, minWidth: 60 } : { ...TYPE.ui, fontWeight: 600, color: PAL.ink, flex: 1, minWidth: 60 }}>Okunan belge</span>
        {ekAksiyon}
        {fileUrl && segs && (<><SekmeBtn id="belge" label="Belge" sekme={sekme} setSekme={setSekme} /><SekmeBtn id="metin" label="Metin" sekme={sekme} setSekme={setSekme} /></>)}
        {tiklanabilir && <BuyutDugme onClick={onBuyut} label="Okunan belgeyi A4 görünümde büyüt" />}
      </div>
      <div data-kd="kaynak-masa" style={{ flex: 1, background: masada ? "transparent" : PAL.surf2, padding: masada ? `${SP.m}px 2px ${SP.s}px` : `${SP.m}px ${SP.s}px`, display: "flex", minHeight: 0, ...(compact || canli ? { overflowY: "auto" } : null) }}>
        <div data-kd="kaynak-kagit" data-evrak-kagit=""
          {...(tiklanabilir ? { onClick: onBuyut, title: "Büyüt (A4 görünüm)" } : {})}
          style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 840, margin: "0 auto", alignSelf: "flex-start", minHeight: "100%", boxSizing: "border-box", background: PAL.surf, color: PAL.ink2, border: `1px solid ${PAL.line}`, borderRadius: masada ? RAD.ctl : RAD.card, padding: masada ? "clamp(24px,2.4vw,40px) clamp(20px,2.2vw,36px)" : "clamp(24px,3.5vw,48px) clamp(20px,4vw,60px)", boxShadow: SH.kagit, cursor: tiklanabilir ? "zoom-in" : "default", overflow: "hidden", viewTransitionName: KAGIT_VT }}>
          {canli && busy && !segs && !pdfGoster && <Tarayici />}
          {canli && havale && <HavaleNotu havale={havale} />}
          {pdfGoster ? (
            <Suspense fallback={<div style={{ ...TYPE.data, color: PAL.mut2 }}>PDF açılıyor…</div>}>
              <PdfOnizleme fileUrl={fileUrl} />
            </Suspense>
          ) : segs ? <FosforMetin segs={segs} canli={canli} style={masada ? { fontSize: 14, lineHeight: "22px" } : null} /> : <BelgeIskeleti busy={busy} glow={glow} />}
        </div>
      </div>
    </div>
  );
}

/* TELEFON KÂĞIT ŞERİDİ — pusulanın içinde, ıstampanın yerinde: belgenin ilk ~6 satırı (kanıt
   alanları belge başında yoğunlaşır: kurum, tarih, konu) fosforla canlı boyanır; alt kenar
   kâğıdın devam ettiğini söyleyen yumuşak bir maskeyle biter. Dokununca A4 modal açılır. */
export function KaynakSerit({ segs, busy, glow, havale = null, onBuyut }) {
  const acik = !!segs && !!onBuyut;
  return (
    <div data-evrak-kagit="" onClick={acik ? onBuyut : undefined}
      style={{ position: "relative", background: PAL.surf, color: PAL.ink2, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, boxShadow: SH.kagit, padding: `${SP.m}px ${SP.l}px ${SP.s}px`, overflow: "hidden", viewTransitionName: KAGIT_VT, cursor: acik ? "zoom-in" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s }}>
        <span style={{ ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", flex: 1 }}>Okunan belge</span>
        {acik && <span onClick={(e) => e.stopPropagation()}><BuyutDugme onClick={onBuyut} label="Okunan belgeyi A4 görünümde aç" /></span>}
      </div>
      {busy && !segs && <Tarayici />}
      {havale && <HavaleNotu havale={havale} sik />}
      <div style={{ maxHeight: 6 * 22, overflow: "hidden", WebkitMaskImage: "linear-gradient(180deg, black 70%, transparent)", maskImage: "linear-gradient(180deg, black 70%, transparent)" }}>
        {segs ? <FosforMetin segs={segs} canli style={{ fontSize: 14, lineHeight: "22px" }} /> : <BelgeIskeleti busy={busy} glow={glow} satir={[96, 100, 88, 72]} />}
      </div>
    </div>
  );
}
