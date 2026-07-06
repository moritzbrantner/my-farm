import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["pages-demo.spec.ts", "zz-pages-demo-scenarios.spec.ts"],
  workers: 1,
  webServer: {
    command:
      "cd ../.. && bun run build:wasm-demo && cd apps/web && VITE_MY_FARM_RUNTIME=wasm_demo vite --host 127.0.0.1 --port 5195",
    url: "http://127.0.0.1:5195",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:5195",
    trace: "on-first-retry",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
