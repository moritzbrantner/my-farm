import { expect, test } from "bun:test";
import type {
  CatalogDocument,
  CommandResponse,
  FarmCommand,
  FarmResponse,
  FarmView,
} from "@my-farm/contracts";
import type { FarmClient } from "@my-farm/game-client";
import { commandWithVersionRetry } from "./commandRetry";

test("commandWithVersionRetry applies the authoritative snapshot and retries once", async () => {
  const command: FarmCommand = { type: "buy_field_plot", tile: { x: 4, y: 4 } };
  const calls: number[] = [];
  const applied: number[] = [];
  const responses: CommandResponse[] = [
    {
      accepted: false,
      version: 7,
      events: [],
      view: farmView({ coins: 180 }),
      error: "version mismatch: expected 3, actual 7",
    },
    {
      accepted: true,
      version: 8,
      events: [],
      view: farmView({ coins: 168 }),
      error: null,
    },
  ];
  const client: FarmClient = {
    runtime: "http",
    catalog: async () => emptyCatalog(),
    farm: async () => ({ version: 0, view: farmView({ coins: 180 }) }),
    reset: async () => ({ version: 0, view: farmView({ coins: 180 }) }),
    command: async (request) => {
      calls.push(request.expected_version);
      const response = responses.shift();
      if (!response) {
        throw new Error("unexpected command call");
      }
      return response;
    },
  };

  const response = await commandWithVersionRetry({
    client,
    command,
    expectedVersion: 3,
    applyFarmSnapshot(snapshot: FarmResponse) {
      applied.push(snapshot.version);
    },
  });

  expect(response.accepted).toBe(true);
  expect(response.version).toBe(8);
  expect(calls).toEqual([3, 7]);
  expect(applied).toEqual([7]);
});

function emptyCatalog(): CatalogDocument {
  return {
    balance: { time_scale: 1, max_orders: 3 },
    items: [],
    crops: [],
    recipes: [],
    machines: [],
    farmhouse_upgrades: [],
    shelters: [],
    market_items: [],
    storage_upgrades: [],
    decorations: [],
    level_xp: [],
  };
}

function farmView(overrides: Partial<FarmView> = {}): FarmView {
  return {
    last_update_ms: 0,
    xp: 0,
    level: 1,
    coins: 180,
    silo_used: 0,
    silo_capacity: 40,
    silo_upgrade_tier: 0,
    silo_tile: { x: 14, y: 2 },
    barn_used: 0,
    barn_capacity: 30,
    barn_upgrade_tier: 0,
    barn_tile: { x: 16, y: 2 },
    inventory: [],
    field_plots: [],
    machines: [],
    owned_farmhouse_upgrades: [],
    oven: { id: "oven", queue: [] },
    shelters: [],
    delivery_board_built: false,
    delivery_board_tile: { x: 2, y: 7 },
    delivery_orders: [],
    residents: [
      { id: "woman", display_name: "Woman" },
      { id: "man", display_name: "Man" },
    ],
    selected_resident_id: "woman",
    resident_locations: {
      woman: { x: 8, y: 10 },
      man: { x: 9, y: 10 },
    },
    resident_work: {
      woman: {
        resident_id: "woman",
        display_name: "Woman",
        selected: true,
        state: "idle",
        queue: [],
        scene: { tile: { x: 8, y: 10 }, path: [], inside_house: false },
        carry: { items: [], tools: [] },
      },
      man: {
        resident_id: "man",
        display_name: "Man",
        selected: false,
        state: "idle",
        queue: [],
        scene: { tile: { x: 9, y: 10 }, path: [], inside_house: false },
        carry: { items: [], tools: [] },
      },
    },
    reservations: {
      field_plots: {},
      machines: {},
      animals: [],
      farm_shop_stock: {},
      path_tiles: [],
    },
    house_interior: { rooms: [] },
    unlocks: [],
    ...overrides,
  };
}
