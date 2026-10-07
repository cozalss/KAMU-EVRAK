/* PanelCetvel — SÜRE CETVELİ (tur 8 imza hamlesi; jüri "imza fırsatı 1").
   Kahramandaki yığılmış SLA şeridinin MASAÜSTÜ hâli: resmî bir tarih cetveli. Yatay eksen
   −14…+30 gün, gün başına milimetre çentiği, haftada bir uzun çentik + mono etiket; "bugün"
   tükenmez mavisi dikey çizgi. Her evrak cetvele iğnelenmiş küçük bir fiştir: gecikenler
   çizginin SOLUNDA ACELE kırmızısı, yaklaşanlar sağında. Aynı güne düşenler üst üste dizilir.
   Eksen dışına düşen evrak (−14'ten eski / +30'dan ileri) uçta "‹ N" / "N ›" künyesiyle sayılır
   — sessizce düşmez. Süresi tanımsız evrak cetvelde YOK; sayısı lejantta zaten yazılı.
   VERİ KAYNAĞI YENİ DEĞİL: aynı `kuyrukSla` (kalan_gun · durum · son_tarih).
   Mürekkep köprüsü: iğneye gelince `onOdak(id)` → defter satırı ve takvim günü birlikte vurgulanır. */
import { DISPLAY, MONO, T, TNUM, SP, RAD, EASE, DERIN, DERIN_OF, PAL, BANT } from "./neonUi.jsx";

const BAS = -14, BIT = 30, ARALIK = BIT - BAS;
const IGNE = 9, KAT = 11, EKSEN_H = 22;
const x = (gun) => ((Math.max(BAS, Math.min(BIT, gun)) - BAS) / ARALIK) * 100;
const renkOf = (d) => (d === "GECIKMIS" ? BANT.kirmizi.c : d === "KRITIK" ? BANT.sari.c : BANT.yesil.c);
const ETIKET = { [-14]: "−14", [-7]: "−7", 0: "BUGÜN", 7: "+7", 14: "+14", 21: "+21", 28: "+28" };

/* kalan_gun → gün kovası; eksen dışını uçlarda sayar. */
function kovala(kuyrukSla) {
  const kova = new Map(); let solDis = 0, sagDis = 0;
  for (const it of kuyrukSla) {
    const k = it.sla?.kalan_gun;
    if (!Number.isFinite(k)) continue;
    if (k < BAS) { solDis++; continue; }
    if (k > BIT) { sagDis++; continue; }
    kova.set(k, [...(kova.get(k) || []), it]);
  }
  return { kova, solDis, sagDis };
}

function Igne({ it, gun, kat, odak, onOdak, sira }) {
  const renk = renkOf(it.sla.durum);
  const vurgulu = odak === it.id;
  return (
    <span title={`${it.label} — ${it.sla.son_tarih || ""} (${gun < 0 ? `${-gun} gün gecikti` : `${gun} gün kaldı`})`}
      onMouseEnter={() => onOdak?.(it.id)} onMouseLeave={() => onOdak?.(null)}
      style={{ position: "absolute", left: `${x(gun)}%`, bottom: EKSEN_H + kat * KAT, width: IGNE, height: IGNE, marginLeft: -IGNE / 2,
        borderRadius: RAD.dot, background: vurgulu ? DERIN_OF(renk) : renk, boxShadow: `0 0 0 ${vurgulu ? 3 : 1.5}px ${PAL.surf}`,
        transform: vurgulu ? "scale(1.35)" : "none", transition: `transform .14s ${EASE.out}, box-shadow .14s ${EASE.out}`,
        animation: `pv-gir .28s ${EASE.out} ${360 + sira * 18}ms both`, cursor: "default" }} />
  );
}

function Eksen() {
  return (
    <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: EKSEN_H, borderTop: `1px solid ${PAL.ink2}` }}>
      {Array.from({ length: ARALIK + 1 }, (_, i) => {
        const g = BAS + i, hafta = g % 7 === 0;
        return <span key={g} style={{ position: "absolute", top: 0, left: `${x(g)}%`, width: 1, height: hafta ? 7 : 3, background: hafta ? PAL.ink2 : PAL.mut3 }} />;
      })}
      {Object.entries(ETIKET).map(([g, l]) => (
        <span key={g} style={{ position: "absolute", top: 8, left: `${x(+g)}%`, transform: +g === BAS ? "none" : "translateX(-50%)",
          fontFamily: MONO, fontSize: 10, lineHeight: "12px", letterSpacing: ".06em", color: +g === 0 ? DERIN.T : PAL.mut3, fontWeight: +g === 0 ? 600 : 400, whiteSpace: "nowrap", ...TNUM }}>{l}</span>
      ))}
    </span>
  );
}

/** Süre cetveli — kuyruğun zaman çizelgesi. */
export default function SureCetveli({ kuyrukSla, odak, onOdak }) {
  const { kova, solDis, sagDis } = kovala(kuyrukSla);
  const enYuksek = Math.max(1, ...[...kova.values()].map((l) => l.length));
  const yukseklik = EKSEN_H + enYuksek * KAT + 14;
  const gecikmis = [...kova.entries()].filter(([g]) => g < 0).reduce((t, [, l]) => t + l.length, 0) + solDis;
  let sira = 0;
  return (
    <div role="img" aria-label={`Süre cetveli: ${gecikmis} evrakın süresi geçti, bugün çizgisinin sağında ${kuyrukSla.length - gecikmis} evrak`}
      style={{ position: "relative", height: yukseklik, marginTop: SP.xs }}>
      {/* Geçmiş bölge — bugünün solu; ACELE kırmızısının en soluk hâli (veri bölgesi, süs değil). */}
      <span aria-hidden="true" style={{ position: "absolute", left: 0, width: `${x(0)}%`, top: 0, bottom: EKSEN_H,
        background: `color-mix(in srgb, ${BANT.kirmizi.c} 6%, transparent)`, borderRadius: `${RAD.chip}px 0 0 0` }} />
      <span aria-hidden="true" style={{ position: "absolute", left: `${x(0)}%`, top: -2, bottom: 0, width: 2, marginLeft: -1, background: T,
        transformOrigin: "50% 100%", animation: `pv-cizgi .32s ${EASE.out} 300ms both` }} />
      <Eksen />
      {[...kova.entries()].map(([gun, liste]) => liste.map((it, kat) => (
        <Igne key={it.id} it={it} gun={gun} kat={kat} odak={odak} onOdak={onOdak} sira={sira++} />
      )))}
      {solDis > 0 && <UcKunye sol n={solDis} />}
      {sagDis > 0 && <UcKunye n={sagDis} />}
    </div>
  );
}

function UcKunye({ sol, n }) {
  return (
    <span title={sol ? `${n} evrak 14 günden fazla gecikti` : `${n} evrakın son günü 30 günden ileride`}
      style={{ position: "absolute", top: 0, [sol ? "left" : "right"]: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 12,
        color: sol ? DERIN.kirmizi : PAL.mut2, ...TNUM }}>{sol ? `‹ ${n}` : `${n} ›`}</span>
  );
}
