/* ekranBaglami testleri — `node --test src/lib/ekranBaglami.test.js`.
   Sözleşme: bağlam KÜÇÜK kalır (bütçe), ham evrak metni sızmaz, boş alan taşınmaz. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SINIR, ekranBaglamiOlustur, evrakOzeti, gorunumAdi, listeOzeti } from "./ekranBaglami.js";

test("gorunumAdi kodu kullanıcının gördüğü ada çevirir (LLM'e kod sızmaz)", () => {
  assert.equal(gorunumAdi("taslaklar"), "Taslaklar (karar bekleyen yazılar)");
  assert.equal(gorunumAdi("panel"), "Panel (genel durum)");
});

test("gorunumAdi bilinmeyen kodu kırpar, çökmez", () => {
  assert.equal(gorunumAdi(undefined), "Bilinmeyen ekran");
  assert.equal(gorunumAdi("x".repeat(80)), `${"x".repeat(40)}…`);   // 40 karakter + kırpma göstergesi
});

test("evrakOzeti yalnız türetilmiş üst-veriyi taşır", () => {
  const ozet = evrakOzeti({
    name: "ornek-dilekce.txt",
    result: { evrak_turu: "Dilekçe", hedef_birim: "İnsan Kaynakları",
              risk_metadata: { bant: "sari" }, ozet: "Yıllık izin talebi." },
  });
  assert.deepEqual(ozet, {
    ad: "ornek-dilekce.txt", tur: "Dilekçe", birim: "İnsan Kaynakları",
    bant: "sari", ozet: "Yıllık izin talebi.",
  });
});

test("evrakOzeti HAM evrak metnini taşımaz (yalnız bilinen alanlar)", () => {
  const ozet = evrakOzeti({ name: "a.txt", result: { evrak_turu: "Şikâyet", metin: "TCKN 12345678901 ..." } });
  assert.equal(JSON.stringify(ozet).includes("12345678901"), false);
  assert.equal("metin" in ozet, false);
});

test("evrakOzeti uzun özeti bütçeye kırpar", () => {
  const ozet = evrakOzeti({ name: "a.txt", result: { ozet: "ç".repeat(2000) } });
  assert.equal(ozet.ozet.length, SINIR.ozet + 1);   // +1 = kırpma göstergesi (…)
  assert.ok(ozet.ozet.endsWith("…"));
});

test("evrakOzeti boş alanları atar, hiç alan yoksa null döner", () => {
  assert.equal(evrakOzeti({ result: {} }), null);
  assert.equal(evrakOzeti(null), null);
});

test("listeOzeti adedi TAM verir ama başlıkları bütçeyle sınırlar", () => {
  const kayitlar = Array.from({ length: 25 }, (_, i) => ({ name: `evrak-${i}.txt` }));
  const ozet = listeOzeti(kayitlar);
  assert.equal(ozet.adet, 25);                    // sayı doğru — asistan "25 tane" diyebilmeli
  assert.equal(ozet.ilkler.length, SINIR.liste);  // ama hepsi prompt'a girmez
  assert.equal(ozet.ilkler[0], "evrak-0.txt");
});

test("listeOzeti boş/bozuk girdide null (gürültü göndermez)", () => {
  assert.equal(listeOzeti([]), null);
  assert.equal(listeOzeti(undefined), null);
});

test("ekranBaglamiOlustur görünüm + seçili + liste birleştirir", () => {
  const baglam = ekranBaglamiOlustur({
    gorunum: "gelen",
    secili: { name: "a.txt", result: { evrak_turu: "Dilekçe" } },
    liste: [{ name: "a.txt" }, { name: "b.txt" }],
  });
  assert.equal(baglam.gorunum, "Gelen evrak kuyruğu");
  assert.equal(baglam.secili.tur, "Dilekçe");
  assert.equal(baglam.liste.adet, 2);
});

test("ekranBaglamiOlustur undefined alan BIRAKMAZ (JSON gövdesi temiz)", () => {
  const baglam = ekranBaglamiOlustur({ gorunum: "panel" });
  assert.equal("notlar" in baglam, false);
  assert.equal(baglam.secili, null);
});

test("ekranBaglamiOlustur hiçbir bilgi yoksa null döner", () => {
  assert.equal(ekranBaglamiOlustur({}), null);
  assert.equal(ekranBaglamiOlustur(), null);
});
