import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The source strings inside the code are French; pin the locale so unit
    // assertions on messages stay stable regardless of the app default.
    setupFiles: ["src/testLocale.ts"],
  },
});
