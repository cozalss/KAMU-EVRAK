/* AjanOrb → "ISTAMPA · PARAF DEFTERİ" — canlı işlem sahnesinin öznesi (Antet & Damga, tur 6).
   Tur 5'e kadar keçe, rastgele konumlu ve dağılan mürekkep lekeleri taşıyordu; jüri bunu
   "mikroskop altındaki hücre / lav lambası" diye okudu: lekenin yeri hangi masaya ait olduğunu
   söylemiyor, boyutu dışında hiçbir şey kodlamıyordu. Yeni hâl OKUNUR bir mühür defteridir:
   · Keçede her masanın SABİT bir yuvası var — I. faz üst bant (tükenmez mavisi T), II. faz alt
     bant (ıstampa moru V). Yuva yeri masa sırasından gelir (display = start.katmanlar dizilimi).
   · GERÇEKTEN iş yapan masa (akisKatman.adimDurumu === "calisti") bittiği an kendi yuvasına
     paraf izi basar: WebGL mürekkep halkası (keçe dokusuyla, keskin kenar — dağılma eskisinin
     %30'u) + yuvanın içinde masanın baş harfleri. Risk bandı masası bandının renginde, hata
     kırmızı mühür. "gerekmedi" → mürekkepsiz düz halka, "atlandi" → kesikli halka, bekleyen →
     noktalı halka + sıra no. Koşmayan masa mürekkep BIRAKMAZ (CLAUDE.md §9).
   · Çalışan masa (backend "başladı") kendi yuvasında keçeyi ıslatır; ıslaklık GERÇEK geçen
     süreyle (t0 → şimdi) büyür, yuvadan taşmaz. Paralel katmanda birden çok yuva aynı anda
     ıslanır — olgu: backend ikisinin de başladığını söyledi.

   Sözleşmeler:
   · aria-hidden: aynı bilgi pusula satırlarında, cetvelde ve aria-live bölgesinde metinle var.
   · Durum tek kaynaktan: sahneDurumu (CanliMetro) → adimDurumu (§10). Frontend durum türetmez.
   · Mount anında zaten bitmiş masalar "eski" sayılır (doğum = şimdi − 60 sn): görünüme geri
     dönüşte sahte bir paraf salvosu oynamaz.
   · Ham WebGL1, paket yok. ≤30 fps, DPR ≤ 1,5; ekran dışı / gizli sekmede rAF durur; tüm izler
     oturunca döngü kendiliğinden söner. reduced-motion → tek kare. WebGL yoksa Canvas 2D yedeği. */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { T, V, PAL, BANT, RAD, SP, SH, MONO, DISPLAY, TYPE, TNUM, DERIN_OF, EASE_BEZIER } from "./neonUi.jsx";
import { sahneDurumu } from "./CanliMetro.jsx";
import { parafUret } from "./agent-flow/topology.js";

const AZAMI_DAMLA = 24;
const KARE_MS = 1000 / 30;
const OTURMA_SN = 2.5;        // paraf bu yaştan sonra gözle görülür biçimde değişmez

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
/* uD = (x, y, doğum, renk) · uK = yuva yarıçapı (hepsi uv; 1 = tuval yüksekliği).
   renk ≥ 10 → ISLAK yuva (çalışan masa), renk-10 = gerçek renk. */
const FS = `
precision mediump float;
uniform vec2 uRes;uniform float uT;uniform int uN;
uniform vec3 uZemin;uniform vec3 uR0;uniform vec3 uR1;uniform vec3 uR2;uniform vec3 uR3;uniform vec3 uR4;
uniform vec4 uD[${AZAMI_DAMLA}];uniform float uK[${AZAMI_DAMLA}];
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+17.1;a*=.5;}return s;}
vec3 renk(float k){k=mod(k,10.);if(k<.5)return uR0;if(k<1.5)return uR1;if(k<2.5)return uR2;if(k<3.5)return uR3;return uR4;}
float halka(float r,float a,float b){return smoothstep(a-.012,a,r)-smoothstep(b,b+.012,r);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes.y;
  float lif=fbm(uv*vec2(5.,70.))*.5+n(uv*260.)*.5;
  vec3 c=uZemin*(.965+.07*lif);
  for(int i=0;i<${AZAMI_DAMLA};i++){
    if(i>=uN)break;
    vec4 d=uD[i];float R=uK[i];float yas=uT-d.z;if(yas<0.)continue;
    vec2 q=uv-d.xy;
    if(d.w>9.5){
      // Islak yuva: keçeye sinen mürekkep — gerçek saatle yavaşça büyür, yuvadan taşmaz.
      float Rw=R*(.3+.62*(1.-exp(-yas*.35)));
      vec2 ww=vec2(fbm(q*40.+d.z),fbm(q*40.-d.z))-.5;
      float rw=length(q+ww*Rw*.25);
      float islak=smoothstep(Rw,Rw*.45,rw)*.2+(smoothstep(Rw*1.02,Rw*.9,rw)-smoothstep(Rw*.9,Rw*.72,rw))*.3;
      c=mix(c,renk(d.w),clamp(islak,0.,.45));
      continue;
    }
    // Paraf izi: basış anında hafif büyük gelir ve oturur; kenar keskin, keçe dokusu mürekkebi
    // yer yer aç bırakır (gerçek lastik mühür izi). Dağılma eskisinin ~%30'u.
    float bas=clamp(yas/.16,0.,1.);
    float Rs=R*(1.+.14*(1.-smoothstep(0.,.3,yas)));
    vec2 w=vec2(fbm(q*26.+d.z*3.),fbm(q*26.-d.z*2.))-.5;
    float r=length(q+w*Rs*.12);
    float dis=halka(r,Rs*.84,Rs*.98);
    float ic=halka(r,Rs*.68,Rs*.74);
    float govde=smoothstep(Rs*.84,Rs*.5,r)*.08;
    float gren=smoothstep(.28,.62,fbm((uv+d.z)*150.));
    float yogun=((dis*.92+ic*.62)*(.5+.5*gren)+govde)*bas;
    c=mix(c,renk(d.w),clamp(yogun,0.,.92));
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

function damlaRengi(a, durum) {
  if (durum === "hata") return 4;
  if (a.id === "risk_guard" && a.bant) return { yesil: 2, sari: 3, kirmizi: 4 }[a.bant] ?? 1;
  return a.gorev === 2 ? 1 : 0;
}

/* YERLEŞİM — saf: her masanın yuvası (piksel). Bant başına satır sayısı masa sayısından;
   iki bant aynı sütun ızgarasını paylaşır (yuvalar alt alta hizalı okunur). */
const PAD = { sol: 30, sag: 10, ust: 10, alt: 10, bant: 12 };
/* Bant başına satır sayısı SABİT değil: 1..3 satır denenir, mühür yarıçapını en büyük yapan
   ızgara seçilir (tur 6: sabit 2 satır geniş-alçak kutuda mühürleri ~28px'e sıkıştırıyordu). */
function enIriIzgara(bantlar, W, H) {
  let en = null;
  for (let s = 1; s <= 3; s += 1) {
    const satirlar = bantlar.map((b) => Math.min(s, b.length));
    const sutun = Math.max(...bantlar.map((b, i) => Math.ceil(b.length / satirlar[i])));
    const toplamSatir = satirlar.reduce((t, x) => t + x, 0);
    const adimX = (W - PAD.sol - PAD.sag) / sutun;
    const adimY = (H - PAD.ust - PAD.alt - PAD.bant * (bantlar.length - 1)) / toplamSatir;
    const r = Math.max(9, Math.min(24, adimX * 0.4, adimY * 0.44));   // yatayda mühürler arası nefes
    if (!en || r > en.r + 0.5) en = { satirlar, sutun, adimX, adimY, r };
  }
  return en;
}
export function defterYerlesimi(display, W, H) {
  const bantlar = [display.filter((a) => a.gorev !== 2), display.filter((a) => a.gorev === 2)].filter((b) => b.length);
  if (!bantlar.length || W <= 0 || H <= 0) return { yuvalar: [], bantlar: [] };
  const { satirlar, sutun, adimX, adimY, r } = enIriIzgara(bantlar, W, H);
  const yuvalar = [], bantBilgi = [];
  let y0 = PAD.ust;
  bantlar.forEach((b, bi) => {
    const s = satirlar[bi];
    bantBilgi.push({ gorev: b[0].gorev === 2 ? 2 : 1, ust: y0, yukseklik: s * adimY });
    b.forEach((a, k) => {
      const satir = Math.floor(k / sutun), sut = k % sutun;
      yuvalar.push({ a, x: PAD.sol + adimX * (sut + 0.5), y: y0 + adimY * (satir + 0.5), r });
    });
    y0 += s * adimY + PAD.bant;
  });
  return { yuvalar, bantlar: bantBilgi };
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

/* Canvas 2D yedeği (WebGL yok): oturmuş paraf halkalarını tek sefer çizer. */
function yedekCiz(cv, damlalar, renkler, zemin) {
  const g = cv.getContext("2d");
  if (!g) return;
  const W = cv.width, H = cv.height;
  const css = (c, a) => `rgba(${c.map((x) => Math.round(x * 255)).join(",")},${a})`;
  g.fillStyle = css(zemin, 1); g.fillRect(0, 0, W, H);
  damlalar.forEach((d) => {
    const islak = d.renk >= 10, rk = renkler[d.renk % 10];
    const x = d.x * H, y = H - d.y * H, r = d.k * H;
    g.beginPath(); g.arc(x, y, islak ? r * 0.8 : r * 0.91, 0, Math.PI * 2);
    if (islak) { g.fillStyle = css(rk, 0.16); g.fill(); return; }
    g.lineWidth = r * 0.14; g.strokeStyle = css(rk, 0.8); g.stroke();
  });
}

/* GELİŞ FİŞİ — ilk paraf düşene dek keçenin üstünde evrakın kendisi durur ("evrak masaya
   geldi"): hangi evrak, ne zaman (saat koşumun gerçek başlangıcından — uydurma kayıt no YOK).
   Fiş DÜZ durur (tur 6: eğik kâğıt kamu ciddiyetine aykırı — eğim yalnız Damga atomunun
   imzası). Tek hareketi iniş (y + opaklık) ve masaya alınıştır. */
function GelisFisi({ ad, meta, saat }) {
  return (
    <motion.div key="fis" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 72, transition: { duration: 0.28, ease: EASE_BEZIER.inOut } }}
      transition={{ duration: 0.22, ease: EASE_BEZIER.out }}
      style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", background: PAL.surf2, pointerEvents: "none" }}>
      {/* Fiş defterin YERİNİ tam kaplar (tur 9: ortada yüzerken kenarlarda kırpık yuva artıkları görünüyordu). */}
      <div style={{ width: "min(84%, 340px)", background: PAL.surf, borderRadius: 3, boxShadow: `${SH.pop}, 0 0 0 1px ${PAL.line}`, padding: `${SP.m}px ${SP.l}px` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.s, ...TYPE.antet, fontSize: 10, color: PAL.mut2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        <span>Evrak geldi</span>
        <span style={{ flex: 1, height: 1, background: PAL.line }} />
        {saat && <span style={{ ...TNUM }}>{saat}</span>}
      </div>
      <div style={{ marginTop: 6, height: 3, borderTop: `1.5px solid ${PAL.ink}`, borderBottom: `1px solid ${PAL.ink}`, opacity: 0.85 }} />
      <div style={{ marginTop: SP.s, ...TYPE.ui, fontWeight: 600, color: PAL.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</div>
      <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: PAL.mut2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...TNUM }}>{meta || "okunmayı bekliyor"}</div>
      </div>
    </motion.div>
  );
}

const saatOf = (runBase) => {
  if (!Number.isFinite(runBase) || runBase <= 0 || typeof performance === "undefined") return "";
  const d = new Date(Date.now() - (performance.now() - runBase));
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function egimOf(id) { let x = 0; for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 997; return (x % 11) - 6; }

/* Pusula satırıyla BAĞ (tur 8): satır üzerine gelince / odaklanınca ilgili yuvaya ince halka
   çizilir; yuva tıklanınca aynı adım detayı açılır (klavye yolu pusula satırlarındadır — defter
   aria-hidden kalır). Yalnız transform/opacity. */
function YuvaBag({ y, durum, vurgulu, onYuva }) {
  const { a, x, r } = y;
  const col = a.gorev === 2 ? V : T;
  return (
    <>
      <span style={{ position: "absolute", left: x - r - 4, top: y.y - r - 4, width: r * 2 + 8, height: r * 2 + 8, boxSizing: "border-box", borderRadius: RAD.dot, border: `1.5px solid ${col}`, opacity: vurgulu ? 1 : 0, transform: vurgulu ? "scale(1)" : "scale(.9)", transition: "opacity .14s var(--ke-ease-out), transform .14s var(--ke-ease-out)", pointerEvents: "none" }} />
      {onYuva && <span onClick={() => onYuva(a.sira)} title={`${String(a.sira + 1).padStart(2, "0")} · ${a.label}`} style={{ position: "absolute", left: x - r, top: y.y - r, width: r * 2, height: r * 2, borderRadius: RAD.dot, cursor: "pointer", zIndex: 2 }} />}
      <Yuva y={y} durum={durum} />
    </>
  );
}

/* EŞZAMANLI AYRAÇ (tur 8) — paraf defterinde aynı katmanda (start.katmanlar, §8) eşzamanlı
   koşan yuvaların altına ince köşeli ayraç: pusuladaki çatalla AYNI olguyu söyler. Harita
   yoksa (boş hâl önizlemesi) `esZamanli` hiç işaretlenmez → ayraç çizilmez. */
function esZamanliAyraclar(yuvalar) {
  const out = [];
  let i = 0;
  while (i < yuvalar.length) {
    const a = yuvalar[i];
    let j = i;
    while (j + 1 < yuvalar.length && a.a.esZamanli && yuvalar[j + 1].a.katman === a.a.katman && yuvalar[j + 1].y === a.y && yuvalar[j + 1].a.gorev === a.a.gorev) j += 1;
    if (j > i) out.push({ id: a.a.id, x0: a.x - a.r, x1: yuvalar[j].x + a.r, y: a.y + a.r + 3, col: a.a.gorev === 2 ? V : T });
    i = j + 1;
  }
  return out;
}

/* Yuvanın HTML katmanı — numara / baş harf / halka biçimi (renk tek sinyal değil). Mürekkebin
   kendisi WebGL'dedir; burada yalnız keskin tipografi ve mürekkepsiz kipler çizilir. */
function Yuva({ y, durum }) {
  const { a, x, r } = y;
  const col = a.gorev === 2 ? V : T;
  const derin = DERIN_OF(durum === "hata" ? BANT.kirmizi.c : a.id === "risk_guard" && a.bant && BANT[a.bant] ? BANT[a.bant].c : col);
  const no = a.numarasiz ? "" : String(a.sira + 1).padStart(2, "0");
  const kutu = { position: "absolute", left: x - r, top: y.y - r, width: r * 2, height: r * 2, boxSizing: "border-box", borderRadius: RAD.dot, display: "flex", alignItems: "center", justifyContent: "center" };
  const rakam = { fontFamily: MONO, fontSize: Math.max(10, r * 0.52), lineHeight: 1, ...TNUM };
  if (durum === "calisti" || durum === "hata") {
    const egim = egimOf(a.id);
    return (
      <span style={{ ...kutu, "--egim": `${egim}deg`, color: derin, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "125%", fontSize: Math.max(10, r * 0.62), letterSpacing: ".02em", transform: `rotate(${egim}deg)`, animation: "ke-e-paraf .45s var(--ke-ease-out) both" }}>
        {durum === "hata" ? "×" : parafUret(a.id, a.label)}
      </span>
    );
  }
  if (durum === "isleniyor") return (
    <span style={{ ...kutu, color: derin }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: RAD.dot, border: `1.5px dashed ${col}`, animation: "nu-spin 6s linear infinite" }} />
      <span style={{ ...rakam, fontWeight: 600 }}>{no}</span>
    </span>
  );
  const kenar = {
    gerekmedi: `1.5px solid ${PAL.lineHi}`, atlandi: `1.5px dashed ${PAL.lineHi}`,
    kesildi: `1.5px dashed ${BANT.kirmizi.c}`, yarida: `1.5px dashed ${BANT.kirmizi.c}`, islenmedi: `1px dotted ${PAL.lineHi}`,
  }[durum] || `1.5px solid ${PAL.lineHi}`;   // bekliyor: koyuda da seçilen halka (tur 9)
  const kirmizi = durum === "kesildi" || durum === "yarida";
  return (
    <span style={{ ...kutu, border: kenar, color: kirmizi ? DERIN_OF(BANT.kirmizi.c) : PAL.mut3 }}>
      {durum === "gerekmedi" ? <span style={{ width: r * 0.6, height: 1.5, background: PAL.lineHi }} /> : <span style={rakam}>{no}</span>}
    </span>
  );
}

function useBoyut(ref) {
  const [b, setB] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setB({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setB({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return b;
}

/* Tek kare çizimi — WebGL varsa shader, yoksa Canvas 2D yedeği. `boya` = {renkler, zemin}. */
function kareCizici(ctx, cv, cv2Ref, durumRef, boya) {
  return (zamanSn) => {
    const { damlalar } = durumRef.current;
    if (!ctx) { if (cv2Ref.current) yedekCiz(cv2Ref.current, damlalar, boya.renkler, boya.zemin); return; }
    const { gl, u } = ctx;
    gl.uniform2f(u.res, cv.width, cv.height);
    gl.uniform1f(u.t, zamanSn);
    gl.uniform1i(u.n, damlalar.length);
    gl.uniform3fv(u.zemin, boya.zemin);
    u.r.forEach((l, i) => gl.uniform3fv(l, boya.renkler[i]));
    const D = new Float32Array(AZAMI_DAMLA * 4), K = new Float32Array(AZAMI_DAMLA);
    damlalar.forEach((d, i) => { D.set([d.x, d.y, d.z, d.renk], i * 4); K[i] = d.k; });
    gl.uniform4fv(u.d, D); gl.uniform1fv(u.k, K);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/* Boyut / görünürlük / tema gözlemcileri — temizleyici döndürür. */
function gozlemle(kap, { boyutla, baslat, statik, renkOku, gorunurYap }) {
  const ro = new ResizeObserver(() => { boyutla(); baslat(); statik(); });
  ro.observe(kap);
  const io = new IntersectionObserver((g) => { gorunurYap(g[g.length - 1].isIntersecting); });
  io.observe(kap);
  const gor = () => { if (!document.hidden) baslat(); };
  document.addEventListener("visibilitychange", gor);
  const mo = new MutationObserver(() => { renkOku(); statik(); baslat(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { ro.disconnect(); io.disconnect(); mo.disconnect(); document.removeEventListener("visibilitychange", gor); };
}

/* WebGL döngüsü — mount'ta bir kez kurulur; çizilecek izler durumRef'ten okunur. */
function useMurekkep(kapRef, cvRef, cv2Ref, probRef, durumRef) {
  useEffect(() => {
    const cv = cvRef.current, kap = kapRef.current, prob = probRef.current;
    const durum = durumRef.current;
    if (!cv || !kap || !prob) return undefined;
    const az = azHareketMi();
    const ctx = glKur(cv);
    const boya = { renkler: [], zemin: [1, 1, 1] };
    const renkOku = () => { boya.renkler = RENKLER.map((c) => tokenRgb(prob, c)); boya.zemin = tokenRgb(prob, KECE); };
    renkOku();
    let raf = 0, son = 0, gorunur = true;
    const boyutla = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const hedef = ctx ? cv : cv2Ref.current;
      if (!hedef) return;
      hedef.width = Math.max(1, Math.round(kap.clientWidth * dpr));
      hedef.height = Math.max(1, Math.round(kap.clientHeight * dpr));
      ctx?.gl.viewport(0, 0, cv.width, cv.height);
    };
    const kare = kareCizici(ctx, cv, cv2Ref, durumRef, boya);
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
    const birak = gozlemle(kap, { boyutla, baslat, statik: () => { if (az || !ctx) statik(); }, renkOku: () => { renkOku(); statik(); }, gorunurYap: (g) => { gorunur = g; if (g) baslat(); } });
    return () => {
      cancelAnimationFrame(raf); birak();
      // loseContext ÇAĞRILMAZ: StrictMode'un çift effect'inde aynı canvas'ın ikinci
      // getContext'i kayıp bağlamı döndürür ve sahne boş kalır.
      durum.ciz = () => {};
    };
  }, [kapRef, cvRef, cv2Ref, probRef, durumRef]);
}

export default function AjanOrb({ display = [], kosumda = false, yukseklik = 196, gelis = null, runBase = 0, durdu = null, vurgu = null, onYuva = null, children = null }) {
  const kapRef = useRef(null);
  const cvRef = useRef(null);
  const cv2Ref = useRef(null);
  const probRef = useRef(null);
  const dogumRef = useRef(new Map());     // adım id → paraf doğumu (sn, performance saati)
  const ilkRef = useRef(true);
  const durumRef = useRef({ damlalar: [], kosumda, ciz: () => {} });
  const { w, h } = useBoyut(kapRef);
  const { yuvalar, bantlar } = useMemo(() => defterYerlesimi(display, w, h), [display, w, h]);
  const durumlar = useMemo(() => yuvalar.map((y) => sahneDurumu(y.a, durdu)), [yuvalar, durdu]);
  const parafSayisi = durumlar.filter((d) => d === "calisti" || d === "hata").length;

  useEffect(() => {
    if (!h) return;
    const simdi = performance.now() / 1000;
    const dog = dogumRef.current;
    const izli = new Set();
    const izler = [], islak = [];
    yuvalar.forEach((y, i) => {
      const d = durumlar[i];
      const uv = { x: y.x / h, y: (h - y.y) / h, k: y.r / h };
      if (d === "calisti" || d === "hata") {
        izli.add(y.a.id);
        if (!dog.has(y.a.id)) dog.set(y.a.id, ilkRef.current ? simdi - 60 : simdi);
        izler.push({ ...uv, z: dog.get(y.a.id), renk: damlaRengi(y.a, d) });
      } else if (d === "isleniyor") {
        const z = Number.isFinite(runBase) && runBase > 0 && Number.isFinite(y.a.t0) ? (runBase + y.a.t0) / 1000 : simdi;
        islak.push({ ...uv, z, renk: 10 + (y.a.gorev === 2 ? 1 : 0) });
      }
    });
    // Yeni koşum (biten kayboldu) → defter sıfırlanır.
    for (const id of [...dog.keys()]) if (!izli.has(id)) dog.delete(id);
    ilkRef.current = false;
    durumRef.current.damlalar = [...izler, ...islak].slice(-AZAMI_DAMLA);
    durumRef.current.kosumda = kosumda;
    durumRef.current.ciz();
  }, [yuvalar, durumlar, kosumda, runBase, h]);

  useMurekkep(kapRef, cvRef, cv2Ref, probRef, durumRef);

  const fisGoster = !!gelis && kosumda && parafSayisi === 0;
  const saat = useMemo(() => saatOf(runBase), [runBase]);
  return (
    <div ref={kapRef} aria-hidden="true" style={{ position: "relative", width: "100%", height: yukseklik, borderRadius: RAD.ctl, overflow: "hidden", background: KECE }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <canvas ref={cv2Ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
      <span ref={probRef} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      {/* Bant künyeleri + bantlar arası ince dikiş — "I" üst bant, "II" alt bant. */}
      {bantlar.map((b, i) => (
        <span key={b.gorev} style={{ position: "absolute", left: 0, top: b.ust, height: b.yukseklik, width: PAD.sol - 6, display: "flex", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${PAL.line}`, fontFamily: DISPLAY, fontWeight: 800, fontStretch: "120%", fontSize: 11, color: DERIN_OF(b.gorev === 2 ? V : T) }}>
          {b.gorev === 2 ? "II" : "I"}
          {i > 0 && <span style={{ position: "absolute", left: 6, top: -PAD.bant / 2 - 0.5, width: w - 12, height: 0, borderTop: `1px dashed ${PAL.lineHi}` }} />}
        </span>
      ))}
      {esZamanliAyraclar(yuvalar).map((b) => (
        <span key={`ayrac-${b.id}`} style={{ position: "absolute", left: b.x0, top: b.y, width: b.x1 - b.x0, height: 4, boxSizing: "border-box", borderLeft: `1px solid ${b.col}`, borderRight: `1px solid ${b.col}`, borderBottom: `1px solid ${b.col}`, opacity: 0.55 }} />
      ))}
      {yuvalar.map((y, i) => <YuvaBag key={y.a.id} y={y} durum={durumlar[i]} vurgulu={vurgu === y.a.id} onYuva={onYuva} />)}
      <AnimatePresence>
        {fisGoster && <GelisFisi ad={gelis.ad} meta={gelis.meta} saat={saat} />}
      </AnimatePresence>
      {children}
    </div>
  );
}
