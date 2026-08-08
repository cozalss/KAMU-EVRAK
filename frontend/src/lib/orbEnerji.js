/**
 * Orb enerjisi — canlı işlem sahnesindeki "beyin" orb'unu PIPELINE gerçeğine bağlayan saf
 * katman (kütüphanesiz, test edilebilir; DOM/React yok).
 *
 * NEDEN AYRI BİR MODÜL: orb'un görsel motoru (lib/orbCizim.orbKare) iki girdi bekler —
 * `durum` (dört taban parlaklık/hâle) ve `seviye` (0..1 genlik). Sesli görüşme sahnesinde
 * ikisi de MİKROFONDAN gelir. İşlem sahnesinde mikrofon yok; karşılığı koşumun kendisidir:
 *   · durum  ← hangi görev fazı çalışıyor (anlama / üretim / ara / boşta)
 *   · seviye ← tamamlanan adımların sürdüğü enerji zarfı
 * Bu eşleme animasyonun tamamının anlamını taşır, bu yüzden bileşenin içinde gömülü
 * kalmamalı: burada saf ve testlidir, AjanOrb yalnız rAF'ta okur.
 */

/** Enerji sönüm sabiti (ms). Bir vuruşun görünür kalma süresini belirler. */
export const ORB_TAU = 620;
/** Bir adım tamamlanınca enerjiye eklenen vuruş. */
export const ORB_VURUS = 0.55;
/** Koşum sürerken taban enerji — uzun LLM adımlarında orb düz çizgiye düşmesin. */
export const ORB_TABAN = 0.12;

/**
 * Koşum durumundan orb durum anahtarı (lib/orbCizim.DURUM_TABAN anahtarı).
 * @param {{kosumda: boolean, aktifGorev: number|null, hataVar: boolean}} p
 * @returns {"hazir"|"dusunuyor"|"dinliyor"|"konusuyor"}
 */
export function orbDurumu({ kosumda, aktifGorev, hataVar }) {
  // Hata koşumu sonlandırır: orb "hâlâ çalışıyor" izlenimi vermemeli. Hata sinyali orb'un
  // kendisinde değil (renk tek sinyal olamaz) — üst çubuk çipi + istasyon glifi taşır.
  if (hataVar || !kosumda) return "hazir";
  if (aktifGorev == null) return "dinliyor";
  // Görev 2 = resmî yazı üretimi → en parlak taban ("konuşuyor": sistem artık metin üretiyor).
  // Diğer her şey anlama fazıdır → düşünme halkaları.
  return aktifGorev === 2 ? "konusuyor" : "dusunuyor";
}

/**
 * Enerji zarfının bir sonraki değeri — üstel sönüm + taban + tamamlanma vuruşları.
 * @param {number} mevcut 0..1
 * @param {number} dtMs bir önceki kareden geçen süre
 * @param {{vurus?: number, kosumda?: boolean}} p vurus = bu karede tamamlanan adım sayısı
 * @returns {number} 0..1
 */
export function enerjiSonraki(mevcut, dtMs, { vurus = 0, kosumda = false } = {}) {
  // Negatif/NaN dt: sekme arka plandayken rAF durur, geri gelince saat sıçrayabilir.
  // Sönümü ters çevirip enerjiyi patlatmasın diye 0'a kırpılır.
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const sonmus = mevcut * Math.exp(-dt / ORB_TAU);
  const taban = kosumda ? ORB_TABAN : 0;
  return Math.min(1, Math.max(sonmus, taban) + vurus * ORB_VURUS);
}

/**
 * Bu karede YENİ tamamlanan adımlar — orb'un yutacağı parçacıkların kaynağı.
 * @param {Set<string>} gorulenIdler daha önce yutulmuş adım id'leri
 * @param {Array<{id: string, label?: string, status?: string}>} adimlar
 * @returns {Array<{id: string, label?: string, status?: string}>}
 */
export function yeniBitenler(gorulenIdler, adimlar) {
  return adimlar.filter((a) => a.status === "done" && !gorulenIdler.has(a.id));
}

/**
 * Bu karede ne yapılmalı: defteri sıfırla mı, hangi adımlar yutulsun?
 *
 * YENİDEN BAŞLATMA SİNYALİ KİMLİK DEĞİL SAYIDIR — ölçülerek bulundu (inceleme, 7 Ağu 2026).
 * Naif kontrol "daha önce yutulmuş bir adım artık done değilse koşum baştan başlamıştır"
 * derdi; PARALEL dallarda (PARALEL_ANLAMA: sınıflandır ∥ çıkar, ve triyaj/kapanış/verify
 * fan-out'ları) bu YANLIŞ ateşliyor. Nedeni useSahneTempo'nun açma kuralıdır: tamamlananlar
 * DİZİ SIRASINA göre açılır (CanliMetro.paced), yani sıra dışı biten bir adım, kendinden
 * önceki adım da bitince açılma hakkını ona devreder ve bir kare "pending"e geri düşer.
 * Koşum sağlamken defter siliniyor, ardından aynı adım İKİNCİ KEZ yutuluyordu.
 * Tamamlanan SAYISI ise koşum içinde monotondur (min(reveal, gerçekBiten)); yalnız gerçek
 * bir yeniden başlatmada düşer.
 *
 * @param {Set<string>} defter yutulmuş adım id'leri
 * @param {number} oncekiBitenSayi bir önceki karede tamamlanmış görünen adım sayısı
 * @param {Array<{id: string, label?: string, status?: string}>} adimlar
 * @returns {{sifirla: boolean, yeni: Array<object>, bitenSayi: number}}
 */
/* ——— Yutma jestinin temposu ———
   İLK SÜRÜM OKUNMUYORDU (kullanıcı bulgusu, 7 Ağu 2026): etiket tek bir sürekli uçuşta
   orb'a gidiyordu, yani okunması gereken metin okunduğu sırada HAREKET HÂLİNDEYDİ ve
   hızlı koşumda birden çok etiket üst üste biniyordu. Okunabilirlik hareketin yavaşlatılmasıyla
   değil DURGUNLUKLA gelir: jest üç vuruşa ayrıldı — belir · SABİT DUR · içeri çekil.
   Yalnız orta vuruş bilgi taşır ve o vuruşta hiçbir şey kıpırdamaz.

   Kuyruk uzayınca tempo hızlanır (orb koşumun gerisinde kalmasın) ama BEKLE_TABAN
   kırılmaz: bir etiket asla okunamayacak kadar kısa durmaz. Sıkışma o zaman hızla değil
   görünür kuyrukla anlatılır. */
export const GIRIS_SURE = 180;
export const BEKLE_TAVAN = 900;
export const BEKLE_TABAN = 300;   // kısa bir Türkçe adım adının okunma tabanı
export const CEK_SURE = 420;
const HIZ_AZAMI = 3.2;

/**
 * Bekleyen adım sayısına göre jestin üç vuruşunun süresi (ms).
 * @param {number} kuyrukUzunlugu o an bekleyen (henüz yutulmamış) adım sayısı
 * @returns {{giris: number, bekle: number, cek: number, hiz: number}}
 */
export function yutmaTempo(kuyrukUzunlugu) {
  const bekleyen = Number.isFinite(kuyrukUzunlugu) && kuyrukUzunlugu > 0 ? kuyrukUzunlugu : 0;
  const hiz = Math.min(HIZ_AZAMI, 1 + bekleyen * 0.55);
  return {
    giris: Math.round(GIRIS_SURE / hiz),
    bekle: Math.max(BEKLE_TABAN, Math.round(BEKLE_TAVAN / hiz)),
    cek: Math.round(CEK_SURE / hiz),
    hiz,
  };
}

/* Kuyruk üst sınırı — GÜNCELLİK, EKSİKSİZLİKTEN ÖNCE GELİR.
   Orb bir adımı ~1,5 sn'de yutar; sunum temposu ise bir burst'ü 24-80 ms aralıklarla
   boşaltabilir (özellikle SSE `done` geldiğinde kalan hızlı node'lar toplu düşer). Kuyruk
   sınırsız olsaydı orb koşumun onlarca saniye gerisine düşer, akış "Yazı Taslağı"ndayken
   "Sınıflandır" etiketini gösterirdi — beynin işin NEREDE olduğu konusunda yanılttığı an,
   maskotun anlamı biter. Üstelik koşum bitince sahne sonuç sayfasına geçtiğinden o kuyruk
   zaten hiç boşalmaz.
   Bu yüzden taşma EN ESKİDEN atılır, en yeniler tutulur. Bilgi kaybı değil: orb yedekli bir
   kanal, her adım SahneAkis listesinde ve akış şeridinde tam olarak durmaya devam ediyor. */
export const KUYRUK_AZAMI = 3;

/**
 * Kuyruğa yeni adım(lar) ekler ve üst sınıra kırpar (en yeniler kalır).
 * @param {Array} kuyruk mevcut kuyruk
 * @param {Array} yeniler eklenecekler
 * @returns {Array} yeni kuyruk (girdi DEĞİŞTİRİLMEZ)
 */
export function kuyrugaEkle(kuyruk, yeniler) {
  return [...kuyruk, ...yeniler].slice(-KUYRUK_AZAMI);
}

export function yutmaKarari(defter, oncekiBitenSayi, adimlar) {
  const bitenSayi = adimlar.reduce((s, a) => s + (a.status === "done" ? 1 : 0), 0);
  if (bitenSayi < oncekiBitenSayi) return { sifirla: true, yeni: [], bitenSayi };
  return { sifirla: false, yeni: yeniBitenler(defter, adimlar), bitenSayi };
}
