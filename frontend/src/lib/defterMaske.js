/* Önizleme maskesi — Gelen defterinin salt-okunur önizlemesinde kaynak metindeki kişisel veri
   (TCKN · telefon · IBAN · e-posta) MÜREKKEP KARARTMA bandıyla örtülür (KVKK; CLAUDE.md "Her zaman
   yap" §5). Yalnız GÖSTERİM içindir: kaynak veri, işleme ve backend maskesi değişmez.
   Uzunluk korunur (karakter başına bant) → A4 dizgisi ve satır kırılımı kaymaz.
   Kısa rakamlar (tarih, sayı, tutar, kayıt no) eşleşmez: TCKN tam 11 hane; telefon 0/+90 ile
   başlayan 10 haneli GSM/sabit hat kalıbı. */

export const MASKE_BANT = "█";

const KALIPLAR = [
  ["TCKN", /(?<![\d])[1-9]\d{10}(?![\d])/gu],
  ["telefon", /(?<![\d+])(?:\+90[\s-]?|0)\(?[2-5]\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?![\d])/gu],
  ["IBAN", /(?<![\p{L}\d])TR\d{2}(?:\s?\d{4}){5}\s?\d{2}(?!\d)/gu],
  ["e-posta", /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu],
];

const karart = (s) => s.replace(/\S/gu, MASKE_BANT);

/** @param {string} metin @returns {{metin: string, alanlar: string[]}} */
export function onizlemeMaskele(metin) {
  let m = String(metin ?? "");
  const alanlar = [];
  for (const [ad, re] of KALIPLAR) {
    const yeni = m.replace(re, karart);
    if (yeni !== m) alanlar.push(ad);
    m = yeni;
  }
  return { metin: m, alanlar };
}
