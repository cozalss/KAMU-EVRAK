import test from "node:test";
import assert from "node:assert/strict";
import { antetSiniflandir } from "./a4Antet.js";

const TASLAK = [
  "T.C.",
  " ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞI",
  " Basın ve Halkla İlişkiler Müşavirliği",
  "",
  "Sayı : E-[DETSİS No]-622-[Kayıt No] 03.10.2026",
  "Konu : 4982 sayılı Kanun kapsamında bilgi talebi",
  "",
  " Sayın Mehmet Demir",
  "",
  "İlgi : 09.07.2026 tarihli başvurunuz.",
  "",
  "\"4982 sayılı Kanun kapsamında bilgi talebi\" konusuna ilişkin olarak yürütülen iş ve işlemler hakkında bilgi verilmiştir.",
  "",
  " Bilgilerinize sunulur.",
  "",
  " Yetkili İmza",
  " Birim Yetkilisi",
  "",
  "Ek: 1 adet liste",
];

test("antet satırları ortalanır, T.C. ve büyük harfli kurum kalın", () => {
  const s = antetSiniflandir(TASLAK);
  assert.equal(s[0].tip, "antetKalin");
  assert.equal(s[1].tip, "antetKalin");
  assert.equal(s[1].metin, "ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞI");
  assert.equal(s[2].tip, "antet");
});

test("Sayı satırındaki tarih sağa ayrılır, metin değişmez", () => {
  const s = antetSiniflandir(TASLAK)[4];
  assert.equal(s.tip, "sayi");
  assert.equal(s.metin, "Sayı : E-[DETSİS No]-622-[Kayıt No]");
  assert.equal(s.sag, "03.10.2026");
});

test("muhatap, paragraf, kapanış ve imza bloğu tanınır; Ek listesi imzaya karışmaz", () => {
  const s = antetSiniflandir(TASLAK);
  assert.equal(s[7].tip, "muhatap");
  assert.equal(s[9].tip, "duz");          // İlgi satırı girintisiz kalır
  assert.equal(s[11].tip, "paragraf");
  assert.equal(s[13].tip, "paragraf");    // kapanış cümlesi
  assert.equal(s[15].tip, "imza");
  assert.equal(s[16].tip, "imza");
  assert.equal(s[18].tip, "duz");
});

test("tanınmayan metin düz kalır (en kötü hâl eski görünüm)", () => {
  const s = antetSiniflandir(["merhaba", "", "kısa not"]);
  assert.deepEqual(s.map((x) => x.tip), ["duz", "duz", "duz"]);
  assert.deepEqual(antetSiniflandir(null), []);
});
