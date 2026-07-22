/**
 * Sohbet balonu markdown — satır tipi sınıflandırıcı (saf, node --test ile doğrulanır).
 *
 * Widget'ın hafif Md bileşeni bu sınıflandırmayı kullanır: yatay ayraç ('---', revize
 * önizleme metnin/taslak sınırı), madde ('• ') veya düz metin. Kütüphanesiz.
 */

/**
 * @param {string} satir
 * @returns {"hr" | "madde" | "metin"}
 */
export function mdSatirTipi(satir) {
  const s = (satir || "").trim();
  if (s === "---" || s === "———") return "hr";
  if ((satir || "").startsWith("• ")) return "madde";
  return "metin";
}
