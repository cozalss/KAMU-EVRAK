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
import { authFetch } from "../lib/authApi.js";
import { DURUM, rmsGenlik, sonrakiDurum, yumusat } from "../lib/sesGorusme.js";
import { blobNoktalari, blobYolu } from "../lib/orbCizim.js";
import { sesTanimaOlustur, sttDestekleniyorMu } from "../lib/sesliMod.js";
import { sesliMetneCevir } from "../lib/sesliMod.js";
import { cumleAyir, sesKuyruguOlustur } from "../lib/sesKuyrugu.js";
import { komutCoz, komutOnayi } from "../lib/sesliKomut.js";
import {
  PAL, T, V, R, DERIN, SP, RAD, SH, EASE, TYPE, Icon, focusRing, SR_ONLY,
} from "./neonUi.jsx";

// Yuvarlak olan şey ORB'UN KENDİSİ — arkasında koyu tabak yok (kullanıcı kararı: zemin
// kahverengi bir daire olarak okunuyordu). Sohbet panelinin ayak izinde durur; sayfa
// görünür kalır. Kap saydam olduğu için TIKLAMA GEÇİRİR (pointerEvents) — aksi halde
// görünmeyen bir kutu arkadaki listeleri tıklanamaz yapardı.
const ORB_BOYUT = "min(210px, calc(100vw - 96px), calc(100vh - 220px))";
const FFT = 1024;                 // ~512 bin; research deseni (smoothingTimeConstant 0.4)
const SCALE_K = 0.13;             // genlik → hafif scale; asıl tepki KENAR sıvı-morph'unda (aş. dongu)
const NEFES = 0.022;              // idle "nefes" salınımı ±%2.2
const YUM = 0.15;                 // genlik yumuşatma (exponential) — ham FFT titrek, bu "confident"

const DURUM_ETIKET = {
  [DURUM.HAZIR]: "Hazır", [DURUM.DINLIYOR]: "Dinliyor",
  [DURUM.DUSUNUYOR]: "Düşünüyor", [DURUM.KONUSUYOR]: "Yanıtlıyor",
};

// Düşük opaklıklı grain — düz vektör gradyanı "enerji topu"na çevirir (research §1).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function azHareketMi() {
  return typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

// onKomut(komut): sesli komut ÇALIŞTIRILIR (görünüm değiştir / evrak aç). Sahne bu işi
// kendisi yapmaz — kabuk (DashboardApp) yapar; sahne yalnız komutu çözer ve bildirir.
export default function SesliGorusme({ acik = false, ekran = null, onKomut, onKapat }) {
  const [durum, setDurum] = useState(DURUM.HAZIR);
  const [susturuldu, setSusturuldu] = useState(false);
  const [sonUser, setSonUser] = useState("");   // canlı transcript — kullanıcı
  const [sonYanit, setSonYanit] = useState(""); // canlı transcript — asistan (stream)
  const [uyari, setUyari] = useState("");        // izin/STT/TTS notu

  const durumRef = useRef(DURUM.HAZIR);
  const acikRef = useRef(false);
  // Ekran bağlamı ref'te: beyinCagir kalıcı bir closure, prop'u doğrudan okusa kullanıcının
  // KONUŞTUĞU andaki değil, sahnenin açıldığı andaki ekranı gönderirdi. Kullanıcı görüşme
  // sürerken ekran değiştirebilir ("şimdi taslaklara bak, buradaki ilk yazı ne?").
  const ekranRef = useRef(ekran);
  const susturRef = useRef(false);
  const azHareketRef = useRef(false);

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

  const orbRef = useRef(null);
  const haloRef = useRef(null);
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
    seviyeRef.current = yumusat(seviyeRef.current, hedef, YUM);
    const az = azHareketRef.current;
    const seviye = az ? 0 : seviyeRef.current;   // reduced-motion: hem scale hem halo donuk
    const nefes = az ? 0 : Math.sin(ts / 1800) * NEFES;
    const scale = 1 + nefes + seviye * SCALE_K;
    if (orbRef.current) {
      orbRef.current.style.transform = `scale(${scale.toFixed(4)})`;
      // Sıvı kenar — "cam bilye"yi "canlı enerji"ye çeviren asıl öğe: spline+noise blob'u
      // clip-path olarak sür (mükemmel daire değil, organik dalgalanan hat). Genlik arttıkça
      // kenar DAHA ÇOK kıpırdar (sadece büyümez — araştırma §2/5). CSS gradyan katmanları korunur.
      const boyut = olcuRef.current;
      if (az || !boyut) {
        orbRef.current.style.clipPath = "none";
      } else {
        // r + max amp < 0.5*boyut olmalı: aksi halde overflow:hidden dairesi wobble tepelerini
        // düzleştirir. r=0.40 + amp≤0.075 = 0.475 < 0.5 → güvenli, kenar tam serbest dalgalanır.
        const c = boyut / 2, r = boyut * 0.40;
        const amp = boyut * (0.02 + seviye * 0.055);
        const pts = blobNoktalari(c, c, r, 10, ts * 0.0011, amp);
        orbRef.current.style.clipPath = `path('${blobYolu(pts)}')`;
      }
    }
    if (haloRef.current) haloRef.current.style.opacity = (0.3 + seviye * 0.6).toFixed(3);
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
      onKomut?.(komut);
      setSonUser(metin); setSonYanit(onay);   // görünmez (SR_ONLY) — ekran okuyucu için
      gecmisRef.current = [...gecmisRef.current,
        { rol: "kullanici", icerik: metin }, { rol: "asistan", icerik: onay }].slice(-8);
      if (acikRef.current) dinle();
      return;
    }

    setSonUser(metin); setSonYanit(""); gecir("sonuc");
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

  const kur = useCallback(async () => {
    azHareketRef.current = azHareketMi();
    setUyari(""); setSonUser(""); setSonYanit(""); setSusturuldu(false); susturRef.current = false;
    gecmisRef.current = [];   // her oturum temiz hafızayla başlar
    onayRef.current = null;   // önceki oturumdan sarkan teyit bağlamı taşınmaz
    olcuRef.current = orbRef.current?.clientWidth || 0;   // sıvı kenar için orb px boyutu
    rafRef.current = requestAnimationFrame(dongu);
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
      // /sohbet/karsilama (2,5 sn timeout) + selam TTS'i + selamın okunması vardı: kullanıcı
      // konuşmaya başlayana kadar ~8 sn "Düşünüyor/Yanıtlıyor" bekliyordu. Sahne artık sessiz
      // açılır ve ilk sözü kullanıcı söyler.
      dinle();
    } catch {
      if (acikRef.current) setUyari("Mikrofon izni gerekli — tarayıcı çubuğundan izin verip tekrar açın.");
    }
  }, [dongu, dinle]);

  // Component tamamen unmount olunca AudioContext'i kapat (oturum sökme onu koruyordu).
  useEffect(() => () => { try { ctxRef.current?.close(); } catch { /* yoksay */ } }, []);

  useEffect(() => {
    if (!acik) return;
    dialogRef.current?.focus();   // odağı diyalog kabına al → ESC + odak döngüsü fiilen çalışır (a11y)
    kur();
    return temizle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  const kapat = useCallback(() => { setDurum(DURUM.HAZIR); onKapat?.(); }, [onKapat]);

  const susturDegistir = useCallback(() => {
    setSusturuldu((v) => {
      const yeni = !v; susturRef.current = yeni;
      micStreamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = !yeni));
      if (yeni) { try { tanimaRef.current?.stop(); } catch { /* yoksay */ } }
      else if (durumRef.current !== DURUM.KONUSUYOR) dinle();
      return yeni;
    });
  }, [dinle]);

  const konusuyor = durum === DURUM.KONUSUYOR;
  const dinliyor = durum === DURUM.DINLIYOR;
  const dusunuyor = durum === DURUM.DUSUNUYOR;

  return (
    <>
      <audio ref={audioElRef} hidden aria-hidden="true" />

      {acik && (
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-label="Sesli görüşme" onKeyDown={(e) => { if (e.key === "Escape") kapat(); }}
          style={{
            outline: "none",
            // Sohbet panelinin ayak izi (right/bottom birebir aynı): panel kapanır, orb oraya doğar.
            position: "fixed", right: SP.xl, bottom: 96, zIndex: 170,
            width: ORB_BOYUT,
            display: "flex", flexDirection: "column", alignItems: "center", gap: SP.l,
            // Kap görünmez: zemin/gölge YOK ve tıklamayı yutmaz — yalnız çocukları tıklanabilir.
            pointerEvents: "none",
            // Köken-farkında giriş: orb, kendisini açan yuvarlak butondan (sağ-alt) büyür.
            transformOrigin: "bottom right",
            animation: "ke-disk-gir .2s var(--ke-ease-out) both",
          }}>
          {/* Durum etiketi (aria-live) */}
          <div aria-live="polite" style={SR_ONLY}>{DURUM_ETIKET[durum]}</div>
          {/* zIndex: orb'un aura/halo katmanları konumlandırılmış olduğu için akış içindeki
              içeriğin ÜSTÜNE boyanır — etiket ve düğmeler bu yüzden kendi katmanına alınır. */}
          <div aria-hidden="true" style={{ position: "relative", zIndex: 1, ...TYPE.meta, color: PAL.mut2 }}>
            {DURUM_ETIKET[durum]}{dinliyor ? "…" : ""}
          </div>

          {/* ORB — dokununca konuşmayı keser (barge-in) */}
          <button type="button" onClick={kes} aria-label={konusuyor ? "Yanıtı durdur" : "Sesli görüşme küresi"} {...focusRing}
            style={{ position: "relative", pointerEvents: "auto", width: ORB_BOYUT, aspectRatio: "1 / 1", flexShrink: 0, borderRadius: RAD.dot, border: "none", background: "none", padding: 0, cursor: konusuyor ? "pointer" : "default" }}>
            {/* düşünürken dışa yayılan halka */}
            {dusunuyor && !azHareketRef.current && (
              <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${T}`, animation: "ke-orb-halka 1.4s var(--ke-ease-out) infinite" }} />
            )}
            {/* dış aura — geniş, çok yumuşak atmosfer katmanı (derinlik).
                pointerEvents ZORUNLU: kutunun ~%58 DIŞINA taşar; tıklamayı yutarsa hem alttaki
                sustur/bitir düğmeleri hem arkadaki sayfa ölür (bulundu: düğmeler basılmıyordu). */}
            <span aria-hidden="true" style={{ position: "absolute", inset: "-58%", pointerEvents: "none", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${V} 40%, transparent 70%)`, filter: "blur(70px)", opacity: .2 }} />
            {/* halo — arkada taşan glow (rAF opacity sürer); o da kutu dışına çıkar → tıklama geçirir */}
            <span ref={haloRef} aria-hidden="true" style={{ position: "absolute", inset: "-35%", pointerEvents: "none", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${V} 45%, transparent 68%)`, filter: "blur(44px)", opacity: .32 }} />
            {/* küre — rAF scale sürer */}
            <span ref={orbRef} aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", willChange: "transform", boxShadow: `inset 0 -14px 44px rgba(0,0,0,.4), inset 0 8px 30px color-mix(in srgb, ${PAL.onInk} 22%, transparent)` }}>
              {/* taban gökyüzü gradyanı (hero: gök mavisi çekirdek → lavanta → mühür moru kenar)
                  + yavaş hue kayması ("canlı renk", araştırma §2/4 — palet ±10° içinde kalır) */}
              <span style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 38% 32%, ${T} 0%, ${T} 34%, ${V} 74%, color-mix(in srgb, ${V} 55%, #000) 100%)`, animation: azHareketRef.current ? "none" : "ke-orb-hue 13s ease-in-out infinite" }} />
              {/* dönen sıvı blob'lar (screen blend → kayan gökyüzü gradyanı: mavi baskın + lavanta + mercan vurgu) */}
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${T} 0%, transparent 58%)`, filter: "blur(24px)", mixBlendMode: "screen", animation: azHareketRef.current ? "none" : "ke-orb-b 21s linear infinite" }} />
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${V} 0%, transparent 50%)`, filter: "blur(28px)", mixBlendMode: "screen", opacity: .85, animation: azHareketRef.current ? "none" : "ke-orb-a 16s linear infinite" }} />
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${R} 0%, transparent 42%)`, filter: "blur(30px)", mixBlendMode: "screen", opacity: .4, animation: azHareketRef.current ? "none" : "ke-orb-c 30s linear infinite" }} />
              {/* dönen ışık süpürmesi (conic) — yüzeyde gezinen specular; "canlı" hissin anahtarı */}
              <span aria-hidden="true" style={{ position: "absolute", inset: "-8%", borderRadius: "50%", background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, ${PAL.onInk} 50%, transparent) 24deg, transparent 66deg, transparent 200deg, color-mix(in srgb, ${T} 60%, transparent) 232deg, transparent 300deg)`, filter: "blur(10px)", mixBlendMode: "screen", opacity: .55, animation: azHareketRef.current ? "none" : "nu-spin 8s linear infinite" }} />
              {/* sheen — cam yüzey ışık yansıması */}
              <span style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 32% 25%, color-mix(in srgb, ${PAL.onInk} 90%, transparent) 0%, transparent 32%)` }} />
              {/* grain */}
              <span style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: .1, mixBlendMode: "overlay" }} />
            </span>
          </button>

          {/* Konuşulan metin GÖRÜNMEZ (kullanıcı kararı: altyazı yok — ses zaten konuşuyor).
              Ekran okuyucu için erişilebilir kalır; aria-live YOK, yoksa akan her token
              yeniden seslendirilirdi. */}
          <div style={SR_ONLY}>{sonUser}{sonYanit ? ` — ${sonYanit}` : ""}</div>

          {/* Kontroller — sustur + bitir. Artık AÇIK zeminde duruyorlar: koyu tabak yok,
              bu yüzden yüzey/kenarlık token'ları (PAL) kullanılır, yarı saydam siyah değil. */}
          <div style={{ position: "relative", zIndex: 1, pointerEvents: "auto", display: "flex", alignItems: "center", gap: SP.l, flexShrink: 0 }}>
            <button type="button" data-press onClick={susturDegistir} aria-pressed={susturuldu} aria-label={susturuldu ? "Susturmayı kaldır" : "Mikrofonu sustur"} {...focusRing}
              style={{ cursor: "pointer", width: 44, height: 44, borderRadius: RAD.dot, border: `1px solid ${susturuldu ? DERIN.R : PAL.line}`, background: susturuldu ? DERIN.R : PAL.surf, color: susturuldu ? PAL.onAccent : PAL.ink2, display: "grid", placeItems: "center", boxShadow: SH.card, transition: `background .14s ${EASE.out}, color .14s ${EASE.out}` }}>
              {susturuldu ? <Icon.micOff /> : <Icon.mic width={17} height={17} />}
            </button>
            <button type="button" data-press onClick={kapat} aria-label="Sesli görüşmeyi bitir" {...focusRing}
              style={{ cursor: "pointer", width: 48, height: 48, borderRadius: RAD.dot, border: "none", background: DERIN.R, color: PAL.onAccent, display: "grid", placeItems: "center", boxShadow: SH.pop }}>
              <Icon.x width={19} height={19} />
            </button>
          </div>

          {/* Uyarı ALTYAZI DEĞİL: mikrofon izni yok / TTS anahtarı yok gibi sessiz kalırsa
              kullanıcının asla anlayamayacağı durumlar. Yalnız doluyken görünür. */}
          {uyari && (
            <p role="status" aria-live="polite" style={{ position: "relative", zIndex: 1, margin: 0, maxWidth: "100%", textAlign: "center", ...TYPE.meta, color: PAL.mut }}>{uyari}</p>
          )}
        </div>
      )}
    </>
  );
}
