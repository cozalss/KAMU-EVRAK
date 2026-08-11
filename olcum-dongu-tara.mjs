/* KAYDIRMA ÇUBUĞU HİSTEREZİSİ taraması — code-reviewer'ın bulgusunu bağımsız doğrular.

   İddia: kâğıt ölçeği kabın clientWidth'inden türer, kabın dikey kaydırma çubuğu ise
   ölçeğin ürettiği yığın yüksekliğine bağlıdır. Çubuk gelip gidince genişlik 15px oynar,
   bu da ölçekte 15/793.7 = 0,0189'luk bir sıçrama demektir — OLCEK_ESIK'in (0,00063) 30
   katı. Yani eşik bu salınımı YUTMAZ; her commit'te ölçen efekt onu senkron sonsuz
   döngüye çevirir ve React "Maximum update depth exceeded" ile çöker.

   Bu betik iddiayı test etmez, ARAR: pencere genişliğini tarayıp çöken bandı bulur. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PW_PATH || "C:/Users/cemmo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright",
);
const FULL = process.env.PW_FULL
  || "C:/Users/cemmo/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const TABAN = "http://localhost:5173/olcum-jank.html";

const H = Number(process.env.TARA_H || 1200);
const SAYFA = Number(process.env.TARA_SAYFA || 2);
const W0 = Number(process.env.TARA_W0 || 1090);
const W1 = Number(process.env.TARA_W1 || 1200);
const ADIM = Number(process.env.TARA_ADIM || 5);

/* Headless shell VARSAYILAN olarak overlay (0px) kaydırma çubuğu kullanır — o hâlde geri
   besleme kenarı hiç oluşmaz ve tarama yanlış "temiz" der. Kullanıcı Windows 11 + Chrome
   kullanıyor; orada `overflow:auto` klasik ~15px çubuk çizer. Bayrak bunu geri getirir. */
/* HEADED ŞART: ölçüldü (cubuk-probe) — headless shell VE full chromium'un her headless
   kipi 0px overlay çubuk verir; klasik 15px çubuk YALNIZ headed modda oluşur. Kullanıcının
   gerçek ortamı (Windows 11 + Chrome, headed) 15px'tir, yani geri besleme kenarı ÜRETİMDE
   VAR ama headless ölçümde YOK. Bu yüzden bu tarama headed koşar. */
const tarayici = await chromium.launch({ headless: false, executablePath: FULL });
console.log(`tarama: yükseklik=${H} sayfa=${SAYFA} genişlik ${W0}..${W1} adım ${ADIM}`);
const coken = [];

for (let w = W0; w <= W1; w += ADIM) {
  const sayfa = await tarayici.newPage({ viewport: { width: w, height: H } });
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(String(e.message).split("\n")[0]));
  try {
    await sayfa.goto(`${TABAN}?sayfa=${SAYFA}&cubuk=${process.env.TARA_CUBUK || 15}`, { waitUntil: "load" });
    await sayfa.waitForTimeout(1200);
  } catch { /* çökmüş sayfa navigasyonu bozabilir — hata listesi yine de okunur */ }
  const o = await sayfa.evaluate(() => (window.__ORNEKLER || []).slice(-40)).catch(() => []);
  const render = await sayfa.evaluate(() => window.__RENDER || 0).catch(() => -1);
  await sayfa.close();

  const derinlik = hatalar.find((h) => /Maximum update depth/i.test(h));
  const olcekler = [...new Set(o.map((x) => x.olcek))];
  const cubuklar = [...new Set(o.map((x) => x.cubuk))];
  // Çökme için çubuğun YANIP SÖNMESİ gerekir; sabit çubuk (hep 0 ya da hep 15) zararsızdır.
  const cubukOynak = cubuklar.length > 1;
  const salinim = olcekler.length > 1;
  const isaret = derinlik ? "ÇÖKTÜ " : (salinim || cubukOynak) ? "OYNAK " : "  ok   ";
  if (derinlik || salinim || cubukOynak) coken.push(w);
  const son = o[o.length - 1] || {};
  console.log(
    `  W=${String(w).padStart(4)} ${isaret} render=${String(render).padStart(4)} ` +
    `kapGen=${String(son.kapGen).padStart(4)} ölçek={${olcekler.join(",")}} çubuk={${cubuklar.join(",")}}` +
    (derinlik ? `  <-- ${derinlik.slice(0, 60)}` : ""),
  );
}

await tarayici.close();
console.log(coken.length
  ? `\n### DOĞRULANDI — kırılgan genişlikler: ${coken.join(", ")}`
  : "\n### bu bantta salınım/çökme YOK");
