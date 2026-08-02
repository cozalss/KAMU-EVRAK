/* orbCizim testleri — `node --test src/lib/orbCizim.test.js`.
   Sıvı orb kenarı geometrisi: kenarSapma deterministik, blobNoktalari amp=0'da daire,
   blobYolu geçerli kapalı SVG path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DURUM_TABAN, blobNoktalari, blobYolu, kenarSapma, orbKare } from "./orbCizim.js";
import { DURUM } from "./sesGorusme.js";

test("DURUM_TABAN, DURUM'un TÜM değerlerini kapsar (modüller arası dize sözleşmesi)", () => {
  // orbCizim, sesGorusme'yi BİLEREK import etmez (bağ kurmamak için) — anahtarlar düz dize.
  // Bu, sessiz bir kopmaya açık: DURUM'a yeni bir durum eklenir ya da bir değer yeniden
  // adlandırılırsa orbKare sessizce "hazir" tabanına düşer ve o durum ayırt edilemez olur.
  const beklenen = [...Object.values(DURUM)].sort();
  const gelen = Object.keys(DURUM_TABAN).sort();
  assert.deepEqual(gelen, beklenen);
});

test("kenarSapma: deterministik ve -1..1 aralığında", () => {
  assert.equal(kenarSapma(1.2, 3.4), kenarSapma(1.2, 3.4));   // aynı girdi → aynı çıktı
  for (let a = 0; a < 6.28; a += 0.5) {
    for (let t = 0; t < 10; t += 1.7) {
      const v = kenarSapma(a, t);
      assert.ok(v >= -1.0001 && v <= 1.0001, `sapma aralık dışı: ${v}`);
    }
  }
});

test("blobNoktalari: amp=0 → tüm noktalar tam yarıçapta (kusursuz daire)", () => {
  const pts = blobNoktalari(0, 0, 100, 10, 5, 0);
  assert.equal(pts.length, 10);
  for (const [x, y] of pts) {
    const d = Math.hypot(x, y);
    assert.ok(Math.abs(d - 100) < 1e-9, `daire değil: ${d}`);
  }
});

test("blobNoktalari: amp>0 → yarıçaplar [r-amp, r+amp] içinde dalgalanır", () => {
  const r = 120, amp = 20;
  const pts = blobNoktalari(200, 200, r, 10, 2, amp);
  let mini = Infinity, maxi = -Infinity;
  for (const [x, y] of pts) {
    const d = Math.hypot(x - 200, y - 200);
    mini = Math.min(mini, d); maxi = Math.max(maxi, d);
    assert.ok(d >= r - amp - 1e-6 && d <= r + amp + 1e-6, `sınır dışı: ${d}`);
  }
  assert.ok(maxi - mini > 1, "kenar hiç dalgalanmadı (amp etkisiz)");   // gerçekten organik
});

test("blobYolu: geçerli kapalı SVG path (M ile başlar, Z ile biter, Q içerir)", () => {
  const pts = blobNoktalari(150, 150, 100, 8, 1, 12);
  const d = blobYolu(pts);
  assert.ok(d.startsWith("M"), "M ile başlamalı");
  assert.ok(d.endsWith("Z"), "Z ile bitmeli");
  assert.ok(d.includes("Q"), "quadratic eğri içermeli");
});

test("blobYolu: <3 nokta → boş dize (güvenli)", () => {
  assert.equal(blobYolu([[0, 0], [1, 1]]), "");
  assert.equal(blobYolu([]), "");
});

test("kenarSapma: 5. harmonik n=10 örneklemesinde ÖLMEZ (aliasing regresyonu)", () => {
  // Eskiden noktalar n=10'da örnekleniyordu ve sin(5·(i/10)·2π) = sin(iπ) = 0 oluyordu:
  // gürültü enerjisinin %20'si rim boyunca ilerlemeyen bir terime çöküyordu. Örnekleme artık
  // 14 nokta; bu test kenarın gerçekten AÇIYA GÖRE değiştiğini (düz olmadığını) korur.
  const acilar = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2);
  const degerler = acilar.map((a) => kenarSapma(a, 2.5));
  const benzersiz = new Set(degerler.map((v) => v.toFixed(4)));
  assert.ok(benzersiz.size >= 12, `kenar açıya göre yeterince değişmiyor: ${benzersiz.size}/14`);
});

test("orbKare: sessizlikte bile dört durum AYRI görsel değer üretir", () => {
  // Kör denetim bulgusu: mikrofon susturulduğunda ya da TTS anahtarı yokken genlik 0 olur ve
  // eski sürümde Hazır ≡ Dinliyor ≡ Yanıtlıyor PİKSEL PİKSEL AYNIYDI. Ayrım artık durum
  // tabanlarından geliyor; bu testi kıran bir değişiklik o kusuru geri getirir.
  const p = { boyut: 210, seviye: 0, ts: 4200 };
  const imzalar = Object.keys(DURUM_TABAN).map((durum) => {
    const k = orbKare({ ...p, durum });
    return `${k.parlaklik.toFixed(3)}|${k.haloOpacity.toFixed(3)}`;
  });
  assert.equal(new Set(imzalar).size, 4, `durumlar ayrışmıyor: ${imzalar.join(" · ")}`);
});

test("orbKare: genlik arttıkça ölçek, hâle ve parlaklık MONOTON artar", () => {
  const p = { boyut: 210, ts: 4200, durum: "konusuyor" };
  const sessiz = orbKare({ ...p, seviye: 0 });
  const orta = orbKare({ ...p, seviye: 0.5 });
  const yuksek = orbKare({ ...p, seviye: 1 });
  assert.ok(sessiz.scale < orta.scale && orta.scale < yuksek.scale);
  assert.ok(sessiz.parlaklik < orta.parlaklik && orta.parlaklik < yuksek.parlaklik);
  assert.ok(sessiz.haloOpacity < orta.haloOpacity && orta.haloOpacity < yuksek.haloOpacity);
  assert.ok(yuksek.parlaklik <= 1 && yuksek.haloOpacity <= 1, "opaklık 1'i aşmamalı");
});

test("orbKare: reduced-motion → statik DAİRE kırpması (none DEĞİL)", () => {
  // clipPath "none" bırakılsaydı küre kutunun tamamını doldurup hareketli sürümden belirgin
  // biçimde büyük olurdu; gradyanın dış durakları da tam görünüp erik kenarı ağırlaşırdı.
  const k = orbKare({ boyut: 210, seviye: 0.8, ts: 4200, azHareket: true, durum: "konusuyor" });
  assert.match(k.clipPath, /^circle\(/);
  assert.equal(k.scale, 1, "reduced-motion'da nefes ve genlik ölçeği susar");
});

test("orbKare: reduced-motion'da durum tabanları KORUNUR", () => {
  // Tabanlar hareket değil, durumun rengidir — kaldırmak dört durumu yine ayırt edilemez yapardı.
  const a = orbKare({ boyut: 210, seviye: 0, ts: 0, azHareket: true, durum: "hazir" });
  const b = orbKare({ boyut: 210, seviye: 0, ts: 0, azHareket: true, durum: "konusuyor" });
  assert.ok(b.parlaklik > a.parlaklik);
  assert.ok(b.haloOpacity > a.haloOpacity);
});

test("orbKare: düşünme nabzı orb'un KENDİSİNDE — zamanla değişir, diğer durumlarda yok", () => {
  // Kör yargı bulgusu: düşünme ayrımı gövdenin dışına çizilmiş mekanik bir halkaya
  // yaslanmıştı. Nabız, farkı orb'un kendi davranışına taşır.
  const p = { boyut: 210, seviye: 0, azHareket: false };
  const a = orbKare({ ...p, ts: 0, durum: "dusunuyor" });
  const b = orbKare({ ...p, ts: 675, durum: "dusunuyor" });   // ~çeyrek periyot sonra
  assert.ok(Math.abs(b.parlaklik - a.parlaklik) > 0.05, "düşünme nabzı görünmüyor");
  // Diğer durumlarda parlaklık yalnız genlikten gelir; ts değişimi onu oynatmamalı.
  const h1 = orbKare({ ...p, ts: 0, durum: "hazir" });
  const h2 = orbKare({ ...p, ts: 675, durum: "hazir" });
  assert.equal(h1.parlaklik, h2.parlaklik);
});

test("orbKare: reduced-motion düşünme nabzını SUSTURUR", () => {
  const p = { boyut: 210, seviye: 0, azHareket: true, durum: "dusunuyor" };
  assert.equal(orbKare({ ...p, ts: 0 }).parlaklik, orbKare({ ...p, ts: 675 }).parlaklik);
});

test("orbKare: bilinmeyen/eksik durum çökertmez, hazır tabanına düşer", () => {
  const bilinmeyen = orbKare({ boyut: 210, seviye: 0, ts: 0, durum: "yok_boyle_durum" });
  const hazir = orbKare({ boyut: 210, seviye: 0, ts: 0, durum: "hazir" });
  assert.equal(bilinmeyen.parlaklik, hazir.parlaklik);
  assert.equal(orbKare({ boyut: 210, seviye: 0, ts: 0 }).parlaklik, hazir.parlaklik);
});

test("orbKare: boyut 0 iken path üretmez (ölçüm gelmeden çizim yok)", () => {
  const k = orbKare({ boyut: 0, seviye: 0.5, ts: 4200, durum: "dinliyor" });
  assert.match(k.clipPath, /^circle\(/, "ölçüm yoksa güvenli daireye düşmeli");
});

test("DURUM_TABAN: komşu durumlar ÖLÇÜLEBİLİR aralıkla ayrılır (gürültü tabanı üstünde)", () => {
  // Ölçüldü: rasterizasyon gürültü tabanı maks 8/255 ≈ 0.031 normalize. İlk değerlerle
  // Dinliyor↔Yanıtlıyor parlaklık farkı 0.07'ydi ve sessiz modda gövde farkı ortalama
  // 1.8/255 çıkıyordu — yani fark ekranda YOKTU. Bu test o regresyonu kilitler.
  const sirali = ["hazir", "dusunuyor", "dinliyor", "konusuyor"];
  const ASGARI_PARLA = 0.10;
  for (let i = 1; i < sirali.length; i++) {
    const onceki = DURUM_TABAN[sirali[i - 1]];
    const simdi = DURUM_TABAN[sirali[i]];
    assert.ok(simdi.parla - onceki.parla >= ASGARI_PARLA,
      `${sirali[i - 1]} → ${sirali[i]} parlaklık farkı çok küçük: ${(simdi.parla - onceki.parla).toFixed(3)}`);
    assert.ok(simdi.halo > onceki.halo, `${sirali[i]} hâlesi bir öncekinden büyük olmalı`);
  }
});

test("DURUM_TABAN: hâle aralığı çekirdek aralığından DAR (occlusion sözleşmesi)", () => {
  // Hâle geniş alana yayılır ve açık zeminde arkadaki kartı boyar (ölçüldü: kart doygunluğu
  // %8.4 → hâle kısılınca %3.0). Durum sinyalinin ağırlığı orb'un İÇİNDEKİ çekirdekte
  // kalmalı; bu oran tersine dönerse occlusion regresyonu geri gelir.
  const p = Object.values(DURUM_TABAN).map((d) => d.parla);
  const h = Object.values(DURUM_TABAN).map((d) => d.halo);
  const yay = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(yay(p) > yay(h),
    `çekirdek yayılımı (${yay(p).toFixed(2)}) hâle yayılımından (${yay(h).toFixed(2)}) büyük olmalı`);
});
