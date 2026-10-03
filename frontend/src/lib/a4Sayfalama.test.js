import test from "node:test";
import assert from "node:assert/strict";
import {
  A4_GEN_MM,
  A4_GEN_PX,
  A4_ORAN,
  A4_YUK_MM,
  A4_YUK_PX,
  ASGARI_OLCEK,
  AZAMI_OLCEK,
  KAGIT_ASGARI_GEN,
  KENAR_MM,
  OLCEK_ESIK,
  YAZI_ALANI_YUK_PX,
  kagitSutunGenisligi,
  genislikOlcegi,
  olcekHesapla,
  olcekOynadi,
  olcumleriTopla,
  sayfalaraBol,
} from "./a4Sayfalama.js";

/* Satır üretici: her satır bir öncekinin altında, sabit yükseklikte. */
const satirlar = (adet, yukseklik) =>
  Array.from({ length: adet }, (_, i) => ({ ust: i * yukseklik, yukseklik }));

test("sayfa A4 oranında (210x297) — kısa kenar / uzun kenar = 1/√2", () => {
  assert.equal(A4_GEN_MM, 210);
  assert.equal(A4_YUK_MM, 297);
  const oran = A4_YUK_PX / A4_GEN_PX;
  assert.ok(Math.abs(oran - Math.SQRT2) < 0.005, `oran ${oran}, beklenen ~1.414`);
});

test("yazı alanı yüksekliği kenar boşluklarını düşer (Yönetmelik m.8/1: 1,5 cm)", () => {
  assert.equal(KENAR_MM, 15);
  const beklenen = (A4_YUK_MM - 2 * KENAR_MM) * (96 / 25.4);
  assert.ok(Math.abs(YAZI_ALANI_YUK_PX - beklenen) < 0.001);
});

test("sayfaya sığan metin tek sayfada kalır", () => {
  const sonuc = sayfalaraBol(satirlar(10, 20), 500);
  assert.deepEqual(sonuc, [[0, 10]]);
});

test("taşan metin ikinci sayfaya aktarılır", () => {
  // 500px sayfaya 20px'lik 25 satır sığar; 26. satır taşar.
  const sonuc = sayfalaraBol(satirlar(30, 20), 500);
  assert.equal(sonuc.length, 2);
  assert.deepEqual(sonuc[0], [0, 25]);
  assert.deepEqual(sonuc[1], [25, 30]);
});

test("sayfa sınırları boşluk bırakmadan birbirini izler", () => {
  const sonuc = sayfalaraBol(satirlar(120, 20), 500);
  assert.ok(sonuc.length >= 4);
  sonuc.reduce((oncekiSon, [bas, son]) => {
    assert.equal(bas, oncekiSon, "sayfa aralıkları bitişik olmalı");
    assert.ok(son > bas, "boş sayfa üretilmemeli");
    return son;
  }, 0);
  assert.equal(sonuc[sonuc.length - 1][1], 120, "son satır kaybolmamalı");
});

test("sayfadan uzun tek satır kendi sayfasında kalır (sonsuz döngü olmaz)", () => {
  const sonuc = sayfalaraBol([{ ust: 0, yukseklik: 900 }], 500);
  assert.deepEqual(sonuc, [[0, 1]]);
});

test("boş girdi tek boş sayfa döner", () => {
  assert.deepEqual(sayfalaraBol([]), [[0, 0]]);
  assert.deepEqual(sayfalaraBol(null), [[0, 0]]);
});

test("olcumleriTopla DOM yokken çökmez", () => {
  assert.deepEqual(olcumleriTopla(null), []);
  assert.deepEqual(olcumleriTopla({ children: [] }), []);
});

/* ── olcekHesapla ────────────────────────────────────────────────────────────────
   Bu blok, kağıt sütununun tasarım sözleşmesini KANITLAR: sütun A4 oranında olduğunda
   kağıt onu birebir doldurur (kenarda ölü beyaz alan kalmaz) ve ölçek hiçbir koşulda
   sıfıra ya da absürt değerlere kaçmaz. Ölçek eskiden bileşen içinde satır-içi
   hesaplanıyordu; buraya taşındı ki tarayıcı açmadan da doğrulanabilsin. */

test("A4 oranındaki kutuda kağıt kutuyu BİREBİR doldurur (iki eksen aynı ölçeği verir)", () => {
  // Sütun yüksekliği verilip genişliği A4_ORAN ile türetildiğinde kağıt tam oturmalı.
  const yuk = 650;
  const gen = yuk * A4_ORAN;
  const olcek = olcekHesapla(gen, yuk);
  // Ölçeklenmiş sayfa, kutunun HEM genişliğini HEM yüksekliğini tüketir.
  assert.ok(Math.abs(A4_GEN_PX * olcek - gen) < 0.5, "genişlik birebir dolmalı");
  assert.ok(Math.abs(A4_YUK_PX * olcek - yuk) < 0.5, "yükseklik birebir dolmalı");
});

test("geniş ama kısa kutuda YÜKSEKLİK karar verir — sayfa dikeyde taşmaz", () => {
  const yuk = 500;
  const olcek = olcekHesapla(5000, yuk);
  assert.ok(A4_YUK_PX * olcek <= yuk + 0.5, "ölçekli sayfa kutu yüksekliğini aşmamalı");
});

test("dar ama uzun kutuda GENİŞLİK karar verir — sayfa yatayda taşmaz", () => {
  const gen = 600;   // ASGARI kelepçesinin ÜSTÜNDE kalan bir genişlik (bkz. sonraki test)
  const olcek = olcekHesapla(gen, 5000);
  assert.ok(A4_GEN_PX * olcek <= gen + 0.5, "ölçekli sayfa kutu genişliğini aşmamalı");
});

test("ASGARI kelepçesi altında sayfa kutudan BİLEREK taşar — okunurluk kaydırmaya tercih edilir", () => {
  // Tasarım kararı: çok dar kapta sayfayı küçültmeye devam etmek yazıyı okunamaz yapardı.
  // Bu noktadan sonra ölçek sabitlenir ve taşma kaydırma ile karşılanır. Sözleşme budur;
  // "taşma = hata" varsayan bir düzeltme bu testi kırar ve niyeti hatırlatır.
  const gen = 300;
  const olcek = olcekHesapla(gen, 5000);
  assert.equal(olcek, ASGARI_OLCEK);
  assert.ok(A4_GEN_PX * olcek > gen, "ASGARI'de sayfa kutudan geniştir (kaydırma devreye girer)");
});

test("yükseklik ölçülemediğinde (0) yalnız genişlik karar verir — ölçek sıfıra çökmez", () => {
  // Henüz yerleşmemiş kapta yükseklik 0 gelir; sayfa bir kare görünmez olmamalı.
  const gen = A4_GEN_PX / 2;
  assert.ok(Math.abs(olcekHesapla(gen, 0) - 0.5) < 1e-9);
  assert.ok(olcekHesapla(gen, undefined) > 0);
  assert.ok(olcekHesapla(gen, NaN) > 0);
});

test("ölçek ASGARI ve AZAMI sınırlarına kelepçelenir", () => {
  assert.equal(olcekHesapla(10, 10), ASGARI_OLCEK, "çok küçük kutu ASGARI'nin altına inmez");
  assert.equal(olcekHesapla(100000, 100000), AZAMI_OLCEK, "çok büyük kutu AZAMI'yi aşmaz");
});

test("geçersiz genişlikte çökmez, ASGARI döner", () => {
  assert.equal(olcekHesapla(0, 500), ASGARI_OLCEK);
  assert.equal(olcekHesapla(-40, 500), ASGARI_OLCEK);
  assert.equal(olcekHesapla(NaN, 500), ASGARI_OLCEK);
  assert.equal(olcekHesapla(undefined, undefined), ASGARI_OLCEK);
});

/* ── kagitSutunGenisligi ─────────────────────────────────────────────────────────
   Sütun genişliği ile sayfa ölçeği AYNI türetmeden gelir; bu blok ikisinin birlikte
   tuttuğunu kanıtlar: kenarda ölü alan yok VE sayfa dikeyde taşmıyor (kaydırma yok).
   Sayfayı kaba sığandan büyük çizen bir "taşma payı" denenip kullanıcı kararıyla geri
   alındı (2026-08-02) — aşağıdaki taşma kontrolü o kararın bekçisidir. */

test("yer varsa sütun tam sayfa genişliğinde olur ve sayfa sütunu BİREBİR doldurur", () => {
  const yuk = 1144, bol = 5000;                       // geniş monitör: kalan bol
  const gen = kagitSutunGenisligi(yuk, bol);
  assert.ok(Math.abs(gen - yuk * A4_ORAN) <= 1, "sütun tam sayfa genişliğinde olmalı");
  const olcek = olcekHesapla(gen, yuk);
  assert.ok(Math.abs(A4_GEN_PX * olcek - gen) < 1, "sayfa sütun genişliğini birebir doldurmalı");
  assert.ok(A4_YUK_PX * olcek <= yuk, "sayfa dikeyde taşmamalı — kaydırma doğmaz");
});

test("türetilen sütunda sayfa dikeyde ASLA taşmaz (yukarı yuvarlama çubuğu doğurmaz)", () => {
  // Math.floor'un bekçisi: kesirli yüksekliklerde bile taşma olmamalı.
  for (const yuk of [604, 605.4, 943.7, 1144, 1189.2]) {
    const gen = kagitSutunGenisligi(yuk, 5000);
    const olcek = olcekHesapla(gen, yuk);
    assert.ok(A4_YUK_PX * olcek <= yuk, `yuk=${yuk}: sayfa (${A4_YUK_PX * olcek}) sütunu aşmamalı`);
  }
});

test("dar pencerede sütun kalana kelepçelenir, ASGARI'nin altına inmez", () => {
  assert.equal(kagitSutunGenisligi(900, 300), 300, "kalan tam sayfadan darsa kalan kazanır");
  assert.equal(kagitSutunGenisligi(900, 50), KAGIT_ASGARI_GEN, "asgari genişliğin altına inilmez");
});

test("ölçüm yoksa null döner — çağıran oransal yedeğine düşer, sıçrama olmaz", () => {
  assert.equal(kagitSutunGenisligi(0, 900), null);
  assert.equal(kagitSutunGenisligi(null, 900), null);
  assert.equal(kagitSutunGenisligi(900, undefined), null);
});

test("A4_ORAN gerçek A4 en/boy oranıdır (1/√2)", () => {
  assert.ok(Math.abs(A4_ORAN - A4_GEN_MM / A4_YUK_MM) < 1e-12);
  assert.ok(Math.abs(A4_ORAN - 1 / Math.SQRT2) < 0.002);
});

/* ── olcekOynadi — ölçüm→render→ölçüm döngüsünün bekçisi ────────────────────────────────
   A4Belge ölçeği HER commit'te yeniden ölçer (mount'ta bayat ölçekle boyama hatasının
   düzeltmesi, 2026-08-12). Ölçüm kendi çıktısına geri beslendiği için, değişmeyen sonucun
   state'e yazılmaması sadece bir optimizasyon değil DOĞRULUK koşuludur: yazılırsa React
   sonsuz yeniden-render'a girer. */

test("aynı ölçek yeniden yazılmaz — döngü kapanır", () => {
  assert.equal(olcekOynadi(0.8567, 0.8567), false);
});

test("eşiğin altındaki kayan nokta gürültüsü yok sayılır", () => {
  const taban = 0.8567;
  assert.equal(olcekOynadi(taban, taban + OLCEK_ESIK / 2), false, "yarım eşik yazılmamalı");
  assert.equal(olcekOynadi(taban, taban - OLCEK_ESIK / 3), false, "ters yönde de yazılmamalı");
});

test("eşik VEYA üstündeki gerçek değişiklik yazılır (pencere yeniden boyutlandırma)", () => {
  const taban = 0.8567;
  assert.equal(olcekOynadi(taban, taban + OLCEK_ESIK), true, "tam eşik değişikliktir");
  assert.equal(olcekOynadi(taban, 1.1125), true, "yedek→ölçülmüş sıçraması yazılmalı");
  assert.equal(olcekOynadi(1.1125, 0.8567), true, "mount düzeltmesi yazılmalı");
});

test("eşik yarım pikselden küçük farkı eler ama 1px'lik farkı ELEMEZ", () => {
  // Eşik piksel cinsinden anlamlı olmalı: A4 genişliğinde 1px'lik değişim GÖRÜNÜR,
  // yarım pikselinki görünmez. Eşik büyütülürse gerçek yeniden boyutlandırma yutulur.
  const taban = 1;
  assert.equal(olcekOynadi(taban, (A4_GEN_PX + 1) / A4_GEN_PX), true, "1px yazılmalı");
  assert.equal(olcekOynadi(taban, (A4_GEN_PX + 0.25) / A4_GEN_PX), false, "0,25px yazılmamalı");
});

test("ilk ölçüm daima yazılır; ölçülemeyen değer state'i bozmaz", () => {
  assert.equal(olcekOynadi(undefined, 0.9), true, "ilk ölçüm yazılır");
  assert.equal(olcekOynadi(NaN, 0.9), true);
  assert.equal(olcekOynadi(0.9, NaN), false, "NaN state'i ezmemeli");
  assert.equal(olcekOynadi(0.9, undefined), false);
});

/* ── genislikOlcegi ── sigdir="genislik" kipinin sözleşmesi: sayfa kabın GENİŞLİĞİNİ ASLA
   aşmaz. Bu kipte kabın yatay kaydırması yoktur (sonuç alanı, alt-taslak kartı); ASGARI
   tabanı burada 390px telefonda sayfayı 27px ekran dışına itiyordu (TUR 3 ölçümü). Okumak
   için kâğıda dokunulur → A4 büyütme modalı. */
test("genislikOlcegi: dar kapta ASGARI'ye kelepçelenmez, kabı asla taşırmaz", () => {
  const gen = 284;   // 390px telefonda taslak sahnesinin iç genişliği
  const olcek = genislikOlcegi(gen);
  assert.ok(A4_GEN_PX * olcek <= gen + 0.01, "sayfa kap genişliğini aşmamalı");
  assert.ok(olcek < ASGARI_OLCEK);
});

test("genislikOlcegi: geniş kapta AZAMI'yi aşmaz, geçersiz girdide çökmez", () => {
  assert.equal(genislikOlcegi(100000), AZAMI_OLCEK);
  assert.ok(Math.abs(genislikOlcegi(A4_GEN_PX / 2) - 0.5) < 1e-9);
  assert.equal(genislikOlcegi(0), ASGARI_OLCEK);
  assert.equal(genislikOlcegi(NaN), ASGARI_OLCEK);
});
