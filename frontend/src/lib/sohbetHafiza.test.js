/* sohbetHafiza testleri — `node --test src/lib/sohbetHafiza.test.js`.
   Sohbet geçmişi localStorage kalıcılığı: geçici alanlar atılır, budanır, round-trip korunur. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hafizaKaydet, hafizaYukle, hazirlaKayit } from "./sohbetHafiza.js";

test("hazirlaKayit: akan/hatalı/boş turlar ve fonksiyon alanları atılır", () => {
  const kayit = hazirlaKayit([
    { rol: "kullanici", icerik: "merhaba" },
    { rol: "asistan", icerik: "", akiyor: true },                 // akan → at
    { rol: "asistan", icerik: "hata", hata: true, tekrar: () => {} }, // hatalı → at
    { rol: "asistan", icerik: "cevap", oneri_gorunum: "panel" },
  ]);
  assert.deepEqual(kayit, [
    { rol: "kullanici", icerik: "merhaba" },
    { rol: "asistan", icerik: "cevap", oneri_gorunum: "panel" },
  ]);
});

test("hazirlaKayit: son max tur tutulur (budama)", () => {
  const cok = Array.from({ length: 40 }, (_, i) => ({ rol: "kullanici", icerik: `m${i}` }));
  const kayit = hazirlaKayit(cok, 30);
  assert.equal(kayit.length, 30);
  assert.equal(kayit[0].icerik, "m10");   // ilk 10 budandı
  assert.equal(kayit[29].icerik, "m39");
});

test("hazirlaKayit: kart alanları korunur", () => {
  const kayit = hazirlaKayit([
    { rol: "asistan", icerik: "liste", kayitlar: [{ name: "x" }], kayit_turu: "islem" },
  ]);
  assert.equal(kayit[0].kayit_turu, "islem");
  assert.deepEqual(kayit[0].kayitlar, [{ name: "x" }]);
});

test("kaydet→yükle round-trip (localStorage mock)", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  hafizaKaydet([{ rol: "kullanici", icerik: "kalıcı mesaj" }]);
  assert.deepEqual(hafizaYukle(), [{ rol: "kullanici", icerik: "kalıcı mesaj" }]);
});

test("hafizaYukle: bozuk JSON → null (çağıran karşılamaya düşer)", () => {
  const store = new Map([["kamu-evrak-sohbet", "{bozuk"]]);
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null } };
  assert.equal(hafizaYukle(), null);
});
