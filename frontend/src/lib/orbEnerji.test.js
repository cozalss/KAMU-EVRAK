import test from "node:test";
import assert from "node:assert/strict";
import {
  orbDurumu, enerjiSonraki, yeniBitenler, yutmaKarari, yutmaTempo, kuyrugaEkle,
  ORB_TABAN, ORB_VURUS, ORB_TAU, BEKLE_TABAN, BEKLE_TAVAN, KUYRUK_AZAMI,
} from "./orbEnerji.js";

/* ——— orbDurumu: pipeline gerçeği → orb durum dili ———
   Dört durum lib/orbCizim.DURUM_TABAN anahtarlarıdır; orb'un taban parlaklığı/hâlesi
   bunlardan seçilir. Eşleme ANLAMA dayanır: Görev 1 = anlama (düşünme halkaları),
   Görev 2 = üretim (en parlak), adımlar arası = uyanık ama sessiz, boşta = sakin. */

test("koşum yokken orb sakin durumdadır", () => {
  assert.equal(orbDurumu({ kosumda: false, aktifGorev: null, hataVar: false }), "hazir");
});

test("Görev 1 adımı çalışırken orb düşünür", () => {
  assert.equal(orbDurumu({ kosumda: true, aktifGorev: 1, hataVar: false }), "dusunuyor");
});

test("Görev 2 adımı çalışırken orb üretim durumundadır", () => {
  assert.equal(orbDurumu({ kosumda: true, aktifGorev: 2, hataVar: false }), "konusuyor");
});

test("koşum sürerken aktif adım yoksa orb uyanık kalır", () => {
  // Adımlar arası boşluk: sunum temposu bir sonraki adımı açana dek aktif node yoktur.
  // "hazir"e düşmek orb'u koşum ortasında söndürürdü — uyanık ara durum gerekli.
  assert.equal(orbDurumu({ kosumda: true, aktifGorev: null, hataVar: false }), "dinliyor");
});

test("hata varsa orb sakinleşir — aktif görev bilgisi olsa bile", () => {
  assert.equal(orbDurumu({ kosumda: false, aktifGorev: 2, hataVar: true }), "hazir");
});

test("bilinmeyen görev numarası anlama fazı gibi ele alınır", () => {
  assert.equal(orbDurumu({ kosumda: true, aktifGorev: 7, hataVar: false }), "dusunuyor");
});

/* ——— enerjiSonraki: adım tamamlanmalarından sürülen enerji zarfı ———
   Sesli sahnede `seviye` mikrofon genliğidir; burada karşılığı PIPELINE canlılığıdır.
   Her tamamlanan adım bir vuruş enjekte eder, enerji üstel olarak söner. */

test("vuruş yokken ve dt sıfırken enerji değişmez", () => {
  assert.equal(enerjiSonraki(0.5, 0, { kosumda: true }), 0.5);
});

test("koşum bittiyse enerji zamanla sıfıra söner", () => {
  const sonuc = enerjiSonraki(0.9, ORB_TAU * 12, { kosumda: false });
  assert.ok(sonuc < 0.001, `beklenen ~0, gelen ${sonuc}`);
});

test("koşum sürerken enerji taban seviyenin altına inmez", () => {
  // Uzun bir LLM adımı boyunca hiç tamamlanma gelmez; orb düz çizgiye düşmemeli.
  const sonuc = enerjiSonraki(0.9, ORB_TAU * 12, { kosumda: true });
  assert.equal(sonuc, ORB_TABAN);
});

test("tamamlanan adım enerjiye ölçülü bir vuruş ekler", () => {
  const oncesi = enerjiSonraki(0.2, 16, { kosumda: true });
  const sonrasi = enerjiSonraki(0.2, 16, { kosumda: true, vurus: 1 });
  assert.ok(sonrasi - oncesi > 0.4, `vuruş farkı zayıf: ${sonrasi - oncesi}`);
  assert.ok(Math.abs(sonrasi - oncesi - ORB_VURUS) < 1e-9);
});

test("art arda vuruşlar enerjiyi 1'in üstüne taşımaz", () => {
  // Hızlı koşumda üç adım aynı karede bitebilir; orbKare 0..1 bekler.
  assert.equal(enerjiSonraki(0.95, 0, { kosumda: true, vurus: 3 }), 1);
});

test("negatif dt enerjiyi büyütmez (sekme geri gelince saat sıçraması)", () => {
  assert.equal(enerjiSonraki(0.4, -5000, { kosumda: true }), 0.4);
});

/* ——— yeniBitenler: hangi adım BU karede yutulacak ——— */

test("yalnız yeni tamamlanan adımlar yutulur", () => {
  const adimlar = [
    { id: "oku", label: "Oku (OCR)", status: "done" },
    { id: "siniflandir", label: "Sınıflandır", status: "done" },
    { id: "cikar", label: "Bilgi çıkar", status: "active" },
  ];
  const yeni = yeniBitenler(new Set(["oku"]), adimlar);
  assert.deepEqual(yeni.map((a) => a.id), ["siniflandir"]);
});

test("tamamlanan adım yoksa boş liste döner", () => {
  const adimlar = [{ id: "oku", label: "Oku (OCR)", status: "active" }];
  assert.deepEqual(yeniBitenler(new Set(), adimlar), []);
});

test("hepsi görülmüşse tekrar yutulmaz (yeniden render güvenliği)", () => {
  const adimlar = [{ id: "oku", label: "Oku (OCR)", status: "done" }];
  assert.deepEqual(yeniBitenler(new Set(["oku"]), adimlar), []);
});

/* ——— yutmaKarari: "yeni koşum mu, yoksa sunum temposunun geri düşüşü mü" ———
   Bu ayrım ölçülerek bulundu (inceleme bulgusu, 7 Ağu). Naif kimlik-tabanlı kontrol —
   "daha önce yutulmuş bir adım artık done değilse koşum baştan başlamıştır" — PARALEL
   dallarda yanlış ateşliyordu. Nedeni useSahneTempo'nun açma kuralı: tamamlananlar DİZİ
   SIRASINA göre açılır, yani sıra dışı biten bir adım, kendinden ÖNCEKİ adım da bitince
   açılma hakkını ona devredip bir kare "pending"e geri düşer. Koşum sağlamdır.
   Doğru sinyal KİMLİK değil SAYIDIR: tamamlanan sayısı yalnız gerçek yeniden başlatmada düşer. */

test("paralel dalda sıra dışı tamamlanma yeniden başlatma sanılmaz", () => {
  // t0: cikar (2. sırada) önce bitti ve açıldı; siniflandir henüz çalışıyor.
  const t0 = [
    { id: "siniflandir", label: "Sınıflandır", status: "pending" },
    { id: "cikar", label: "Bilgi çıkar", status: "done" },
  ];
  const a = yutmaKarari(new Set(), 0, t0);
  assert.equal(a.sifirla, false);
  assert.deepEqual(a.yeni.map((x) => x.id), ["cikar"]);
  assert.equal(a.bitenSayi, 1);

  // t1: siniflandir de bitti. Tempo henüz tek adım açıyor → açılma hakkı sıradaki öne
  // geçer, cikar bir kare "pending" görünür. Defter SİLİNMEMELİ.
  const t1 = [
    { id: "siniflandir", label: "Sınıflandır", status: "done" },
    { id: "cikar", label: "Bilgi çıkar", status: "pending" },
  ];
  const b = yutmaKarari(new Set(["cikar"]), a.bitenSayi, t1);
  assert.equal(b.sifirla, false, "geçici geri düşüş yeniden başlatma sayılmamalı");
  assert.deepEqual(b.yeni.map((x) => x.id), ["siniflandir"]);

  // t2: tempo yetişti, ikisi de açık. Hiçbiri İKİNCİ KEZ yutulmamalı.
  const t2 = [
    { id: "siniflandir", label: "Sınıflandır", status: "done" },
    { id: "cikar", label: "Bilgi çıkar", status: "done" },
  ];
  const c = yutmaKarari(new Set(["cikar", "siniflandir"]), b.bitenSayi, t2);
  assert.equal(c.sifirla, false);
  assert.deepEqual(c.yeni, []);
});

test("gerçek yeni koşum defteri siler ve o karede hiçbir şey yutulmaz", () => {
  const defter = new Set(["oku", "siniflandir"]);
  const yeniKosum = [
    { id: "oku", label: "Oku (OCR)", status: "pending" },
    { id: "siniflandir", label: "Sınıflandır", status: "pending" },
  ];
  const k = yutmaKarari(defter, 2, yeniKosum);
  assert.equal(k.sifirla, true);
  assert.deepEqual(k.yeni, []);
  assert.equal(k.bitenSayi, 0);
});

/* ——— yutmaTempo: okunabilirlik tabanı pazarlık konusu değil ———
   Kullanıcı bulgusu (7 Ağu): ilk sürümde etiket okunmadan geçiyordu. Kural: sıkışma ne
   kadar artarsa artsın, bir etiketin SABİT durduğu süre BEKLE_TABAN'ın altına inemez. */

test("kuyruk boşken en okunaklı tempo kullanılır", () => {
  const t = yutmaTempo(0);
  assert.equal(t.bekle, BEKLE_TAVAN);
  assert.equal(t.hiz, 1);
});

test("kuyruk uzadıkça jest hızlanır", () => {
  const bos = yutmaTempo(0);
  const sikisik = yutmaTempo(3);
  assert.ok(sikisik.bekle < bos.bekle, "bekleme kısalmalı");
  assert.ok(sikisik.giris < bos.giris && sikisik.cek < bos.cek, "giriş ve çekiliş de kısalmalı");
});

test("en sıkışık durumda bile bekleme tabanı korunur (okunabilirlik güvencesi)", () => {
  for (const n of [4, 8, 15, 40]) {
    assert.ok(yutmaTempo(n).bekle >= BEKLE_TABAN, `kuyruk ${n}: bekleme tabanın altına indi`);
  }
});

test("hız üst sınırı vardır — jest hiç görünmeyecek kadar kısalmaz", () => {
  const t = yutmaTempo(1000);
  assert.ok(t.hiz <= 3.2);
  assert.ok(t.giris > 0 && t.cek > 0, "vuruşlar sıfıra çökmemeli");
});

/* ——— kuyrugaEkle: taşmada GÜNCELLİK korunur, eskisi atılır ———
   Bu bir "eksik gösterme" hatası DEĞİL, bilinçli takas: orb koşumun gerisine düşerse
   yanlış yeri işaret eder. Test niyeti çiviler ki ileride "adım kayboluyor" diye
   sınır kaldırılmasın. */

test("kuyruk üst sınırı aşılınca EN ESKİ bekleyen atılır", () => {
  const mevcut = [{ anahtar: "a" }, { anahtar: "b" }];
  const sonuc = kuyrugaEkle(mevcut, [{ anahtar: "c" }, { anahtar: "d" }]);
  assert.equal(sonuc.length, KUYRUK_AZAMI);
  assert.deepEqual(sonuc.map((x) => x.anahtar), ["b", "c", "d"], "en yeniler tutulmalı");
});

test("sınırın altında hiçbir şey atılmaz", () => {
  const sonuc = kuyrugaEkle([{ anahtar: "a" }], [{ anahtar: "b" }]);
  assert.deepEqual(sonuc.map((x) => x.anahtar), ["a", "b"]);
});

test("kuyrugaEkle girdiyi değiştirmez (immutability)", () => {
  const mevcut = [{ anahtar: "a" }];
  kuyrugaEkle(mevcut, [{ anahtar: "b" }, { anahtar: "c" }, { anahtar: "d" }]);
  assert.deepEqual(mevcut.map((x) => x.anahtar), ["a"]);
});

test("bozuk kuyruk uzunluğu en okunaklı tempoya düşer", () => {
  assert.equal(yutmaTempo(-3).bekle, BEKLE_TAVAN);
  assert.equal(yutmaTempo(undefined).bekle, BEKLE_TAVAN);
});

test("tamamlanan sayısı artarken defter korunur", () => {
  const adimlar = [
    { id: "oku", label: "Oku (OCR)", status: "done" },
    { id: "siniflandir", label: "Sınıflandır", status: "done" },
  ];
  const k = yutmaKarari(new Set(["oku"]), 1, adimlar);
  assert.equal(k.sifirla, false);
  assert.deepEqual(k.yeni.map((x) => x.id), ["siniflandir"]);
  assert.equal(k.bitenSayi, 2);
});
