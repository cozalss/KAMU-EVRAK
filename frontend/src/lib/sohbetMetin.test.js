import { test } from "node:test";
import assert from "node:assert/strict";
import { kodlariCevir, satirIciParcala, kayitAdi, notSaati } from "./sohbetMetin.js";

test("bilinen evrak türü kodları Türkçe etikete çevrilir (jüri B#17)", () => {
  assert.equal(kodlariCevir("bilgi_edinme türündeki evrak"), "bilgi edinme başvurusu türündeki evrak");
  assert.equal(kodlariCevir("tür: dilekce, durum: tarih_yok"), "tür: dilekçe, durum: tarih yok");
});

test("bilinmeyen snake_case kod uydurma etiket almaz, aynen kalır", () => {
  assert.equal(kodlariCevir("alan: hedef_birim_kodu"), "alan: hedef_birim_kodu");
});

test("tek yıldız eğik, çift yıldız kalın ayrıştırılır; kod çevirisi parçalara uygulanır", () => {
  assert.deepEqual(satirIciParcala("*bilgi_edinme* türü **GECİKMİŞ**"), [
    { tip: "egik", metin: "bilgi edinme başvurusu" },
    { tip: "duz", metin: " türü " },
    { tip: "kalin", metin: "GECİKMİŞ" },
  ]);
});

test("eşleşmeyen tek yıldız ve çarpma işareti düz metin kalır", () => {
  assert.deepEqual(satirIciParcala("3 * 4 = 12"), [{ tip: "duz", metin: "3 * 4 = 12" }]);
  assert.deepEqual(satirIciParcala(""), []);
});

test("kart adı dosya adı olmaz: konuya, yoksa tür etiketine düşer", () => {
  assert.equal(kayitAdi({ baslik: "ornek-bilgi_edinme_park_harcama.txt", konu: "Park aydınlatma talebi" }), "Park aydınlatma talebi");
  assert.equal(kayitAdi({ baslik: "evrak.txt", evrak_turu: "bilgi_edinme" }), "Bilgi edinme başvurusu");
  assert.equal(kayitAdi({ evrak_no: "E-2026/0001" }), "E-2026/0001");
  assert.equal(kayitAdi({}), "Kayıt");
});

test("not saati ss:dd biçiminde, geçersiz girdide boş", () => {
  const ms = new Date(2026, 9, 4, 9, 5).getTime();
  assert.equal(notSaati(ms), "09:05");
  assert.equal(notSaati(undefined), "");
});
