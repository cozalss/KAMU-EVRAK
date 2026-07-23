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
import { sesTanimaOlustur, sttDestekleniyorMu } from "../lib/sesliMod.js";
import { sesliMetneCevir } from "../lib/sesliMod.js";
import {
  PAL, T, V, R, DERIN, SP, RAD, SH, EASE, Icon, focusRing, odakDongusu, SR_ONLY,
} from "./neonUi.jsx";

const ORB_BOYUT = "clamp(200px, 38vh, 340px)"; // masaüstü büyük, telefonda sığar
const FFT = 1024;                 // ~512 bin; research deseni (smoothingTimeConstant 0.4)
const SCALE_K = 0.2;              // genlik → +%20 scale (fazlası "ucuz" görünür)
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

export default function SesliGorusme() {
  const [acik, setAcik] = useState(false);
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
  const tetikRef = useRef(null);

  const orbRef = useRef(null);
  const haloRef = useRef(null);
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
    if (orbRef.current) orbRef.current.style.transform = `scale(${scale.toFixed(4)})`;
    if (haloRef.current) haloRef.current.style.opacity = (0.32 + seviye * 0.55).toFixed(3);
    rafRef.current = requestAnimationFrame(dongu);
  }, []);

  // --- SSE beyin çağrısı (/sohbet/stream) → yanıt metnini biriktir, canlı göster ---
  const beyinCagir = useCallback(async (metin) => {
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await authFetch("/sohbet/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mesaj: metin, gecmis: [] }), signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`akış ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", yanit = "";
    const isle = (blok) => {
      const satir = blok.split("\n").find((l) => l.startsWith("data:"));
      if (!satir) return;
      let ev; try { ev = JSON.parse(satir.slice(5)); } catch { return; }
      if (ev.event === "delta" && ev.t) { yanit += ev.t; setSonYanit(yanit); }
      else if (ev.event === "done") { yanit = ev.yanit || yanit; setSonYanit(yanit); }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) !== -1) { isle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    buf += dec.decode(); if (buf.trim()) isle(buf);
    return yanit.trim();
  }, []);

  // --- TTS (/sohbet/seslendir) → mp3 blob → oynat; analyser'a bağla (barge-in için tap) ---
  const seslendir = useCallback(async (metin) => {
    const duz = sesliMetneCevir(metin);
    if (!duz) { gecir("yanit_bitti"); return; }
    let res;
    try {
      res = await authFetch("/sohbet/seslendir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metin: duz }),
      });
    } catch { gecir("yanit_bitti"); return; }
    if (!res.ok) {
      // TTS anahtarı yok/hatası → metin-only'e düş, döngü sürsün.
      if (res.status === 503) setUyari("Sesli yanıt için OPENAI_TTS_API_KEY gerekli — şimdilik yalnız metin.");
      gecir("yanit_bitti");
      return;
    }
    const blob = await res.blob();
    const el = audioElRef.current;
    if (!el) { gecir("yanit_bitti"); return; }
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
    // Önceki turun URL'ini bırak (barge-in/pause 'ended' tetiklemez → sızıntı olmasın, #3).
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const birak = () => { if (urlRef.current === url) { URL.revokeObjectURL(url); urlRef.current = null; } };
    el.src = url;
    el.onended = () => { birak(); if (acikRef.current) { gecir("yanit_bitti"); dinle(); } };
    // Oynatma ORTASINDA hata (decode/ağ) → döngü KONUSUYOR'da kilitlenmesin (#5).
    el.onerror = () => { birak(); if (acikRef.current && durumRef.current === DURUM.KONUSUYOR) { gecir("yanit_bitti"); dinle(); } };
    try { await el.play(); gecir("yanit_basladi"); }
    catch { birak(); gecir("yanit_bitti"); }
  }, [gecir]);

  // --- Bir tur: transcript → beyin → seslendir ---
  const turIsle = useCallback(async (metin) => {
    setSonUser(metin); setSonYanit(""); gecir("sonuc");
    try {
      const yanit = await beyinCagir(metin);
      if (!acikRef.current) return;
      if (!yanit) { gecir("yanit_bitti"); dinle(); return; }
      await seslendir(yanit);
    } catch {
      if (acikRef.current) { setUyari("Yanıt alınamadı — tekrar dinliyorum."); gecir("hata"); dinle(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beyinCagir, seslendir, gecir]);

  // --- Dinlemeyi başlat (SpeechRecognition, tr-TR). Sonuç → turIsle. ---
  const dinle = useCallback(() => {
    if (!acikRef.current || susturRef.current) return;
    if (!sttDestekleniyorMu()) { setUyari("Bu tarayıcı ses tanımayı desteklemiyor (Chrome/Edge önerilir)."); return; }
    // Önceki tanıma instance'ını durdur → referanssız "orphan" sürekli-dinleyen kalmasın (#1).
    try { tanimaRef.current?.stop(); } catch { /* yoksay */ }
    tanimaRef.current = null;
    gecir("dinle");
    const t = sesTanimaOlustur({
      onSonuc: (m) => { if (m) turIsle(m); },
      onBitti: () => {
        // YALNIZ hâlâ GÜNCEL instance isek yeniden başlat — eski/orphan t kendini restart etmesin.
        if (tanimaRef.current === t && acikRef.current && durumRef.current === DURUM.DINLIYOR && !susturRef.current) {
          try { t.start(); } catch { /* zaten çalışıyor */ }
        }
      },
      onHata: () => { /* izin/ağ — sessiz, kullanıcı tekrar deneyebilir */ },
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
    const el = audioElRef.current;
    if (el) { el.pause(); el.currentTime = 0; }   // pause 'ended' tetiklemez →
    urlBirak();                                    // URL'i elle bırak (#3)
    gecir("kes"); dinle();
  }, [gecir, dinle, urlBirak]);

  // --- Oturum sökme (overlay kapanışı). AudioContext'i KAPATMAZ — oturumlar arası yaşar
  //     (MediaElementSource bir-kez-bağlanma kuralı, #2). Tam kapatma unmount effect'inde. ---
  const temizle = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    abortRef.current?.abort();
    try { tanimaRef.current?.stop(); } catch { /* yoksay */ }
    tanimaRef.current = null;
    const el = audioElRef.current; if (el) { el.pause(); el.onended = null; el.onerror = null; }
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

  const kapat = useCallback(() => { setAcik(false); setDurum(DURUM.HAZIR); tetikRef.current?.focus(); }, []);

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
            {/* halo — arkada taşan glow (rAF opacity sürer) */}
            <span ref={haloRef} aria-hidden="true" style={{ position: "absolute", inset: "-35%", borderRadius: "50%", background: `radial-gradient(circle, ${T} 0%, ${V} 45%, transparent 68%)`, filter: "blur(44px)", opacity: .32 }} />
            {/* küre — rAF scale sürer */}
            <span ref={orbRef} aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", willChange: "transform", boxShadow: `inset 0 -14px 44px rgba(0,0,0,.4), inset 0 8px 30px color-mix(in srgb, ${PAL.onInk} 22%, transparent)` }}>
              {/* taban gökyüzü gradyanı (hero: gök mavisi çekirdek → lavanta → mühür moru kenar) */}
              <span style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 38% 32%, ${T} 0%, ${T} 34%, ${V} 74%, color-mix(in srgb, ${V} 55%, #000) 100%)` }} />
              {/* dönen sıvı blob'lar (screen blend → kayan gökyüzü gradyanı: mavi baskın + lavanta + mercan vurgu) */}
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${T} 0%, transparent 58%)`, filter: "blur(24px)", mixBlendMode: "screen", animation: azHareketRef.current ? "none" : "ke-orb-b 21s linear infinite" }} />
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${V} 0%, transparent 50%)`, filter: "blur(28px)", mixBlendMode: "screen", opacity: .85, animation: azHareketRef.current ? "none" : "ke-orb-a 16s linear infinite" }} />
              <span style={{ position: "absolute", inset: "-25%", background: `radial-gradient(circle at 50% 50%, ${R} 0%, transparent 42%)`, filter: "blur(30px)", mixBlendMode: "screen", opacity: .4, animation: azHareketRef.current ? "none" : "ke-orb-c 30s linear infinite" }} />
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

      {/* Tetikleyici — sol-alt (sohbet FAB sağ-altta; çakışmaz). Sakin chrome: düz DERIN.T, glow yok. */}
      <button ref={tetikRef} type="button" data-press onClick={() => setAcik(true)}
        aria-label="Sesli görüşme başlat" {...focusRing}
        onMouseEnter={(e) => { e.currentTarget.style.background = DERIN.Th; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = DERIN.T; }}
        style={{
          position: "fixed", left: SP.xl, bottom: SP.xl, zIndex: 150, width: 58, height: 58,
          borderRadius: "50%", border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          background: DERIN.T, color: PAL.onAccent, boxShadow: SH.pop,
          transition: `background .14s ${EASE.out}`,
        }}>
        <Icon.audio />
      </button>
    </>
  );
}
