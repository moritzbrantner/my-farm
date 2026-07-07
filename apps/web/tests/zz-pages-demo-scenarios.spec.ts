import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const demoSaveKey = "my-farm.demo.save.v1";

test("pages demo exposes Basic Farm Scenarios in the in-app Wiki", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);

  await page.goto("/wiki");

  const wiki = page.getByRole("region", { name: "Wiki pages" });
  await expect(wiki).toBeVisible();
  await expect(page).toHaveURL(/\/wiki$/);
  await expect(page.locator(".farm-canvas")).toHaveCount(0);
  await expect(wiki.getByRole("link", { name: /Scenario 01: Fresh Farm/ })).toBeVisible();
  await expect(wiki.getByRole("link", { name: /Scenario 07: Blocked Work and Storage/ })).toBeVisible();

  await wiki
    .getByRole("listitem")
    .filter({ hasText: "Scenario 02: Planting Wheat" })
    .getByRole("button", { name: "Read" })
    .click();
  await expect(wiki.getByRole("heading", { name: "Planting Wheat" })).toBeVisible();
  await expect(wiki.getByRole("heading", { name: "Player steps" })).toBeVisible();
  await expect(wiki.getByRole("heading", { name: "What changes on the farm" })).toBeVisible();
  await expect(wiki.getByRole("heading", { name: "Related terms" })).toBeVisible();
  await expect(wiki.getByRole("link", { name: "Open Scenario" })).toHaveAttribute("href", /\/wiki\/scenario-2$/);

  await wiki.getByRole("button", { name: "Next" }).click();
  await expect(wiki.getByRole("heading", { name: "Resident Work Queue" })).toBeVisible();
  await wiki.getByRole("button", { name: "Previous" }).click();
  await expect(wiki.getByRole("heading", { name: "Planting Wheat" })).toBeVisible();
  await wiki.getByRole("button", { name: "All Scenarios" }).click();
  await expect(wiki.getByRole("link", { name: /Scenario 01: Fresh Farm/ })).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

test("pages demo scenario URL loads a seeded farm scene", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);

  await page.goto("/wiki/scenario-2");

  await expect(page).toHaveURL(/\/wiki\/scenario-2$/);
  await expect(page.getByRole("heading", { name: "Interaction Tools" })).toBeVisible();
  await expect(page.getByLabel("Scenario lesson")).toContainText("Planting Wheat");
  await expect(page.getByText("Scenario 02: Planting Wheat")).toBeVisible();
  await expect(page.getByText("Reserved for Woman's task")).toBeVisible();
  await expect(page.locator(".top-bar").getByText("Silo 9/40")).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

test("pages demo plants Wheat and exposes the Resident Task Queue", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);
  await startDemoFarm(page);

  const inventory = inventoryPanel(page);
  await expect(resourceAmount(inventory, "Wheat", "6")).toBeVisible();

  await selectSeedTool(page, "Wheat");
  await page.getByLabel("Field Plot plot-1").click({ force: true });

  await expect(page.getByText("Command accepted")).toBeVisible();
  await expect(resourceAmount(inventory, "Wheat", "6")).toBeVisible();
  await expect(page.locator(".top-bar").getByText("Silo 9/40")).toBeVisible();
  await expect(page.getByText("Reserved for Woman's task")).toBeVisible();

  await page.getByTestId("farm-scene-resident-woman").click();
  const details = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Resident Details" }),
  });
  await expect(details.getByText("Selected for work")).toBeVisible();
  await expect(details.getByText("Task queue")).toBeVisible();
  await expect(details.getByText("Plant Wheat").first()).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

test("pages demo harvests a ready Wheat Field Plot through the harvest interaction", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);
  await seedReadyWheatSave(page);
  await startDemoFarm(page);

  await page.getByLabel("Field Plot plot-1").click({ force: true });
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Wheat - ready")).toBeVisible();
  await selection.getByRole("button", { name: "Harvest" }).click();

  await expect(page.getByText("Command accepted")).toBeVisible();
  await page.getByTestId("farm-scene-resident-woman").click();
  const details = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Resident Details" }),
  });
  await expect(details.getByText("Harvest Wheat").first()).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

test("pages demo unlocks Corn and buys the Oven Farmhouse Upgrade", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);
  await seedLevelTwoSave(page);
  await startDemoFarm(page);

  await page.locator(".interaction-tools").getByRole("button", { name: "Seed" }).click();
  await expect(page.locator(".interaction-tools").getByRole("menuitemradio", { name: /Corn/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await openFarmhouseSelection(page);
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Oven upgrade - 40 coins, queue 2")).toBeVisible();
  await selection.getByRole("button", { name: "Buy Oven" }).click();

  await expect(page.getByText("Command accepted")).toBeVisible();
  await expect(selection.getByText("Oven - queue 0/2")).toBeVisible();
  await expect(page.locator(".top-bar").getByText("140 coins")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toHaveCount(0);

  expect(apiRequests()).toEqual([]);
});

test("pages demo makes and collects Bread from the Farmhouse Oven", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);
  await seedOvenOwnedSave(page);
  await startDemoFarm(page);

  await openFarmhouseSelection(page);
  let selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await selection.getByRole("button", { name: "Make Bread" }).click();

  await expect(page.getByText("Command accepted")).toBeVisible();
  await expect(resourceAmount(inventoryPanel(page), "Wheat", "3")).toBeVisible();

  await advanceDemoSave(page, Date.now() + 1_000_000);
  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await openFarmhouseSelection(page);
  selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(page.getByTestId("structure-status-farmhouse-oven")).toHaveAttribute(
    "aria-label",
    "Farmhouse Oven status: Ready Bread",
  );
  await selection.getByRole("button", { name: "Collect Bread" }).click();

  await expect(page.getByText("Command accepted")).toBeVisible();
  await advanceDemoSave(page, Date.now() + 2_000_000);
  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await expect(resourceAmount(inventoryPanel(page), "Bread", "1")).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

test("pages demo explains storage-full harvest before accepting conflicting work", async ({ page }) => {
  const apiRequests = expectNoApiRequests(page);
  await seedFullSiloReadyWheatSave(page);
  await startDemoFarm(page);

  await page.getByLabel("Field Plot plot-1").click({ button: "right" });
  const menu = page.getByTestId("field-context-menu");
  await expect(menu.getByRole("menuitem", { name: "Harvest Storage full" })).toBeDisabled();

  await page.keyboard.press("Escape");
  await page.getByLabel("Silo structure").click({ force: true });
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Silo storage - 40/40 crops")).toBeVisible();

  expect(apiRequests()).toEqual([]);
});

async function startDemoFarm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Farm" }).click();
  await expect(page.getByRole("heading", { name: "Interaction Tools" })).toBeVisible();
}

async function openFarmhouseSelection(page: Page) {
  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter Farmhouse" })).toBeVisible();
}

async function selectSeedTool(page: Page, seedName: string) {
  const tools = page.locator(".interaction-tools");
  await tools.getByRole("button", { name: "Seed" }).click();
  await tools.getByRole("menuitemradio", { name: new RegExp(seedName) }).click();
}

function inventoryPanel(page: Page) {
  return page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });
}

function resourceAmount(scope: Locator, name: string, amount: string) {
  return scope.locator(".resource-amount").filter({
    hasText: new RegExp(`^${escapeRegExp(name)}${escapeRegExp(amount)}$`),
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectNoApiRequests(page: Page) {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  return () => apiRequests;
}

async function seedLevelTwoSave(page: Page) {
  await installStaticDemoSave(page, compactDemoSave({
    farm: {
      xp: 4,
      level: 2,
    },
  }));
}

async function seedOvenOwnedSave(page: Page) {
  await installStaticDemoSave(page, compactDemoSave({
    farm: {
      xp: 4,
      level: 2,
      coins: 140,
      owned_farmhouse_upgrades: ["oven"],
    },
  }));
}

async function seedReadyWheatSave(page: Page) {
  await page.goto("/");
  await page.evaluate(async (key) => {
    const existing = window.__myFarmWasmModule;
    const wasm = existing ?? (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as DemoWasmModule;
    if (!existing) {
      await wasm.default();
      window.__myFarmWasmModule = wasm;
    }
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    const response = JSON.parse(
      runtime.command_json(JSON.stringify({
        expected_version: 0,
        command: { type: "sweep_plant", crop_id: "wheat", plot_ids: ["plot-1"] },
      }), 1_000),
    ) as { accepted: boolean; error: string | null };
    JSON.parse(runtime.farm_json(1_000_000)) as { version: number };
    if (!response.accepted) {
      throw new Error(response.error ?? "command rejected");
    }
    window.localStorage.setItem(key, runtime.save_json());
  }, demoSaveKey);
}

async function seedFullSiloReadyWheatSave(page: Page) {
  await page.goto("/");
  await page.evaluate(async (key) => {
    const existing = window.__myFarmWasmModule;
    const wasm = existing ?? (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as DemoWasmModule;
    if (!existing) {
      await wasm.default();
      window.__myFarmWasmModule = wasm;
    }
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    const response = JSON.parse(
      runtime.command_json(JSON.stringify({
        expected_version: 0,
        command: { type: "sweep_plant", crop_id: "wheat", plot_ids: ["plot-1"] },
      }), 1_000),
    ) as { accepted: boolean; error: string | null };
    JSON.parse(runtime.farm_json(1_000_000)) as { version: number };
    if (!response.accepted) {
      throw new Error(response.error ?? "command rejected");
    }
    const save = JSON.parse(runtime.save_json()) as DemoSave;
    save.farm.inventory.wheat = 37;
    save.farm.silo_capacity = 40;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, demoSaveKey);
}

async function advanceDemoSave(page: Page, nowMs: number) {
  await page.evaluate(
    async ({ key, nowMs }) => {
      const existing = window.__myFarmWasmModule;
      const wasm = existing ?? (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as DemoWasmModule;
      if (!existing) {
        await wasm.default();
        window.__myFarmWasmModule = wasm;
      }
      const runtime = new wasm.DemoFarmRuntime(window.localStorage.getItem(key) ?? undefined, nowMs);
      runtime.farm_json(nowMs);
      runtime.farm_json(nowMs + 10_000_000);
      const save = JSON.parse(runtime.save_json()) as DemoSave;
      const firstOvenJob = save.farm.oven?.queue[0];
      if (firstOvenJob) {
        firstOvenJob.status = "producing";
        firstOvenJob.started_at_ms = Date.now() - 2_000;
        firstOvenJob.ready_at_ms = Date.now() - 1_000;
      }
      window.localStorage.setItem(key, JSON.stringify(save));
    },
    { key: demoSaveKey, nowMs },
  );
}

type DemoSave = {
  schema_version?: number;
  version?: number;
  farm: {
    schema_version?: number;
    last_update_ms?: number;
    xp: number;
    level: number;
    coins?: number;
    silo_capacity: number;
    barn_capacity?: number;
    inventory: Record<string, number>;
    field_plots?: Array<{ id: string; tile: { x: number; y: number }; crop: null }>;
    machines?: [];
    shelters?: [];
    delivery_board_built?: boolean;
    delivery_orders?: [];
    next_id?: number;
    owned_farmhouse_upgrades?: string[];
    oven?: {
      queue: Array<{
        status: "pending_start" | "producing";
        started_at_ms: number;
        ready_at_ms: number;
      }>;
    };
  };
};

type DemoRuntime = {
  command_json(requestJson: string, nowMs: number): string;
  farm_json(nowMs: number): string;
  save_json(): string;
};

type DemoWasmModule = {
  default(): Promise<unknown>;
  DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => DemoRuntime;
};

declare global {
  interface Window {
    __myFarmWasmModule?: DemoWasmModule;
  }
}

async function installStaticDemoSave(page: Page, save: DemoSave) {
  await page.goto("/");
  await page.evaluate(
    ({ key, save }) => {
      window.localStorage.setItem(key, JSON.stringify(save));
    },
    { key: demoSaveKey, save },
  );
}

function compactDemoSave(overrides: {
  farm?: Partial<DemoSave["farm"]>;
} = {}): DemoSave {
  return {
    schema_version: 2,
    version: 0,
    farm: {
      schema_version: 2,
      last_update_ms: 1_000,
      xp: 0,
      level: 1,
      coins: 180,
      silo_capacity: 40,
      barn_capacity: 30,
      inventory: { corn: 3, wheat: 6 },
      field_plots: [
        { id: "plot-1", tile: { x: 0, y: 0 }, crop: null },
        { id: "plot-2", tile: { x: 1, y: 0 }, crop: null },
        { id: "plot-3", tile: { x: 2, y: 0 }, crop: null },
        { id: "plot-4", tile: { x: 0, y: 1 }, crop: null },
        { id: "plot-5", tile: { x: 1, y: 1 }, crop: null },
        { id: "plot-6", tile: { x: 2, y: 1 }, crop: null },
      ],
      machines: [],
      shelters: [],
      delivery_board_built: false,
      delivery_orders: [],
      next_id: 1,
      ...overrides.farm,
    },
  };
}
