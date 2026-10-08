/* hatSonuMetni testleri — "hat kapandı" yalnız gerçekten kapanınca (tur 9 gerilemesi, §9). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hatSonuMetni } from "./canliHatSonu.js";

test("son masa çalışırken hat kapandı demez", () => {
  assert.equal(hatSonuMetni(["calisti", "calisti", "isleniyor"], null), "1 masa çalışıyor");
});
test("sırada masa varken sırayı yazar", () => {
  assert.equal(hatSonuMetni(["calisti", "bekliyor", "bekliyor"], null), "2 masa sırada");
});
test("hepsi bitince hat kapandı; gerekmedi işlemiş, atlandı işlememiş sayılır", () => {
  assert.equal(hatSonuMetni(["calisti", "gerekmedi", "atlandi"], null), "2 masa işledi · hat kapandı");
});
test("akış durduysa kesildi yazar", () => {
  assert.equal(hatSonuMetni(["calisti", "hata", "islenmedi"], { kesim: 3 }), "1 masa işledi · akış kesildi");
});
