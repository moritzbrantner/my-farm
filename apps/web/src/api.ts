import type {
  CatalogDocument,
  CommandRequest,
  CommandResponse,
  FarmResponse,
} from "@my-farm/contracts";
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
    return new module.DemoFarmRuntime(window.localStorage.getItem(demoSaveKey) ?? undefined, Date.now());
  }

  function persist(nextRuntime: WasmDemoRuntime) {
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

function defaultBaseUrl(): string {
  const hostname = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${hostname}:${defaultApiPort}`;
}

export function websocketUrl(baseUrl: string): string {
  return sharedWebsocketUrl(baseUrl, import.meta.env.VITE_GAMEPLAY_WS_URL);
}
