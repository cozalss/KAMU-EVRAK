/* useTypewriter — metni "daktilo" (token-token) açan hafif React hook'u.
   SIFIR ek dep (yalnız react). requestAnimationFrame ile compositor-dostu, temiz cleanup.
   "Düşünen sistem" hissi: özet/bilgilendirme/taslak SSE veya sonuç geldikten sonra akar.

   Erişilebilirlik (RED-LINE): prefers-reduced-motion açıkken efekt KAPANIR — tam metin
   anında basılır (anlamlı statik durum). Ekran okuyucuya zaten tam metin verilir
   (çağıran kapsayıcıda aria-live yok → kısmi metin duyurulmaz; tam metin son durumdur).

   Kullanım:
     const shown = useTypewriter(text, { cps: 420, enabled: true });
     <p>{shown}<Caret /></p>  // caret çağırana ait (isteğe bağlı). */
import { useEffect, useRef, useState } from "react";

// Saniyede karakter (chars-per-second). Resmî metinde hızlı ama okunur akış.
const DEFAULT_CPS = 460;

// Kullanıcının hareket-azalt tercihini (canlı) izle — değişirse re-render.
export function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const get = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches;

  const [reduced, setReduced] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = (e) => setReduced(e.matches);
    // Safari<14 addListener fallback (addEventListener yoksa).
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return reduced;
}

/* Metni daktilo efektiyle açar; tamamlanınca tam metni döndürür.
   - text değişince baştan başlar.
   - enabled=false VEYA reduced-motion → anında tam metin (animasyonsuz).
   - rAF tabanlı: sekme arka plandayken duraklar, dönünce kaldığı yerden sürer. */
export function useTypewriter(text, { cps = DEFAULT_CPS, enabled = true } = {}) {
  const full = typeof text === "string" ? text : "";
  const reduced = usePrefersReducedMotion();
  const animate = enabled && !reduced && full.length > 0;

  const [count, setCount] = useState(() => (animate ? 0 : full.length));
  const rafRef = useRef(0);

  useEffect(() => {
    if (!animate) {
      setCount(full.length);
      return undefined;
    }
    setCount(0);
    let start = 0;
    const total = full.length;
    const step = (ts) => {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000; // s
      const next = Math.min(total, Math.floor(elapsed * cps));
      setCount(next);
      if (next < total) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [full, cps, animate]);

  const shown = full.slice(0, count);
  const done = count >= full.length;
  return { shown, done, animating: animate && !done };
}
