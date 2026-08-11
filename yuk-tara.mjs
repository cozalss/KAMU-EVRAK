/* Çubuk yanıp-sönme avı: içerik kap yüksekliğini tam kestiği bölgeyi yükseklik tarayarak ara.
   Sınır: 2·1,414·kağıtGen ≈ kapYük  →  kağıtGen ≈ kapYük/2,83. Geniş modda kağıtGen
   yükseklikten türer (sutunH×0,707), yani yüksekliği kısaltmak bizi tam sınıra götürür. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/cemmo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const FULL = "C:/Users/cemmo/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const W = Number(process.env.W || 1300), SAYFA = Number(process.env.SAYFA || 2);
const H0 = Number(process.env.H0 || 560), H1 = Number(process.env.H1 || 1100), AD = Number(process.env.AD || 20);
const b = await chromium.launch({ headless: false, executablePath: FULL });
let kotu = 0;
for (let h = H0; h <= H1; h += AD) {
  const p = await b.newPage({ viewport: { width: W, height: h } });
  const hata = [];
  p.on("pageerror", (e) => hata.push(String(e.message).split("\n")[0]));
  try { await p.goto(`http://localhost:5173/olcum-jank.html?sayfa=${SAYFA}`, { waitUntil: "load" }); await p.waitForTimeout(1000); } catch {}
  const o = await p.evaluate(() => (window.__ORNEKLER || []).slice(-50)).catch(() => []);
  const rn = await p.evaluate(() => window.__RENDER || 0).catch(() => -1);
  await p.close();
  const ol = [...new Set(o.map(x => x.olcek))], cb = [...new Set(o.map(x => x.cubuk))];
  const son = o[o.length - 1] || {};
  const crash = hata.find(x => /Maximum update depth/i.test(x));
  const bad = crash || ol.length > 1 || cb.length > 1;
  if (bad) kotu++;
  console.log(`  H=${String(h).padStart(4)} ${crash ? "ÇÖKTÜ " : bad ? "OYNAK " : "  ok  "} render=${String(rn).padStart(4)} kapGen=${String(son.kapGen).padStart(4)} kapYük=${String(son.kapYuk ?? "-").padStart(4)} ölçek={${ol.join(",")}} çubuk={${cb.join(",")}}${crash ? "  <-- " + crash.slice(0,50) : ""}`);
}
await b.close();
console.log(kotu ? `\n### ${kotu} KIRILGAN NOKTA` : "\n### bu taramada oynaklık YOK");
