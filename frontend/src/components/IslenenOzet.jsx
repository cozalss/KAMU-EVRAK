/* IslenenOzet — İşlenen evrak sicilinin üst özet şeridi (2. tur, "ödül jürisi" cilası).

   Neden yeniden: 1. turda büyük karo 14 günlük bir bar grafiğiydi; seyrek veride (14 günün
   13'ü boş) "neredeyse boş bir grafik" gibi okunuyordu ve sağdaki "Karar dağılımı" tek renk
   bir çubuk + sıfırlı bir listeydi — bitmemiş görünüyordu.

   · Sol karo — ÇETELE: kamu kâğıt dünyasının kendi sayma aracı. Her işlenen evrak o günün
     sütununa bir mürekkep çentiği atar; beşinci çentik dördünü çapraz keser (çetele/tally).
     Seyrek veride bile bir TAKVİM satırı olarak okunur (gün numaraları, hafta sonu soluk,
     bugün altı çizili) — boş gün "veri yok" değil "o gün kayıt yok" der. 10'dan çok kayıtta
     çentik yerine rakam yazılır (okunurluk sınırı).
   · Sağ karo — KARAR DAĞILIMI: dört sayaç sütunu (büyük Archivo rakam + noktalı etiket);
     her sütun bir filtre düğmesidir (aria-pressed). Üstte orantılı şerit; sıfır kategori
     şeritte yer kaplamaz ama sütunda soluk "0" olarak durur (yokluk da bilgidir).
   Stripe/Linear dersi: birincil karo tek vurgulu, ikincil nötr; sayı + etiket + şekil. */
import React, { useMemo } from "react";
import NumberFlow from "@number-flow/react";
import { useDarEkran } from "../hooks/useMedya.js";
import { MONO, T, PAL, BANT, TYPE, TNUM, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing } from "./neonUi.jsx";

const GUN_MS = 86_400_000;
const GUN_SAYISI = 14;
const CETELE_AZAMI = 10;     // bu sayının üstünde çentik yerine rakam
const ayniGun = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const sn = (x) => (x == null ? "" : Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export const KARARLAR = [
  { key: "bekliyor", label: "Karar bekliyor", kisa: "Bekliyor", renk: BANT.sari.c, doluluk: 0.9 },
  { key: "onaylandi", label: "Onaylandı", kisa: "Onaylandı", renk: BANT.yesil.c, doluluk: 0.95 },
  { key: "duzenlendi", label: "Düzenlenip gönderildi", kisa: "Düzenlendi", renk: BANT.yesil.c, doluluk: 0.5 },
  { key: "reddedildi", label: "Reddedildi", kisa: "Reddedildi", renk: BANT.kirmizi.c, doluluk: 0.9 },
];

/* Bir günün çetelesi — n çentik: 5'li demetler (4 dikey + 1 çapraz), en çok iki demet
   üst üste. SVG salt görsel; sayı sütunun title/aria özetinde. */
function CeteleSutun({ n, bugun }) {
  if (n > CETELE_AZAMI) {
    return <span style={{ ...TYPE.h2, fontSize: 16, lineHeight: "20px", color: DERIN.T, ...TNUM }}>{n}</span>;
  }
  if (n === 0) return <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: RAD.dot, background: PAL.mut3, opacity: 0.45, marginBottom: 2 }} />;
  const demetler = [Math.min(n, 5), Math.max(0, n - 5)].filter(Boolean);
  return (
    <svg width="22" height={demetler.length * 18 + 2} viewBox={`0 0 22 ${demetler.length * 18 + 2}`} aria-hidden="true"
      style={{ display: "block", overflow: "visible", color: bugun ? DERIN.T : PAL.ink2 }}>
      {demetler.map((k, di) => {
        const y0 = (demetler.length - 1 - di) * 18 + 2;   // ilk demet en altta
        return (
          <g key={di} stroke="currentColor" strokeLinecap="round" fill="none">
            {Array.from({ length: Math.min(k, 4) }, (_, i) => (
              <path key={i} d={`M ${4 + i * 4.6} ${y0 + 1} l ${i % 2 ? 0.6 : -0.4} 14`} strokeWidth="1.7" />
            ))}
            {k === 5 && <path d={`M 1.5 ${y0 + 12.5} L 20.5 ${y0 + 3}`} strokeWidth="1.5" />}
          </g>
        );
      })}
    </svg>
  );
}

function Cetele({ items }) {
  const gunler = useMemo(() => {
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const out = Array.from({ length: GUN_SAYISI }, (_, i) => ({ d: new Date(bugun.getTime() - (GUN_SAYISI - 1 - i) * GUN_MS), n: 0 }));
    for (const x of items) {
      const t = new Date(x.ts); t.setHours(0, 0, 0, 0);
      const idx = GUN_SAYISI - 1 - Math.round((bugun - t) / GUN_MS);
      if (idx >= 0 && idx < GUN_SAYISI) out[idx].n += 1;
    }
    return out;
  }, [items]);
  const toplam = gunler.reduce((a, g) => a + g.n, 0);
  const etkinGun = gunler.filter((g) => g.n).length;
  return (
    <div role="img" aria-label={`Son ${GUN_SAYISI} günün çetelesi: ${toplam} kayıt, ${etkinGun} gün etkin`}
      style={{ display: "grid", gridTemplateColumns: `repeat(${GUN_SAYISI}, minmax(0, 1fr))`, marginTop: SP.l,
        borderTop: `1px solid ${PAL.line}`, paddingTop: SP.s }}>
      {gunler.map((g, i) => {
        const bugun = i === GUN_SAYISI - 1;
        const haftaSonu = g.d.getDay() === 0 || g.d.getDay() === 6;
        const pazartesi = g.d.getDay() === 1 && i > 0;
        return (
          <span key={i} title={`${g.d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })} · ${g.n} kayıt`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, minHeight: 56,
              borderLeft: pazartesi ? `1px dashed ${PAL.lineHi}` : "1px solid transparent",
              background: haftaSonu ? `color-mix(in srgb, ${PAL.mut3} 6%, transparent)` : "transparent", borderRadius: 3, paddingBottom: 2 }}>
            <CeteleSutun n={g.n} bugun={bugun} />
            <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "12px", ...TNUM,
              color: bugun ? DERIN.T : haftaSonu ? PAL.mut3 : PAL.mut2, fontWeight: bugun ? 700 : 500,
              borderBottom: bugun ? `2px solid ${T}` : "2px solid transparent", paddingBottom: 1 }}>
              {String(g.d.getDate()).padStart(2, "0")}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const kunye = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" };
const karo = { borderRadius: RAD.card, background: PAL.surf, boxShadow: SH.card, border: `1px solid ${PAL.line}`, padding: `${SP.l}px ${SP.l + 4}px ${SP.m}px`, minWidth: 0 };

function EtkinlikKarosu({ items, aktifSet, temizle, ortSn }) {
  const bugun = new Date();
  const bugunSay = items.filter((x) => { const d = new Date(x.ts); return !Number.isNaN(d.getTime()) && ayniGun(d, bugun); }).length;
  const secili = aktifSet.size === 0;
  return (
    <button type="button" onClick={temizle} aria-pressed={secili}
      aria-label={`Toplam ${items.length} kayıt${bugunSay ? `, bugün ${bugunSay}` : ""} — tüm kararları göster`}
      {...focusRing} data-press=""
      onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PAL.surf; }}
      style={{ ...karo, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", position: "relative",
        borderColor: secili ? PAL.lineHi : PAL.line,
        backgroundImage: secili ? `linear-gradient(${T}, ${T})` : "none", backgroundSize: "100% 2px", backgroundRepeat: "no-repeat",
        transition: "background-color .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SP.m }}>
        <span style={kunye}>Sicil · son {GUN_SAYISI} gün</span>
        {ortSn && <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, ...TNUM, whiteSpace: "nowrap" }}>ort. {sn(ortSn)} sn / evrak</span>}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: SP.m, marginTop: SP.s, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.disp, color: PAL.ink }}><NumberFlow value={items.length} /></span>
        <span style={{ ...TYPE.ui, color: PAL.mut2 }}>kayıt</span>
        {bugunSay > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: RAD.chip, background: ALFA(T), color: DERIN.T, ...TYPE.meta, fontWeight: 600, ...TNUM }}>
            +{bugunSay} bugün
          </span>
        )}
      </span>
      <Cetele items={items} />
    </button>
  );
}

/* Telefonda dört sayaç TEK satırda (2×2 ızgara defteri ekranın altına itiyordu — ölçüldü,
   390px'te defter ilk ekranda hiç görünmüyordu); kısa etiket, açıklama notu gizli. */
function KararKarosu({ say, aktifSet, onSec }) {
  const dar = useDarEkran();
  const toplam = KARARLAR.reduce((a, k) => a + say[k.key], 0);
  const ozet = KARARLAR.filter((k) => say[k.key] > 0).map((k) => `${say[k.key]} ${k.label.toLocaleLowerCase("tr-TR")}`).join(", ");
  const bekleyenPay = toplam ? say.bekliyor / toplam : 0;
  return (
    <div style={{ ...karo, display: "flex", flexDirection: "column" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SP.m }}>
        <span style={kunye}>Karar dağılımı</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2, ...TNUM, whiteSpace: "nowrap" }}>
          {toplam ? `${toplam - say.bekliyor} / ${toplam} karara bağlandı` : "taslak yok"}
        </span>
      </span>
      <span role="img" aria-label={toplam ? `Karar dağılımı: ${ozet}` : "Henüz taslak yok"}
        style={{ display: "flex", gap: 3, height: 10, marginTop: SP.m, borderRadius: 3, overflow: "hidden",
          background: toplam ? "transparent" : PAL.hov }}>
        {KARARLAR.filter((k) => say[k.key] > 0).map((k) => (
          <span key={k.key} title={`${k.label} · ${say[k.key]}`}
            style={{ flex: say[k.key], minWidth: 6, background: k.renk, opacity: k.doluluk,
              backgroundImage: k.key === "bekliyor" ? `repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, ${PAL.surf} 45%, transparent) 4px 6px)` : "none" }} />
        ))}
      </span>
      <div role="group" aria-label="Karar durumu — sütun listeyi filtreler"
        style={{ display: "grid", gridTemplateColumns: dar ? "repeat(4, minmax(0, 1fr))" : "repeat(auto-fit, minmax(min(112px, 100%), 1fr))", gap: dar ? 2 : SP.xs, marginTop: SP.m, flex: 1 }}>
        {KARARLAR.map((k) => {
          const n = say[k.key];
          const aktif = aktifSet.has(k.key);
          return (
            <button key={k.key} type="button" onClick={() => onSec(k.key)} aria-pressed={aktif}
              aria-label={`${k.label}: ${n} evrak${aktif ? " — filtre açık" : ""}`}
              {...focusRing} data-press="" data-dokunma=""
              onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(k.renk) : "transparent"; }}
              style={{ cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 4,
                padding: dar ? "6px 6px" : "8px 10px", minWidth: 0, borderRadius: RAD.ctl, border: `1px solid ${aktif ? PAL.lineHi : "transparent"}`,
                background: aktif ? ALFA(k.renk) : "transparent",
                transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
              <span style={{ ...TYPE.num, ...(dar ? { fontSize: 22, lineHeight: "26px" } : null), color: n ? (aktif ? DERIN_OF(k.renk) : PAL.ink) : PAL.mut3 }}><NumberFlow value={n} /></span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.meta, color: n ? PAL.mut2 : PAL.mut3 }}>
                {!dar && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: k.renk, opacity: n ? k.doluluk : 0.3, flexShrink: 0 }} />}
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: dar ? "nowrap" : "normal", ...(dar ? { fontSize: 11, borderBottom: `2px solid ${k.renk}`, paddingBottom: 1 } : null) }}>{dar ? k.kisa : k.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {bekleyenPay > 0 && !dar && (
        <span style={{ ...TYPE.meta, color: PAL.mut2, marginTop: SP.s, paddingTop: SP.s, borderTop: `1px dashed ${PAL.line}` }}>
          Taramalı dilim memur kararı bekleyen taslaklardır — onaylanınca yeşile döner.
        </span>
      )}
    </div>
  );
}

export default function IslenenOzet({ items, filter, ortSn }) {
  const say = { bekliyor: 0, onaylandi: 0, duzenlendi: 0, reddedildi: 0, islendi: 0 };
  for (const x of items) say[x._durum] = (say[x._durum] || 0) + 1;
  const aktifSet = filter.filters.chips.durum || new Set();
  const temizle = () => aktifSet.forEach((v) => filter.toggleChip("durum", v));
  return (
    /* auto-fit: dar ekranda tek sütuna iner (390px'te taşma yok — 2026-08-12 ölçümü). */
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: SP.m, marginBottom: SP.l, alignItems: "stretch" }}>
      <EtkinlikKarosu items={items} aktifSet={aktifSet} temizle={temizle} ortSn={ortSn} />
      <KararKarosu say={say} aktifSet={aktifSet} onSec={(k) => filter.toggleChip("durum", k)} />
    </div>
  );
}
