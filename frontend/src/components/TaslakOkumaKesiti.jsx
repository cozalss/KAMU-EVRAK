/* TaslakOkumaKesiti — Taslaklar masasında kâğıdın "okuma kesiti".

   Sorun (jüri tur 6): kâğıt sütunu yükseklikten A4 oranıyla türer; 1440x900'de sayfa 454px'e
   ölçekleniyor ve 11 punto gövde ~8px'e düşüyordu. Ekranın alt başlığı "belgeyi okuyun"
   derken belge okunamıyor, memur her taslak için modal açıyordu.

   Çözüm: AYNI kâğıt, AYNI dizgi kuralları (A4Belge'nin ROL_STIL'i: ortalı antet, Sayı
   hizasında sağda tarih, ortalı muhatap, 1,25 cm paragraf girintisi, sağ yarıda imza) —
   yalnız sütun genişliğine YENİDEN AKITILIR ve gerçek okuma puntosunda (15px) dizilir.
   Sayfa sınırı yoktur; sütun içinde dikey kayar. "Sayfa" kipi (tam A4 önizleme) bir dokunuş
   uzakta ve memurun seçimi tarayıcıda hatırlanır.

   Bu bir ÖNİZLEMEDİR: biçimin bağlayıcı hâli A4 sayfasıdır (BelgeModal / DOCX). */
import { useEffect, useState } from "react";
import { BELGE_FONT, BELGE_MURAKKEP, ROL_STIL, yerTutuculu } from "./A4Belge.jsx";
import { antetSiniflandir } from "../lib/a4Antet.js";
import { kagitStilYukle } from "./kagitDoku.js";
import { PAL, ALFA, T, DERIN, TYPE, RAD, SH, SP, EASE, focusRing } from "./neonUi.jsx";

const OKUMA_PX = 15;
const OKUMA_SATIR = 1.55;
/* Bu genişliğin altında varsayılan kip "okuma". 720 ≈ 0,91 × 793 px (11 pt × 1,333 × 0,91 ≈
   13,3 px). Tur 6 doğrulaması: eski 571 eşiği (0,72 → ~10,6 px) 1920'de A4 kipini varsayılan
   bırakıyor ve gövde ~11 px'te okunuyordu. Memurun açık seçimi her zaman önce gelir. */
export const OKUMA_ESIGI_PX = 720;
const DEPO = "ke-taslak-gorunum";

/** Memurun açık seçimi (yoksa null) — tarayıcı deposu yoksa/engelliyse sessizce null. */
function seciliGorunum() {
  try { const v = window.localStorage.getItem(DEPO); return v === "sayfa" || v === "okuma" ? v : null; } catch { return null; }
}

/** Görünüm kipi: memurun açık seçimi, yoksa sütun genişliğinden okunabilirlik kararı. */
export function useKagitGorunumu(kagitGen) {
  const [secim, setSecim] = useState(() => (typeof window === "undefined" ? null : seciliGorunum()));
  const otomatik = Number.isFinite(kagitGen) && kagitGen > 0 && kagitGen < OKUMA_ESIGI_PX ? "okuma" : "sayfa";
  const sec = (v) => {
    setSecim(v);
    try { window.localStorage.setItem(DEPO, v); } catch { /* depo yok: yalnız bu oturum */ }
  };
  return [secim || otomatik, sec];
}

/* İki kipli anahtar — antet dilinde küçük segment (mono, büyük harf). */
export function GorunumAnahtari({ deger, onDegis }) {
  const secenek = [["okuma", "Okuma"], ["sayfa", "Sayfa · A4"]];
  return (
    <div role="radiogroup" aria-label="Kâğıt görünümü" style={{ display: "inline-flex", padding: 2, gap: 2, borderRadius: RAD.ctl, background: PAL.surf, border: `1px solid ${PAL.line}` }}>
      {secenek.map(([v, etiket]) => {
        const on = deger === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={(e) => { e.stopPropagation(); onDegis(v); }} {...focusRing} data-press="" data-dokunma=""
            style={{ cursor: "pointer", height: 24, padding: "0 9px", border: "none", borderRadius: RAD.chip, ...TYPE.antet, fontSize: 10, textTransform: "uppercase",
              background: on ? ALFA(T) : "transparent", color: on ? DERIN.T : PAL.mut2, fontWeight: on ? 600 : 500,
              transition: `background .14s ease-out, color .14s ease-out, transform .14s ${EASE.out}` }}>
            {etiket}
          </button>
        );
      })}
    </div>
  );
}

export default function TaslakOkumaKesiti({ metin = "" }) {
  useEffect(() => { kagitStilYukle(); }, []);
  const satirlar = String(metin).split("\n");
  const roller = antetSiniflandir(satirlar);
  const temel = { margin: 0, fontFamily: BELGE_FONT, fontSize: OKUMA_PX, lineHeight: OKUMA_SATIR, color: BELGE_MURAKKEP,
    whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: OKUMA_PX * OKUMA_SATIR };
  return (
    <article aria-label="Taslağın okuma kesiti" style={{ boxSizing: "border-box", minHeight: "100%", padding: "28px clamp(18px, 7%, 40px) 40px",
      backgroundColor: "var(--kd-kagit)", backgroundImage: "var(--kd-doku)", border: `1px solid ${PAL.line}`, boxShadow: SH.kagit,
      animation: "nu-rise .24s var(--ke-ease-out) both" }}>
      {satirlar.map((s, i) => {
        const rol = roller[i] || { tip: "duz", metin: s };
        const ic = rol.tip === "sayi"
          ? (<><span>{yerTutuculu(rol.metin)}</span><span style={{ flexShrink: 0 }}>{rol.sag}</span></>)
          : (rol.tip === "duz" ? (s === "" ? " " : s) : rol.metin);
        return <div key={i} style={{ ...temel, ...ROL_STIL[rol.tip], ...(rol.tip === "imza" ? { marginLeft: "45%" } : null) }}>{ic}</div>;
      })}
      {/* KESİTİN SONU (jüri tur 8: kâğıdın dibi işaretsiz bitiyordu) — hairline + künye: yazı
          burada biter; bağlayıcı biçim A4 sayfasındadır. Kâğıt mürekkebinin soluk tonu. */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: SP.xl, ...TYPE.antet, fontSize: 10, textTransform: "uppercase",
        color: `color-mix(in srgb, ${BELGE_MURAKKEP} 45%, transparent)` }}>
        <span style={{ flex: 1, height: 1, background: `color-mix(in srgb, ${BELGE_MURAKKEP} 16%, transparent)` }} />
        Yazının sonu · biçim A4 sayfasında
        <span style={{ flex: 1, height: 1, background: `color-mix(in srgb, ${BELGE_MURAKKEP} 16%, transparent)` }} />
      </div>
    </article>
  );
}
