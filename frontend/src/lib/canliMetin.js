/* Okunan belge metni için saf yardımcılar (tur 9, D-canli) — bileşenlerden ayrı, node:test ile sınanır. */

/* Vurgu kelime sınırında biter ("BAKANLIĞI|NA" — ek vurgusuz kalıp satırda kırık bant oluşuyordu).
   Yalnız bitiş sağa, harf/rakam boyunca genişler; bir sonraki spana taşmaz. */
const HARF = /[\p{L}\p{N}]/u;
function kelimeSonu(metin, e, sinir) {
  let x = e;
  while (x > 0 && x < sinir && HARF.test(metin[x - 1]) && HARF.test(metin[x])) x += 1;
  return x;
}

export function buildSegments(metin, spanlar) {
  const segs = [];
  let cur = 0;
  const sirali = [...spanlar].sort((a, b) => (a.start | 0) - (b.start | 0));
  sirali.forEach((sp, i) => {
    const s = Math.max(cur, Math.min(metin.length, sp.start | 0));
    const sinir = i + 1 < sirali.length ? Math.max(s, Math.min(metin.length, sirali[i + 1].start | 0)) : metin.length;
    const e = kelimeSonu(metin, Math.max(s, Math.min(metin.length, sp.end | 0)), sinir);
    if (s > cur) segs.push({ t: metin.slice(cur, s) });
    if (e > s) segs.push({ t: metin.slice(s, e), mark: true });
    cur = Math.max(cur, e);
  });
  if (cur < metin.length) segs.push({ t: metin.slice(cur) });
  return segs;
}

/* Kaynak kesiti künyesi OLGUYU sayar — kaç alan maskeli, e-posta açık mı (genel "kısmen
   maskeli" hangi alanların açık kaldığını söylemiyordu). Maskeleme backend'indir; burada sayılır. */
export function kesitBasligi(metin) {
  const m = String(metin || "");
  const maskeli = (m.match(/\S*\*{3,}\S*/g) || []).length;
  const eposta = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.test(m);
  const ek = eposta ? " · e-posta açık" : "";
  return maskeli ? `Kaynak kesiti · ${maskeli} alan maskeli${ek}` : `Kaynak kesiti · okunan metin${ek}`;
}
