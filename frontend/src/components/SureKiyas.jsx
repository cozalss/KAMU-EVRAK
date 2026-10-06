/* SureKiyas — işlem süresi trend rozeti + dönem kıyaslama bloğu.
   İKİ YERDE kullanılır: Panel'deki kompakt "İşlem Süresi" kartının altı ve detay raporu
   modalı. Ortak dosya olmasının nedeni "yeşil aşağı = iyileşme" kuralının TEK yerde
   durması — aynı rozet iki dosyada ayrı yazılsaydı biri güncellenip diğeri unutulurdu.

   Hesap yok: her şey lib/sureRapor.js'ten gelir (saf, test edilir). Burası yalnız sunum. */
import { useMemo } from "react";
import { DISPLAY, TYPE, TNUM, SP, RAD, ALFA, DERIN_OF, PAL, BANT } from "./neonUi.jsx";
import { olcumler, donemKiyas, fmtSn } from "../lib/sureRapor.js";
import { kiyasCoker } from "../lib/panelBrifSaf.js";

/* Trend rozeti — süre TERS yönlü metrik: düşüş yeşil aşağı ok, artış kırmızı yukarı ok.
   Yorum (`iyi`) lib'den gelir; burada yalnız renge çevrilir.
   `sade`: çipsiz varyant (ok + yüzde + "azaldı/arttı") — büyük metriğin yanında çip fazla
   ağır duruyordu; renk + ok + söz üçlüsü zaten yeterli sinyal. Söz `yon`dan türer, `iyi`den
   değil: "azaldı/arttı" bir OLGU, iyi/kötü ise yorum. */
export function TrendRozet({ t, buyuk, sade }) {
  if (!t) return null;
  if (t.yon === "sabit") return <span style={{ ...TYPE.meta, color: PAL.mut2 }}>değişim yok</span>;
  const renk = t.iyi ? BANT.yesil.c : BANT.kirmizi.c;
  const yukari = t.yon === "artis";
  const ok = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={yukari ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"}
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const ortak = { display: "inline-flex", alignItems: "center", gap: SP.xs, color: DERIN_OF(renk), ...TNUM };
  if (sade) {
    return (
      <span style={{ ...ortak, ...TYPE.data, fontWeight: 600 }}>
        {ok} %{t.yuzde} {yukari ? "arttı" : "azaldı"}
      </span>
    );
  }
  return (
    <span title={t.iyi ? "Süre düştü — iyileşme" : "Süre arttı"}
      style={{ ...ortak, ...(buyuk ? TYPE.data : TYPE.meta), fontWeight: 600,
        padding: buyuk ? "4px 10px" : "2px 8px", borderRadius: RAD.chip, background: ALFA(renk) }}>
      {ok} %{t.yuzde}
    </span>
  );
}

/* Tek dönem karosu. Pencerede hiç işlem yoksa DÜRÜSTÇE söylenir — ortalama uydurulmaz. */
export function KiyasKaro({ baslik, kiyas, gun }) {
  /* 2026-10: kutulu karo yerine defter sütunu — üstte 2px mürekkep çizgisi, Archivo rakam.
     Kart içinde kart (çift çerçeve) gürültüsü kalktı; iki dönem yan yana bir cetvel gibi okunur. */
  return (
    <div style={{ flex: "1 1 160px", minWidth: 0, borderTop: `2px solid ${PAL.ink}`, paddingTop: SP.s }}>
      <p style={{ margin: `0 0 ${SP.xs}px`, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase" }}>{baslik}</p>
      {kiyas.ort == null ? (
        <p style={{ margin: 0, ...TYPE.data, color: PAL.mut2 }}>Bu dönemde işlem yok.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, flexWrap: "wrap" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 24, lineHeight: "28px", fontWeight: 800, fontStretch: "115%", letterSpacing: "-.02em", color: PAL.ink, ...TNUM }}>
              {fmtSn(kiyas.ort)}<span style={{ ...TYPE.data, fontWeight: 500, color: PAL.mut2, marginLeft: 3 }}>sn</span>
            </span>
            <TrendRozet t={kiyas.trend} />
          </div>
          <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3, ...TNUM }}>
            {kiyas.n} işlem{kiyas.trend ? ` · önceki ${gun} güne göre` : " · kıyas için yeterli geçmiş yok"}
          </p>
        </>
      )}
    </div>
  );
}

/* Kıyaslama bloğu — başlık + iki dönem karosu. Dar kolonda (Panel kartı) karolar alt alta
   iner, geniş alanda (modal) yan yana durur; flex-basis bunu tek kuralla halleder.
   Hiç ölçüm yoksa blok HİÇ render edilmez — boş iskelet "ölü kart" okunur. */
export default function SureKiyasBloku({ history = [] }) {
  const olcum = useMemo(() => olcumler(history), [history]);
  const hafta = useMemo(() => donemKiyas(olcum, 7), [olcum]);
  const ay = useMemo(() => donemKiyas(olcum, 30), [olcum]);
  if (olcum.length === 0) return null;
  /* Tur 6: iki pencere AYNI ölçüm kümesini kapsıyorsa (ilk kurulum — tüm ölçümler son 7
     günde) iki karo aynı sayıyı ve aynı "geçmiş yok" cümlesini tekrar ediyordu. Blok tek
     satıra çöker; karolar ancak pencereler ayrıştığında basılır. */
  if (kiyasCoker(hafta, ay)) {
    return (
      <p style={{ margin: `${SP.l}px 0 0`, paddingTop: SP.s, borderTop: `1px solid ${PAL.line}`, ...TYPE.meta, color: PAL.mut2, textWrap: "pretty", ...TNUM }}>
        <span style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, marginRight: SP.s }}>KIYAS</span>
        Tüm {hafta.n} ölçüm son 7 günde — dönem kıyası için geçmiş birikiyor.
        {hafta.trend && <> <TrendRozet t={hafta.trend} /></>}
      </p>
    );
  }
  return (
    <>
      <h4 style={{ margin: `${SP.l}px 0 ${SP.s}px`, ...TYPE.ui, fontWeight: 600, color: PAL.ink }}>Kıyaslama</h4>
      <div style={{ display: "flex", gap: `${SP.m}px ${SP.l}px`, flexWrap: "wrap" }}>
        <KiyasKaro baslik="Son 7 Gün" kiyas={hafta} gun={7} />
        <KiyasKaro baslik="Son 30 Gün" kiyas={ay} gun={30} />
      </div>
    </>
  );
}
