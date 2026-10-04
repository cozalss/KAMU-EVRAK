import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

// Çalışma alanının büyük üçüncü-taraf paketleri AYRI, uzun ömürlü chunk'lara (Dev Award · WPO).
// Uygulama kodu her dağıtımda değişir, bu paketler değişmez → tarayıcı önbelleği yeniden
// indirmez; HTTP/2 üzerinde paralel iner. YALNIZ çalışma alanına özgü paketler eşlenir:
// react/react-dom/scheduler AÇIKÇA kendi "v-react"
// chunk'ına konur: konmazsa Rollup onları ilk paylaşan manuel chunk'a (v-radix/v-query)
// çeker ve yönlendirme sayfası radix+query.yi de indirmeye başlar (ölçüldü). CSS bu
// kuraldan etkilenmez; JS'te yalnız ortak React chunk'ının adı değişir. Tembel yüklenen PDF motoru
// (pdfjs-dist/react-pdf) ve dropzone/embla kendi tembel chunk'larında kalır (eşlenmez).
// Radix/sonner/lucide BİLEREK eşlenmez: tek bir "v-ui" kovası giriş ekranına menü/diyalog/
// toast kodunu da taşıyordu (ölçüldü: giriş grafiğine +96 kB radix, +75 kB ui). Rollup
// bunları kullanan chunk'lara kendisi dağıtınca her kabuk yalnız kendi ihtiyacını indirir.
const SATICI = [
  ["v-react", /node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ["v-motion", /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/],
  ["v-query", /node_modules[\\/]@tanstack[\\/]/],
];
const saticiParcasi = (id) => SATICI.find(([, re]) => re.test(id))?.[0];

// Çalışma alanı kabuğu (DashboardApp) main.jsx'te TEMBEL yüklenir (giriş ekranı onu indirmesin);
// ama girişli açılışta giriş chunk'ı çalışıp import() edene kadar BEKLEMESİN diye kabuk ve
// bağımlılık zinciri app.html'e modulepreload olarak yazılır — yalnız indirme/derleme ipucu,
// ÇALIŞTIRMA değil. Ölçüm (Lighthouse mobil, panel): ipucusuz FCP 1,2→1,9 sn geriliyordu.
// Yalnız build'de (ctx.bundle) ve yalnız app.html.de.
const kabukOnYukle = {
  name: "ke-kabuk-on-yukle",
  transformIndexHtml: {
    order: "post",
    handler(html, ctx) {
      if (!ctx.bundle || !ctx.filename.endsWith("app.html")) return;
      const kabuk = Object.values(ctx.bundle).find((c) => c.type === "chunk" && c.isDynamicEntry && c.name === "DashboardApp");
      if (!kabuk) return;
      const zincir = new Set();
      const gez = (f) => { if (zincir.has(f)) return; zincir.add(f); (ctx.bundle[f]?.imports || []).forEach(gez); };
      gez(kabuk.fileName);
      return [...zincir].filter((f) => !html.includes(f)).map((f) => ({
        tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${f}` }, injectTo: "head",
      }));
    },
  },
};

// Backend (FastAPI :8000) proxy — SSE dahil.
export default defineConfig({
  plugins: [react(), kabukOnYukle],

  // `@/` takma adı — shadcn/ui bileşenleri kendi aralarında bu yolla import eder
  // (`@/lib/cn`, `@/components/ui/...`). jsconfig.json CLI'ı ve editörü besler, bu satır
  // ise Vite'ın gerçekten çözmesini sağlar; ikisi AYRI yerlerdir, biri eksikse build kırılır.
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  // Multi-page:
  //  index.html → yalnız /app.html'e yönlendirme (ayrı tanıtım sayfası yok, 4 Eki 2026).
  //  app.html   → çalışma alanı (giriş → panel).
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
      output: { manualChunks: saticiParcasi },
    },
  },
  server: {
    port: 5173,
    // LAN'a bağlan (0.0.0.0). Backend zaten UVICORN_HOST=0.0.0.0 ile tüm arayüzlerde
    // dinliyor; frontend yalnız localhost'a bağlanırsa telefonla QR yükleme akışı
    // (aşağıdaki /mobil proxy'si) fiilen kullanılamaz — sayfa telefonda hiç açılmaz.
    // Not: LAN'dan açılınca tarayıcı Origin'i http://<LAN-IP>:5173 olur; backend'in
    // CORS_ORIGINS listesinde bu origin YOKSA istekler bloklanır (.env'e eklenmeli).
    host: true,
    proxy: {
      "/process_doc": { target: apiTarget, changeOrigin: true },
      "/multimodal": { target: apiTarget, changeOrigin: true },
      "/yazi": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
      // DB API (Faz 7) — auth + kalıcı kayıt görünümleri.
      "/auth": { target: apiTarget, changeOrigin: true },
      "/panel": { target: apiTarget, changeOrigin: true },
      "/mevzuat": { target: apiTarget, changeOrigin: true },
      "/referans": { target: apiTarget, changeOrigin: true },
      "/gelen-evrak": { target: apiTarget, changeOrigin: true },
      "/giden-evrak": { target: apiTarget, changeOrigin: true },
      "/taslaklar": { target: apiTarget, changeOrigin: true },
      "/islemler": { target: apiTarget, changeOrigin: true },
      "/islem": { target: apiTarget, changeOrigin: true },
      "/sohbet": { target: apiTarget, changeOrigin: true },
      "/sla": { target: apiTarget, changeOrigin: true },
      // Telefonla evrak yükleme (QR eşleme) — masaüstü poll/oturum çağrıları.
      // (Telefon, QR'daki LAN IP ile backend'e DOĞRUDAN bağlanır; proxy'ye uğramaz.)
      "/mobil": { target: apiTarget, changeOrigin: true },
    },
  },
});
