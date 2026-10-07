/* DefterAntetKunye — evrak defterlerinin (Gelen · İşlenen · Giden) antet SAĞ KÜNYE bloğu.
   Resmî yazının üst bloğundaki "Sayı / Tarih / Konu" yerleşiminin defter karşılığı: başlığın
   sağında, çift antet çizgisinin üstüne oturan 2–3 satırlık mono künye — görünümün CANLI
   özeti (veri, süs değil). Renk yok; yalnız `ton:"kirmizi"` satırı (gecikme) derin kırmızı
   ve "gecikti" sözcüğüyle (renk tek sinyal değil).

   Yalnız geniş masaüstünde (≥1200 px): telefonda/dar ekranda antet zaten başlık + alt başlık
   taşır; künye orada gizlenir (telefon düzenine dokunulmaz). Damga bütçesine girmez. */
import React from "react";
import { MONO, PAL, TNUM, DERIN } from "./neonUi.jsx";

const KUNYE_CSS = `
[data-antet-kunye]{display:none}
@media (min-width:1200px){[data-antet-kunye]{display:grid}}
`;

/** satirlar: [{ k, v, ton? }] — v boşsa satır basılmaz. */
export default function DefterAntetKunye({ satirlar, etiket }) {
  const dolu = satirlar.filter((s) => s && s.v != null && s.v !== "");
  if (!dolu.length) return null;
  return (
    <>
      <style>{KUNYE_CSS}</style>
      <dl data-antet-kunye="" aria-label={etiket}
        style={{ margin: 0, gridTemplateColumns: "auto auto", columnGap: 14, rowGap: 3, alignSelf: "flex-end", alignContent: "end",
          fontFamily: MONO, fontSize: 11, lineHeight: "15px", letterSpacing: ".08em", textTransform: "uppercase", ...TNUM,
          paddingLeft: 16, borderLeft: `1px solid ${PAL.line}` }}>
        {dolu.map((s) => (
          <React.Fragment key={s.k}>
            <dt style={{ color: PAL.mut3, fontWeight: 500, whiteSpace: "nowrap" }}>{s.k}</dt>
            <dd style={{ margin: 0, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: s.ton === "kirmizi" ? DERIN.kirmizi : PAL.ink2 }}>{s.v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </>
  );
}
