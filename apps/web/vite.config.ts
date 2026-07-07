import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), staticWikiRouteEntrypoints()],
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

function staticWikiRouteEntrypoints() {
  return {
    name: "static-wiki-route-entrypoints",
    closeBundle() {
      const distRoot = resolve(configDir, "dist");
      const indexHtml = resolve(distRoot, "index.html");
      if (!existsSync(indexHtml)) {
        return;
      }

      const wikiRoutes = ["wiki", ...wikiScenarioRouteFolders().map((route) => `wiki/${route}`)];
      for (const route of wikiRoutes) {
        const routeIndex = resolve(distRoot, route, "index.html");
        mkdirSync(dirname(routeIndex), { recursive: true });
        copyFileSync(indexHtml, routeIndex);
      }
    },
  };
}

function wikiScenarioRouteFolders() {
  const wikiPagesDir = resolve(configDir, "src/pages/wiki");
  return readdirSync(wikiPagesDir)
    .filter((fileName) => /^scenario-\d+\.ts$/.test(fileName))
    .map((fileName) => fileName.replace(/\.ts$/, ""))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
