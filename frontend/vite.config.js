import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend (FastAPI :8000) proxy — SSE dahil.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/process_doc": { target: "http://localhost:8000", changeOrigin: true },
      "/multimodal": { target: "http://localhost:8000", changeOrigin: true },
      "/yazi": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
