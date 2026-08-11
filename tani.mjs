import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/cemmo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const b = await chromium.launch({ headless: true, executablePath: "C:/Users/cemmo/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe" });
const p0 = 0; const p = await b.newPage({ viewport: { width: 1140, height: 1200 } });
p.on("pageerror", e => console.log("PAGEERROR:", String(e.message).split("\n")[0]));
await p.goto("http://localhost:5173/olcum-jank.html?sayfa=2&cubuk=15", { waitUntil: "load" });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const k = document.querySelector("[data-karar-kagit]");
  const y = document.querySelector(".ke-a4-yigin");
  const probe = document.createElement("div");
  probe.style.cssText = "width:100px;height:100px;overflow:scroll;position:absolute;top:-9999px";
  document.body.appendChild(probe);
  const cubukGen = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return {
    cubukGenislikTesti: cubukGen,
    kapClient: k?.clientWidth, kapOffset: k?.offsetWidth, kapYuk: k?.clientHeight,
    kapScrollYuk: k?.scrollHeight, tasiyorMu: k ? k.scrollHeight > k.clientHeight : null,
    yiginYuk: y?.getBoundingClientRect().height,
    sayfaAdet: document.querySelectorAll(".ke-a4-sayfa").length,
    kapOverflow: k ? getComputedStyle(k).overflowY : null,
  };
}));
await b.close();
