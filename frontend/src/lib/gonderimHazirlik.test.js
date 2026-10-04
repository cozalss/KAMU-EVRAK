/* gonderimHazirlik — onay fişi kararının testleri (`node --test`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gonderimDenetimi, taslakGovdesi, taslakKunyesi } from "./gonderimHazirlik.js";

const DOLU = [
  "                                   T.C.",
  "                          KAMU KURUMU",
  "                       Park ve Bahçeler Müdürlüğü",
  "",
  "Sayı : E-[DETSİS No]-807-[Kayıt No]                                   03.10.2026",
  "Konu : park aydınlatma talebi",
  "",
  "                          Sayın Ayşe Yılmaz",
  "",
  "İlgi : Başvurunuz.",
  "",
  "İlgi yazı ile mahalle parkına aydınlatma yapılmasına ilişkin talep bildirilmiştir. Söz konusu talep, değerlendirilmek üzere ilgili birime iletilmiştir.",
  "",
  "         Bilgilerinize sunulur.",
  "",
  "                                              Yetkili İmza",
  "                                              Birim Yetkilisi",
].join("\n");

/* Ölçülen gerçek kusur: gövde açıklama vaat ediyor, ardından hiçbir şey yok. */
const VAAT_BOS = DOLU.replace(
  /İlgi yazı ile.*iletilmiştir\./,
  "\"4982 sayılı Kanun kapsamında bilgi talebi\" konusuna ilişkin olarak yürütülen iş ve işlemler hakkında ilgili birim ve kişilerin bilgilendirilmesi gereği duyulmuştur. Konuya ilişkin açıklamalar aşağıda sunulmuştur.",
);

test("dolu gövdeli yazı gönderime hazır; künye metinden okunur", () => {
  const d = gonderimDenetimi(DOLU);
  assert.equal(d.hazir, true);
  assert.deepEqual(d.engel, []);
  assert.equal(d.kunye.muhatap, "Sayın Ayşe Yılmaz");
  assert.equal(d.kunye.konu, "park aydınlatma talebi");
  assert.equal(d.kunye.sayi, "E-[DETSİS No]-807-[Kayıt No]");
  assert.equal(d.kunye.tarih, "03.10.2026");
  assert.equal(d.kunye.kapanis, "Bilgilerinize sunulur.");
  assert.match(d.kunye.antet, /Park ve Bahçeler Müdürlüğü/);
});

test("'aşağıda sunulmuştur' deyip açıklama vermeyen yazı engellenir", () => {
  const d = gonderimDenetimi(VAAT_BOS);
  assert.equal(d.hazir, false);
  assert.equal(d.engel[0].kod, "vaat_bos");
});

test("gövdesi boş yazı engellenir", () => {
  const bos = DOLU.replace(/İlgi yazı ile.*iletilmiştir\./, "");
  const d = gonderimDenetimi(bos);
  assert.equal(d.hazir, false);
  assert.equal(d.engel[0].kod, "bos_govde");
  assert.deepEqual(taslakGovdesi(bos), []);
});

test("boş taslak engellenir, künye uydurulmaz", () => {
  const d = gonderimDenetimi("");
  assert.equal(d.hazir, false);
  assert.equal(d.engel[0].kod, "bos_taslak");
  assert.equal(d.kunye.muhatap, "");
});

test("[DOĞRULA] işareti kalan yazı engellenir", () => {
  const d = gonderimDenetimi(DOLU.replace("iletilmiştir.", "iletilmiştir [DOĞRULA: 3071 m.7]."));
  assert.equal(d.hazir, false);
  assert.ok(d.engel.some((e) => e.kod === "dogrula"));
});

test("muhatap/konu yoksa uyarı verir ama engellemez", () => {
  const md = "Sayı : E-1-2-3\n\nBu yazı ile talebiniz değerlendirilmiş olup ilgili birime iletildiği bilginize sunulmaktadır ve takibi yapılacaktır.\n\nBilgilerinize sunulur.";
  const d = gonderimDenetimi(md);
  assert.equal(d.hazir, true);
  assert.deepEqual(d.uyari.map((u) => u.kod).sort(), ["konu_yok", "muhatap_yok"]);
});

test("künye: Sayı satırında tarih yoksa sayı yine okunur", () => {
  assert.equal(taslakKunyesi("Sayı : E-99\nKonu : x").sayi, "E-99");
});
