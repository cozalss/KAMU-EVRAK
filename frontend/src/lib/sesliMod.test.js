/* sesliMod testleri — `node --test src/lib/sesliMod.test.js`.
   sesliMetneCevir: markdown→düz-metin (TTS okuması için). sttDestekleniyorMu/sesTanimaOlustur:
   window.SpeechRecognition mock'lanarak (gerçek tarayıcı davranışı manuel doğrulanır). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sesliMetneCevir, sesTanimaOlustur, sttDestekleniyorMu } from "./sesliMod.js";

test("sesliMetneCevir: kalın işaretleri (**) kaldırır, metni korur", () => {
  assert.equal(sesliMetneCevir("**Risk bandı** sarı."), "Risk bandı sarı.");
});

test("sesliMetneCevir: madde işaretini (• ) kaldırır", () => {
  assert.equal(sesliMetneCevir("• Tarih eksik\n• İmza eksik"), "Tarih eksik. İmza eksik");
});

test("sesliMetneCevir: yatay ayraç satırlarını (---) tamamen atar", () => {
  assert.equal(sesliMetneCevir("Birinci kısım\n---\nİkinci kısım"), "Birinci kısım. İkinci kısım");
});

test("sesliMetneCevir: boş satırları atlar, çok satırı '. ' ile birleştirir", () => {
  assert.equal(sesliMetneCevir("Merhaba\n\nNasılsınız?"), "Merhaba. Nasılsınız?");
});

test("sesliMetneCevir: boş/undefined girdi boş döner", () => {
  assert.equal(sesliMetneCevir(""), "");
  assert.equal(sesliMetneCevir(undefined), "");
});

test("sttDestekleniyorMu: window yoksa false", () => {
  const eski = globalThis.window;
  delete globalThis.window;
  assert.equal(sttDestekleniyorMu(), false);
  if (eski !== undefined) globalThis.window = eski;
});

test("sttDestekleniyorMu: SpeechRecognition yoksa false, webkit varyantı varsa true", () => {
  globalThis.window = {};
  assert.equal(sttDestekleniyorMu(), false);
  globalThis.window = { webkitSpeechRecognition: function () {} };
  assert.equal(sttDestekleniyorMu(), true);
  delete globalThis.window;
});

test("sesTanimaOlustur: desteklenmiyorsa null döner", () => {
  globalThis.window = {};
  assert.equal(sesTanimaOlustur({ onSonuc: () => {} }), null);
  delete globalThis.window;
});

test("sesTanimaOlustur: sonuç geldiğinde onSonuc transcript ile çağrılır", () => {
  class SahteRecognition {
    start() {}
    stop() {}
  }
  globalThis.window = { SpeechRecognition: SahteRecognition };
  let alinan = null;
  const tanima = sesTanimaOlustur({ onSonuc: (m) => { alinan = m; } });
  assert.notEqual(tanima, null);
  assert.equal(tanima.lang, "tr-TR");
  tanima.onresult({ results: [[{ transcript: "  merhaba dünya  " }]] });
  assert.equal(alinan, "merhaba dünya");
  delete globalThis.window;
});

test("sesTanimaOlustur: boş transcript onSonuc'u tetiklemez", () => {
  class SahteRecognition {
    start() {}
    stop() {}
  }
  globalThis.window = { SpeechRecognition: SahteRecognition };
  let cagrildi = false;
  const tanima = sesTanimaOlustur({ onSonuc: () => { cagrildi = true; } });
  tanima.onresult({ results: [[{ transcript: "   " }]] });
  assert.equal(cagrildi, false);
  delete globalThis.window;
});

test("sesTanimaOlustur: onerror/onend geçilen handler'lara yönlenir", () => {
  class SahteRecognition {
    start() {}
    stop() {}
  }
  globalThis.window = { SpeechRecognition: SahteRecognition };
  let hata = null;
  let bitti = false;
  const tanima = sesTanimaOlustur({
    onSonuc: () => {}, onHata: (e) => { hata = e; }, onBitti: () => { bitti = true; },
  });
  tanima.onerror("boom");
  tanima.onend();
  assert.equal(hata, "boom");
  assert.equal(bitti, true);
  delete globalThis.window;
});
