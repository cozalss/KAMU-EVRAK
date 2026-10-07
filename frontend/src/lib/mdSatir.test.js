/* mdSatir testleri — `node --test src/lib/mdSatir.test.js`.
   Sohbet balonu markdown satır sınıflandırması: ayraç / madde / numara / boş / metin. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mdSatirTipi, mdSatirAyristir } from "./mdSatir.js";

test("'---' yatay ayraçtır (revize önizleme sınırı)", () => {
  assert.equal(mdSatirTipi("---"), "hr");
  assert.equal(mdSatirTipi("  ---  "), "hr");
});

test("'• ', '- ' ve '* ' ile başlayan satır maddedir", () => {
  assert.equal(mdSatirTipi("• kapanış düzeltildi"), "madde");
  assert.equal(mdSatirTipi("- 4982 sayılı Kanun m.11"), "madde");
  assert.equal(mdSatirTipi("* ilgi tutuldu"), "madde");
  assert.equal(mdSatirAyristir("- 4982 sayılı Kanun").govde, "4982 sayılı Kanun");
});

test("'1. ' ve '2) ' numaralı maddedir; rakam ayrıştırılır", () => {
  assert.equal(mdSatirTipi("1. Başvuru alınır"), "numara");
  assert.equal(mdSatirTipi("12) Süre 15 gündür"), "numara");
  assert.deepEqual(mdSatirAyristir("3. Cevap verilir"), { tip: "numara", no: "3", govde: "Cevap verilir" });
});

test("boş satır paragraf arasıdır", () => {
  assert.equal(mdSatirTipi(""), "bos");
  assert.equal(mdSatirTipi("   "), "bos");
});

test("düz metin metindir; tire bitişik veya ondalık sayı madde değildir", () => {
  assert.equal(mdSatirTipi("Belge işlendi."), "metin");
  assert.equal(mdSatirTipi("-eksi işareti"), "metin");
  assert.equal(mdSatirTipi("2026 yılında başvuru"), "metin");
  assert.equal(mdSatirTipi("0,87 / 1 puan"), "metin");
});
