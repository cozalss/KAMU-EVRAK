/* realtimeSes testleri — `node --test src/lib/realtimeSes.test.js`.
   WebRTC kurulumu tarayıcı API'si gerektirir (canlı doğrulanır); burada SAF kısımlar:
   olay ayrıştırma, durum eşlemesi, araç çağrısı toplama. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aracArgumanlari, aracCiktisiniYaz, aracTamamlandiMi, olayCoz, sonrakiSesliDurum, yanitIste,
} from "./realtimeSes.js";

test("olayCoz geçerli olayı çözer", () => {
  assert.deepEqual(olayCoz('{"type":"response.done","x":1}'), { type: "response.done", x: 1 });
});

test("olayCoz BOZUK JSON'da null döner — tek kötü kare görüşmeyi düşürmez", () => {
  assert.equal(olayCoz("{bozuk"), null);
  assert.equal(olayCoz(""), null);
  assert.equal(olayCoz('{"tip":"eksik"}'), null);   // type alanı yoksa olay değil
});

test("durum eşlemesi: konuşma başladı → dinle", () => {
  assert.equal(sonrakiSesliDurum("input_audio_buffer.speech_started"), "dinle");
});

test("durum eşlemesi: konuşma bitti → düşünmeye geç", () => {
  assert.equal(sonrakiSesliDurum("input_audio_buffer.speech_stopped"), "sonuc");
});

test("durum eşlemesi: WebRTC'de konuşma başlangıcı output_audio_buffer.started'tır", () => {
  // Canlı testte yakalandı: WebRTC'de ses RTP izinden akar, veri kanalına .delta GELMEZ.
  // Yalnız .delta'ya bakan eşleme orb'u hiç "Yanıtlıyor"a geçirmiyordu.
  assert.equal(sonrakiSesliDurum("output_audio_buffer.started"), "yanit_basladi");
});

test("durum eşlemesi: WebSocket modundaki .delta da kabul edilir", () => {
  assert.equal(sonrakiSesliDurum("response.output_audio.delta"), "yanit_basladi");
});

test("durum eşlemesi: tur bitti → tekrar dinle", () => {
  assert.equal(sonrakiSesliDurum("response.done"), "yanit_bitti");
});

test("ilgilenmediğimiz olay durumu DEĞİŞTİRMEZ", () => {
  assert.equal(sonrakiSesliDurum("rate_limits.updated"), null);
  assert.equal(sonrakiSesliDurum("conversation.item.created"), null);
});

test("araç çağrısı YALNIZ .done olayında çalıştırılabilir (argümanlar parça parça akar)", () => {
  assert.equal(aracTamamlandiMi({ type: "response.function_call_arguments.delta", call_id: "c1" }), false);
  assert.equal(aracTamamlandiMi({ type: "response.function_call_arguments.done", call_id: "c1" }), true);
});

test("call_id yoksa araç çalıştırılmaz (sonuç kime döneceği belirsiz)", () => {
  assert.equal(aracTamamlandiMi({ type: "response.function_call_arguments.done" }), false);
});

test("aracArgumanlari bozuk JSON'da boş nesne döner (tur çökmez)", () => {
  assert.deepEqual(aracArgumanlari({ arguments: '{"soru":"kaç taslak var"}' }), { soru: "kaç taslak var" });
  assert.deepEqual(aracArgumanlari({ arguments: "{bozuk" }), {});
  assert.deepEqual(aracArgumanlari({}), {});
});

test("aracCiktisiniYaz YALNIZ çıktıyı yazar — yanıt İSTEMEZ", () => {
  // Canlı bulgu: araç sonucunu yazarken hemen response.create göndermek, modelin aktif
  // yanıtıyla çakışıyor ve tur SESSİZCE ölüyordu (35 sn hiç ses gelmedi). Yanıt isteme
  // ayrı bir adım: çağıran, aktif yanıtın bitmesini bekler.
  const gonderilen = [];
  aracCiktisiniYaz((o) => gonderilen.push(o), "call_9", "Otuz gündür.");
  assert.equal(gonderilen.length, 1);
  assert.equal(gonderilen[0].type, "conversation.item.create");
  assert.equal(gonderilen[0].item.type, "function_call_output");
  assert.equal(gonderilen[0].item.call_id, "call_9");
  assert.equal(JSON.parse(gonderilen[0].item.output).cevap, "Otuz gündür.");
  assert.equal(gonderilen.some((o) => o.type === "response.create"), false);
});

test("yanitIste ayrı adımdır", () => {
  const gonderilen = [];
  yanitIste((o) => gonderilen.push(o));
  assert.deepEqual(gonderilen, [{ type: "response.create" }]);
});
