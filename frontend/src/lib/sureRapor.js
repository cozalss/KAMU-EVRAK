/* sureRapor — "İşlem Süresi Detay Raporu"nun SAF çekirdeği (JSX/renk yok; node --test'te
   koşar). Girdi Panel'in `history` dizisidir — rapor YENİ bir veri kaynağı kullanmaz,
   kompakt kutunun okuduğu aynı `result.sure_ms` + `ts` alanlarından türer.

   Süre metriği TERS yönlüdür: düşüş iyidir. Bu yüzden trend nesnesi hem yönü (`yon`) hem
   de yorumu (`iyi`) taşır — renk kararını çağırana bırakıp "yeşil=aşağı" kuralını tek
   yerde tutar. */
import { GUN_MS, gunBasi } from "./gunlukSeri.js";

/* Yavaş işlem eşiği ortalamanın katıdır — sabit "10 sn" eşiği uydurmak yerine veriye
   göreli: makine/model/ağ değişince eşik de kayar, rapor yalan söylemez. */
export const ESIK_KAT = 1.25;

/* history → ölçüm satırları (en yeni önce; history zaten bu sırada gelir).
   Süresi olmayan/0 olan kayıtlar elenir — "0 sn" bir ölçüm değil, ölçüm YOKLUĞUdur. */
export function olcumler(history) {
  return (history || [])
    .filter((h) => Number.isFinite(h?.result?.sure_ms) && h.result.sure_ms > 0)
    .map((h) => ({
      id: h.result.islem_id || h.id || "",
      ad: h.name || "—",
      // İnsan-okur ad için evrak konusu (rapor ve feed AYNI adı göstersin — kayitAdi çağıranda).
      konu: h.result?.bilgi_unsurlari?.konu || "",
      hedefBirim: h.hedef_birim || "",
      evrakTuru: h.evrak_turu || "",
      ms: h.result.sure_ms,
      ts: Number.isFinite(h.ts) ? h.ts : 0,
    }));
}

export const ortalama = (list) =>
  (list && list.length ? list.reduce((a, x) => a + x.ms, 0) / list.length : null);

/* Saniye biçimi — rapor ve panel BOYUNCA tek ondalık (10.4 sn). Ölçüm yoksa "—";
   "0.0 sn" basmak ölçüm yokluğunu sıfır süre gibi gösterirdi. */
// Türkçe ondalık virgül (tr-TR) — Panel "13.2 sn" İşlenen "18,2 sn" yan yana duruyordu (tur4).
export const fmtSn = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(1).replace(".", ",") : "—");

export const esikMs = (ort) => (Number.isFinite(ort) ? ort * ESIK_KAT : null);

/* Trend — yeni ortalamanın eskiye göre yüzde değişimi.
   `iyi`: süre DÜŞTÜYSE true (yeşil aşağı ok), arttıysa false (kırmızı yukarı ok).
   Kıyas kurulamıyorsa (pencerelerden biri boş) null → çağıran "veri yok" gösterir. */
export function trend(yeniOrt, eskiOrt) {
  if (!Number.isFinite(yeniOrt) || !Number.isFinite(eskiOrt) || eskiOrt <= 0) return null;
  const oran = (yeniOrt - eskiOrt) / eskiOrt;
  const yuzde = Math.round(Math.abs(oran) * 100);
  if (yuzde === 0) return { yuzde: 0, yon: "sabit", iyi: true };
  return { yuzde, yon: oran < 0 ? "dusus" : "artis", iyi: oran < 0 };
}

/* [bas, bit) penceresindeki ölçümler. */
export const pencere = (list, bas, bit) => (list || []).filter((x) => x.ts >= bas && x.ts < bit);

/* Dönem kıyaslaması: son `gun` günlük pencerenin ortalaması + bir ÖNCEKİ eş pencereye göre
   trend. Demo/ilk kurulumda geçmiş pencere çoğu zaman boştur — o hâlde trend null döner
   ve rapor "kıyas için yeterli geçmiş yok" der; sayı uydurmaz, çökmez. */
export function donemKiyas(list, gun, simdi = Date.now()) {
  const bas = simdi - gun * GUN_MS;
  const oncekiBas = bas - gun * GUN_MS;
  const simdiki = pencere(list, bas, simdi + 1);
  const onceki = pencere(list, oncekiBas, bas);
  const ort = ortalama(simdiki);
  return { ort, n: simdiki.length, oncekiN: onceki.length, trend: trend(ort, ortalama(onceki)) };
}

/* Büyük metriğin rozeti: en yeni yarı ile ondan önceki eş yarının kıyası (en çok 7'şer
   koşum). 4'ten az ölçümde null — iki koşumdan "trend" çıkarmak gürültüyü sinyal diye
   satmaktır. */
export function genelTrend(list) {
  if (!list || list.length < 4) return null;
  const n = Math.min(7, Math.floor(list.length / 2));
  return trend(ortalama(list.slice(0, n)), ortalama(list.slice(n, n * 2)));
}

/* Tablo sıralaması. Metin alanları Türkçe collation ile (localeCompare "tr") —
   varsayılan sıralama ı/i/ş/ğ harflerini yanlış yere koyar. */
const KARSILASTIR = {
  id: (a, b) => String(a.id).localeCompare(String(b.id), "tr"),
  ad: (a, b) => String(a.ad).localeCompare(String(b.ad), "tr"),
  ms: (a, b) => a.ms - b.ms,
  ts: (a, b) => a.ts - b.ts,
};

export function sirala(list, alan, artan = true) {
  const f = KARSILASTIR[alan] || KARSILASTIR.ts;
  const out = [...(list || [])].sort(f);
  return artan ? out : out.reverse();
}

/* Bar rengi kademesi — ortalamanın ALTI hızlı, ortalama..eşik arası orta, eşiğin ÜSTÜ yavaş.
   Eşik zaten esikMs (ort × ESIK_KAT); yeni sabit eşik eklenmez, tablo ile bar aynı kuralı
   kullanır. Ortalama hesaplanamıyorsa nötr "orta" — renk uydurulmaz. */
export function hizKademe(ms, ort) {
  if (!Number.isFinite(ort) || ort <= 0) return "orta";
  if (ms > ort * ESIK_KAT) return "yavas";
  return ms > ort ? "orta" : "hizli";
}

/* Son 7 günün GÜNLÜK ORTALAMA süresi (saniye, tek ondalık) — kart başlığındaki mini grafik.
   Gün indeksi 0 = 6 gün önce … 6 = bugün. İşlem olmayan gün 0 kalır ve aktifGun'a sayılmaz
   (Sparkline <2 aktif günde hiç çizilmez — yarım grafik "bozuk" okunur). */
export function gunlukOrtSure(list, simdi = Date.now()) {
  const bugun = gunBasi(simdi);
  const toplam = Array.from({ length: 7 }, () => 0);
  const adet = Array.from({ length: 7 }, () => 0);
  for (const x of list || []) {
    if (!Number.isFinite(x?.ts) || x.ts <= 0) continue;
    const idx = 6 - Math.round((bugun - gunBasi(x.ts)) / GUN_MS);
    if (idx < 0 || idx > 6) continue;
    toplam[idx] += x.ms;
    adet[idx] += 1;
  }
  return {
    seri: toplam.map((t, i) => (adet[i] ? Number((t / adet[i] / 1000).toFixed(1)) : 0)),
    aktifGun: adet.filter((n) => n > 0).length,
  };
}

/* Y ekseni — 0'dan tavana 3 kademe. Tavan en uzun ölçümün ÜSTÜNE yuvarlanır ki en yüksek
   bar tavana yapışıp "kesilmiş" görünmesin. Adım ölçeğe göre: saniyelik işlerde 0.5,
   onlarca saniyede 5 — sabit adım küçük değerlerde grafiği yere yapıştırıyordu. */
export function eksenKademe(maxMs) {
  const sn = Number.isFinite(maxMs) && maxMs > 0 ? maxMs / 1000 : 0;
  if (sn <= 0) return { tavanSn: 1, kademeler: [1, 0.5, 0] };
  const adim = sn <= 2 ? 0.5 : sn <= 10 ? 2 : 5;
  const tavanSn = Math.ceil(sn / adim) * adim;
  return { tavanSn, kademeler: [tavanSn, tavanSn / 2, 0] };
}

/* Tür kırılımı (tur 8, rapor modalı) — evrak türü başına adet, ortalama süre ve eşik üstü
   adet; en yavaş tür önce. Yeni veri yok: aynı ölçüm satırlarının `evrakTuru` alanı. */
export function turKirilimi(list, esik) {
  const kova = new Map();
  for (const x of list || []) {
    const k = x.evrakTuru || "";
    const e = kova.get(k) || { tur: k, n: 0, toplam: 0, esikUstu: 0 };
    kova.set(k, { ...e, n: e.n + 1, toplam: e.toplam + x.ms, esikUstu: e.esikUstu + (Number.isFinite(esik) && x.ms > esik ? 1 : 0) });
  }
  return [...kova.values()].map(({ toplam, ...e }) => ({ ...e, ortMs: toplam / e.n })).sort((a, b) => b.ortMs - a.ortMs);
}
