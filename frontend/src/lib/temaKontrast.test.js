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
  olc("ray-açık", K.rayAcik, ["ink", "ink2", "mut", "mut2", "mut3", "derin-t", "derin-sari", "derin-kirmizi"], ["bg", "surf"]);
  olc("ray-koyu", K.rayKoyu, ["ink", "ink2", "mut", "mut2", "mut3", "derin-t", "derin-sari", "derin-kirmizi"], ["bg", "surf"]);
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

test("primary buton dolgusu iki temada + rayda AA (tur 7: koyu temada 'devre dışı' okunuyordu)", () => {
  for (const [adi, k] of [["açık", K.acik], ["koyu", K.koyu], ["ray-açık", K.rayAcik], ["ray-koyu", K.rayKoyu], ["kâğıt-koyu", K.kagitKoyu]]) {
    for (const d of ["dolgu-t", "dolgu-th"]) {
      const r = tokenOrani(k, "on-dolgu", d);
      assert.ok(r != null && r >= 4.5, `${adi}: on-dolgu/${d} = ${r}`);
    }
  }
  // Koyu temada dolgu açık lavanta DEĞİL: beyaz metin taşıyan koyu bir mavi.
  assert.ok(kontrastOrani(rgb(K.koyu["dolgu-t"]), rgb(K.koyu.bg)) >= 2.5, "koyu dolgu zeminden ayrışmıyor");
});

test("sırt üstü kırmızı: etkin sekme rozeti sayfa zemininde AA (tur 8: ray kırmızısı 1,7:1 kalıyordu)", () => {
  // --ke-sayfa-kirmizi :root'ta çözülür ve ray kapsamına MİRAS kalır → rayın açık mercanı değil,
  // sayfanın kendi derin kırmızısı. Sırtın zemini --ke-sayfa (= bg) olduğu için ikisi birlikte ölçülür.
  for (const [adi, k] of [["açık", K.acik], ["koyu", K.koyu]]) {
    const r = tokenOrani(k, "sayfa-kirmizi", "sayfa");
    assert.ok(r != null && r >= 4.5, `${adi}: sayfa-kirmizi/sayfa = ${r}`);
  }
});

test("koyu tema yükseklik merdiveni (tur 8): kart zeminden ≥ 1,15, havada duran katman karttan açık", () => {
  const bg = rgb(K.koyu.bg), surf = rgb(K.koyu.surf), pop = rgb(K.koyu["surf-pop"]);
  assert.ok(kontrastOrani(surf, bg) >= 1.15, `surf/bg ${kontrastOrani(surf, bg).toFixed(3)}`);
  assert.ok(kontrastOrani(pop, bg) > kontrastOrani(surf, bg), "surf-pop surf'ten açık değil");
});
