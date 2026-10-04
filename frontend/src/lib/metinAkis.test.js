import test from "node:test";
import assert from "node:assert/strict";
import { akanMetin } from "./metinAkis.js";

const ORNEK = "T.C.\nÇEVRE BAKANLIĞINA\nANKARA\n\nTarih: 09.07.2026\nKonu: bilgi talebi\n\n2025 yılı içinde Ankara ili\ngenelinde düzenlenen yapı\nruhsatı sayısının verilmesini\ntalep ederim.\n\nAdı Soyadı: Ayşe Yılmaz";

test("paragraf içi kırılımlar akar, başlık ve alan satırları korunur", () => {
  const a = akanMetin(ORNEK);
  assert.match(a, /Ankara ili genelinde düzenlenen yapı ruhsatı sayısının verilmesini talep ederim\./);
  assert.match(a, /^T\.C\.\nÇEVRE BAKANLIĞINA\nANKARA\n\n/);
  assert.match(a, /Tarih: 09\.07\.2026\nKonu: bilgi talebi/);
  assert.match(a, /ederim\.\n\nAdı Soyadı/);
});

test("uzunluk birebir korunur (kanıt span ofsetleri bozulmaz)", () => {
  assert.equal(akanMetin(ORNEK).length, ORNEK.length);
  const i = ORNEK.indexOf("Ayşe Yılmaz");
  assert.equal(akanMetin(ORNEK).slice(i, i + 11), "Ayşe Yılmaz");
});

test("boş/tek satırlı girdi olduğu gibi döner", () => {
  assert.equal(akanMetin(""), "");
  assert.equal(akanMetin(null), "");
  assert.equal(akanMetin("tek satır"), "tek satır");
});
