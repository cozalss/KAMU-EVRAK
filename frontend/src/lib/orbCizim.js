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
  // DÖRT harmonik ve daha dengeli ağırlıklar. Eski karışımda 2. ve 3. harmonikler ağırlığın
  // %80'ini taşıyordu; iki-üç loblu bir şekil, yüksek genlikte SIVI değil YUVARLATILMIŞ ÜÇGEN
  // okunuyordu (ölçüldü: genlik 0,78 karesi). Yüksek harmonikleri güçlendirmek ve bir 7.
  // eklemek kenarı poligonal olmaktan çıkarır. Ağırlık toplamı 1.0 — çıktı -1..1'de kalır.
  return (
    Math.sin(aci * 3 + t) * 0.34 +
    Math.sin(aci * 2 - t * 0.7) * 0.24 +
    Math.sin(aci * 5 + t * 1.3) * 0.26 +
    Math.sin(aci * 7 - t * 0.5) * 0.16
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

// Genlik → ölçek katsayısı; asıl tepki KENAR sıvı-morph'unda.
export const ORB_SCALE_K = 0.13;
// Idle "nefes" salınımı. Genlik ±%2.6, periyot ~5 sn (ts/800 → 2π·800 ms).
// ESKİDEN periyot 11,3 sn'ydi (ts/1800): genlik yeterliydi ama kenar hızı ~0,8 px/sn'ye
// düşüyordu — algı eşiğinin sınırı, yani "nefes" hiç okunmuyordu. Sorun genlik değil HIZDI.
export const ORB_NEFES = 0.026;
const NEFES_PERIYOT = 800;
// Blob yarıçapı ve kenar genliği, orb kutusuna oranla. r + azami amp < 0.5 OLMALI:
// aksi halde overflow:hidden dairesi wobble tepelerini düzleştirir (0.38 + 0.10 = 0.48).
// Genlik yükseltildi çünkü blobYolu quadratic Bézier kullanıyor: eğri kontrol noktalarından
// GEÇMEZ, onlara doğru kirişin en fazla yarısı kadar sapar → yazılan genliğin ancak ~yarısı
// ekrana çıkar. Eski 0.02 tabanı sessizlikte ~0,9 px oynuyordu, yani kenar fiilen dairesel.
const R_ORAN = 0.38;
const AMP_TABAN = 0.025;
const AMP_SES = 0.055;
// Kenar örnekleme noktası. 10 DEĞİL: kenarSapma'nın 5. harmoniği n=10'da tam Nyquist'e
// düşüyor (sin(5·(i/10)·2π) = sin(iπ) = 0) → gürültü enerjisinin %20'si rim boyunca
// İLERLEMEYEN, yerinde titreyen bir terime çöküyordu. 14 hiçbir harmonikle rezonansa girmez.
const NOKTA = 14;

// Çekirdek parlaması — durum dilinin asıl taşıyıcısı. Taban 0'dan büyük: sessizken de orb
// canlı görünmeli, sönmüş olmamalı.
const PARLA_SES = 0.55;

/* DURUM TABANLARI — sessizken bile dört durum birbirinden ayrılsın.
   ÖLÇÜLDÜ (kör denetim): eski sürümde ses susturulduğunda ya da TTS anahtarı yokken
   Hazır ≡ Dinliyor ≡ Yanıtlıyor PİKSEL PİKSEL AYNIYDI — ayrımın tamamı 13 px'lik soluk gri
   bir metin etiketine yüklüydü. Genliğe bağlı parlaklık tek başına yetmez, çünkü genlik
   0 olabilir; her durumun kendi TABAN parlaklığı ve hâle yoğunluğu olmalı.
   Anahtarlar lib/sesGorusme.DURUM değerleridir (düz dize — modüller arası bağ kurmamak için). */
export const DURUM_TABAN = Object.freeze({
  hazir: { parla: 0.06, halo: 0.20 },
  dinliyor: { parla: 0.17, halo: 0.34 },
  dusunuyor: { parla: 0.10, halo: 0.26 },
  konusuyor: { parla: 0.24, halo: 0.42 },
});
const VARSAYILAN_TABAN = DURUM_TABAN.hazir;

/**
 * Tek karenin görsel değerleri — SAF. Ürün (SesliGorusme.dongu) ve düzenek (orb-lab) BUNU
 * paylaşır; böylece labda görülen kare, ekranda çalan karenin AYNISIDIR.
 * @param {{boyut: number, seviye: number, ts: number, azHareket?: boolean, durum?: string}} p
 *   boyut px · seviye 0..1 yumuşatılmış genlik · ts rAF zaman damgası (ms) ·
 *   durum lib/sesGorusme.DURUM değeri (taban parlaklık/hâle seçer)
 * @returns {{scale: number, clipPath: string, haloOpacity: number, parlaklik: number}}
 */
// "Düşünüyor" nabzı — sesten BAĞIMSIZ, yavaş çekirdek atımı (~2,7 sn periyot).
// Kör yargı bulgusu: düşünme durumunun ayrımı tamamen gövdenin DIŞINA çizilmiş 1 px'lik
// geometrik bir halkaya yaslanmıştı; akışkan bir gövdenin yanında mekanik duruyor ve orb'un
// kendi davranışıyla hiç ilişkilenmiyordu. Durum farkı orb'un KENDİSİNDEN doğmalı.
const DUSUNCE_PERIYOT = 430;
const DUSUNCE_PARLA = 0.14;
const DUSUNCE_OLCEK = 0.012;

export function orbKare({ boyut, seviye, ts, azHareket = false, durum }) {
  const taban = DURUM_TABAN[durum] || VARSAYILAN_TABAN;
  // 0..1 arası nabız; yalnız düşünürken ve hareket açıkken.
  const nabiz = (durum === "dusunuyor" && !azHareket)
    ? (Math.sin(ts / DUSUNCE_PERIYOT) + 1) / 2
    : 0;
  // reduced-motion: ölçek/kenar/genliğe-bağlı parlama donuk. AMA durum tabanları KALIR —
  // onlar hareket değil, durumun rengidir; kaldırmak dört durumu yine ayırt edilemez yapardı.
  const s = azHareket ? 0 : seviye;
  const nefes = azHareket ? 0 : Math.sin(ts / NEFES_PERIYOT) * ORB_NEFES;
  // reduced-motion'da clip "none" DEĞİL statik daire: none bırakılırsa küre kutunun tamamını
  // doldurur (r = 0.50·boyut), yani hareketli sürümden ~%30 BÜYÜK olur ve gradyanın dış
  // durakları da tam görünür hâle gelip erik kenarı ağırlaşır. Aynı kırpma, hareketsiz hâli.
  let clipPath = `circle(${(R_ORAN * 100).toFixed(1)}% at 50% 50%)`;
  if (!azHareket && boyut) {
    const c = boyut / 2;
    const amp = boyut * (AMP_TABAN + s * AMP_SES);
    clipPath = `path('${blobYolu(blobNoktalari(c, c, boyut * R_ORAN, NOKTA, ts * 0.0011, amp))}')`;
  }
  return {
    scale: 1 + nefes + s * ORB_SCALE_K + nabiz * DUSUNCE_OLCEK,
    clipPath,
    haloOpacity: Math.min(1, taban.halo + s * 0.42),
    parlaklik: Math.min(1, taban.parla + s * PARLA_SES + nabiz * DUSUNCE_PARLA),
  };
}
