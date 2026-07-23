/**
 * Sıvı orb kenarı — spline+noise blob geometrisi (saf, test edilebilir; kütüphanesiz).
 * SesliGorusme orb'unun kenarını CSS clip-path ile bu blob'a bağlar: mükemmel daire yerine
 * organik, sese-göre dalgalanan sıvı hat ("cam bilye → canlı enerji" — araştırma §3.B).
 */

/**
 * Bir açıdaki organik yarıçap sapması (-1..1). Deterministik "noise" — farklı frekanslı
 * birkaç harmonik toplamı; t (zaman) ile akar. Simplex kütüphanesine gerek yok.
 * @param {number} aci  radyan
 * @param {number} t    zaman parametresi
 * @returns {number} -1..1
 */
export function kenarSapma(aci, t) {
  return (
    Math.sin(aci * 3 + t) * 0.5 +
    Math.sin(aci * 2 - t * 0.7) * 0.3 +
    Math.sin(aci * 5 + t * 1.3) * 0.2
  );
}

/**
 * Blob'un n kontrol noktası — daire etrafında, her açıda yarıçap = r + sapma*amp.
 * amp=0 → kusursuz daire (reduced-motion / sessizlik).
 * @param {number} cx merkez x
 * @param {number} cy merkez y
 * @param {number} r  taban yarıçap
 * @param {number} n  nokta sayısı (6-10 önerilir)
 * @param {number} t  zaman
 * @param {number} amp yarıçap sapma genliği (px)
 * @returns {Array<[number, number]>}
 */
export function blobNoktalari(cx, cy, r, n, t, amp) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + kenarSapma(a, t) * amp;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

/**
 * Kapalı yumuşak eğri → SVG path dizesi (orta-nokta + quadratic tekniği; kontrol noktaları
 * arasında düzgün geçiş). CSS `clip-path: path('...')` için kullanılır.
 * @param {Array<[number, number]>} pts
 * @returns {string} "M..Q..Z" ya da nokta<3 ise ""
 */
export function blobYolu(pts) {
  const n = pts.length;
  if (n < 3) return "";
  const orta = (i) => [
    (pts[i][0] + pts[(i + 1) % n][0]) / 2,
    (pts[i][1] + pts[(i + 1) % n][1]) / 2,
  ];
  const [sx, sy] = orta(n - 1);
  let d = `M${sx.toFixed(2)},${sy.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [cx, cy] = pts[i];
    const [ex, ey] = orta(i);
    d += `Q${cx.toFixed(2)},${cy.toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }
  return d + "Z";
}
