import type {
  CatalogDocument,
  CommandRequest,
  CommandResponse,
  FarmCommand,
  FarmResponse,
} from "@my-farm/contracts";
import type { BasicFarmScenarioId } from "@my-farm/game-model/basicFarmScenarios";
import {
  createHttpFarmClient,
  normalizeCommandResponse,
  normalizeFarmResponse,
  websocketUrl as sharedWebsocketUrl,
  type FarmClient,
  type FarmConnectionHandlers,
  type FarmConnectionStatus,
  type LegacyCommandResponse,
  type LegacyFarmResponse,
} from "@my-farm/game-client";
import { currentScenarioId } from "./scenarioRoutes";

const defaultApiPort = "8081";
const demoSaveKey = "my-farm.demo.save.v1";

export type { FarmClient, FarmConnectionHandlers, FarmConnectionStatus };

export function createFarmClient(baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl()): FarmClient {
  if (import.meta.env.VITE_MY_FARM_RUNTIME === "wasm_demo") {
    return createWasmDemoClient();
  }
  return createHttpFarmClient(baseUrl, websocketUrl(baseUrl), {
    now: Date.now,
    randomUUID:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? () => crypto.randomUUID()
        : undefined,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    WebSocket,
  });
}

type WasmDemoRuntime = {
  catalog_json(): string;
  farm_json(nowMs: number): string;
  reset(nowMs: number): string;
  command_json(requestJson: string, nowMs: number): string;
  save_json(): string;
};

function createWasmDemoClient(): FarmClient {
  let runtimePromise: Promise<WasmDemoRuntime> | null = null;
  const scenarioId = currentScenarioId();

  async function runtime(): Promise<WasmDemoRuntime> {
    if (!runtimePromise) {
      runtimePromise = loadWasmDemoRuntime();
    }
    return runtimePromise;
  }

  async function loadWasmDemoRuntime(): Promise<WasmDemoRuntime> {
    const existingModule = import.meta.env.DEV
      ? (window as typeof window & {
          __myFarmWasmModule?: typeof import("./generated/my_farm_wasm/my_farm_wasm.js");
        }).__myFarmWasmModule
      : undefined;
    const module = existingModule ?? await import("./generated/my_farm_wasm/my_farm_wasm.js");
    if (!existingModule) {
      await module.default();
    }
    if (import.meta.env.DEV) {
      (window as typeof window & { __myFarmWasmModule?: typeof module }).__myFarmWasmModule = module;
    }
    if (scenarioId) {
      return createScenarioRuntime(module.DemoFarmRuntime, scenarioId, Date.now());
    }
    return new module.DemoFarmRuntime(window.localStorage.getItem(demoSaveKey) ?? undefined, Date.now());
  }

  function persist(nextRuntime: WasmDemoRuntime) {
    if (scenarioId) {
      return;
    }
    window.localStorage.setItem(demoSaveKey, nextRuntime.save_json());
  }

  return {
    runtime: "wasm_demo",
    async catalog(): Promise<CatalogDocument> {
      return JSON.parse((await runtime()).catalog_json()) as CatalogDocument;
    },
    async farm(): Promise<FarmResponse> {
      return normalizeFarmResponse(JSON.parse((await runtime()).farm_json(Date.now())) as LegacyFarmResponse);
    },
    async reset(): Promise<FarmResponse> {
      const nextRuntime = await runtime();
      const response = normalizeFarmResponse(JSON.parse(nextRuntime.reset(Date.now())) as LegacyFarmResponse);
      persist(nextRuntime);
      return response;
    },
    async command(command: CommandRequest): Promise<CommandResponse> {
      const nextRuntime = await runtime();
      const response = normalizeCommandResponse(
        JSON.parse(nextRuntime.command_json(JSON.stringify(command), Date.now())) as LegacyCommandResponse,
      );
      if (response.accepted) {
        persist(nextRuntime);
      }
      return response;
    },
  };
}

function createScenarioRuntime(
  Runtime: new (savedJson: string | undefined, nowMs: number) => WasmDemoRuntime,
  scenarioId: BasicFarmScenarioId,
  nowMs: number,
): WasmDemoRuntime {
  const startMs = nowMs - 1_000_000;
  const runtime = new Runtime(undefined, startMs);
  let version = 0;

  const snapshot = (atMs: number) => {
    version = normalizeFarmResponse(JSON.parse(runtime.farm_json(atMs)) as LegacyFarmResponse).version;
  };
  const command = (command: FarmCommand, atMs: number) => {
    const requestJson = JSON.stringify({ expected_version: version, command });
    const response = normalizeCommandResponse(
      JSON.parse(runtime.command_json(requestJson, atMs)) as LegacyCommandResponse,
    );
    if (!response.accepted) {
      throw new Error(response.error ?? `Scenario setup failed for ${scenarioId}`);
    }
    version = response.version;
  };
  const plantWheat = (plotIds: string[], atMs: number) =>
    command({ type: "sweep_plant", crop_id: "wheat", plot_ids: plotIds }, atMs);
  const harvest = (plotIds: string[], atMs: number) =>
    command({ type: "sweep_harvest", plot_ids: plotIds }, atMs);

  switch (scenarioId) {
    case "fresh-farm":
      break;
    case "planting-wheat":
    case "resident-work-queue":
    case "blocked-work-and-storage":
      plantWheat(["plot-1"], nowMs);
      break;
    case "harvesting-ready-crops":
      plantWheat(["plot-1"], startMs);
      snapshot(nowMs);
      break;
    case "unlocking-corn-and-oven":
      plantWheat(["plot-1", "plot-2", "plot-3", "plot-4"], startMs);
      snapshot(startMs + 500_000);
      harvest(["plot-1", "plot-2", "plot-3", "plot-4"], startMs + 500_000);
      snapshot(nowMs);
      break;
    case "making-bread":
      plantWheat(["plot-1", "plot-2", "plot-3", "plot-4"], startMs);
      snapshot(startMs + 350_000);
      harvest(["plot-1", "plot-2", "plot-3", "plot-4"], startMs + 350_000);
      snapshot(startMs + 650_000);
      command({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" }, startMs + 650_000);
      command({ type: "queue_oven_recipe", recipe_id: "bread" }, nowMs);
      break;
  }

  return runtime;
}

function defaultBaseUrl(): string {
  const hostname = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${hostname}:${defaultApiPort}`;
}

export function websocketUrl(baseUrl: string): string {
  return sharedWebsocketUrl(baseUrl, import.meta.env.VITE_GAMEPLAY_WS_URL);
}
