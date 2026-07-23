/* orbCizim testleri — `node --test src/lib/orbCizim.test.js`.
   Sıvı orb kenarı geometrisi: kenarSapma deterministik, blobNoktalari amp=0'da daire,
   blobYolu geçerli kapalı SVG path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blobNoktalari, blobYolu, kenarSapma } from "./orbCizim.js";

test("kenarSapma: deterministik ve -1..1 aralığında", () => {
  assert.equal(kenarSapma(1.2, 3.4), kenarSapma(1.2, 3.4));   // aynı girdi → aynı çıktı
  for (let a = 0; a < 6.28; a += 0.5) {
    for (let t = 0; t < 10; t += 1.7) {
      const v = kenarSapma(a, t);
      assert.ok(v >= -1.0001 && v <= 1.0001, `sapma aralık dışı: ${v}`);
    }
  }
});

test("blobNoktalari: amp=0 → tüm noktalar tam yarıçapta (kusursuz daire)", () => {
  const pts = blobNoktalari(0, 0, 100, 10, 5, 0);
  assert.equal(pts.length, 10);
  for (const [x, y] of pts) {
    const d = Math.hypot(x, y);
    assert.ok(Math.abs(d - 100) < 1e-9, `daire değil: ${d}`);
  }
});

test("blobNoktalari: amp>0 → yarıçaplar [r-amp, r+amp] içinde dalgalanır", () => {
  const r = 120, amp = 20;
  const pts = blobNoktalari(200, 200, r, 10, 2, amp);
  let mini = Infinity, maxi = -Infinity;
  for (const [x, y] of pts) {
    const d = Math.hypot(x - 200, y - 200);
    mini = Math.min(mini, d); maxi = Math.max(maxi, d);
    assert.ok(d >= r - amp - 1e-6 && d <= r + amp + 1e-6, `sınır dışı: ${d}`);
  }
  assert.ok(maxi - mini > 1, "kenar hiç dalgalanmadı (amp etkisiz)");   // gerçekten organik
});

test("blobYolu: geçerli kapalı SVG path (M ile başlar, Z ile biter, Q içerir)", () => {
  const pts = blobNoktalari(150, 150, 100, 8, 1, 12);
  const d = blobYolu(pts);
  assert.ok(d.startsWith("M"), "M ile başlamalı");
  assert.ok(d.endsWith("Z"), "Z ile bitmeli");
  assert.ok(d.includes("Q"), "quadratic eğri içermeli");
});

test("blobYolu: <3 nokta → boş dize (güvenli)", () => {
  assert.equal(blobYolu([[0, 0], [1, 1]]), "");
  assert.equal(blobYolu([]), "");
});
