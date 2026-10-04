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

/* A4 en/boy oranı — kağıt sütununun genişliği bu orandan türer (CSS `aspect-ratio`), böylece
   sütun tam kağıt biçiminde olur ve kenarında ölü beyaz alan kalmaz. */
export const A4_ORAN = A4_GEN_MM / A4_YUK_MM;

// Geniş panelde sayfa gerçek A4'ten büyük gösterilebilir; sınır yalnız absürt büyümeyi keser.
export const AZAMI_OLCEK = 1.6;
// Çok kısa kaplarda sayfa okunamaz hâle gelmesin — bu noktadan sonra kaydırma devreye girer.
export const ASGARI_OLCEK = 0.42;

/**
 * Kullanılabilir kutuya bir TAM A4 sayfası sığdıran ölçeği hesaplar.
 *
 * Ölçek HEM genişliğe HEM yüksekliğe bakar: yalnız genişliğe bakmak sayfayı dikeyde taşırır
 * ve memur tek bir yazıyı görmek için kaydırmak zorunda kalır. Oran ASLA esnetilmez; iki
 * eksenin küçüğü kazanır, sonuç ASGARI/AZAMI arasına kelepçelenir.
 *
 * Sayfanın kabı aşmasına izin veren bir "taşma payı" DENENDİ ve kullanıcı kararıyla geri
 * alındı (2026-08-02): daha büyük punto, alt şeridin kaydırmayla gelmesine değmiyor. Sayfa
 * daima tam sığar; büyütmek isteyen sütuna daha çok YER açar (bkz. kagitSutunGenisligi).
 *
 * Yükseklik ölçülemediğinde (henüz yerleşmemiş kap → 0) genişlik TEK BAŞINA karar verir;
 * aksi halde ölçek sıfıra çöker ve sayfa bir kare görünmez olurdu.
 *
 * Saf fonksiyondur (DOM yok) — bileşendeki efekt sıralamasından bağımsız olarak test edilir.
 *
 * @param {number} genislik kullanılabilir genişlik (px)
 * @param {number} yukseklik kullanılabilir yükseklik (px); 0/geçersiz → yalnız genişlik
 * @returns {number} ASGARI_OLCEK..AZAMI_OLCEK arası ölçek
 */
export function olcekHesapla(genislik, yukseklik) {
  const gen = Number(genislik);
  if (!Number.isFinite(gen) || gen <= 0) return ASGARI_OLCEK;
  const yuk = Number(yukseklik);
  const genOlcek = gen / A4_GEN_PX;
  const yukOlcek = Number.isFinite(yuk) && yuk > 0 ? yuk / A4_YUK_PX : Infinity;
  return Math.max(ASGARI_OLCEK, Math.min(AZAMI_OLCEK, genOlcek, yukOlcek));
}

/**
 * sigdir="genislik" kipinin ölçeği — YALNIZ genişlikten, ASGARI tabanı OLMADAN.
 *
 * Bu kipte kabın yatay kaydırması yoktur; ASGARI tabanı dar telefonda sayfayı ekran
 * dışına itiyordu (390px'te 27px yatay kayma, TUR 3 ölçümü). Orada okumak için kâğıda
 * dokunulur (A4 büyütme). Geçersiz genişlikte (kap yerleşmemiş) ASGARI döner — çökme yok.
 *
 * @param {number} genislik kabın kullanılabilir genişliği (px)
 * @returns {number} 0 < ölçek ≤ AZAMI_OLCEK
 */
export function genislikOlcegi(genislik) {
  const gen = Number(genislik);
  if (!Number.isFinite(gen) || gen <= 0) return ASGARI_OLCEK;
  return Math.min(AZAMI_OLCEK, gen / A4_GEN_PX);
}

/* Ölçek yeniden-ölçümü HER commit'te (boyamadan önce) koşar — bkz. A4Belge. Bu yüzden ölçüm
   kendi çıktısına geri beslenir: yeni ölçek → yığın yüksekliği değişir → kap yeniden ölçülür.
   Sonuç öncekiyle AYNIYSA state'e yazılmamalı, yoksa ölçüm→render→ölçüm döngüsü kapanmaz.

   Eşik piksel cinsinden anlamlı seçildi: A4 genişliğinde yarım pikselden küçük fark ekranda
   GÖRÜNMEZ, ama kayan nokta gürültüsü (clientWidth tamsayı olsa da bölme sonucu değil) bu
   mertebede kolayca oynar. Eşiği büyütmek gerçek yeniden boyutlandırmaları yutar; küçültmek
   döngü riskini geri getirir. */
export const OLCEK_ESIK = 0.5 / A4_GEN_PX;

/**
 * Yeni ölçüm state'e yazılmaya değer mi?
 *
 * @param {number} eski yürürlükteki ölçek
 * @param {number} yeni yeni ölçülen ölçek
 * @returns {boolean} yazılmalıysa true
 */
export function olcekOynadi(eski, yeni) {
  if (!Number.isFinite(yeni)) return false;          // ölçülemeyen değer state'i bozmasın
  if (!Number.isFinite(eski)) return true;           // ilk ölçüm daima yazılır
  return Math.abs(eski - yeni) >= OLCEK_ESIK;
}

// Kâğıt sütunu bu genişliğin altına inmez; altında sayfa okunmaz olur (kaydırma devralır).
export const KAGIT_ASGARI_GEN = 240;

/**
 * Kâğıt sütununun genişliği — ölçülen sütun yüksekliğinden A4 oranıyla TÜRETİLİR, böylece
 * sütun tam kâğıt biçiminde olur: sayfa sütunu birebir doldurur, kenarında ölü alan kalmaz.
 *
 * Dar pencerede ideal genişlik diğer sütunlara yer bırakmayabilir; o durumda kalan kazanır
 * ve sayfa daralır (oran esnetilmez, yalnız ölçek küçülür).
 *
 * `Math.floor` ŞART: yukarı yuvarlama sayfayı yarım piksel taşırıp koca bir kaydırma çubuğu
 * doğurabilir — kazanç yarım piksel, bedel 15px'lik çubuk.
 *
 * @param {number} sutunH ölçülen sütun yüksekliği (px)
 * @param {number} kalanGen kâğıda ayrılabilecek azami genişlik (px)
 * @returns {number|null} sütun genişliği (px); ölçüm yoksa null
 */
export function kagitSutunGenisligi(sutunH, kalanGen) {
  const yuk = Number(sutunH);
  const kalan = Number(kalanGen);
  if (!Number.isFinite(yuk) || yuk <= 0 || !Number.isFinite(kalan)) return null;
  return Math.max(KAGIT_ASGARI_GEN, Math.floor(Math.min(yuk * A4_ORAN, kalan)));
}

/** DOM ölçüm katmanındaki çocukları saf ölçüm nesnelerine çevirir. */
export function olcumleriTopla(olcerEl) {
  if (!olcerEl) return [];
  return Array.from(olcerEl.children).map((el) => ({
    ust: el.offsetTop,
    yukseklik: el.offsetHeight,
  }));
}

/* Önizleme kâğıdı İÇERİĞE GÖRE kesilir (yalnız tek sayfalık "genislik" önizlemesi).
   Bağımsız denetim: 3 satırlık yazı için ~850 px boş A4 gösteriliyor, onay düğmesi ve imza
   bloğu ekranın altına itiliyordu. Kâğıt artık içerik + üst/alt kenar boşluğu kadar uzar;
   aşırı kısa yazıda A4 hissi kaybolmasın diye taban yüksekliğin %45'i, tavan tam A4.
   Baskı (`@page`) ve büyütülmüş A4 görünümü etkilenmez — yalnız ekran önizlemesidir. */
export const KIRPIK_TABAN_ORAN = 0.45;
export const KIRPIK_PAY_PX = 24;   // imza altı nefes payı (mühür imza satırının altına taşar)

export function kirpikSayfaYuk(icerikPx) {
  const ic = Number(icerikPx);
  if (!Number.isFinite(ic) || ic <= 0) return A4_YUK_PX;
  const yuk = ic + 2 * KENAR_MM * MM + KIRPIK_PAY_PX;
  return Math.min(A4_YUK_PX, Math.max(A4_YUK_PX * KIRPIK_TABAN_ORAN, yuk));
}

/* Ölçüm katmanındaki son satırın alt kenarı = içerik yüksekliği (px, ölçeksiz). */
export function icerikYuksekligi(olcumler) {
  if (!Array.isArray(olcumler) || !olcumler.length) return 0;
  return olcumler.reduce((m, s) => Math.max(m, (Number(s.ust) || 0) + (Number(s.yukseklik) || 0)), 0);
}
