import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@ristonchi/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
