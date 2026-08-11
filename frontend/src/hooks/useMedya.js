/* Medya sorgusu hook'u — tek yerden. Depoda üç ayrı kopyası vardı (TaslaklarView 1100px,
   PanelView 1024px, NeonSidebar 720px); yeni iş buradan kurulur.

   SSR/eski tarayıcı güvenli: `window` ya da `matchMedia` yoksa `false` döner ve dinleyici
   kurmaz — bileşen yine de render eder (geniş düzen yerine dar düzene düşer, tersi değil:
   dar düzen her ekranda ÇALIŞIR, geniş düzen dar ekranda taşar). */
import { useEffect, useState } from "react";

const esles = (sorgu) => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !!window.matchMedia(sorgu).matches;
};

/**
 * Bir CSS medya sorgusunu canlı izler.
 * @param {string} sorgu ör. "(min-width: 640px)"
 * @returns {boolean} sorgu şu an eşleşiyor mu
 */
export function useMedyaSorgusu(sorgu) {
  const [eslesti, setEslesti] = useState(() => esles(sorgu));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(sorgu);
    const degisti = () => setEslesti(mq.matches);
    degisti();                       // sorgu değişirse ilk değeri tazele
    mq.addEventListener("change", degisti);
    return () => mq.removeEventListener("change", degisti);
  }, [sorgu]);
  return eslesti;
}

/* Telefon eşiği — altında çok sütunlu satır düzenleri tek sütuna/sarmaya iner.
   640px: 390px telefon ve 600px küçük tablet altta kalır, 768px tablet üstte. */
export const DAR_ESIK = "(max-width: 640px)";

/** Telefon genişliği mi? (bkz. DAR_ESIK) */
export function useDarEkran() {
  return useMedyaSorgusu(DAR_ESIK);
}
