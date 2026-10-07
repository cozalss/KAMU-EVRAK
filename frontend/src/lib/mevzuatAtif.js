/**
 * Okuma salonunun marj notu için saf yardımcılar (node --test ile doğrulanır).
 * · atifMetni: okunan maddenin kopyalanabilir atıf biçimi ("4982 sayılı … Kanunu m.11").
 * · metinIciAtiflar: madde gövdesinde AYNI metnin başka maddelerine yapılan atıflar —
 *   yalnız metinde gerçekten geçen numaralar (uydurma bağlantı yok), kendisi hariç, sıralı.
 */

const TUR_ONEK = { ek: "ek m.", gecici: "geçici m.", madde: "m." };

/**
 * @param {{ no?: string, baslik?: string, tur?: string, maddeNo?: number|string }} p
 * @returns {string}
 */
export function atifMetni({ no, baslik, tur = "madde", maddeNo }) {
  const ad = String(baslik || "").trim();
  const kaynak = no ? `${no} sayılı ${ad}`.trim() : ad;
  if (maddeNo == null || maddeNo === "") return kaynak;
  return `${kaynak} ${TUR_ONEK[tur] || TUR_ONEK.madde}${maddeNo}`;
}

const DESENLER = [
  /\b(?:m\.|[Mm]adde)\s*(\d{1,3})\b/g,
  /\b(\d{1,3})\s*['’]?\s*(?:nci|ncı|ncü|ncu|inci|ıncı|üncü|uncu)\s+madde/gi,
];

/**
 * @param {string} govde
 * @param {number|string|null} kendiNo
 * @returns {number[]}
 */
export function metinIciAtiflar(govde, kendiNo = null) {
  const s = String(govde || "");
  const bulunan = new Set();
  for (const re of DESENLER) {
    for (const m of s.matchAll(re)) bulunan.add(Number(m[1]));
  }
  if (kendiNo != null) bulunan.delete(Number(kendiNo));
  return [...bulunan].filter((n) => n > 0).sort((a, b) => a - b);
}
