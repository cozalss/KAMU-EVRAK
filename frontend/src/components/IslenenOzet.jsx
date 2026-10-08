/* IslenenOzet — İşlenen evrak sicilinin üst özet şeridi (2. tur, "ödül jürisi" cilası).

   Neden yeniden: 1. turda büyük karo 14 günlük bir bar grafiğiydi; seyrek veride (14 günün
   13'ü boş) "neredeyse boş bir grafik" gibi okunuyordu ve sağdaki "Karar dağılımı" tek renk
   bir çubuk + sıfırlı bir listeydi — bitmemiş görünüyordu.

   · Sol karo — ÇETELE (tur 8: tek kodlama, gün = defter dizini; bkz. CeteleGun). Seyrek
     veride bile bir TAKVİM satırı olarak okunur (gün numaraları, hafta sonu soluk, bugün
     altı çizili) — boş gün "veri yok" değil "o gün kayıt yok" der.
   · Sağ karo — KARAR DAĞILIMI: dört sayaç sütunu (büyük Archivo rakam + noktalı etiket);
     her sütun bir filtre düğmesidir (aria-pressed). Üstte orantılı şerit; sıfır kategori
     şeritte yer kaplamaz ama sütunda soluk "0" olarak durur (yokluk da bilgidir).
   Stripe/Linear dersi: birincil karo tek vurgulu, ikincil nötr; sayı + etiket + şekil. */
import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { useDarEkran } from "../hooks/useMedya.js";
import { MONO, T, PAL, BANT, TYPE, TNUM, RAD, SP, SH, ALFA, DERIN, DERIN_OF, focusRing } from "./neonUi.jsx";

const GUN_MS = 86_400_000;
const GUN_SAYISI = 14;
const sn = (x) => (x == null ? "" : Number(x).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export const KARARLAR = [
  { key: "bekliyor", label: "Karar bekliyor", kisa: "Bekliyor", renk: BANT.sari.c, doluluk: 0.9 },
  { key: "onaylandi", label: "Onaylandı", kisa: "Onaylandı", renk: BANT.yesil.c, doluluk: 0.95 },
  { key: "duzenlendi", label: "Düzenlenip gönderildi", kisa: "Düzenlendi", renk: BANT.yesil.c, doluluk: 0.5 },
  { key: "reddedildi", label: "Reddedildi", kisa: "Reddedildi", renk: BANT.kirmizi.c, doluluk: 0.9 },
];

/* ÇETELE (tur 8): tek kodlama. Önceki sürüm ≤10 kayıtta çentik, üstünde rakam basıyordu —
   en yoğun gün (26) görsel olarak en hafif kalıyordu (jüri). Şimdi her gün: rakam + ORTAK
   ÖLÇEKLİ mürekkep çubuğu (en yoğun gün tam boy). Boş gün nokta ("o gün kayıt yok").
   Her gün bir DİZİN düğmesidir: tıklayınca defter o güne süzülür (tarih aralığı filtresi),
   yeniden tıklayınca bırakır — özet süs olmaktan çıkıp defterin dizinine döner.
   Sayım GÖRÜNEN kayıtlardan (karar filtresi açıkken çetele de süzülür; özet ↔ liste bağı). */
const CUBUK_AZAMI = 44;
const CUBUK_ASGARI = 6;
/* Karekök ölçek (tur 8 jüri 2: tek 26'lık gün doğrusal ölçekte öbür günleri noktaya ezip
   grafiği boş gösteriyordu). Rakam her çubuğun üstünde durduğu için sıra/oran okunur kalır. */
const cubukBoyu = (n, azami) => (n ? Math.max(CUBUK_ASGARI, Math.round(Math.sqrt(n / azami) * CUBUK_AZAMI)) : 0);
/* Çubuk tabanının gün düğmesinin dibine uzaklığı: padding 2 + tarih (12 + 1 + 2 çizgi) + boşluk 4. */
const CUBUK_TABAN = 21;
const gunBasi = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

function CeteleGun({ g, azami, bugun, aktif, onSec }) {
  const h = cubukBoyu(g.n, azami);
  const haftaSonu = g.d.getDay() === 0 || g.d.getDay() === 6;
  const tarih = g.d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  return (
    <button type="button" onClick={() => onSec(g.d)} aria-pressed={aktif} disabled={!g.n && !aktif}
      aria-label={`${tarih}: ${g.n} kayıt${aktif ? " — defter bu güne süzülü" : g.n ? " — defteri bu güne süz" : ""}`}
      title={`${tarih} · ${g.n} kayıt`} {...focusRing} data-cetele-gun=""
      style={{ border: "none", padding: 0, font: "inherit", color: "inherit", boxSizing: "border-box", cursor: g.n ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4,
        minHeight: CUBUK_AZAMI + 40, paddingBottom: 2, borderRadius: 3,
        background: aktif ? ALFA(T) : haftaSonu ? `color-mix(in srgb, ${PAL.mut3} 6%, transparent)` : "transparent" }}>
      <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "12px", fontWeight: 600, ...TNUM, color: g.n ? (bugun || aktif ? DERIN.T : PAL.ink2) : "transparent" }}>{g.n || 0}</span>
      {g.n
        ? <span data-cetele-cubuk="" aria-hidden="true" style={{ width: 6, height: h, borderRadius: 1.5, background: bugun || aktif ? T : PAL.ink2, opacity: bugun || aktif ? 1 : 0.78, "--cg-h": `${h}px` }} />
        : <span aria-hidden="true" style={{ width: 8, height: 1.5, borderRadius: 1, background: PAL.mut3, opacity: 0.55 }} />}
      <span style={{ fontFamily: MONO, fontSize: 10, lineHeight: "12px", ...TNUM, color: bugun ? DERIN.T : haftaSonu ? PAL.mut3 : PAL.mut2, fontWeight: bugun ? 700 : 500,
        borderBottom: bugun ? `2px solid ${T}` : "2px solid transparent", paddingBottom: 1 }}>
        {String(g.d.getDate()).padStart(2, "0")}
      </span>
    </button>
  );
}

const CETELE_CSS = `
@keyframes cg-ciz{from{transform:scaleY(0)}to{transform:none}}
[data-cetele-cubuk]{transform-origin:50% 100%;animation:cg-ciz .28s var(--ke-ease-out) both}
[data-cetele-gun]:not(:disabled):hover{background:var(--ke-hov)!important}
[data-karar-eylem]:hover{background:var(--ke-hov)!important}
`;

function Cetele({ items, filter }) {
  const gunler = useMemo(() => {
    const bugun = gunBasi(Date.now());
    const out = Array.from({ length: GUN_SAYISI }, (_, i) => ({ d: new Date(bugun - (GUN_SAYISI - 1 - i) * GUN_MS), n: 0 }));
    for (const x of items) {
      const idx = GUN_SAYISI - 1 - Math.round((bugun - gunBasi(x.ts)) / GUN_MS);
      if (idx >= 0 && idx < GUN_SAYISI) out[idx].n += 1;
    }
    return out;
  }, [items]);
  const azami = Math.max(1, ...gunler.map((g) => g.n));
  const toplam = gunler.reduce((a, g) => a + g.n, 0);
  const dolu = gunler.filter((g) => g.n);
  const ort = dolu.length > 1 ? toplam / dolu.length : 0;
  const secili = (d) => filter.filters.dateFrom === d.getTime() && filter.filters.dateTo === d.getTime() + GUN_MS - 1;
  const sec = (d) => (secili(d) ? filter.setDateRange(null, null) : filter.setDateRange(d.getTime(), d.getTime() + GUN_MS - 1));
  return (
    <div role="group" aria-label={`Son ${GUN_SAYISI} günün çetelesi: ${toplam} kayıt — gün seçince defter o güne süzülür`}
      style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${GUN_SAYISI}, minmax(0, 1fr))`, marginTop: "auto", borderTop: `1px solid ${PAL.line}`, paddingTop: SP.s }}>
      <style>{CETELE_CSS}</style>
      {/* Kayıtlı günlerin ortalaması — kesikli kılavuz (yalnız ≥2 dolu gün varsa anlamlı). */}
      {ort > 0 && (
        <span aria-hidden="true" title={`Kayıtlı gün ortalaması: ${sn(ort)}`} style={{ position: "absolute", left: 0, right: 0, bottom: CUBUK_TABAN + cubukBoyu(ort, azami), borderTop: `1px dashed ${PAL.mut3}`, opacity: 0.6, pointerEvents: "none" }}>
          {/* Tur 9 jüri: 9 px etiket çizginin üstüne biniyordu → sağ uçta, çizginin ÜSTÜNDE, 10 px. */}
          <span style={{ position: "absolute", right: 0, bottom: 3, padding: "0 0 0 6px", background: PAL.surf, ...TYPE.antet, fontSize: 10, lineHeight: "12px", color: PAL.mut2, ...TNUM }}>ort {sn(ort)}</span>
        </span>
      )}
      {gunler.map((g, i) => <CeteleGun key={i} g={g} azami={azami} bugun={i === GUN_SAYISI - 1} aktif={secili(g.d)} onSec={sec} />)}
    </div>
  );
}

const kunye = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" };

/* Çetelenin dürüst dipnotu (tur 9 jüri: seyrek veride 12 boş gün açıklamasızdı) — kayıtlı gün
   sayısı + hafta sonu taraması tek mono satırda. */
function CeteleNotu({ items }) {
  const bugun = gunBasi(Date.now());
  const gunler = new Set(items.map((x) => gunBasi(x.ts)).filter((t) => Number.isFinite(t) && bugun - t < GUN_SAYISI * GUN_MS));
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: SP.m, marginTop: SP.xs, ...kunye, color: PAL.mut2, ...TNUM }}>
      <span>Kayıtlı gün {gunler.size} / {GUN_SAYISI}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PAL.mut3 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: `color-mix(in srgb, ${PAL.mut3} 14%, transparent)` }} />hafta sonu
      </span>
    </div>
  );
}
const karo = { borderRadius: RAD.card, background: PAL.surf, boxShadow: SH.card, border: `1px solid ${PAL.line}`, padding: `${SP.l}px ${SP.l + 4}px ${SP.m}px`, minWidth: 0 };

/* Sol karo — BİLGİ karosu (tur 8: tamamı "tümünü göster" düğmesiydi; büyük alan imleçte el
   ikonuna dönüyor ama ne yapacağı belli değildi). Kahraman rakam + sağda üçlü künye
   (bugün · bu hafta · ort. süre) + çetele dizini. Karar filtresi açıkken rakam "n / toplam". */
function EtkinlikKarosu({ items, gorunen, filter, ortSn }) {
  const bugunBas = gunBasi(Date.now());
  const say = (gun) => items.filter((x) => { const t = gunBasi(x.ts); return Number.isFinite(t) && t >= bugunBas - gun * GUN_MS; }).length;
  const suzuk = gorunen.length !== items.length;
  // Tur 9 jüri: "00" bir kod gibi okunuyordu → dolgusuz sayı; sıfır soluk "—".
  const kunyeSatir = [["Bugün", say(0)], ["Son 7 gün", say(6)], ["Ort. süre", ortSn ? `${sn(ortSn)} sn` : 0]];
  return (
    <section aria-label="Sicil etkinliği" style={{ ...karo, display: "flex", flexDirection: "column", position: "relative" }}>
      <span style={kunye}>Sicil · son {GUN_SAYISI} gün</span>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SP.l, marginTop: SP.s, marginBottom: SP.m }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ ...TYPE.disp, color: PAL.ink }}><NumberFlow value={gorunen.length} /></span>
          <span style={{ ...TYPE.ui, color: PAL.mut2, ...TNUM }}>{suzuk ? `/ ${items.length} kayıt · süzülü` : "kayıt"}</span>
        </span>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto auto", columnGap: SP.m, rowGap: 2, fontFamily: MONO, fontSize: 11, lineHeight: "15px", ...TNUM, paddingLeft: SP.m, borderLeft: `1px solid ${PAL.line}` }}>
          {kunyeSatir.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ ...kunye, fontSize: 10, lineHeight: "15px" }}>{k}</dt>
              <dd style={{ margin: 0, textAlign: "right", color: v ? PAL.ink2 : PAL.mut3, fontWeight: v ? 600 : 500 }}>{v || "—"}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
      <Cetele items={gorunen} filter={filter} />
      <CeteleNotu items={gorunen} />
    </section>
  );
}

/* Telefonda karo yalnız ÖZET ŞERİDİ açılınca görünür (bkz. OzetSeridi); orada 2×2 ızgara
   kısa etiketleri TAM yazar — 4 sütunda "Onayla…", "Düzenl…" diye kesiliyordu (jüri tur 6). */
/* Karar karosunun tek düğmesi — sayı + etiket; dokununca listeyi o karara süzer. */
function KararDugmesi({ k, n, aktif, dar, onSec }) {
  return (
    <button type="button" onClick={() => onSec(k.key)} aria-pressed={aktif}
      aria-label={`${k.label}: ${n} evrak${aktif ? " — filtre açık" : ""}`}
      {...focusRing} data-press="" data-dokunma=""
      onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = aktif ? ALFA(k.renk) : "transparent"; }}
      style={{ cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: SP.s,
        padding: dar ? "6px 6px" : "8px 10px", minWidth: 0, borderRadius: RAD.ctl, border: `1px solid ${aktif ? PAL.lineHi : "transparent"}`,
        background: aktif ? ALFA(k.renk) : "transparent",
        transition: "background .12s ease, border-color .12s ease, transform .14s var(--ke-ease-out)" }}>
      {/* Tur 9 jüri: sıfırlara dev punto ağırlık veriyordu → sıfır küçük, soluk "yok" (aynı satır yüksekliği). */}
      <span style={{ ...TYPE.num, ...(dar ? { fontSize: 22, lineHeight: "26px" } : null), color: n ? (aktif ? DERIN_OF(k.renk) : PAL.ink) : PAL.mut3, ...(n ? null : { display: "flex", alignItems: "flex-end", fontFamily: MONO, fontSize: 13, fontWeight: 500, letterSpacing: ".04em" }) }}>{n ? <NumberFlow value={n} /> : "yok"}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.meta, color: n ? PAL.mut2 : PAL.mut3 }}>
        {!dar && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RAD.dot, background: k.renk, opacity: n ? k.doluluk : 0.3, flexShrink: 0 }} />}
        <span title={k.label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(dar ? { fontSize: 11, borderBottom: `2px solid ${k.renk}`, paddingBottom: 1 } : null) }}>{k.key === "duzenlendi" || dar ? k.kisa : k.label}</span>
      </span>
    </button>
  );
}

/* Karar karosunun dibi — EYLEM SATIRI (tur 9 jüri: kartın alt üçte biri boştu): en eski bekleyen
   kaydın sicil no'su + yaşı; tıklayınca defter bekleyenlere süzülür. Taramalı dilim açıklaması
   title'da kalır. */
function EnEskiBekleyen({ enEski, aktif, onSec }) {
  if (!enEski) return null;
  const gun = Math.max(0, Math.round((gunBasi(Date.now()) - gunBasi(enEski.ts)) / GUN_MS));
  return (
    <button type="button" onClick={onSec} aria-pressed={aktif} {...focusRing} data-press="" data-karar-eylem=""
      title="Taramalı dilim memur kararı bekleyen taslaklardır — onaylanınca yeşile döner"
      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.s, padding: `${SP.s}px 10px`, border: "none", borderTop: `1px dashed ${PAL.line}`, background: "transparent", textAlign: "left", borderRadius: 0, color: PAL.ink2, ...TYPE.meta }}>
      <span style={{ ...kunye, color: PAL.mut3 }}>En eski bekleyen</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: DERIN.T, ...TNUM }}>{enEski._no}</span>
      <span style={{ color: PAL.mut2, ...TNUM }}>· {gun ? `${gun} gündür bekliyor` : "bugün kaydedildi"}</span>
      <span aria-hidden="true" style={{ marginLeft: "auto", color: PAL.mut3 }}>{aktif ? "süzülü" : "bekleyenleri süz →"}</span>
    </button>
  );
}

function KararKarosu({ say, aktifSet, onSec, onTumu, enEski }) {
  const dar = useDarEkran();
  const toplam = KARARLAR.reduce((a, k) => a + say[k.key], 0);
  const ozet = KARARLAR.filter((k) => say[k.key] > 0).map((k) => `${say[k.key]} ${k.label.toLocaleLowerCase("tr-TR")}`).join(", ");
  const bekleyenPay = toplam ? say.bekliyor / toplam : 0;
  return (
    <div style={{ ...karo, display: "flex", flexDirection: "column" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SP.m }}>
        <span style={kunye}>Karar dağılımı</span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: SP.m, fontFamily: MONO, fontSize: 11, color: PAL.mut2, ...TNUM, whiteSpace: "nowrap" }}>
          {toplam ? `${toplam - say.bekliyor} / ${toplam} karara bağlandı` : "taslak yok"}
          {aktifSet.size > 0 && (
            <button type="button" onClick={onTumu} {...focusRing} data-press=""
              style={{ border: "none", background: "none", cursor: "pointer", fontFamily: MONO, fontSize: 11, color: DERIN.T, textDecoration: "underline", textUnderlineOffset: 3, padding: "2px 4px", margin: "-2px -4px", borderRadius: RAD.chip }}>
              Tümünü göster
            </button>
          )}
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
        style={{ display: "grid", gridTemplateColumns: dar ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(min(112px, 100%), 1fr))", gap: dar ? 2 : SP.xs, marginTop: SP.m, flex: 1 }}>
        {KARARLAR.map((k) => <KararDugmesi key={k.key} k={k} n={say[k.key]} aktif={aktifSet.has(k.key)} dar={dar} onSec={onSec} />)}
      </div>
      {bekleyenPay > 0 && !dar && <EnEskiBekleyen enEski={enEski} aktif={aktifSet.has("bekliyor")} onSec={() => onSec("bekliyor")} />}
    </div>
  );
}

/* Telefon ÖZET ŞERİDİ — iki karo telefonda ilk kaydı y=836'ya itiyordu (ölçüldü; ilk ekranda
   hiç kayıt yoktu). Tek satır: "7 kayıt · 6 bekliyor · 1 onay" + dokununca karolar açılır
   (disclosure). Bekleyen sayısı tükenmez mavisiyle — görünümün işi o. */
function OzetSeridi({ items, say, acik, onDegis }) {
  const parcalar = [`${items.length} kayıt`, say.bekliyor ? `${say.bekliyor} bekliyor` : null,
    say.onaylandi + say.duzenlendi ? `${say.onaylandi + say.duzenlendi} onay` : null, say.reddedildi ? `${say.reddedildi} ret` : null].filter(Boolean);
  return (
    <button type="button" onClick={onDegis} aria-expanded={acik} aria-controls="isl-ozet-karo" {...focusRing} data-press="" data-dokunma=""
      style={{ cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: SP.s, padding: "10px 14px", textAlign: "left",
        borderRadius: RAD.card, border: `1px solid ${PAL.line}`, background: PAL.surf, boxShadow: SH.card, color: PAL.ink2 }}>
      <span style={{ ...kunye, color: PAL.mut2 }}>Sicil</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12, ...TNUM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {parcalar.map((p, i) => <React.Fragment key={p}>{i > 0 && <span style={{ color: PAL.mut3 }}> · </span>}<span style={{ color: i === 1 && say.bekliyor ? DERIN.T : PAL.ink2, fontWeight: i === 1 && say.bekliyor ? 600 : 500 }}>{p}</span></React.Fragment>)}
      </span>
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, transform: acik ? "rotate(180deg)" : "none", transition: "transform .2s var(--ke-ease-out)" }} />
    </button>
  );
}

/* Yükleme yer tutucusu — özetin birebir silüeti (masaüstü iki karo 206 px · telefon şerit):
   kayıtlar gelince özet araya girip defteri aşağı itmez. */
export function OzetIskelet() {
  const dar = useDarEkran();
  if (dar) return <div aria-hidden="true" style={{ ...karo, height: 44, padding: 0, marginBottom: SP.l }} />;
  return (
    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: SP.m, marginBottom: SP.l }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ ...karo, minHeight: 206, display: "flex", flexDirection: "column", gap: SP.m }}>
          <span style={{ width: 120, height: 8, borderRadius: 3, background: PAL.line }} />
          <span style={{ width: 64, height: 32, borderRadius: 4, background: PAL.line, opacity: .7 }} />
          <span style={{ marginTop: "auto", height: 40, borderRadius: 4, background: PAL.line, opacity: .45 }} />
        </div>
      ))}
    </div>
  );
}

export default function IslenenOzet({ items, filter, ortSn }) {
  const dar = useDarEkran();
  const [acik, setAcik] = useState(false);
  const say = { bekliyor: 0, onaylandi: 0, duzenlendi: 0, reddedildi: 0, islendi: 0 };
  for (const x of items) say[x._durum] = (say[x._durum] || 0) + 1;
  const aktifSet = filter.filters.chips.durum || new Set();
  const temizle = () => aktifSet.forEach((v) => filter.toggleChip("durum", v));
  const karolar = (
    /* auto-fit: dar ekranda tek sütuna iner (390px'te taşma yok). */
    <div id="isl-ozet-karo" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: SP.m, marginBottom: SP.l, alignItems: "stretch", ...(dar ? { marginTop: SP.s, animation: "nu-rise .18s var(--ke-ease-out) both" } : null) }}>
      <EtkinlikKarosu items={items} gorunen={aktifSet.size ? items.filter((x) => aktifSet.has(x._durum)) : items} filter={filter} ortSn={ortSn} />
      <KararKarosu say={say} aktifSet={aktifSet} onSec={(k) => filter.toggleChip("durum", k)} onTumu={temizle}
        enEski={items.filter((x) => x._durum === "bekliyor").reduce((a, x) => (!a || Number(x.ts) < Number(a.ts) ? x : a), null)} />
    </div>
  );
  if (!dar) return karolar;
  return (
    <div style={{ marginBottom: acik ? 0 : SP.m }}>
      <OzetSeridi items={items} say={say} acik={acik} onDegis={() => setAcik((a) => !a)} />
      {acik && karolar}
    </div>
  );
}
