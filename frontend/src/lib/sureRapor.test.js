/* sureRapor — İşlem Süresi Detay Raporu'nun saf çekirdeği.
   Sözleşme: girdi Panel'in history dizisi; süre metriği TERS yönlüdür (düşüş = iyi);
   yetersiz geçmişte sayı UYDURULMAZ (null döner, çağıran "veri yok" gösterir). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  olcumler, ortalama, esikMs, trend, pencere, donemKiyas, genelTrend, sirala, eksenKademe,
  fmtSn, hizKademe, gunlukOrtSure, ESIK_KAT,
} from "./sureRapor.js";
import { GUN_MS } from "./gunlukSeri.js";

const SIMDI = 1_753_400_000_000;                    // sabit epoch — Date.now()'a bağlı test yok
const kayit = (ms, gunOnce = 0, ek = {}) => ({
  id: ek.id || "satir",
  name: ek.name || "ornek.txt",
  ts: SIMDI - gunOnce * GUN_MS,
  hedef_birim: ek.birim || "imar",
  evrak_turu: "dilekce",
  result: { sure_ms: ms, islem_id: ek.islemId || null },
});

test("olcumler süresi olmayan/sıfır olan kayıtları eler", () => {
  const o = olcumler([
    kayit(1200), { name: "x", result: {} }, { name: "y", result: { sure_ms: 0 } },
    { name: "z", result: { sure_ms: null } }, kayit(800),
  ]);
  assert.equal(o.length, 2);
  assert.deepEqual(o.map((x) => x.ms), [1200, 800]);
});

test("olcumler islem_id'yi kimlik yapar, yoksa satır id'sine düşer", () => {
  const o = olcumler([kayit(1000, 0, { islemId: "uuid-1" }), kayit(1000, 0, { id: "oturum-9" })]);
  assert.equal(o[0].id, "uuid-1");
  assert.equal(o[1].id, "oturum-9");
});

test("olcumler bozuk/boş girdide çökmez", () => {
  assert.deepEqual(olcumler(null), []);
  assert.deepEqual(olcumler([null, undefined, {}]), []);
});

test("ortalama ve esikMs", () => {
  const o = olcumler([kayit(1000), kayit(2000), kayit(3000)]);
  assert.equal(ortalama(o), 2000);
  assert.equal(esikMs(2000), 2000 * ESIK_KAT);
  assert.equal(ortalama([]), null);
  assert.equal(esikMs(null), null);
});

test("fmtSn tek ondalık verir, ölçüm yokluğunu '0.0' diye göstermez", () => {
  assert.equal(fmtSn(10_420), "10,4");
  assert.equal(fmtSn(0), "0,0");        // gerçek 0 ms ölçümü (olcumler zaten elemiştir)
  assert.equal(fmtSn(null), "—");
  assert.equal(fmtSn(undefined), "—");
});

test("trend düşüşü İYİ, artışı KÖTÜ işaretler (süre ters yönlü metrik)", () => {
  const dusus = trend(90, 100);
  assert.deepEqual(dusus, { yuzde: 10, yon: "dusus", iyi: true });
  const artis = trend(120, 100);
  assert.deepEqual(artis, { yuzde: 20, yon: "artis", iyi: false });
});

test("trend eşitlikte 'sabit', kıyas kurulamazsa null (sayı uydurmaz)", () => {
  assert.deepEqual(trend(100, 100), { yuzde: 0, yon: "sabit", iyi: true });
  assert.equal(trend(100, null), null);
  assert.equal(trend(null, 100), null);
  assert.equal(trend(100, 0), null);        // sıfıra bölme
});

test("pencere yalnız [bas, bit) aralığındakileri alır", () => {
  const o = olcumler([kayit(1000, 0), kayit(1000, 3), kayit(1000, 9)]);
  assert.equal(pencere(o, SIMDI - 7 * GUN_MS, SIMDI + 1).length, 2);
});

test("donemKiyas son pencerenin ortalamasını ve önceki pencereye göre trendi verir", () => {
  const o = olcumler([
    kayit(1000, 1), kayit(1000, 2),        // son 7 gün → ort 1000
    kayit(2000, 8), kayit(2000, 9),        // önceki 7 gün → ort 2000
  ]);
  const k = donemKiyas(o, 7, SIMDI);
  assert.equal(k.ort, 1000);
  assert.equal(k.n, 2);
  assert.equal(k.oncekiN, 2);
  assert.deepEqual(k.trend, { yuzde: 50, yon: "dusus", iyi: true });
});

test("donemKiyas geçmiş pencere boşken trend null döner (demo/ilk kurulum)", () => {
  const k = donemKiyas(olcumler([kayit(1000, 0), kayit(1200, 1)]), 7, SIMDI);
  assert.equal(k.n, 2);
  assert.equal(k.oncekiN, 0);
  assert.equal(k.trend, null);            // "veri yok" — uydurma yüzde YOK
});

test("donemKiyas hiç veri yoksa ort null (çökmez)", () => {
  const k = donemKiyas([], 30, SIMDI);
  assert.equal(k.ort, null);
  assert.equal(k.trend, null);
});

test("genelTrend 4'ten az ölçümde null (iki koşumdan trend satılmaz)", () => {
  assert.equal(genelTrend([]), null);
  assert.equal(genelTrend(olcumler([kayit(1000), kayit(2000), kayit(3000)])), null);
});

test("genelTrend en yeni yarıyı önceki eş yarıyla kıyaslar", () => {
  // liste en yeni önce: [900,900, 1800,1800] → n=2 → yeni 900, eski 1800 → %50 düşüş
  const o = olcumler([kayit(900), kayit(900), kayit(1800), kayit(1800)]);
  assert.deepEqual(genelTrend(o), { yuzde: 50, yon: "dusus", iyi: true });
});

test("sirala süre ve tarihe göre iki yönde çalışır", () => {
  const o = olcumler([kayit(3000, 0), kayit(1000, 1), kayit(2000, 2)]);
  assert.deepEqual(sirala(o, "ms", true).map((x) => x.ms), [1000, 2000, 3000]);
  assert.deepEqual(sirala(o, "ms", false).map((x) => x.ms), [3000, 2000, 1000]);
  assert.deepEqual(sirala(o, "ts", true).map((x) => x.ms), [2000, 1000, 3000]);  // en eski önce
});

test("sirala metinde Türkçe collation kullanır ve girdiyi MUTASYONA UĞRATMAZ", () => {
  const o = olcumler([kayit(1, 0, { name: "ışık.txt" }), kayit(2, 0, { name: "ada.txt" })]);
  const ilk = o[0];
  assert.deepEqual(sirala(o, "ad", true).map((x) => x.ad), ["ada.txt", "ışık.txt"]);
  assert.equal(o[0], ilk);                // özgün dizi bozulmadı
});

test("sirala bilinmeyen alanda tarihe düşer, boş girdide boş döner", () => {
  assert.deepEqual(sirala([], "yok"), []);
  assert.deepEqual(sirala(null, "ms"), []);
});

test("hizKademe ortalamayı ve eşiği sınır alır (tabloyla aynı kural)", () => {
  const ort = 1000;                                  // eşik = 1000 × 1.25 = 1250
  assert.equal(hizKademe(800, ort), "hizli");
  assert.equal(hizKademe(1000, ort), "hizli");       // ortalamanın kendisi hâlâ hızlı tarafta
  assert.equal(hizKademe(1200, ort), "orta");
  assert.equal(hizKademe(1300, ort), "yavas");
});

test("hizKademe ortalama yoksa nötr döner (renk uydurmaz)", () => {
  assert.equal(hizKademe(1000, null), "orta");
  assert.equal(hizKademe(1000, 0), "orta");
});

test("gunlukOrtSure günlük ORTALAMA verir (toplam değil) ve aktif günü sayar", () => {
  const o = olcumler([
    kayit(10_000, 0), kayit(20_000, 0),              // bugün → ort 15.0 sn
    kayit(4_000, 2),                                  // 2 gün önce → 4.0 sn
  ]);
  const { seri, aktifGun } = gunlukOrtSure(o, SIMDI);
  assert.equal(seri[6], 15);                          // bugün
  assert.equal(seri[4], 4);                           // 2 gün önce
  assert.equal(seri[5], 0);                           // işlem yok
  assert.equal(aktifGun, 2);
});

test("gunlukOrtSure 7 günden eski ve bozuk ts'leri yok sayar", () => {
  const { seri, aktifGun } = gunlukOrtSure(olcumler([kayit(9_000, 30)]), SIMDI);
  assert.deepEqual(seri, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(aktifGun, 0);
  assert.equal(gunlukOrtSure(null, SIMDI).aktifGun, 0);
});

test("eksenKademe tavanı ölçeğe göre yuvarlar, en uzun bar tavana yapışmaz", () => {
  assert.equal(eksenKademe(12_100).tavanSn, 15);     // 12.1 sn → 15
  assert.equal(eksenKademe(1_200).tavanSn, 1.5);     // 1.2 sn  → 1.5 (küçük ölçekte 0.5 adım)
  assert.equal(eksenKademe(9_000).tavanSn, 10);      // 9 sn    → 10
});

test("eksenKademe sıfır/bozuk girdide güvenli varsayılan döner", () => {
  assert.deepEqual(eksenKademe(0), { tavanSn: 1, kademeler: [1, 0.5, 0] });
  assert.deepEqual(eksenKademe(null), { tavanSn: 1, kademeler: [1, 0.5, 0] });
});
