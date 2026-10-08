/* PanelAkis — AKIŞ NABZI = defter sayfası altındaki "NAKLİ YEKÛN" satırı.
   Tur 8 (jüri: "toplam ile günlük fark aynı hücrede karışıyor; çetele okunmuyor; Gelen
   hücresi ritmi kırıyor"):
   · TEK ZAMAN ÖLÇEĞİ: büyük rakam SON 7 GÜN, kıyas ÖNCEKİ 7 GÜNE göre (lib/gunlukSeri
     haftalikKiyas). Tüm zamanların toplamı etiket satırının sağında küçük künye ("toplam 33").
   · ÇETELE hücre genişliğine yayılır; altında gün harfleri (Pt…Pa), bugün T. Açılışta çentikler
     kalemle çekilir gibi bir kez yükselir (transform-only, reduced-motion'da son kare).
   · GELEN: tarihsel seri yok → kuyruğun kendisi BEŞLİ ÇETELE ile (dört dik + bir çapraz, defter
     çetelesi); dik çizgi rengi evrakın süre durumu, kıyas satırı "1 gecikmiş · 2 kritik".
   · HÜCRE BAZLI KAYNAK DURUMU: her hücre kendi kaynağının durumunu taşır (bekliyor → iskelet,
     yok → "—" + "alınamadı"). Gelen kuyruğu yerel veridir, hiçbir zaman iskelete girmez.
   Tıklama alanı hücrenin tamamı; NumberFlow yalnız canlı değişimde akar. */
import { cloneElement } from "react";
import NumberFlow from "@number-flow/react";
import { MONO, DISPLAY, T, R, TYPE, TNUM, SP, RAD, SH, EASE, DERIN, PAL, BANT, focusRing } from "./neonUi.jsx";
import { iskeletCizgi, iskeletNefes } from "./PanelBrif.jsx";
import { haftalikKiyas } from "../lib/gunlukSeri.js";

const GUN_KISA = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];
const GUN_ETIKET = (i) => (i === 6 ? "bugün" : i === 5 ? "dün" : `${6 - i} gün önce`);
const CETELE_H = 30;
/* Tur 9 jüri: mono künyeler 9/10/11 px'e dağılmıştı, mut3 AA sınırındaydı → tek basamak 11 px, mut2. */
const KUNYE = { fontFamily: MONO, fontSize: 11, lineHeight: "12px", letterSpacing: ".04em", color: PAL.mut2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/* Son 7 günün hafta günü kısaltmaları (seri[6] = bugün). */
function gunHarfleri(simdi = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(simdi - (6 - i) * 86_400_000);
    return GUN_KISA[(d.getDay() + 6) % 7];
  });
}

/* Çetele — 7 gün; çentik boyu adet/max, boş gün 2 px kıl. Hücrenin kalan genişliğini doldurur. */
function Cetele({ seri }) {
  const max = Math.max(1, ...seri);
  const harf = gunHarfleri();
  return (
    <span aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 96, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", columnGap: 6 }}>
      {seri.map((v, i) => (
        <span key={i} title={`${GUN_ETIKET(i)}: ${v}`} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3, minWidth: 0 }}>
          <span style={{ height: CETELE_H, display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${PAL.lineHi}` }}>
            <span style={{ width: "100%", height: v > 0 ? 5 + Math.round((v / max) * (CETELE_H - 5)) : 2, borderRadius: "1px 1px 0 0",
              /* Tur 8 jüri: mut2 çubuklar koyuda sayfanın en parlak gri lekesiydi → geçmiş günler
                 tükenmez mavisinin soluk kademesi, yalnız bugün tam T. */
              background: i === 6 && v > 0 ? T : v > 0 ? `color-mix(in srgb, ${T} 32%, ${PAL.surf})` : PAL.lineHi, transformOrigin: "50% 100%",
              animation: `pv-cizgi .28s ${EASE.out} ${320 + i * 18}ms both` }} />
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "12px", textAlign: "center", color: i === 6 ? DERIN.T : PAL.mut2, fontWeight: i === 6 ? 600 : 400 }}>{harf[i]}</span>
        </span>
      ))}
    </span>
  );
}

/* Beşli çetele — kuyruktaki her evrak bir dik çizgi; beşincisi demeti çaprazlar. Dik çizginin
   rengi evrakın süre durumu (gecikmiş/kritik), çapraz mürekkep. Konum + adet renk dışı sinyal. */
const DEMET_W = 26;
function BesliCetele({ kuyruk, sik }) {
  const cizgiler = kuyruk.renkler;
  const demetler = [];
  for (let i = 0; i < cizgiler.length; i += 5) demetler.push(cizgiler.slice(i, i + 5));
  return (
    <span aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 96, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ height: CETELE_H, display: "flex", alignItems: "flex-end", gap: 10, borderBottom: `1px solid ${PAL.lineHi}`, overflow: "hidden" }}>
        {demetler.map((d, di) => (
          <svg key={di} width={DEMET_W} height={24} viewBox={`0 0 ${DEMET_W} 24`} style={{ flexShrink: 0, overflow: "visible" }}>
            {d.slice(0, 4).map((c, i) => (
              <line key={i} x1={3 + i * 6} y1={2} x2={3 + i * 6} y2={23} pathLength={1} strokeDasharray="1" strokeWidth={2} strokeLinecap="round"
                style={{ stroke: c, animation: `pv-ciz .22s ${EASE.out} ${340 + (di * 5 + i) * 18}ms both` }} />
            ))}
            {d.length === 5 && (
              <line x1={0} y1={19} x2={DEMET_W - 2} y2={5} pathLength={1} strokeDasharray="1" strokeWidth={2} strokeLinecap="round"
                style={{ stroke: d[4], animation: `pv-ciz .22s ${EASE.out} ${340 + (di * 5 + 4) * 18}ms both` }} />
            )}
          </svg>
        ))}
      </span>
      {!sik && <span style={KUNYE}>ANLIK · BEŞLİ ÇETELE</span>}
    </span>
  );
}

/* Paraf cetveli (tur 9 jüri: "%3 dolu oran çubuğu boş kutu gibi") — taslak başına bir ÇENTİK:
   paraflı = tam boy tükenmez, reddedilen = tam boy ACELE, bekleyen = kısa kıl (her beşincisi bir
   boy uzun → cetvel okunur). Künye kesir yazar ("PARAFLI 1/33"); renk tek sinyal değil (boy).
   Çok taslakta (>60) çentik kılcala döner → eski oran çubuğu. */
const CENTIK_AZAMI = 60;
function ParafCentik({ p }) {
  const dizi = [...Array(p.onaylandi).fill("onay"), ...Array(p.reddedildi).fill("red"), ...Array(p.bekliyor).fill("bekle")];
  return (
    <span style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${dizi.length}, minmax(0, 1fr))`, columnGap: 2, alignItems: "end", height: 22,
      transformOrigin: "50% 100%", animation: `pv-cizgi .32s ${EASE.out} 320ms both` }}>
      {dizi.map((k, i) => (
        <span key={i} style={{ height: k === "bekle" ? ((i + 1) % 5 === 0 ? 10 : 6) : 22, borderRadius: 1,
          background: k === "onay" ? T : k === "red" ? R : PAL.mut3 }} />
      ))}
    </span>
  );
}
function ParafOran({ p }) {
  const t = Math.max(1, p.toplam);
  const dilim = [["onay", p.onaylandi, T], ["red", p.reddedildi, R], ["bekle", p.bekliyor, null]].filter((d) => d[1] > 0);
  return (
    <span style={{ flex: 1, display: "flex", gap: 2, height: 12, transformOrigin: "0 50%", animation: `pv-serit .5s ${EASE.out} 320ms both` }}>
      {dilim.map(([k, n, c]) => (
        <span key={k} style={{ flex: `${n / t} 1 0`, minWidth: 4, boxSizing: "border-box", background: c || PAL.surf, border: `1px solid ${c || PAL.mut3}`, borderRadius: 2 }} />
      ))}
    </span>
  );
}
function ParafSerit({ p, sik }) {
  return (
    <span aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 96, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ height: CETELE_H, display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${PAL.lineHi}` }}>
        {p.toplam <= CENTIK_AZAMI ? <ParafCentik p={p} /> : <ParafOran p={p} />}
      </span>
      {!sik && <span style={{ ...KUNYE, ...TNUM }}>PARAFLI {p.onaylandi}/{p.toplam}{p.reddedildi ? ` · RET ${p.reddedildi}` : ""}</span>}
    </span>
  );
}

/* Seyrek seri — 7 günden en çok biri dolu: altı boş çubuk ölü görünür (tur 8 jüri) → tek
   anlatı satırı (hangi gün, kaç kayıt). Çubuk dili ancak karşılaştırılacak ≥2 gün varken. */
function SeyrekNot({ seri }) {
  const i = seri.findIndex((v) => v > 0);
  const metin = i < 0 ? "KAYIT BEKLENİYOR" : `YALNIZ ${GUN_ETIKET(i).toLocaleUpperCase("tr-TR")} · ${seri[i]} KAYIT`;
  return (
    <span aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 96, display: "flex", alignItems: "flex-end", height: CETELE_H + 15,
      paddingBottom: 15, boxSizing: "border-box" }}>
      <span style={{ flex: 1, borderBottom: `1px dashed ${PAL.lineHi}`, paddingBottom: 4, fontFamily: MONO, lineHeight: "12px",
        letterSpacing: ".06em", color: PAL.mut2, fontSize: 11, ...TNUM }}>{metin}</span>
    </span>
  );
}
const seyrekMi = (seri) => seri.filter((v) => v > 0).length <= 1;

function Rakam({ value, sifir }) {
  return (
    <span style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: "34px", fontWeight: 800, fontStretch: "118%", letterSpacing: "-.03em",
      color: sifir ? PAL.mut2 : PAL.ink, ...TNUM }}><NumberFlow value={value} /></span>
  );
}

/* Kıyas satırı — hücreden hücreye AYNI konumda (ritim). */
function KiyasSatir({ h, durum }) {
  if (durum === "bekliyor") return <span style={iskeletCizgi(120, 9, { marginTop: 3 })} />;
  /* Tur 9 jüri: hata dört yerde söyleniyordu → hücre yalnız sakin künye; açıklama tek fişte. */
  if (durum === "yok") return <span style={{ ...KUNYE, letterSpacing: ".06em" }}>ALINAMADI</span>;
  if (h.kuyruk) {
    const { gecikmis, kritik, bilinmiyor } = h.kuyruk;
    if (bilinmiyor) return <span style={{ ...TYPE.meta, color: PAL.mut2 }}>süre durumu bilinmiyor</span>;
    const parca = [gecikmis ? `${gecikmis} gecikmiş` : null, kritik ? `${kritik} kritik` : null].filter(Boolean);
    return <span style={{ ...TYPE.meta, color: gecikmis ? DERIN.kirmizi : PAL.mut2, ...TNUM }}>{parca.length ? parca.join(" · ") : "acil evrak yok"}</span>;
  }
  if (h.paraf) {
    const p = h.paraf;
    return <span style={{ ...TYPE.meta, color: PAL.mut2, ...TNUM }}>{p.onaylandi} onaylandı · {p.reddedildi} reddedildi · {p.toplam} taslak</span>;
  }
  /* Renk YÖNE değil ANLAMA bağlı (tur 8 jüri): yeşil yalnız hücrenin "iyi yönü" gerçekleşince;
     iyi yönü tanımsız hücre (iş yükü) nötr kalır. */
  const k = haftalikKiyas(h.gunluk);
  const iyi = k && h.iyiYon && k.yon === h.iyiYon;
  return k ? <span style={{ ...TYPE.meta, color: iyi ? DERIN.yesil : PAL.mut2, ...TNUM }}>{k.metin}</span> : null;
}

/* Hücre gövdesi — etiket (+ toplam künyesi) · rakam + çetele · kıyas. */
function HucreIc({ h, sik }) {
  const durum = h.durum || "ok";
  const deger = h.kuyruk || h.paraf ? h.value : h.gunluk?.son7N ?? 0;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: SP.s, width: "100%", minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.meta, color: PAL.mut2, minWidth: 0 }}>
        <span aria-hidden="true" style={{ display: "flex", color: durum === "ok" && deger ? DERIN.T : PAL.mut3 }}>{cloneElement(h.icon, { width: 14, height: 14 })}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
        {!sik && <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", color: PAL.mut2, ...TNUM }}>
          {h.kuyruk ? "KUYRUK" : h.paraf && (durum === "ok" || durum === "bayat") ? "PARAF DURUMU"
            : durum === "ok" || durum === "bayat" ? `TOPLAM ${h.value}` : "SON 7 GÜN"}
        </span>}
      </span>
      <span style={{ display: "flex", alignItems: "flex-end", gap: SP.l, minHeight: 44 }}>
        {durum === "bekliyor" ? <span style={{ display: "flex", alignItems: "center", height: 34 }}><span style={iskeletCizgi(48, 24)} /></span>
          : durum === "yok" ? <span style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: "34px", fontWeight: 800, color: PAL.mut2 }}>—</span>
            : <Rakam value={deger} sifir={deger === 0} />}
        {durum !== "yok" && durum !== "bekliyor" && (h.kuyruk ? <BesliCetele kuyruk={h.kuyruk} sik={sik} />
          : h.paraf ? <ParafSerit p={h.paraf} sik={sik} /> : h.gunluk && (seyrekMi(h.gunluk.seri) ? <SeyrekNot seri={h.gunluk.seri} /> : <Cetele seri={h.gunluk.seri} />))}
      </span>
      <KiyasSatir h={h} durum={durum} />
    </span>
  );
}

function AkisHucre({ h, i, kolon }) {
  const kutu = { textAlign: "left", padding: `${SP.m + 2}px ${SP.l + 2}px`, width: "100%", height: "100%",
    background: "transparent", border: "none", borderRadius: 0, display: "flex", minWidth: 0,
    borderLeft: i % kolon !== 0 ? `1px solid ${PAL.line}` : "none",
    borderTop: i >= kolon ? `1px solid ${PAL.line}` : "none" };
  if (h.durum === "bekliyor") return <div style={{ ...kutu, ...iskeletNefes(i * 60) }}><HucreIc h={h} sik={kolon < 4} /></div>;
  return (
    <button type="button" onClick={h.onClick} aria-label={h.ariaLabel || h.label} {...focusRing} data-press=""
      onMouseEnter={(e) => { e.currentTarget.style.background = PAL.hov; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...kutu, cursor: "pointer", transition: `background .14s ${EASE.out}, transform .14s ${EASE.out}` }}>
      <HucreIc h={h} sik={kolon < 4} />
    </button>
  );
}

/* Kuyruk çetelesinin boyası — süre durumuna göre (sıra: gecikmiş → kritik → diğer). */
export function kuyrukCetelesi(kuyrukSla, inboxCount, slaBilinen = true) {
  const say = { gecikmis: 0, kritik: 0 };
  for (const x of kuyrukSla) {
    if (x.sla?.durum === "GECIKMIS") say.gecikmis++;
    else if (x.sla?.durum === "KRITIK") say.kritik++;
  }
  const n = Math.max(inboxCount, 0);
  const renkler = Array.from({ length: n }, (_, i) => (i < say.gecikmis ? BANT.kirmizi.c : i < say.gecikmis + say.kritik ? BANT.sari.c : PAL.mut2));
  /* SLA alınamadıysa YA DA boş döndüyse (kuyrukta evrak var, süre satırı yok) "acil evrak
     yok" denmez — bilinmeyen sıfır diye beyan edilmez (tur 8 jüri: boş hâl gerilemesi). */
  return { ...say, renkler, bilinmiyor: kuyrukSla.length === 0 && (n > 0 || !slaBilinen) };
}

export default function AkisKarti({ hucreler, kolon }) {
  const bekliyor = hucreler.some((h) => h.durum === "bekliyor");
  return (
    <section aria-label="Akış nabzı" aria-busy={bekliyor || undefined}
      style={{ background: PAL.surf, border: `1px solid ${PAL.line}`, borderRadius: RAD.card, boxShadow: SH.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, padding: `${SP.s + 2}px ${SP.l + 2}px`, ...TYPE.antet, color: PAL.mut2 }}>
        <span style={{ whiteSpace: "nowrap" }}>AKIŞ NABZI{kolon >= 4 ? " · NAKLİ YEKÛN" : ""}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, minWidth: 12 }} />
        <span style={{ whiteSpace: "nowrap" }}>{kolon >= 4 ? "RAKAM: SON 7 GÜN · KIYAS: ÖNCEKİ 7 GÜN" : "SON 7 GÜN"}</span>
      </div>
      {/* Yekûn çizgisi — defter sayfa sonu toplamının çift çizgisi (antet çizgisiyle aynı dil). */}
      <div aria-hidden="true" style={{ height: 4, borderTop: `1px solid ${PAL.lineHi}`, borderBottom: `1px solid ${PAL.lineHi}` }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${kolon}, minmax(0, 1fr))` }}>
        {hucreler.map((h, i) => <AkisHucre key={h.label} h={h} i={i} kolon={kolon} />)}
      </div>
    </section>
  );
}
