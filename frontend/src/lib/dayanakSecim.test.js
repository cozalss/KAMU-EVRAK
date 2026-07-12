/* Dayanak seçim matematiği + yarış sekans guard'ı birim testleri (node --test).
   Özellikle: tick→hızlı untick yarışında eski yanıtın kaldırılan atfı geri getirmemesi
   (frontend review'da bulunan CRITICAL regresyonu). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSekans, mevzuatAnahtar, mevzuatOzet, sonrakiSecim } from "./dayanakSecim.js";

const A = { baslik: "2709 anayasa secili maddeler m.74", madde_no: "74", kaynak_dosya: "2709.txt", extra: "atılmalı" };
const B = { baslik: "4982 bilgi edinme kanunu m.4", madde_no: "4", kaynak_dosya: "4982.txt" };

test("mevzuatAnahtar başlığı kimlik olarak kullanır, yoksa kaynak dosyaya düşer", () => {
  assert.equal(mevzuatAnahtar(A), "2709 anayasa secili maddeler m.74");
  assert.equal(mevzuatAnahtar({ kaynak_dosya: "x.txt" }), "x.txt");
  assert.equal(mevzuatAnahtar(null), "");
  assert.equal(mevzuatAnahtar({}), "");
});

test("mevzuatOzet yalnız gereken slim alanları taşır (extra düşer)", () => {
  assert.deepEqual(mevzuatOzet(A), {
    baslik: A.baslik, madde_no: "74", madde_tur: undefined, kaynak_dosya: "2709.txt",
  });
});

test("sonrakiSecim: ekleme sona ekler", () => {
  const next = sonrakiSecim([], A, true);
  assert.equal(next.length, 1);
  assert.equal(next[0].baslik, A.baslik);
});

test("sonrakiSecim: çıkarma anahtarla eler", () => {
  const next = sonrakiSecim([mevzuatOzet(A), mevzuatOzet(B)], A, false);
  assert.deepEqual(next.map((x) => x.baslik), [B.baslik]);
});

test("sonrakiSecim: no-op AYNI referansı döner (zaten seçili tekrar ekle / yokken çıkar)", () => {
  const prev = [mevzuatOzet(A)];
  assert.equal(sonrakiSecim(prev, A, true), prev);   // zaten seçili + tekrar ekle → değişmez
  const bos = [];
  assert.equal(sonrakiSecim(bos, A, false), bos);    // yokken çıkar → aynı referans
});

test("sonrakiSecim: anahtarsız öğe yok sayılır (aynı referans)", () => {
  const prev = [mevzuatOzet(A)];
  assert.equal(sonrakiSecim(prev, {}, true), prev);
});

test("createSekans: her al() monotonik artar; yalnız en son güncel", () => {
  const s = createSekans();
  const t1 = s.al();
  const t2 = s.al();
  assert.ok(t2 > t1);
  assert.equal(s.guncelMi(t2), true);
  assert.equal(s.guncelMi(t1), false);
});

test("YARIŞ REGRESYONU: tick(A) uçuştayken untick (boş/undo) da sıra alır → eski yanıt geçersiz", () => {
  // Reprodüksiyon: 1) A işaretle → istek başlar (token tA). 2) hızlı untick → undo yolu da al()
  //    çağırır (tBos). 3) A'nın yanıtı döner → guncelMi(tA) FALSE olmalı (stale) → uygulanmaz.
  const s = createSekans();
  const tA = s.al();          // tick(A) isteği
  const tBos = s.al();        // untick → undo (boş seçim) DA sıra alır — CRITICAL fix çekirdeği
  assert.equal(s.guncelMi(tA), false, "eski tick yanıtı GEÇERSİZ olmalı (kaldırılan atfı geri getirmesin)");
  assert.equal(s.guncelMi(tBos), true, "en son işlem (undo) geçerli");
});

test("YARIŞ: tick(A)→tick(B) uçuştayken yalnız B'nin yanıtı uygulanır", () => {
  const s = createSekans();
  const tA = s.al();
  const tB = s.al();
  assert.equal(s.guncelMi(tA), false);
  assert.equal(s.guncelMi(tB), true);
});
