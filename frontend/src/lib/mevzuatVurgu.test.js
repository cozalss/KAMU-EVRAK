import { test } from "node:test";
import assert from "node:assert/strict";
import { vurguParcala, dogrulaParcala } from "./mevzuatVurgu.js";

const birlestir = (p) => p.map((x) => x.metin).join("");

test("vurguParcala: sorgunun her sözcüğü (≥3 harf) tüm geçişlerde işaretlenir, metin korunur", () => {
  const m = "Dilekçe hakkı; dilekçede ad ve imza bulunur.";
  const p = vurguParcala(m, "dilekçe imza");
  assert.equal(birlestir(p), m);
  assert.deepEqual(p.filter((x) => x.vurgu).map((x) => x.metin), ["Dilekçe", "dilekçe", "imza"]);
});

test("vurguParcala: Türkçe büyük İ/I doğru eşleşir", () => {
  const p = vurguParcala("İMZA ve ırk", "imza");
  assert.deepEqual(p.filter((x) => x.vurgu).map((x) => x.metin), ["İMZA"]);
});

test("vurguParcala: kısa/boş sorgu ve düzenli ifade karakterleri güvenli", () => {
  assert.deepEqual(vurguParcala("abc", ""), [{ metin: "abc", vurgu: false }]);
  assert.deepEqual(vurguParcala("m.4 (a)", "ve"), [{ metin: "m.4 (a)", vurgu: false }]);
  assert.equal(birlestir(vurguParcala("x (a+b) y", "(a+b)")), "x (a+b) y");
});

test("dogrulaParcala: [DOĞRULA: …] işaretleri ayrı parça olur, içerik aynen kalır", () => {
  const m = "Kurum kuruldu. [DOĞRULA: m.81 KHK ile mülga] Devam.";
  const p = dogrulaParcala(m);
  assert.equal(birlestir(p), m);
  assert.deepEqual(p.filter((x) => x.dogrula).map((x) => x.metin), ["[DOĞRULA: m.81 KHK ile mülga]"]);
});

test("dogrulaParcala: işaret yoksa tek parça", () => {
  assert.deepEqual(dogrulaParcala("düz metin"), [{ metin: "düz metin", dogrula: false }]);
});
