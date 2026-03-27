/// <reference types="vitest" />
import { webdriverio } from "@vitest/browser-webdriverio";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15000,
    browser: {
      provider: webdriverio(),
      instances: [{ browser: "chrome" }]
    },
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
