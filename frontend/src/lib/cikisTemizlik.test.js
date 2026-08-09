/* Çıkışta sohbet geçmişi temizliği — `node --test src/lib/cikisTemizlik.test.js`.

   GÜVENLİK REGRESYONU (9 Ağu 2026 denetimi): sohbet geçmişi `kamu-evrak-sohbet`
   anahtarında tutuluyor ve bu anahtar KULLANICIYA GÖRE AYRILMIYOR. `tokens.clear()`
   çıkışta access/refresh/user/dashboard anahtarlarını siliyordu ama sohbeti SİLMİYORDU.
   Kamu kurumlarında paylaşımlı bilgisayar olağandır: bir sonraki memur uygulamayı
   açtığında önceki memurun tam sohbet geçmişini — içindeki evrak kayıt kartlarıyla
   birlikte — hazır buluyordu.

   Bu test o anahtarın çıkışta gerçekten düştüğünü sabitler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens } from "./authApi.js";
import { hafizaKaydet, hafizaYukle } from "./sohbetHafiza.js";

const SOHBET_ANAHTARI = "kamu-evrak-sohbet";

function sahteLocalStorage() {
  const depo = new Map();
  return {
    getItem: (k) => (depo.has(k) ? depo.get(k) : null),
    setItem: (k, v) => depo.set(k, String(v)),
    removeItem: (k) => depo.delete(k),
    _depo: depo,
  };
}

test("çıkış sohbet geçmişini localStorage'dan siler", () => {
  // Arrange — memur A oturumu: token + evrak kartı içeren sohbet geçmişi
  global.localStorage = sahteLocalStorage();
  global.window = { localStorage: global.localStorage };
  tokens.set("access-A", "refresh-A");
  hafizaKaydet([
    { rol: "kullanici", icerik: "bana gelen evrakları göster" },
    {
      rol: "asistan",
      icerik: "3 evrak bulundu",
      kayitlar: [{ evrak_no: "2026/1234", konu: "Personel izin talebi" }],
      kayit_turu: "gelen",
    },
  ]);
  assert.ok(hafizaYukle(), "ön koşul: geçmiş yazılmış olmalı");

  // Act — memur A çıkış yapıyor
  tokens.clear();

  // Assert — sonraki memur önceki memurun geçmişini GÖRMEMELİ
  assert.equal(
    global.localStorage.getItem(SOHBET_ANAHTARI),
    null,
    "sohbet geçmişi çıkıştan sonra localStorage'da kaldı (paylaşımlı bilgisayarda sızıntı)",
  );
  assert.equal(hafizaYukle(), null, "hafizaYukle çıkıştan sonra hâlâ geçmiş döndürüyor");
});

test("çıkış oturum anahtarlarını da siler (mevcut davranış korunur)", () => {
  // Arrange
  global.localStorage = sahteLocalStorage();
  global.window = { localStorage: global.localStorage };
  tokens.set("access-B", "refresh-B");

  // Act
  tokens.clear();

  // Assert — sohbet temizliği eklenirken token temizliği bozulmamalı
  assert.equal(tokens.access(), "");
  assert.equal(tokens.refresh(), "");
});

test("sohbet geçmişi olmayan oturumda çıkış hata vermez", () => {
  // Arrange — hiç sohbet edilmemiş
  global.localStorage = sahteLocalStorage();
  global.window = { localStorage: global.localStorage };
  tokens.set("access-C", "refresh-C");

  // Act + Assert — istisna atmamalı (çıkış hiçbir koşulda kırılmamalı)
  assert.doesNotThrow(() => tokens.clear());
});
