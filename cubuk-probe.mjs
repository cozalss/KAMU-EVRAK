import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/cemmo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const FULL = "C:/Users/cemmo/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const olc = async (ad, opts) => {
  try {
    const b = await chromium.launch({ executablePath: FULL, ...opts });
    const p = await b.newPage({ viewport: { width: 800, height: 600 } });
    await p.setContent("<div id=x style='width:100px;height:100px;overflow:scroll'><div style='height:500px'></div></div>");
    const w = await p.evaluate(() => { const x = document.getElementById("x"); return x.offsetWidth - x.clientWidth; });
    await b.close();
    console.log(`${ad.padEnd(42)} çubuk=${w}px`);
    return w;
  } catch (e) { console.log(`${ad.padEnd(42)} HATA ${String(e.message).split("\n")[0].slice(0,60)}`); return -1; }
};
await olc("full chromium, headless varsayılan", { headless: true });
await olc("full chromium, --disable-features=OverlayScrollbar", { headless: true, args: ["--disable-features=OverlayScrollbar"] });
await olc("full chromium, headless:'shell' değil + eski headless", { headless: true, args: ["--headless=old"] });
await olc("full chromium, HEADED", { headless: false });
