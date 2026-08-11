/* sureTakvimi — Panel yasal süre takviminin saf çekirdeği.
   Sözleşme: girdi Panel'in kuyrukSla dizisi ({ id, label, sla: { son_tarih "dd.mm.yyyy",
   kalan_gun, durum } }); tarihi çözülemeyen evrak takvimde işaretlenmez; aynı güne düşen
   evraklarda gün EN KÖTÜ duruma boyanır. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { trTarihAyristir, gunAnahtar, kalanMetin, isaretHarita, ayIsaretleri, ayIzgarasi, DURUM_AGIRLIK } from "./sureTakvimi.js";

const oge = (id, son_tarih, durum, kalan_gun) => ({ id, label: id, sla: { son_tarih, durum, kalan_gun } });

test("trTarihAyristir dd.mm.yyyy'yi yerel güne çevirir", () => {
  const d = trTarihAyristir("09.07.2026");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);        // Temmuz = 6
  assert.equal(d.getDate(), 9);
});

test("trTarihAyristir geçersiz biçim ve var olmayan günde null döner (sessiz kayma yok)", () => {
  assert.equal(trTarihAyristir("31.02.2026"), null);   // new Date(2026,1,31) → 03.03'e kayardı
  assert.equal(trTarihAyristir("2026-07-09"), null);
  assert.equal(trTarihAyristir(""), null);
  assert.equal(trTarihAyristir(null), null);
  assert.equal(trTarihAyristir(undefined), null);
});

test("kalanMetin gecikme/son gün/kalan gün cümlelerini üretir", () => {
  assert.equal(kalanMetin({ durum: "GECIKMIS", kalan_gun: -16 }), "16 gün gecikti");
  assert.equal(kalanMetin({ durum: "KRITIK", kalan_gun: 0 }), "son gün bugün");
  assert.equal(kalanMetin({ durum: "NORMAL", kalan_gun: 12 }), "son 12 gün");
});

test("kalanMetin kalan_gun yoksa sayı basmaz", () => {
  assert.equal(kalanMetin({ durum: "GECIKMIS", kalan_gun: null }), "süresi doldu");
  assert.equal(kalanMetin({ durum: "NORMAL", kalan_gun: null }), "süre tanımsız");
  assert.equal(kalanMetin(null), "süre tanımsız");
});

test("isaretHarita aynı günü tek kayıtta toplar ve en kötü duruma boyar", () => {
  const h = isaretHarita([
    oge("a", "09.07.2026", "NORMAL", 12),
    oge("b", "09.07.2026", "GECIKMIS", -3),
    oge("c", "10.07.2026", "KRITIK", 1),
  ]);
  assert.equal(h.size, 2);
  const gun9 = h.get(gunAnahtar(new Date(2026, 6, 9)));
  assert.equal(gun9.ogeler.length, 2);
  assert.equal(gun9.agirlik, DURUM_AGIRLIK.GECIKMIS);   // normal DEĞİL — risk gizlenmez
  assert.equal(h.get(gunAnahtar(new Date(2026, 6, 10))).agirlik, DURUM_AGIRLIK.KRITIK);
});

test("isaretHarita tarihi çözülemeyen evrakı işaretlemez", () => {
  const h = isaretHarita([
    oge("tarihsiz", null, "tarih_yok", null),
    oge("bozuk", "31.02.2026", "NORMAL", 5),
    oge("gecerli", "01.08.2026", "NORMAL", 8),
  ]);
  assert.equal(h.size, 1);
  assert.ok(h.has(gunAnahtar(new Date(2026, 7, 1))));
});

test("isaretHarita boş/bozuk girdide çökmez", () => {
  assert.equal(isaretHarita(null).size, 0);
  assert.equal(isaretHarita([]).size, 0);
  assert.equal(isaretHarita([{}, { sla: null }]).size, 0);
});

test("ayIzgarasi Pazartesi başlar, ay dışını null bırakır", () => {
  // Temmuz 2026: 1'i Çarşamba (ofset 2), 31 gün → 33 hücre → 5 satır (35).
  const g = ayIzgarasi(new Date(2026, 6, 1));
  assert.equal(g.length, 35);
  assert.equal(g[0], null);
  assert.equal(g[1], null);
  assert.equal(g[2].getDate(), 1);
  assert.equal(g[32].getDate(), 31);
  assert.equal(g[33], null);
});

test("ayIzgarasi Pazar başlayan ayda tam satır kaydırır", () => {
  // Şubat 2026: 1'i Pazar → Pazartesi-başlangıçta ofset 6; 28 gün → 34 hücre → 5 satır.
  const g = ayIzgarasi(new Date(2026, 1, 1));
  assert.equal(g.length, 35);
  assert.equal(g[6].getDate(), 1);
  assert.equal(g[5], null);
});

/* ayIsaretleri — kartın sağ kolonu (ayın son günleri listesi) + başlıktaki sayaç buradan
   türer. Sözleşme: YALNIZ görünen ayın işaretli günleri, ızgara sırasında (tarihe göre
   artan), her biri {anahtar, tarih, ogeler, agirlik}. */

test("ayIsaretleri yalnız görünen ayın işaretli günlerini tarih sırasıyla verir", () => {
  const isaret = isaretHarita([
    oge("gec", "20.08.2026", "NORMAL", 8),
    oge("erken", "03.08.2026", "GECIKMIS", -9),
    oge("erken2", "03.08.2026", "NORMAL", 1),
    oge("baska_ay", "05.09.2026", "NORMAL", 24),      // Eylül — Ağustos ızgarasında YOK
  ]);
  const liste = ayIsaretleri(ayIzgarasi(new Date(2026, 7, 1)), isaret);

  assert.deepEqual(liste.map((g) => g.tarih.getDate()), [3, 20]);   // artan, Eylül dışarıda
  assert.equal(liste[0].ogeler.length, 2);
  assert.equal(liste[0].agirlik, DURUM_AGIRLIK.GECIKMIS);           // gün en kötü duruma boyanır
  assert.equal(liste[0].anahtar, gunAnahtar(new Date(2026, 7, 3)));
});

test("ayIsaretleri sayacı işaret haritasıyla aynı evrakı sayar", () => {
  const kuyruk = [oge("a", "03.08.2026", "NORMAL", 1), oge("b", "03.08.2026", "NORMAL", 1), oge("c", "20.08.2026", "NORMAL", 8)];
  const liste = ayIsaretleri(ayIzgarasi(new Date(2026, 7, 1)), isaretHarita(kuyruk));
  assert.equal(liste.reduce((t, g) => t + g.ogeler.length, 0), 3);
});

test("ayIsaretleri boş/bozuk girdide boş dizi döner", () => {
  assert.deepEqual(ayIsaretleri(null, isaretHarita([])), []);
  assert.deepEqual(ayIsaretleri(ayIzgarasi(new Date(2026, 7, 1)), null), []);
  assert.deepEqual(ayIsaretleri(ayIzgarasi(new Date(2026, 7, 1)), isaretHarita([])), []);
});
