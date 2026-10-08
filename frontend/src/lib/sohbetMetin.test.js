import { test } from "node:test";
import assert from "node:assert/strict";
import { kodlariCevir, satirIciParcala, kayitAdi, notSaati, atifParcala, baglamSorulari } from "./sohbetMetin.js";

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

const KAYNAK = [{ dosya: "3071_dilekce_hakki", no: "3071" }];
test("atifParcala: kaynaklarda olan kanun atfı bağlantıya çevrilir (tur 9)", () => {
  const p = atifParcala("Bkz. 3071 sayılı Kanun m.7 hükmü.", KAYNAK);
  assert.deepEqual(p.map((x) => x.tip), ["duz", "atif", "duz"]);
  assert.equal(p[1].dosya, "3071_dilekce_hakki");
  assert.equal(p[1].maddeNo, 7);
  assert.equal(p[1].metin, "3071 sayılı Kanun m.7");
});
test("atifParcala: kısa biçim '3071 madde 5' tanınır", () => {
  const p = atifParcala("3071 madde 5 uyarınca", KAYNAK);
  assert.equal(p[0].tip, "atif");
  assert.equal(p[0].maddeNo, 5);
});
test("atifParcala: kaynaklarda olmayan numara bağlanmaz (uydurma bağlantı yok)", () => {
  assert.deepEqual(atifParcala("4982 sayılı Kanun m.11", KAYNAK), [{ tip: "duz", metin: "4982 sayılı Kanun m.11" }]);
  assert.deepEqual(atifParcala("3071 m.7", null), [{ tip: "duz", metin: "3071 m.7" }]);
});
test("baglamSorulari: ekran sayaçlarından en çok 3 soru türetir", () => {
  const s = baglamSorulari({ gorunum: "Panel", notlar: "ekrandaki sayaçlar — gelen 5, taslak 32, giden 4", liste: { adet: 9 } });
  assert.deepEqual(s, ["Karar bekleyen 32 taslağı özetle", "Gelen 5 evrakın yasal süreleri ne durumda?", "Bu ekrandaki 9 kaydı birimlere göre dök"]);
});
test("baglamSorulari: sıfır sayaç ve boş bağlam soru üretmez; seçili evrak ilk soru", () => {
  assert.deepEqual(baglamSorulari({ notlar: "gelen 0, taslak 0, giden 0" }), []);
  assert.deepEqual(baglamSorulari(null), []);
  assert.equal(baglamSorulari({ secili: { ad: "Park harcaması bilgi edinme" } })[0], "“Park harcaması bilgi edinme” evrakını özetle");
});
