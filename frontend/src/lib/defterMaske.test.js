import test from "node:test";
import assert from "node:assert/strict";
import { onizlemeMaskele, MASKE_BANT } from "./defterMaske.js";

test("maske: TCKN, telefon ve e-posta karartılır, sayaç alan türlerini verir", () => {
  const m = onizlemeMaskele("T.C. Kimlik No: 67890123400\nTelefon: 0555 777 88 19\nE-posta: ayse.yilmaz@ornek.com");
  assert.doesNotMatch(m.metin, /67890123400|777 88 19|ayse\.yilmaz/);
  assert.match(m.metin, new RegExp(MASKE_BANT));
  assert.deepEqual(m.alanlar, ["TCKN", "telefon", "e-posta"]);
});

test("maske: tarih, sayı ve kayıt no gibi kısa rakamlara dokunulmaz", () => {
  const s = "Sayı: E-2026/0034 Tarih: 07.10.2026 tutar 12.500 TL";
  const m = onizlemeMaskele(s);
  assert.equal(m.metin, s);
  assert.deepEqual(m.alanlar, []);
});

test("maske: telefon yazımları (0555-123-4567, +90 555 123 45 67) yakalanır, uzunluk korunur", () => {
  const s = "Tel 0555-123-4567 ve +90 555 123 45 67";
  const m = onizlemeMaskele(s);
  assert.doesNotMatch(m.metin, /123/);
  assert.equal(m.metin.length, s.length);
});

test("maske: boş girdi güvenli", () => {
  assert.deepEqual(onizlemeMaskele(""), { metin: "", alanlar: [] });
  assert.deepEqual(onizlemeMaskele(null), { metin: "", alanlar: [] });
});

test("maske: IBAN karartılır", () => {
  const m = onizlemeMaskele("IBAN: TR12 0001 0012 3456 7890 1234 56");
  assert.doesNotMatch(m.metin, /3456/);
  assert.ok(m.alanlar.includes("IBAN"));
});
