import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside a Next.js server bundle; tests import
      // route handlers directly, so resolve it to an empty module.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
