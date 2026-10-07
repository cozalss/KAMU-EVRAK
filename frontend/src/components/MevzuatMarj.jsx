/* MevzuatMarj — okuma salonunun SAĞ MARJ NOTU (yalnız ≥1600 px; MevzuatOkuma'dan ayrı).
   Tur 8 jüri: 1920'de modal 960 px'te kalıyor, iki yanda ~480 px karartılmış ölü alan vardı.
   Geniş ekranda okunan maddenin marjına bir "atıf fişi" iliştirilir:
   · okunan madde (scroll-spy'dan) + kopyalanabilir atıf biçimi — memur dayanağı yazıya böyle geçirir;
   · madde metninde GERÇEKTEN geçen iç atıflar (tıklanınca o maddeye gider; uydurma bağ yok);
   · okuma konumu (n / toplam madde).
   Dil asistandaki dipnotlarla aynı: mono künye, mürekkep moru numara. */
import { useEffect, useRef, useState } from "react";
import { MONO, DISPLAY, PAL, DERIN, TYPE, TNUM, RAD, SP, Icon, focusRing } from "./neonUi.jsx";
import { atifMetni, metinIciAtiflar } from "../lib/mevzuatAtif.js";

const KOPYA_SURE = 1600;
const turOnek = (tur) => (tur === "ek" ? "Ek madde" : tur === "gecici" ? "Geçici madde" : "Madde");

function AtifKopyala({ metin }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  const zaman = useRef(0);
  useEffect(() => () => clearTimeout(zaman.current), []);
  const kopyala = async () => {
    try {
      await navigator.clipboard?.writeText(metin);
      setKopyalandi(true);
      clearTimeout(zaman.current);
      zaman.current = setTimeout(() => setKopyalandi(false), KOPYA_SURE);
    } catch {
      setKopyalandi(false);   // pano izni yoksa sessiz kalır; metin seçilebilir durumda
    }
  };
  return (
    <button type="button" onClick={kopyala} {...focusRing} data-press=""
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: SP.xs, minHeight: 32, padding: `0 ${SP.m}px`, borderRadius: RAD.ctl, border: `1px solid ${PAL.inputLine}`, background: PAL.surf, color: kopyalandi ? DERIN.yesil : PAL.ink2, ...TYPE.meta, fontWeight: 600 }}>
      {kopyalandi ? <><Icon.check width={13} height={13} /> Kopyalandı</> : "Atfı kopyala"}
      <span role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{kopyalandi ? "Atıf panoya kopyalandı" : ""}</span>
    </button>
  );
}

export default function MevzuatMarj({ icerik, blok, sira, toplam, mevcut, onGit }) {
  if (!blok) return <aside className="mo-marj" aria-hidden="true" />;
  const atif = atifMetni({ no: icerik.no, baslik: icerik.baslik, tur: blok.tur, maddeNo: blok.no });
  const ic = metinIciAtiflar(blok.govde, blok.no).filter((n) => mevcut.has(`madde-${n}`));
  return (
    <aside className="mo-marj" aria-label="Marj notu: okunan madde">
      <div style={{ ...TYPE.antet, color: PAL.mut3, textTransform: "uppercase", paddingBottom: SP.s, borderBottom: `1px solid ${PAL.ink}` }}>Marj notu · okunan madde</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: SP.s, marginTop: SP.m }}>
        <span style={{ ...TYPE.antet, fontSize: 10, color: DERIN.V, textTransform: "uppercase" }}>{turOnek(blok.tur)}</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: "30px", fontStretch: "112%", letterSpacing: "-.03em", color: DERIN.V, ...TNUM }}>{blok.no}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: PAL.mut3, ...TNUM }}>{sira} / {toplam}</span>
      </div>
      <div style={{ marginTop: SP.l, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase" }}>Atıf biçimi</div>
      <p style={{ margin: `${SP.xs}px 0 ${SP.s}px`, fontFamily: MONO, fontSize: 12, lineHeight: "18px", color: PAL.ink2, overflowWrap: "anywhere", userSelect: "all" }}>{atif}</p>
      <AtifKopyala metin={atif} />
      <div style={{ marginTop: SP.xl, ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase" }}>Metin içi atıflar</div>
      {ic.length ? (
        <ol style={{ listStyle: "none", margin: `${SP.xs}px 0 0`, padding: 0, display: "grid", gap: 2 }}>
          {ic.map((n) => (
            <li key={n}>
              <button type="button" onClick={() => onGit(`madde-${n}`)} {...focusRing} className="mo-dizin-oge"
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: SP.s, width: "100%", minHeight: 30, padding: "4px 6px", border: "none", borderRadius: RAD.chip, background: "transparent", color: PAL.ink2, textAlign: "left", ...TYPE.meta }}>
                <span style={{ fontFamily: MONO, color: DERIN.V, fontWeight: 600, ...TNUM }}>m.{n}</span>
                <span style={{ flex: 1 }}>maddeye git</span>
                <Icon.arrow width={12} height={12} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: `${SP.xs}px 0 0`, ...TYPE.meta, color: PAL.mut3 }}>Bu madde metninde başka bir maddeye atıf geçmiyor.</p>
      )}
    </aside>
  );
}
