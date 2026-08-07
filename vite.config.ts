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
});
