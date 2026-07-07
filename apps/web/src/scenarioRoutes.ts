import type { BasicFarmScenarioId } from "@my-farm/game-model/basicFarmScenarios";
import type { WikiPage, WikiScenarioPage } from "./pages/wiki/types";

const wikiPageModule = import.meta.glob("./pages/wiki/index.ts", {
  eager: true,
}) as Record<string, { default: WikiPage }>;
const wikiScenarioPageModules = import.meta.glob("./pages/wiki/scenario-*.ts", {
  eager: true,
}) as Record<string, { default: WikiScenarioPage }>;

const wikiPath = routePathFromIndexFile(Object.keys(wikiPageModule)[0] ?? "./pages/wiki/index.ts");
void Object.values(wikiPageModule)[0]?.default;
const wikiScenarioRoutes = Object.entries(wikiScenarioPageModules)
  .map(([filePath, module]) => ({
    path: `${wikiPath}/${routeSlug(filePath)}`,
    scenarioId: module.default.scenarioId,
  }))
  .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
const scenarioPathById = new Map(
  wikiScenarioRoutes.map((route) => [route.scenarioId, route.path] as const),
);

export type AppRoute =
  | { type: "home" }
  | { type: "wiki" }
  | { type: "scenario"; scenarioId: BasicFarmScenarioId };

export function appRouteFromLocation(location: Location = window.location): AppRoute {
  const path = appPathname(location);
  if (path === wikiPath || path === `${wikiPath}/`) {
    return { type: "wiki" };
  }
  const scenarioRoute = wikiScenarioRoutes.find(
    (route) => path === route.path || path === `${route.path}/`,
  );
  if (scenarioRoute) {
    return { type: "scenario", scenarioId: scenarioRoute.scenarioId };
  }
  return { type: "home" };
}

export function currentScenarioId(location: Location = window.location): BasicFarmScenarioId | null {
  const route = appRouteFromLocation(location);
  return route.type === "scenario" ? route.scenarioId : null;
}

export function scenarioPageHref(scenarioId: BasicFarmScenarioId) {
  return routeHref(scenarioPathById.get(scenarioId) ?? wikiPath);
}

export function wikiPageHref() {
  return routeHref(wikiPath);
}

export function homePageHref() {
  return baseHref();
}

function appPathname(location: Location) {
  const base = normalizedBasePath();
  const pathname = location.pathname || "/";
  if (base !== "/" && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

function routeHref(path: string) {
  return `${baseHref()}${path.replace(/^\//, "")}`;
}

function routeSlug(filePath: string) {
  return filePath.match(/\/([^/]+)\.ts$/)?.[1] ?? "index";
}

function routePathFromIndexFile(filePath: string) {
  return `/${filePath.replace(/^\.\/pages\//, "").replace(/\/index\.ts$/, "")}`;
}

function normalizedBasePath() {
  const base = baseHref();
  return base === "/" ? "/" : base.replace(/\/$/, "");
}

function baseHref() {
  return import.meta.env.BASE_URL || "/";
}
