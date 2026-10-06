/* IslenenSecim — İşlenen evrak sicilinde toplu seçim (Linear deseni: satırda kutu, "x"
   aktif kaydı seçer, Esc seçimi bırakır) + seçim çubuğu. Toplu eylem dürüst ve geri
   alınabilir olanla sınırlı: seçili kayıtların SİCİL DÖKÜMÜ (CSV — zimmet/teslim listesi).
   Karar (onay/ret) toplu VERİLMEZ: her yazı memurun tek tek okuyup onayladığı bir hükümdür.
   Risk skoru dökümde YER ALMAZ (yalnız bant kodu) — skor olasılık değildir (CLAUDE.md §7). */
import React, { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { MONO, PAL, T, TYPE, TNUM, RAD, SP, ALFA, DERIN, focusRing } from "./neonUi.jsx";
import { sicilDokumCsv } from "../lib/sicilDefter.js";

/* Yerel onay kutusu — native input (klavye + ekran okuyucu + indeterminate yerel), dokunma
   hedefi etiket kabıyla 32px (telefonda 44px, data-dokunma). */
export function SecimKutu({ secili, karisik = false, onDegis, etiket }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = karisik && !secili; }, [karisik, secili]);
  return (
    <label data-dokunma="" data-sd-secim="" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={{ display: "inline-grid", placeItems: "center", width: 32, height: 32, margin: -8, borderRadius: RAD.ctl, cursor: "pointer" }}>
      <input ref={ref} type="checkbox" checked={secili} onChange={onDegis} aria-label={etiket} {...focusRing}
        style={{ width: 16, height: 16, margin: 0, accentColor: T, cursor: "pointer" }} />
    </label>
  );
}

const indir = (metin, ad) => {
  const url = URL.createObjectURL(new Blob([metin], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: ad });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const bugunDamga = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };

/* Seçim çubuğu — defterin hemen üstünde, yalnız seçim varken. Sayı mono, eylemler fiil önce. */
export function SecimCubugu({ seciliKayitlar, sutunlar, onBirak }) {
  const [durum, setDurum] = useState("");
  const n = seciliKayitlar.length;
  useEffect(() => { setDurum(""); }, [n]);
  if (!n) return null;
  const dokum = () => {
    try {
      indir(sicilDokumCsv(seciliKayitlar, sutunlar), `islenen-sicil-${bugunDamga()}.csv`);
      setDurum(`${n} kaydın dökümü indirildi`);
    } catch (err) {
      setDurum(`Döküm oluşturulamadı: ${err?.message || "bilinmeyen hata"}`);
    }
  };
  const dugme = { cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: RAD.ctl,
    ...TYPE.data, fontWeight: 500, transition: "background .12s ease, transform .14s var(--ke-ease-out)" };
  return (
    <div role="toolbar" aria-label="Seçili kayıtlar" style={{ display: "flex", alignItems: "center", gap: SP.s, flexWrap: "wrap", marginBottom: SP.s,
      padding: `${SP.xs}px ${SP.xs}px ${SP.xs}px ${SP.m}px`, borderRadius: RAD.card, border: `1px solid color-mix(in srgb, ${T} 30%, transparent)`, background: ALFA(T),
      animation: "nu-rise .16s var(--ke-ease-out) both" }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: DERIN.T, ...TNUM }}><strong style={{ fontSize: 13 }}>{n}</strong> kayıt seçildi</span>
      <span role="status" aria-live="polite" style={{ ...TYPE.meta, color: PAL.mut2 }}>{durum}</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: SP.xs, flexWrap: "wrap" }}>
        <button type="button" onClick={dokum} {...focusRing} data-press="" data-dokunma=""
          style={{ ...dugme, border: `1px solid ${PAL.lineHi}`, background: PAL.surf, color: PAL.ink }}>
          <Download size={14} strokeWidth={1.75} aria-hidden="true" /> Sicil dökümünü indir <span style={{ fontFamily: MONO, fontSize: 11, color: PAL.mut2 }}>CSV</span>
        </button>
        <button type="button" onClick={onBirak} {...focusRing} data-press="" data-dokunma=""
          style={{ ...dugme, border: "1px solid transparent", background: "transparent", color: PAL.mut2 }}>
          Seçimi bırak <kbd style={{ fontFamily: MONO, fontSize: 10, padding: "0 4px", border: `1px solid ${PAL.lineHi}`, borderRadius: 4 }}>Esc</kbd>
        </button>
      </span>
    </div>
  );
}
