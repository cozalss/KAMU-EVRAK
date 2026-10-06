/* defterVade — Gelen defterindeki VADE CETVELİ'nin saf matematiği.

   Sorun (jüri tur 6): 15 satırın 9'u aynı kırmızı "N gün gecikti" çipini taşıyordu; 67 gün
   ile 36 gün aynı görsel ağırlıktaydı, kırmızı hiçbir satırı ötekinden ayırmıyordu.
   Çözüm: her satırda ORTAK ÖLÇEKLİ bir cetvel. Cetvelin mavi bölümü yasal süredir
   (başlangıç → son gün), dolan kısmı geçen gün; son gün aşıldıysa kırmızı mürekkep cetvelin
   DIŞINA, gecikme kadar uzar. Tüm satırlar aynı gün→piksel ölçeğini paylaşır: 67 günlük
   gecikme 36 günlükten ilk bakışta uzun okunur. Tint zemin yalnız en ağır çeyrekte kalır.

   Veri: backend compute_sla → { baslangic, son_tarih (gg.aa.yyyy), kalan_gun, durum }.
   Yalnız bu alanlar kullanılır; eksikse cetvel ÇİZİLMEZ (uydurma ölçü yok). */

const GUN_MS = 86_400_000;

/** "31.07.2026" → yerel gün başı epoch; geçersizse null. */
export function trTarih(s) {
  const m = String(s || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : d.getTime();
}

/** Bir satırın vade ölçüsü (gün). kalan_gun backend'in kararıdır — tazelik onda.
    @param {{baslangic?:string, son_tarih?:string, kalan_gun?:number, durum?:string}|null} sla
    @returns {{sure:number, gecen:number, gecikme:number}|null} */
export function vadeOlcusu(sla) {
  if (!sla || !Number.isFinite(sla.kalan_gun)) return null;
  const bas = trTarih(sla.baslangic);
  const son = trTarih(sla.son_tarih);
  if (bas == null || son == null || son < bas) return null;
  const sure = Math.max(1, Math.round((son - bas) / GUN_MS));
  const kalan = sla.kalan_gun;
  const gecikme = kalan < 0 ? -kalan : 0;
  const gecen = Math.min(sure, Math.max(0, sure - kalan));
  return { sure, gecen, gecikme };
}

/** Ortak ölçek: en uzun (süre + gecikme) cetvel `genislik` piksele sığar.
    @param {({sure:number, gecikme:number}|null)[]} olculer @param {number} genislik
    @returns {number} piksel / gün (ölçü yoksa 0) */
export function gunOlcegi(olculer, genislik) {
  const azami = Math.max(0, ...olculer.filter(Boolean).map((o) => o.sure + o.gecikme));
  return azami > 0 ? genislik / azami : 0;
}

/** En ağır çeyreğin eşiği — gecikmeli satırların %75'lik dilimi (yakın-sıra yöntemi).
    Tek gecikmeli satır varsa o satır ağırdır. Gecikme yoksa Infinity (kimse vurgulanmaz).
    @param {number[]} gecikmeler @returns {number} */
export function agirCeyrekEsigi(gecikmeler) {
  const g = gecikmeler.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!g.length) return Infinity;
  const i = Math.min(g.length - 1, Math.ceil(0.75 * g.length) - 1);
  return g[i];
}

/** Hafta çentikleri — cetvel üzerinde her 7 günde bir (yalnız süre bölümünde).
    @param {number} sure @returns {number[]} gün konumları */
export function haftaCentikleri(sure) {
  const out = [];
  for (let g = 7; g < sure; g += 7) out.push(g);
  return out;
}
