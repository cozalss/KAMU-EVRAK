/* mevzuatAtif testleri — `node --test src/lib/mevzuatAtif.test.js`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { atifMetni, metinIciAtiflar } from "./mevzuatAtif.js";

test("numaralı kaynakta 'N sayılı Ad m.X' biçimi", () => {
  assert.equal(atifMetni({ no: "4982", baslik: "Bilgi Edinme Hakkı Kanunu", maddeNo: 11 }), "4982 sayılı Bilgi Edinme Hakkı Kanunu m.11");
});

test("ek/geçici madde ve numarasız kaynak", () => {
  assert.equal(atifMetni({ no: "2646", baslik: "Yönetmelik", tur: "ek", maddeNo: 1 }), "2646 sayılı Yönetmelik ek m.1");
  assert.equal(atifMetni({ baslik: "Tebliğ", tur: "gecici", maddeNo: 3 }), "Tebliğ geçici m.3");
  assert.equal(atifMetni({ no: "3071", baslik: "Kanun" }), "3071 sayılı Kanun");
});

test("metin içi atıflar: m.N, Madde N ve sıra sayılı biçim; kendisi hariç, sıralı, tekil", () => {
  assert.deepEqual(metinIciAtiflar("Bu süre 11 inci madde ve m.7 ile Madde 7 uyarınca; 13 üncü maddede.", 11), [7, 13]);
});

test("atıf yoksa boş liste", () => {
  assert.deepEqual(metinIciAtiflar("Başvuru yazılı yapılır.", 4), []);
  assert.deepEqual(metinIciAtiflar(null), []);
});
