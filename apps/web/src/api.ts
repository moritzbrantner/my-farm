import type {
  CatalogDocument,
  CommandRequest,
  CommandResponse,
  FarmResponse,
  FarmView,
  Tile,
} from "./types";
import type { WebsocketServerMessage } from "../../../contracts/generated/ts/my-farm";

const defaultApiPort = "8081";
const defaultSiloTile: Tile = { x: 14, y: 2 };
const defaultBarnTile: Tile = { x: 16, y: 2 };
const defaultDeliveryBoardTile: Tile = { x: 2, y: 7 };
const demoSaveKey = "my-farm.demo.save.v1";
const reconnectDelayMs = 1_000;

type LegacyFarmView = Omit<FarmView, "silo_tile" | "barn_tile" | "delivery_board_tile"> & {
  silo_tile?: Tile | null;
  barn_tile?: Tile | null;
  delivery_board_tile?: Tile | null;
};

type LegacyFarmResponse = Omit<FarmResponse, "view"> & {
  view: LegacyFarmView;
};

type LegacyCommandResponse = Omit<CommandResponse, "view"> & {
  view: LegacyFarmView;
};

export type FarmClient = {
  runtime: "http" | "wasm_demo";
  catalog(): Promise<CatalogDocument>;
  farm(): Promise<FarmResponse>;
  reset(): Promise<FarmResponse>;
  command(command: CommandRequest): Promise<CommandResponse>;
  connect?(handlers: FarmConnectionHandlers): () => void;
};

export type FarmConnectionStatus = "disconnected" | "reconnecting" | "synced";

export type FarmConnectionHandlers = {
  status(status: FarmConnectionStatus): void;
  catalog(catalog: CatalogDocument): void;
  farm(farm: FarmResponse): void;
  error(message: string): void;
};

export function createFarmClient(baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl()): FarmClient {
  if (import.meta.env.VITE_MY_FARM_RUNTIME === "wasm_demo") {
    return createWasmDemoClient();
  }
  return createHttpFarmClient(baseUrl, websocketUrl(baseUrl));
}

function createHttpFarmClient(baseUrl: string, gameplayWebsocketUrl: string): FarmClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      ...init,
    });
    const payloadText = await response.text();
    const payload = parseResponsePayload(payloadText);
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    }
    return payload as T;
  }

  return {
    runtime: "http",
    async catalog(): Promise<CatalogDocument> {
      const payload = await request<{ catalog: CatalogDocument }>("/api/catalog");
      return payload.catalog;
    },
    async farm(): Promise<FarmResponse> {
      return normalizeFarmResponse(await request<LegacyFarmResponse>("/api/farm"));
    },
    async reset(): Promise<FarmResponse> {
      return normalizeFarmResponse(
        await request<LegacyFarmResponse>("/api/farm/reset", { method: "POST" }),
      );
    },
    async command(command: CommandRequest): Promise<CommandResponse> {
      return normalizeCommandResponse(
        await request<LegacyCommandResponse>("/api/commands", {
          method: "POST",
          body: JSON.stringify(command),
        }),
      );
    },
    connect(handlers: FarmConnectionHandlers): () => void {
      return connectGameplayWebsocket(gameplayWebsocketUrl, handlers);
    },
  };
}

function connectGameplayWebsocket(url: string, handlers: FarmConnectionHandlers): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) {
      return;
    }
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) {
      return;
    }
    handlers.status("disconnected");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, reconnectDelayMs);
  };

  const openSocket = () => {
    if (stopped) {
      return;
    }
    handlers.status("reconnecting");
    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.addEventListener("message", (event) => {
      const message = parseWebsocketMessage(event.data);
      if (!message) {
        handlers.error("Invalid websocket message");
        return;
      }
      if (message.type === "catalog") {
        handlers.catalog(message.catalog);
        return;
      }
      if (message.type === "farm_snapshot") {
        handlers.farm(normalizeFarmResponse(message));
        handlers.status("synced");
        return;
      }
      if (message.type === "command_response") {
        handlers.farm(normalizeCommandResponse(message));
        handlers.status("synced");
        if (!message.accepted && message.error) {
          handlers.error(message.error);
        }
        return;
      }
      handlers.error(message.error.message);
    });

    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) {
        socket = null;
      }
      scheduleReconnect();
    });

    nextSocket.addEventListener("error", () => {
      handlers.error("Gameplay websocket disconnected");
    });
  };

  openSocket();

  return () => {
    stopped = true;
    clearReconnectTimer();
    socket?.close();
    socket = null;
  };
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
    const module = await import("./generated/my_farm_wasm/my_farm_wasm.js");
    await module.default();
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

function parseResponsePayload(payloadText: string): { error?: string } {
  if (!payloadText) {
    return {};
  }

  try {
    return JSON.parse(payloadText);
  } catch {
    return { error: payloadText };
  }
}

function parseWebsocketMessage(data: unknown): WebsocketServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as WebsocketServerMessage;
  } catch {
    return null;
  }
}

function defaultBaseUrl(): string {
  const hostname = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${hostname}:${defaultApiPort}`;
}

function websocketUrl(baseUrl: string): string {
  const override = import.meta.env.VITE_GAMEPLAY_WS_URL;
  if (override) {
    return override;
  }
  const sourceUrl = import.meta.env.VITE_API_BASE_URL ? baseUrl : window.location.origin;
  const url = new URL("/api/gameplay", sourceUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function normalizeFarmResponse(response: LegacyFarmResponse): FarmResponse {
  return {
    ...response,
    view: normalizeFarmView(response.view),
  };
}

function normalizeCommandResponse(response: LegacyCommandResponse): CommandResponse {
  return {
    ...response,
    view: normalizeFarmView(response.view),
  };
}

function normalizeFarmView(view: LegacyFarmView): FarmView {
  return {
    ...view,
    silo_tile: validTile(view.silo_tile) ? view.silo_tile : defaultSiloTile,
    barn_tile: validTile(view.barn_tile) ? view.barn_tile : defaultBarnTile,
    delivery_board_tile: validTile(view.delivery_board_tile)
      ? view.delivery_board_tile
      : defaultDeliveryBoardTile,
  };
}

function validTile(tile: Tile | null | undefined): tile is Tile {
  return tile !== undefined && tile !== null && Number.isFinite(tile.x) && Number.isFinite(tile.y);
}
