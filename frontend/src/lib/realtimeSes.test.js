/* realtimeSes testleri — `node --test src/lib/realtimeSes.test.js`.
   WebRTC kurulumu tarayıcı API'si gerektirir (canlı doğrulanır); burada SAF kısımlar:
   olay ayrıştırma, durum eşlemesi, araç çağrısı toplama. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aracArgumanlari, aracCiktisiniYaz, aracTamamlandiMi, aracTuruOlustur, olayCoz,
  sonrakiSesliDurum, yanitIste,
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

/* --- aracTuruOlustur: protokolün en ince kuralı (canlı testte iki kez ısırdı) ---
   İki olay bağımsız gelir ve SIRALARI GARANTİ DEĞİLDİR; yanıt YALNIZ ikisi de olunca
   istenebilir. Aşağıdaki testler iki sırayı da, tur-sonu ayrımını da ve tüketimi kapsar. */

test("araç turu: önce çıktı yazıldı, sonra yanıt bitti → yanıt İSTENİR", () => {
  const tur = aracTuruOlustur();
  tur.basla();
  assert.equal(tur.ciktiyiYazdik(), false, "aktif yanıt sürerken istenmez (API hatası olurdu)");
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: false, yanitIstenmeli: true });
});

test("araç turu: önce yanıt bitti, sonra çıktı yazıldı → yanıt İSTENİR (ters sıra)", () => {
  const tur = aracTuruOlustur();
  tur.basla();
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: false, yanitIstenmeli: false },
    "sonucumuz henüz yazılmadı — model cevabı görmeden konuşurdu");
  assert.equal(tur.ciktiyiYazdik(), true);
});

test("araç turunun ORTASINDAKİ response.done tur sonu DEĞİLDİR", () => {
  // Orb bu yüzden model daha konuşmadan "Dinliyor"a düşüyordu: durum makinesine
  // verilmemesi gereken bir olay veriliyordu.
  const tur = aracTuruOlustur();
  tur.basla();
  assert.equal(tur.yanitTamamlandi().turSonu, false);
});

test("araç turu YOKKEN response.done normal tur sonudur", () => {
  const tur = aracTuruOlustur();
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: true, yanitIstenmeli: false });
});

test("araç turundan SONRAKİ response.done gerçek tur sonudur", () => {
  const tur = aracTuruOlustur();
  tur.basla();
  tur.yanitTamamlandi();          // araç turunun ortası
  tur.ciktiyiYazdik();            // → yanıt istendi, model şimdi cevabı konuşuyor
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: true, yanitIstenmeli: false });
});

test("koşullar TÜKETİLİR — aynı araç turu iki kez yanıt istemez", () => {
  const tur = aracTuruOlustur();
  tur.basla();
  tur.ciktiyiYazdik();
  assert.equal(tur.yanitTamamlandi().yanitIstenmeli, true);
  assert.equal(tur.ciktiyiYazdik(), false, "ikinci çağrı yeniden yanıt istememeli");
});

test("uçuşta tur yokken geç çözülen söz yanıt İSTEMEZ", () => {
  // Oturum araç turu ortasında kapanır, ağ cevabı sonra gelir: bir sonraki oturumu
  // tetiklememeli.
  const tur = aracTuruOlustur();
  assert.equal(tur.ciktiyiYazdik(), false);
});

test("sifirla: yarıda kapanan tur bir sonraki oturuma SARKMAZ", () => {
  const tur = aracTuruOlustur();
  tur.basla();                    // oturum araç turu ortasında kapandı
  tur.sifirla();                  // yeni oturum açılışı
  // Sıfırlanmasaydı yeni oturumun ilk response.done'ı araç turu sanılıp yutulur,
  // orb "Yanıtlıyor"da kilitlenirdi.
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: true, yanitIstenmeli: false });
});

test("art arda iki araç çağrısı: ikinci tur temiz başlar", () => {
  const tur = aracTuruOlustur();
  tur.basla();
  tur.ciktiyiYazdik();
  tur.yanitTamamlandi();          // 1. tur tamamlandı
  tur.basla();                    // 2. tur
  assert.equal(tur.ciktiyiYazdik(), false, "1. turun bayrakları taşınmamalı");
  assert.deepEqual(tur.yanitTamamlandi(), { turSonu: false, yanitIstenmeli: true });
});
