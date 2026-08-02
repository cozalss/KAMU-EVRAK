/* realtimeSes — OpenAI Realtime (WebRTC) sesli görüşme istemcisi.

   NEDEN WebRTC ve neden ses bizim sunucumuzdan GEÇMİYOR: ölçüldü (2026-08-01) — eski zincir
   (tarayıcı STT → DeepSeek → OpenAI TTS) ilk sesi ~3184 ms'de veriyordu; realtime ~1000 ms.
   Sesi kendi sunucumuza uğratsaydık kazandığımız gecikmeyi geri verirdik. Bu yüzden ses
   tarayıcı ↔ OpenAI arasında doğrudan akar; sunucumuz yalnız KISA ÖMÜRLÜ anahtarı üretir.

   GROUNDING SÖZLEŞMESİ: model mevzuat/kayıt/süre sorularını kendi bilgisinden cevaplamaz,
   `kamu_evrak_sor` aracını çağırır → bu modül aracı bizim /sohbet ucumuza sorar → cevap
   modele geri verilir, model onu seslendirir. Ölçümde realtime-mini bilgi edinme süresini
   yanlış söylemişti; doğruluk modelin değil pipeline'ın sorumluluğunda kalmalı.

   Saf kısımlar (olayCoz, sonrakiSesliDurum, aracTamamlandiMi) ayrı ve testli; WebRTC kurulumu
   tarayıcı API'si gerektirdiği için test edilmez, canlı doğrulanır.
*/

const CAGRI_UCU = "https://api.openai.com/v1/realtime/calls";

/* Realtime sunucu olayı → bizim sesli durum makinemizin olayı (lib/sesGorusme.sonrakiDurum).
   Eşleme burada TEK YERDE: sahne bileşeni realtime olay adlarını hiç bilmesin. */
export function sonrakiSesliDurum(olayTuru) {
  switch (olayTuru) {
    case "input_audio_buffer.speech_started":
      return "dinle";                 // kullanıcı konuşmaya başladı
    case "input_audio_buffer.speech_stopped":
      return "sonuc";                 // konuşma bitti → model düşünüyor
    // WebRTC'de ses veri kanalından AKMAZ, ayrı RTP izinden gelir; bu yüzden konuşmanın
    // başladığını `output_audio_buffer.started` haber verir. `response.output_audio.delta`
    // yalnız WebSocket modunda görülür — canlı testte bu ayrım yakalandı (delta hiç gelmedi,
    // orb "Yanıtlıyor"a geçmiyordu). İkisi de kabul edilir, hangisi gelirse.
    case "output_audio_buffer.started":
    case "response.output_audio.delta":
      return "yanit_basladi";
    case "response.done":
      return "yanit_bitti";           // tur bitti → tekrar dinle
    case "error":
      return "hata";
    default:
      return null;                    // ilgilenmediğimiz olay: durum değişmez
  }
}

/* Veri kanalından gelen ham mesajı normalize et. Bozuk JSON sessizce yutulur —
   tek bir kötü kare görüşmeyi düşürmemeli. */
export function olayCoz(ham) {
  try {
    const o = JSON.parse(typeof ham === "string" ? ham : String(ham));
    return o && typeof o.type === "string" ? o : null;
  } catch {
    return null;
  }
}

/* Araç çağrısı tamamlandı mı? Argümanlar parça parça akar; yalnız `.done` çalıştırılabilir. */
export function aracTamamlandiMi(olay) {
  return olay?.type === "response.function_call_arguments.done" && !!olay.call_id;
}

/* Araç argümanlarını güvenle çöz — model bozuk JSON üretirse tur çökmesin. */
export function aracArgumanlari(olay) {
  try {
    return JSON.parse(olay?.arguments || "{}");
  } catch {
    return {};
  }
}

/**
 * Realtime oturumu kur. Ses doğrudan tarayıcı ↔ OpenAI; veri kanalı olayları taşır.
 *
 * @param {{
 *   anahtar: string, model: string, mikrofon: MediaStream, sesElemani: HTMLAudioElement,
 *   onOlay: (olay: object) => void, onUzakAkis?: (akis: MediaStream) => void,
 * }} secenek
 * @returns {Promise<{gonder: (o: object) => void, kapat: () => void, pc: RTCPeerConnection}>}
 */
export async function realtimeBaglan({ anahtar, model, mikrofon, sesElemani, onOlay, onUzakAkis }) {
  const pc = new RTCPeerConnection();

  // Modelin sesi: <audio> elemanına bağlanır. Ayrıca akışı çağırana veririz — orb genliğini
  // bu akıştan okuyacağız (eskiden TTS blob'undan okuyorduk; artık canlı akış var).
  pc.ontrack = (e) => {
    if (sesElemani) sesElemani.srcObject = e.streams[0];
    onUzakAkis?.(e.streams[0]);
  };

  for (const iz of mikrofon.getAudioTracks()) pc.addTrack(iz, mikrofon);

  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (e) => {
    const olay = olayCoz(e.data);
    if (olay) onOlay?.(olay);
  };

  const teklif = await pc.createOffer();
  await pc.setLocalDescription(teklif);

  const yanit = await fetch(`${CAGRI_UCU}?model=${encodeURIComponent(model)}`, {
    method: "POST",
    body: teklif.sdp,
    headers: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/sdp" },
  });
  if (!yanit.ok) {
    pc.close();
    throw new Error(`realtime SDP ${yanit.status}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await yanit.text() });

  // Veri kanalı açılana kadar bekle: erken gönderilen olay sessizce kaybolur.
  if (dc.readyState !== "open") {
    await new Promise((coz, red) => {
      const zamanAsimi = setTimeout(() => red(new Error("veri kanalı açılmadı")), 10000);
      dc.onopen = () => { clearTimeout(zamanAsimi); coz(); };
      dc.onerror = () => { clearTimeout(zamanAsimi); red(new Error("veri kanalı hatası")); };
    });
  }

  const gonder = (o) => { if (dc.readyState === "open") dc.send(JSON.stringify(o)); };
  const kapat = () => {
    try { dc.close(); } catch { /* yoksay */ }
    for (const gonderici of pc.getSenders()) { try { gonderici.track?.stop(); } catch { /* yoksay */ } }
    try { pc.close(); } catch { /* yoksay */ }
    if (sesElemani) sesElemani.srcObject = null;
  };
  return { gonder, kapat, pc };
}

/* Araç sonucu YAZILIR ama yanıt HEMEN İSTENMEZ — ikisi ayrı fonksiyon, çünkü aralarında
   beklemek zorundayız. Araç çağrısı `arguments.done` ile biter AMA o anda modelin yanıtı
   HÂLÂ AKTİFTİR (`response.done` henüz gelmemiştir). Aktif yanıt varken `response.create`
   göndermek API hatası verir ve tur SESSİZCE ölür — canlı testte "35 sn hiç ses gelmedi"
   olarak göründü. Doğru sıra: çıktıyı yaz → response.done'ı bekle → yanıt iste. */
export function aracCiktisiniYaz(gonder, callId, cevap) {
  gonder({
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ cevap }) },
  });
}

export function yanitIste(gonder) {
  gonder({ type: "response.create" });
}

/**
 * Araç turu senkronizasyonu — saf durum makinesi (protokolün en ince kuralı burada).
 *
 * NEDEN BİR MAKİNE GEREKİYOR: bir araç turunda İKİ olay birbirinden bağımsız gelir ve
 * SIRALARI GARANTİ DEĞİLDİR:
 *   (a) bizim araç sonucumuz konuşmaya yazılır  — bizim ağ turumuz bitince,
 *   (b) modelin O ANKİ aktif yanıtı biter       — `response.done` geldiğinde.
 * `response.create` YALNIZ ikisi de olduktan sonra gönderilebilir:
 *   · (b) olmadan gönderilirse aktif yanıtla çakışır, API hata verir ve tur SESSİZCE ölür
 *     (canlı testte "35 sn hiç ses gelmedi" olarak göründü),
 *   · (a) olmadan gönderilirse model aracın cevabını GÖRMEDEN konuşur — yani uydurur.
 * Ayrıca araç turunun ortasındaki `response.done` TUR SONU DEĞİLDİR; durum makinesine
 * "yanıt bitti" diye verilirse orb, model daha konuşmadan "Dinliyor"a düşer.
 *
 * @returns {{
 *   basla: () => void,
 *   ciktiyiYazdik: () => boolean,
 *   yanitTamamlandi: () => {turSonu: boolean, yanitIstenmeli: boolean},
 *   sifirla: () => void,
 * }}
 */
export function aracTuruOlustur() {
  let bekliyor = false;      // araç çağrısı geldi, turu henüz kapanmadı
  let ciktiYazildi = false;  // (a) bizim cevabımız konuşmaya yazıldı
  let yanitBitti = false;    // (b) modelin aktif yanıtı bitti

  // İki koşul da sağlandıysa TÜKET: aynı araç turu iki kez yanıt istemesin.
  const hazirMi = () => {
    if (!ciktiYazildi || !yanitBitti) return false;
    ciktiYazildi = false;
    yanitBitti = false;
    return true;
  };

  return {
    /** `response.function_call_arguments.done` görüldü — yeni araç turu başlıyor. */
    basla() {
      bekliyor = true;
      ciktiYazildi = false;
      yanitBitti = false;
    },

    /** Araç sonucumuz yazıldı. @returns {boolean} şimdi `response.create` gönderilmeli mi */
    ciktiyiYazdik() {
      // Uçuşta araç turu yoksa yok say: oturum kapanırken geç çözülen bir söz (promise)
      // bir sonraki oturumu tetiklemesin.
      if (!bekliyor && !yanitBitti) return false;
      ciktiYazildi = true;
      return hazirMi();
    },

    /**
     * `response.done` geldi.
     * @returns {{turSonu: boolean, yanitIstenmeli: boolean}} turSonu=false ise bu olay araç
     * turunun ORTASIDIR ve durum makinesine verilmemelidir.
     */
    yanitTamamlandi() {
      if (!bekliyor) return { turSonu: true, yanitIstenmeli: false };
      bekliyor = false;
      yanitBitti = true;
      return { turSonu: false, yanitIstenmeli: hazirMi() };
    },

    /** Oturum açılışında çağrılır — yarıda kapanan bir turdan sarkan bayrak taşınmasın. */
    sifirla() {
      bekliyor = false;
      ciktiYazildi = false;
      yanitBitti = false;
    },
  };
}

/* EKRAN BAĞLAMI NEDEN BURADA YOK: modele `session.update` ile talimat göndermek, personayı
   ve grounding sözleşmesini istemci-yazılabilir yapardı (sunucuda tutmamızın tüm anlamı bu).
   Gerek de yok — ekran bağlamı zaten araç yolundan gidiyor: `kamu_evrak_sor` çağrıldığında
   sahne, soruyu /sohbet ucuna GÜNCEL ekran özetiyle birlikte soruyor. Yani "bu evrak ne?"
   sorusunun cevabı ekranı gören taraftan geliyor, modelin hafızasından değil. */
