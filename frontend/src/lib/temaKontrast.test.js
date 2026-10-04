/* Kontrast sözleşmesi (tur 4, jüri C#10): tüm metin token'ları tüm yüzeylerde ≥ 4,5:1,
   iki temada + ray (kenar çubuğu) + koyu kâğıt kapsamında. Bir token kayarsa burada kırılır. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_CSS } from "../components/temaCss.js";
import { kapsamlar, tokenOrani, kontrastOrani, rgb } from "./temaKontrast.js";

const K = kapsamlar(THEME_CSS);
const METIN = ["ink", "ink2", "mut", "mut2", "mut3", "derin-t", "derin-v", "derin-r", "derin-yesil", "derin-sari", "derin-kirmizi"];
const YUZEY = ["bg", "bg2", "surf", "surf2", "surf-pop"];

const olc = (adi, kapsam, metinler, yuzeyler) => {
  for (const m of metinler) for (const y of yuzeyler) {
    const r = tokenOrani(kapsam, m, y);
    assert.ok(r != null, `${adi}: ${m}/${y} çözülemedi`);
    assert.ok(r >= 4.5, `${adi}: ${m} (${kapsam[m]}) / ${y} (${kapsam[y]}) = ${r.toFixed(2)} < 4,5`);
  }
};

test("oran hesabı WCAG referansıyla uyumlu (siyah/beyaz 21, aynı renk 1)", () => {
  assert.equal(Math.round(kontrastOrani([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(kontrastOrani([10, 20, 30], [10, 20, 30]), 1);
  assert.deepEqual(rgb("rgba(0,0,0,.5)", [255, 255, 255]), [127.5, 127.5, 127.5]);
});

test("açık tema: tüm metin token'ları tüm yüzeylerde AA", () => olc("açık", K.acik, METIN, YUZEY));
test("koyu tema: tüm metin token'ları tüm yüzeylerde AA", () => olc("koyu", K.koyu, METIN, YUZEY));
test("kenar çubuğu (ray) iki temada AA", () => {
  olc("ray-açık", K.rayAcik, ["ink", "ink2", "mut", "mut2", "mut3", "derin-t"], ["bg", "surf"]);
  olc("ray-koyu", K.rayKoyu, ["ink", "ink2", "mut", "mut2", "mut3", "derin-t"], ["bg", "surf"]);
});
test("koyu temada kâğıt kapsamı ([data-evrak-kagit]) AA", () => {
  olc("kâğıt-koyu", K.kagitKoyu, METIN, ["surf", "surf2", "surf-pop"]);
});

test("koyu temada ray sayfadan ayrışır — dosya sırtı görünür kalır (jüri A#7)", () => {
  // Açıklık oranı siyah dibinde küçük kalır; asıl sinyal HUE. İkisi birlikte sınanır:
  // oran ≥ 1,12 ve ray'ın mavi kanalı kırmızıdan belirgin yüksek (lacivert, gri değil).
  const ray = rgb(K.rayKoyu.bg), sayfa = rgb(K.koyu.bg);
  assert.ok(kontrastOrani(ray, sayfa) >= 1.12, `ray/sayfa ${kontrastOrani(ray, sayfa).toFixed(2)}`);
  assert.ok(ray[2] - ray[0] >= 30, "koyu ray lacivert değil (mavi − kırmızı < 30)");
});

test("kâğıt gece de açık kalır — koyu temada kâğıt zemini sayfadan ≥ 12:1 ayrışır", () => {
  assert.ok(kontrastOrani(rgb(K.koyu.kagit), rgb(K.koyu.bg)) >= 12);
});
