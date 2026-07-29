import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Covers apps/web AND packages/shared — the shared package has no runtime
 * deps of its own, and its logic (URL rules, terms builder, contract-state
 * parsing) is only meaningful alongside the UI that consumes it.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(here, "src"),
      "@hypebond/shared": resolve(here, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [resolve(here, "test/setup.ts")],
    include: [
      resolve(here, "src/**/*.test.{ts,tsx}"),
      resolve(here, "test/**/*.test.{ts,tsx}"),
      resolve(here, "../../packages/shared/src/**/*.test.ts"),
    ],
    restoreMocks: true,
  },
});
