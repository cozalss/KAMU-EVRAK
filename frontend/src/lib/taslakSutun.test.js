import test from "node:test";
import assert from "node:assert/strict";
import {
  sutunButcesi, KUYRUK_MIN, KUYRUK_AZAMI, KARAR_MIN, KARAR_AZAMI, BOSLUK,
} from "./taslakSutun.js";
import { KAGIT_ASGARI_GEN } from "./a4Sayfalama.js";

/* Ölçülen gerçek ekranlar (Playwright, 2026-08-12) — bu üç satır hatanın kendisidir:
   eski düzende artan yer `justifyContent:space-between` ile sütun ARALARINA dağılıyordu
   (1920x945'te 2x185px, 2560x1305'te 2x378px uçurum). Bütçe artık artığı aralara değil
   sütunlara verir; kalanı sağ kenar boşluğudur. */
const EKRAN = {
  // [sutunH, gridGen] — CANLI ölçüm (Playwright, 2026-08-12, ustSik + satır-içi araç çubuğu
  // sonrası). Bu sayılar uydurma değil: sutunButcesi(...EKRAN.hd1080) canlı DOM'un ürettiği
  // {440, 584, 344} üçlüsünü birebir verir — saf fonksiyon ile tarayıcı aynı yerde duruyor.
  hd1080: [827, 1628],        // 1920x945  (1080p, %100 ölçek, tam ekran Chrome)
  hd1080_125: [638, 1244],    // 1536x756  (1080p, Windows %125 ölçek) — şikâyet edilen ekran
  qhd1440: [1187, 2268],      // 2560x1305 (1440p)
  dar: [472, 1074],           // 1366x640  (alçak dizüstü — kâğıt ölçek tabanına yakın)
};

test("üç sütun toplamı kabı ASLA aşmaz (yatay taşma = kaydırma çubuğu)", () => {
  for (const [ad, [h, w]] of Object.entries(EKRAN)) {
    const b = sutunButcesi(h, w);
    const toplam = b.kuyruk + b.kagit + b.karar + BOSLUK * 2;
    assert.ok(toplam <= w, `${ad}: ${toplam}px > ${w}px kap — taşma`);
  }
});

test("sütunlar arası uçurum kalmaz: artık en çok bir sütun payı kadar sağda toplanır", () => {
  // Regresyon kilidi: eski düzende 1080p'de 185px, 1440p'de 378px İKİ uçurum vardı.
  // Artık sütunlar bitişik (aralarında yalnız BOSLUK); artan yer tek parça sağ boşluktur.
  for (const [ad, [h, w]] of Object.entries(EKRAN)) {
    const b = sutunButcesi(h, w);
    const artik = w - (b.kuyruk + b.kagit + b.karar + BOSLUK * 2);
    assert.ok(artik >= 0, `${ad}: negatif artık (${artik}px) — sütunlar kabı aşıyor`);
  }
});

/* SAYFANIN ANA ODAĞI A4'TÜR (kullanıcı kararı 2026-08-12). Kâğıt her ekranda EN GENİŞ
   sütundur; kuyruk ona eşit olabilir ama asla geçemez. Bu kural kuyruk tavanının 440'a
   çekilmesinin de gerekçesidir — 560'ta liste belgeyle eşitlenip odağı bölüyordu. */
test("kâğıt her ekranda EN GENİŞ sütundur — odak listede değil belgede", () => {
  for (const [ad, [h, w]] of Object.entries(EKRAN)) {
    const b = sutunButcesi(h, w);
    assert.ok(b.kagit >= b.kuyruk, `${ad}: kuyruk ${b.kuyruk} > kâğıt ${b.kagit} — hiyerarşi ters`);
    assert.ok(b.kagit >= b.karar, `${ad}: karar ${b.karar} > kâğıt ${b.kagit} — hiyerarşi ters`);
  }
});

test("canlı DOM ile birebir aynı: saf hesap tarayıcıdan sapmaz", () => {
  // Playwright ölçümü 2026-08-12 — bu üçlüler tarayıcıdan OKUNDU, elle yazılmadı.
  assert.deepEqual(sutunButcesi(...EKRAN.hd1080), { kuyruk: 440, kagit: 584, karar: 344 });
  assert.deepEqual(sutunButcesi(...EKRAN.hd1080_125), { kuyruk: 440, kagit: 451, karar: 259 });
  assert.deepEqual(sutunButcesi(...EKRAN.qhd1440), { kuyruk: 440, kagit: 839, karar: 360 });
  assert.deepEqual(sutunButcesi(...EKRAN.dar), { kuyruk: 333, kagit: 333, karar: 241 });
});

test("her sütun kendi asgari/azami sınırları içinde kalır", () => {
  for (const [ad, [h, w]] of Object.entries(EKRAN)) {
    const b = sutunButcesi(h, w);
    assert.ok(b.kuyruk >= KUYRUK_MIN && b.kuyruk <= KUYRUK_AZAMI, `${ad}: kuyruk ${b.kuyruk}`);
    assert.ok(b.karar >= KARAR_MIN && b.karar <= KARAR_AZAMI, `${ad}: karar ${b.karar}`);
    assert.ok(b.kagit >= KAGIT_ASGARI_GEN, `${ad}: kâğıt ${b.kagit}`);
  }
});

test("kâğıt A4 oranını korur — yükseklikten türer, genişlikle şişirilmez", () => {
  const b = sutunButcesi(...EKRAN.qhd1440);
  // 1187 x (210/297) = 839 → sınırlayıcı YÜKSEKLİKTİR, kalan genişlik (1740px) değil.
  assert.equal(b.kagit, Math.floor(1187 * (210 / 297)));
});

/* Dikey yer = kâğıt boyutu. ustSik + satır-içi araç çubuğu 1920x945'te sütuna 66px kazandırdı
   (761 → 827); A4 538 → 584 piksele, ölçek 0,678 → 0,736'ya çıktı. Bu testin kırılması, o
   dikey kazancın (ViewWrap ustSik veya AracCubugu satirIci) geri alındığı anlamına gelir. */
test("dikey kazanç kâğıda yansır: 66px yükseklik ≈ 46px kâğıt genişliği", () => {
  const eski = sutunButcesi(761, 1628);   // ustSik öncesi ölçüm
  const yeni = sutunButcesi(...EKRAN.hd1080);
  assert.ok(yeni.kagit - eski.kagit >= 40, `kâğıt yalnız ${yeni.kagit - eski.kagit}px büyüdü`);
});

test("ölçüm yokken null döner — çağıran oransal yedeğe düşer, yanlış sayı çizilmez", () => {
  assert.equal(sutunButcesi(null, 1628), null);
  assert.equal(sutunButcesi(761, null), null);
  assert.equal(sutunButcesi(0, 1628), null);
  assert.equal(sutunButcesi(761, 0), null);
});

test("aşırı dar kapta bile sayı üretir ve negatife düşmez", () => {
  const b = sutunButcesi(400, 800);
  assert.ok(b.kuyruk > 0 && b.kagit > 0 && b.karar > 0);
});

test("saf ve kararlı: aynı girdi aynı çıktı", () => {
  assert.deepEqual(sutunButcesi(...EKRAN.hd1080), sutunButcesi(...EKRAN.hd1080));
});
