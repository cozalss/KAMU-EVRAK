/* goreliTarih birim testleri — `node --test src/lib/goreliTarih.test.js`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gunEkle, gunFarki, isGunuEkle, isGunuMu, sureSonuIcinBaslangic, tarihBaglami, tarihOku, tarihYaz,
} from "./goreliTarih.js";

const G = (y, m, d) => new Date(y, m - 1, d);

test("tarihYaz gg.aa.yyyy üretir, tarihOku geri çözer", () => {
  assert.equal(tarihYaz(G(2026, 3, 5)), "05.03.2026");
  assert.deepEqual(tarihOku("05.03.2026"), G(2026, 3, 5));
  assert.equal(tarihOku("31.02.2026"), null, "geçersiz gün reddedilir");
  assert.equal(tarihOku("2026-03-05"), null);
});

test("gunEkle ay/yıl sınırını aşar ve girdiyi değiştirmez", () => {
  const d = G(2026, 12, 30);
  assert.equal(tarihYaz(gunEkle(d, 3)), "02.01.2027");
  assert.equal(tarihYaz(gunEkle(d, -30)), "30.11.2026");
  assert.equal(tarihYaz(d), "30.12.2026", "girdi mutasyona uğramadı");
});

test("isGunuMu hafta sonunu ve sabit resmî tatili dışlar", () => {
  assert.equal(isGunuMu(G(2026, 10, 6)), true);   // Salı
  assert.equal(isGunuMu(G(2026, 10, 10)), false); // Cumartesi
  assert.equal(isGunuMu(G(2026, 10, 11)), false); // Pazar
  assert.equal(isGunuMu(G(2026, 10, 29)), false); // Cumhuriyet Bayramı (Perşembe)
  assert.equal(isGunuMu(G(2026, 10, 28)), true);  // yarım gün → backend gibi iş günü
});

test("isGunuEkle hafta sonu ve tatili atlar, iki yönde çalışır", () => {
  assert.equal(tarihYaz(isGunuEkle(G(2026, 10, 9), 1)), "12.10.2026");  // Cuma +1 → Pazartesi
  assert.equal(tarihYaz(isGunuEkle(G(2026, 10, 12), -1)), "09.10.2026"); // Pazartesi -1 → Cuma
  assert.equal(tarihYaz(isGunuEkle(G(2026, 10, 28), 1)), "30.10.2026");  // 29 Ekim atlanır
  assert.equal(tarihYaz(isGunuEkle(G(2026, 10, 6), 0)), "06.10.2026");
});

test("gunFarki takvim günü sayar", () => {
  assert.equal(gunFarki(G(2026, 10, 1), G(2026, 10, 6)), 5);
  assert.equal(gunFarki(G(2026, 10, 6), G(2026, 10, 1)), -5);
  assert.equal(gunFarki(G(2026, 3, 28), G(2026, 3, 30)), 2, "yaz saati geçişi tam gün kalır");
});

test("sureSonuIcinBaslangic: son gün iş gününe düşer ve kalan ≤ hedef", () => {
  for (let i = 0; i < 400; i += 1) {
    const bugun = gunEkle(G(2026, 1, 1), i);
    for (const hedef of [1, 2]) {
      const bas = sureSonuIcinBaslangic(bugun, 30, hedef);
      const son = gunEkle(bas, 30);
      const kalan = gunFarki(bugun, son);
      assert.ok(kalan >= 0 && kalan <= hedef, `${tarihYaz(bugun)} hedef ${hedef} → kalan ${kalan}`);
      // Son gün iş günü değilse yalnız kalan=0 durumunda olabilir (bugün tatil) — kayma ≤2.
      if (!isGunuMu(son)) assert.equal(kalan, 0);
    }
  }
});

test("tarihBaglami göreli dizeleri bugüne göre üretir", () => {
  const t = tarihBaglami(G(2026, 10, 6));
  assert.equal(t.yil, 2026);
  assert.equal(t.gunOnce(6), "30.09.2026");
  assert.equal(t.gunSonra(1), "07.10.2026");
  assert.equal(t.isGunuOnce(2), "02.10.2026");
  assert.equal(t.isGunuSonra(4), "12.10.2026");
  assert.equal(t.sonra("30.09.2026", 9), "09.10.2026");
  assert.equal(t.sureyeKalan(30, 2), "08.09.2026"); // 08.09 + 30 = 08.10 (Perşembe)
});
