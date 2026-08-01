/* A4 sayfa ölçüleri ve satır→sayfa bölme mantığı (saf; DOM'a bağlı değil, test edilebilir).

   Ölçüler Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik'ten alınmıştır
   (korpus: data/mevzuat/2646_resmi_yazisma_yonetmeligi.txt):
     · m.6/1 — belgeler A4 (210x297 mm) boyutu dikkate alınarak hazırlanır
     · m.8/1 — yazı alanı sayfanın ÜST, SOL ve SAĞ kenarından 1,5 cm boşluk bırakılarak düzenlenir
   Yönetmelik ALT boşluğu belirlemez; simetri için üstle aynı alınmıştır — kaynağa dayanmayan
   tek ölçü budur. */

// CSS referans pikseli: 1mm = 96/25.4 px.
export const MM = 96 / 25.4;
export const A4_GEN_MM = 210;
export const A4_YUK_MM = 297;
export const KENAR_MM = 15;

export const A4_GEN_PX = A4_GEN_MM * MM;
export const A4_YUK_PX = A4_YUK_MM * MM;
export const YAZI_ALANI_GEN_PX = (A4_GEN_MM - 2 * KENAR_MM) * MM;
export const YAZI_ALANI_YUK_PX = (A4_YUK_MM - 2 * KENAR_MM) * MM;

/**
 * Ölçülmüş satırları sayfalara böler.
 *
 * Satır yükseklikleri GERÇEK yazı alanı genişliğinde ölçülmüş olmalıdır; böylece kelime
 * sarması hesaba katılır ve satır sayısı tahmin edilmez. Bir satır tek başına sayfadan
 * uzunsa (çok uzun tek paragraf) kendi sayfasında kalır — sonsuz döngü oluşmaz.
 *
 * @param {Array<{ust: number, yukseklik: number}>} satirlar akış içindeki ölçümler (px)
 * @param {number} [sayfaYuk] sayfa içerik yüksekliği (px)
 * @returns {Array<[number, number]>} her sayfa için [başlangıç, bitiş) satır aralığı
 */
export function sayfalaraBol(satirlar, sayfaYuk = YAZI_ALANI_YUK_PX) {
  if (!Array.isArray(satirlar) || satirlar.length === 0) return [[0, 0]];
  const sayfalar = [];
  let bas = 0;
  let ofset = 0;
  satirlar.forEach((s, i) => {
    const alt = s.ust - ofset + s.yukseklik;
    // i > bas koşulu: sayfaya tek satır bile sığmıyorsa o satır yine de yerleştirilir,
    // aksi halde aynı satır için sonsuz sayfa açılırdı.
    if (alt > sayfaYuk && i > bas) {
      sayfalar.push([bas, i]);
      bas = i;
      ofset = s.ust;
    }
  });
  sayfalar.push([bas, satirlar.length]);
  return sayfalar;
}

/** DOM ölçüm katmanındaki çocukları saf ölçüm nesnelerine çevirir. */
export function olcumleriTopla(olcerEl) {
  if (!olcerEl) return [];
  return Array.from(olcerEl.children).map((el) => ({
    ust: el.offsetTop,
    yukseklik: el.offsetHeight,
  }));
}
