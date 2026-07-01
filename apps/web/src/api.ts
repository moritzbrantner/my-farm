import type { CatalogDocument, CommandRequest, CommandResponse, FarmResponse, FarmView, Tile } from "./types";

const defaultApiPort = "8081";
const defaultSiloTile: Tile = { x: 14, y: 2 };
const defaultBarnTile: Tile = { x: 16, y: 2 };
const defaultDeliveryBoardTile: Tile = { x: 2, y: 7 };

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

export function createFarmClient(baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl()) {
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

function defaultBaseUrl(): string {
  const hostname = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${hostname}:${defaultApiPort}`;
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
