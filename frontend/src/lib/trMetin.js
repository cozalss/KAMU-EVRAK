/* trMetin — Türkçe'ye özgü metin biçimlendirme. Ayrı modül olmasının nedeni tek bir tuzak:
   JS'in varsayılan büyütme/küçültme kuralları Türkçe için YANLIŞ sonuç verir. */

/* Ad-soyadı başlık biçimine çevirir: "gizem fatma kılıç" → "Gizem Fatma Kılıç".
   toLocaleUpperCase("tr") / toLocaleLowerCase("tr") ZORUNLU:
   · "ibrahim".toUpperCase()[0] → "I" (noktasız) — Türkçe'de yanlış harf, doğrusu "İ"
   · "IŞIL".toLowerCase()      → "ışıl" değil "isil" benzeri kırılmalar
   DB'den her türlü kasada gelebilir (kayıt formu serbest metin), o yüzden ilk harf
   büyütülür VE kalanı küçültülür — "MEHMET ALİ" → "Mehmet Ali". */
export function adBuyut(ad) {
  return String(ad ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => k[0].toLocaleUpperCase("tr") + k.slice(1).toLocaleLowerCase("tr"))
    .join(" ");
}
