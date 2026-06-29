import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: [
    {
      command:
        "cd ../.. && MY_FARM_DATABASE_URL=sqlite://e2e-my-farm.sqlite MY_FARM_PORT=8091 cargo run -p my_farm_server",
      url: "http://127.0.0.1:8091/api/health",
      reuseExistingServer: false,
    },
    {
      command: "VITE_API_BASE_URL=http://127.0.0.1:8091 vite --host 127.0.0.1 --port 5194",
      url: "http://127.0.0.1:5194",
      reuseExistingServer: false,
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:5194",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
