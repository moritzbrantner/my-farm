import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    allowedHosts: ["castle", "castle.local", "castle.fritz.box"],
    host: "0.0.0.0",
    port: 5176,
  },
  preview: {
    allowedHosts: ["castle", "castle.local", "castle.fritz.box"],
    host: "0.0.0.0",
    port: 4174,
  },
});
