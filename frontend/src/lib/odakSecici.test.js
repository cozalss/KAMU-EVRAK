import { test } from "node:test";
import assert from "node:assert/strict";
import { ODAKLANIR_SECICI } from "./odakSecici.js";

test("her seçici parçası tabindex=-1 öğeleri dışlar (roving tabindex odak kaçağı regresyonu)", () => {
  const parcalar = ODAKLANIR_SECICI.split(",").map((p) => p.trim());
  assert.ok(parcalar.length >= 6);
  for (const p of parcalar) assert.match(p, /:not\(\[tabindex="-1"\]\)$/, `dışlamayan parça: ${p}`);
});

test("pasif denetimler yine dışarıda", () => {
  for (const e of ["button", "input", "select", "textarea"]) {
    assert.ok(ODAKLANIR_SECICI.includes(`${e}:not([disabled]):not([tabindex="-1"])`), e);
  }
});
