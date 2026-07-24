/* SesliGorusme — ChatGPT "voice mode" tarzı tam-ekran sesli görüşme sahnesi.
   Sayfa sol-altındaki tetikleyiciden açılır (sağ-alttaki sohbet FAB'ından AYRI). Bas → konuş →
   asistan sesli cevap ver → tekrar dinle (kesintisiz döngü). Orb, mikrofon (dinlerken) ve TTS
   sesinin (konuşurken) GERÇEK genliğine göre canlanır (Web Audio AnalyserNode → rmsGenlik →
   rAF; bkz. lib/sesGorusme.js). Beyin: /sohbet/stream (DeepSeek). Ses: /sohbet/seslendir
   (OpenAI TTS — anahtar yoksa 503, metin-only'e zarifçe düşer). Görüşme durum makinesi saf +
   test edilmiş (sonrakiDurum). Tema: "SAHNE" istisnası (CanliAjanAkisi gibi) — dim backdrop +
   Hero gökyüzü orb'u (T/V/R token'ları); glow yalnız burada, sakin çalışma-alanı chrome'unda değil.
   a11y: ESC kapatır, odak döngüsü, aria-live durum, reduced-motion'da morph/scale söner. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../lib/authApi.js";
import { DURUM, rmsGenlik, sonrakiDurum, yumusat } from "../lib/sesGorusme.js";
import { blobNoktalari, blobYolu } from "../lib/orbCizim.js";
import { sesTanimaOlustur, sttDestekleniyorMu } from "../lib/sesliMod.js";
import { sesliMetneCevir } from "../lib/sesliMod.js";
import { cumleAyir, sesKuyruguOlustur } from "../lib/sesKuyrugu.js";
import {
  PAL, T, V, R, DERIN, SP, RAD, SH, EASE, Icon, focusRing, odakDongusu, SR_ONLY,
} from "./neonUi.jsx";

const ORB_BOYUT = "clamp(200px, 38vh, 340px)"; // masaüstü büyük, telefonda sığar
const FFT = 1024;                 // ~512 bin; research deseni (smoothingTimeConstant 0.4)
const SCALE_K = 0.13;             // genlik → hafif scale; asıl tepki KENAR sıvı-morph'unda (aş. dongu)
const NEFES = 0.022;              // idle "nefes" salınımı ±%2.2
const YUM = 0.15;                 // genlik yumuşatma (exponential) — ham FFT titrek, bu "confident"

const DURUM_ETIKET = {
  [DURUM.HAZIR]: "Hazır", [DURUM.DINLIYOR]: "Dinliyor",
  [DURUM.DUSUNUYOR]: "Düşünüyor", [DURUM.KONUSUYOR]: "Yanıtlıyor",
};
// Açılış karşılaması — normalde /sohbet/karsilama'dan GERÇEK kuyruk durumuyla gelir
// ("karar bekleyen üç taslağınız var..."). Bu sabit yalnız uç erişilemezse kullanılan yedektir;
// persona adı backend SESLI_PERSONA_ADI ile eşleşir (env'de değişirse burayı da güncelle).
const KARSILAMA_YEDEK = "Merhaba, ben Kamu Evrak. Belge ve yazışma işlerinizde size yardımcı olmak için buradayım. Buyurun, sizi dinliyorum.";

// Düşük opaklıklı grain — düz vektör gradyanı "enerji topu"na çevirir (research §1).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function azHareketMi() {
  return typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export default function SesliGorusme({ acik = false, onKapat }) {
  const [durum, setDurum] = useState(DURUM.HAZIR);
  const [susturuldu, setSusturuldu] = useState(false);
  const [sonUser, setSonUser] = useState("");   // canlı transcript — kullanıcı
  const [sonYanit, setSonYanit] = useState(""); // canlı transcript — asistan (stream)
  const [uyari, setUyari] = useState("");        // izin/STT/TTS notu

  const durumRef = useRef(DURUM.HAZIR);
  const acikRef = useRef(false);
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

  const orbRef = useRef(null);
  const haloRef = useRef(null);
  const olcuRef = useRef(0);        // orb px boyutu (clip-path sıvı kenar için ölçülür)
  const dialogRef = useRef(null);
  const urlRef = useRef(null);      // çalan TTS blob URL'i — barge-in/kapatmada revoke edilir
  const micSrcRef = useRef(null);   // mic MediaStreamSource — kapanışta disconnect

  useEffect(() => { durumRef.current = durum; }, [durum]);
  useEffect(() => { acikRef.current = acik; }, [acik]);

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
      body: JSON.stringify({ mesaj: metin, gecmis: gecmisRef.current, sesli: true }), signal: ac.signal,
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
  }, [beyinCagir, sesGetir, oynatBlob, gecir]);

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

  // --- Açılış karşılaması: persona (Metin) önce SÖZLÜ selam verir, sonra dinlemeye geçer.
  //     seslendir DUSUNUYOR'dan yanit_basladi ile KONUSUYOR'a döner; ses biterse/yoksa dinle. ---
  const karsila = useCallback(async () => {
    setDurum(DURUM.DUSUNUYOR); durumRef.current = DURUM.DUSUNUYOR;
    // Durum-farkında açılış: kullanıcının gerçek kuyruğunu bilerek selam verir. Uç erişilemezse
    // sabit yedek metin — sahne asla sessiz açılmaz.
    let metin = KARSILAMA_YEDEK;
    try {
      // Zaman aşımı ZORUNLU: uç yavaşlarsa orb "Düşünüyor"da donar ve dinle() hiç çağrılmaz
      // (sahne hiç başlamaz). Yedek metin her zaman hazır — brifing bir konfor, önkoşul değil.
      const res = await authFetch("/sohbet/karsilama", { signal: AbortSignal.timeout(2500) });
      if (res.ok) metin = (await res.json())?.metin || KARSILAMA_YEDEK;
    } catch { /* zaman aşımı/ağ → yedek metinle devam */ }
    if (!acikRef.current) return;
    setSonYanit(metin);
    // Karşılama da hafızaya girer: kullanıcı "kaç taslak demiştin?" derse model kendi
    // söylediği sayıyı bilsin (bilmezse ikinci turda uydurma zemini doğar).
    gecmisRef.current = [{ rol: "asistan", icerik: metin }];
    const kuyruk = sesKuyruguOlustur({
      sesGetir, oynat: oynatBlob, onIlkSes: () => gecir("yanit_basladi"),
      onIptal: () => audioElRef.current?.pause(),
    });
    kuyrukRef.current = kuyruk;
    kuyruk.ekle(metin);
    const { iptal } = await kuyruk.bitir();
    if (iptal || !acikRef.current || kuyrukRef.current !== kuyruk) return;
    gecir("yanit_bitti"); dinle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesGetir, oynatBlob, gecir]);

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
      karsila();   // persona önce sözlü selam verir, sonra dinlemeye geçer
    } catch {
      if (acikRef.current) setUyari("Mikrofon izni gerekli — tarayıcı çubuğundan izin verip tekrar açın.");
    }
  }, [dongu, karsila]);

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
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Sesli görüşme" onKeyDown={(e) => { if (e.key === "Escape") kapat(); odakDongusu(e); }}
          style={{
            outline: "none",
            position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: SP.xxl,
            background: PAL.inkSurf,             // dim "moment" — orb'u parlatır (Apple: dim to focus)
            animation: "nu-rise .2s var(--ke-ease-out) both",
          }}>
          {/* Durum etiketi (aria-live) */}
          <div aria-live="polite" style={{ position: "absolute", top: "10vh", ...SR_ONLY }}>{DURUM_ETIKET[durum]}</div>
          <div aria-hidden="true" style={{ position: "absolute", top: "9vh", color: PAL.onInk, fontFamily: "'Source Sans 3',system-ui,sans-serif", fontSize: 14, letterSpacing: ".32px", opacity: .7, textTransform: "none" }}>
            {DURUM_ETIKET[durum]}{dinliyor ? "…" : ""}
          </div>

          {/* ORB — dokununca konuşmayı keser (barge-in) */}
          <button type="button" onClick={kes} aria-label={konusuyor ? "Yanıtı durdur" : "Sesli görüşme küresi"} {...focusRing}
            style={{ position: "relative", width: ORB_BOYUT, height: ORB_BOYUT, borderRadius: "50%", border: "none", background: "none", padding: 0, cursor: konusuyor ? "pointer" : "default" }}>
            {/* düşünürken dışa yayılan halka */}
            {dusunuyor && !azHareketRef.current && (
              <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${T}`, animation: "ke-orb-halka 1.4s var(--ke-ease-out) infinite" }} />
            )}
            {/* dış aura — geniş, çok yumuşak atmosfer katmanı (derinlik) */}
            <span aria-hidden="true" style={{ position: "absolute", inset: "-58%", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${V} 40%, transparent 70%)`, filter: "blur(70px)", opacity: .2 }} />
            {/* halo — arkada taşan glow (rAF opacity sürer) */}
            <span ref={haloRef} aria-hidden="true" style={{ position: "absolute", inset: "-35%", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${V} 45%, transparent 68%)`, filter: "blur(44px)", opacity: .32 }} />
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

          {/* Canlı transcript */}
          <div style={{ maxWidth: "min(640px, 88vw)", textAlign: "center", display: "flex", flexDirection: "column", gap: SP.s, minHeight: 64 }}>
            {sonUser && <p style={{ margin: 0, color: PAL.onInk, opacity: .62, fontFamily: "'Source Sans 3',system-ui,sans-serif", fontSize: 14, lineHeight: "20px" }}>{sonUser}</p>}
            {sonYanit && <p style={{ margin: 0, color: PAL.onInk, fontFamily: "'Source Sans 3',system-ui,sans-serif", fontSize: 18, lineHeight: "26px" }}>{sonYanit}</p>}
            {uyari && <p role="status" aria-live="polite" style={{ margin: 0, color: PAL.onInk, opacity: .55, fontFamily: "'Source Sans 3',system-ui,sans-serif", fontSize: 13, lineHeight: "18px" }}>{uyari}</p>}
          </div>

          {/* Kontrol barı — sustur + kapat (yarı saydam pill) */}
          <div style={{ position: "absolute", bottom: "8vh", display: "flex", alignItems: "center", gap: SP.l, padding: `${SP.s}px ${SP.m}px`, borderRadius: 999, background: "color-mix(in srgb, #000 45%, transparent)", backdropFilter: "blur(16px)" }}>
            <button type="button" data-press onClick={susturDegistir} aria-pressed={susturuldu} aria-label={susturuldu ? "Susturmayı kaldır" : "Mikrofonu sustur"} {...focusRing}
              style={{ cursor: "pointer", width: 52, height: 52, borderRadius: "50%", border: `1px solid color-mix(in srgb, ${PAL.onInk} 24%, transparent)`, background: susturuldu ? DERIN.R : "color-mix(in srgb, #000 25%, transparent)", color: PAL.onInk, display: "grid", placeItems: "center", transition: `background .14s ${EASE.out}` }}>
              {susturuldu ? <Icon.micOff /> : <Icon.mic width={18} height={18} />}
            </button>
            <button type="button" data-press onClick={kapat} aria-label="Sesli görüşmeyi bitir" {...focusRing}
              style={{ cursor: "pointer", width: 56, height: 56, borderRadius: "50%", border: "none", background: DERIN.R, color: PAL.onInk, display: "grid", placeItems: "center", boxShadow: SH.pop }}>
              <Icon.x width={20} height={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
