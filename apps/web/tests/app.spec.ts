import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { CatalogDocument, CommandRequest, FarmView } from "../src/types";

test("renders the playable farm shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("My Farm")).toBeVisible();
  await expect(page.getByText(/Level 1/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toBeVisible();

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(250);
  expect(box?.height).toBeGreaterThan(250);
});

test("build tray shows disabled structure details without opening a context menu", async ({ page }) => {
  await page.goto("/");

  const tray = page.getByRole("navigation", { name: "Structures" });
  await tray.getByRole("button", { name: /Bakery/ }).click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Bakery");
  await expect(page.getByTestId("build-detail-strip")).toContainText("Unlocks at level 2");
});

test("placing an available structure sends buy_structure with the chosen tile", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  await page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ }).click();
  await expect(page.getByText("Place Bakery")).toBeVisible();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Choose a tile");
  await expectCanvasToChangeAfterHover(page);

  const command = await clickUntilCommand(page, commands);
  expect(command.command).toMatchObject({
    type: "buy_structure",
    structure_kind: "bakery",
  });
  expect(command.command).toHaveProperty("tile");
});

test("blocked structure placement explains the occupied tile without sending a command", async ({
  page,
}) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ }).click();
  await page.mouse.click(fieldPoint.x, fieldPoint.y);

  await expect(page.getByText("Tile is occupied")).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("escape cancels structure placement", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const groundPoint = await findFreeCanvasPoint(page);
  await page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ }).click();
  await expect(page.getByText("Place Bakery")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(groundPoint.x, groundPoint.y);

  expect(commands).toHaveLength(0);
});

test("built and locked structure cards show reasons without buying", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const tray = page.getByRole("navigation", { name: "Structures" });
  const details = page.getByTestId("build-detail-strip");

  await tray.getByRole("button", { name: /Bakery/ }).click();
  await expect(details).toContainText("Already built");

  await tray.getByRole("button", { name: /Cow Pasture/ }).click();
  await expect(details).toContainText("Unlocks at level 5");
  expect(commands).toHaveLength(0);
});

test("unaffordable structure card shows its coin shortfall without buying", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, { ...buildableFarmView(), coins: 0 }, catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const tray = page.getByRole("navigation", { name: "Structures" });
  const details = page.getByTestId("build-detail-strip");

  await tray.getByRole("button", { name: /Bakery/ }).click();
  await expect(details).toContainText("Need 40 coins");
  expect(commands).toHaveLength(0);
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
  await expect(menu.getByRole("menuitem", { name: "Bread Need Wheat x1" })).toBeDisabled();
  await expect(page.getByText("Need Wheat x1")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Corn Bread Unlocks at level 4" })).toBeDisabled();
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

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: "Harvest" })).toBeEnabled();
});

test("dragging across ready matching crops sends one sweep harvest command", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  let currentView = oneReadyOneEmptyFieldView();
  await mockMutableFarmApi(page, () => currentView, catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const secondFieldPoint = await fieldTargetPoint(page, "plot-2");

  currentView = twoReadyWheatFieldView();
  await page.reload();
  await expect(page.getByText("Local farm synced")).toBeVisible();
  const readyStartPoint = await fieldTargetPoint(page, "plot-1");

  await dragHarvestSweep(page, readyStartPoint, secondFieldPoint);

  await expect
    .poll(() => commands.find((request) => request.command.type === "sweep_harvest")?.command)
    .toMatchObject({ type: "sweep_harvest", plot_ids: ["plot-1", "plot-2"] });
});

test("dragging across a different ready crop keeps sweep harvest crop-specific", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, readyWheatAndCornFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  const wheatPoint = await fieldTargetPoint(page, "plot-1");
  const cornPoint = await fieldTargetPoint(page, "plot-2");

  await dragHarvestSweep(page, wheatPoint, cornPoint);

  await expect
    .poll(() => commands.find((request) => request.command.type === "sweep_harvest")?.command)
    .toMatchObject({ type: "sweep_harvest", plot_ids: ["plot-1"] });
});

test("right mouse drag on a field opens menu instead of panning canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, readyFieldView());
  await page.goto("/");

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.move(fieldPoint.x, fieldPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(fieldPoint.x + 96, fieldPoint.y + 64);
  await page.mouse.up({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Harvest");
});

test("long press on field opens field menu", async ({ page }) => {
  await mockFarmApi(page, readyFieldView());
  await page.goto("/");

  await touchPress(page.getByLabel("Field Plot plot-1"), 560);

  await expect(page.getByTestId("structure-context-menu")).toContainText("Harvest");
});

test("empty field menu shows plant options", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, farmView);
  await page.goto("/");

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Field Plot");
  await expect(menu.getByRole("menuitem", { name: "Wheat" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Corn Need Corn" })).toBeDisabled();
});

test("growing field menu shows timer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, growingFieldView());
  await page.goto("/");

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: /Growing \d+s/ })).toBeDisabled();
});

test("ready harvest is disabled when storage is full", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, { ...readyFieldView(), silo_used: 40, silo_capacity: 40 });
  await page.goto("/");

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
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
    .getByRole("menuitem", { name: "Orders" })
    .click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Use delivery orders below.")).toBeVisible();
  const orders = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Delivery Orders" }),
  });
  await expect(resourceAmount(orders, "Wheat", "x1")).toBeVisible();
});

test("filters inventory to the selected structure materials", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  const inventory = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });

  await page.getByLabel("Bakery structure").click();
  await expect(resourceAmount(inventory, "Wheat", "2")).toBeVisible();
  await expect(resourceAmount(inventory, "Bread", "0")).toBeVisible();
  await expect(resourceAmount(inventory, "Corn Bread", "0")).toBeVisible();
  await expect(inventory).not.toContainText("Chicken Feed");

  await page.getByLabel("Chicken Coop structure").click();
  await expect(resourceAmount(inventory, "Chicken Feed", "0")).toBeVisible();
  await expect(resourceAmount(inventory, "Egg", "0")).toBeVisible();
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
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move" }).click();
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
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move" }).click();
  await expect(page.getByText("Moving Bakery")).toBeVisible();

  await expectCanvasToChangeAfterHover(page);
});

const catalog: CatalogDocument = {
  balance: { time_scale: 10, max_orders: 3 },
  items: [
    { id: "wheat", name: "Wheat", kind: "crop", unlock_level: 1 },
    { id: "corn", name: "Corn", kind: "crop", unlock_level: 2 },
    { id: "chicken_feed", name: "Chicken Feed", kind: "feed", unlock_level: 3 },
    { id: "cow_feed", name: "Cow Feed", kind: "feed", unlock_level: 5 },
    { id: "egg", name: "Egg", kind: "animal_product", unlock_level: 3 },
    { id: "milk", name: "Milk", kind: "animal_product", unlock_level: 5 },
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
    {
      kind: "cow_pasture",
      name: "Cow Pasture",
      animal_name: "Cow",
      build_cost: 50,
      unlock_level: 5,
      slots: 2,
      feed_item_id: "cow_feed",
      product_item_id: "milk",
      reference_seconds: 3600,
      xp: 5,
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

function buildableFarmView(): FarmView {
  return {
    ...farmView,
    level: 3,
    coins: 120,
    machines: [],
    shelters: [],
    delivery_board_built: false,
    delivery_orders: [],
  };
}

async function mockFarmApi(
  page: Page,
  view: FarmView = farmView,
  customCatalog: CatalogDocument = catalog,
  onCommand?: (request: CommandRequest) => void,
) {
  await mockMutableFarmApi(page, () => view, customCatalog, onCommand);
}

async function mockMutableFarmApi(
  page: Page,
  getView: () => FarmView,
  customCatalog: CatalogDocument = catalog,
  onCommand?: (request: CommandRequest) => void,
) {
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({ json: { catalog: customCatalog } });
  });
  await page.route("**/api/farm", async (route) => {
    await route.fulfill({ json: { version: 1, view: getView() } });
  });
  await page.route("**/api/commands", async (route) => {
    onCommand?.(route.request().postDataJSON() as CommandRequest);
    await route.fulfill({ json: { accepted: true, version: 2, events: [], view: getView(), error: null } });
  });
}

async function clickUntilCommand(page: Page, commands: CommandRequest[]) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const maxX = await canvasSearchMaxX(page, box);
  const maxY = canvasSearchMaxY(box, 96);
  const appChromeBoxes = await visibleAppChromeBoxes(page);
  for (let y = box.y + 96; y < maxY; y += 28) {
    for (let x = box.x + 24; x < maxX; x += 28) {
      if (isPointInBoxes(appChromeBoxes, x, y)) {
        continue;
      }
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

async function fieldTargetPoint(page: Page, plotId: string) {
  const fieldTarget = page.getByLabel(`Field Plot ${plotId}`);
  const box = await fieldTarget.boundingBox();
  if (!box) {
    throw new Error(`Could not find field target for ${plotId}`);
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function findFreeCanvasPoint(page: Page) {
  const canvas = page.locator("canvas").first();
  const emptySelection = page.getByText("Select a field, machine, shelter, or order board.");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas has no bounding box");
  }
  const maxX = await canvasSearchMaxX(page, box);
  const maxY = canvasSearchMaxY(box, 96);
  const appChromeBoxes = await visibleAppChromeBoxes(page);
  for (let y = box.y + 96; y < maxY; y += 32) {
    for (let x = box.x + 24; x < maxX; x += 32) {
      if (isPointInBoxes(appChromeBoxes, x, y)) {
        continue;
      }
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
  const appChromeBoxes = await visibleAppChromeBoxes(page);
  const fieldTargets = page.locator(".field-hit-target");
  const fieldTargetCount = await fieldTargets.count();
  for (let index = 0; index < fieldTargetCount; index += 1) {
    const fieldTarget = fieldTargets.nth(index);
    const targetBox = await fieldTarget.boundingBox();
    if (!targetBox) {
      continue;
    }
    const point = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    };
    if (isPointInBoxes(appChromeBoxes, point.x, point.y)) {
      continue;
    }
    await fieldTarget.click({ force: true });
    const match =
      typeof selectionText === "string"
        ? selectionPanel.getByText(selectionText, { exact })
        : selectionPanel.getByText(selectionText);
    if (await match.isVisible().catch(() => false)) {
      return point;
    }
  }
  const maxX = await canvasSearchMaxX(page, box);
  const maxY = canvasSearchMaxY(box, 24);
  for (let y = box.y + 48; y < maxY; y += 28) {
    for (let x = box.x + 24; x < maxX; x += 28) {
      if (isPointInBoxes(appChromeBoxes, x, y)) {
        continue;
      }
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

async function dragHarvestSweep(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
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
  const maxX = await canvasSearchMaxX(page, box);
  const maxY = canvasSearchMaxY(box, 96);
  const appChromeBoxes = await visibleAppChromeBoxes(page);
  for (let y = box.y + 96; y < maxY; y += 32) {
    for (let x = box.x + 24; x < maxX; x += 32) {
      if (isPointInBoxes(appChromeBoxes, x, y)) {
        continue;
      }
      await page.mouse.move(x, y);
      await page.waitForTimeout(40);
      if ((await canvasSnapshot(page)) !== before) {
        return;
      }
    }
  }
  throw new Error("Moving over the canvas did not draw a placement preview");
}

function resourceAmount(scope: Locator, name: string, amount: string) {
  return scope.locator(".resource-amount").filter({
    hasText: new RegExp(`^${escapeRegExp(name)}${escapeRegExp(amount)}$`),
  });
}

async function canvasSearchMaxX(page: Page, box: { x: number; width: number }) {
  const canvasRight = box.x + box.width - 24;
  const sidePanelBox = await page.locator(".side-panel").boundingBox();
  const sidePanelLeft = sidePanelBox && sidePanelBox.x > box.x ? sidePanelBox.x - 24 : canvasRight;
  return Math.min(canvasRight, sidePanelLeft, box.x + Math.max(320, box.width * 0.72));
}

function canvasSearchMaxY(box: { y: number; height: number }, bottomPadding: number) {
  return box.y + box.height - bottomPadding;
}

type SearchBox = { x: number; y: number; width: number; height: number };

async function visibleAppChromeBoxes(page: Page): Promise<SearchBox[]> {
  const boxes = await Promise.all(
    [".top-bar", ".side-panel", ".build-dock", ".structure-context-menu"].map(async (selector) => {
      const element = await page.$(selector);
      return element ? element.boundingBox() : null;
    }),
  );
  return boxes.filter((box): box is SearchBox => box !== null);
}

function isPointInBoxes(boxes: SearchBox[], x: number, y: number) {
  return boxes.some(
    (box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function oneReadyOneEmptyFieldView(): FarmView {
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

function twoReadyWheatFieldView(): FarmView {
  return {
    ...farmView,
    field_plots: [
      {
        id: "plot-1",
        tile: { x: 0, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: Date.now() - 20_000, ready_at_ms: Date.now() - 1_000 },
      },
      {
        id: "plot-2",
        tile: { x: 1, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: Date.now() - 20_000, ready_at_ms: Date.now() - 1_000 },
      },
    ],
  };
}

function readyWheatAndCornFieldView(): FarmView {
  return {
    ...farmView,
    field_plots: [
      {
        id: "plot-1",
        tile: { x: 0, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: Date.now() - 20_000, ready_at_ms: Date.now() - 1_000 },
      },
      {
        id: "plot-2",
        tile: { x: 1, y: 0 },
        crop: { item_id: "corn", planted_at_ms: Date.now() - 40_000, ready_at_ms: Date.now() - 1_000 },
      },
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
