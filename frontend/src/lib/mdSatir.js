/**
 * Sohbet balonu markdown — satır sınıflandırıcı (saf, node --test ile doğrulanır).
 *
 * Widget'ın hafif Md bileşeni bu sınıflandırmayı kullanır: yatay ayraç ('---', revize
 * önizleme metnin/taslak sınırı), madde ('• ', '- ', '* '), numaralı madde ('1. ', '2) '),
 * boş satır (paragraf arası) veya düz metin. Kütüphanesiz.
 */

const MADDE = /^\s*(?:[•*]|-(?!--))\s+(.*)$/;
const NUMARA = /^\s*(\d{1,3})[.)]\s+(.*)$/;

/**
 * @param {string} satir
 * @returns {"hr" | "madde" | "numara" | "bos" | "metin"}
 */
export function mdSatirTipi(satir) {
  const s = (satir || "").trim();
  if (s === "---" || s === "———") return "hr";
  if (s === "") return "bos";
  if (MADDE.test(satir || "")) return "madde";
  if (NUMARA.test(satir || "")) return "numara";
  return "metin";
}

/**
 * Satırı tipiyle birlikte ayrıştırır: madde/numara için işaretten arındırılmış gövde,
 * numaralı maddede rakam ("3").
 * @param {string} satir
 * @returns {{ tip: string, govde: string, no?: string }}
 */
export function mdSatirAyristir(satir) {
  const tip = mdSatirTipi(satir);
  if (tip === "madde") return { tip, govde: (satir.match(MADDE) || [])[1] || "" };
  if (tip === "numara") {
    const m = satir.match(NUMARA) || [];
    return { tip, no: m[1], govde: m[2] || "" };
  }
  return { tip, govde: satir || "" };
}
