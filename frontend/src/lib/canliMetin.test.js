/* canliMetin testleri — vurgu kelime sınırı + kesit künyesi (tur 9, D-canli). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegments, kesitBasligi } from "./canliMetin.js";

test("vurgu ekiyle birlikte biter", () => {
  const segs = buildSegments("İÇİŞLERİ BAKANLIĞINA arz", [{ start: 9, end: 18 }]);
  assert.equal(segs.find((s) => s.mark).t, "BAKANLIĞINA");
});
test("vurgu sonraki spana taşmaz", () => {
  const segs = buildSegments("abcdef", [{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  assert.deepEqual(segs.filter((s) => s.mark).map((s) => s.t), ["abc", "def"]);
});
test("boşlukta biten vurguya dokunulmaz", () => {
  assert.deepEqual(buildSegments("Ankara ili", [{ start: 0, end: 6 }])[0], { t: "Ankara", mark: true });
});
test("kesit künyesi maskeli alanı sayar, açık e-postayı söyler", () => {
  assert.equal(kesitBasligi("Tel 055******12 ayse@ornek.com"), "Kaynak kesiti · 1 alan maskeli · e-posta açık");
  assert.equal(kesitBasligi("düz metin"), "Kaynak kesiti · okunan metin");
});
