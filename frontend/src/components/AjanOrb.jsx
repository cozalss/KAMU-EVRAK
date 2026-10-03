/* AjanOrb → "ISTAMPA" — canlı işlem sahnesinin öznesi (Antet & Damga, 2026-10).
   Eski orb jenerik bir mavi küreydi (kullanıcı: "kavramı yok"). Yerine konunun kendi
   malzemesi geldi: mühür mürekkebi emdirilmiş keçe — ıstampa. Her GERÇEKTEN İŞ YAPAN adım
   (akisKatman.adimDurumu === "calisti") bittiği anda keçeye kendi görevinin renginde bir
   damla düşer: Görev 1 tükenmez mavisi (T), Görev 2 ıstampa moru (V); risk bandı adımı kendi
   bandının renginde, hata kırmızı. Damlanın boyu adımın SUNUCU süresiyle orantılıdır
   (nodeDurationMs) — uzun düşünen adım büyük leke bırakır. Damlalar zamanla keçede dağılır
   (domain-warped fBm). Sahte "düşünme" titreşimi YOK: yeni mürekkep yalnız SSE olayından gelir.

   Sözleşmeler:
   · Bilgi tek kanal DEĞİL — aria-hidden. Aynı bilgi slip (metro), başlık işaretleri ve
     aria-live bölgesinde metinle var; bu katman sökülse hiçbir bilgi kaybolmaz.
   · "gerekmedi" / "atlandi" / "bekliyor" adımları mürekkep BIRAKMAZ (koşmayan adım tamamlandı
     sayılmaz — CLAUDE.md §9). Paralel katmanlar aynı karede birlikte damlar (olgu).
   · Mount anında zaten bitmiş adımlar "eski" sayılır (doğum = şimdi − 60 sn): görünüme geri
     dönüşte sahte bir damla salvosu oynamaz.
   · Ham WebGL1, paket yok. ≤30 fps, DPR ≤ 1,5; ekran dışı / gizli sekmede rAF durur; tüm
     damlalar yerine oturup koşum bittiğinde döngü kendiliğinden söner.
   · prefers-reduced-motion → shader tek kare (oturmuş hâl) çizip durur. WebGL yoksa Canvas 2D
     radyal leke yedeği. */
import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { T, V, PAL, BANT, RAD, SP, SH, MONO, TYPE, TNUM, DERIN_OF, EASE_BEZIER } from "./neonUi.jsx";
import { adimDurumu } from "../lib/akisKatman.js";
import { nodeDurationMs } from "../lib/pipelinePhases.js";

const AZAMI_DAMLA = 20;
const KARE_MS = 1000 / 30;
const OTURMA_SN = 9;          // bu yaştan sonra damla gözle görülür biçimde değişmez

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FS = `
precision mediump float;
uniform vec2 uRes;uniform float uT;uniform int uN;
uniform vec3 uZemin;uniform vec3 uR0;uniform vec3 uR1;uniform vec3 uR2;uniform vec3 uR3;uniform vec3 uR4;
uniform vec4 uD[${AZAMI_DAMLA}];uniform float uK[${AZAMI_DAMLA}];
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+17.1;a*=.5;}return s;}
vec3 renk(float k){if(k<.5)return uR0;if(k<1.5)return uR1;if(k<2.5)return uR2;if(k<3.5)return uR3;return uR4;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes.y;
  // Keçe: yönlü lif + ince gren (ölçülü — mürekkep kahraman kalsın).
  float lif=fbm(uv*vec2(5.,70.))*.5+n(uv*260.)*.5;
  vec3 c=uZemin*(.965+.07*lif);
  for(int i=0;i<${AZAMI_DAMLA};i++){
    if(i>=uN)break;
    vec4 d=uD[i];float yas=uT-d.z;if(yas<0.)continue;
    // Yayılma: ilk saniyede hızlı açılır, sonra kılcal olarak yavaşça sürer.
    float R=uK[i]*(1.-exp(-yas*2.2))*(1.+.035*sqrt(yas));
    vec2 q=uv-d.xy;
    vec2 w=vec2(fbm(q*5.+d.z*3.1+uT*.03),fbm(q*5.-d.z*1.7-uT*.025))-.5;
    float r=length(q+w*R*1.25);
    float govde=smoothstep(R,R*.35,r);
    float kenar=smoothstep(R*1.04,R*.9,r)-smoothstep(R*.9,R*.62,r);   // kahve halkası kenarı
    float doku=.62+.38*fbm(q*22.+d.z);
    float yogun=clamp(govde*doku*.9+kenar*.4,0.,.94)*(1.-.18*clamp(yas/30.,0.,1.));
    c=mix(c,renk(d.w),yogun);
  }
  gl_FragColor=vec4(c,1.);
}`;

const azHareketMi = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* CSS token → [r,g,b] (0..1). Chrome color-mix'i "color(srgb a b c)", düz rengi "rgb()" verir. */
function tokenRgb(el, css) {
  el.style.color = css;
  const s = getComputedStyle(el).color;
  const m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const r = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return r ? [r[1] / 255, r[2] / 255, r[3] / 255] : [0.5, 0.5, 0.5];
}

const KECE = `color-mix(in srgb, ${PAL.ink} 5%, ${PAL.surf2})`;
const RENKLER = [T, V, BANT.yesil.c, BANT.sari.c, BANT.kirmizi.c];

/* Deterministik konum: Görev 1 sol, Görev 2 sağ yarıda; aynı adım her koşumda aynı yere düşer. */
function hash(s) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967295; }
function damlaKonum(a, oran) {
  const u = hash(a.id), v = hash(`${a.id}·y`);
  const sol = a.gorev === 2 ? 0.52 : 0.08;
  return [(sol + u * 0.4) * oran, 0.2 + v * 0.6];
}
function damlaRengi(a) {
  if (a.status === "error") return 4;
  if (a.id === "risk_guard" && a.bant) return { yesil: 2, sari: 3, kirmizi: 4 }[a.bant] ?? 1;
  return a.gorev === 2 ? 1 : 0;
}
function damlaBoyu(a) {
  const ms = nodeDurationMs(a);
  const sn = Number.isFinite(ms) ? ms / 1000 : 1;
  return Math.min(0.3, 0.1 + 0.055 * Math.sqrt(sn));
}

function glKur(cv) {
  const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh = (tip, src) => { const s = gl.createShader(tip); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (k) => gl.getUniformLocation(pr, k);
  return { gl, u: { res: u("uRes"), t: u("uT"), n: u("uN"), zemin: u("uZemin"), d: u("uD"), k: u("uK"), r: [0, 1, 2, 3, 4].map((i) => u(`uR${i}`)) } };
}

/* Canvas 2D yedeği (WebGL yok): oturmuş lekeleri radyal gradyanla tek sefer çizer. */
function yedekCiz(cv, damlalar, renkler, zemin) {
  const g = cv.getContext("2d");
  if (!g) return;
  const W = cv.width, H = cv.height;
  const css = (c, a) => `rgba(${c.map((x) => Math.round(x * 255)).join(",")},${a})`;
  g.fillStyle = css(zemin, 1); g.fillRect(0, 0, W, H);
  damlalar.forEach((d) => {
    const x = (d.x / (W / H)) * W, y = H - d.y * H, r = d.k * H;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(renkler[d.renk], 0.75)); gr.addColorStop(0.8, css(renkler[d.renk], 0.55)); gr.addColorStop(1, css(renkler[d.renk], 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  });
}

/* GELİŞ FİŞİ — ilk mürekkep düşene dek keçenin üstünde evrakın kendisi durur ("evrak masaya
   geldi"). Bekleme anı boş bir keçe değil, bir OLGU: hangi evrak, ne zaman geldi (saat, koşumun
   gerçek başlangıcından türetilir — uydurma kayıt no YOK). İlk paraf mürekkebi düşünce fiş
   masaya alınır (sağa kayarak çıkar) ve keçe sahneyi devralır. Stripe globe dersi: ortam
   hareketi yok, yalnız olay hareket ettirir — fişin tek hareketi iniş ve kalkıştır. */
const FIS_GIRIS = { opacity: 0, y: -22, rotate: -7, scale: 1.04 };
function GelisFisi({ ad, meta, saat }) {
  return (
    <motion.div key="fis" initial={FIS_GIRIS} animate={{ opacity: 1, y: 0, rotate: -2.2, scale: 1 }}
      exit={{ opacity: 0, x: 90, rotate: 4, transition: { duration: 0.32, ease: EASE_BEZIER.inOut } }}
      transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.9 }}
      style={{ position: "absolute", left: "50%", top: "50%", width: "min(78%, 300px)", marginLeft: "calc(min(78%, 300px) / -2)", marginTop: -54, zIndex: 2, background: PAL.surf, borderRadius: 3, boxShadow: `${SH.pop}, 0 0 0 1px ${PAL.line}`, padding: `${SP.m}px ${SP.l}px`, pointerEvents: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.antet, fontSize: 10, color: PAL.mut2, textTransform: "uppercase" }}>
        <span>Evrak masaya geldi</span>
        <span style={{ flex: 1, height: 1, background: PAL.line }} />
        {saat && <span style={{ ...TNUM }}>{saat}</span>}
      </div>
      <div style={{ marginTop: 6, height: 3, borderTop: `1.5px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.85 }} />
      <div style={{ marginTop: SP.s, ...TYPE.ui, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</div>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, marginTop: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1, ...TNUM }}>{meta || "okunmayı bekliyor"}</span>
        {/* Paraf yuvası — ilk masa işini bitirince buraya değil keçeye mürekkep düşer;
            kesikli halka yalnız "henüz paraf yok" olgusunu gösterir. */}
        <span style={{ width: 22, height: 22, borderRadius: RAD.dot, border: `1.5px dashed ${DERIN_OF(T)}`, flexShrink: 0, opacity: 0.8, animation: "nu-spin 8s linear infinite" }} />
      </div>
    </motion.div>
  );
}

const saatOf = (runBase) => {
  if (!Number.isFinite(runBase) || runBase <= 0 || typeof performance === "undefined") return "";
  const d = new Date(Date.now() - (performance.now() - runBase));
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export default function AjanOrb({ display = [], kosumda = false, yukseklik = 196, gelis = null, runBase = 0, children = null }) {
  const kapRef = useRef(null);
  const cvRef = useRef(null);
  const probRef = useRef(null);
  const dogumRef = useRef(new Map());     // adım id → doğum (sn, performance saatine göre)
  const ilkRef = useRef(true);
  const durumRef = useRef({ damlalar: [], kosumda, ciz: () => {} });

  // Mürekkep düşüren adımlar — YALNIZ gerçekten iş yapan / hata veren (olgu). Sıra = display sırası.
  const damlaAdimlari = useMemo(
    () => display.filter((a) => { const d = adimDurumu(a); return d === "calisti" || d === "hata"; }),
    [display],
  );

  useEffect(() => {
    const simdi = performance.now() / 1000;
    const dog = dogumRef.current;
    const kimlikler = new Set(damlaAdimlari.map((a) => a.id));
    // Yeni koşum (biten sayısı düştü / kimlik kayboldu) → defter sıfırlanır.
    for (const id of [...dog.keys()]) if (!kimlikler.has(id)) dog.delete(id);
    damlaAdimlari.forEach((a) => { if (!dog.has(a.id)) dog.set(a.id, ilkRef.current ? simdi - 60 : simdi); });
    ilkRef.current = false;
    const kap = kapRef.current;
    const oran = kap ? Math.max(0.5, kap.clientWidth / Math.max(1, kap.clientHeight)) : 2;
    durumRef.current.damlalar = damlaAdimlari.slice(-AZAMI_DAMLA).map((a) => {
      const [x, y] = damlaKonum(a, oran);
      return { x, y, z: dog.get(a.id), renk: damlaRengi(a), k: damlaBoyu(a) };
    });
    durumRef.current.kosumda = kosumda;
    durumRef.current.ciz();
  }, [damlaAdimlari, kosumda]);

  useEffect(() => {
    const cv = cvRef.current, kap = kapRef.current, prob = probRef.current;
    const durum = durumRef.current;
    if (!cv || !kap || !prob) return undefined;
    const az = azHareketMi();
    const ctx = glKur(cv);
    let renkler = [], zemin = [1, 1, 1];
    const renkOku = () => { renkler = RENKLER.map((c) => tokenRgb(prob, c)); zemin = tokenRgb(prob, KECE); };
    renkOku();
    let raf = 0, son = 0, gorunur = true;
    const boyutla = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(kap.clientWidth * dpr));
      cv.height = Math.max(1, Math.round(kap.clientHeight * dpr));
      ctx?.gl.viewport(0, 0, cv.width, cv.height);
    };
    const kare = (zamanSn) => {
      const { damlalar } = durumRef.current;
      if (!ctx) { yedekCiz(cv, damlalar, renkler, zemin); return; }
      const { gl, u } = ctx;
      gl.uniform2f(u.res, cv.width, cv.height);
      gl.uniform1f(u.t, zamanSn);
      gl.uniform1i(u.n, damlalar.length);
      gl.uniform3fv(u.zemin, zemin);
      u.r.forEach((l, i) => gl.uniform3fv(l, renkler[i]));
      const D = new Float32Array(AZAMI_DAMLA * 4), K = new Float32Array(AZAMI_DAMLA);
      damlalar.forEach((d, i) => { D.set([d.x, d.y, d.z, d.renk], i * 4); K[i] = d.k; });
      gl.uniform4fv(u.d, D); gl.uniform1fv(u.k, K);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // Oturmuş hâl: tüm damlalar sabit yaşta (reduced-motion / yedek).
    const statik = () => kare(performance.now() / 1000 + (az ? 600 : 0));
    const oturdu = () => {
      const t = performance.now() / 1000;
      return !durumRef.current.kosumda && durumRef.current.damlalar.every((d) => t - d.z > OTURMA_SN);
    };
    const dongu = (ts) => {
      raf = 0;
      if (!gorunur || document.hidden) return;
      if (ts - son >= KARE_MS) { son = ts; kare(ts / 1000); }
      if (!oturdu()) raf = requestAnimationFrame(dongu);
    };
    const baslat = () => { if (az || !ctx) { statik(); return; } if (!raf) raf = requestAnimationFrame(dongu); };
    durum.ciz = baslat;
    boyutla(); baslat();
    const ro = new ResizeObserver(() => { boyutla(); baslat(); if (az || !ctx) statik(); });
    ro.observe(kap);
    const io = new IntersectionObserver((g) => { gorunur = g[g.length - 1].isIntersecting; if (gorunur) baslat(); });
    io.observe(kap);
    const gor = () => { if (!document.hidden) baslat(); };
    document.addEventListener("visibilitychange", gor);
    // Tema değişimi (html[data-theme]) → token renkleri yeniden okunur.
    const mo = new MutationObserver(() => { renkOku(); statik(); baslat(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener("visibilitychange", gor);
      // loseContext ÇAĞRILMAZ: StrictMode'un çift effect'inde aynı canvas'ın ikinci
      // getContext'i kayıp bağlamı döndürür ve sahne boş kalır.
      durum.ciz = () => {};
    };
  }, []);

  // Fiş yalnız koşum sürerken ve keçede henüz mürekkep yokken (ilk paraf öncesi) masadadır.
  const fisGoster = !!gelis && kosumda && damlaAdimlari.length === 0;
  const saat = useMemo(() => saatOf(runBase), [runBase]);
  return (
    <div ref={kapRef} aria-hidden="true" style={{ position: "relative", width: "100%", height: yukseklik, borderRadius: RAD.ctl, overflow: "hidden", background: KECE }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <span ref={probRef} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      <AnimatePresence>
        {fisGoster && <GelisFisi ad={gelis.ad} meta={gelis.meta} saat={saat} />}
      </AnimatePresence>
      {children}
    </div>
  );
}
