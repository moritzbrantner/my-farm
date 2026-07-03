import type {
  CatalogDocument,
  CommandRequest,
  CommandResponse,
  FarmResponse,
  FarmView,
  Tile,
} from "./types";
import type {
  WebsocketClientMessage,
  WebsocketServerMessage,
} from "../../../contracts/generated/ts/my-farm";

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
  const websocket = createGameplayWebsocketClient(gameplayWebsocketUrl);
  const unavailableUntilConnected = () =>
    Promise.reject(new Error("Gameplay data is loaded from the websocket connection"));

  return {
    runtime: "http",
    catalog: unavailableUntilConnected,
    farm: unavailableUntilConnected,
    async reset(): Promise<FarmResponse> {
      const response = await websocket.reset();
      return normalizeFarmResponse(response);
    },
    async command(command: CommandRequest): Promise<CommandResponse> {
      return normalizeCommandResponse(await websocket.command(command));
    },
    connect(handlers: FarmConnectionHandlers): () => void {
      return websocket.connect(handlers);
    },
  };
}

type PendingWebsocketRequest = {
  resolve(response: CommandResponse): void;
  reject(error: Error): void;
};

function createGameplayWebsocketClient(url: string) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;
  let requestCounter = 0;
  const pendingRequests = new Map<string, PendingWebsocketRequest>();
  let handlers: FarmConnectionHandlers | null = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) {
      return;
    }
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const rejectPendingRequests = (message: string) => {
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error(message));
    }
    pendingRequests.clear();
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) {
      return;
    }
    handlers?.status("disconnected");
    rejectPendingRequests("Gameplay websocket disconnected");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, reconnectDelayMs);
  };

  const openSocket = () => {
    if (stopped) {
      return;
    }
    handlers?.status("reconnecting");
    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.addEventListener("message", (event) => {
      const message = parseWebsocketMessage(event.data);
      if (!message) {
        handlers?.error("Invalid websocket message");
        return;
      }
      if (message.type === "catalog") {
        handlers?.catalog(message.catalog);
        return;
      }
      if (message.type === "farm_snapshot") {
        handlers?.farm(normalizeFarmResponse(message));
        handlers?.status("synced");
        return;
      }
      if (message.type === "command_response") {
        const response = normalizeCommandResponse(message);
        pendingRequests.get(message.request_id)?.resolve(response);
        pendingRequests.delete(message.request_id);
        handlers?.farm(response);
        handlers?.status("synced");
        if (!message.accepted && message.error) {
          handlers?.error(message.error);
        }
        return;
      }
      handlers?.error(message.error.message);
    });

    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) {
        socket = null;
      }
      scheduleReconnect();
    });

    nextSocket.addEventListener("error", () => {
      handlers?.error("Gameplay websocket disconnected");
    });
  };

  const nextRequestId = (prefix: string) => {
    requestCounter += 1;
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${requestCounter}`;
  };

  const sendRequest = (message: WebsocketClientMessage): Promise<CommandResponse> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Gameplay websocket is not connected"));
    }
    return new Promise((resolve, reject) => {
      pendingRequests.set(message.request_id, { resolve, reject });
      try {
        socket?.send(JSON.stringify(message));
      } catch (error) {
        pendingRequests.delete(message.request_id);
        reject(error instanceof Error ? error : new Error("Gameplay websocket send failed"));
      }
    });
  };

  return {
    command(request: CommandRequest): Promise<CommandResponse> {
      return sendRequest({
        type: "submit_command",
        request_id: nextRequestId("command"),
        expected_version: request.expected_version,
        command: request.command,
      });
    },
    async reset(): Promise<FarmResponse> {
      const response = await sendRequest({
        type: "reset_farm",
        request_id: nextRequestId("reset"),
      });
      return { version: response.version, view: response.view };
    },
    connect(nextHandlers: FarmConnectionHandlers): () => void {
      handlers = nextHandlers;
      stopped = false;
      openSocket();

      return () => {
        stopped = true;
        handlers = null;
        clearReconnectTimer();
        rejectPendingRequests("Gameplay websocket disconnected");
        socket?.close();
        socket = null;
      };
    },
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
