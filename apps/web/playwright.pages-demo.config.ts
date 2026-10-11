import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["pages-demo.spec.ts", "zz-pages-demo-scenarios.spec.ts", "wheat-art.spec.ts"],
  workers: 1,
  webServer: {
    command:
      "cd ../.. && if [ \"${MY_FARM_PREBUILT_WASM:-0}\" != \"1\" ]; then bun run build:wasm-demo; fi && cd apps/web && VITE_MY_FARM_RUNTIME=wasm_demo vite --host 127.0.0.1 --port 5195",
    url: "http://127.0.0.1:5195",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:5195",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      // The chromium-headless-shell renderer segfaults (SEGV_ACCERR in JIT code)
      // on navigation after the WASM runtime and software WebGL have run;
      // full Chromium in new headless mode does not. See my-farm#178.
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
});
