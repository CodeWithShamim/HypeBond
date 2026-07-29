import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Env lives at the repo root so contract deploys and the app share it.
  envDir: resolve(here, "../.."),
  resolve: {
    alias: {
      "@": resolve(here, "src"),
    },
  },
  build: {
    // genlayer-js pulls in viem and dominates the bundle. Splitting it from
    // the app code means a UI change no longer invalidates ~500 kB of vendor
    // JS in every returning visitor's cache.
    //
    // Only the chain stack is split out: framer-motion and React import each
    // other's internals, and separating them produced a circular chunk graph
    // (motion -> vendor -> motion), which risks module-init order bugs at
    // runtime for a few kB of cache granularity.
    rollupOptions: {
      output: {
        manualChunks: {
          chain: ["genlayer-js"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
