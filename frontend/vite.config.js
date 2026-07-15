import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

// Backend (FastAPI :8000) proxy — SSE dahil.
export default defineConfig({
  plugins: [react()],
  // Multi-page:
  //  index.html → LANDING (portfolio, kök "/") — kendi Tailwind'i, izole.
  //  app.html   → neon çalışma alanı (auth → dashboard).
  // İki ayrı doküman → Tailwind preflight neon app'i etkilemez.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
  server: {
    port: 5173,
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
