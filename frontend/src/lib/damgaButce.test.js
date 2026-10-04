import { test } from "node:test";
import assert from "node:assert/strict";
import { damgaKaydiOlustur, DAMGA_BUTCESI } from "./damgaButce.js";

test("bütçe varsayılanı ekran başına 2 damgadır (MASTER.md)", () => {
  assert.equal(DAMGA_BUTCESI, 2);
});

test("ilk iki damga basılır, üçüncüsü çipe iner", () => {
  const k = damgaKaydiOlustur();
  k.ekle("baslik"); k.ekle("icerik-1"); k.ekle("icerik-2");
  assert.equal(k.basilirMi("baslik"), true);
  assert.equal(k.basilirMi("icerik-1"), true);
  assert.equal(k.basilirMi("icerik-2"), false);
});

test("yüksek öncelikli geç gelen damga bütçeyi alır, en geç düşük öncelikli iner", () => {
  const k = damgaKaydiOlustur();
  k.ekle("baslik"); k.ekle("cip"); k.ekle("hukum", 10);
  assert.equal(k.basilirMi("hukum"), true);
  assert.equal(k.basilirMi("baslik"), true);
  assert.equal(k.basilirMi("cip"), false);
});

test("damga sökülünce sıradaki yeniden basılır ve aboneler haberdar olur", () => {
  const k = damgaKaydiOlustur();
  let cagri = 0;
  const birak = k.abone(() => { cagri += 1; });
  k.ekle("a"); k.ekle("b"); k.ekle("c");
  assert.equal(k.basilirMi("c"), false);
  k.cikar("a");
  assert.equal(k.basilirMi("c"), true);
  assert.equal(cagri, 4);
  birak();
  k.cikar("b");
  assert.equal(cagri, 4, "abonelik bırakıldıktan sonra çağrı gelmemeli");
});

test("kayıtta olmayan damga her zaman basılır; çift ekleme sayılmaz", () => {
  const k = damgaKaydiOlustur();
  assert.equal(k.basilirMi("yok"), true);
  k.ekle("a"); k.ekle("a");
  assert.equal(k.sayi(), 1);
  const s = k.surum();
  k.cikar("olmayan");
  assert.equal(k.surum(), s, "olmayan id'yi çıkarmak yayın yapmamalı");
});
