/**
 * Sesli görüşme konuşma boru hattı — akan LLM metnini cümlelere böler ve "getir↔çal"ı
 * ÖRTÜŞTÜRÜR: ilk cümle çalarken ikincisi seslendirilir.
 *
 * NEDEN: eski akışta tüm yanıt üretilip sonra tek parça TTS isteniyordu; kullanıcı
 * LLM süresi + TTS süresi kadar SESSİZ bekliyordu (asistan "ölü" hissettiriyordu).
 * Cümle bazlı boru hattında ilk ses, ilk cümle tamamlanır tamamlanmaz başlar.
 *
 * Getirmeler bilinçli olarak SIRALIDIR (eşzamanlılık 1): örtüşme kazancının tamamı
 * "çalarken getir"den gelir; paralel getirme yalnız istek patlaması ve /sohbet/seslendir
 * rate-limit'i yaratırdı. Saf/test edilebilir — gerçek fetch ve <audio> çağırana aittir.
 */

/** Cümle sonu SAYILMAYAN kısaltmalar (küçük harfe indirgenmiş, sondaki nokta dahil). */
const KISALTMALAR = new Set([
  "t.c.", "vb.", "vs.", "örn.", "bkz.", "sf.", "sy.", "s.", "md.", "m.", "no.", "nr.",
  "sn.", "dr.", "av.", "prof.", "doç.", "yrd.", "sok.", "cad.", "mah.", "bl.",
  // Resmî yazışma jargonu — cümle sonu sanılırsa konuşma yanlış yerden bölünür.
  "bşk.", "şb.", "gn.", "kur.", "tel.", "müd.", "dai.", "gnl.",
]);

/** Cümle sonu adayı: bir ya da daha çok [.!?…] + ardından boşluk. */
const SON_ADAYI = /[.!?…]+\s+/g;

const VARSAYILAN_MIN_UZUNLUK = 40;

/**
 * Adayın gerçekten cümle sonu olup olmadığını söyler.
 * Eler: kısaltmalar (T.C., vb.) ve sayı/tarih içindeki noktalar (7. madde, 14.07.2026).
 * @param {string} metin  tampon
 * @param {number} nokta  noktalama işaretinin indeksi
 */
function gercekCumleSonuMu(metin, nokta) {
  const oncesi = metin.slice(0, nokta + 1);
  const sonKelime = (oncesi.split(/\s/).pop() || "").toLowerCase();
  if (KISALTMALAR.has(sonKelime)) return false;
  // "7." / "14.07." → sıra sayısı ya da tarih; cümle sonu değil.
  if (/^\d+[.\d]*\.$/.test(sonKelime)) return false;
  // "A." gibi tek harfli baş harf (ad kısaltması).
  if (/^\p{L}\.$/u.test(sonKelime)) return false;
  return true;
}

/**
 * Akan tamponu konuşulabilir cümlelere böl.
 * @param {string} tampon
 * @param {{ minUzunluk?: number, zorla?: boolean }} [secenek]
 *   minUzunluk — bundan kısa parça bölünmez (mikro TTS isteği olmasın)
 *   zorla — akış bitti; kalan da cümle sayılır
 * @returns {{ cumleler: string[], kalan: string }}
 */
export function cumleAyir(tampon, { minUzunluk = VARSAYILAN_MIN_UZUNLUK, zorla = false } = {}) {
  const metin = tampon || "";
  const cumleler = [];
  let bas = 0;
  SON_ADAYI.lastIndex = 0;
  for (let e = SON_ADAYI.exec(metin); e !== null; e = SON_ADAYI.exec(metin)) {
    const kes = e.index + e[0].length;      // boşluk dahil kesim noktası
    if (!gercekCumleSonuMu(metin, e.index)) continue;
    const parca = metin.slice(bas, kes).trim();
    if (parca.length < minUzunluk) continue; // henüz kısa — sonraki adayı bekle
    cumleler.push(parca);
    bas = kes;
  }
  const kalan = metin.slice(bas).trim();
  if (zorla && kalan) return { cumleler: [...cumleler, kalan], kalan: "" };
  return { cumleler, kalan };
}

/**
 * Konuşma kuyruğu — ekle(metin) çağrıları sırayla seslendirilip çalınır; bir sonraki parçanın
 * getirilmesi, bir öncekinin ÇALMAYA BAŞLAMASIYLA tetiklenir (tam bir parça ileri, daha fazla
 * değil). Sınırsız ön-getirme, kullanıcı ilk cümlede sözü kesse bile tüm cümlelerin ücretli
 * olarak seslendirilmesine ve blob'ların bellekte birikmesine yol açardı.
 *
 * @param {{
 *   sesGetir: (metin: string) => Promise<any|null>,  // ses verisi; null = ses yok (503 vb.)
 *   oynat: (ses: any) => Promise<void>,              // çalma bitince resolve etmeli
 *   onIlkSes?: () => void,                           // ilk parça çalmaya başlarken bir kez
 *   onIptal?: () => void,                            // iptalde ÇALAN sesi durdurmak için (bir kez)
 * }} bagimliliklar
 * @returns {{ ekle: (metin: string) => void,
 *             bitir: () => Promise<{caldi: boolean, iptal: boolean}>,
 *             iptal: () => void }}
 *   bitir().caldi → en az bir parça çalındı (false'ta çağıran metne düşer)
 *   bitir().iptal → kuyruk KESİLDİ (barge-in/hata). Çağıran bu durumda turu İLERLETMEMELİ:
 *                   kesme yolunun sahibi zaten dinlemeyi yeniden başlatmıştır; ikinci kez
 *                   ilerletmek taze tanıyıcıyı öldürüp kullanıcının kesme sözünü yer.
 */
export function sesKuyruguOlustur({ sesGetir, oynat, onIlkSes, onIptal }) {
  let oncekiBasladi = Promise.resolve();  // önceki parça çalmaya başladı mı (ön-getirme kapısı)
  let calmaZinciri = Promise.resolve();   // çalmaları sıraya dizer (sıra korunur)
  let iptalEdildi = false;
  let sesCaldi = false;

  const ekle = (metin) => {
    if (iptalEdildi || !metin || !metin.trim()) return;
    const kapi = oncekiBasladi;
    const getirme = kapi.then(() => (iptalEdildi ? null : sesGetir(metin)))
      .catch(() => null);                 // getirme hatası → bu parça sessiz geçilir, döngü sürer
    let basladiCoz;
    oncekiBasladi = new Promise((r) => { basladiCoz = r; });
    calmaZinciri = calmaZinciri.then(async () => {
      let ses = null;
      try {
        ses = await getirme;
      } finally {
        // Atlansa da kapı AÇILMALI — yoksa sonraki parça hiç getirilmez (kuyruk sessizce durur).
        basladiCoz();
      }
      if (iptalEdildi || !ses) return;
      if (!sesCaldi) { sesCaldi = true; onIlkSes?.(); }
      await oynat(ses);
    }).catch(() => { /* çalma hatası döngüyü kilitlemez */ });
  };

  const bitir = async () => {
    await calmaZinciri;
    return { caldi: sesCaldi, iptal: iptalEdildi };
  };

  const iptal = () => {
    if (iptalEdildi) return;              // idempotent — çift durdurma çağrısı yok
    iptalEdildi = true;
    onIptal?.();                          // bayrak yetmez: çalan ses de susmalı
  };

  return { ekle, bitir, iptal };
}
