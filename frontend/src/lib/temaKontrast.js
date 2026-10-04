/* temaKontrast — THEME_CSS metninden token kümelerini çıkarır ve WCAG kontrast oranını
   hesaplar (saf; node --test). Amaç: "AA kontrast iki temada" sözleşmesi bir tarayıcı
   taramasına (axe) bağlı kalmasın — token değiştiren herkes birim testte yakalanır.

   Kapsamlar katmanlıdır: açık (:root) → koyu (:root[data-theme=dark]) → ray ([data-ray]) →
   koyu ray → koyu kâğıt ([data-evrak-kagit]). Alt kapsam üst kapsamın üstüne yazılır. */

/** Bir seçicinin { ... } bloğundaki --ke-* tanımları. Aynı seçici birden çok kez geçerse birleşir. */
export function tokenBlogu(css, secici) {
  const sonuc = {};
  let i = 0;
  const anahtar = `${secici}{`;
  for (;;) {
    const bas = css.indexOf(anahtar, i);
    if (bas === -1) break;
    const son = css.indexOf("}", bas);
    const govde = css.slice(bas + anahtar.length, son);
    for (const m of govde.matchAll(/--ke-([\w-]+):\s*([^;]+);/g)) sonuc[m[1]] = m[2].trim();
    i = son;
  }
  return sonuc;
}

/** Kapsam haritası: açık · koyu · ray-açık · ray-koyu · kagit-koyu. var(--ke-x) bir düzey çözülür. */
export function kapsamlar(css) {
  const acik = tokenBlogu(css, ":root");
  const koyu = { ...acik, ...tokenBlogu(css, ':root[data-theme="dark"]') };
  const rayAcik = { ...acik, ...tokenBlogu(css, "[data-ray]") };
  const rayKoyu = { ...koyu, ...tokenBlogu(css, "[data-ray]"), ...tokenBlogu(css, ':root[data-theme="dark"] [data-ray]') };
  const kagitKoyu = { ...koyu, ...tokenBlogu(css, ':root[data-theme="dark"] [data-evrak-kagit]') };
  const coz = (k) => Object.fromEntries(Object.entries(k).map(([ad, v]) => {
    const m = /^var\(--ke-([\w-]+)\)$/.exec(v);
    return [ad, m && k[m[1]] ? k[m[1]] : v];
  }));
  return { acik: coz(acik), koyu: coz(koyu), rayAcik: coz(rayAcik), rayKoyu: coz(rayKoyu), kagitKoyu: coz(kagitKoyu) };
}

const hex = (h) => {
  let s = h.replace("#", "");
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  return [0, 2, 4].map((n) => parseInt(s.slice(n, n + 2), 16));
};

/** "#rrggbb" ya da "rgba(r,g,b,a)" → zemin üstünde kompozit RGB. Çözülemezse null. */
export function rgb(deger, zemin = [255, 255, 255]) {
  if (!deger) return null;
  if (deger.startsWith("#")) return hex(deger);
  const m = /rgba?\(([^)]+)\)/.exec(deger);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(",").map(Number);
  return [r, g, b].map((c, n) => c * a + zemin[n] * (1 - a));
}

const parlaklik = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = c.map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.x kontrast oranı (1–21). */
export function kontrastOrani(a, b) {
  const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Bir kapsamda metin token'ı × yüzey token'ı oranı (yarı saydam yüzey kapsamın bg'sine kompozit). */
export function tokenOrani(kapsam, metin, yuzey) {
  const bg = rgb(kapsam.bg);
  const y = rgb(kapsam[yuzey], bg);
  const m = rgb(kapsam[metin], y);
  if (!y || !m) return null;
  return kontrastOrani(m, y);
}
