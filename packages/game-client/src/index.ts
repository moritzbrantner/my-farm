import type {
  CatalogDocument,
  CommandRequest,
  CommandResponse,
  FarmResponse,
  FarmResident,
  FarmView,
  ReservationView,
  ResidentWorkView,
  Tile,
  WebsocketClientMessage,
  WebsocketServerMessage,
} from "@my-farm/contracts";

const defaultSiloTile: Tile = { x: 14, y: 2 };
const defaultBarnTile: Tile = { x: 16, y: 2 };
const defaultDeliveryBoardTile: Tile = { x: 2, y: 7 };
const defaultResidentLocations: Record<string, Tile> = {
  woman: { x: 8, y: 10 },
  man: { x: 9, y: 10 },
};
const defaultResidents: FarmResident[] = [
  { id: "woman", display_name: "Woman" },
  { id: "man", display_name: "Man" },
];
const reconnectDelayMs = 1_000;

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

export type FarmClientTimerHandle = ReturnType<typeof setTimeout>;

export type FarmClientPlatform = {
  now(): number;
  randomUUID?(): string;
  setTimeout(callback: () => void, delayMs: number): FarmClientTimerHandle;
  clearTimeout(handle: FarmClientTimerHandle): void;
  WebSocket: typeof WebSocket;
};

export type LegacyFarmView = Omit<
  FarmView,
  | "silo_tile"
  | "barn_tile"
  | "delivery_board_tile"
  | "residents"
  | "selected_resident_id"
  | "resident_locations"
  | "resident_work"
  | "reservations"
  | "farm_shop"
> & {
  silo_tile?: Tile | null;
  barn_tile?: Tile | null;
  delivery_board_tile?: Tile | null;
  residents?: FarmResident[] | null;
  selected_resident_id?: string | null;
  resident_locations?: FarmView["resident_locations"] | null;
  resident_work?: FarmView["resident_work"] | null;
  reservations?: FarmView["reservations"] | null;
  farm_shop?: LegacyFarmShopView | null;
};

export type LegacyFarmShopView = Omit<NonNullable<FarmView["farm_shop"]>, "item_type_capacity" | "prices"> &
  Partial<Pick<NonNullable<FarmView["farm_shop"]>, "item_type_capacity" | "prices">>;

export type LegacyFarmResponse = Omit<FarmResponse, "view"> & {
  view: LegacyFarmView;
};

export type LegacyCommandResponse = Omit<CommandResponse, "view"> & {
  view: LegacyFarmView;
};

export function createHttpFarmClient(
  baseUrl: string,
  gameplayWebsocketUrl: string,
  platform: FarmClientPlatform,
): FarmClient {
  const websocket = createGameplayWebsocketClient(gameplayWebsocketUrl, platform);
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

export function websocketUrl(baseUrl: string, override?: string): string {
  if (override) {
    return override;
  }
  const url = new URL("/api/gameplay", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

type PendingWebsocketRequest = {
  resolve(response: CommandResponse): void;
  reject(error: Error): void;
};

function createGameplayWebsocketClient(url: string, platform: FarmClientPlatform) {
  let socket: WebSocket | null = null;
  let reconnectTimer: FarmClientTimerHandle | null = null;
  let stopped = false;
  let requestCounter = 0;
  const pendingRequests = new Map<string, PendingWebsocketRequest>();
  let handlers: FarmConnectionHandlers | null = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) {
      return;
    }
    platform.clearTimeout(reconnectTimer);
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
    reconnectTimer = platform.setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, reconnectDelayMs);
  };

  const openSocket = () => {
    if (stopped) {
      return;
    }
    handlers?.status("reconnecting");
    const nextSocket = new platform.WebSocket(url);
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
    const randomUUID = platform.randomUUID?.();
    if (randomUUID) {
      return `${prefix}-${randomUUID}`;
    }
    return `${prefix}-${platform.now()}-${requestCounter}`;
  };

  const sendRequest = (message: WebsocketClientMessage): Promise<CommandResponse> => {
    if (!socket || socket.readyState !== platform.WebSocket.OPEN) {
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
      return { version: response.version, view: response.view, notice: response.notice };
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

export function normalizeFarmResponse(response: LegacyFarmResponse): FarmResponse {
  return {
    ...response,
    view: normalizeFarmView(response.view),
  };
}

export function normalizeCommandResponse(response: LegacyCommandResponse): CommandResponse {
  return {
    ...response,
    view: normalizeFarmView(response.view),
  };
}

export function normalizeFarmView(view: LegacyFarmView): FarmView {
  const residents = validResidents(view.residents) ? view.residents : defaultResidents;
  const selectedResidentId = residents.some((resident) => resident.id === view.selected_resident_id)
    ? view.selected_resident_id
    : residents[0]?.id ?? "woman";
  const residentLocations = validResidentLocations(view.resident_locations)
    ? { ...defaultResidentLocationsFor(residents), ...view.resident_locations }
    : defaultResidentLocationsFor(residents);
  const residentWork = validResidentWork(view.resident_work)
    ? view.resident_work
    : defaultResidentWorkFor(residents, selectedResidentId ?? "woman", residentLocations);

  return {
    ...view,
    silo_tile: validTile(view.silo_tile) ? view.silo_tile : defaultSiloTile,
    barn_tile: validTile(view.barn_tile) ? view.barn_tile : defaultBarnTile,
    delivery_board_tile: validTile(view.delivery_board_tile)
      ? view.delivery_board_tile
      : defaultDeliveryBoardTile,
    residents,
    selected_resident_id: selectedResidentId ?? "woman",
    resident_locations: residentLocations,
    resident_work: residentWork,
    reservations: normalizeReservations(view.reservations),
    farm_shop: normalizeFarmShop(view.farm_shop),
  };
}

function normalizeFarmShop(shop: LegacyFarmView["farm_shop"]): FarmView["farm_shop"] {
  if (!shop) {
    return undefined;
  }
  return {
    ...shop,
    item_type_capacity: typeof shop.item_type_capacity === "number" && Number.isFinite(shop.item_type_capacity)
      ? shop.item_type_capacity
      : 10,
    prices: Array.isArray(shop.prices) ? shop.prices : [],
  };
}

function validTile(tile: Tile | null | undefined): tile is Tile {
  return tile !== undefined && tile !== null && Number.isFinite(tile.x) && Number.isFinite(tile.y);
}

function validResidents(residents: FarmResident[] | null | undefined): residents is FarmResident[] {
  return (
    Array.isArray(residents) &&
    residents.length >= 2 &&
    residents.every((resident) => typeof resident.id === "string" && typeof resident.display_name === "string")
  );
}

function validResidentLocations(
  locations: FarmView["resident_locations"] | null | undefined,
): locations is FarmView["resident_locations"] {
  return locations !== undefined && locations !== null && typeof locations === "object";
}

function validResidentWork(
  work: FarmView["resident_work"] | null | undefined,
): work is FarmView["resident_work"] {
  return work !== undefined && work !== null && typeof work === "object";
}

function defaultResidentLocationsFor(residents: FarmResident[]): FarmView["resident_locations"] {
  return Object.fromEntries(
    residents.map((resident, index) => [
      resident.id,
      defaultResidentLocations[resident.id] ?? { x: 8 + index, y: 10 },
    ]),
  );
}

function defaultResidentWorkFor(
  residents: FarmResident[],
  selectedResidentId: string,
  residentLocations: FarmView["resident_locations"],
): FarmView["resident_work"] {
  return Object.fromEntries(
    residents.map((resident): [string, ResidentWorkView] => [
      resident.id,
      {
        resident_id: resident.id,
        display_name: resident.display_name,
        selected: resident.id === selectedResidentId,
        state: "idle",
        queue: [],
        scene: {
          tile: residentLocations[resident.id] ?? { x: 8, y: 10 },
          path: [],
          inside_house: false,
        },
        carry: {
          items: [],
          tools: [],
        },
      },
    ]),
  );
}

function defaultReservations(): ReservationView {
  return {
    field_plots: {},
    machines: {},
    animals: [],
    farm_shop_stock: {},
    path_tiles: [],
  };
}

function normalizeReservations(reservations: FarmView["reservations"] | null | undefined): ReservationView {
  if (!isRecord(reservations)) {
    return defaultReservations();
  }
  const partial = reservations as Partial<ReservationView>;
  return {
    field_plots: isRecord(partial.field_plots) ? (partial.field_plots as ReservationView["field_plots"]) : {},
    machines: isRecord(partial.machines) ? (partial.machines as ReservationView["machines"]) : {},
    oven: partial.oven,
    animals: Array.isArray(partial.animals) ? partial.animals : [],
    farm_shop_stock: isRecord(partial.farm_shop_stock)
      ? (partial.farm_shop_stock as ReservationView["farm_shop_stock"])
      : {},
    path_tiles: Array.isArray(partial.path_tiles) ? partial.path_tiles : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
