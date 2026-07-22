/* mdSatir testleri — `node --test src/lib/mdSatir.test.js`.
   Sohbet balonu markdown satır sınıflandırması: yatay ayraç / madde / metin. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mdSatirTipi } from "./mdSatir.js";

test("'---' yatay ayraçtır (revize önizleme sınırı)", () => {
  assert.equal(mdSatirTipi("---"), "hr");
  assert.equal(mdSatirTipi("  ---  "), "hr");
});

test("'• ' ile başlayan satır maddedir", () => {
  assert.equal(mdSatirTipi("• kapanış düzeltildi"), "madde");
});

test("düz metin metindir; '-' tek başına ayraç değildir", () => {
  assert.equal(mdSatirTipi("Belge işlendi."), "metin");
  assert.equal(mdSatirTipi("- eksi işareti"), "metin");
});
