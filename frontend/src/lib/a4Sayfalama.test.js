import test from "node:test";
import assert from "node:assert/strict";
import {
  A4_GEN_MM,
  A4_GEN_PX,
  A4_YUK_MM,
  A4_YUK_PX,
  KENAR_MM,
  YAZI_ALANI_YUK_PX,
  olcumleriTopla,
  sayfalaraBol,
} from "./a4Sayfalama.js";

/* Satır üretici: her satır bir öncekinin altında, sabit yükseklikte. */
const satirlar = (adet, yukseklik) =>
  Array.from({ length: adet }, (_, i) => ({ ust: i * yukseklik, yukseklik }));

test("sayfa A4 oranında (210x297) — kısa kenar / uzun kenar = 1/√2", () => {
  assert.equal(A4_GEN_MM, 210);
  assert.equal(A4_YUK_MM, 297);
  const oran = A4_YUK_PX / A4_GEN_PX;
  assert.ok(Math.abs(oran - Math.SQRT2) < 0.005, `oran ${oran}, beklenen ~1.414`);
});

test("yazı alanı yüksekliği kenar boşluklarını düşer (Yönetmelik m.8/1: 1,5 cm)", () => {
  assert.equal(KENAR_MM, 15);
  const beklenen = (A4_YUK_MM - 2 * KENAR_MM) * (96 / 25.4);
  assert.ok(Math.abs(YAZI_ALANI_YUK_PX - beklenen) < 0.001);
});

test("sayfaya sığan metin tek sayfada kalır", () => {
  const sonuc = sayfalaraBol(satirlar(10, 20), 500);
  assert.deepEqual(sonuc, [[0, 10]]);
});

test("taşan metin ikinci sayfaya aktarılır", () => {
  // 500px sayfaya 20px'lik 25 satır sığar; 26. satır taşar.
  const sonuc = sayfalaraBol(satirlar(30, 20), 500);
  assert.equal(sonuc.length, 2);
  assert.deepEqual(sonuc[0], [0, 25]);
  assert.deepEqual(sonuc[1], [25, 30]);
});

test("sayfa sınırları boşluk bırakmadan birbirini izler", () => {
  const sonuc = sayfalaraBol(satirlar(120, 20), 500);
  assert.ok(sonuc.length >= 4);
  sonuc.reduce((oncekiSon, [bas, son]) => {
    assert.equal(bas, oncekiSon, "sayfa aralıkları bitişik olmalı");
    assert.ok(son > bas, "boş sayfa üretilmemeli");
    return son;
  }, 0);
  assert.equal(sonuc[sonuc.length - 1][1], 120, "son satır kaybolmamalı");
});

test("sayfadan uzun tek satır kendi sayfasında kalır (sonsuz döngü olmaz)", () => {
  const sonuc = sayfalaraBol([{ ust: 0, yukseklik: 900 }], 500);
  assert.deepEqual(sonuc, [[0, 1]]);
});

test("boş girdi tek boş sayfa döner", () => {
  assert.deepEqual(sayfalaraBol([]), [[0, 0]]);
  assert.deepEqual(sayfalaraBol(null), [[0, 0]]);
});

test("olcumleriTopla DOM yokken çökmez", () => {
  assert.deepEqual(olcumleriTopla(null), []);
  assert.deepEqual(olcumleriTopla({ children: [] }), []);
});
