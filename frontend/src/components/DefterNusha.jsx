/* DefterNusha — Giden ve İşlenen kayıt detayının "ARŞİV NÜSHASI" parçaları (BelgeModal'ın
   ek yuvalarına takılır). Üç defter artık TEK modal ailesi konuşur (Radix odak tuzağı +
   kaydırma kilidi + nu-kagit hareketi + A4 nüsha): Gelen'de dilekçe, Giden'de gönderilmiş
   resmî yazı, İşlenen'de üretilen taslak — hepsi kâğıtta (jüri tur 6: giden yazı gri bir
   <pre> kutusundaydı, ürünün en "evrak" nesnesi textarea'ya benziyordu).

   · KunyeFisi  — kâğıdın üstünde künye kartı: iki sütunlu anahtar/değer ızgarası + ek içerik.
   · KimlikDeger — uzun kimlik ortadan kısalır ("c8968145…ae2f"), tam değer title'da ve
                   kopyala düğmesinde (kesik değer kopyalanınca yanlış kimlik veriyordu).
   · AltKunye   — kâğıdın dibinde mono künye satırı (denetim hash'i, işlem kimliği). */
import React, { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { MONO, PAL, TYPE, TNUM, RAD, SP, SH, DERIN, focusRing } from "./neonUi.jsx";
import { ortaElips } from "../lib/defterSozluk.js";
import { KAGIT_YUZEY } from "./kagitDoku.js";

const kunyeEtiket = { ...TYPE.antet, fontSize: 10, color: PAL.mut3, textTransform: "uppercase", whiteSpace: "nowrap" };

/** satirlar: [{ k, v, c?, mono? }] — v boşsa satır basılmaz (yokluk "—" ile yazılır). */
export function KunyeFisi({ baslik, satirlar, children }) {
  return (
    <section aria-label={baslik} data-kunye-fis="" data-evrak-kagit="" style={{ ...KAGIT_YUZEY, border: `1px solid ${PAL.lineHi}`, borderRadius: 2, boxShadow: SH.modal, padding: `${SP.l}px ${SP.xl}px ${SP.l}px`, animation: "nu-kagit .22s var(--ke-ease-out) both" }}>
      <div style={{ ...kunyeEtiket, marginBottom: SP.s }}>{baslik}</div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", columnGap: SP.xl }}>
        {satirlar.filter((r) => r && r.v != null && r.v !== "").map((r) => (
          <div key={r.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SP.m, padding: "7px 0", borderBottom: `1px solid ${PAL.line}`, minWidth: 0 }}>
            <dt style={{ ...TYPE.meta, color: PAL.mut3, flexShrink: 0 }}>{r.k}</dt>
            <dd style={{ margin: 0, ...TYPE.data, fontWeight: 500, color: r.c || PAL.ink2, textAlign: "right", minWidth: 0, ...(r.mono ? { fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : null), ...TNUM }}>{r.v}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

export function KimlikDeger({ deger, etiket = "kimliği" }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  useEffect(() => {
    if (!kopyalandi) return undefined;
    const t = setTimeout(() => setKopyalandi(false), 1600);
    return () => clearTimeout(t);
  }, [kopyalandi]);
  const kopyala = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(String(deger)); setKopyalandi(true); } catch { setKopyalandi(false); }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <span title={String(deger)} style={{ fontFamily: MONO, fontSize: 12, ...TNUM }}>{ortaElips(deger)}</span>
      <button type="button" onClick={kopyala} aria-label={kopyalandi ? `${etiket} kopyalandı` : `Tam ${etiket} kopyala`} title={kopyalandi ? "Kopyalandı" : "Tam değeri kopyala"} {...focusRing} data-press="" data-dokunma=""
        style={{ cursor: "pointer", display: "inline-grid", placeItems: "center", width: 28, height: 28, padding: 0, border: "none", borderRadius: RAD.chip, background: "transparent", color: kopyalandi ? DERIN.yesil : PAL.mut2 }}>
        {kopyalandi ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : <Copy size={13} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{kopyalandi ? "Kopyalandı" : ""}</span>
    </span>
  );
}

/** parcalar: [{ k, v }] — kâğıdın dibinde, perde üstünde mono künye (onInk2). */
export function AltKunye({ parcalar }) {
  const dolu = parcalar.filter((p) => p && p.v);
  if (!dolu.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `${SP.xs}px ${SP.l}px`, fontFamily: MONO, fontSize: 11, lineHeight: "16px", letterSpacing: ".06em", color: PAL.onInk2, textTransform: "uppercase", ...TNUM }}>
      {dolu.map((p) => <span key={p.k} title={p.tam || p.v}>{p.k} · <span style={{ textTransform: "none" }}>{p.v}</span></span>)}
    </div>
  );
}
