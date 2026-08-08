/* sesliKomut testleri — `node --test src/lib/sesliKomut.test.js`.
   En kritik iki sözleşme: SORU komut sayılmaz, BELİRSİZLİK'te evrak açılmaz. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { komutCoz, komutOnayi } from "./sesliKomut.js";

// Fikstür başlıkları GERÇEK örnek evrak adlarıyla hizalı tutulur (lib/sampleDocs.js) —
// eşleştirme algoritması bağımsız çalışsa da, var olmayan adlarla yazılmış bir test
// okuyanı yanıltıyor. "şikayet" iki başlıkta birden geçer: belirsizlik testi buna dayanır.
const BASLIKLAR = [
  "ornek-sikayet_gurultu.txt",
  "ornek-dilekce_aydinlatma.txt",
  "saglik_mud_sikayet.txt",
];

test("fiille görünüm komutu: 'gelen evrağı aç'", () => {
  assert.deepEqual(komutCoz("gelen evrağı aç"), { tur: "gorunum", gorunum: "gelen", ad: "Gelen evrak" });
});

test("fiilsiz, yalnız görünüm adı da komuttur: 'taslaklar'", () => {
  assert.equal(komutCoz("taslaklar").gorunum, "taslaklar");
});

test("dolgu sözcükleri komutu bozmaz: 'mevzuat ekranına geç lütfen'", () => {
  assert.equal(komutCoz("mevzuat ekranına geç lütfen").gorunum, "mevzuat");
});

test("kibar emir soru DEĞİLDİR: 'giden evrakı açar mısın'", () => {
  assert.equal(komutCoz("giden evrakı açar mısın").gorunum, "giden");
});

test("Türkçe İ/ı: 'İşlenen evrağa git' doğru katlanır", () => {
  assert.equal(komutCoz("İşlenen evrağa git").gorunum, "islenen");
});

test("SORU komut sayılmaz: 'gelen evrakta kaç tane var'", () => {
  assert.equal(komutCoz("gelen evrakta kaç tane var").tur, "yok");
});

test("SORU komut sayılmaz: 'taslaklarda ne var'", () => {
  assert.equal(komutCoz("taslaklarda ne var").tur, "yok");
});

test("SORU komut sayılmaz: 'panelde durum nedir'", () => {
  assert.equal(komutCoz("panelde durum nedir").tur, "yok");
});

test("'açıklama' fiil sanılmaz (serbest sonek tuzağı)", () => {
  assert.equal(komutCoz("bu evrakın açıklaması nedir").tur, "yok");
});

test("evrak açma: başlık parçalarıyla eşleşir", () => {
  assert.deepEqual(
    komutCoz("gürültü şikayetini aç", { basliklar: BASLIKLAR }),
    { tur: "evrak_ac", baslik: "ornek-sikayet_gurultu.txt" });
});

test("evrak açma: ayırt etmeyen sözcük (ornek/txt) tek başına eşleştirmez", () => {
  assert.equal(komutCoz("örnek txt aç", { basliklar: BASLIKLAR }).tur, "yok");
});

test("BELİRSİZLİK: iki başlık eşit skorluysa hiçbiri açılmaz", () => {
  // "şikayet" hem gürültü hem sağlık-müdürlüğü başlığında geçiyor → beraberlik.
  assert.equal(komutCoz("şikayeti aç", { basliklar: BASLIKLAR }).tur, "yok");
});

test("AYNI başlık iki kez listelenmişse belirsizlik SAYILMAZ (yoksa o evrak sesle hiç açılamaz)", () => {
  // Gerçek durum: aynı örnek evrak iki kez işlenmiş → taslak listesinde iki özdeş satır.
  const ikiz = ["ornek-cok_konulu.txt", "ornek-cok_konulu.txt", "saglik_mud_sikayet.txt"];
  assert.deepEqual(komutCoz("çok konulu olanı aç", { basliklar: ikiz }),
    { tur: "evrak_ac", baslik: "ornek-cok_konulu.txt" });
});

test("başlık listesi boşsa evrak komutu üretilmez", () => {
  assert.equal(komutCoz("sokak hayvanı şikayetini aç").tur, "yok");
});

test("boş/bozuk girdi güvenli", () => {
  assert.equal(komutCoz("").tur, "yok");
  assert.equal(komutCoz(undefined).tur, "yok");
});

test("görünüm komutu evrak eşleşmesinden ÖNCE gelir", () => {
  const k = komutCoz("taslakları aç", { basliklar: BASLIKLAR });
  assert.equal(k.tur, "gorunum");
  assert.equal(k.gorunum, "taslaklar");
});

test("komutOnayi GEÇMİŞ kipte — iş bitmişken 'açılıyor' demek yanlış bilgi", () => {
  assert.equal(komutOnayi({ tur: "gorunum", ad: "Gelen evrak" }), "Gelen evrak açıldı.");
  assert.equal(komutOnayi({ tur: "evrak_ac", baslik: "a.txt" }), "Açtım: a.txt");
  assert.equal(komutOnayi({ tur: "yok" }), "");
});
