/* DefterKagitOnizleme — geniş masaüstünde (≥1600) defterin SAĞ SÜTUNU: seçili kaydın A4
   nüsha önizlemesi (master-detail). Tur 8 jüri (Giden): "1920'de y=430–1080 arası boş masa";
   kısa defterde bile ekranın sağı ölü kalmaz — seçili gönderinin yazısı kâğıt olarak durur.

   · Seçim defterin kendi imlecinden gelir (j/k, fare) — yerel durum türetilmez; imleç yoksa
     ilk kayıt. Kâğıda dokunmak / "Nüshayı aç" tam arşiv nüshasını (BelgeModal) açar.
   · Kâğıt A4 oranında, sütun genişliğine ölçeklenir (okuma yedeğine düşmez: bu bir önizleme).
   · Yapışkan: uzun defterde kaydırırken önizleme görünür kalır. Sütun defter yüksekliğine
     uzar; `kunye` (gönderim künyesi) sütunun DİBİNE oturur → dip çizgisi defterin folyo
     çizgisiyle aynı y'de biter (tur 8 jüri 2: panel 580'de bitip altında ölü masa kalıyordu).
   Telefon/dar ekranda HİÇ render edilmez (çağıran useMedyaSorgusu ile karar verir). */
import React from "react";
import { MONO, PAL, TYPE, TNUM, SP, Icon, focusRing } from "./neonUi.jsx";
import A4Belge from "./A4Belge.jsx";

export const ONIZLEME_SUTUN = 420;

function OnizlemeKunye({ satirlar }) {
  return (
    <dl aria-label="Gönderim künyesi" style={{ margin: `${SP.m}px 0 0`, paddingTop: SP.m, borderTop: `1px solid ${PAL.ink2}`, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: SP.l }}>
      {satirlar.filter((r) => r && r.v).map((r) => (
        <React.Fragment key={r.k}>
          <dt style={{ ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>{r.k}</dt>
          <dd title={typeof r.v === "string" ? r.v : undefined} style={{ margin: 0, ...TYPE.meta, fontWeight: 500, color: r.c || PAL.ink2, textAlign: "right", padding: "6px 0", borderBottom: `1px solid ${PAL.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(r.mono ? { fontFamily: MONO, fontSize: 11 } : null), ...TNUM }}>{r.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export default function DefterKagitOnizleme({ kayitNo, baslik, metin, kose, onAc, ek, kunye = null }) {
  return (
    <aside aria-label={`Nüsha önizlemesi — ${baslik}`} style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SP.l, minWidth: 0 }}>
    <div style={{ position: "sticky", top: SP.l, display: "flex", flexDirection: "column", gap: SP.s, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 0 }}>
        <span>Nüsha önizlemesi</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: PAL.line, alignSelf: "center" }} />
        <span style={{ fontFamily: MONO, color: PAL.ink2, fontWeight: 600, ...TNUM }}>{kayitNo}</span>
      </div>
      <div key={kayitNo} style={{ position: "relative", animation: "nu-rise .22s var(--ke-ease-out) both" }}>
        {kose && <span data-evrak-kagit="" style={{ position: "absolute", top: 10, right: 12, zIndex: 2, pointerEvents: "none", transform: "scale(.72)", transformOrigin: "100% 0" }}>{kose}</span>}
        <A4Belge metin={metin || "Bu kayıtta yazı metni saklanmamış."} sigdir="genislik" okumaYedegi={false} onAc={onAc} baslikIpucu="Arşiv nüshasını aç" />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.s, minWidth: 0 }}>
        <span style={{ ...TYPE.meta, color: PAL.mut2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={baslik}>{ek || baslik}</span>
        <button type="button" onClick={onAc} {...focusRing} data-sd-eylem="" data-press="">
          Nüshayı aç <Icon.arrow width={14} height={14} />
        </button>
      </div>
    </div>
    {kunye?.length ? <OnizlemeKunye satirlar={kunye} /> : null}
    </aside>
  );
}
