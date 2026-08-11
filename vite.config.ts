import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundling breaks the emscripten glue; load as-is.
    exclude: ["bridge-dds"],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    proxy: {
      // Sol coach (scripts/coach-server.mjs) — long-running codex turns.
      "/api/coach": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
