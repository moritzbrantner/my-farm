import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const demoSaveKey = "my-farm.demo.save.v1";

test("pages demo runs from WASM without server API calls", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
  await expect(page.getByText("Browser Demo")).toBeVisible();
  await page.getByRole("button", { name: "Start Farm" }).click();

  await expect(page.getByRole("heading", { name: "Field Tools" })).toBeVisible();
  const residents = page.getByLabel("Farm Residents");
  await expect(residents.getByText("Selected Resident")).toBeVisible();
  await expect(residents.getByRole("textbox", { name: "Woman display name", exact: true })).toBeVisible();
  await expect(residents.getByRole("textbox", { name: "Man display name", exact: true })).toBeVisible();
  await expect(page.getByTestId("farm-scene-resident-woman")).toBeVisible();
  await expect(page.getByTestId("farm-scene-resident-man")).toBeVisible();
  await expect(page.getByText("Farmers Market")).toHaveCount(0);
  await page.locator(".field-tools").getByRole("button", { name: "Build" }).click();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Field Plot/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Feed Mill/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Tool Shed/ })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test("pages demo places a House Interior Decoration through the WASM runtime", async ({ page }) => {
  await page.goto("/");
  await seedLevelFiveSave(page);
  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();

  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByRole("region", { name: "House Interior" })).toBeVisible();
  await expectCanvasToRenderNonBlank(page);
  await expectElementFramed(page, page.getByTestId("house-room-living_room"));
  await expectHouseInteriorControlsFramedWithoutOverlap(page);
  await expect(page.getByTestId("farm-scene-resident-woman")).toHaveCount(0);
  await expect(page.getByTestId("farm-scene-resident-man")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Decorations" }).getByRole("button", { name: /Chair/ }).click();
  await page.getByLabel("Room Tile 0,0").hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText("Fits on Room Tile 0,0");
  await page.getByLabel("Room Tile 0,0").click();

  await expect.poll(() => livingRoomPlacementCount(page)).toBe(4);

  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByLabel("Chair placement at Room Tile 0,0")).toBeVisible();
});

test("pages demo persists moved and removed House Interior Decorations", async ({ page }) => {
  await page.goto("/");
  await seedLevelFiveSave(page);
  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();

  await page.getByLabel("Farmhouse structure").click({ force: true });
  await page.getByLabel("Sofa placement at Room Tile 1,1").click();
  await page.getByLabel("Room Tile 5,0").click();
  await expect.poll(() => livingRoomPlacementTile(page, "living-room-sofa")).toEqual({ x: 5, y: 0 });

  await page.getByRole("navigation", { name: "Decorations" }).getByRole("button", { name: /Chair/ }).click();
  await page.getByLabel("Rug placement at Room Tile 2,3").click();
  await page.getByRole("button", { name: "Remove Rug" }).click();
  await expect.poll(() => livingRoomPlacementTile(page, "living-room-rug")).toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await page.getByLabel("Farmhouse structure").click({ force: true });

  await expect(page.getByLabel("Sofa placement at Room Tile 5,0")).toBeVisible();
  await expect(page.getByLabel("Rug placement at Room Tile 2,3")).toHaveCount(0);
});

test("pages demo persists a Farmhouse Oven production save in localStorage", async ({ page }) => {
  await page.goto("/");
  await seedBreadSave(page);
  await page.reload();

  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
  await page.getByRole("button", { name: "Start Farm" }).click();

  await expect(page.locator(".top-bar").getByText(/Level \d+/)).toBeVisible();
  await expect(page.getByText("Bread")).toBeVisible();
  await expect(page.getByLabel("Farmhouse structure")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByText("Demo farm reset")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
  await expect(dialog.getByText("Welcome to your fresh Farm")).toBeVisible();
  await expect(page.evaluate((key) => window.localStorage.getItem(key), demoSaveKey)).resolves.toContain(
    '"version":0',
  );
});

test("pages demo shows Farmhouse Oven status from a WASM save", async ({ page }) => {
  await page.goto("/");
  await seedQueuedBreadSave(page);
  await page.reload();

  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
  await page.getByRole("button", { name: "Start Farm" }).click();

  const status = page.getByTestId("structure-status-farmhouse-oven");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-label", "Farmhouse Oven status: Ready Bread");
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toHaveCount(0);
});

test("pages demo suspends refresh polling while the guided tutorial is open", async ({ page }) => {
  await countDemoFarmRefreshes(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "New Farm" }).click();

  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  const initialRefreshes = await demoFarmRefreshCount(page);
  await page.waitForTimeout(2800);
  expect(await demoFarmRefreshCount(page)).toBe(initialRefreshes);

  await closeGuidedTutorial(page);
  await expect.poll(() => demoFarmRefreshCount(page), { timeout: 3_500 }).toBeGreaterThan(initialRefreshes);
});

async function countDemoFarmRefreshes(page: Page) {
  await page.addInitScript(async () => {
    type WasmRuntime = {
      farm_json(nowMs: number): string;
    };
    type WasmModule = {
      default(): Promise<unknown>;
      DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => WasmRuntime;
    };
    type DemoRefreshWindow = Window & {
      __demoFarmRefreshes: number;
    };

    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as WasmModule;
    await wasm.default();
    const originalFarmJson = wasm.DemoFarmRuntime.prototype.farm_json;
    (window as unknown as DemoRefreshWindow).__demoFarmRefreshes = 0;
    wasm.DemoFarmRuntime.prototype.farm_json = function farmJsonWithCount(this: WasmRuntime, nowMs: number) {
      (window as unknown as DemoRefreshWindow).__demoFarmRefreshes += 1;
      return originalFarmJson.call(this, nowMs);
    };
  });
}

async function demoFarmRefreshCount(page: Page) {
  return page.evaluate(() => (window as unknown as { __demoFarmRefreshes: number }).__demoFarmRefreshes);
}

async function closeGuidedTutorial(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  for (let step = 0; step < 5; step += 1) {
    await dialog.getByRole("button", { name: "Got it" }).click();
  }
  await expect(dialog).toHaveCount(0);
}

async function canvasSnapshot(page: Page) {
  return page.locator("canvas").first().evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

async function expectCanvasToRenderNonBlank(page: Page) {
  await expect
    .poll(async () => (await canvasSnapshot(page)).length, { timeout: 5_000 })
    .toBeGreaterThan(20_000);
}

async function expectElementFramed(page: Page, target: ReturnType<Page["locator"]>) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Page has no viewport size");
  }
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Element has no bounding box");
  }

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function expectHouseInteriorControlsFramedWithoutOverlap(page: Page) {
  const controls = [
    page.locator(".house-interior__title"),
    page.locator(".house-interior__back"),
    page.getByRole("navigation", { name: "Rooms" }),
    page.getByTestId("decoration-placement-status"),
    page.getByRole("navigation", { name: "Decorations" }),
  ];
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (const control of controls) {
    await expectElementFramed(page, control);
    const box = await control.boundingBox();
    if (!box) {
      throw new Error("House Interior control has no bounding box");
    }
    boxes.push(box);
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(boxesOverlap(boxes[leftIndex], boxes[rightIndex])).toBe(false);
    }
  }
}

function boxesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

async function livingRoomPlacementCount(page: Page) {
  return page.evaluate((key) => {
    const rawSave = window.localStorage.getItem(key);
    if (!rawSave) {
      return 0;
    }
    const save = JSON.parse(rawSave) as {
      farm?: {
        house_interior?: {
          rooms?: Array<{ id: string; decoration_placements: unknown[] }>;
        };
      };
    };
    return (
      save.farm?.house_interior?.rooms?.find((room) => room.id === "living_room")
        ?.decoration_placements.length ?? 0
    );
  }, demoSaveKey);
}

async function livingRoomPlacementTile(page: Page, placementId: string) {
  return page.evaluate(
    ({ key, placementId }) => {
      const rawSave = window.localStorage.getItem(key);
      if (!rawSave) {
        return null;
      }
      const save = JSON.parse(rawSave) as {
        farm?: {
          house_interior?: {
            rooms?: Array<{
              id: string;
              decoration_placements: Array<{ id: string; tile: { x: number; y: number } }>;
            }>;
          };
        };
      };
      return (
        save.farm?.house_interior?.rooms
          ?.find((room) => room.id === "living_room")
          ?.decoration_placements.find((placement) => placement.id === placementId)?.tile ?? null
      );
    },
    { key: demoSaveKey, placementId },
  );
}

async function seedLevelFiveSave(page: Page) {
  await page.evaluate(async (key) => {
    type WasmRuntime = {
      save_json(): string;
    };
    type WasmModule = {
      default(): Promise<unknown>;
      DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => WasmRuntime;
    };

    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as WasmModule;
    await wasm.default();
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    const save = JSON.parse(runtime.save_json()) as { farm: { xp: number; level: number } };
    save.farm.xp = 55;
    save.farm.level = 5;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, demoSaveKey);
}

async function seedBreadSave(page: Page) {
  await page.evaluate(async (key) => {
    type WasmRuntime = {
      command_json(requestJson: string, nowMs: number): string;
      farm_json(nowMs: number): string;
      save_json(): string;
    };
    type WasmModule = {
      default(): Promise<unknown>;
      DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => WasmRuntime;
    };

    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as WasmModule;
    await wasm.default();
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    let version = 0;
    const send = (command: unknown, nowMs: number) => {
      const response = JSON.parse(
        runtime.command_json(JSON.stringify({ expected_version: version, command }), nowMs),
      ) as { accepted: boolean; error: string | null; version: number };
      if (!response.accepted) {
        throw new Error(response.error ?? "command rejected");
      }
      version = response.version;
      return response;
    };
    const tick = (nowMs: number) => {
      version = (JSON.parse(runtime.farm_json(nowMs)) as { version: number }).version;
    };

    send(
      {
        type: "sweep_plant",
        crop_id: "wheat",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      1_000,
    );
    send(
      {
        type: "sweep_harvest",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      40_000,
    );
    tick(65_000);
    send({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" }, 65_000);
    send({ type: "queue_oven_recipe", recipe_id: "bread" }, 65_000);
    send({ type: "collect_oven_job" }, 100_000);
    tick(110_000);
    window.localStorage.setItem(key, runtime.save_json());
  }, demoSaveKey);
}

async function seedQueuedBreadSave(page: Page) {
  await page.evaluate(async (key) => {
    type WasmRuntime = {
      command_json(requestJson: string, nowMs: number): string;
      farm_json(nowMs: number): string;
      save_json(): string;
    };
    type WasmModule = {
      default(): Promise<unknown>;
      DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => WasmRuntime;
    };

    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as WasmModule;
    await wasm.default();
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    let version = 0;
    const send = (command: unknown, nowMs: number) => {
      const response = JSON.parse(
        runtime.command_json(JSON.stringify({ expected_version: version, command }), nowMs),
      ) as { accepted: boolean; error: string | null; version: number };
      if (!response.accepted) {
        throw new Error(response.error ?? "command rejected");
      }
      version = response.version;
      return response;
    };
    const tick = (nowMs: number) => {
      version = (JSON.parse(runtime.farm_json(nowMs)) as { version: number }).version;
    };

    send(
      {
        type: "sweep_plant",
        crop_id: "wheat",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      1_000,
    );
    send(
      {
        type: "sweep_harvest",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      40_000,
    );
    tick(65_000);
    send({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" }, 65_000);
    send({ type: "queue_oven_recipe", recipe_id: "bread" }, 65_000);
    tick(70_000);
    window.localStorage.setItem(key, runtime.save_json());
  }, demoSaveKey);
}
