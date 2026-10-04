import test from "node:test";
import assert from "node:assert/strict";
import { gorevFaz, motorEtiketi } from "./pipelinePhases.js";

test("gorevFaz kullanıcıya 'Görev 1/2' yerine bölüm adı verir", () => {
  assert.equal(gorevFaz(1).uzun, "I. Anlama");
  assert.equal(gorevFaz(2).uzun, "II. Yazı üretimi");
  assert.equal(gorevFaz(undefined).no, "I");
  for (const g of [1, 2]) assert.doesNotMatch(gorevFaz(g).uzun, /Görev/i);
});

test("motorEtiketi ham motor adını ekrana çıkarmaz", () => {
  assert.equal(motorEtiketi("text-plain"), "Dijital metin");
  assert.equal(motorEtiketi("pdf-scan-rapidocr"), "Taranmış PDF (OCR)");
  assert.equal(motorEtiketi("bilinmeyen_motor"), "Okuma motoru");
  assert.equal(motorEtiketi(null), "Metin");
  for (const e of ["text-plain", "pdf-text", "docx-text", "rapidocr", "qwen-vl", "x_y"]) {
    assert.doesNotMatch(motorEtiketi(e), /[_]|-text|plain/);
  }
});
