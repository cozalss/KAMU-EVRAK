/* trMetin — Türkçe locale'e bağlı biçimlendirme. Asıl kilit: noktalı/noktasız İ-I ayrımı.
   Bu testler varsayılan locale'e düşen bir regresyonu yakalar (adı ekranda yanlış yazmak
   kullanıcıya doğrudan görünen bir hatadır). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adBuyut } from "./trMetin.js";

test("adBuyut her kelimenin ilk harfini büyütür", () => {
  assert.equal(adBuyut("gizem fatma kılıç"), "Gizem Fatma Kılıç");
});

test("adBuyut Türkçe İ kuralını uygular (varsayılan locale 'Ibrahim' üretirdi)", () => {
  assert.equal(adBuyut("ibrahim"), "İbrahim");
  assert.equal(adBuyut("işıl"), "İşıl");
});

test("adBuyut tümü büyük yazılmış adı başlık biçimine indirir", () => {
  assert.equal(adBuyut("MEHMET ALİ"), "Mehmet Ali");
});

test("adBuyut fazla boşlukları toparlar", () => {
  assert.equal(adBuyut("  ayşe   yılmaz "), "Ayşe Yılmaz");
});

test("adBuyut boş/eksik girdide boş dize döner (çökmez)", () => {
  assert.equal(adBuyut(""), "");
  assert.equal(adBuyut(null), "");
  assert.equal(adBuyut(undefined), "");
  assert.equal(adBuyut("   "), "");
});
