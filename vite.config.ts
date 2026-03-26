/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/basis/**", "src/**/*.d.ts", "src/web/**", "src/type.ts"],
      thresholds: {
        statements: 95,
        lines: 95,
        functions: 95,
        branches: 75
      }
    }
  }
});
