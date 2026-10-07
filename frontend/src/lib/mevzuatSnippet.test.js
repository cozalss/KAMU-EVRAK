/* mevzuatSnippet testleri — `node --test src/lib/mevzuatSnippet.test.js`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { snippetAyristir } from "./mevzuatSnippet.js";

test("başlık satırı gövdeden ayrılır", () => {
  assert.deepEqual(snippetAyristir("Madde 62 — Ödeme emrine itiraz\nBorçlu, ödeme emrinin…"),
    { baslik: "Ödeme emrine itiraz", govde: "Borçlu, ödeme emrinin…" });
});

test("ek ve geçici madde başlıkları da ayrılır", () => {
  assert.equal(snippetAyristir("Ek Madde 1 — Elektronik başvuru\nMetin").baslik, "Elektronik başvuru");
  assert.equal(snippetAyristir("Geçici Madde 3 — Uyum\nMetin").baslik, "Uyum");
});

test("başlık satırı yoksa tüm metin gövdedir", () => {
  assert.deepEqual(snippetAyristir("Borçlu itiraz edebilir."), { baslik: null, govde: "Borçlu itiraz edebilir." });
  assert.deepEqual(snippetAyristir("Madde 62 — Ödeme emrine itiraz Borçlu, ödeme"), { baslik: null, govde: "Madde 62 — Ödeme emrine itiraz Borçlu, ödeme" });
  assert.deepEqual(snippetAyristir(null), { baslik: null, govde: "" });
});
