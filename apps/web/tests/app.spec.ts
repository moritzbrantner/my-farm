import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CatalogDocument, CommandRequest, FarmView } from "../src/types";

test("renders the playable farm shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("My Farm")).toBeVisible();
  await expect(page.getByText(/Level 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bakery" })).toBeVisible();

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(250);
  expect(box?.height).toBeGreaterThan(250);
});

test("opens a structure menu from an unavailable build tray button", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await page.goto("/");

  await page.getByRole("button", { name: "Bakery" }).click({ button: "right", force: true });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Bakery");
  await expect(page.getByRole("menuitem", { name: "Build Bakery Unlocks at level 2" })).toBeDisabled();
});

test("opens a structure menu from right click without replacing normal selection", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  const bakeryHitTarget = page.getByLabel("Bakery structure");
  await bakeryHitTarget.click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Queue 0/2");
  await expect(menu.getByRole("menuitem", { name: /Make Bread/ })).toBeDisabled();
  await expect(page.getByText("Need Wheat x1")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Make Corn Bread/ })).toBeDisabled();
  await expect(page.getByText("Unlocks at level 4")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();

  await bakeryHitTarget.click();
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Bakery - queue 0/2")).toBeVisible();
});

test("opens a structure menu from the visible canvas structure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  const bakeryPoint = await findCanvasSelectionPoint(page, "Bakery - queue 0/2");
  await page.mouse.click(bakeryPoint.x, bakeryPoint.y, { button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Bakery");
});

test("right mouse drag on a structure opens menu instead of panning canvas", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  const bakeryPoint = await findCanvasSelectionPoint(page, "Bakery - queue 0/2");
  await page.mouse.move(bakeryPoint.x, bakeryPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(bakeryPoint.x + 96, bakeryPoint.y + 64);
  await page.mouse.up({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Bakery");
});

test("right mouse drag on free ground pans the canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-drag behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  const groundPoint = await findFreeCanvasPoint(page);
  const before = await canvasSnapshot(page);

  await page.mouse.move(groundPoint.x, groundPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(groundPoint.x + 140, groundPoint.y + 80, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(100);

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(canvasSnapshot(page)).resolves.not.toBe(before);
});

test("touch drag on free ground pans the canvas", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  const groundPoint = await findFreeCanvasPoint(page);
  const before = await canvasSnapshot(page);

  await touchDragCanvas(page, groundPoint, { x: groundPoint.x + 140, y: groundPoint.y + 80 });
  await page.waitForTimeout(100);

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(canvasSnapshot(page)).resolves.not.toBe(before);
});

test("right click on ready field opens harvest menu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, readyFieldView());
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPoint(page, "Wheat - ready");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: "Harvest" })).toBeEnabled();
});

test("right mouse drag on a field opens menu instead of panning canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, readyFieldView());
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPoint(page, "Wheat - ready");
  await page.mouse.move(fieldPoint.x, fieldPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(fieldPoint.x + 96, fieldPoint.y + 64);
  await page.mouse.up({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Harvest");
});

test("long press on field opens field menu", async ({ page }) => {
  await mockFarmApi(page, readyFieldView());
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPoint(page, "Wheat - ready");
  await touchPressCanvas(page, fieldPoint, 560);

  await expect(page.getByTestId("structure-context-menu")).toContainText("Harvest");
});

test("empty field menu shows plant options", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, farmView);
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPoint(page, "Plant Wheat");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Field Plot");
  await expect(menu.getByRole("menuitem", { name: "Plant Wheat" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Plant Corn Need Corn" })).toBeDisabled();
});

test("growing field menu shows timer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, growingFieldView());
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPointByRegex(page, /Wheat - \d+s/);
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: /Growing Ready in \d+s/ })).toBeDisabled();
});

test("ready harvest is disabled when storage is full", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, { ...readyFieldView(), silo_used: 40, silo_capacity: 40 });
  await page.goto("/");

  const fieldPoint = await findCanvasSelectionPoint(page, "Wheat - ready");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  await expect(
    page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Harvest Storage full" }),
  ).toBeDisabled();
});

test("supports long press for structures and cancels moved touch presses", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  const shelterHitTarget = page.getByLabel("Chicken Coop structure");

  await touchPress(shelterHitTarget, 100);
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();

  await shelterHitTarget.dispatchEvent("pointerdown", touchEvent({ x: 100, y: 100 }));
  await shelterHitTarget.dispatchEvent("pointermove", touchEvent({ x: 124, y: 124 }));
  await page.waitForTimeout(560);
  await shelterHitTarget.dispatchEvent("pointerup", touchEvent({ x: 124, y: 124 }));
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();

  await touchPress(shelterHitTarget, 560);
  await expect(page.getByTestId("structure-context-menu")).toContainText("Chicken Coop");
});

test("delivery board menu focuses delivery orders", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  await page.getByLabel("Delivery Board structure").click({ button: "right" });
  await page
    .getByTestId("structure-context-menu")
    .getByRole("menuitem", { name: "View delivery orders" })
    .click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Use delivery orders below.")).toBeVisible();
  await expect(page.getByText("Wheat x1")).toBeVisible();
});

test("filters inventory to the selected structure materials", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  const inventory = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });

  await page.getByLabel("Bakery structure").click();
  await expect(inventory.getByText("Wheat 2", { exact: true })).toBeVisible();
  await expect(inventory.getByText("Bread 0", { exact: true })).toBeVisible();
  await expect(inventory.getByText("Corn Bread 0", { exact: true })).toBeVisible();
  await expect(inventory).not.toContainText("Chicken Feed");

  await page.getByLabel("Chicken Coop structure").click();
  await expect(inventory.getByText("Chicken Feed 0", { exact: true })).toBeVisible();
  await expect(inventory.getByText("Egg 0", { exact: true })).toBeVisible();
  await expect(inventory).not.toContainText("Wheat");
  await expect(inventory).not.toContainText("Bread");
});

test("moves a structure by choosing move and clicking a destination tile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  await page.getByLabel("Bakery structure").click({ button: "right" });
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move Bakery" }).click();
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Moving Bakery")).toBeVisible();

  const command = await clickUntilCommand(page, commands);
  expect(command.command).toMatchObject({
    type: "move_structure",
    target: { type: "machine", id: "machine-1" },
  });
  expect(command.command).toHaveProperty("tile");
});

test("shows a footprint preview while moving a structure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop hover behavior is covered in desktop.");
  await mockFarmApi(page);
  await page.goto("/");

  await page.getByLabel("Bakery structure").click({ button: "right" });
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move Bakery" }).click();
  await expect(page.getByText("Moving Bakery")).toBeVisible();

  await expectCanvasToChangeAfterHover(page);
});

const catalog: CatalogDocument = {
  balance: { time_scale: 10, max_orders: 3 },
  items: [
    { id: "wheat", name: "Wheat", kind: "crop", unlock_level: 1 },
    { id: "corn", name: "Corn", kind: "crop", unlock_level: 2 },
    { id: "chicken_feed", name: "Chicken Feed", kind: "feed", unlock_level: 3 },
    { id: "egg", name: "Egg", kind: "animal_product", unlock_level: 3 },
    { id: "bread", name: "Bread", kind: "product", unlock_level: 2 },
    { id: "corn_bread", name: "Corn Bread", kind: "product", unlock_level: 4 },
  ],
  crops: [
    { item_id: "wheat", reference_seconds: 120, harvest_quantity: 2, xp: 1, unlock_level: 1 },
    { item_id: "corn", reference_seconds: 300, harvest_quantity: 2, xp: 2, unlock_level: 2 },
  ],
  recipes: [
    {
      id: "bread",
      name: "Bread",
      machine_kind: "bakery",
      inputs: [{ item_id: "wheat", quantity: 3 }],
      outputs: [{ item_id: "bread", quantity: 1 }],
      reference_seconds: 300,
      xp: 4,
      unlock_level: 2,
    },
    {
      id: "corn_bread",
      name: "Corn Bread",
      machine_kind: "bakery",
      inputs: [
        { item_id: "corn", quantity: 2 },
        { item_id: "egg", quantity: 1 },
      ],
      outputs: [{ item_id: "corn_bread", quantity: 1 }],
      reference_seconds: 1800,
      xp: 8,
      unlock_level: 4,
    },
    {
      id: "chicken_feed",
      name: "Chicken Feed",
      machine_kind: "feed_mill",
      inputs: [
        { item_id: "wheat", quantity: 2 },
        { item_id: "corn", quantity: 1 },
      ],
      outputs: [{ item_id: "chicken_feed", quantity: 3 }],
      reference_seconds: 300,
      xp: 2,
      unlock_level: 3,
    },
  ],
  machines: [
    { kind: "bakery", name: "Bakery", build_cost: 40, unlock_level: 2, queue_limit: 2 },
    { kind: "feed_mill", name: "Feed Mill", build_cost: 35, unlock_level: 3, queue_limit: 2 },
  ],
  shelters: [
    {
      kind: "chicken_coop",
      name: "Chicken Coop",
      animal_name: "Chicken",
      build_cost: 30,
      unlock_level: 3,
      slots: 3,
      feed_item_id: "chicken_feed",
      product_item_id: "egg",
      reference_seconds: 1200,
      xp: 3,
    },
  ],
  level_xp: [0, 0, 4, 14, 30],
};

const farmView: FarmView = {
  last_update_ms: Date.now(),
  xp: 14,
  level: 3,
  coins: 120,
  silo_used: 2,
  silo_capacity: 40,
  barn_used: 0,
  barn_capacity: 30,
  inventory: [{ item_id: "wheat", name: "Wheat", quantity: 2, kind: "crop" }],
  field_plots: [
    { id: "plot-1", tile: { x: 0, y: 0 }, crop: null },
    { id: "plot-2", tile: { x: 1, y: 0 }, crop: null },
  ],
  machines: [
    { id: "machine-1", kind: "bakery", tile: { x: 8, y: 2 }, queue: [] },
    { id: "machine-2", kind: "feed_mill", tile: { x: 10, y: 3 }, queue: [] },
  ],
  shelters: [
    {
      id: "shelter-1",
      kind: "chicken_coop",
      tile: { x: 5, y: 7 },
      animals: [
        { id: "animal-1", state: { type: "idle" } },
        { id: "animal-2", state: { type: "ready" } },
      ],
    },
  ],
  delivery_board_built: true,
  delivery_board_tile: { x: 2, y: 7 },
  delivery_orders: [
    {
      id: "order-1",
      requirements: [{ item_id: "wheat", quantity: 1 }],
      reward_coins: 12,
      reward_xp: 2,
    },
  ],
  unlocks: [],
};

async function mockFarmApi(
  page: Page,
  view: FarmView = farmView,
  customCatalog: CatalogDocument = catalog,
  onCommand?: (request: CommandRequest) => void,
) {
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({ json: { catalog: customCatalog } });
  });
  await page.route("**/api/farm", async (route) => {
    await route.fulfill({ json: { version: 1, view } });
  });
  await page.route("**/api/commands", async (route) => {
    onCommand?.(route.request().postDataJSON() as CommandRequest);
    await route.fulfill({ json: { accepted: true, version: 2, events: [], view, error: null } });
  });
}

async function clickUntilCommand(page: Page, commands: CommandRequest[]) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const maxX = Math.min(box.x + box.width - 24, box.x + Math.max(320, box.width * 0.72));
  const maxY = box.y + box.height - 96;
  for (let y = box.y + 96; y < maxY; y += 28) {
    for (let x = box.x + 24; x < maxX; x += 28) {
      await page.mouse.click(x, y);
      const command = commands.at(-1);
      if (command) {
        return command;
      }
    }
  }
  throw new Error("Could not click a destination tile");
}

async function touchPress(
  locator: ReturnType<Page["getByLabel"]>,
  durationMs: number,
) {
  await locator.dispatchEvent("pointerdown", touchEvent({ x: 100, y: 100 }));
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  await locator.dispatchEvent("pointerup", touchEvent({ x: 100, y: 100 }));
}

async function findCanvasSelectionPoint(page: Page, selectionText: string) {
  return findCanvasSelectionPointByText(page, selectionText, true);
}

async function findFreeCanvasPoint(page: Page) {
  const canvas = page.locator("canvas").first();
  const emptySelection = page.getByText("Select a field, machine, shelter, or order board.");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const maxX = Math.min(box.x + box.width - 24, box.x + Math.max(320, box.width * 0.72));
  const maxY = box.y + box.height - 96;
  for (let y = box.y + 96; y < maxY; y += 32) {
    for (let x = box.x + 24; x < maxX; x += 32) {
      await page.mouse.click(x, y);
      if (await emptySelection.isVisible().catch(() => false)) {
        return { x, y };
      }
      await page.keyboard.press("Escape");
    }
  }
  throw new Error("Could not find a free canvas point");
}

async function findCanvasSelectionPointByRegex(page: Page, selectionText: RegExp) {
  return findCanvasSelectionPointByText(page, selectionText, false);
}

async function findCanvasSelectionPointByText(
  page: Page,
  selectionText: string | RegExp,
  exact: boolean,
) {
  const canvas = page.locator("canvas").first();
  const selectionPanel = page.locator(".panel-section").filter({ hasText: "Selection" });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const maxX = Math.min(box.x + box.width - 24, box.x + Math.max(320, box.width * 0.72));
  const maxY = box.y + box.height - 24;
  for (let y = box.y + 48; y < maxY; y += 28) {
    for (let x = box.x + 24; x < maxX; x += 28) {
      await page.mouse.click(x, y);
      const match =
        typeof selectionText === "string"
          ? selectionPanel.getByText(selectionText, { exact })
          : selectionPanel.getByText(selectionText);
      if (await match.isVisible().catch(() => false)) {
        return { x, y };
      }
    }
  }
  throw new Error(`Could not find canvas selection point for ${selectionText}`);
}

async function touchPressCanvas(page: Page, point: { x: number; y: number }, durationMs: number) {
  const canvas = page.locator("canvas").first();
  await canvas.dispatchEvent("pointerdown", touchEvent(point));
  await page.waitForTimeout(durationMs);
  await canvas.dispatchEvent("pointerup", touchEvent(point));
}

async function touchDragCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const canvas = page.locator("canvas").first();
  await canvas.dispatchEvent("pointerdown", touchEvent(from));
  await canvas.dispatchEvent(
    "pointermove",
    touchEvent({ x: from.x + (to.x - from.x) / 2, y: from.y + (to.y - from.y) / 2 }),
  );
  await canvas.dispatchEvent("pointermove", touchEvent(to));
  await canvas.dispatchEvent("pointerup", touchEvent(to));
}

async function canvasSnapshot(page: Page) {
  return page.locator("canvas").first().evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

async function expectCanvasToChangeAfterHover(page: Page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const before = await canvasSnapshot(page);
  const maxX = Math.min(box.x + box.width - 24, box.x + Math.max(320, box.width * 0.72));
  const maxY = box.y + box.height - 96;
  for (let y = box.y + 96; y < maxY; y += 32) {
    for (let x = box.x + 24; x < maxX; x += 32) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(40);
      if ((await canvasSnapshot(page)) !== before) {
        return;
      }
    }
  }
  throw new Error("Moving over the canvas did not draw a placement preview");
}

function readyFieldView(): FarmView {
  return {
    ...farmView,
    field_plots: [
      {
        id: "plot-1",
        tile: { x: 0, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: Date.now() - 20_000, ready_at_ms: Date.now() - 1_000 },
      },
      farmView.field_plots[1],
    ],
  };
}

function growingFieldView(): FarmView {
  return {
    ...farmView,
    field_plots: [
      {
        id: "plot-1",
        tile: { x: 0, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: Date.now() - 1_000, ready_at_ms: Date.now() + 60_000 },
      },
      farmView.field_plots[1],
    ],
  };
}

function touchEvent(point: { x: number; y: number }) {
  return {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
  };
}
