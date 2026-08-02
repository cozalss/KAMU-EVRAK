/**
 * Sesli görüşme çekirdeği — audio-reactive orb + kesintisiz konuş↔dinle döngüsü için saf
 * yardımcılar. Web Audio AnalyserNode'dan genlik (RMS) okur, animasyon değerini yumuşatır ve
 * görüşme durum makinesini (ChatGPT voice mode döngüsü) yürütür. Hepsi saf/test edilebilir —
 * gerçek AudioContext yalnız SesliGorusme.jsx'te bağlanır (jsdom'da AudioContext yok).
 */

/**
 * AnalyserNode.getByteTimeDomainData() çıktısından normalize RMS genlik (0..1).
 * Örnekler 0..255, sessizlik 128'de merkezlenir → (v-128)/128 ile -1..1'e çevir, RMS al.
 * @param {Uint8Array | undefined} bytes
 * @returns {number} 0..1
 */
export function rmsGenlik(bytes) {
  if (!bytes || bytes.length === 0) return 0;
  let toplam = 0;
  for (let i = 0; i < bytes.length; i++) {
    const v = (bytes[i] - 128) / 128;
    toplam += v * v;
  }
  return Math.min(1, Math.sqrt(toplam / bytes.length));
}

/**
 * Üstel yumuşatma (lerp) — orb ölçeği kareden kareye sıçramasın, akıcı takip etsin.
 * @param {number} onceki
 * @param {number} hedef
 * @param {number} faktor 0 (donuk) .. 1 (anında)
 * @returns {number}
 */
export function yumusat(onceki, hedef, faktor = 0.2) {
  return onceki + (hedef - onceki) * faktor;
}

/**
 * Zaman-tabanlı, ASİMETRİK yumuşatma — orb genliğinin gerçek sürücüsü.
 *
 * İKİ SORUNU BİRDEN ÇÖZER:
 * 1. ÇERÇEVE BAĞIMSIZLIĞI. `yumusat` kare başına sabit katsayı uygular, yani zaman sabiti
 *    ekranın tazeleme hızına bağlıdır: 0.15 katsayısı 60 Hz'de ~111 ms, 144 Hz'de ~46 ms,
 *    arka plandaki 30 fps sekmede ~222 ms demektir. Orb'un KARAKTERİ (tepkisel mi, ağır mı)
 *    kullanıcının monitörüne göre değişiyordu. Burada dt ile üstel sönüm kullanılır.
 * 2. ATAK ≠ İNİŞ. Ses ölçerleri hızlı yükselip yavaş iner; simetrik yumuşatma hem hece
 *    başlangıcını geciktirir hem de sözcük aralarında orb'u çökertip titretir. Yükselirken
 *    hızlı (cikisMs), düşerken yavaş (inisMs) takip "canlı ama sakin" okunur.
 *
 * @param {number} onceki  mevcut değer
 * @param {number} hedef   ölçülen yeni değer
 * @param {number} dt      geçen süre (ms)
 * @param {number} cikisMs yükselirken zaman sabiti (küçük = hızlı atak)
 * @param {number} inisMs  düşerken zaman sabiti (büyük = yavaş iniş)
 * @returns {number}
 */
export function yumusatZamanli(onceki, hedef, dt, cikisMs = 45, inisMs = 260) {
  const tau = hedef > onceki ? cikisMs : inisMs;
  // dt çok büyükse (sekme arka plandaydı, rAF durdu) k→1 olur ve değer hedefe atlar:
  // doğru davranış — eski genliği yavaşça sürüklemek "hayalet hareket" üretirdi.
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return onceki + (hedef - onceki) * k;
}

/** Görüşme durumları — orb bu duruma göre canlanır (hazır · dinliyor · düşünüyor · konuşuyor). */
export const DURUM = Object.freeze({
  HAZIR: "hazir",
  DINLIYOR: "dinliyor",
  DUSUNUYOR: "dusunuyor",
  KONUSUYOR: "konusuyor",
});

/**
 * Görüşme durum makinesi (saf reducer). Kesintisiz döngü: dinle → (transcript) düşün →
 * (asistan sesi) konuş → (ses bitti) tekrar dinle. Barge-in ('kes') konuşmayı keser, dinlemeye
 * döner. Guard'lar geçersiz sıçramaları yok sayar (bilinmeyen olay → durum aynı kalır).
 * @param {string} durum
 * @param {string} olay  dinle | sonuc | yanit_basladi | yanit_bitti | bekle | kes | hata
 * @returns {string}
 */
export function sonrakiDurum(durum, olay) {
  switch (olay) {
    case "dinle":
      return DURUM.DINLIYOR;
    case "sonuc": // transcript hazır → yanıt bekle (yalnız dinlerken anlamlı)
      return durum === DURUM.DINLIYOR ? DURUM.DUSUNUYOR : durum;
    case "yanit_basladi": // asistan sesi başladı (yalnız düşünürken)
      return durum === DURUM.DUSUNUYOR ? DURUM.KONUSUYOR : durum;
    case "yanit_bitti": // asistan bitirdi → kesintisiz tekrar dinle
      return DURUM.DINLIYOR;
    case "bekle": // boş dinleme (transcript gelmedi) → hazıra dön
      return DURUM.HAZIR;
    case "kes": // barge-in / durdur → dinlemeye dön
      return DURUM.DINLIYOR;
    case "hata": // yanıt/ses hatası → döngü kilitlenmesin, dinlemeye dön
      return DURUM.DINLIYOR;
    default:
      return durum;
  }
}
