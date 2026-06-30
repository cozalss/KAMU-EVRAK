import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

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
      "/process_doc": { target: "http://localhost:8000", changeOrigin: true },
      "/multimodal": { target: "http://localhost:8000", changeOrigin: true },
      "/yazi": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
      // DB API (Faz 7) — auth + kalıcı kayıt görünümleri.
      "/auth": { target: "http://localhost:8000", changeOrigin: true },
      "/panel": { target: "http://localhost:8000", changeOrigin: true },
      "/mevzuat": { target: "http://localhost:8000", changeOrigin: true },
      "/referans": { target: "http://localhost:8000", changeOrigin: true },
      "/gelen-evrak": { target: "http://localhost:8000", changeOrigin: true },
      "/giden-evrak": { target: "http://localhost:8000", changeOrigin: true },
      "/taslaklar": { target: "http://localhost:8000", changeOrigin: true },
      "/islemler": { target: "http://localhost:8000", changeOrigin: true },
      "/islem": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
