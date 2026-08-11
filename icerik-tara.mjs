/* İçerik uzunluğunu tarayarak çubuk yanıp-sönme SINIRINI ara: içerik yüksekliği kap
   yüksekliğini tam kestiği noktada çubuk gelip gider ve ölçek 15px'lik sıçramayla salınır. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/cemmo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const FULL = "C:/Users/cemmo/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const W = Number(process.env.W || 1300), H = Number(process.env.H || 680);
const b = await chromium.launch({ headless: false, executablePath: FULL });
let kotu = 0;
console.log(`içerik taraması: ${W}x${H}`);
for (let t = 1; t <= Number(process.env.TMAX || 14); t++) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const hata = [];
  p.on("pageerror", (e) => hata.push(String(e.message).split("\n")[0]));
  try { await p.goto(`http://localhost:5173/olcum-jank.html?tekrar=${t}`, { waitUntil: "load" }); await p.waitForTimeout(1000); } catch {}
  const d = await p.evaluate(() => {
    const k = document.querySelector("[data-karar-kagit]");
    return { icerik: k?.scrollHeight, kap: k?.clientHeight, sayfa: document.querySelectorAll(".ke-a4-sayfa").length };
  }).catch(() => ({}));
  const o = await p.evaluate(() => (window.__ORNEKLER || []).slice(-50)).catch(() => []);
  const rn = await p.evaluate(() => window.__RENDER || 0).catch(() => -1);
  await p.close();
  const ol = [...new Set(o.map(x => x.olcek))], cb = [...new Set(o.map(x => x.cubuk))];
  const crash = hata.find(x => /Maximum update depth/i.test(x));
  const bad = crash || ol.length > 1 || cb.length > 1;
  if (bad) kotu++;
  const pay = d.icerik != null && d.kap != null ? d.icerik - d.kap : NaN;
  console.log(`  tekrar=${String(t).padStart(2)} ${crash ? "ÇÖKTÜ " : bad ? "OYNAK " : "  ok  "} sayfa=${d.sayfa} içerik-kap=${String(pay).padStart(6)} render=${String(rn).padStart(3)} ölçek={${ol.join(",")}} çubuk={${cb.join(",")}}${crash ? " <-- " + crash.slice(0,45) : ""}`);
}
await b.close();
console.log(kotu ? `\n### ${kotu} KIRILGAN NOKTA` : "\n### sınır boyunca oynaklık YOK");
