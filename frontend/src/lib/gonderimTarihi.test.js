import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gunAnahtari, tarihFarkli, tarihHukmu, bugunTarihi } from "./gonderimTarihi.js";

const SIMDI = new Date(2026, 9, 7, 10, 0);

describe("gonderimTarihi", () => {
  it("farklı ayraç ve sıfır dolgusu aynı gün sayılır", () => {
    assert.equal(gunAnahtari("07.10.2026"), gunAnahtari("7/10/2026"));
  });
  it("bugünkü tarih farklı değildir", () => {
    assert.equal(tarihFarkli(bugunTarihi(SIMDI), SIMDI), false);
    assert.equal(tarihHukmu("07.10.2026", SIMDI), "tamam");
  });
  it("dünkü tarih farklıdır — karar fişi ve onay fişi aynı hükmü verir", () => {
    assert.equal(tarihFarkli("06.10.2026", SIMDI), true);
    assert.equal(tarihHukmu("06.10.2026", SIMDI), "farkli");
  });
  it("tarih yoksa eksik, okunamıyorsa farklı sayılmaz", () => {
    assert.equal(tarihHukmu("", SIMDI), "eksik");
    assert.equal(tarihFarkli("tarih yok", SIMDI), false);
  });
});
