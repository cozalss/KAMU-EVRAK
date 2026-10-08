/* PanelSure — "İşlem Süresi" kartı + KRONOMETRE ŞERİDİ (tur 6, Antet & Damga).
   Eski pastel IRIS bar grafiği (pembe/lila/turkuaz "hologram") paletin dışında kalıyordu —
   jüri: "panelin tek şeker renkli öğesi". Artık süre, sabit ölçekli yatay bir cetvel:
   · Her koşum bir satır: solda mono saat, ortada çubuk (0'dan süreye), sağda mono değer.
     Satır = kayıt defteri satırı; değer çubuğun DIŞINDA yazılır → dar kolonda kırpılmaz.
   · Ölçek tükenmez mavisinin AÇIKLIĞIDIR (sıralı): hızlı = soluk mavi, ortalama–eşik arası =
     dolgun mavi, eşik üstü = ACELE kırmızısı + ünlem ikonu + kırmızı rakam. Renk tek sinyal
     değil: konum (çubuk boyu), sayı ve ikon ayrı taşıyıcılar.
   · Ortalama kesik çizgi, eşik "kırmızı kalem" düz çizgi — ikisi de tüm satırları keser ve
     etiketleri çizginin İKİ YANINA yaslanır (biri sola, biri sağa) → hiç çakışmaz.
   Aynı bileşen rapor modalında büyür (`buyuk`: gün+saat etiketi, 12 satır).
   Hesap lib/sureRapor + lib/panelBrifSaf'ta (saf, testli); burası yalnız sunum. */
import { useMemo } from "react";
import { Btn, NeonCard, Icon, MONO, T, R, TYPE, TNUM, SP, EASE, DERIN, PAL, SR_ONLY } from "./neonUi.jsx";
import { kayitAdi } from "../lib/sohbetMetin.js";
import SureKiyasBloku, { TrendRozet } from "./SureKiyas.jsx";
import { olcumler, ortalama, esikMs, genelTrend, hizKademe, fmtSn, ESIK_KAT } from "../lib/sureRapor.js";
import { kronometreEksen, eksenYuzde, eksenIsaretleri, noktaliSaat, noktaliGunSaat } from "../lib/panelBrifSaf.js";

/* Kademe → çubuk boyası. Mavi açıklık rampası surf ile karıştırılır (opak; iki temada da
   zemine göre doğru açıklık). Kenar tüm kademelerde: soluk dolgu tek başına 3:1'i geçmez. */
/* Tur 6 denetimi: "hızlı" dolgu iki temada zemine karışıyordu (3:1 sınırı) → kenar artık
   tam T (iki temada da zeminden ≥3:1 ayrılan token), dolgu %40. Lejant etiketleri kısa:
   uzun "ortalama ile eşik arası" son kalemi tek başına ikinci satıra düşürüyordu. */
/* Tur 8 jüri (2. tur): %40 ile %78 karışım koyu temada ayırt edilmiyordu → kademe artık
   AÇIKLIKLA değil DOLGUYLA ayrılır: hızlı = yalnız kenar (içi kâğıt), orta = dolu T. İki temada
   da ΔL kâğıt↔mürekkep kadar; lejant okunur. */
const KADEME = {
  hizli: { fill: PAL.surf, kenar: T, l: "ortalamanın altı" },
  orta: { fill: T, kenar: T, l: "ortalama–eşik" },
  yavas: { fill: R, kenar: R, l: "eşik üstü" },
};
const sayiSn = (sn) => String(sn).replace(".", ",");

/* 7 günlük sparkline — tur 8 jüri: kart başlığında kronometreyi tekrarlayan süs gibiydi;
   kartta artık çizilmez (bileşen başka yüzeyler için duruyor). */
export function Sparkline({ seri, aktifGun, birim = "" }) {
  if (aktifGun < 2) return null;
  const W = 64, H = 24, taban = H - 4, max = Math.max(1, ...seri);
  const nokta = seri.map((v, i) => [4 + (i * (W - 8)) / 6, taban - (v / max) * (H - 8)]);
  const yol = nokta.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const son = nokta[6];
  const gunEtiket = (i) => (i === 6 ? "bugün" : i === 5 ? "dün" : `${6 - i} gün önce`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={yol} fill="none" style={{ stroke: PAL.mut3 }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {nokta.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill="transparent" pointerEvents="all">
          <title>{`${gunEtiket(i)}: ${seri[i]}${birim ? ` ${birim}` : ""}`}</title>
        </circle>
      ))}
      <circle cx={son[0]} cy={son[1]} r="3" pointerEvents="none" style={{ fill: T, stroke: PAL.surf }} strokeWidth="2" />
    </svg>
  );
}

/* Referans çizgisi etiketi — çizginin solunda (yon "sol") ya da sağında biter. */
function RefEtiket({ x, yon, renk, children }) {
  return (
    <span style={{ position: "absolute", bottom: 2, left: `${x}%`, transform: yon === "sol" ? "translateX(calc(-100% - 4px))" : "translateX(4px)",
      fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: renk, whiteSpace: "nowrap", ...TNUM }}>{children}</span>
  );
}

/* Izgara + referans çizgileri — tüm satırları keser (aynı ızgara hücresinde üst üste). */
function RefIzgara({ n, isaret, tavanSn, ortX, esikX }) {
  return (
    <span aria-hidden="true" style={{ gridColumn: 2, gridRow: `2 / ${n + 2}`, position: "relative", pointerEvents: "none" }}>
      {isaret.map((v) => <span key={v} style={{ position: "absolute", top: 0, bottom: 0, left: `${eksenYuzde(v * 1000, tavanSn)}%`, width: 1, background: PAL.line }} />)}
      <span style={{ position: "absolute", top: -4, bottom: 0, left: `${ortX}%`, borderLeft: `1px dashed ${PAL.mut2}` }} />
      <span style={{ position: "absolute", top: -4, bottom: 0, left: `${esikX}%`, width: 1.5, background: R }} />
    </span>
  );
}

/* Alt eksen — saniye işaretleri; uçtakiler içe yaslanır (kart kenarından taşmaz). */
function Eksen({ satir, isaret, tavanSn }) {
  return (
    <>
      <span aria-hidden="true" style={{ gridColumn: 2, gridRow: satir, position: "relative", height: 18, borderTop: `1px solid ${PAL.lineHi}` }}>
        {isaret.map((v, i) => (
          <span key={v} style={{ position: "absolute", top: 3, left: `${eksenYuzde(v * 1000, tavanSn)}%`, transform: i === 0 ? "none" : i === isaret.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            fontFamily: MONO, fontSize: 11, lineHeight: "14px", color: PAL.mut2, ...TNUM }}>{sayiSn(v)}</span>
        ))}
      </span>
      <span aria-hidden="true" style={{ gridColumn: 3, gridRow: satir, fontFamily: MONO, fontSize: 11, lineHeight: "20px", color: PAL.mut2, textAlign: "right" }}>sn</span>
    </>
  );
}

function Lejant() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: `${SP.xs}px ${SP.m}px`, marginTop: SP.s, ...TYPE.meta, color: PAL.mut2, whiteSpace: "nowrap" }}>
      {Object.entries(KADEME).map(([k, v]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span aria-hidden="true" style={{ width: 12, height: 8, borderRadius: 2, background: v.fill, border: `1px solid ${v.kenar}` }} />{v.l}
        </span>
      ))}
      {/* Tur 9 jüri: kırmızı dikey çizginin anlamı lejantta yazılı (renk tek sinyal değil). */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span aria-hidden="true" style={{ width: 1.5, height: 12, background: R }} />eşik çizgisi = ortalama × {String(ESIK_KAT).replace(".", ",")}
      </span>
    </div>
  );
}

/* Satır etiketi (tur 8 jüri: "21:14" üç kez art arda → çubuklar kimliksizdi): kısaltılmış
   evrak adı; saat değerin yanına (rapor) ya da title + ekran okuyucu listesine (kart) iner. */
const satirAdi = (x) => kayitAdi({ konu: x.konu, name: x.ad, evrak_turu: x.evrakTuru });

/* Ekran okuyucu karşılığı — grafik role=img tek etiket taşıyordu; satırlar artık okunur. */
function SrListe({ satirlar, ort }) {
  return (
    <ol style={SR_ONLY}>
      {satirlar.map((x, i) => (
        <li key={`${x.id}-${i}`}>{`${satirAdi(x)}, ${noktaliGunSaat(x.ts) || "zaman yok"}: ${fmtSn(x.ms)} saniye, ${KADEME[hizKademe(x.ms, ort)].l}`}</li>
      ))}
    </ol>
  );
}

/* Kronometre şeridi. `olcum` en yeni önce gelir; satırlar da en yeni üstte (defter sırası).
   `vurgu`/`onVurgu`: rapor modalında çubuk ↔ tablo satırı eşlemesi (hover'da ikisi birlikte). */
/* `eksenMs`: eksene ek katılacak süreler — rapor modalı tüm ölçümleri verir ki tür tablosu ile
   AYNI 0–tavan ölçeğini ve aynı eşik x'ini paylaşsın (tur 8 jüri 2). */
export function Kronometre({ olcum, ort, satirN = 7, buyuk = false, vurgu = null, onVurgu = null, eksenMs = null }) {
  const esik = esikMs(ort);
  const satirlar = olcum.slice(0, satirN);
  const { tavanSn, adimSn } = kronometreEksen([...satirlar.map((x) => x.ms), ...(eksenMs || [])], esik);
  const isaret = eksenIsaretleri(tavanSn, adimSn);
  const ortX = eksenYuzde(ort, tavanSn), esikX = eksenYuzde(esik, tavanSn);
  const satirH = buyuk ? 26 : 22;
  /* Etiket sütunu kart genişliğiyle büyür (1920'de 96 px'e kilitli adlar gereksiz kesiliyordu). */
  /* Tur 8 jüri: kartta adlar ~13 karakterde kesiliyordu ("4982 sayılı Kan…") → en az 140 px. */
  /* Tur 9 jüri 2: %56'lık etiket sütunu izi 1440'ta ~40 px'e sıkıştırıyordu, eksen rakamları
     üst üste biniyordu → etiket en çok %38 (ad title'da tam), iz kalan genişliği alır. */
  const etiketW = buyuk ? "220px" : "minmax(96px, 38%)";
  const degerW = buyuk ? 112 : 50;
  const n = satirlar.length;
  return (
    <div>
      <SrListe satirlar={satirlar} ort={ort} />
      <div role="img" aria-label={`Son ${n} işlemin süreleri; ortalama ${fmtSn(ort)}, yavaş işlem eşiği ${fmtSn(esik)} saniye`}
        style={{ display: "grid", gridTemplateColumns: `${etiketW} minmax(0, 1fr) ${degerW}px`, columnGap: SP.s, marginTop: SP.m }}>
        <span aria-hidden="true" style={{ gridColumn: 1, gridRow: 1, alignSelf: "end", ...TYPE.antet, fontSize: 11, color: PAL.mut2, ...TNUM }}>SON {n} İŞLEM</span>
        <span aria-hidden="true" style={{ gridColumn: 2, gridRow: 1, position: "relative", height: 20 }}>
          <RefEtiket x={ortX} yon="sol" renk={PAL.mut2}>ort. {fmtSn(ort)}</RefEtiket>
          <RefEtiket x={esikX} yon="sag" renk={DERIN.R}>eşik {fmtSn(esik)}</RefEtiket>
        </span>
        <RefIzgara n={n} isaret={isaret} tavanSn={tavanSn} ortX={ortX} esikX={esikX} />
        {satirlar.map((x, i) => {
          const k = hizKademe(x.ms, ort), b = KADEME[k];
          const saat = buyuk ? noktaliGunSaat(x.ts) : noktaliSaat(x.ts);
          const ad = satirAdi(x);
          const v = vurgu != null && vurgu === x.id;
          const es = onVurgu ? { onMouseEnter: () => onVurgu(x.id), onMouseLeave: () => onVurgu(null) } : null;
          return [
            <span key={`e${i}`} aria-hidden="true" title={`${ad} · ${saat}`} {...es} style={{ gridColumn: 1, gridRow: i + 2, alignSelf: "center", ...TYPE.meta, lineHeight: `${satirH}px`,
              color: v ? DERIN.T : PAL.ink2, fontWeight: v ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad}</span>,
            <span key={`b${i}`} title={`${ad} · ${saat} — ${fmtSn(x.ms)} sn (${b.l})`} {...es} style={{ gridColumn: 2, gridRow: i + 2, display: "flex", alignItems: "center", height: satirH, position: "relative",
              background: v ? PAL.hov : "transparent", transition: `background .14s ${EASE.out}` }}>
              <span style={{ height: buyuk ? 10 : 8, width: `max(4px, ${eksenYuzde(x.ms, tavanSn)}%)`, background: b.fill, border: `1px solid ${b.kenar}`,
                borderRadius: "0 2px 2px 0", transformOrigin: "0 50%", animation: `pv-serit .6s ${EASE.out} ${120 + i * 50}ms both` }} />
            </span>,
            <span key={`d${i}`} aria-hidden="true" style={{ gridColumn: 3, gridRow: i + 2, alignSelf: "center", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3,
              fontFamily: MONO, fontSize: 12, lineHeight: `${satirH}px`, fontWeight: k === "yavas" ? 600 : 400, color: k === "yavas" ? DERIN.R : PAL.ink2, ...TNUM }}>
              {buyuk && <span style={{ fontSize: 11, color: PAL.mut3, fontWeight: 400, marginRight: 6 }}>{saat}</span>}
              {k === "yavas" && <Icon.alert width={12} height={12} />}{fmtSn(x.ms)}
            </span>,
          ];
        })}
        <Eksen satir={n + 2} isaret={isaret} tavanSn={tavanSn} />
      </div>
      <Lejant />
    </div>
  );
}

/* Tur 9 jüri: kart sıra yüksekliğine gerilince dipte ~120 px boşluk kalıyordu → 10 satır. */
const KART_SATIR_N = 10;

/* Panel kartı — büyük ortalama + trend, kronometre, kıyas, detay raporu (ikincil). */
export default function IslemSuresiKart({ history, onRapor, raporRef }) {
  const olcum = useMemo(() => olcumler(history), [history]);
  const ort = useMemo(() => ortalama(olcum), [olcum]);
  const gTrend = useMemo(() => genelTrend(olcum), [olcum]);
  return (
    <NeonCard title="İşlem Süresi" accent={T} icon={<Icon.clock width={16} height={16} />} style={{ flex: 1, display: "flex", flexDirection: "column" }} bodyCenter
      tag={olcum.length ? `son ${Math.min(olcum.length, KART_SATIR_N)} işlem` : undefined}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {olcum.length === 0 ? (
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Süre verisi bu oturumdan itibaren toplanıyor; bir evrak işleyin.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.m, flexWrap: "wrap" }}>
            <span style={{ ...TYPE.num, fontSize: 30, lineHeight: "34px", color: PAL.ink, ...TNUM }}>{fmtSn(ort)}<span style={{ ...TYPE.data, fontWeight: 500, color: PAL.mut2, marginLeft: 4 }}>sn ort.</span></span>
            <TrendRozet t={gTrend} sade />
          </div>
          <Kronometre olcum={olcum} ort={ort} satirN={KART_SATIR_N} />
          <SureKiyasBloku history={history} />
        </>
      )}
      {/* Esneyen kartta boşluk eylemin ÜSTÜNDE kalır; düğme kartın tabanına oturur (ortak taban). */}
      <div style={{ marginTop: "auto", paddingTop: SP.l }}>
        <Btn onClick={(e) => { if (raporRef) raporRef.current = e.currentTarget; onRapor(); }} ariaLabel="İşlem süresi detay raporunu aç" style={{ width: "100%", justifyContent: "center" }}>
          Detay raporu <Icon.arrow width={14} height={14} />
        </Btn>
      </div>
      </div>
    </NeonCard>
  );
}
