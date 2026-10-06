/* panelBrifSaf testleri — noktalı tarih, kronometre ekseni, takvim en-acil, kıyas çöküşü, paraf. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noktaliGunSaat, noktaliSaat, noktaliTamTarih, kronometreEksen, eksenYuzde, eksenIsaretleri,
  gunEnAcil, kiyasCoker, parafHarf,
} from "./panelBrifSaf.js";

const TS = new Date(2026, 9, 3, 15, 7, 0).getTime();

test("tarih biçimi noktalı ve sıfır dolgulu", () => {
  assert.equal(noktaliGunSaat(TS), "03.10 15:07");
  assert.equal(noktaliSaat(TS), "15:07");
  assert.equal(noktaliTamTarih(TS), "03.10.2026 15:07");
});

test("geçersiz ts boş dizge döner (1970 basılmaz)", () => {
  for (const x of [0, NaN, undefined, null, -5]) {
    assert.equal(noktaliGunSaat(x), "");
    assert.equal(noktaliSaat(x), "");
    assert.equal(noktaliTamTarih(x), "");
  }
});

test("kronometre ekseni eşiği de kapsar ve adıma yuvarlar", () => {
  const e = kronometreEksen([4_500, 23_000], 16_500);
  assert.equal(e.adimSn, 5);
  assert.ok(e.tavanSn >= 23 && e.tavanSn % 5 === 0);
  const k = kronometreEksen([800], 2_400);      // eşik en uzun ölçümden büyük
  assert.ok(k.tavanSn >= 2.4);
  assert.deepEqual(kronometreEksen([], null), { tavanSn: 1, adimSn: 0.5 });
});

test("eksen yüzdesi [0,100] aralığına kırpılır", () => {
  assert.equal(eksenYuzde(5_000, 10), 50);
  assert.equal(eksenYuzde(50_000, 10), 100);
  assert.equal(eksenYuzde(NaN, 10), 0);
  assert.equal(eksenYuzde(1_000, 0), 0);
});

test("eksen işaretleri en çok 6 tane, 0'dan tavana", () => {
  const i = eksenIsaretleri(25, 5);
  assert.deepEqual(i, [0, 5, 10, 15, 20, 25]);
  const s = eksenIsaretleri(60, 5);
  assert.ok(s.length <= 6);
  assert.equal(s[0], 0);
  assert.equal(s[s.length - 1], 60);
});

test("gunEnAcil en az kalan günü seçer, tanımsızı sona atar", () => {
  const r = gunEnAcil([
    { id: "a", sla: { kalan_gun: 5 } },
    { id: "b", sla: { kalan_gun: -64 } },
    { id: "c", sla: {} },
  ]);
  assert.equal(r.enAcil.id, "b");
  assert.equal(r.ek, 2);
  assert.deepEqual(gunEnAcil([]), { enAcil: null, ek: 0 });
});

test("kıyas çöküşü yalnız aynı küme + 30 günlük trend yokken", () => {
  assert.equal(kiyasCoker({ n: 7, trend: null }, { n: 7, trend: null }), true);
  assert.equal(kiyasCoker({ n: 5, trend: null }, { n: 7, trend: null }), false);
  assert.equal(kiyasCoker({ n: 7 }, { n: 7, trend: { yuzde: 3 } }), false);
  assert.equal(kiyasCoker(null, { n: 1 }), false);
});

test("paraf baş harfleri Türkçe büyük harfle", () => {
  assert.equal(parafHarf("ayşe yılmaz"), "AY");
  assert.equal(parafHarf("ibrahim ışık"), "İI");
  assert.equal(parafHarf("  "), "—");
  assert.equal(parafHarf("Ali Rıza Can Demir"), "ARC");
});
