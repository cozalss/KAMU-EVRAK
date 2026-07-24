/* sesKuyrugu testleri — `node --test src/lib/sesKuyrugu.test.js`.
   cumleAyir: akan LLM metnini konuşulabilir cümlelere böler (kısaltma/sayı tuzakları dahil).
   sesKuyruguOlustur: getir↔çal boru hattı — N çalarken N+1 getirilir, sıra korunur, iptal keser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cumleAyir, sesKuyruguOlustur } from "./sesKuyrugu.js";

// --- cumleAyir ---------------------------------------------------------------

test("cumleAyir: tam cümleyi ayırır, yarım kalanı tamponda bırakır", () => {
  const { cumleler, kalan } = cumleAyir(
    "Elif Doğan'ın izin dilekçesi sarı bantta görünüyor. İletişim adresi ala", { minUzunluk: 20 });
  assert.deepEqual(cumleler, ["Elif Doğan'ın izin dilekçesi sarı bantta görünüyor."]);
  assert.equal(kalan, "İletişim adresi ala");
});

test("cumleAyir: minUzunluk altındaki parçayı ERKEN bölmez (mikro TTS isteği olmasın)", () => {
  const { cumleler, kalan } = cumleAyir("Tabii. Dilekçeyi şimdi inceliyorum ve", { minUzunluk: 40 });
  assert.deepEqual(cumleler, []);
  assert.equal(kalan, "Tabii. Dilekçeyi şimdi inceliyorum ve");
});

test("cumleAyir: mevzuat numarasındaki noktada bölmez (3071 sayılı Kanun'un 7. maddesi)", () => {
  const { cumleler } = cumleAyir(
    "Bu talep 3071 sayılı Kanun'un 7. maddesi kapsamındadır ve süre otuz gündür. Devamı", {});
  assert.equal(cumleler.length, 1);
  assert.match(cumleler[0], /7\. maddesi/);
});

test("cumleAyir: kısaltmadan sonra bölmez (T.C. / vb. / bkz.)", () => {
  const { cumleler } = cumleAyir(
    "Yazı T.C. Örnekşehir Belediye Başkanlığı antetiyle çıkar, ekleri vb. kontrol edilir. Son", {});
  assert.equal(cumleler.length, 1);
  assert.match(cumleler[0], /T\.C\. Örnekşehir/);
});

test("cumleAyir: tarihteki noktalarda bölmez (14.07.2026)", () => {
  const { cumleler, kalan } = cumleAyir("Dilekçe 14.07.2026 tarihinde kaydedilmiş görünüyor.", {});
  assert.deepEqual(cumleler, []);          // cümle sonu yok (nokta metnin en sonunda, boşluk yok)
  assert.match(kalan, /14\.07\.2026/);
});

test("cumleAyir: soru ve ünlem de cümle sonudur", () => {
  const { cumleler, kalan } = cumleAyir(
    "Taslağı sizin adınıza hazırlamamı ister misiniz? Hemen başlayabilirim.", { minUzunluk: 10 });
  // Son cümle henüz "kapanmadı" (ardından boşluk yok) → akış sürerken tamponda bekler.
  assert.deepEqual(cumleler, ["Taslağı sizin adınıza hazırlamamı ister misiniz?"]);
  assert.equal(kalan, "Hemen başlayabilirim.");
});

test("cumleAyir: akış bitince (zorla) son cümle de konuşulur", () => {
  const { cumleler, kalan } = cumleAyir(
    "Taslağı sizin adınıza hazırlamamı ister misiniz? Hemen başlayabilirim.",
    { minUzunluk: 10, zorla: true });
  assert.equal(cumleler.length, 2);
  assert.equal(kalan, "");
});

test("cumleAyir: zorla=true kalanı da cümle yapar (akış bitti)", () => {
  const { cumleler, kalan } = cumleAyir("Kısa kapanış", { minUzunluk: 40, zorla: true });
  assert.deepEqual(cumleler, ["Kısa kapanış"]);
  assert.equal(kalan, "");
});

test("cumleAyir: boş/boşluk girdi güvenli", () => {
  assert.deepEqual(cumleAyir("", {}), { cumleler: [], kalan: "" });
  assert.deepEqual(cumleAyir("   ", { zorla: true }), { cumleler: [], kalan: "" });
});

// --- sesKuyruguOlustur -------------------------------------------------------

/** Sırayı ve eşzamanlılığı gözlemleyen sahte getir/çal çifti. */
function sahneKur({ sesYok = false } = {}) {
  const olaylar = [];
  let aktifGetirme = 0, enFazlaEsZamanli = 0;
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    olaylar,
    enFazla: () => enFazlaEsZamanli,
    sesGetir: async (metin) => {
      aktifGetirme += 1;
      enFazlaEsZamanli = Math.max(enFazlaEsZamanli, aktifGetirme);
      olaylar.push(`getir:${metin}`);
      await bekle(5);
      aktifGetirme -= 1;
      return sesYok ? null : { metin };
    },
    oynat: async (blob) => {
      olaylar.push(`cal:${blob.metin}`);
      await bekle(5);
      olaylar.push(`bitti:${blob.metin}`);
    },
  };
}

test("sesKuyrugu: parçaları EKLENDİĞİ sırayla çalar", async () => {
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir"); k.ekle("iki"); k.ekle("üç");
  await k.bitir();
  assert.deepEqual(s.olaylar.filter((o) => o.startsWith("cal:")),
    ["cal:bir", "cal:iki", "cal:üç"]);
});

test("sesKuyrugu: sonraki parça öncekini ÇALARKEN getirilir (asıl gecikme kazancı)", async () => {
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir"); k.ekle("iki");
  await k.bitir();
  // "iki"nin getirilmesi, "bir" çalmaya başladıktan SONRA bitmiş olmalı değil —
  // önemli olan: getir:iki, bitti:bir'den ÖNCE gelmeli (örtüşme var).
  assert.ok(s.olaylar.indexOf("getir:iki") < s.olaylar.indexOf("bitti:bir"),
    `örtüşme yok: ${s.olaylar.join(" | ")}`);
});

test("sesKuyrugu: getirmeler SIRALI — istek patlaması yok (rate-limit koruması)", async () => {
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  ["a", "b", "c", "d"].forEach(k.ekle);
  await k.bitir();
  assert.equal(s.enFazla(), 1);
});

test("sesKuyrugu: ilk ses çalmaya başlayınca onIlkSes BİR KEZ tetiklenir", async () => {
  const s = sahneKur();
  let sayac = 0;
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat, onIlkSes: () => { sayac += 1; } });
  k.ekle("bir"); k.ekle("iki");
  await k.bitir();
  assert.equal(sayac, 1);
});

test("sesKuyrugu: hiç ses çalmadıysa bitir().caldi false (çağıran metne düşer)", async () => {
  const s = sahneKur({ sesYok: true });
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir");
  assert.deepEqual(await k.bitir(), { caldi: false, iptal: false });
  assert.deepEqual(s.olaylar.filter((o) => o.startsWith("cal:")), []);
});

test("sesKuyrugu: ses çaldıysa bitir().caldi true", async () => {
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir");
  assert.deepEqual(await k.bitir(), { caldi: true, iptal: false });
});

test("sesKuyrugu: iptal (barge-in) sonrası yeni parça ÇALINMAZ", async () => {
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir");
  k.iptal();
  k.ekle("iki");
  await k.bitir();
  assert.deepEqual(s.olaylar.filter((o) => o.startsWith("cal:")), []);
});

test("sesKuyrugu: iptal edilen kuyruk bitir().iptal=true ile AYIRT EDİLİR", async () => {
  // Kritik: çağıran, 'normal bitti' ile 'kesildi'yi ayıramazsa barge-in'den sonra turu
  // ikinci kez ilerletir (dinlemeyi yeniden başlatıp kullanıcının kesme sözünü yer).
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  k.ekle("bir");
  await new Promise((r) => setTimeout(r, 8));   // çalma başlasın
  k.iptal();
  const sonuc = await k.bitir();
  assert.equal(sonuc.iptal, true);
});

test("sesKuyrugu: iptal, ÇALAN sesi de durdurur (onIptal)", async () => {
  // Yalnız bayrak yetmez: hata/kesme yolunda asistan konuşmaya devam ederse sesi
  // mikrofona gider ve kendi cevabını transkript eder.
  let durduruldu = 0;
  const s = sahneKur();
  const k = sesKuyruguOlustur({
    sesGetir: s.sesGetir, oynat: s.oynat, onIptal: () => { durduruldu += 1; },
  });
  k.ekle("bir");
  k.iptal();
  assert.equal(durduruldu, 1);
  k.iptal();                       // idempotent — ikinci kez durdurma çağrılmaz
  assert.equal(durduruldu, 1);
});

test("sesKuyrugu: ön-getirme BİR parça ileri sınırlı (bellek + boşa TTS harcaması)", async () => {
  // N+1 çalmaya başlamadan N+2 getirilmemeli; aksi halde kullanıcı ilk cümlede kesse bile
  // tüm cümleler ücretli olarak seslendirilmiş olur.
  const s = sahneKur();
  const k = sesKuyruguOlustur({ sesGetir: s.sesGetir, oynat: s.oynat });
  ["a", "b", "c", "d"].forEach(k.ekle);
  await new Promise((r) => setTimeout(r, 8));   // a getirildi/çalmaya başladı
  const erken = s.olaylar.filter((o) => o.startsWith("getir:"));
  assert.ok(erken.length <= 2, `çok erken getirme: ${erken.join(" | ")}`);
  await k.bitir();
});

test("sesKuyrugu: bir parçanın getirme hatası döngüyü KİLİTLEMEZ, sonraki çalar", async () => {
  const olaylar = [];
  const k = sesKuyruguOlustur({
    sesGetir: async (m) => { if (m === "bir") throw new Error("ağ"); return { metin: m }; },
    oynat: async (b) => { olaylar.push(b.metin); },
  });
  k.ekle("bir"); k.ekle("iki");
  await k.bitir();
  assert.deepEqual(olaylar, ["iki"]);
});

test("sesKuyrugu: çalma hatası da döngüyü kilitlemez", async () => {
  const olaylar = [];
  const k = sesKuyruguOlustur({
    sesGetir: async (m) => ({ metin: m }),
    oynat: async (b) => { if (b.metin === "bir") throw new Error("decode"); olaylar.push(b.metin); },
  });
  k.ekle("bir"); k.ekle("iki");
  await k.bitir();
  assert.deepEqual(olaylar, ["iki"]);
});
