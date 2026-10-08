/* AjanAdimDetay — pusula satırına / özet noktasına tıklanınca açılan masa ayrıntısı.
   Her masanın NE yaptığını (görev açıklaması) ve NE ürettiğini (node-tipine özel zengin çıktı —
   gövdeler AjanAdimGovde.jsx'te) tek katmanda gösterir.
   İki kabuk, AYNI içerik (tur 6):
   · Masaüstü: ortalı diyalog (PAL.scrim + SH.modal + RAD.pop; scrim yalnız solar, içerik
     y+scale ile girer ve aynı yoldan çıkar — AnimatePresence sarmalayıcıda).
   · Telefon (≤640): vaul alttan açılan panel — sürükleme tutamacı, aşağı çekip kapatma, alt
     güvenli alan. Uygulamanın geri kalanında (TelefonYukle) kurulan dil burada da geçerli.
   a11y: role=dialog + aria-modal, Esc kapatır, ←/→ masalar arasında gezdirir, açılışta odak
   kapat düğmesine, kapanışta tetikleyiciye döner. Durum tek kaynaktan (adimDurumu, §10). */
import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { Drawer } from "vaul";
import { adimDurumu } from "../lib/akisKatman.js";
import { Chip } from "./NeonDetayParts.jsx";
import { Paraf, CanliSure } from "./CanliMetro.jsx";
import { gorevFaz } from "../lib/pipelinePhases.js";
import { duvarMs, fmtSn } from "../lib/canliBicim.js";
import { akanMetin } from "../lib/metinAkis.js";
import { FosforMetin } from "./CanliKaynakBelge.jsx";
import { buildSegments, kesitBasligi } from "../lib/canliMetin.js";
import { useMedyaSorgusu } from "../hooks/useMedya.js";
import { ACIKLAMA, GOVDE, GenelDetay, Bolum, Not } from "./AjanAdimGovde.jsx";
import {
  DISPLAY, T, V, PAL, BANT, DERIN, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, EASE, EASE_BEZIER, focusRing, Icon, odakDongusu, SR_ONLY,
} from "./neonUi.jsx";

/* Konum şeridi — masaların mini haritası, FAZ gruplarıyla (I | II, arada ince ayraç);
   start.katmanlar'dan aynı katmana düşen komşular tek "yuva" zemininde durur (yapı haritadan,
   iddia değil — §8). Telefonda yatay kaydırılır (scroll-snap) ve her hedef 44px'tir
   (tur 6: 22px noktalar 13+2 diye kırılıyordu, dokunma hedefi kuralının yarısıydı). */
function KonumNokta({ x, i, idx, onGit, dar }) {
  const no = String(i + 1).padStart(2, "0");
  const col = x.gorev === 2 ? V : T;
  const done = x.status === "done", err = x.status === "error";
  const secili = i === idx;
  const boy = dar ? 44 : 24;
  return (
    <button type="button" onClick={() => onGit(i)} title={`${no} · ${x.label}`} data-secili={secili ? "" : undefined}
      aria-label={`${no}. masa, ${x.label} adımına git`} aria-current={secili ? "step" : undefined} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ cursor: "pointer", width: dar ? 36 : boy, height: boy, flexShrink: 0, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, background: "transparent", borderRadius: RAD.ctl, border: `1px solid ${secili ? PAL.lineHi : "transparent"}`, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      <span aria-hidden="true" style={{ width: secili ? 11 : 8, height: secili ? 11 : 8, borderRadius: RAD.dot, background: err ? BANT.kirmizi.c : done ? col : PAL.bg, border: done || err ? "none" : `1px solid ${PAL.lineHi}` }} />
    </button>
  );
}

function KonumSeridi({ display, idx, onGit, dar }) {
  const kapRef = useRef(null);
  useEffect(() => {
    if (!dar) return;
    kapRef.current?.querySelector("[data-secili]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [idx, dar]);
  const ayni = (x, y) => !!y && x.katman != null && y.katman === x.katman && y.gorev === x.gorev;
  const parcalar = [];
  display.forEach((x, i) => {
    const onceki = display[i - 1], sonraki = display[i + 1];
    if (onceki && onceki.gorev !== x.gorev) parcalar.push(<span key={`f${i}`} aria-hidden="true" style={{ width: 1, alignSelf: "stretch", margin: `4px ${SP.s}px`, background: PAL.lineHi, flexShrink: 0 }} />);
    const sol = ayni(x, onceki), sag = ayni(x, sonraki);
    const yaricap = sol && sag ? 0 : sol ? `0 ${RAD.ctl}px ${RAD.ctl}px 0` : sag ? `${RAD.ctl}px 0 0 ${RAD.ctl}px` : 0;
    parcalar.push(
      <span key={x.id} style={{ display: "flex", flexShrink: 0, background: sol || sag ? PAL.press : "transparent", borderRadius: yaricap }}>
        <KonumNokta x={x} i={i} idx={idx} onGit={onGit} dar={dar} />
      </span>,
    );
  });
  return (
    <div ref={kapRef} role="group" aria-label="Masalar arasında geçiş" style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 2, padding: `${SP.s}px 0 ${SP.m}px`, borderBottom: `1px solid ${PAL.line}`, overflowX: "auto", scrollSnapType: dar ? "x mandatory" : undefined, scrollbarWidth: "none" }}>
      {parcalar}
      {/* Bağlam künyesi (tur 9: şerit etiketsiz ve şifreliydi) — bulunulan masa "03 / 15 · ad". */}
      {!dar && display[idx] && (
        <span aria-hidden="true" style={{ marginLeft: "auto", paddingLeft: SP.m, ...TYPE.antet, fontSize: 10, color: PAL.mut2, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, ...TNUM }}>
          <span style={{ color: PAL.ink2, fontWeight: 600 }}>{String(idx + 1).padStart(2, "0")} / {String(display.length).padStart(2, "0")}</span> · {display[idx].label}
        </span>
      )}
    </div>
  );
}

/* Durum çipi — sahnedeki satırla AYNI kaynaktan (adimDurumu). */
function DurumCip({ st, col, a = null, durdu = false }) {
  const durum = a ? adimDurumu(a) : null;
  // Başlamış ama koşum kesilmiş masa (t0 = backend "başladı" damgası) — "işlenmedi" DEĞİL (§9).
  if (durdu && durum === "bekliyor" && Number.isFinite(a?.t0)) return <Chip c={BANT.kirmizi.c} label="Adım çalışırken işlem kesildi">yarıda kesildi</Chip>;
  if (durdu && durum === "bekliyor") return <Chip c={PAL.mut2} label="İşlem önceki bir adımda durduğu için bu adım işlenmedi">işlenmedi</Chip>;
  if (durum === "atlandi") return <Chip c={PAL.mut2} label="Bu adım bu koşumda hiç çalışmadı (akış başka dala gitti)">çalışmadı</Chip>;
  if (durum === "gerekmedi") return <Chip c={PAL.mut2} label="Adım çalıştı ancak bu belgede yapacak işi yoktu">gerekmedi</Chip>;
  if (st === "active") return <Chip c={T} label="Adım şu anda çalışıyor">işleniyor</Chip>;
  if (st === "error") return <Chip c={BANT.kirmizi.c} label="Adım hatayla sonuçlandı"><Icon.x width={11} height={11} /> hata</Chip>;
  if (st === "done") return <Chip c={col} label="Adım tamamlandı"><Icon.check width={11} height={11} /> tamamlandı</Chip>;
  return <Chip c={PAL.mut2} label="Adım sırada bekliyor">sırada</Chip>;
}

/* Esc / ←→ + açılışta odak (+ masaüstünde body kilidi; telefonda kilidi vaul tutar). Canlı
   prop'lar ref'ten okunur → effect YALNIZ mount'ta koşar (SSE render'ları odağı çalmaz). */
function useDetayKlavye({ idx, onKapat, onGit, son, kapatRef, kilit }) {
  const canli = useRef({});
  canli.current = { idx, onKapat, onGit, son };
  useEffect(() => {
    const oncekiOdak = document.activeElement;
    kapatRef.current?.focus();
    const tusla = (e) => {
      const c = canli.current;
      if (e.key === "Escape") c.onKapat();
      else if (e.key === "ArrowLeft" && c.idx > 0) c.onGit(c.idx - 1);
      else if (e.key === "ArrowRight" && c.idx < c.son) c.onGit(c.idx + 1);
    };
    document.addEventListener("keydown", tusla);
    const eski = document.body.style.overflow;
    if (kilit) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tusla);
      if (kilit) document.body.style.overflow = eski;
      oncekiOdak?.focus?.();
    };
  }, [kapatRef, kilit]);
}

function NavDugme({ hedef, etiket, sagOk = false, onGit, dar }) {
  return (
    <button type="button" disabled={!hedef} onClick={() => hedef && onGit(hedef.sira)} {...focusRing} data-press=""
      aria-label={hedef ? `${sagOk ? "Sonraki" : "Önceki"} masa: ${hedef.label}` : undefined}
      onMouseEnter={(e) => { if (hedef) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: hedef ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: SP.s, padding: "8px 14px", minHeight: dar ? 44 : 36, maxWidth: dar ? "48%" : "40%", borderRadius: RAD.ctl, border: `1px solid ${hedef ? PAL.inputLine : PAL.line}`, background: PAL.surf, color: hedef ? PAL.ink : PAL.mut2, ...TYPE.ui, fontWeight: 500, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      {!sagOk && <span aria-hidden="true" style={{ display: "flex", transform: "rotate(180deg)" }}><Icon.arrow width={13} height={13} /></span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiket}</span>
      {sagOk && <span aria-hidden="true" style={{ display: "flex" }}><Icon.arrow width={13} height={13} /></span>}
    </button>
  );
}

function KapatDugme({ kapatRef, onKapat }) {
  return (
    <button ref={kapatRef} type="button" onClick={onKapat} aria-label="Detayı kapat (Esc)" {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: PAL.mut, flexShrink: 0, transition: `background .12s ease-out, transform .14s ${EASE.out}` }}>
      <Icon.x />
    </button>
  );
}

function DetayBaslik({ a, idx, toplam, col, bantC, durdu, runBase, kapatRef, onKapat, BaslikEtiketi }) {
  // TEK SAAT: başlıkta sahnedeki satırla AYNI ölçü (görülen süre, t1−t0). Sunucunun kendi
  // işlem telemetrisi ayrı ve adıyla yazılır — iki saat aynı etiketi paylaşmaz (tur 8).
  const sure = a.status === "done" ? fmtSn(duvarMs(a)) : null;
  const sunucu = a.status === "done" && Number.isFinite(Number(a.durationMs)) && a.durationMs != null ? fmtSn(Number(a.durationMs)) : null;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase" }}>
        <span style={{ whiteSpace: "nowrap" }}>Havale pusulası · masa ayrıntısı</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 8 }} />
        <KapatDugme kapatRef={kapatRef} onKapat={onKapat} />
      </div>
      <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
      <div style={{ display: "flex", alignItems: "center", gap: SP.l, marginTop: SP.l }}>
        <span aria-hidden="true" style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "112%", fontSize: 56, lineHeight: 0.85, letterSpacing: "-.05em", color: DERIN_OF(bantC || col), flexShrink: 0, ...TNUM }}>{String(idx + 1).padStart(2, "0")}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: SP.m, flexWrap: "wrap" }}>
            <BaslikEtiketi key={a.id} style={{ margin: 0, ...TYPE.h2, fontSize: 24, lineHeight: "28px", color: PAL.ink, animation: "ke-e-masa .2s var(--ke-ease-out) both" }}>{a.label}</BaslikEtiketi>
            <DurumCip st={a.status} col={bantC || col} a={a} durdu={durdu} />
          </div>
          <div style={{ marginTop: 4, ...TYPE.meta, color: PAL.mut2, ...TNUM }}>
            <span style={{ color: DERIN_OF(col), fontWeight: 500 }}>{gorevFaz(a.gorev).uzun}</span>
            {" · "}masa {idx + 1}/{toplam}{sure ? <>{" · "}<span title={sunucu ? `Duvar saati süresi; sunucu işlem süresi ${sunucu}` : "Duvar saati süresi"}>{sure}</span></> : ""}
            {a.status === "active" && <>{" · "}<CanliSure runBase={runBase} t0={a.t0} style={{ color: DERIN_OF(col), fontWeight: 600 }} /></>}
          </div>
        </div>
        <span key={`p-${a.id}`} style={{ flexShrink: 0 }}><Paraf a={a} durum={adimDurumu(a)} col={bantC || col} /></span>
      </div>
    </>
  );
}

function DetayCikti({ a, result, col, durdu }) {
  const durum = adimDurumu(a);
  if (durum === "bekliyor" || durum === "atlandi") {
    return <Not t={durum === "atlandi" ? "Akış koşullu dalda başka yere gitti; bu adım bu koşumda hiç çalışmadı."
      : durdu ? "İşlem önceki bir adımda durduğu için bu adıma sıra gelmedi." : "Bu adım henüz çalışmadı; sıra geldiğinde çıktısı burada görünür."} />;
  }
  if (a.status === "error") return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: SP.s, padding: "10px 12px", background: ALFA(BANT.kirmizi.c), border: `1px solid ${BANT.kirmizi.c}`, borderRadius: RAD.card, ...TYPE.data, fontWeight: 500, color: DERIN.kirmizi }}>
      <Icon.alert /> Adım hatayla sonuçlandı — koşum bu noktada kesildi.
    </div>
  );
  const Icerik = GOVDE[a.id] || GenelDetay;
  const bekliyorVeri = a.status === "active" && !a.data;
  return (
    <div key={a.id} style={{ animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      {bekliyorVeri && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginBottom: SP.s, ...TYPE.data, color: DERIN_OF(col) }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RAD.dot, background: col, animation: "nu-think 1.2s ease-in-out infinite" }} />
          Çalışıyor — çıktı hazır olduğunda burada görünecek…
        </div>
      )}
      {/* Çalışan ve verisi gelmemiş adımın gövdesi ÇİZİLMEZ (yokluktan hüküm türetilmez). */}
      {!bekliyorVeri && <Icerik d={a.data || {}} r={result} a={a} />}
    </div>
  );
}

function DetayIcerik({ idx, display, result, onKapat, onGit, runBase, kapatRef, dar, BaslikEtiketi }) {
  const a = display[idx];
  const col = a.gorev === 2 ? V : T;
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const durdu = display.some((x) => x.status === "error");
  // Klavye ipucu yalnız hassas işaretçide (tur 6: dokunmatikte 3 satıra kırılıyordu).
  const ipucu = useMedyaSorgusu("(hover: hover) and (pointer: fine)");
  const onceki = display[idx - 1], sonraki = display[idx + 1];
  return (
    <>
      <DetayBaslik a={a} idx={idx} toplam={display.length} col={col} bantC={bantC} durdu={durdu} runBase={runBase} kapatRef={kapatRef} onKapat={onKapat} BaslikEtiketi={BaslikEtiketi} />
      <KonumSeridi display={display} idx={idx} onGit={onGit} dar={dar} />
      <Bolum t="Bu adım ne yapar">
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut }}>{ACIKLAMA[a.id] || a.desc || "Pipeline adımı."}</p>
      </Bolum>
      <Bolum t="Çıktı ve gerekçe"><DetayCikti a={a} result={result} col={col} durdu={durdu} /></Bolum>
      {/* Gezinme çubuğu sütunun dibine oturur (tur 9: kaynak kesiti uzunken ortada asılıydı). */}
      <div aria-hidden="true" style={{ flex: 1, minHeight: SP.xl }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, paddingTop: SP.l, borderTop: `1px solid ${PAL.line}` }}>
        <NavDugme hedef={onceki} etiket={onceki ? onceki.label : "İlk masa"} onGit={onGit} dar={dar} />
        {ipucu && !dar && <span style={{ ...TYPE.meta, color: PAL.mut3, textAlign: "center", whiteSpace: "nowrap" }}>← → gezinir · Esc kapatır</span>}
        <NavDugme hedef={sonraki} etiket={sonraki ? sonraki.label : "Son masa"} sagOk onGit={onGit} dar={dar} />
      </div>
    </>
  );
}

/* KAYNAK KESİTİ (tur 8, geniş ekran ≥1200): masanın çıktısı solda, okunan belgenin maskeli
   metni (kanıt alanları fosforlu) sağda — ayrıntıya inen memur çıktıyı kaynağıyla yan yana
   denetler. Metin yalnız kanıt bağlama adımının SSE verisinden (maskeli); yoksa kesit yok,
   diyalog eski tek sütun genişliğinde kalır. Kâğıt gece de kâğıttır (data-evrak-kagit). */
const kaynakMetadata = (display, result) => result?.kanit_metadata || display.find((x) => x.id === "kanit_baglama")?.data?.kanit_metadata || null;

/* Kesit başlığı olguya bağlı (tur 8-9): maskeli alan sayısı + açık e-posta lib/canliMetin.kesitBasligi'nden;
   "maskeli metin" demek iddiayı genişletirdi. */
function KaynakKesiti({ km }) {
  const segs = useMemo(() => buildSegments(akanMetin(km.metin), Array.isArray(km.spanlar) ? km.spanlar : []), [km]);
  return (
    <aside aria-label="Kaynak kesiti" style={{ minWidth: 0, display: "flex", flexDirection: "column", alignSelf: "start", position: "sticky", top: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, ...TYPE.antet, color: PAL.mut2, textTransform: "uppercase", minHeight: 36 }}>
        <span style={{ whiteSpace: "nowrap" }}>{kesitBasligi(km.metin)}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line }} />
      </div>
      <div aria-hidden="true" style={{ marginTop: SP.s, height: 5, borderTop: `2px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.9 }} />
      <div data-evrak-kagit="" style={{ marginTop: SP.l, background: PAL.surf, color: PAL.ink2, border: `1px solid ${PAL.line}`, borderRadius: RAD.ctl, boxShadow: SH.kagit, padding: `${SP.xl}px ${SP.xl + 4}px`, maxHeight: "min(66vh, 680px)", overflowY: "auto" }}>
        <FosforMetin segs={segs} canli={false} style={{ fontSize: 14, lineHeight: "22px", animation: "none" }} />
      </div>
    </aside>
  );
}

function H2(props) { return <h2 {...props} />; }
function CekmeceBaslik(props) { return <Drawer.Title asChild><h2 {...props} /></Drawer.Title>; }

/* Telefon kabuğu — vaul. Kontrollü open: bileşen yalnız detay açıkken mount edilir. */
function DetayCekmece({ p, kapatRef }) {
  const a = p.display[p.idx];
  return (
    <Drawer.Root open onOpenChange={(v) => { if (!v) p.onKapat(); }}>
      <Drawer.Portal>
        {/* Çift perde: tek scrim katında arkadaki pusula künyesi panelin üstünden okunuyordu. */}
        <Drawer.Overlay style={{ position: "fixed", inset: 0, zIndex: 320, background: `linear-gradient(${PAL.scrim}, ${PAL.scrim}), linear-gradient(${PAL.scrim}, ${PAL.scrim})` }} />
        <Drawer.Content onOpenAutoFocus={(e) => { e.preventDefault(); kapatRef.current?.focus(); }} aria-label={`${a.label}: masa ayrıntısı`}
          style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 320, maxHeight: "92vh", display: "flex", flexDirection: "column", background: PAL.surfPop, borderTop: `1px solid ${PAL.lineHi}`, borderTopLeftRadius: RAD.pop, borderTopRightRadius: RAD.pop, boxShadow: SH.modal, outline: "none", willChange: "transform" }}>
          <Drawer.Description style={SR_ONLY}>Masanın görev açıklaması ve ürettiği çıktı.</Drawer.Description>
          <Drawer.Handle style={{ margin: "10px auto 0", width: 36, height: 4, background: PAL.lineHi, borderRadius: RAD.dot, flexShrink: 0 }} />
          <div style={{ overflowY: "auto", padding: `${SP.m}px ${SP.l}px calc(${SP.l}px + env(safe-area-inset-bottom, 0px))` }}>
            <DetayIcerik {...p} kapatRef={kapatRef} dar BaslikEtiketi={CekmeceBaslik} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default function AjanAdimDetay(p) {
  const { idx, display, onKapat, onGit, dar = false } = p;
  const kapatRef = useRef(null);
  useDetayKlavye({ idx, onKapat, onGit, son: display.length - 1, kapatRef, kilit: !dar });
  const genis = useMedyaSorgusu("(min-width: 1200px)");
  const a = display[idx];
  const km = kaynakMetadata(display, p.result);
  const kesit = !dar && genis && km?.metin ? km : null;
  if (!a) return null;
  if (dar) return <DetayCekmece p={p} kapatRef={kapatRef} />;
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={`${a.label}: masa ayrıntısı`} onClick={onKapat} onKeyDown={odakDongusu}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: PAL.scrim, overflowY: "auto", padding: "48px 16px" }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.16, ease: EASE_BEZIER.out }}
        style={{ width: kesit ? "min(1180px, 96vw)" : "min(720px, 96vw)", margin: "0 auto", background: PAL.surfPop, border: `1px solid ${PAL.lineHi}`, borderRadius: RAD.pop, boxShadow: SH.modal, padding: SP.xl, ...(kesit ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 440px)", columnGap: SP.xxl } : null) }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}><DetayIcerik {...p} kapatRef={kapatRef} dar={false} BaslikEtiketi={H2} /></div>
        {kesit && <KaynakKesiti km={kesit} />}
      </motion.div>
    </motion.div>
  );
}
