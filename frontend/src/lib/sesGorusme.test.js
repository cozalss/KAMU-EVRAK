/* sesGorusme testleri — `node --test src/lib/sesGorusme.test.js`.
   Saf yardımcılar: rmsGenlik (Web Audio zaman-domeni → 0..1 genlik), yumusat (jitter'sız
   animasyon lerp'i) ve sonrakiDurum (kesintisiz görüşme durum makinesi — ChatGPT voice mode
   döngüsü). Gerçek AudioContext/mikrofon gerektirmez; saf matematik + reducer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DURUM, rmsGenlik, sonrakiDurum, yumusat } from "./sesGorusme.js";

// --- rmsGenlik: AnalyserNode.getByteTimeDomainData çıktısı (0..255, sessizlik=128) → 0..1 ---
test("rmsGenlik: sessizlik (tümü 128) sıfır döner", () => {
  const sessiz = new Uint8Array(64).fill(128);
  assert.equal(rmsGenlik(sessiz), 0);
});

test("rmsGenlik: tam genlik (0/255 salınımı) ~1 döner", () => {
  const bytes = new Uint8Array(64);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 2 === 0 ? 0 : 255;
  const g = rmsGenlik(bytes);
  assert.ok(g > 0.98 && g <= 1, `beklenen ~1, gelen ${g}`);
});

test("rmsGenlik: orta genlik 0..1 arasında", () => {
  const bytes = new Uint8Array(64);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 2 === 0 ? 64 : 192; // ±64/128 = 0.5
  const g = rmsGenlik(bytes);
  assert.ok(g > 0.45 && g < 0.55, `beklenen ~0.5, gelen ${g}`);
});

test("rmsGenlik: boş/undefined güvenli sıfır", () => {
  assert.equal(rmsGenlik(new Uint8Array(0)), 0);
  assert.equal(rmsGenlik(undefined), 0);
});

// --- yumusat: exponential lerp (orb ölçeği ani sıçramasın) ---
test("yumusat: faktör 1 hedefe eşittir", () => {
  assert.equal(yumusat(0, 10, 1), 10);
});

test("yumusat: faktör 0 önceki değerde kalır", () => {
  assert.equal(yumusat(3, 10, 0), 3);
});

test("yumusat: hedefe doğru ilerler (yarı yol)", () => {
  assert.equal(yumusat(0, 10, 0.5), 5);
});

// --- sonrakiDurum: kesintisiz görüşme döngüsü ---
test("tam döngü: hazir → dinliyor → dusunuyor → konusuyor → dinliyor", () => {
  let d = DURUM.HAZIR;
  d = sonrakiDurum(d, "dinle");
  assert.equal(d, DURUM.DINLIYOR);
  d = sonrakiDurum(d, "sonuc");
  assert.equal(d, DURUM.DUSUNUYOR);
  d = sonrakiDurum(d, "yanit_basladi");
  assert.equal(d, DURUM.KONUSUYOR);
  d = sonrakiDurum(d, "yanit_bitti");
  assert.equal(d, DURUM.DINLIYOR); // kesintisiz: yanıt bitince tekrar dinler
});

test("barge-in: konuşurken 'kes' → tekrar dinlemeye döner", () => {
  assert.equal(sonrakiDurum(DURUM.KONUSUYOR, "kes"), DURUM.DINLIYOR);
});

test("boş dinleme: dinliyor + 'bekle' → hazır (transcript gelmedi)", () => {
  assert.equal(sonrakiDurum(DURUM.DINLIYOR, "bekle"), DURUM.HAZIR);
});

test("hata: düşünürken 'hata' → dinlemeye döner (döngü kilitlenmez)", () => {
  assert.equal(sonrakiDurum(DURUM.DUSUNUYOR, "hata"), DURUM.DINLIYOR);
});

test("guard: 'yanit_basladi' yalnız düşünürken konuşmaya geçirir", () => {
  // Hazırken gelen sahte yanıt sinyali durumu bozmaz.
  assert.equal(sonrakiDurum(DURUM.HAZIR, "yanit_basladi"), DURUM.HAZIR);
});

test("bilinmeyen olay durumu değiştirmez", () => {
  assert.equal(sonrakiDurum(DURUM.KONUSUYOR, "zzz"), DURUM.KONUSUYOR);
});
