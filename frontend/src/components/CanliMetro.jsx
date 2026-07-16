/* CanliMetro — canlı koşum sahnesinin metro şeması + gösteri katmanı.
   CanliAjanAkisi'nden taşındı (dosya <800 kuralı) ve "SAHNE Epik" istisnasıyla güçlendirildi
   (2026-07-16, kullanıcı onayı: bu sahnede glow/gradyan serbest — çekirdek tema değişmez):
   · Ray DOLARAK akar (yükseklik geçişi) — tamamlanan adım hattı bir sonraki istasyona "dökülür".
   · Aktif segmentte çift ışık kuyruğu + hat renginde glow (Aceternity "tracing beam" uyarlaması).
   · İstasyon tamamlanınca pop + dışa yayılan ışıklı halka (nu-halka).
   · Aktarma roundeli hat hizmete girince ateşlenir (halka + glow); canlı hat rozeti yanar.
   · Sayaçlar NumberFlow ile yuvarlanır (repo bağımlılığı — PanelView deseni).
   · Aurora: kart arkasında T/V tonlarında yavaş gezinen bulanık ışık (nu-gezin).
   a11y: renk tek sinyal değil; tüm animasyonlar prefers-reduced-motion'da söner. */
import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { MONO, SANS, T, V, PAL, BANT, DERIN_OF, ALFA, TYPE, TNUM, RAD, SP, SH, focusRing, Icon } from "./neonUi.jsx";

/* Geometri: 28px oluk, ray x=13. Glow yalnız bu sahnede (Epik istisna). */
const HAT = { x: 13, w: 2, merkez: 16 };
const GLOW = (c, p = 45) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

/* Oluk içi dikey ray parçası — zemin hairline üstünde hat rengi YUKARIDAN AŞAĞI dolar
   (hat istasyona dökülür). akis: aktif istasyona giren parçada çift ışık kuyruğu + glow. */
const Ray = ({ top, height, bottom, filled, col, akis }) => (
  /* Dolum scaleY, kuyruk translateY — ikisi de compositor'da kalır (layout anime yok;
     jüri turu bulgusu: top/height animasyonu zayıf makinede jank üretir). Kuyruk span'ı
     ray boyunda; gradyan üst 22px'te (background-size) — translateY(-22px→100%) tam süpürme. */
  <span aria-hidden="true" style={{ position: "absolute", left: HAT.x, width: HAT.w, top, height, bottom, background: PAL.line, overflow: "hidden", boxShadow: akis ? `0 0 10px ${GLOW(col, 50)}` : "none", transition: "box-shadow .3s ease" }}>
    <span style={{ position: "absolute", inset: 0, background: col, transformOrigin: "top", transform: filled ? "scaleY(1)" : "scaleY(0)", transition: "transform .45s var(--ke-ease-in-out)" }} />
    {filled && akis && (
      <>
        <span style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent, ${PAL.onAccent}, transparent)`, backgroundSize: "100% 22px", backgroundRepeat: "no-repeat", opacity: 0.95, animation: "nu-iz 1.1s linear infinite" }} />
        <span style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent, ${PAL.onAccent}, transparent)`, backgroundSize: "100% 22px", backgroundRepeat: "no-repeat", opacity: 0.55, animation: "nu-iz 1.1s linear .55s infinite" }} />
      </>
    )}
  </span>
);

/* İstasyon işareti — dolu disk (bitti: pop + ışıklı halka) · dönen halka (çalışıyor, glow'lu)
   · ara durak (sırada). key={st}: durum değişince remount → vuruş o anda oynar. */
function HatDurak({ st, col }) {
  const orta = { position: "absolute", left: 0, width: 28, display: "flex", justifyContent: "center" };
  if (st === "pending") return <span aria-hidden="true" style={{ ...orta, top: 11 }}><span style={{ width: 10, height: 10, borderRadius: RAD.dot, background: PAL.bg, border: `1px solid ${PAL.lineHi}` }} /></span>;
  if (st === "active") return (
    /* Glow statik box-shadow'la (dönen SVG'nin altındaki halka) — filter:drop-shadow her
       karede yeniden rasterize oluyordu (jüri bulgusu). */
    <span key={st} aria-hidden="true" style={{ ...orta, top: 6 }}>
      <span style={{ position: "relative", width: 20, height: 20, borderRadius: RAD.dot, boxShadow: `0 0 10px ${GLOW(col, 55)}` }}>
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1s linear infinite" }}>
          <circle cx="10" cy="10" r="8.5" stroke={PAL.line} strokeWidth="2" fill={PAL.bg} />
          <path d="M10 1.5 A8.5 8.5 0 0 1 18.5 10" stroke={col} strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <span style={{ position: "absolute", left: 7, top: 7, width: 6, height: 6, borderRadius: RAD.dot, background: col, animation: "nu-think 1.1s ease-in-out infinite" }} />
      </span>
    </span>
  );
  const Ic = st === "error" ? Icon.x : Icon.check;
  const diskCol = st === "error" ? BANT.kirmizi.c : col;
  return (
    <span key={st} aria-hidden="true" style={{ ...orta, top: 8 }}>
      <span style={{ position: "relative", width: 16, height: 16 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: RAD.dot, border: `1.5px solid ${diskCol}`, boxShadow: `0 0 12px 2px ${GLOW(diskCol, 45)}`, animation: "nu-halka .6s var(--ke-ease-out) both" }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: RAD.dot, background: diskCol, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 8px ${GLOW(diskCol, 30)}`, animation: "nu-pop .35s var(--ke-ease-spring) both" }}>
          <Ic width={10} height={10} />
        </span>
      </span>
    </span>
  );
}

/* Hat başlığı — roundel hat HİZMETE GİRENE dek outline; ilk istasyon aktifleşince ateşlenir
   (pop + halka + glow). Ayraç hattın kendi ilerleme rayı; faz bitince onay + hat rengi. */
function HatTerminal({ n, col, count, sure, girisAktif, tamam, ilerleme, canli, glow, akis, devir }) {
  return (
    <div style={{ position: "relative", padding: `0 0 ${SP.s}px`, animation: glow ? "nu-rise .18s var(--ke-ease-out) both" : "none" }}>
      <Ray top={22} bottom={0} filled={girisAktif} col={col} akis={akis} />
      {/* Aktarma bağı — yalnız iki hat YAN YANA dizildiğinde (SahneAkis ölçer): Görev 1
          kolonundan gelen kesikli hat, roundel hizasında kolon boşluğunu aşarak bağlanır.
          Hat hizmete girince bağ hat rengine döner (devir gerçekleşti). */}
      {devir && (
        <span aria-hidden="true" style={{ position: "absolute", top: 10, left: -SP.xxl, width: SP.xxl - 6, height: 0, borderTop: `2px dashed ${girisAktif ? col : PAL.lineHi}`, transition: "border-color .3s ease" }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: SP.m, height: 24 }}>
        <span style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <span key={girisAktif ? "on" : "off"} aria-hidden="true" style={{ position: "relative", width: 20, height: 20, flexShrink: 0 }}>
            {girisAktif && glow && <span style={{ position: "absolute", inset: 0, borderRadius: RAD.dot, border: `2px solid ${col}`, boxShadow: `0 0 14px 2px ${GLOW(col, 50)}`, animation: "nu-halka .7s var(--ke-ease-out) both" }} />}
            <span style={{ position: "absolute", inset: 0, boxSizing: "border-box", borderRadius: RAD.dot, background: girisAktif ? col : PAL.surf, border: `2px solid ${col}`, color: girisAktif ? PAL.onAccent : DERIN_OF(col), fontFamily: SANS, fontSize: 12, lineHeight: "16px", fontWeight: 600, textAlign: "center", ...TNUM, boxShadow: canli ? `0 0 12px ${GLOW(col, 45)}` : "none", transition: "background .25s ease, box-shadow .3s ease", animation: girisAktif && glow ? "nu-pop .4s var(--ke-ease-spring) both" : "none" }}>{n}</span>
          </span>
        </span>
        <span style={{ ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0 }}>{n === 2 ? "Görev 2 · Üret" : "Görev 1 · Anla"}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 2, background: PAL.line, overflow: "hidden" }}>
          <span style={{ display: "block", width: "100%", height: "100%", background: col, boxShadow: `0 0 8px ${GLOW(col, 40)}`, transformOrigin: "left", transform: `scaleX(${ilerleme || 0})`, transition: "transform .4s var(--ke-ease-in-out)" }} />
        </span>
        <span style={{ ...TYPE.meta, color: tamam ? DERIN_OF(col) : PAL.mut2, flexShrink: 0, ...TNUM, display: "inline-flex", alignItems: "center", gap: SP.xs, transition: "color .2s ease" }}>
          {tamam && <Icon.check width={11} height={11} />}
          {count} adım{sure ? ` · ${sure}` : ""}
        </span>
      </div>
    </div>
  );
}

/* Tek istasyon satırı — oluk (ray + durak) + içerik (ad · süre · sıra no · canlı çıktı özeti).
   Aktif satır spot alır: tint zemin + hat renginde iç çerçeve + dış glow (Epik istisna).
   Satır TIKLANABİLİR: adım detay modalını açar. */
function HatIstasyon({ a, i, col, risk, hasTop, topFill, hasBot, glow, akisTop, onDetay }) {
  const done = a.status === "done", active = a.status === "active", err = a.status === "error";
  const nodeBant = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant] : null;
  const durakCol = a.id === "risk_guard" && done ? (nodeBant || risk).c : col;
  const ms = a.t1 - a.t0;
  const sure = done && Number.isFinite(ms) && ms >= 50 ? `${(ms / 1000).toFixed(1)}s` : null;
  const altYazi = done ? (a.out || "tamamlandı") : active ? (a.desc || "çalışıyor…") : err ? "hata · adım başarısız" : (a.desc || "—");
  const altRenk = err ? DERIN_OF(BANT.kirmizi.c) : done ? (a.id === "risk_guard" ? DERIN_OF((nodeBant || risk).c) : PAL.mut) : active ? PAL.mut : PAL.mut2;
  const zemin = active ? ALFA(col) : "transparent";
  const spotGolge = active && akisTop ? `inset 0 0 0 1px ${col}, 0 0 20px ${GLOW(col, 22)}, ${SH.card}` : "none";
  return (
    /* aria-label YOK: role=button adını içerikten alır; "detayını aç" ipucu title'da.
       focusRing onBlur gölgeyi "none"a çeker — aktif spot blur'da GERİ yüklenir. */
    <div role="button" tabIndex={0} onClick={onDetay} title={`${a.label} — adım detayını aç`}
      aria-current={active ? "step" : undefined}
      {...focusRing}
      onBlur={(e) => { e.currentTarget.style.boxShadow = spotGolge; }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetay(); } }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = zemin; }}
      style={{ cursor: "pointer", position: "relative", display: "grid", gridTemplateColumns: "28px 1fr", gap: SP.m, padding: "6px 8px 6px 0", borderRadius: RAD.ctl, background: zemin, boxShadow: spotGolge, transition: "background .12s ease, box-shadow .2s var(--ke-ease-out)", animation: glow ? `nu-rise .18s var(--ke-ease-out) ${Math.min(i * 28, 420)}ms both` : "none" }}>
      <div style={{ position: "relative", minHeight: 40 }}>
        {hasTop && <Ray top={-6} height={HAT.merkez + 6} filled={topFill} col={col} akis={akisTop} />}
        {hasBot && <Ray top={HAT.merkez} bottom={-6} filled={done} col={col} />}
        <HatDurak st={a.status} col={durakCol} />
      </div>
      <div style={{ minWidth: 0 }}>
        {/* Soluklaştırma opacity ile DEĞİL AA-güvenli renk kademeleriyle (a11y jüri bulgusu:
            opacity .55 tıklanabilir satırı ~2.6:1'e düşürüyordu). Bilgi taşıyan metinlerde
            nu-think nabzı yok — pulse yalnız dekoratif noktalarda (kontrast hiç düşmez). */}
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.s }}>
          <span style={{ ...TYPE.ui, fontWeight: 500, color: active ? PAL.ink : done ? PAL.ink2 : PAL.mut, transition: "color .15s ease-out", minWidth: 0 }}>{a.label}</span>
          {active ? (
            <span aria-hidden="true" style={{ marginLeft: "auto", ...TYPE.meta, fontWeight: 500, color: DERIN_OF(col), flexShrink: 0 }}>işleniyor</span>
          ) : (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: SP.s, flexShrink: 0, fontFamily: MONO, fontSize: 12, lineHeight: "16px", color: PAL.mut2, ...TNUM }}>
              {sure && <span>{sure}</span>}
              <span>{String(i + 1).padStart(2, "0")}</span>
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, ...TYPE.data, color: altRenk }}>{altYazi}</div>
        {/* SR: durum programatik olarak da verilir (renk/ikon tek sinyal olmasın). */}
        <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
          {done ? `tamamlandı${sure ? ` · ${sure}` : ""}` : active ? "şu an işleniyor" : err ? "hata: adım başarısız" : "sırada"}
        </span>
      </div>
    </div>
  );
}

/* Hat sonu — terminüs çubuğu; hat tamamlanınca dolup pop'la oturur (metro dili). */
const HatSon = ({ col, done }) => (
  <div aria-hidden="true" style={{ position: "relative", height: 12 }}>
    <Ray top={0} height={6} filled={done} col={col} />
    <span key={done ? "on" : "off"} style={{ position: "absolute", top: 6, left: HAT.x - 4, width: 10, height: 4, borderRadius: RAD.chip, background: done ? col : PAL.lineHi, boxShadow: done ? `0 0 8px ${GLOW(col, 40)}` : "none", transition: "background .3s ease-out", animation: done ? "nu-pop .4s var(--ke-ease-spring) both" : "none" }} />
  </div>
);

/* Tek hat (görev fazı) — terminal + istasyonlar + terminüs. Işık izi tek odakta: yalnız
   aktif istasyona giren parça (terminal rayı dahil, aktif istasyon hattın ilkiyse). */
function HatFaz({ n, items, risk = BANT.yesil, glow, sahne, sonHat = true, devir = false, onDetay }) {
  const col = n === 2 ? V : T;
  const ms = items.reduce((s, a) => (a.status === "done" && Number.isFinite(a.t1 - a.t0) ? s + (a.t1 - a.t0) : s), 0);
  const sure = ms >= 100 ? `${ms < 10000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)}s` : null;
  const doneN = items.filter((a) => a.status === "done").length;
  const fazDone = items.length > 0 && doneN === items.length;
  const aktifJ = items.findIndex((a) => a.status === "active");
  const canli = sahne && glow;
  return (
    <div style={{ minWidth: 0 }}>
      <HatTerminal n={n} col={col} count={items.length} sure={sure}
        girisAktif={items[0]?.status !== "pending"} tamam={fazDone}
        ilerleme={items.length ? doneN / items.length : 0} canli={canli && aktifJ >= 0}
        glow={glow} akis={canli && aktifJ === 0} devir={devir} />
      {items.map((a, j) => (
        <HatIstasyon key={a.id} a={a} i={a.sira} col={col} risk={risk} hasTop
          topFill={j === 0 ? a.status !== "pending" : items[j - 1].status === "done"}
          hasBot glow={glow} akisTop={canli && a.status === "active"} onDetay={() => onDetay(a.sira)} />
      ))}
      {sonHat && <HatSon col={col} done={fazDone} />}
    </div>
  );
}

/* SAHNE telemetrisi — sayaçlar NumberFlow ile yuvarlanır; canlı saniye 500ms'de işler.
   t0/t1 koşum başlangıcına göreli; mutlak taban runBase (usePipeline). */
export function SahneTelemetri({ busy, allDone, toplamSn, runBase, glow }) {
  const [, setTik] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [busy]);
  const gecen = busy && Number.isFinite(runBase) && runBase > 0 ? Math.max(0, (performance.now() - runBase) / 1000) : null;
  // Tek sözlük (jüri bulgusu: aynı ekranda 4 ilerleme okuması yarışıyordu): adım sayacı
  // yalnız "İşlem aşamaları" başlığında, % yalnız üst ilerleme çubuğunda; telemetri =
  // canlılık + geçen süre.
  return (
    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.s, ...TYPE.meta, color: PAL.mut, ...TNUM, flexShrink: 0 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: RAD.dot, background: busy ? T : (allDone ? BANT.yesil.c : PAL.mut2), boxShadow: busy ? `0 0 8px ${GLOW(T, 55)}` : "none", animation: busy && glow ? "nu-think 1.4s ease-in-out infinite" : "none" }} />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
        {busy ? "Canlı" : (allDone ? "Tamam" : "Beklemede")}
        {gecen != null ? <> · <NumberFlow value={Math.floor(gecen)} spinTiming={{ duration: 300 }} /> sn</> : (toplamSn ? <> · {toplamSn}</> : null)}
      </span>
    </span>
  );
}

/* Aktif ajan spot kartı — büyük halka/disk + ad + canlı açıklama + NumberFlow'lu gerçek-zaman
   süre. Canlı süre = (performance.now() - runBase) - t0; yalnız aktifken 300ms'de bir işler. */
export function MerkezKart({ a, total, glow, runBase }) {
  const [, setTik] = useState(0);
  const active = a.status === "active";
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTik((x) => x + 1), 300);
    return () => clearInterval(id);
  }, [active, a.id]);
  const col = a.gorev === 2 ? V : T;
  const done = a.status === "done", err = a.status === "error";
  const bantC = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : null;
  const relNow = Number.isFinite(runBase) && runBase > 0 ? performance.now() - runBase : null;
  const ms = active && relNow != null && Number.isFinite(a.t0) ? relNow - a.t0
    : (done && Number.isFinite(a.t1 - a.t0) ? a.t1 - a.t0 : null);
  const sn = ms != null && ms >= 100 ? ms / 1000 : null;
  const durum = active ? (a.desc || "çalışıyor…") : done ? (a.out || "tamamlandı") : err ? "hata · adım başarısız" : (a.desc || "sırada");
  return (
    /* width:100% — dikey flex kapta flex-basis YÜKSEKLİK olur (560px boş kutu hatası). */
    <div key={a.id} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", display: "flex", alignItems: "center", gap: SP.l, padding: `${SP.l}px ${SP.xl}px`, borderRadius: RAD.card, background: PAL.surf, boxShadow: `inset 0 0 0 1px ${err ? BANT.kirmizi.c : col}, 0 0 24px ${GLOW(err ? BANT.kirmizi.c : col, 16)}, ${SH.card}`, animation: glow ? "nu-rise .2s var(--ke-ease-out) both" : "none" }}>
      <span aria-hidden="true" style={{ position: "relative", width: 40, height: 40, flexShrink: 0, borderRadius: RAD.dot, boxShadow: active ? `0 0 14px ${GLOW(col, 50)}` : "none" }}>
        {active ? (
          <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1.1s linear infinite" }}>
            <circle cx="20" cy="20" r="17" stroke={PAL.line} strokeWidth="3.5" fill={PAL.surf} />
            <path d="M20 3 A17 17 0 0 1 37 20" stroke={col} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </svg>
        ) : (done || err) ? (
          <span style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, borderRadius: RAD.dot, background: err ? BANT.kirmizi.c : (bantC || col), color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", animation: glow ? "nu-pop .4s var(--ke-ease-spring) both" : "none" }}>
            {err ? <Icon.x width={18} height={18} /> : <Icon.check width={18} height={18} />}
          </span>
        ) : (
          <span style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, borderRadius: RAD.dot, background: PAL.surf, border: `2px solid ${PAL.lineHi}` }} />
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.m }}>
          <span style={{ ...TYPE.h2, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
          <span style={{ ...TYPE.meta, color: PAL.mut2, flexShrink: 0, ...TNUM }}>adım {a.sira + 1}/{total}</span>
        </span>
        {/* Durum metni statik — bilgi taşıyan metinde opacity nabzı kontrastı AA altına
            düşürüyordu (jüri bulgusu); canlılık sinyali spinner + ışık kuyruğunda. */}
        <span style={{ display: "block", marginTop: 2, ...TYPE.data, color: active ? DERIN_OF(col) : (bantC ? DERIN_OF(bantC) : PAL.mut), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{durum}</span>
      </span>
      {sn != null && (
        <span style={{ ...TYPE.ui, fontWeight: 500, color: PAL.ink2, flexShrink: 0, ...TNUM, display: "inline-flex", alignItems: "baseline", gap: 3 }}>
          {/* spinTiming tick aralığından (300ms) kısa — dijit yuvarlanması hiç kesilmez. */}
          <NumberFlow value={sn} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} spinTiming={{ duration: 220 }} /> sn
        </span>
      )}
    </div>
  );
}

/* Aurora — kart arkasında T/V tonlarında yavaşça gezinen iki bulanık ışık lekesi (Epik
   istisna; metin kontrastını bozmayacak kadar soluk). pointer-events yok; reduced-motion'da
   durur (statik soluk leke kalır). */
export const Aurora = () => (
  <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: RAD.card, pointerEvents: "none" }}>
    <span style={{ position: "absolute", top: "-12%", left: "-8%", width: 380, height: 380, borderRadius: RAD.dot, background: `radial-gradient(circle, ${GLOW(T, 14)}, transparent 65%)`, filter: "blur(42px)", animation: "nu-gezin 17s var(--ke-ease-in-out) infinite alternate" }} />
    <span style={{ position: "absolute", bottom: "-16%", right: "-6%", width: 420, height: 420, borderRadius: RAD.dot, background: `radial-gradient(circle, ${GLOW(V, 12)}, transparent 65%)`, filter: "blur(48px)", animation: "nu-gezin 23s var(--ke-ease-in-out) infinite alternate-reverse" }} />
  </div>
);

/* ——— useSahneTempo: sunum temposu (min-dwell kuyruğu) ———
   SSE olayları deterministik adımlarda milisaniyelik burst'lerle gelir; ekran her
   tamamlanmayı en az ~400ms sahnede tutar ki pop/halka/ray-dolumu İZLENEBİLİR olsun
   (jüri bulgusu: 15 adım · 5.8 sn koşumda vuruşlar üst üste biniyordu). Veri anında
   saklanır, yalnız GÖSTERİM sıralanır; toplam ek gecikme ~3.6 sn ile sınırlandı
   (real-time avantaj korunur). Hata/HITL/reduced-motion'da anında yetişir. */
export function useSahneTempo(nodes, { pendingOnay = null, glow = true } = {}) {
  // Başlangıç = mount ANINDAKİ gerçek tamamlanma sayısı: tempo yalnız CANLI gelen
  // tamamlanmaları sıralar. useState(0) ile başlamak, başka görünüme geçip dönüldüğünde
  // (remount) bitmiş koşumu baştan "yeniden işliyormuş" gibi oynatıyordu — kullanıcı
  // bulgusu: sekme dönüşünde sahte koşum + sayaç.
  const [reveal, setReveal] = useState(() => nodes.reduce((s, n) => s + (n.status === "done" ? 1 : 0), 0));
  const sonVurus = useRef(0);
  const trueDone = nodes.reduce((s, n) => s + (n.status === "done" ? 1 : 0), 0);
  const hataVar = nodes.some((n) => n.status === "error");
  useEffect(() => {
    // Yeni koşum: gerçek tamamlanma sayısı gösterilenin altına düştüyse sıfırdan başla.
    if (trueDone < reveal) { setReveal(trueDone); sonVurus.current = 0; }
  }, [trueDone, reveal]);
  useEffect(() => {
    if (reveal >= trueDone) return undefined;
    const aninda = !glow || hataVar || !!pendingOnay;
    const kalan = trueDone - reveal;
    const dwell = aninda ? 0 : Math.min(420, Math.max(140, 3600 / kalan));
    const bekle = Math.max(0, dwell - (performance.now() - sonVurus.current));
    const id = setTimeout(() => { sonVurus.current = performance.now(); setReveal((r) => r + 1); }, bekle);
    return () => clearTimeout(id);
  }, [reveal, trueDone, glow, hataVar, pendingOnay]);
  const paced = useMemo(() => {
    let gorulen = 0;
    return nodes.map((n) => {
      if (n.status !== "done") return n;
      gorulen += 1;
      if (gorulen <= reveal) return n;
      return { ...n, status: gorulen === reveal + 1 ? "active" : "pending" };
    });
  }, [nodes, reveal]);
  return { paced, sunumTamam: reveal >= trueDone };
}

/* Sahne gövdesi — üstte "now playing" spot kartı, altında iki hatlı metro şeması
   (Görev 1 | Görev 2 yan yana; dar panelde alt alta). Satırlar tıklanabilir (adım detayı). */
export function SahneAkis({ display, total, glow, runBase, onDetay }) {
  const aktifIdx = display.findIndex((x) => x.status === "active");
  let sonBiten = -1;
  display.forEach((x, i) => { if (x.status === "done") sonBiten = i; });
  const merkezIdx = aktifIdx >= 0 ? aktifIdx : (sonBiten >= 0 ? sonBiten : 0);
  const merkez = display[merkezIdx];
  const g1 = display.filter((a) => a.gorev !== 2);
  const g2 = display.filter((a) => a.gorev === 2);
  // Aktarma bağı yalnız iki hat YAN YANA iken çizilir (alt alta yığılımda hat zaten
  // dikeyde akar) — kolonların offsetTop eşitliği ölçülür, pencere boyutunda güncellenir.
  const gridRef = useRef(null);
  const [ikiKolon, setIkiKolon] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const olc = () => {
      const c = el.children;
      setIkiKolon(c.length >= 2 && Math.abs(c[0].offsetTop - c[1].offsetTop) < 4);
    };
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [display.length]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.l, width: "100%", maxWidth: 920, margin: "0 auto" }}>
      {merkez && <MerkezKart a={merkez} total={total} glow={glow} runBase={runBase} />}
      {display.length > 0 && (
        <div style={{ borderTop: `1px solid ${PAL.line}`, paddingTop: SP.l }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.m, marginBottom: SP.s }}>
            <span style={{ ...TYPE.meta, color: PAL.mut2 }}>İşlem aşamaları</span>
            <span style={{ ...TYPE.meta, color: PAL.mut2, ...TNUM, display: "inline-flex", alignItems: "baseline", gap: 3 }}>
              adım <NumberFlow value={merkezIdx + 1} /> / {total}
            </span>
          </div>
          <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", columnGap: SP.xxl, rowGap: SP.l, alignItems: "start" }}>
            {g1.length > 0 && <HatFaz n={1} items={g1} glow={glow} sahne onDetay={onDetay} />}
            {g2.length > 0 && <HatFaz n={2} items={g2} glow={glow} sahne devir={ikiKolon} onDetay={onDetay} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ——— AkisSeridi: yatay istasyon şeridi ("satır gibi" ajan akışı) ———
   Sonuç sayfasının EN ALTINDA koşumun kompakt özeti: roundel + istasyon noktaları + dolu
   bağlar; Görev 1→2 aktarması kesikli. Noktalar tıklanabilir (adım detay modalı). Sakin mod:
   koşum bitmiştir, ışık kuyruğu/pop yok. */
function SeritNokta({ a, col }) {
  const dotCol = a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : col;
  if (a.status === "active") return (
    <span style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 20 20" style={{ position: "absolute", top: 0, left: 0, animation: "nu-spin 1s linear infinite" }}>
        <circle cx="10" cy="10" r="7.5" stroke={PAL.line} strokeWidth="3.5" fill={PAL.surf} />
        <path d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" stroke={dotCol} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
  const done = a.status === "done", err = a.status === "error";
  // Hatalı adım renk + BİÇİMLE ayrılır (X glifi) — renk tek sinyal olamaz (WCAG 1.4.1).
  if (err) return (
    <span style={{ width: 12, height: 12, borderRadius: RAD.dot, background: BANT.kirmizi.c, color: PAL.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon.x width={8} height={8} />
    </span>
  );
  return (
    <span style={{ width: done ? 12 : 9, height: done ? 12 : 9, borderRadius: RAD.dot, background: done ? dotCol : PAL.bg, border: done ? "none" : `1px solid ${PAL.lineHi}`, flexShrink: 0 }} />
  );
}

/* Yarım ray parçası — her istasyon hücresi kendi sol/sağ ray yarısını taşır; bitişik
   hücreler kesintisiz tek hat okunur. bos: hattın gerçek ucu (parça çizilmez).
   Radius YOK: yuvarlak uçlar her ek yerinde "kapanmış boru" okunuyordu — parçalar
   düz uçla birbirine yaslanır, şerit boydan boya TEK boru görünür. */
const YarimRay = ({ filled, col, bos }) => (
  <span aria-hidden="true" style={{ flex: 1, minWidth: 6, height: 3, alignSelf: "center", background: bos ? "transparent" : (filled ? col : PAL.line), transition: "background .3s ease" }} />
);

export function AkisSeridi({ display, onDetay }) {
  const parcalar = [];
  display.forEach((a, i) => {
    const col = a.gorev === 2 ? V : T;
    const prev = display[i - 1];
    const gorevBasi = i === 0 || (prev && prev.gorev !== a.gorev);
    // Hat başı roundeli — istasyonlarla aynı iki katlı düzen (üstte işaret, altta ad).
    // Roundel RAYA OTURUR: blok etiket kadar geniş olduğundan işaret satırı tam genişlik
    // ray taşır — solda Görev 2'de kesikli AKTARMA (Görev 1 bitince hat rengine döner,
    // akışın en başında boş), sağda hattın ilk parçası. Komşu hücrelerin yarım-raylarıyla
    // uç uca eklenir → şerit boydan boya kesintisiz TEK boru okunur (boru kapanması yok).
    if (gorevBasi) {
      parcalar.push(
        <div key={`g${a.gorev}`} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", width: "100%", height: 24 }}>
            {a.gorev === 2 && prev
              ? <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderTop: `2px dashed ${prev.status === "done" ? col : PAL.lineHi}`, transition: "border-color .3s ease" }} />
              : <span aria-hidden="true" style={{ flex: 1 }} />}
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: RAD.dot, background: col, color: PAL.onAccent, fontFamily: SANS, fontSize: 11, lineHeight: "18px", fontWeight: 600, textAlign: "center", flexShrink: 0, ...TNUM }}>{a.gorev}</span>
            <YarimRay filled={a.status !== "pending"} col={col} />
          </span>
          {/* İki satır: üstte "Görev N", altında faz adı — istasyon adlarıyla aynı düşey ritim. */}
          <span style={{ ...TYPE.meta, fontWeight: 600, color: DERIN_OF(col), whiteSpace: "nowrap", padding: "0 6px", textAlign: "center" }}>
            Görev {a.gorev}
            <span style={{ display: "block", fontWeight: 400 }}>{a.gorev === 2 ? "Üret" : "Anla"}</span>
          </span>
        </div>
      );
    }
    // İstasyon hücresi — üstte ray içinde nokta, altında adım adı (2 satır sığar).
    // Tüm hücre tıklanabilir (geniş hedef); durum + risk bandı erişilebilir ada girer.
    const durumTr = a.status === "done" ? "tamamlandı" : a.status === "active" ? "işleniyor" : a.status === "error" ? "hata" : "sırada";
    const bantEk = a.id === "risk_guard" && a.bant && BANT[a.bant] ? ` · risk bandı ${BANT[a.bant].l}` : "";
    const adRenk = a.status === "error" ? DERIN_OF(BANT.kirmizi.c) : a.status === "done" ? PAL.ink2 : a.status === "active" ? PAL.ink : PAL.mut;
    parcalar.push(
      <button key={a.id} type="button" onClick={() => onDetay(a.sira)} title={`${a.label} — ${durumTr}${bantEk}`}
        aria-label={`${a.label}, ${durumTr}${bantEk} — adım detayını aç`} {...focusRing} data-press=""
        onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        style={{ cursor: "pointer", flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 0 6px", background: "transparent", border: "none", borderRadius: RAD.ctl, transition: "background .12s ease, transform .14s var(--ke-ease-out)" }}>
        <span style={{ display: "flex", alignItems: "center", width: "100%", height: 24 }}>
          <YarimRay filled={gorevBasi ? a.status !== "pending" : prev?.status === "done"} col={col} />
          <SeritNokta a={a} col={col} />
          <YarimRay filled={a.status === "done"} col={col} bos={i === display.length - 1} />
        </span>
        <span style={{ ...TYPE.meta, color: adRenk, fontWeight: a.status === "active" ? 600 : 400, textAlign: "center", maxWidth: 92, padding: "0 2px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", transition: "color .2s ease" }}>{a.label}</span>
      </button>
    );
  });
  return <div style={{ display: "flex", alignItems: "flex-start" }}>{parcalar}</div>;
}
