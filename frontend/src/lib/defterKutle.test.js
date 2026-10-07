import test from "node:test";
import assert from "node:assert/strict";
import { kovaKutlesi, KUTLE_ASGARI_SATIR } from "./defterKutle.js";

const r = (_durum, bant) => ({ _durum, bant });

test("kütle: baskın değer kovanın ≥%60'ı ise başlığa çıkar", () => {
  const k = kovaKutlesi([r("bekliyor", "sari"), r("bekliyor", "sari"), r("bekliyor", "yesil"), r("onaylandi", "sari"), r("bekliyor", "sari")]);
  assert.deepEqual(k, { durum: "bekliyor", durumSay: 4, risk: "sari", riskSay: 4 });
});

test("kütle: dağınık kovada alan kütlesiz kalır (azınlık 'aynen'e boğulmaz)", () => {
  const k = kovaKutlesi([r("bekliyor", "sari"), r("onaylandi", "yesil"), r("reddedildi", "kirmizi"), r("bekliyor", "yesil")]);
  assert.equal(k.durum, null);
  assert.equal(k.risk, null);
});

test("kütle: kısa kova ve boş değer kütle olmaz", () => {
  assert.equal(kovaKutlesi([r("bekliyor", "sari"), r("bekliyor", "sari")]).durum, null);
  assert.equal(KUTLE_ASGARI_SATIR, 3);
  assert.equal(kovaKutlesi([r("", ""), r("", ""), r("", "")]).durum, null);
  assert.equal(kovaKutlesi(null).risk, null);
});
