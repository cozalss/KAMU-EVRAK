import { test } from "node:test";
import assert from "node:assert/strict";
import { antetKunyeSatirlari, kunyeDeger } from "./kabukAntetKunye.js";

const veri = {
  sayac: { gelen: 15, taslak: 32, giden: 4, gecikmis: 1, bekliyor: {} },
  sicil: { bugunIslenen: 3, bugunGiden: 0, taslak: 32, gecikmis: 1, son: [{ no: "İ-2026/0033" }] },
};

test("kunyeDeger üç hâli ayırır: sayı, bekliyor, bilinmiyor", () => {
  assert.equal(kunyeDeger(7), "07");
  assert.equal(kunyeDeger(null, true), "··");
  assert.equal(kunyeDeger(null, false), "—");
});

test("gelen künyesi kuyruk + gecikmiş (acil işaretli) + karar bekleyen taşır", () => {
  const s = antetKunyeSatirlari("gelen-h", veri);
  assert.deepEqual(s.map((x) => x.d), ["15", "01", "32"]);
  assert.equal(s[1].acil, true);
});

test("gecikmiş 0 iken acil işareti yoktur", () => {
  const s = antetKunyeSatirlari("gelen-h", { ...veri, sayac: { ...veri.sayac, gecikmis: 0 } });
  assert.equal(s[1].acil, false);
});

test("İşlenen künyesi son sicil numarasını İşlenen defteriyle aynı yazar", () => {
  const s = antetKunyeSatirlari("islenen-h", veri);
  assert.equal(s[2].d, "İ-2026/0033");
});

test("eşlenmemiş görünüm ve eksik veri boş liste döndürür", () => {
  assert.deepEqual(antetKunyeSatirlari("panel-h", veri), []);
  assert.deepEqual(antetKunyeSatirlari("gelen-h", {}), []);
});

test("bilinmeyen sayı 00 yazılmaz (yanlış olgu üretmez)", () => {
  const s = antetKunyeSatirlari("giden-h", { sayac: { ...veri.sayac, giden: null, bekliyor: {} }, sicil: { ...veri.sicil, bugunGiden: null } });
  assert.equal(s[0].d, "—");
  assert.equal(s[1].d, "—");
});
