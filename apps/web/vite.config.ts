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
});
