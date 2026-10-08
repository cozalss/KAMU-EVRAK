/* SesliGorusme — ChatGPT "voice mode" tarzı sesli görüşme sahnesi; sayfayı KAPLAMAZ.
   Sohbet panelinin durduğu noktada (sağ-alt) yuvarlak bir DİSK olarak açılır: kullanıcı sitede
   kalır, arkadaki ekranı görür ve kullanabilir — bu yüzden modal DEĞİL (aria-modal ve odak
   tuzağı bilerek yok; ESC yine kapatır). Bas → konuş → asistan sesli cevap ver → tekrar dinle
   (kesintisiz döngü). Orb, mikrofon (dinlerken) ve TTS sesinin (konuşurken) GERÇEK genliğine
   göre canlanır (Web Audio AnalyserNode → rmsGenlik → rAF; bkz. lib/sesGorusme.js).
   Beyin: /sohbet/stream (DeepSeek). Ses: /sohbet/seslendir (OpenAI TTS — anahtar yoksa 503,
   metin-only'e zarifçe düşer). Görüşme durum makinesi saf + test edilmiş (sonrakiDurum).
   Tema: "SAHNE" istisnası (CanliAjanAkisi gibi) — koyu zemin ve glow yalnız DİSKİN İÇİNDE,
   sayfanın üstünde değil; sakin çalışma-alanı chrome'u bozulmaz.
   a11y: ESC kapatır, aria-live durum, reduced-motion'da morph/scale söner. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { authFetch } from "../lib/authApi.js";
import { DURUM, rmsGenlik, sonrakiDurum, yumusatZamanli } from "../lib/sesGorusme.js";
import { orbKare } from "../lib/orbCizim.js";
import { sesTanimaOlustur, sttDestekleniyorMu } from "../lib/sesliMod.js";
import { sesliMetneCevir } from "../lib/sesliMod.js";
import { cumleAyir, sesKuyruguOlustur } from "../lib/sesKuyrugu.js";
import { komutCoz, komutOnayi } from "../lib/sesliKomut.js";
import {
  aracArgumanlari, aracCiktisiniYaz, aracTamamlandiMi, aracTuruOlustur, realtimeBaglan,
  sonrakiSesliDurum, yanitIste,
} from "../lib/realtimeSes.js";
import { PAL, SP, EASE_BEZIER, TYPE, SR_ONLY } from "./neonUi.jsx";
import {
  DURUM_ETIKET, MASA_GENISLIK, MASA_ORB, MASA_SAHNE, TELEFON_ORB, TELEFON_DOK, TELEFON_SAHNE,
  SUTUN_DOK, SUTUN_ORB, SUTUN_SAHNE,
  DurumKunyesi, SesliSutunBasligi, OturumKunyesi, SesliOrbDugme, SesliKontroller,
} from "./SesliSahne.jsx";

// MALİYET KORUMASI — realtime'da ses açık kaldığı sürece ücretlendirilir ve eski zincirdeki
// kullanıcı-başına TTS karakter kotası artık hiçbir şeyi korumuyor (TTS'i biz çağırmıyoruz).
// Açık unutulan bir sekme sessizce fatura yazardı. İki sınır: konuşulmadan geçen süre ve
// oturumun toplam ömrü. İkisi de dolunca oturum kapanır, kullanıcı görünür bir not görür.
const BOS_KAPANIS_MS = 3 * 60 * 1000;    // 3 dk kimse konuşmadıysa
const AZAMI_OTURUM_MS = 15 * 60 * 1000;  // toplam tavan (aktif olsa bile)
const SAYAC_ARALIK_MS = 5000;

const FFT = 1024;                 // ~512 bin; research deseni (smoothingTimeConstant 0.4)
// Genlik yumuşatma artık ZAMAN tabanlı ve asimetrik (lib/sesGorusme.yumusatZamanli);
// ölçek/nefes/kenar/durum-tabanı katsayıları lib/orbCizim.orbKare'de (düzenekle paylaşılır).


function azHareketMi() {
  return typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}


// onKomut(komut): sesli komut ÇALIŞTIRILIR (görünüm değiştir / evrak aç). Sahne bu işi
// kendisi yapmaz — kabuk (DashboardApp) yapar; sahne yalnız komutu çözer ve bildirir.
// konum: sohbet panelinin çapası ({left, bottom}); disk masaüstünde sağ-alt köşede doğar
// (içerikle çakışmasın). null → telefon: ekranın alt-ortasında.
export default function SesliGorusme({ acik = false, ekran = null, onKomut, onKapat, konum = null, baglamAdi = "" }) {
  const [durum, setDurum] = useState(DURUM.HAZIR);
  const [susturuldu, setSusturuldu] = useState(false);
  const [sonUser, setSonUser] = useState("");   // canlı transcript — kullanıcı
  const [sonYanit, setSonYanit] = useState(""); // canlı transcript — asistan (stream)
  const [uyari, setUyari] = useState("");        // izin/STT/TTS notu
  const [tur, setTur] = useState(0);              // oturum künyesi: tamamlanan kullanıcı turu
  const [sonEylem, setSonEylem] = useState("");   // oturum künyesi: son YÜRÜTÜLEN komut

  const durumRef = useRef(DURUM.HAZIR);
  const acikRef = useRef(false);
  // Ekran bağlamı ref'te: beyinCagir kalıcı bir closure, prop'u doğrudan okusa kullanıcının
  // KONUŞTUĞU andaki değil, sahnenin açıldığı andaki ekranı gönderirdi. Kullanıcı görüşme
  // sürerken ekran değiştirebilir ("şimdi taslaklara bak, buradaki ilk yazı ne?").
  const ekranRef = useRef(ekran);
  const susturRef = useRef(false);
  const azHareketRef = useRef(false);
  // State aynası: SesliOrb prop'u dürüst kalsın (yalnız ref güncellemek render'ı tazelemez).
  // Görüşme SÜRERKEN OS "hareketi azalt" açılırsa change dinleyicisi (aşağıdaki [acik]
  // effect'i) hem ref'i (rAF döngüsü okur) hem state'i günceller — MuzakereKurulu idiomu.
  const [azHareket, setAzHareket] = useState(azHareketMi);

  const ctxRef = useRef(null);
  const micAnalizRef = useRef(null);
  const oynatAnalizRef = useRef(null);
  const micStreamRef = useRef(null);
  const bufRef = useRef(null);
  const rafRef = useRef(0);
  const seviyeRef = useRef(0);

  const tanimaRef = useRef(null);
  const audioElRef = useRef(null);
  const mediaBagliRef = useRef(false);
  const abortRef = useRef(null);
  const kuyrukRef = useRef(null);   // aktif konuşma kuyruğu (barge-in/kapanışta iptal edilir)
  const oncekiOynatmayiBitirRef = useRef(null);  // <audio> sahipliği — yeni oynatma eskiyi çözer
  const gecmisRef = useRef([]);     // çok-turlu konuşma hafızası — takip soruları bağlam kazanır
  const hataSayacRef = useRef(0);   // ardışık STT hatası (no-speech) — eşikte kullanıcıyı uyar
  // HITL el sıkışması: backend bir eylem için teyit isterse (meta.onay_bekleyen) bağlamı
  // saklarız ve BİR SONRAKİ cümleyi onunla göndeririz ("evet" → uygula). Geri alınamaz iş
  // asla tek komutla yapılmaz — yazılı sohbetteki iki-adımlı kuralın sesli karşılığı.
  const onayRef = useRef(null);
  // Araç turu senkronizasyonu — "sonucu yazdık VE aktif yanıt bitti" koşulu SAF ve testli
  // bir makinede (lib/realtimeSes.aracTuruOlustur); burada yalnız örneği tutuyoruz.
  const aracTuruRef = useRef(null);
  if (aracTuruRef.current === null) aracTuruRef.current = aracTuruOlustur();
  const rtRef = useRef(null);        // aktif realtime oturumu ({gonder, kapat, pc})
  const rtAktifRef = useRef(false);  // realtime mi eski zincir mi (temizle/kes bunu okur)
  const sonUserRef = useRef("");     // model araca soru vermezse son transkripti kullan
  const sonEtkilesimRef = useRef(0); // son kullanıcı konuşması (boşta-kapanış sayacı)
  const oturumBaslangicRef = useRef(0);

  const orbRef = useRef(null);
  const haloRef = useRef(null);
  const parlaRef = useRef(null);    // çekirdek parlaması (genlik + durum tabanı)
  const sonKareRef = useRef(0);     // önceki rAF damgası → dt (çerçeve-bağımsız yumuşatma)
  const olcuRef = useRef(0);        // orb px boyutu (clip-path sıvı kenar için ölçülür)
  const dialogRef = useRef(null);
  const urlRef = useRef(null);      // çalan TTS blob URL'i — barge-in/kapatmada revoke edilir
  const micSrcRef = useRef(null);   // mic MediaStreamSource — kapanışta disconnect

  useEffect(() => { durumRef.current = durum; }, [durum]);
  useEffect(() => { acikRef.current = acik; }, [acik]);
  useEffect(() => { ekranRef.current = ekran; }, [ekran]);

  const gecir = useCallback((olay) => setDurum((d) => sonrakiDurum(d, olay)), []);

  // --- rAF: aktif kaynağın genliğini oku → orb scale + halo glow sür (tek sahip) ---
  const dongu = useCallback((ts) => {
    const d = durumRef.current;
    let kaynak = null;
    if (d === DURUM.DINLIYOR && !susturRef.current) kaynak = micAnalizRef.current;
    else if (d === DURUM.KONUSUYOR) kaynak = oynatAnalizRef.current;
    let hedef = 0;
    if (kaynak && bufRef.current) {
      kaynak.getByteTimeDomainData(bufRef.current);
      hedef = rmsGenlik(bufRef.current);
    }
    // dt: gerçek geçen süre. Kare-sayısı yerine ZAMAN kullanmak zorunlu — sabit kare
    // katsayısı orb'un karakterini kullanıcının tazeleme hızına bağlıyordu (bkz. yumusatZamanli).
    const dt = sonKareRef.current ? ts - sonKareRef.current : 16.7;
    sonKareRef.current = ts;
    seviyeRef.current = yumusatZamanli(seviyeRef.current, hedef, dt);
    // Karenin görsel matematiği SAF ve paylaşımlı (lib/orbCizim.orbKare) — orb-lab düzeneği
    // aynı fonksiyonu sürdüğü için orada görülen kare burada çalan karenin AYNISIDIR.
    const kare = orbKare({
      boyut: olcuRef.current, seviye: seviyeRef.current, ts,
      azHareket: azHareketRef.current, durum: d,
    });
    if (orbRef.current) {
      orbRef.current.style.transform = `scale(${kare.scale.toFixed(4)})`;
      // clipPath (dalgalı blob kenarı) bilinçli olarak YAZILMAZ: mühür diski düz daire kalır,
      // ses mührün basıncı (scale) + halkalarla görünür (tur 8, SesliOrb başlığı).
    }
    if (haloRef.current) haloRef.current.style.opacity = kare.haloOpacity.toFixed(3);
    if (parlaRef.current) parlaRef.current.style.opacity = kare.parlaklik.toFixed(3);
    rafRef.current = requestAnimationFrame(dongu);
  }, []);

  // --- SSE beyin çağrısı (/sohbet/stream) → yanıt metnini biriktir, canlı göster ---
  // onCumle: yanıt AKARKEN tamamlanan her cümle için çağrılır → ilk cümle, LLM daha yazarken
  // seslendirilmeye başlar (bkz. lib/sesKuyrugu.js — sessiz bekleme buradan kalkıyor).
  const beyinCagir = useCallback(async (metin, onCumle) => {
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await authFetch("/sohbet/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // Çok-turlu hafıza: bu tura kadarki geçmişi gönder → "peki kaçı acil?" gibi takipler bağlam kazanır.
      // ekran: konuşma anındaki görünen ekran → "bu evrak", "buradaki liste" araması gerektirmez.
      // onay_baglam: bir önceki tur teyit istediyse bu cümle o teyidin cevabıdır ("evet"/"vazgeç").
      body: JSON.stringify({
        mesaj: metin, gecmis: gecmisRef.current, sesli: true,
        ...(ekranRef.current ? { ekran: ekranRef.current } : {}),
        ...(onayRef.current ? { onay_baglam: onayRef.current } : {}),
      }), signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", yanit = "";
    let konusulan = 0;   // seslendirmeye verilen karakter sayısı (yanıt önekinin sonu)
    // Konuşulmamış kuyruğu cümlelere böl; tamamlananları seslendirmeye ver.
    const cumleleriAkit = (zorla) => {
      if (!onCumle) return;
      const { cumleler } = cumleAyir(yanit.slice(konusulan), { zorla });
      for (const c of cumleler) {
        const nerede = yanit.slice(konusulan).indexOf(c);
        if (nerede < 0) continue;   // savunma: offset geri gidip cümleyi İKİ KEZ konuşmasın
        konusulan += nerede + c.length;
        onCumle(c);
      }
    };
    const isle = (blok) => {
      const satir = blok.split("\n").find((l) => l.startsWith("data:"));
      if (!satir) return;
      let ev; try { ev = JSON.parse(satir.slice(5)); } catch { return; }
      // meta: yazılı sohbette butona bağlanan alanlar. Sesli sahne bunları GÖRMEZDEN
      // GELİYORDU → asistan "onaylayayım mı?" diyor ama "evet" cevabı bağlamsız gidiyordu
      // (teyit hiç tamamlanmıyordu). Artık bağlam saklanır, sonraki cümleyle geri gönderilir.
      if (ev.event === "meta") { onayRef.current = ev.onay_bekleyen || null; return; }
      if (ev.event === "delta" && ev.t) { yanit += ev.t; setSonYanit(yanit); cumleleriAkit(false); }
      else if (ev.event === "done") {
        // 'done' tam metni taşır. Konuşulmuş öneki KORU: farklı bir metin gelirse baştaki
        // cümleler ikinci kez seslendirilmesin (tekrar/atlama olmaz).
        const tam = ev.yanit || yanit;
        if (konusulan === 0 || tam.startsWith(yanit.slice(0, konusulan))) yanit = tam;
        // Tam metin konuşulan önekten KISAYSA offset taşar ve henüz seslendirilmemiş kuyruk
        // hiç konuşulmadan kaybolurdu.
        konusulan = Math.min(konusulan, yanit.length);
        setSonYanit(yanit);
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) !== -1) { isle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    buf += dec.decode(); if (buf.trim()) isle(buf);
    cumleleriAkit(true);   // akış bitti → kalan son cümle de konuşulur
    return yanit.trim();
  }, []);

  // --- TTS parçası getir (/sohbet/seslendir) → Blob | null (null = ses yok, metne düş) ---
  const sesGetir = useCallback(async (metin) => {
    const duz = sesliMetneCevir(metin);
    if (!duz) return null;
    let res;
    try {
      res = await authFetch("/sohbet/seslendir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metin: duz }),
      });
    } catch { return null; }
    if (!res.ok) {
      // TTS anahtarı yok/hatası → metin-only'e düş; döngüyü çağıran (turIsle) sürdürür.
      if (res.status === 503) setUyari("Sesli yanıt için OPENAI_TTS_API_KEY gerekli — şimdilik yalnız metin.");
      return null;
    }
    return res.blob();
  }, []);

  // --- Bir ses parçasını çal; çalma BİTİNCE resolve et (kuyruk sırayı buna göre yürütür) ---
  const oynatBlob = useCallback((blob) => new Promise((resolve) => {
    const el = audioElRef.current;
    if (!el) { resolve(); return; }
    // Tek <audio> elemanı + tek-slot handler: ikinci bir oynatma başlarsa birincinin `kapat`ı
    // erişilemez olur ve promise'i SONSUZA KADAR askıda kalır (kuyruk sessizce kilitlenir).
    // Sahiplik jetonu: yeni sahip gelince eski sahip hemen çözülür.
    oncekiOynatmayiBitirRef.current?.();
    // MediaElementSource ELEMANA BİR KEZ bağlanabilir — AudioContext oturumlar arası YAŞAR
    // (temizle onu kapatmaz), böylece 2. oturumdan sonra createMediaElementSource InvalidState
    // atmaz ve orb TTS genliğine reaksiyon vermeye devam eder (reviewer bulgusu #2).
    if (!mediaBagliRef.current && ctxRef.current) {
      try {
        const src = ctxRef.current.createMediaElementSource(el);
        const an = ctxRef.current.createAnalyser();
        an.fftSize = FFT; an.smoothingTimeConstant = 0.4;
        src.connect(an); an.connect(ctxRef.current.destination);
        oynatAnalizRef.current = an; mediaBagliRef.current = true;
      } catch { /* bağlanamazsa ses yine çalar, orb düz kalır */ }
    }
    // Önceki parçanın URL'ini bırak (barge-in/pause 'ended' tetiklemez → sızıntı olmasın, #3).
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    let bitti = false;
    // Tek-sefer kapanış: ended · error · pause (barge-in/temizle) hangisi önce gelirse.
    // Resolve ETMEZSE kuyruk o parçada kilitlenir — bu yüzden ÜÇ yol da buraya bağlı.
    const kapat = () => {
      if (bitti) return;
      bitti = true;
      if (oncekiOynatmayiBitirRef.current === kapat) oncekiOynatmayiBitirRef.current = null;
      el.onended = null; el.onerror = null; el.onpause = null;
      if (urlRef.current === url) { URL.revokeObjectURL(url); urlRef.current = null; }
      resolve();
    };
    oncekiOynatmayiBitirRef.current = kapat;
    el.src = url;
    el.onended = kapat;
    el.onerror = kapat;    // oynatma ORTASINDA hata (decode/ağ) → kuyruk ilerlesin (#5)
    el.onpause = kapat;    // barge-in: kes() pause eder, 'ended' gelmez
    el.play().catch(kapat);
  }), []);

  // --- Bir tur: transcript → beyin (akarken cümle cümle seslendir) → tekrar dinle ---
  // KRİTİK: sesin çalmadığı her çıkış (boş yanıt · ağ · 503 · play reddi) döngüyü sürdürmek
  // için dinle() çağırır — aksi halde yanıt gösterilir ama tekrar dinlenmez, görüşme takılırdı.
  const turIsle = useCallback(async (metin) => {
    hataSayacRef.current = 0;   // sesim duyuldu → hata sayacını sıfırla
    // Boşta-kapanış sayacı ESKİ ZİNCİRDE de beslenmeli: realtime yolunda sayacı
    // `input_audio_buffer.speech_started` sıfırlıyor, ama eski zincirde öyle bir olay yok —
    // sayaç sahne açılışında bir kez kurulup bir daha dokunulmuyordu, yani kullanıcı KONUŞMAYA
    // DEVAM ETSE BİLE görüşme 3 dakikada zorla kapanıyordu. Transkript geldiyse kullanıcı burada.
    sonEtkilesimRef.current = Date.now();

    // --- KOMUT YOLU: ağa hiç çıkmadan uygula (gezinme bir soru değil, emirdir) ---
    // Teyit bekliyorsak atlanır: o durumda söylenen şey bekleyen sorunun CEVABIDIR.
    // SESLENDİRME YOK ve "Düşünüyor" durumuna hiç geçilmez: komut 30 ms'de uygulanıyor,
    // oysa TTS turu 2-3 sn sürüyordu — kullanıcı ekranın değiştiğini çoktan görmüşken
    // "açılıyor" diyen geç bir ses duyuyordu (canlı bulgu). Eylemin kendisi geri bildirimdir;
    // orb kesintisiz DİNLEMEDE kalır, kullanıcı hemen bir sonraki komutu verebilir.
    const komut = onayRef.current ? { tur: "yok" } : komutCoz(metin, {
      basliklar: ekranRef.current?.liste?.ilkler || [],
    });
    if (komut.tur !== "yok") {
      const onay = komutOnayi(komut);
      onKomut?.(komut); setTur((n) => n + 1); setSonEylem(onay);
      setSonUser(metin); setSonYanit(onay);   // görünmez (SR_ONLY) — ekran okuyucu için
      gecmisRef.current = [...gecmisRef.current,
        { rol: "kullanici", icerik: metin }, { rol: "asistan", icerik: onay }].slice(-8);
      if (acikRef.current) dinle();
      return;
    }

    setSonUser(metin); setSonYanit(""); setTur((n) => n + 1); gecir("sonuc");
    const kuyruk = sesKuyruguOlustur({
      sesGetir, oynat: oynatBlob, onIlkSes: () => gecir("yanit_basladi"),
      onIptal: () => audioElRef.current?.pause(),   // kesme/hata: çalan ses de sussun
    });
    kuyrukRef.current = kuyruk;

    try {
      const yanit = await beyinCagir(metin, (c) => kuyruk.ekle(c));
      if (!acikRef.current) return;
      if (yanit) {
        // Turu hafızaya ekle (son 8 mesaj — backend şema sınırı) → sonraki tur bağlam taşır.
        gecmisRef.current = [...gecmisRef.current,
          { rol: "kullanici", icerik: metin }, { rol: "asistan", icerik: yanit }].slice(-8);
      }
      const { iptal } = await kuyruk.bitir();   // tüm cümleler çalınana kadar bekle
      // KESİLDİYSE turu İLERLETME: kes() zaten dinlemeyi başlattı; buradan ikinci bir
      // dinle() taze tanıyıcıyı durdurup kullanıcının kesme sözünü yerdi.
      if (iptal || !acikRef.current || kuyrukRef.current !== kuyruk) return;
      gecir("yanit_bitti"); dinle();
    } catch {
      kuyruk.iptal();   // onIptal → çalan ses susar (asistan kendi sesini transkript etmesin)
      if (acikRef.current) { setUyari("Yanıt alınamadı — tekrar dinliyorum."); gecir("hata"); dinle(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beyinCagir, sesGetir, oynatBlob, gecir, onKomut]);

  // --- Dinlemeyi başlat (SpeechRecognition, tr-TR). Sonuç → turIsle. ---
  const dinle = useCallback(() => {
    if (!acikRef.current || susturRef.current) return;
    if (!sttDestekleniyorMu()) { setUyari("Bu tarayıcı ses tanımayı desteklemiyor (Chrome/Edge önerilir)."); return; }
    // Önceki tanıma instance'ını durdur → referanssız "orphan" sürekli-dinleyen kalmasın (#1).
    try { tanimaRef.current?.stop(); } catch { /* yoksay */ }
    tanimaRef.current = null;
    gecir("dinle");
    const t = sesTanimaOlustur({
      onAra: (m) => { if (m && durumRef.current === DURUM.DINLIYOR) setSonUser(m); }, // canlı kelimeler
      onSonuc: (m) => { if (m) turIsle(m); },
      onBitti: () => {
        // YALNIZ hâlâ GÜNCEL instance isek yeniden başlat — eski/orphan t kendini restart etmesin.
        if (tanimaRef.current === t && acikRef.current && durumRef.current === DURUM.DINLIYOR && !susturRef.current) {
          try { t.start(); } catch { /* zaten çalışıyor */ }
        }
      },
      onHata: (e) => {
        // Sessiz başarısızlık en can sıkıcısı: ardışık no-speech/ağ hatasında eşikte uyar
        // (izin reddi hariç — o zaten kur() catch'inde ayrı mesaj alır).
        if (e?.error === "not-allowed") return;
        hataSayacRef.current += 1;
        if (hataSayacRef.current >= 3) setUyari("Sizi duyamıyorum — mikrofonunuzu kontrol edip tekrar konuşun.");
      },
    });
    if (!t) return;
    tanimaRef.current = t;
    try { t.start(); } catch { /* yoksay */ }
  }, [gecir, turIsle]);

  const urlBirak = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  // --- Barge-in / durdur: konuşurken orb'a dokun → sesi kes, dinlemeye dön ---
  const kes = useCallback(() => {
    if (durumRef.current !== DURUM.KONUSUYOR) return;
    // Realtime'da kesme protokolün kendisinde: response.cancel + çalan sesi sustur.
    if (rtAktifRef.current) {
      // Canlı akışta <audio>'yu duraklatmak akışı da dondurur; kesme protokolün kendisinde:
      // response.cancel üretimi durdurur, model hemen dinlemeye döner.
      rtRef.current?.gonder({ type: "response.cancel" });
      gecir("kes");
      return;
    }
    // SIRA ÖNEMLİ: önce kuyruğu iptal et — aksi halde pause, çalan parçayı bitirip kuyruktaki
    // SONRAKİ cümleyi çalmaya başlar ve barge-in işe yaramaz.
    kuyrukRef.current?.iptal();
    const el = audioElRef.current;
    // currentTime ataması kaynak boşaltılmışken atabilir; atarsa barge-in yarıda kalıp
    // oturum KONUSUYOR'da kilitlenirdi. pause() zaten yeterli, sıfırlama best-effort.
    if (el) { el.pause(); try { el.currentTime = 0; } catch { /* yoksay */ } }
    urlBirak();                                    // URL'i elle bırak (#3)
    gecir("kes"); dinle();
  }, [gecir, dinle, urlBirak]);

  // --- Oturum sökme (overlay kapanışı). AudioContext'i KAPATMAZ — oturumlar arası yaşar
  //     (MediaElementSource bir-kez-bağlanma kuralı, #2). Tam kapatma unmount effect'inde. ---
  const temizle = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    // Realtime oturumu: peer bağlantısı + mikrofon izleri kapanır. Kapatılmazsa sahne
    // kapandıktan sonra da mikrofon açık kalır ve fatura işlemeye devam eder.
    try { rtRef.current?.kapat(); } catch { /* yoksay */ }
    rtRef.current = null; rtAktifRef.current = false;
    oynatAnalizRef.current = null;   // uzak akış analizörü oturuma özgüdür
    abortRef.current?.abort();
    kuyrukRef.current?.iptal(); kuyrukRef.current = null;
    try { tanimaRef.current?.stop(); } catch { /* yoksay */ }
    tanimaRef.current = null;
    // Handler'lar BİLEREK sökülmez: oynatBlob'un tek-sefer `kapat`ı pause olayında çalışıp
    // URL'i bırakır ve bekleyen promise'i çözer (artık dinle() tetiklemiyor — yalnız resolve).
    audioElRef.current?.pause();
    urlBirak();
    try { micSrcRef.current?.disconnect(); } catch { /* yoksay */ }
    micSrcRef.current = null;
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    micAnalizRef.current = null; seviyeRef.current = 0;
    // ctx / oynatAnaliz / mediaBagli KORUNUR (bir sonraki açılışta yeniden kullanılır).
  }, [urlBirak]);

  // --- REALTIME MOTORU (birincil) ---------------------------------------------------------
  // Ses tarayıcı ↔ OpenAI arasında DOĞRUDAN akar; sunucumuz yalnız kısa ömürlü anahtarı üretir.
  // Ölçüm: eski zincir ilk sesi ~3184 ms'de veriyordu, realtime ~1000 ms.
  // Model mevzuat/kayıt sorularını KENDİ BİLGİSİNDEN cevaplamaz: `kamu_evrak_sor` aracını
  // çağırır, biz o soruyu GÜNCEL ekran bağlamıyla /sohbet ucuna sorarız, cevabı modele
  // veririz. Böylece hız realtime'dan, doğruluk bizim grounded pipeline'dan gelir.
  const aracaSor = useCallback(async (soru) => {
    try {
      // /sohbet DEĞİL /sohbet/veri: o uç veriyi cümleye çeviriyordu, realtime modeli de aynı
      // cümleyi yeniden kuruyordu — aynı iş iki kez, ölçülen 8789 ms'nin ~4 sn'si buydu.
      // Artık kompozisyon TEK yerde (realtime), veri ve grounding TEK yerde (bizde).
      const res = await authFetch("/sohbet/veri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soru,
          ...(ekranRef.current ? { ekran: ekranRef.current } : {}),
          ...(onayRef.current ? { onay_baglam: onayRef.current } : {}),
        }),
      });
      if (!res.ok) return JSON.stringify({ hata: "Kayıtlara şu an ulaşılamadı." });
      const y = await res.json();
      onayRef.current = y.onay_bekleyen || null;   // teyit gerekiyorsa sonraki tura taşı
      gecmisRef.current = [...gecmisRef.current, { rol: "kullanici", icerik: soru }].slice(-8);
      // Aksiyon yollarında (onay/revize/kurul) metin zaten karar cümlesidir — olduğu gibi ver.
      return y.tur === "aksiyon" ? y.metin : JSON.stringify(y);
    } catch {
      return JSON.stringify({ hata: "Kayıtlara şu an ulaşılamadı." });
    }
  }, []);

  // Araç turunun iki koşulu da sağlandı → yanıt iste (tek yerde, iki farklı sıralamadan da
  // buraya düşülüyor; hangi koşulun tamamlandığını makine biliyor).
  const aracYanitiniIste = useCallback(() => {
    if (!rtRef.current) return;
    gecir("sonuc");                         // araç cevabı hazırlanıyor → "Düşünüyor"
    yanitIste(rtRef.current.gonder);
  }, [gecir]);

  const rtOlay = useCallback((olay) => {
    // Kullanıcı konuştu → boşta-kapanış sayacı sıfırlanır (model konuşması SAYILMAZ:
    // asistanın kendi kendine konuşması "kullanıcı burada" anlamına gelmez).
    if (olay.type === "input_audio_buffer.speech_started") sonEtkilesimRef.current = Date.now();
    // Realtime API hatası SESSİZ KALMAZ: teşhis edilemeyen "ses gelmedi" durumları buradan
    // görünür hâle gelir (aktif-yanıt çakışması tam da böyle gizlenmişti).
    if (olay.type === "error") {
      setUyari("Sesli bağlantıda sorun oldu — tekrar deneyin.");
      console.warn("realtime hata", olay.error || olay);
    }
    // Ses AKMAYA BAŞLADIYSA durum tartışmasız KONUŞUYOR'dur. Guard'lı geçiş yetmiyor: araç
    // turundan sonra durum DİNLİYOR'a düşmüş oluyor ve `yanit_basladi` yalnız DÜŞÜNÜYOR'dan
    // geçtiği için orb, model konuşurken "Dinliyor" görünüyordu (canlı bulgu).
    if (olay.type === "output_audio_buffer.started" || olay.type === "response.output_audio.delta") {
      setDurum(DURUM.KONUSUYOR); durumRef.current = DURUM.KONUSUYOR;
      return;
    }
    // Araç turu iki koşul bekler (kural ve gerekçesi: lib/realtimeSes.aracTuruOlustur).
    // Araç turunun ORTASINDAKİ response.done tur sonu değildir — durum makinesine verilmez.
    if (olay.type === "response.done") {
      const { turSonu, yanitIstenmeli } = aracTuruRef.current.yanitTamamlandi();
      if (yanitIstenmeli) aracYanitiniIste();
      if (!turSonu) return;
    }
    const gecis = sonrakiSesliDurum(olay.type);
    if (gecis) gecir(gecis);

    // Kullanıcının söylediği yazıya döküldü → ÖNCE deterministik komut dene (ağ turu yok).
    if (olay.type === "conversation.item.input_audio_transcription.completed") {
      const metin = (olay.transcript || "").trim();
      if (!metin) return;
      setSonUser(metin); sonUserRef.current = metin; setTur((n) => n + 1);
      const komut = onayRef.current ? { tur: "yok" } : komutCoz(metin, {
        basliklar: ekranRef.current?.liste?.ilkler || [],
      });
      if (komut.tur !== "yok") {
        onKomut?.(komut);
        // Model bu tur için konuşmaya başlamış olabilir: kes. Eylem zaten görünür geri bildirim.
        rtRef.current?.gonder({ type: "response.cancel" });
        setSonYanit(komutOnayi(komut)); setSonEylem(komutOnayi(komut));
      }
      return;
    }
    if (olay.type === "response.output_audio_transcript.delta") {
      setSonYanit((s) => s + (olay.delta || ""));
      return;
    }
    if (olay.type === "response.created") setSonYanit("");
    // Araç çağrısı: argümanlar parça parça akar, YALNIZ .done çalıştırılabilir.
    if (aracTamamlandiMi(olay)) {
      const tur = aracTuruRef.current;
      tur.basla();
      const { soru } = aracArgumanlari(olay);
      aracaSor(soru || sonUserRef.current).then((cevap) => {
        if (!rtRef.current) return;
        aracCiktisiniYaz(rtRef.current.gonder, olay.call_id, cevap);
        if (tur.ciktiyiYazdik()) aracYanitiniIste();
      });
    }
  }, [gecir, onKomut, aracaSor, aracYanitiniIste]);

  const kurRealtime = useCallback(async () => {
    const res = await authFetch("/sohbet/realtime/anahtar", { method: "POST" });
    if (!res.ok) throw new Error(`anahtar ${res.status}`);   // 503 → çağıran eski zincire düşer
    const { anahtar, model } = await res.json();

    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx(); ctxRef.current = ctx;
    }
    if (ctx.state === "suspended") await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    if (!acikRef.current) { stream.getTracks().forEach((t) => t.stop()); throw new Error("kapandı"); }
    micStreamRef.current = stream;
    const micKaynak = ctx.createMediaStreamSource(stream);
    micSrcRef.current = micKaynak;
    const micAn = ctx.createAnalyser(); micAn.fftSize = FFT; micAn.smoothingTimeConstant = 0.4;
    micKaynak.connect(micAn); micAnalizRef.current = micAn;
    bufRef.current = new Uint8Array(micAn.fftSize);

    rtRef.current = await realtimeBaglan({
      anahtar, model, mikrofon: stream, sesElemani: audioElRef.current, onOlay: rtOlay,
      // Orb genliği artık TTS blob'undan değil canlı uzak akıştan okunuyor.
      onUzakAkis: (akis) => {
        try {
          const kaynak = ctx.createMediaStreamSource(akis);
          const an = ctx.createAnalyser(); an.fftSize = FFT; an.smoothingTimeConstant = 0.4;
          kaynak.connect(an); oynatAnalizRef.current = an;
        } catch { /* analiz kurulamazsa orb düz kalır, görüşme sürer */ }
      },
    });
    rtAktifRef.current = true;
    gecir("dinle");
  }, [rtOlay, gecir]);

  const kur = useCallback(async () => {
    azHareketRef.current = azHareketMi();
    setUyari(""); setSonUser(""); setSonYanit(""); setSusturuldu(false); susturRef.current = false; setTur(0); setSonEylem("");
    gecmisRef.current = [];   // her oturum temiz hafızayla başlar
    onayRef.current = null;   // önceki oturumdan sarkan teyit bağlamı taşınmaz
    // Araç turu ortasında kapatılan bir oturum, "bekliyor" bayrağını açık bırakırdı: yeni
    // oturumun İLK response.done'ı araç turu sanılıp yutulur ve orb "Yanıtlıyor"da kalırdı.
    aracTuruRef.current.sifirla();
    olcuRef.current = orbRef.current?.clientWidth || 0;   // sıvı kenar için orb px boyutu
    sonKareRef.current = 0;   // dt taze başlasın; eski oturumun damgası dev bir dt üretirdi
    rafRef.current = requestAnimationFrame(dongu);
    // BİRİNCİL: realtime. Anahtar ucu 503 verirse (SESLI_REALTIME=0, anahtar yok, ağ) ya da
    // WebRTC kurulamazsa (kurum güvenlik duvarı) sessizce aşağıdaki eski zincire düşülür —
    // sesli görüşme hiçbir durumda tamamen kaybolmaz.
    try {
      await kurRealtime();
      return;
    } catch {
      rtAktifRef.current = false;
      try { rtRef.current?.kapat(); } catch { /* yoksay */ }
      rtRef.current = null;
      if (!acikRef.current) return;
    }
    try {
      // Var olan context'i YENİDEN KULLAN (oturumlar arası yaşar); yoksa/ölüyse yeni kur.
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx(); ctxRef.current = ctx;
        mediaBagliRef.current = false; oynatAnalizRef.current = null; // yeni context → yeniden bağla
      }
      if (ctx.state === "suspended") await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      // Yarış guard'ı: getUserMedia beklerken overlay kapanmış olabilir (#4).
      if (!acikRef.current || ctx.state === "closed") { stream.getTracks().forEach((tr) => tr.stop()); return; }
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      micSrcRef.current = src;
      const an = ctx.createAnalyser(); an.fftSize = FFT; an.smoothingTimeConstant = 0.4;
      src.connect(an); micAnalizRef.current = an;         // yalnız analiz — hoparlöre BAĞLANMAZ (echo yok)
      bufRef.current = new Uint8Array(an.fftSize);
      // KARŞILAMA YOK — mikrofon açılır açılmaz DİNLER (kullanıcı kararı). Eskiden burada
      // bir karşılama ucu (2,5 sn timeout) + selam TTS'i + selamın okunması vardı: kullanıcı
      // konuşmaya başlayana kadar ~8 sn "Düşünüyor/Yanıtlıyor" bekliyordu. Sahne artık sessiz
      // açılır ve ilk sözü kullanıcı söyler; o uç ve modülü depodan da kaldırıldı.
      dinle();
    } catch {
      if (acikRef.current) setUyari("Mikrofon izni gerekli — tarayıcı çubuğundan izin verip tekrar açın.");
    }
  }, [dongu, dinle, kurRealtime]);

  // Component tamamen unmount olunca AudioContext'i kapat (oturum sökme onu koruyordu).
  useEffect(() => () => { try { ctxRef.current?.close(); } catch { /* yoksay */ } }, []);

  useEffect(() => {
    if (!acik) return;
    dialogRef.current?.focus();   // odağı diyalog kabına al → ESC + odak döngüsü fiilen çalışır (a11y)
    kur();
    return temizle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  // Reduced-motion CANLI takip: rAF-sürümlü orb morph'una CSS kill-switch erişemez; görüşme
  // ortasında tercihi değiştiren kullanıcı için change dinleyicisi şart (tek seferlik örnekleme
  // bayatlıyordu). kur()'daki ilk örnekleme korunur; burası değişimi yakalar.
  useEffect(() => {
    if (!acik) return undefined;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const din = (e) => { azHareketRef.current = e.matches; setAzHareket(e.matches); };
    din(mq);   // açılış anındaki gerçek değerle senkronla
    mq.addEventListener?.("change", din);
    return () => mq.removeEventListener?.("change", din);
  }, [acik]);

  // Orb px boyutu sıvı kenarı besler ve MASA_ORB viewport'a bağlıdır (min(168px,
  // 100vh-300)). Tek seferlik ölçüm pencere yeniden boyutlanınca bayatlıyor: kutu küçülürse
  // clip taşar ve KENAR DALGALANMASI TAMAMEN KAYBOLUR, büyürse küre kutusundan küçük kalır.
  useEffect(() => {
    const el = orbRef.current;
    if (!acik || !el || typeof ResizeObserver === "undefined") return undefined;
    const gozlemci = new ResizeObserver(([giris]) => {
      olcuRef.current = giris?.contentRect?.width || el.clientWidth || 0;
    });
    gozlemci.observe(el);
    return () => gozlemci.disconnect();
  }, [acik]);

  const kapat = useCallback(() => { setDurum(DURUM.HAZIR); onKapat?.(); }, [onKapat]);

  // Maliyet koruması: boşta kalan ya da çok uzayan oturumu kendiliğinden kapat.
  // Yalnız realtime yolunda anlamlı (eski zincirde ses sürekli akmıyor), ama iki yolda da
  // zararsız çalışır — açık unutulan sahne her hâlükârda mikrofonu meşgul ediyor.
  useEffect(() => {
    if (!acik) return undefined;
    sonEtkilesimRef.current = Date.now();
    oturumBaslangicRef.current = Date.now();
    let kapanisZamani = null;
    const sayac = setInterval(() => {
      const simdi = Date.now();
      const bosta = simdi - sonEtkilesimRef.current;
      const omur = simdi - oturumBaslangicRef.current;
      const neden = bosta >= BOS_KAPANIS_MS
        ? "Bir süredir konuşulmadığı için görüşme kapatılıyor."
        : omur >= AZAMI_OTURUM_MS
          ? "Görüşme süresi doldu — dilediğinde yeniden başlatabilirsin."
          : null;
      if (!neden || kapanisZamani) return;
      // Sebebi ÖNCE göster, sonra kapat: sahneyle birlikte uyarı da yok olduğu için
      // kullanıcı sebepsiz kapanma yaşıyordu (canlı testte yakalandı).
      clearInterval(sayac);
      setUyari(neden);
      kapanisZamani = setTimeout(kapat, 2600);
    }, SAYAC_ARALIK_MS);
    return () => { clearInterval(sayac); if (kapanisZamani) clearTimeout(kapanisZamani); };
  }, [acik, kapat]);

  const susturDegistir = useCallback(() => {
    setSusturuldu((v) => {
      const yeni = !v; susturRef.current = yeni;
      micStreamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = !yeni));
      if (yeni) { try { tanimaRef.current?.stop(); } catch { /* yoksay */ } }
      // REALTIME'DA dinle() ÇAĞIRMA: orada dinleme WebRTC izinin KENDİSİDİR — iz yeniden
      // etkinleşince model zaten duyar. dinle() burada tarayıcı STT'sini de başlatırdı ve
      // sustur→aç yapan kullanıcıda İKİ MOTOR birden cevap verirdi (realtime konuşurken eski
      // zincir de /sohbet/stream + TTS turu açar → üst üste binen iki ses).
      else if (!rtAktifRef.current && durumRef.current !== DURUM.KONUSUYOR) dinle();
      return yeni;
    });
  }, [dinle]);

  const konusuyor = durum === DURUM.KONUSUYOR;
  const sutun = !!konum?.sutun;   // ≥1280: danışma sütununun yerine geçer (ChatbotWidget)
  const dusunuyor = durum === DURUM.DUSUNUYOR;

  return (
    <>
      {/* autoplay ZORUNLU: realtime'da model sesi bir MediaStream olarak srcObject'e bağlanır
          ve play() çağıran kimse yoktur (eski zincirde blob'u biz çalıyorduk). */}
      <audio ref={audioElRef} autoPlay hidden aria-hidden="true" />

      <AnimatePresence>
      {acik && (
        // motion kabı YALNIZ hareket taşır; ref/rol/odak içteki düz div'de. AnimatePresence
        // (PopChild) çocuğun props.ref'ini okur → React 18'de her açılışta "`ref` is not a
        // prop" uyarısı basıyordu (tur 6 konsol bulgusu).
        <motion.div key="ke-sesli"
          initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.2, ease: EASE_BEZIER.out }}
          style={{ position: "fixed", zIndex: 170, pointerEvents: "none",
            // Masaüstünde SAĞ-alt köşe (tur 7): sol çapada disk, Gelen/İşlenen satırlarının ilk
            // sütununu (kayıt no) örtüyordu. Sağ kenar boşluğu satır sonundaki eylem alanına denk
            // gelir; konum yalnız "masaüstü mü" + alt hiza için okunur.
            ...(sutun ? SUTUN_DOK : konum ? { right: SP.xl, bottom: Math.max(SP.l, konum.bottom), width: MASA_GENISLIK } : TELEFON_DOK),
            transformOrigin: konum ? "bottom right" : "bottom center" }}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-label="Sesli görüşme" onKeyDown={(e) => { if (e.key === "Escape") kapat(); }}
            style={sutun ? SUTUN_SAHNE : konum ? MASA_SAHNE : TELEFON_SAHNE}>
            <div aria-live="polite" style={SR_ONLY}>{DURUM_ETIKET[durum]}</div>
            {sutun ? (
              <>
                <SesliSutunBasligi baglamAdi={baglamAdi} kapat={kapat} />
                {/* Optik merkez: üst boşluk 0,6 / alt 1 oranında (küre ~%38'de oturur). */}
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 ${SP.xl}px` }}>
                  <div aria-hidden="true" style={{ flex: 0.6 }} />
                  <DurumKunyesi durum={durum} ortala />
                  <div style={{ height: SP.xl }} />
                  <SesliOrbDugme boyut={SUTUN_ORB} konusuyor={konusuyor} kes={kes} dusunuyor={dusunuyor} azHareket={azHareket} orbRef={orbRef} haloRef={haloRef} parlaRef={parlaRef} />
                  <div style={{ height: SP.xl }} />
                  <SesliKontroller susturuldu={susturuldu} susturDegistir={susturDegistir} kapat={kapat} />
                  {uyari && <p role="status" aria-live="polite" style={{ margin: `${SP.l}px 0 0`, textAlign: "center", ...TYPE.meta, color: PAL.mut }}>{uyari}</p>}
                  <div aria-hidden="true" style={{ flex: 1 }} />
                </div>
                <div style={SR_ONLY}>{sonUser}{sonYanit ? ` — ${sonYanit}` : ""}</div>
                <OturumKunyesi tur={tur} sonEylem={sonEylem} />
              </>
            ) : (<>
            {!konum && <SesliOrbDugme boyut={TELEFON_ORB} konusuyor={konusuyor} kes={kes} dusunuyor={dusunuyor} azHareket={azHareket} orbRef={orbRef} haloRef={haloRef} parlaRef={parlaRef} />}
            <div style={konum ? { display: "contents" } : { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: SP.m, minWidth: 0, flex: 1 }}>
              <DurumKunyesi durum={durum} ortala={!!konum} />
              {konum && <SesliOrbDugme boyut={sutun ? SUTUN_ORB : MASA_ORB} konusuyor={konusuyor} kes={kes} dusunuyor={dusunuyor} azHareket={azHareket} orbRef={orbRef} haloRef={haloRef} parlaRef={parlaRef} />}
              {/* Konuşulan metin GÖRÜNMEZ (kullanıcı kararı: altyazı yok); ekran okuyucuya açık. */}
              <div style={SR_ONLY}>{sonUser}{sonYanit ? ` — ${sonYanit}` : ""}</div>
              <SesliKontroller susturuldu={susturuldu} susturDegistir={susturDegistir} kapat={kapat} />
              {/* Uyarı ALTYAZI DEĞİL: izin yok / TTS yok gibi sessiz kalınca anlaşılamayacak durumlar. */}
              {uyari && (
                <p role="status" aria-live="polite" style={{ position: "relative", zIndex: 1, margin: 0, maxWidth: "100%", textAlign: konum ? "center" : "left", ...TYPE.meta, color: PAL.mut }}>{uyari}</p>
              )}
            </div>
            </>)}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
