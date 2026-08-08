import test from "node:test";
import assert from "node:assert/strict";
import { ONAM_ANAHTARI, onamGerekli, onamOku, onamSil, onamYaz } from "./kvkkOnam.js";

/* Sahte localStorage — gerçek tarayıcı API'si yok (node --test). */
function sahteDepo(baslangic = {}) {
  const veri = { ...baslangic };
  return {
    getItem: (k) => (k in veri ? veri[k] : null),
    setItem: (k, v) => { veri[k] = String(v); },
    removeItem: (k) => { delete veri[k]; },
    _veri: veri,
  };
}

/* Erişilemeyen depo (gizli mod / çerez kapalı) — her çağrı patlar. */
const patlayanDepo = {
  getItem() { throw new Error("erişim yok"); },
  setItem() { throw new Error("erişim yok"); },
  removeItem() { throw new Error("erişim yok"); },
};

test("onamOku: kayıt yoksa false", () => {
  assert.equal(onamOku(sahteDepo()), false);
});

test("onamOku: kayıt varsa true", () => {
  assert.equal(onamOku(sahteDepo({ [ONAM_ANAHTARI]: "1" })), true);
});

test("onamOku: başka değer onay SAYILMAZ", () => {
  assert.equal(onamOku(sahteDepo({ [ONAM_ANAHTARI]: "0" })), false);
  assert.equal(onamOku(sahteDepo({ [ONAM_ANAHTARI]: "evet" })), false);
});

test("onamOku: depo erişilemezse FALSE — 'hatırlayamadım' onay değildir", () => {
  assert.equal(onamOku(patlayanDepo), false);
  assert.equal(onamOku(undefined), false);
});

test("onamYaz: kaydeder ve okunur", () => {
  const d = sahteDepo();
  assert.equal(onamYaz(d), true);
  assert.equal(onamOku(d), true);
});

test("onamYaz: depo yazamazsa akışı BOZMAZ (false döner, patlamaz)", () => {
  assert.equal(onamYaz(patlayanDepo), false);
});

test("onamSil: kaydı kaldırır", () => {
  const d = sahteDepo({ [ONAM_ANAHTARI]: "1" });
  onamSil(d);
  assert.equal(onamOku(d), false);
});

test("onamGerekli: demo KAPALIYKEN asla gerekmez (bugünkü davranış korunur)", () => {
  assert.equal(onamGerekli(false, false), false);
  assert.equal(onamGerekli(false, true), false);
});

test("onamGerekli: demo açık + onay yok → kapı gösterilir", () => {
  assert.equal(onamGerekli(true, false), true);
});

test("onamGerekli: demo açık + onay var → kapı gösterilmez", () => {
  assert.equal(onamGerekli(true, true), false);
});

test("anahtar adı ke- ailesiyle tutarlı", () => {
  assert.match(ONAM_ANAHTARI, /^ke-[a-z0-9-]+$/);
});
