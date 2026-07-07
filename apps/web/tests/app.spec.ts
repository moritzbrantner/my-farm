import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { CatalogDocument, CommandRequest, FarmView, ResidentTask, ResidentWorkView } from "@my-farm/contracts";

test("renders the playable farm shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Farm" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main menu options" }).getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main menu options" }).getByRole("button", { name: "Tutorial" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main menu options" }).getByRole("button", { name: "Wiki" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main menu options" }).getByRole("button", { name: "Account" })).toBeVisible();
  await startFarm(page);

  await expect(page.getByRole("dialog", { name: "Guided Tutorial" })).toHaveCount(0);
  await expect(page.getByText("My Farm")).toBeVisible();
  await expect(page.getByText(/Level 1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Field Tools" })).toBeVisible();
  await expect(page.locator(".field-tools").getByRole("button", { name: "Seed" })).toBeVisible();
  await expect(page.locator(".field-tools").getByRole("button", { name: "Build" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" })).toBeHidden();
  await page.locator(".field-tools").getByRole("button", { name: "Build" }).click();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Feed Mill/ })).toBeVisible();

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(250);
  expect(box?.height).toBeGreaterThan(250);
});

test("bootstraps from the gameplay websocket without polling farm snapshots", async ({ page }) => {
  await installMockGameplayWebSocket(page, [{ version: 1, view: farmView, catalog }]);
  let farmPolls = 0;
  await page.route("**/api/farm", async (route) => {
    farmPolls += 1;
    await route.fulfill({ json: { version: 1, view: farmView } });
  });

  await openFarm(page);

  await expect(page.getByLabel("Connection Synced")).toBeVisible();
  await expect(page.getByText("Local farm synced")).toBeVisible();
  await expect(page.getByLabel("Feed Mill structure")).toBeVisible();
  await page.waitForTimeout(2800);
  expect(farmPolls).toBe(0);

  const urls = await page.evaluate(() => (window as unknown as { __gameplayWebSocketUrls: string[] }).__gameplayWebSocketUrls);
  expect(urls.at(-1)).toBe("ws://127.0.0.1:8091/api/gameplay");
});

test("updates ready field actions from pushed websocket snapshots without REST polling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop field selection is covered here.");
  const growingView = growingFieldView();
  const readyView = {
    ...growingView,
    last_update_ms: Date.now(),
    field_plots: growingView.field_plots.map((plot) =>
      plot.id === "plot-1" && plot.crop
        ? {
            ...plot,
            crop: {
              ...plot.crop,
              ready_at_ms: Date.now() - 1_000,
            },
          }
        : plot,
    ),
  } satisfies FarmView;
  await installMockGameplayWebSocket(page, [{ version: 1, view: growingView, catalog }]);
  await rejectRestGameplay(page);

  await openFarm(page);
  await page.getByLabel("Field Plot plot-1").click({ force: true });

  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByRole("button", { name: "Harvest" })).toBeDisabled();

  await page.evaluate((view) => {
    (window as unknown as {
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
    }).__pushLatestGameplayFarmSnapshot({ version: 2, view });
  }, readyView);

  await expect(selection.getByText("Wheat - ready")).toBeVisible();
  await expect(selection.getByRole("button", { name: "Harvest" })).toBeEnabled();
});

test("sends commands and reset over the gameplay websocket without REST gameplay calls", async ({ page }) => {
  const resetView = {
    ...farmView,
    inventory: [{ item_id: "wheat", name: "Wheat", quantity: 6, kind: "crop" }],
  } satisfies FarmView;
  await installMockGameplayWebSocket(
    page,
    [{ version: 1, view: farmView, catalog }],
    {
      messageHandlerName: "__recordGameplayWebSocketMessage",
      commandResponses: [
        {
          accepted: true,
          version: 2,
          view: {
            ...farmView,
            inventory: [{ item_id: "wheat", name: "Wheat", quantity: 5, kind: "crop" }],
            field_plots: farmView.field_plots.map((plot) =>
              plot.id === "plot-1"
                ? {
                    ...plot,
                    crop: {
                      item_id: "wheat",
                      planted_at_ms: Date.now(),
                      ready_at_ms: Date.now() + 60_000,
                    },
                  }
                : plot,
            ),
          },
        },
      ],
      resetResponse: { version: 0, view: resetView },
    },
  );
  await page.exposeFunction("__recordGameplayWebSocketMessage", (message: unknown) => {
    return null;
  });
  await page.addInitScript(() => {
    const windowWithMessages = window as unknown as {
      __gameplayWebSocketMessages: unknown[];
      __recordGameplayWebSocketMessage: (message: unknown) => null;
    };
    windowWithMessages.__gameplayWebSocketMessages = [];
    const original = windowWithMessages.__recordGameplayWebSocketMessage;
    windowWithMessages.__recordGameplayWebSocketMessage = (message: unknown) => {
      windowWithMessages.__gameplayWebSocketMessages.push(message);
      return original(message);
    };
  });
  await rejectRestGameplay(page);

  await openFarm(page);
  await selectSeedTool(page, "Wheat");
  await page.getByLabel("Field Plot plot-1").click({ force: true });

  const inventoryPanel = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });
  await expect(page.getByText("Command accepted")).toBeVisible();
  await expect(resourceAmount(inventoryPanel, "Wheat", "5")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "New Farm" }).click();

  await expect(page.getByText("Farm reset")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
  await expect(dialog.getByText("Welcome to your fresh Farm")).toBeVisible();
  await expect(resourceAmount(inventoryPanel, "Wheat", "6")).toBeVisible();
  const websocketMessages = await page.evaluate(
    () => (window as unknown as { __gameplayWebSocketMessages: unknown[] }).__gameplayWebSocketMessages,
  );
  expect(websocketMessages).toMatchObject([
    {
      type: "submit_command",
      request_id: expect.any(String),
      expected_version: 1,
      command: { type: "sweep_plant", crop_id: "wheat", plot_ids: [expect.stringMatching(/^plot-/)] },
    },
    {
      type: "reset_farm",
      request_id: expect.any(String),
    },
  ]);
});

test("reconnect reloads catalog and farm snapshot from the gameplay websocket", async ({ page }) => {
  await installMockGameplayWebSocket(page, [
    { version: 1, view: farmView, catalog },
    { version: 2, view: { ...farmView, level: 2 }, catalog, delayMs: 300 },
  ]);

  await openFarm(page);

  await expect(page.getByLabel("Connection Synced")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __closeLatestGameplayWebSocket: () => void }).__closeLatestGameplayWebSocket());
  await expect(page.getByLabel("Connection Disconnected")).toBeVisible();
  await expect(page.getByLabel("Connection Reconnecting")).toBeVisible({ timeout: 2_000 });
  await expect(page.getByLabel("Connection Synced")).toBeVisible();
  await expect(page.locator(".top-bar").getByText("Level 2")).toBeVisible();
});

test("resident selector shows both residents and sends selected resident commands", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (command) => commands.push(command));

  await openFarm(page);

  const residents = page.getByLabel("Farm Residents");
  await expect(residents.getByText("Selected Resident")).toBeVisible();
  await expect(residents.getByText("Mara")).toBeVisible();
  await expect(residents.getByText("Jon")).toBeVisible();
  await expect(residents.getByRole("textbox")).toHaveCount(0);
  await expect(residents.getByRole("button", { name: "Rename" })).toHaveCount(0);

  await residents.locator(".resident-card").nth(1).getByRole("button", { name: "Select" }).click();

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "select_resident",
    resident_id: "man",
  });
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Resident Details" }),
  });
  await expect(selection.getByText("Jon")).toBeVisible();
  await expect(selection.getByText("Inspecting")).toBeVisible();
  await expect(selection.getByText("Task queue")).toBeVisible();
});

test("Bedroom Family Tree trims successful resident renames and shows rejected rename errors", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const renamedView: FarmView = {
    ...farmView,
    residents: [
      { id: "woman", display_name: "Ada" },
      farmView.residents[1],
    ],
  };
  await installMockGameplayWebSocket(
    page,
    [{ version: 1, view: farmView, catalog }],
    {
      commandResponses: [
        { accepted: true, version: 2, view: renamedView },
        { accepted: false, version: 3, view: renamedView, error: "Display name cannot be blank" },
      ],
      messageHandlerName: "__recordResidentCommand",
    },
  );
  await page.exposeFunction("__recordResidentCommand", (message: import("../../../contracts/generated/ts/my-farm").WebsocketClientMessage) => {
    if (message.type === "submit_command") {
      commands.push({ expected_version: message.expected_version, command: message.command });
    }
    return null;
  });

  await openFarm(page);

  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
  await enterHouseRoom(page, "Bedroom");
  await expect(page.getByRole("region", { name: "House Interior" })).toBeVisible();

  const familyTree = page.getByLabel("Family Tree");
  await expect(familyTree).toBeVisible();
  await familyTree.getByLabel("Mara display name").fill("  Ada  ");
  await familyTree.getByRole("button", { name: "Rename" }).first().click();
  await expect(familyTree.getByRole("textbox", { name: "Ada display name" })).toBeVisible();
  expect(commands.at(-1)?.command).toEqual({
    type: "rename_resident",
    resident_id: "woman",
    display_name: "Ada",
  });

  await familyTree.getByLabel("Ada display name").fill("   ");
  await familyTree.getByRole("button", { name: "Rename" }).first().click();
  await expect(familyTree.getByText("Display name cannot be blank")).toBeVisible();
  await expect(familyTree.getByRole("textbox", { name: "Ada display name" })).toBeVisible();
  expect(commands.at(-1)?.command).toEqual({
    type: "rename_resident",
    resident_id: "woman",
    display_name: "",
  });
});

test("resident selector shows queue counts and live task progress", async ({ page }) => {
  const now = Date.now();
  const view = withResidentTaskQueues(farmView, {
      woman: [
        {
          id: "task-1",
          kind: { type: "field_work" },
          started_at_ms: now - 10_000,
          ready_at_ms: now + 10_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "wheat" },
              duration_ms: 20_000,
            }),
          ],
        },
        {
          id: "task-2",
          kind: { type: "field_work" },
          started_at_ms: now + 10_000,
          ready_at_ms: now + 20_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-2" },
              work: { type: "harvest_crop", crop_id: "corn", quantity: 2 },
              duration_ms: 10_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await mockFarmApi(page, view);

  await openFarm(page);

  const maraCard = page.getByLabel("Farm Residents").locator(".resident-card").first();
  await expect(maraCard.getByText("Plant Wheat")).toBeVisible();
  await expect(maraCard.getByText("Queued tasks")).toBeVisible();
  await expect(maraCard.getByText("2", { exact: true })).toBeVisible();
  const progress = maraCard.getByLabel("Mara task progress");
  await expect(progress).toBeVisible();
  const initialProgress = Number(await progress.getAttribute("value"));
  await expect.poll(async () => Number(await progress.getAttribute("value")), { timeout: 4_000 }).toBeGreaterThan(initialProgress);
});

test("reserved work targets disable direct actions with a pending reason", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop selection panel is covered here.");
  const now = Date.now();
  const viewBase: FarmView = {
    ...farmView,
    field_plots: [
      {
        id: "plot-1",
        tile: { x: 0, y: 0 },
        crop: { item_id: "wheat", planted_at_ms: now - 20_000, ready_at_ms: now - 1_000 },
      },
      farmView.field_plots[1],
    ],
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: now - 20_000, ready_at_ms: now - 1_000 }],
      },
    ],
  };
  const view = withResidentTaskQueues(viewBase, {
      woman: [
        {
          id: "field-task",
          kind: { type: "field_work" },
          started_at_ms: now - 5_000,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "harvest_crop", crop_id: "wheat", quantity: 2 },
              duration_ms: 10_000,
            }),
          ],
        },
        {
          id: "machine-task",
          kind: { type: "production_work" },
          started_at_ms: now - 5_000,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "machine", machine_id: "machine-1" },
              work: { type: "collect_machine_job", job_id: "job-1", recipe_id: "chicken_feed" },
              duration_ms: 10_000,
            }),
          ],
        },
        {
          id: "animal-task",
          kind: { type: "production_work" },
          started_at_ms: now - 5_000,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "animal", shelter_id: "shelter-1", animal_slot: "animal-2" },
              work: { type: "collect_animal_product", item_id: "egg", quantity: 1 },
              duration_ms: 10_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await mockFarmApi(page, view);
  await openFarm(page);

  await page.getByLabel("Field Plot plot-1").click({ force: true });
  let selection = page.locator(".panel-section").filter({ has: page.getByRole("heading", { name: "Selection" }) });
  await expect(selection.getByRole("button", { name: "Harvest" })).toBeDisabled();
  await expect(selection.getByText("Reserved for Mara's task")).toBeVisible();

  await page.getByLabel("Feed Mill structure").click({ force: true });
  selection = page.locator(".panel-section").filter({ has: page.getByRole("heading", { name: "Selection" }) });
  await expect(selection.getByRole("button", { name: /Collect Chicken Feed/ })).toBeDisabled();
  await expect(selection.getByRole("button", { name: "Make Chicken Feed" })).toBeDisabled();
  await expect(selection.getByText("Reserved for Mara's task")).toBeVisible();

  await page.getByLabel("Chicken Coop structure").click({ force: true });
  selection = page.locator(".panel-section").filter({ has: page.getByRole("heading", { name: "Selection" }) });
  await expect(selection.getByRole("button", { name: "Collect animal 2" })).toBeDisabled();
  await expect(selection.getByText("Reserved for Mara's task")).toBeVisible();
});

test("frames the 3d farm scene inside the viewport", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  await expectCanvasToRenderNonBlank(page);
  await expectFarmHitTargetsFramed(page);
});

test("shows the arrival road path and moving car within farm framing", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  await expectCanvasToRenderNonBlank(page);
  await expectFarmHitTargetsFramed(page);

  const arrivalTargets = [
    page.getByTestId("farm-scene-road"),
    page.getByTestId("farm-scene-dirt-path"),
    page.getByTestId("farm-scene-car"),
    page.getByTestId("farm-scene-farm-house"),
  ];

  for (const target of arrivalTargets) {
    await expect(target).toBeVisible();
    await expectElementFramed(page, target);
  }

  const before = await canvasSnapshot(page);
  await expect.poll(async () => await canvasSnapshot(page), { timeout: 3_000 }).not.toBe(before);
});

test("renders both farm residents idle near the Farmhouse", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  const farmhouse = page.getByTestId("farm-scene-farm-house");
  const mara = page.getByTestId("farm-scene-resident-woman");
  const jon = page.getByTestId("farm-scene-resident-man");

  await expectCanvasToRenderNonBlank(page);
  await expect(farmhouse).toBeVisible();
  await expect(mara).toBeVisible();
  await expect(jon).toBeVisible();
  await expect(mara).toHaveAttribute("data-resident-state", "idle");
  await expect(jon).toHaveAttribute("data-resident-state", "idle");
  await expect(mara).toHaveAttribute("data-resident-target", "Farmhouse");
  await expect(jon).toHaveAttribute("data-resident-target", "Farmhouse");

  const farmhouseCenter = await elementCenter(farmhouse);
  const maraCenter = await elementCenter(mara);
  const jonCenter = await elementCenter(jon);
  expect(distanceBetween(farmhouseCenter, maraCenter)).toBeLessThan(120);
  expect(distanceBetween(farmhouseCenter, jonCenter)).toBeLessThan(120);
  expect(distanceBetween(maraCenter, jonCenter)).toBeGreaterThan(8);
  await expectElementFramed(page, mara);
  await expectElementFramed(page, jon);
});

test("moves a resident toward the current task target over authoritative task time", async ({ page }) => {
  const startedAt = Date.now() + 1_500;
  const view = withResidentTaskQueues({
    ...farmView,
    resident_locations: {
      ...farmView.resident_locations,
      man: { x: 0, y: 3 },
    },
  }, {
      woman: [],
      man: [
        {
          id: "task-1",
          kind: { type: "field_work" },
          started_at_ms: startedAt,
          ready_at_ms: startedAt + 10_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 0, y: 0 },
              walk_path: [
                { x: 0, y: 2 },
                { x: 0, y: 1 },
                { x: 0, y: 0 },
              ],
              walk_duration_ms: 8_000,
              work_duration_ms: 2_000,
              duration_ms: 10_000,
            }),
          ],
        },
      ],
  });
  await mockFarmApi(page, view);
  await openFarm(page);

  const resident = page.getByTestId("farm-scene-resident-man");
  await expect(resident).toHaveAttribute("data-resident-state", "walking");
  await expect(resident).toHaveAttribute("data-resident-target", "Field Plot plot-1");
  await page.waitForTimeout(Math.max(0, startedAt + 500 - Date.now()));

  const firstCenter = await elementCenter(resident);
  await page.waitForTimeout(700);
  const secondCenter = await elementCenter(resident);
  expect(distanceBetween(firstCenter, secondCenter)).toBeGreaterThan(3);

  await page.waitForTimeout(700);
  const thirdCenter = await elementCenter(resident);
  expect(distanceBetween(secondCenter, thirdCenter)).toBeGreaterThan(3);
  await expect(resident).toHaveAttribute("data-resident-state", "walking");

  await page.waitForTimeout(Math.max(0, startedAt + 8_200 - Date.now()));
  await expect(resident).toHaveAttribute("data-resident-state", "working");
});

test("clicking a farm resident selects them, sends assignment command, and shows only their path", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const now = Date.now();
  const view = withResidentTaskQueues({
    ...farmView,
    resident_locations: {
      woman: { x: 8, y: 10 },
      man: { x: 0, y: 3 },
    },
  }, {
      woman: [
        {
          id: "woman-task",
          kind: { type: "field_work" },
          started_at_ms: now,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-2" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 1, y: 0 },
              walk_path: [
                { x: 8, y: 9 },
                { x: 7, y: 9 },
                { x: 1, y: 0 },
              ],
              walk_duration_ms: 4_000,
              work_duration_ms: 1_000,
              duration_ms: 5_000,
            }),
          ],
        },
      ],
      man: [
        {
          id: "man-task",
          kind: { type: "field_work" },
          started_at_ms: now,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "corn" },
              approach_tile: { x: 0, y: 0 },
              walk_path: [
                { x: 0, y: 2 },
                { x: 0, y: 1 },
                { x: 0, y: 0 },
              ],
              walk_duration_ms: 4_000,
              work_duration_ms: 1_000,
              duration_ms: 5_000,
            }),
          ],
        },
      ],
  });
  await mockFarmApi(page, view, catalog, (request) => commands.push(request));
  await openFarm(page);

  await expect(page.getByTestId("resident-path-man")).toHaveCount(0);
  await expect(page.getByTestId("resident-path-woman")).toHaveCount(0);

  await page.getByTestId("farm-scene-resident-man").click({ force: true });

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "select_resident",
    resident_id: "man",
  });
  await expect(page.getByTestId("resident-path-man")).toBeVisible();
  await expect(page.getByTestId("resident-path-man")).toHaveAttribute("data-path-tile-count", "4");
  await expect(page.getByTestId("resident-path-woman")).toHaveCount(0);
  const cue = page.getByTestId("farm-scene-resident-cue-man");
  await expect(cue).toBeVisible();
  await expect(cue).toContainText("Plant Corn");
  await expect(cue).toContainText("Field Plot plot-1");
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Resident Details" }),
  });
  await expect(selection.getByText("Jon")).toBeVisible();
  await expect(selection.getByText("Inspecting")).toBeVisible();
  await expect(selection.getByText("Walking")).toBeVisible();
  await expect(selection.getByText("Current task")).toBeVisible();
  await expect(selection.getByText("Plant Corn", { exact: true }).first()).toBeVisible();
  await expect(selection.getByText("Current step")).toBeVisible();
  await expect(selection.getByText("Target")).toBeVisible();
  await expect(selection.getByText("Field Plot plot-1", { exact: true }).first()).toBeVisible();
  await expect(selection.getByLabel("Jon task progress")).toBeVisible();
  await expect(selection.getByText("Carrying")).toBeVisible();
  await expect(selection.getByText("Empty")).toBeVisible();
  await expect(selection.getByText("Task queue")).toBeVisible();
  const taskRow = selection.getByRole("listitem").filter({ hasText: "Plant Corn" }).first();
  await expect(taskRow).toBeVisible();
  await expect(taskRow).toContainText("Current");
  await expect(taskRow).toContainText("1 step");
  await taskRow.locator("summary").click();
  await expect(taskRow).toContainText("Walk 4s / Work 1s");
  await expect(taskRow).toContainText("1 crop");
});

test("blocked resident work shows a scene warning and Resident Details reason", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop scene warning is covered here; mobile drawer behavior is covered separately.");
  const now = Date.now();
  const view = withResidentTaskQueues(farmView, {
      woman: [
        {
          id: "blocked-task",
          kind: { type: "field_work" },
          started_at_ms: now - 5_000,
          ready_at_ms: now + 5_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 0, y: 0 },
              duration_ms: 10_000,
            }),
          ],
        },
      ],
      man: [],
  });
  const womanWork = view.resident_work.woman;
  if (!womanWork) {
    throw new Error("Expected Mara resident work in blocked fixture");
  }
  const blockedView: FarmView = {
    ...view,
    resident_work: {
      ...view.resident_work,
      woman: {
        ...womanWork,
        state: "blocked",
        queue: womanWork.queue.map((task, index) => ({
          ...task,
          queue_state: index === 0 ? "blocked" : task.queue_state,
        })),
        block: {
          task_id: "blocked-task",
          resident_id: "woman",
          reason: "missing_carried_items",
          message: "Plant Wheat is blocked because Mara is missing carried Wheat.",
        },
      },
    },
  };
  await mockFarmApi(page, blockedView);
  await openFarm(page);

  await page.getByTestId("farm-scene-resident-woman").click({ force: true });

  const cue = page.getByTestId("farm-scene-resident-cue-woman");
  await expect(cue).toBeVisible();
  await expect(cue).toHaveAttribute("data-resident-blocked", "true");
  await expect(cue).toContainText("!");
  await expect(cue).toContainText("Plant Wheat");

  const details = page.locator(".resident-details-panel");
  await expect(details.getByRole("heading", { name: "Resident Details" })).toBeVisible();
  await expect(details.getByText("Blocked", { exact: true }).first()).toBeVisible();
  await expect(details.getByText("Plant Wheat is blocked because Mara is missing carried Wheat.")).toBeVisible();
  await expect(details.getByRole("listitem").filter({ hasText: "Plant Wheat" })).toContainText("Blocked");
});

test("mobile opens Resident Details as a bottom sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile bottom sheet behavior is covered in the mobile project.");
  await mockFarmApi(page);
  await openFarm(page);

  await page.getByTestId("farm-scene-resident-woman").click({ force: true });

  const details = page.locator(".resident-details-panel");
  await expect(details.getByRole("heading", { name: "Resident Details" })).toBeVisible();
  await expect(details.getByRole("button", { name: "Close Resident Details" })).toBeVisible();
  const box = await details.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y + box!.height).toBeGreaterThan(viewport!.height - 40);
  expect(box!.height).toBeLessThan(viewport!.height * 0.6);
});

test("renders resident as working after walking to the approach tile", async ({ page }) => {
  const now = Date.now();
  const view = withResidentTaskQueues(farmView, {
      woman: [
        {
          id: "task-1",
          kind: { type: "field_work" },
          started_at_ms: now - 1_500,
          ready_at_ms: now + 1_500,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 0, y: 0 },
              walk_path: [{ x: 0, y: 0 }],
              walk_duration_ms: 500,
              work_duration_ms: 2_500,
              duration_ms: 3_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await mockFarmApi(page, view);
  await openFarm(page);

  const resident = page.getByTestId("farm-scene-resident-woman");
  await expect(resident).toHaveAttribute("data-resident-state", "working");
  await expect(resident).toHaveAttribute("data-resident-target", "Field Plot plot-1");
  await expect(resident).toHaveAttribute("data-resident-activity", "planting");
  await expect(resident).toHaveAttribute("data-resident-prop", "seed_pouch");
});

test("renders task-specific resident harvest visual cue", async ({ page }) => {
  const now = Date.now();
  const view = withResidentTaskQueues(farmView, {
      woman: [
        {
          id: "task-harvest",
          kind: { type: "field_work" },
          started_at_ms: now - 500,
          ready_at_ms: now + 500,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "harvest_crop", crop_id: "wheat", quantity: 2 },
              approach_tile: { x: 0, y: 0 },
              duration_ms: 1_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await mockFarmApi(page, view);
  await openFarm(page);

  const resident = page.getByTestId("farm-scene-resident-woman");
  await expect(resident).toHaveAttribute("data-resident-state", "working");
  await expect(resident).toHaveAttribute("data-resident-activity", "harvesting");
  await expect(resident).toHaveAttribute("data-resident-prop", "basket");
});

test("uses the first remaining batch task step as the scene movement target", async ({ page }) => {
  const now = Date.now();
  const batchView = withResidentTaskQueues(farmView, {
      woman: [
        {
          id: "task-1",
          kind: { type: "field_work" },
          started_at_ms: now,
          ready_at_ms: now + 2_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 0, y: 0 },
              duration_ms: 2_000,
            }),
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-2" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 1, y: 0 },
              duration_ms: 2_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await installMockGameplayWebSocket(page, [{ version: 1, view: batchView, catalog }]);
  await rejectRestGameplay(page);
  await openFarm(page);

  const resident = page.getByTestId("farm-scene-resident-woman");
  await expect(resident).toHaveAttribute("data-resident-target", "Field Plot plot-1");

  const nextStepView = withResidentTaskQueues(batchView, {
      woman: [
        {
          id: "task-1",
          kind: { type: "field_work" },
          started_at_ms: now + 2_000,
          ready_at_ms: now + 4_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "field_plot", plot_id: "plot-2" },
              work: { type: "plant_crop", crop_id: "wheat" },
              approach_tile: { x: 1, y: 0 },
              duration_ms: 2_000,
            }),
          ],
        },
      ],
      man: [],
  });
  await page.evaluate((view) => {
    (window as unknown as {
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
    }).__pushLatestGameplayFarmSnapshot({ version: 2, view });
  }, nextStepView);

  await expect(resident).toHaveAttribute("data-resident-target", "Field Plot plot-2");
});

test("idle machines do not show production status badges", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, shelters: [] });
  await openFarm(page);

  await expect(page.getByLabel("Feed Mill structure")).toBeVisible();
  await expect(page.getByTestId("structure-status-feed-mill")).toHaveCount(0);
});

test("producing machines show product identity and progress", async ({ page }) => {
  const now = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    shelters: [],
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: now - 5_000, ready_at_ms: now + 5_000 }],
      },
    ],
  });
  await openFarm(page);

  const status = page.getByTestId("structure-status-feed-mill");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-label", "Feed Mill status: Producing Chicken Feed");
  await expect(page.getByTestId("structure-status-feed-mill-progress")).toBeVisible();
  await expect(page.getByLabel("Feed Mill structure")).toBeVisible();
});

test("ready machines show product identity and storage warnings", async ({ page }) => {
  const now = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    barn_used: 30,
    barn_capacity: 30,
    shelters: [],
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: now - 10_000, ready_at_ms: now - 1_000 }],
      },
    ],
  });
  await openFarm(page);

  const status = page.getByTestId("structure-status-feed-mill");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-label", "Feed Mill status: Ready Chicken Feed, storage full");
  await expect(page.getByTestId("structure-status-feed-mill-blocked")).toBeVisible();

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  await expect(
    page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Collect Chicken Feed Storage full" }),
  ).toBeDisabled();
});

test("Farmhouse Oven status cue reflects producing ready and storage-full states", async ({ page }) => {
  const now = Date.now();
  const producingView = {
    ...farmView,
    owned_farmhouse_upgrades: ["oven"],
    oven: {
      id: "oven",
      queue: [{ id: "job-1", recipe_id: "bread", status: "producing", started_at_ms: now - 5_000, ready_at_ms: now + 5_000 }],
    },
  } satisfies FarmView;
  const readyView = {
    ...producingView,
    oven: {
      id: "oven",
      queue: [{ id: "job-1", recipe_id: "bread", status: "producing", started_at_ms: now - 10_000, ready_at_ms: now - 1_000 }],
    },
  } satisfies FarmView;
  const blockedView = {
    ...readyView,
    barn_used: 30,
    barn_capacity: 30,
  } satisfies FarmView;
  await installMockGameplayWebSocket(page, [{ version: 1, view: producingView, catalog }]);
  await rejectRestGameplay(page);
  await openFarm(page);

  const status = page.getByTestId("structure-status-farmhouse-oven");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-label", "Farmhouse Oven status: Producing Bread");
  await expect(page.getByTestId("structure-status-farmhouse-oven-progress")).toBeVisible();
  await expectElementFramed(page, status);

  await page.evaluate((view) => {
    (window as unknown as {
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
    }).__pushLatestGameplayFarmSnapshot({ version: 2, view });
  }, readyView);
  await expect(status).toHaveAttribute("aria-label", "Farmhouse Oven status: Ready Bread");

  await page.evaluate((view) => {
    (window as unknown as {
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
    }).__pushLatestGameplayFarmSnapshot({ version: 3, view });
  }, blockedView);
  await expect(status).toHaveAttribute("aria-label", "Farmhouse Oven status: Ready Bread, storage full");
  await expect(page.getByTestId("structure-status-farmhouse-oven-blocked")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toHaveCount(0);
});

test("shelters show producing and ready animal product status", async ({ page }) => {
  const now = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    shelters: [
      {
        id: "shelter-1",
        kind: "chicken_coop",
        tile: { x: 5, y: 7 },
        animals: [
          { id: "animal-1", state: { type: "idle" } },
          { id: "animal-2", state: { type: "producing", fed_at_ms: now - 5_000, ready_at_ms: now + 5_000 } },
        ],
      },
      {
        id: "shelter-2",
        kind: "cow_pasture",
        tile: { x: 11, y: 8 },
        animals: [
          { id: "animal-1", state: { type: "ready" } },
          { id: "animal-2", state: { type: "idle" } },
        ],
      },
    ],
  });
  await openFarm(page);

  await expect(page.getByTestId("structure-status-chicken-coop")).toHaveAttribute(
    "aria-label",
    "Chicken Coop status: Producing Egg",
  );
  await expect(page.getByTestId("structure-status-chicken-coop-progress")).toBeVisible();
  await expect(page.getByTestId("structure-status-cow-pasture")).toHaveAttribute(
    "aria-label",
    "Cow Pasture status: Ready Milk",
  );
  await expect(page.getByLabel("Chicken Coop structure")).toBeVisible();
  await expect(page.getByLabel("Cow Pasture structure")).toBeVisible();
});

test("field tools expose one seed picker and change the cursor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Cursor behavior is desktop-specific.");
  await mockFarmApi(page);
  await openFarm(page);

  const tools = page.locator(".field-tools");
  await expect(tools.getByRole("button", { name: "Seed" })).toHaveCount(1);
  await expect(tools.getByRole("button", { name: /Corn/ })).toHaveCount(0);

  await expect(page.locator(".field-hit-target").first()).toHaveCSS("cursor", "pointer");
  await tools.getByRole("button", { name: "Build" }).click();
  await expect(page.getByRole("navigation", { name: "Structures" })).toBeVisible();
  await tools.getByRole("button", { name: "Default" }).click();
  await expect(page.getByRole("navigation", { name: "Structures" })).toBeHidden();
  await expect(page.locator(".field-hit-target").first()).toHaveCSS("cursor", "pointer");

  await tools.getByRole("button", { name: "Seed" }).click();
  await expect(tools.getByRole("menu", { name: "Seed type" })).toBeVisible();
  await tools.getByRole("menuitemradio", { name: /Wheat/ }).click();
  await expect(page.locator(".field-hit-target").first()).toHaveCSS("cursor", "copy");

  await tools.getByRole("button", { name: "Harvest" }).click();
  await expect(page.locator(".field-hit-target").first()).toHaveCSS("cursor", "cell");
});

test("main menu opens settings wiki and account panels", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  const options = page.getByRole("navigation", { name: "Main menu options" });
  await expect(options.getByRole("button", { name: "Tutorial" })).toHaveCount(0);

  await options.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Sound")).toBeChecked();
  await expect(page.getByLabel("Reduced Motion")).not.toBeChecked();
  await page.getByRole("button", { name: "Back" }).click();

  await options.getByRole("button", { name: "Wiki" }).click();
  await expect(page.getByRole("heading", { name: "Wiki" })).toBeVisible();
  await expect(page.getByText("Field Plot")).toBeVisible();
  await expect(page.getByText("Delivery Order")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await options.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByText("Local Player")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Field Tools" })).toBeVisible();
});

test("top bar menu returns to the main menu", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByRole("heading", { name: "Field Tools" })).toBeVisible();
  await expect(page.getByText("Farm reset")).toBeVisible();
});

test("new farm opens the guided tutorial modal sequence", async ({ page }) => {
  await mockFarmApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: "New Farm" }).click();

  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "Got it" })).toHaveCount(1);
  await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
  await expect(dialog.getByText("Welcome to your fresh Farm")).toBeVisible();

  const expectedCards = [
    { step: "Step 2 of 5", title: "Field Plots and planting" },
    { step: "Step 3 of 5", title: "Crop timers and harvesting" },
    { step: "Step 4 of 5", title: "Silo storage" },
    { step: "Step 5 of 5", title: "Coins, XP, and Build progression" },
  ];

  for (const card of expectedCards) {
    await dialog.getByRole("button", { name: "Got it" }).click();
    await expect(dialog.getByText(card.step)).toBeVisible();
    await expect(dialog.getByText(card.title)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Got it" })).toHaveCount(1);
  }

  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toHaveCount(0);
});

test("in-game reset opens the guided tutorial on the first card", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  await page.getByRole("button", { name: "Reset" }).click();

  await expect(page.getByText("Farm reset")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
  await expect(dialog.getByText("Welcome to your fresh Farm")).toBeVisible();
});

test("reset clears transient gameplay UI before showing the guided tutorial", async ({ page }) => {
  await mockFarmApi(page, buildableFarmView());
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Field Plot/ }).click();
  await expect(page.getByText("Place Field Plot")).toBeVisible();

  await page.getByRole("button", { name: "Open Farmers Market" }).click();
  await expect(page.getByRole("region", { name: "Farmers Market" })).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).evaluate((button) => {
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });

  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("region", { name: "Farmers Market" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Structures" })).toBeHidden();
  await expect(page.getByText("Place Field Plot")).toHaveCount(0);
});

test("guided tutorial blocks gameplay commands until it closes", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await page.goto("/");

  await page.getByRole("button", { name: "New Farm" }).click();

  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  const plot = page.getByLabel("Field Plot plot-1");
  const selectionPanel = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await plot.click({ force: true });
  await expect(selectionPanel.getByRole("button", { name: "Plant Wheat" })).toHaveCount(0);

  await plot.click({ force: true });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(commands).toHaveLength(0);

  await closeGuidedTutorial(page);
  await plot.click({ force: true });
  await expect(selectionPanel.getByRole("button", { name: "Plant Wheat" })).toBeVisible();
  await selectSeedTool(page, "Wheat");
  await plot.click({ force: true });
  await page.mouse.up();
  await expect.poll(() => commands.at(-1)?.command).toMatchObject({
    type: "sweep_plant",
    crop_id: "wheat",
  });
});

test("guided tutorial pauses the client clock until gameplay resumes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop field selection is covered here.");
  const openedAt = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: openedAt - 5_000, ready_at_ms: openedAt + 20_000 }],
      },
    ],
  });
  await openFarm(page);
  const progress = page.getByTestId("structure-status-feed-mill-progress");
  await expect(progress).toBeVisible();
  const initialProgress = await progress.evaluate((element) =>
    element instanceof HTMLElement ? element.style.getPropertyValue("--progress") : "",
  );

  await page.getByRole("button", { name: "Reset" }).click();
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  await expect(dialog).toBeVisible();
  const pausedProgress = await progress.evaluate((element) =>
    element instanceof HTMLElement ? element.style.getPropertyValue("--progress") : "",
  );

  await page.waitForTimeout(2800);
  await expect
    .poll(() =>
      progress.evaluate((element) =>
        element instanceof HTMLElement ? element.style.getPropertyValue("--progress") : "",
      ),
    )
    .toBe(pausedProgress);

  await closeGuidedTutorial(page);
  await expect
    .poll(
      () =>
        progress.evaluate((element) =>
          element instanceof HTMLElement ? element.style.getPropertyValue("--progress") : "",
      ),
      { timeout: 3_500 },
    )
    .not.toBe(pausedProgress);
});

test("barn and silo are preplaced storage structures", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

  await expect(page.getByLabel("Silo structure")).toBeVisible();
  await expect(page.getByLabel("Barn structure")).toBeVisible();

  await page.getByLabel("Silo structure").click();
  await expect(page.getByText("Silo storage - 2/40 crops")).toBeVisible();

  await page.getByLabel("Barn structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Barn");
  await expect(menu.getByRole("menuitem", { name: "Move" })).toBeEnabled();
});

test("silo context menu shows available upgrade cost and sends command", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await page.getByLabel("Silo structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Silo");
  const upgrade = menu.getByRole("menuitem", {
    name: "Upgrade Silo 60 coins - Capacity 40 -> 60",
  });
  await expect(upgrade).toBeEnabled();

  await upgrade.click();

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "upgrade_storage",
    storage_kind: "silo",
  });
  await expect(menu).toBeHidden();
});

test("locked storage upgrade menu shows level reason", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 1 });
  await openFarm(page);

  await page.getByLabel("Silo structure").click({ button: "right" });
  await expect(
    page.getByTestId("structure-context-menu").getByRole("menuitem", {
      name: "Upgrade Silo Unlocks at level 2",
    }),
  ).toBeDisabled();
});

test("unaffordable storage upgrade menu shows coin shortfall", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, coins: 40 });
  await openFarm(page);

  await page.getByLabel("Barn structure").click({ button: "right" });
  await expect(
    page.getByTestId("structure-context-menu").getByRole("menuitem", {
      name: "Upgrade Barn Need 10 coins",
    }),
  ).toBeDisabled();
});

test("maxed storage upgrade menu shows fully upgraded", async ({ page }) => {
  await mockFarmApi(page, {
    ...farmView,
    level: 7,
    silo_capacity: 115,
    silo_upgrade_tier: 3,
  });
  await openFarm(page);

  await page.getByLabel("Silo structure").click({ button: "right" });
  await expect(
    page.getByTestId("structure-context-menu").getByRole("menuitem", {
      name: "Upgrade Silo Fully upgraded",
    }),
  ).toBeDisabled();
});

test("storage selection panel shows tier and upgrade details", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await page.getByLabel("Silo structure").click();
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });

  await expect(selection.getByText("Silo storage - 2/40 crops")).toBeVisible();
  await expect(selection.getByText("Tier 0/3")).toBeVisible();
  await expect(selection.getByText("Next upgrade - 60 coins, capacity 40 -> 60")).toBeVisible();
  await selection.getByRole("button", { name: "Upgrade Silo" }).click();

  expect(commands).toHaveLength(1);
  expect(commands[0].command).toEqual({
    type: "upgrade_storage",
    storage_kind: "silo",
  });
});

test("farmhouse selection buys the oven upgrade when available", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(
    page,
    {
      ...farmView,
      level: 2,
      coins: 40,
      owned_farmhouse_upgrades: [],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await openFarmhouseSelection(page);
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });

  await expect(selection.getByText("Oven upgrade - 40 coins, queue 2")).toBeVisible();
  await selection.getByRole("button", { name: "Buy Oven" }).click();

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "buy_farmhouse_upgrade",
    upgrade_kind: "oven",
  });
});

test("Farmhouse Oven actions queue and collect Bread", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const now = Date.now();
  await mockFarmApi(
    page,
    {
      ...farmView,
      level: 2,
      owned_farmhouse_upgrades: ["oven"],
      inventory: [{ item_id: "wheat", name: "Wheat", quantity: 3, kind: "crop" }],
      oven: {
        id: "oven",
        queue: [{ id: "job-1", recipe_id: "bread", status: "producing", started_at_ms: now - 10_000, ready_at_ms: now - 1_000 }],
      },
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await openFarmhouseSelection(page);
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });

  await expect(selection.getByText("Oven - queue 1/2")).toBeVisible();
  await selection.getByRole("button", { name: "Collect Bread" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({ type: "collect_oven_job" });

  await selection.getByRole("button", { name: "Make Bread" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "queue_oven_recipe",
    recipe_id: "bread",
  });
});

test("storage selection can discard one item from the inventory list", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(
    page,
    {
      ...farmView,
      barn_used: 3,
      inventory: [
        { item_id: "wheat", name: "Wheat", quantity: 2, kind: "crop" },
        { item_id: "bread", name: "Bread", quantity: 3, kind: "product" },
      ],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Barn structure").click();
  const inventory = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Barn storage - 3/30 goods")).toBeVisible();
  await expect(selection.getByRole("button", { name: /Throw away/ })).toHaveCount(0);
  await expect(inventory.getByText("Bread", { exact: true })).toBeVisible();
  await expect(inventory.getByText("3 stored")).toBeVisible();
  await expect(inventory.getByRole("button", { name: "Throw away 1 Bread" })).toBeVisible();
  await expect(selection.getByRole("button", { name: /Throw away Wheat/ })).toHaveCount(0);

  await inventory.getByRole("button", { name: "Throw away 1 Bread" }).click();

  expect(commands).toHaveLength(1);
  expect(commands[0].command).toEqual({
    type: "discard_inventory",
    item_id: "bread",
    quantity: 1,
  });

  commands.length = 0;
  await page.getByLabel("Silo structure").click();
  await expect(selection.getByText("Silo storage - 2/40 crops")).toBeVisible();
  await expect(selection.getByRole("button", { name: /Throw away/ })).toHaveCount(0);
  await expect(inventory.getByText("Wheat", { exact: true })).toBeVisible();
  await expect(inventory.getByText("2 stored")).toBeVisible();

  await inventory.getByRole("button", { name: "Throw away 1 Wheat" }).click();

  expect(commands).toHaveLength(1);
  expect(commands[0].command).toEqual({
    type: "discard_inventory",
    item_id: "wheat",
    quantity: 1,
  });
});

test("legacy farm responses without storage tiles still render preplaced storage", async ({ page }) => {
  const legacyView = { ...farmView };
  delete (legacyView as Partial<FarmView>).silo_tile;
  delete (legacyView as Partial<FarmView>).barn_tile;

  await mockFarmApi(page, legacyView);
  await openFarm(page);

  await expect(page.getByLabel("Silo structure")).toBeVisible();
  await expect(page.getByLabel("Barn structure")).toBeVisible();
});

test("build tray shows disabled structure details without opening a context menu", async ({ page }) => {
  await openFarm(page);

  await expect(page.getByRole("navigation", { name: "Structures" })).toBeHidden();
  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Feed Mill/ }).click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Feed Mill");
  await expect(page.getByTestId("build-detail-strip")).toContainText("Unlocks at level 3");
});

test("build tray shows Tool Shed outside demo mode with its requirements", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 2, coins: 120 });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Tool Shed/ }).click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Tool Shed");
  await expect(page.getByTestId("build-detail-strip")).toContainText("45 coins");
  await expect(page.getByTestId("build-detail-strip")).toContainText("Unlocks at level 3");
});

test("placing an available structure sends buy_structure with the chosen tile", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Feed Mill/ }).click();
  await expect(page.getByText("Place Feed Mill")).toBeVisible();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Choose a tile");
  await expectCanvasToChangeAfterGroundHover(page, { x: 3, y: 3 });

  const command = await clickGroundTileUntilCommand(page, commands, { x: 3, y: 3 });
  expect(command.command).toMatchObject({
    type: "buy_structure",
    structure_kind: "feed_mill",
  });
  expect(command.command).toHaveProperty("tile");
});

test("placing Tool Shed uses a 1x1 footprint and the structure guardrails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop canvas hit geometry is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Tool Shed/ }).click();
  await expect(page.getByText("Place Tool Shed")).toBeVisible();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Choose a tile");

  await page.getByLabel("Field Plot plot-1").click({ force: true });
  await expect(page.getByText("Tile is occupied")).toBeVisible();
  expect(commands).toHaveLength(0);

  const command = await clickGroundTileUntilCommand(page, commands, { x: 9, y: 7 });
  expect(command.command).toMatchObject({
    type: "buy_structure",
    structure_kind: "tool_shed",
    tile: { x: 9, y: 7 },
  });
});

test("placing a field plot sends buy_field_plot with the chosen tile", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Field Plot/ }).click();
  await expect(page.getByText("Place Field Plot")).toBeVisible();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Choose a tile");

  const command = await clickGroundTileUntilCommand(page, commands, { x: 3, y: 3 });
  expect(command.command).toMatchObject({ type: "buy_field_plot" });
  expect(command.command).toHaveProperty("tile");
});

test("blocked structure placement explains the occupied tile without sending a command", async ({
  page,
}) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Feed Mill/ }).click();
  await expect(page.getByText("Place Feed Mill")).toBeVisible();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Choose a tile");
  await page.getByLabel("Field Plot plot-1").click({ force: true });

  await expect(page.getByText("Tile is occupied")).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("farmhouse blocks new field plots and structures without sending a command", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const farmHouse = page.getByLabel("Farmhouse structure");
  await expect(farmHouse).toBeVisible();

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Field Plot/ }).click();
  await expect(page.getByText("Place Field Plot")).toBeVisible();
  await farmHouse.click({ force: true });

  await expect(page.getByText("Tile is occupied")).toBeVisible();
  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
  expect(commands).toHaveLength(0);

  await tray.getByRole("button", { name: /Feed Mill/ }).click();
  await expect(page.getByText("Place Feed Mill")).toBeVisible();
  await farmHouse.click({ force: true });

  await expect(page.getByText("Tile is occupied")).toBeVisible();
  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
  expect(commands).toHaveLength(0);
});

test("enters the Farmhouse interior, switches rooms, and returns to the farm scene", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 1 });
  await openFarm(page);

  await page.getByLabel("Farmhouse structure").click({ force: true });

  const house = page.getByRole("region", { name: "House Interior" });
  await expect(house).toBeVisible();
  await expect(page.getByLabel("Farmhouse structure")).toHaveCount(0);
  await expect(page.getByTestId("house-overview")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toHaveCount(0);

  await page.getByRole("button", { name: "Enter Kitchen" }).click();
  await expect(page.getByTestId("house-room-kitchen")).toBeVisible();
  await page.getByRole("button", { name: "Exit Kitchen to House Overview" }).click();
  await expect(page.getByTestId("house-overview")).toBeVisible();

  await page.getByRole("button", { name: "Enter Bedroom" }).click();
  await expect(page.getByTestId("house-room-bedroom")).toBeVisible();
  await page.getByRole("button", { name: "Exit Bedroom to House Overview" }).click();

  await page.getByRole("button", { name: "Enter Living Room" }).click();
  await expect(page.getByTestId("house-room-living_room")).toBeVisible();
  await page.getByRole("button", { name: "Exit Living Room to House Overview" }).click();
  await expect(page.getByTestId("house-overview")).toBeVisible();

  await page.getByRole("button", { name: "Exit Farmhouse to Farm" }).click();
  await expect(house).toHaveCount(0);
  await expect(page.getByLabel("Farmhouse structure")).toBeVisible();
});

test("frames the House Interior scene and controls on desktop and mobile", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 5 });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");

  await expect(page.getByRole("region", { name: "House Interior" })).toBeVisible();
  await expectCanvasToRenderNonBlank(page);
  await expect(page.getByTestId("house-room-living_room")).toBeVisible();
  await expectElementFramed(page, page.getByTestId("house-room-living_room"));
  await expectElementFramed(page, page.locator(".house-room-tiles"));
  await expectHouseInteriorControlsFramedWithoutOverlap(page);
  await expectReadableButtons(page.getByRole("navigation", { name: "Decorations" }).getByRole("button"));
  await expect(page.getByTestId("farm-scene-resident-woman")).toHaveCount(0);
  await expect(page.getByTestId("farm-scene-resident-man")).toHaveCount(0);
});

test("house interior decoration controls are locked before Farm level 5", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 4 });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");

  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Decoration placement unlocks at Farm level 5",
  );
  const decorations = page.getByRole("navigation", { name: "Decorations" });
  await expect(decorations.getByRole("button", { name: /Sofa/ })).toBeDisabled();
  await expect(page.getByLabel("Room Tile 0,0")).toBeDisabled();
});

test("house grid toggle hides and disables Decoration editing without blocking navigation", async ({ page }) => {
  await mockFarmApi(page, { ...farmView, level: 5 });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");
  await page.getByRole("button", { name: "Grid On" }).click();

  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Grid off; turn on grid to edit Decorations.",
  );
  await expect(page.getByRole("navigation", { name: "Decorations" }).getByRole("button", { name: /Sofa/ })).toBeDisabled();
  await expect(page.getByLabel("Room Tile 0,0")).toBeDisabled();

  await page.getByRole("button", { name: "Exit Living Room to House Overview" }).click();
  await expect(page.getByTestId("house-overview")).toBeVisible();
  await page.getByRole("button", { name: "Enter Bedroom" }).click();
  await expect(page.getByLabel("Family Tree")).toBeVisible();
});

test("Kitchen Oven Workstation sends oven commands and shows pending resident work", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const now = Date.now();
  const ovenTask: ResidentTask = {
    id: "task-oven-start",
    kind: { type: "production_work" },
    started_at_ms: now - 500,
    ready_at_ms: now + 500,
    steps: [
      taskStep({
        reserved_work_target: { type: "oven" },
        work: { type: "start_oven_recipe", job_id: "job-1", recipe_id: "bread" },
        duration_ms: 1_000,
      }),
    ],
  };
  const view = withResidentTaskQueues({
    ...farmView,
    level: 2,
    owned_farmhouse_upgrades: ["oven"],
    inventory: [{ item_id: "wheat", name: "Wheat", quantity: 6, kind: "crop" }],
    oven: {
      id: "oven",
      queue: [{ id: "job-1", recipe_id: "bread", status: "pending_start", started_at_ms: 0, ready_at_ms: 0 }],
    },
  }, {
      man: [],
      woman: [ovenTask],
  });
  await mockFarmApi(page, view, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await enterHouseRoom(page, "Kitchen");
  await expect(page.getByTestId("house-kitchen-oven")).toBeVisible();
  await expect(page.getByTestId("kitchen-oven-status")).toContainText("Starting Bread");
  await expect(page.getByTestId("house-resident-woman")).toBeVisible();
  await expect(page.getByTestId("house-resident-woman")).toHaveAttribute("data-resident-activity", "starting_oven");
  await expect(page.getByTestId("house-resident-woman")).toHaveAttribute("data-resident-prop", "oven_tray");
  await expect(page.getByTestId("house-resident-man")).toHaveCount(0);

  await page.getByRole("button", { name: "Bread", exact: true }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "queue_oven_recipe",
    recipe_id: "bread",
  });

  await expect(page.getByRole("button", { name: /Collect Bread - Starting/ })).toBeDisabled();
});

test("Kitchen Oven Workstation sends collect command for ready output", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const now = Date.now();
  await mockFarmApi(
    page,
    {
      ...farmView,
      level: 2,
      owned_farmhouse_upgrades: ["oven"],
      oven: {
        id: "oven",
        queue: [{ id: "job-ready", recipe_id: "bread", status: "producing", started_at_ms: now - 10_000, ready_at_ms: now - 1_000 }],
      },
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await enterHouseRoom(page, "Kitchen");
  await expect(page.getByTestId("kitchen-oven-status")).toContainText("Ready Bread");
  await page.getByRole("button", { name: "Collect Bread" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({ type: "collect_oven_job" });
});

test("places multiple copies of a selected house Decoration through the command path", async ({
  page,
}) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, { ...farmView, level: 5 }, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");
  await page.getByRole("navigation", { name: "Decorations" }).getByRole("button", { name: /Chair/ }).click();
  await page.getByLabel("Room Tile 0,0").hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText("Fits on Room Tile 0,0");

  await page.getByLabel("Room Tile 0,0").click();
  await page.getByLabel("Room Tile 0,1").click();

  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0].command).toEqual({
    type: "place_decoration",
    room_id: "living_room",
    decoration_id: "chair",
    tile: { x: 0, y: 0 },
  });
  expect(commands[1].command).toEqual({
    type: "place_decoration",
    room_id: "living_room",
    decoration_id: "chair",
    tile: { x: 0, y: 1 },
  });
});

test("house decoration preview blocks overlap and bounds failures before sending commands", async ({
  page,
}) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, { ...farmView, level: 5 }, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");
  const decorations = page.getByRole("navigation", { name: "Decorations" });

  await decorations.getByRole("button", { name: /Chair/ }).click();
  await page.getByRole("button", { name: "Room Tile 1,1", exact: true }).hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: overlaps at Room Tile 1,1",
  );
  await page.getByRole("button", { name: "Room Tile 1,1", exact: true }).click();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: overlaps at Room Tile 1,1",
  );

  await decorations.getByRole("button", { name: /Rug/ }).click();
  await page.getByRole("button", { name: "Room Tile 6,0", exact: true }).hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: out of bounds at Room Tile 6,0",
  );
  await page.getByRole("button", { name: "Room Tile 6,0", exact: true }).click();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: out of bounds at Room Tile 6,0",
  );
  expect(commands).toHaveLength(0);
});

test("selects, moves, rejects invalid moves, and removes existing house Decorations", async ({
  page,
}) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, { ...farmView, level: 5 }, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await enterHouseRoom(page, "Living Room");
  await page.getByLabel("Sofa placement at Room Tile 1,1").click();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Selected Sofa at Room Tile 1,1",
  );

  await page.getByLabel("Room Tile 5,0").hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText("Fits on Room Tile 5,0");
  await page.getByLabel("Room Tile 5,0").click();

  await expect.poll(() => commands.length).toBe(1);
  expect(commands.at(-1)?.command).toEqual({
    type: "move_decoration",
    room_id: "living_room",
    placement_id: "living-room-sofa",
    tile: { x: 5, y: 0 },
  });

  await page.getByLabel("Rug placement at Room Tile 2,3").hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: overlaps at Room Tile 2,3",
  );
  await page.getByLabel("Rug placement at Room Tile 2,3").click();
  expect(commands).toHaveLength(1);

  await page.getByLabel("Room Tile 6,0").hover();
  await expect(page.getByTestId("decoration-placement-status")).toContainText(
    "Blocked: out of bounds at Room Tile 6,0",
  );
  await page.getByLabel("Room Tile 6,0").click();
  expect(commands).toHaveLength(1);

  await page.getByRole("navigation", { name: "Decorations" }).getByRole("button", { name: /Chair/ }).click();
  await page.getByLabel("Plant placement at Room Tile 6,1").click();
  await page.getByRole("button", { name: "Remove Plant" }).click();

  await expect.poll(() => commands.length).toBe(2);
  expect(commands.at(-1)?.command).toEqual({
    type: "remove_decoration",
    room_id: "living_room",
    placement_id: "living-room-plant",
  });
});

test("house decoration changes arrive through farm snapshots for multiple clients", async ({
  browser,
}) => {
  const movedView: FarmView = {
    ...farmView,
    level: 5,
    house_interior: {
      rooms: farmView.house_interior.rooms.map((room) =>
        room.id === "living_room"
          ? {
              ...room,
              decoration_placements: room.decoration_placements.map((placement) =>
                placement.id === "living-room-sofa"
                  ? { ...placement, tile: { x: 5, y: 0 } }
                  : placement,
              ),
            }
          : room,
      ),
    },
  };
  const firstPage = await browser.newPage();
  const secondPage = await browser.newPage();
  try {
    await installMockGameplayWebSocket(firstPage, [{ version: 1, view: { ...farmView, level: 5 }, catalog }]);
    await installMockGameplayWebSocket(secondPage, [{ version: 1, view: { ...farmView, level: 5 }, catalog }]);
    await openFarm(firstPage);
    await openFarm(secondPage);
    await enterHouseRoom(firstPage, "Living Room");
    await enterHouseRoom(secondPage, "Living Room");

    await firstPage.evaluate((view) => {
      (window as unknown as {
        __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
      }).__pushLatestGameplayFarmSnapshot({ version: 2, view });
    }, movedView);
    await secondPage.evaluate((view) => {
      (window as unknown as {
        __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
      }).__pushLatestGameplayFarmSnapshot({ version: 2, view });
    }, movedView);

    await expect(firstPage.getByLabel("Sofa placement at Room Tile 5,0")).toBeVisible();
    await expect(secondPage.getByLabel("Sofa placement at Room Tile 5,0")).toBeVisible();
  } finally {
    await firstPage.close();
    await secondPage.close();
  }
});

test("escape cancels structure placement", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const groundPoint = await findFreeCanvasPoint(page);
  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Feed Mill/ }).click();
  await expect(page.getByText("Place Feed Mill")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(groundPoint.x, groundPoint.y);

  expect(commands).toHaveLength(0);
});

test("built and locked structure cards show reasons without buying", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  const details = page.getByTestId("build-detail-strip");

  await tray.getByRole("button", { name: /Feed Mill/ }).click();
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
  await openFarm(page);

  const tray = await openBuildMenu(page);
  const details = page.getByTestId("build-detail-strip");

  await tray.getByRole("button", { name: /Feed Mill/ }).click();
  await expect(details).toContainText("Need 35 coins");
  expect(commands).toHaveLength(0);
});

test("opens a structure menu from right click without replacing normal selection", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await openFarm(page);

  const feedMillHitTarget = page.getByLabel("Feed Mill structure");
  await feedMillHitTarget.click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Queue 0/2");
  await expect(menu.getByRole("menuitem", { name: "Chicken Feed Need Corn x1" })).toBeDisabled();
  await expect(page.getByText("Need Corn x1")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Cow Feed Unlocks at level 5" })).toBeDisabled();
  await expect(page.getByText("Unlocks at level 5")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();

  await feedMillHitTarget.click();
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Feed Mill - queue 0/2")).toBeVisible();
});

test("machine context menu sends collect and closes after success", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  const now = Date.now();
  await mockFarmApi(
    page,
    {
      ...farmView,
      machines: [
        {
          id: "machine-1",
          kind: "feed_mill",
          tile: { x: 8, y: 2 },
          queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: now - 10_000, ready_at_ms: now - 1_000 }],
        },
      ],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Feed Mill");
  await expect(menu).toContainText("Queue 1/2");
  await menu.getByRole("menuitem", { name: "Collect Chicken Feed" }).click();

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "collect_machine_job",
    machine_id: "machine-1",
  });
  await expect(menu).toBeHidden();
});

test("machine context menu disables collect until ready", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const now = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [{ id: "job-1", recipe_id: "chicken_feed", started_at_ms: now, ready_at_ms: now + 60_000 }],
      },
    ],
  });
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Queue 1/2");
  await expect(menu.getByRole("menuitem", { name: /Collect Chicken Feed \d+s/ })).toBeDisabled();
});

test("machine context menu disables recipes when queue is full", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const now = Date.now();
  await mockFarmApi(page, {
    ...farmView,
    level: 7,
    inventory: [
      { item_id: "wheat", name: "Wheat", quantity: 20, kind: "crop" },
      { item_id: "corn", name: "Corn", quantity: 20, kind: "crop" },
      { item_id: "soybean", name: "Soybean", quantity: 20, kind: "crop" },
    ],
    machines: [
      {
        id: "machine-1",
        kind: "feed_mill",
        tile: { x: 8, y: 2 },
        queue: [
          { id: "job-1", recipe_id: "chicken_feed", started_at_ms: now, ready_at_ms: now + 60_000 },
          { id: "job-2", recipe_id: "cow_feed", started_at_ms: now, ready_at_ms: now + 120_000 },
        ],
      },
    ],
  });
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Queue 2/2");
  await expect(menu.getByRole("menuitem", { name: "Chicken Feed Queue full", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Cow Feed Queue full", exact: true })).toBeDisabled();
});

test("machine context menu sends queue recipe and closes after success", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(
    page,
    {
      ...farmView,
      inventory: [
        { item_id: "wheat", name: "Wheat", quantity: 3, kind: "crop" },
        { item_id: "corn", name: "Corn", quantity: 1, kind: "crop" },
      ],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await menu.getByRole("menuitem", { name: "Chicken Feed", exact: true }).click();

  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "queue_recipe",
    machine_id: "machine-1",
    recipe_id: "chicken_feed",
  });
  await expect(menu).toBeHidden();
});

test("animal shelter context menu shows slot actions and sends enabled commands", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  const now = Date.now();
  await mockFarmApi(
    page,
    {
      ...farmView,
      barn_used: 0,
      barn_capacity: 30,
      inventory: [{ item_id: "chicken_feed", name: "Chicken Feed", quantity: 1, kind: "feed" }],
      shelters: [
        {
          id: "shelter-1",
          kind: "chicken_coop",
          tile: { x: 5, y: 7 },
          animals: [
            { id: "animal-1", state: { type: "idle" } },
            { id: "animal-2", state: { type: "producing", fed_at_ms: now - 5_000, ready_at_ms: now + 55_000 } },
            { id: "animal-3", state: { type: "ready" } },
          ],
        },
      ],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Chicken Coop structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Chicken Coop");
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  await expect(menu.getByRole("menuitem", { name: "Feed Chicken 1" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /Chicken 2 producing Egg \d+s/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Collect Egg from Chicken 3" })).toBeEnabled();

  await menu.getByRole("menuitem", { name: "Feed Chicken 1" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "feed_animal",
    shelter_id: "shelter-1",
    animal_slot: "animal-1",
  });
  await expect(menu).toBeHidden();

  await page.getByLabel("Chicken Coop structure").click({ button: "right" });
  await page
    .getByTestId("structure-context-menu")
    .getByRole("menuitem", { name: "Collect Egg from Chicken 3" })
    .click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "collect_animal_product",
    shelter_id: "shelter-1",
    animal_slot: "animal-3",
  });
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
});

test("animal shelter context menu explains missing feed and full Barn storage", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(
    page,
    {
      ...farmView,
      barn_used: 30,
      barn_capacity: 30,
      inventory: [],
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
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Chicken Coop structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu.getByRole("menuitem", { name: "Feed Chicken 1 Need Chicken Feed x1" })).toBeDisabled();
  await expect(
    menu.getByRole("menuitem", { name: "Collect Egg from Chicken 2 Storage full" }),
  ).toBeDisabled();
  expect(commands).toHaveLength(0);
});

test("opens a structure menu from the visible canvas structure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await openFarm(page);

  const feedMillPoint = await findCanvasSelectionPoint(page, "Feed Mill - queue 0/2");
  await page.mouse.click(feedMillPoint.x, feedMillPoint.y, { button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Feed Mill");
});

test("right mouse drag on a structure opens menu instead of panning canvas", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page);
  await openFarm(page);

  const feedMillPoint = await findCanvasSelectionPoint(page, "Feed Mill - queue 0/2");
  await page.mouse.move(feedMillPoint.x, feedMillPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(feedMillPoint.x + 96, feedMillPoint.y + 64);
  await page.mouse.up({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Feed Mill");
});

test("right mouse drag on free ground pans the canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-drag behavior is covered in desktop.");
  await mockFarmApi(page);
  await openFarm(page);

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
  await openFarm(page);

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
  await openFarm(page);

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  const menu = page.getByTestId("field-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: "Harvest" })).toBeEnabled();
});

test("dragging across ready matching crops sends one sweep harvest command", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockMutableFarmApi(page, () => twoReadyWheatFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const secondFieldPoint = await fieldTargetPoint(page, "plot-2");
  const readyStartPoint = await fieldTargetPoint(page, "plot-1");

  await page.locator(".field-tools").getByRole("button", { name: "Harvest" }).click();
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
  await openFarm(page);

  const wheatPoint = await fieldTargetPoint(page, "plot-1");
  const cornPoint = await fieldTargetPoint(page, "plot-2");

  await page.locator(".field-tools").getByRole("button", { name: "Harvest" }).click();
  await dragHarvestSweep(page, wheatPoint, cornPoint);

  await expect
    .poll(() => commands.find((request) => request.command.type === "sweep_harvest")?.command)
    .toMatchObject({ type: "sweep_harvest", plot_ids: ["plot-1"] });
});

test("right click harvest tool enables sweeping all ready crop kinds", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, readyWheatAndCornFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const wheatPoint = await fieldTargetPoint(page, "plot-1");
  const cornPoint = await fieldTargetPoint(page, "plot-2");
  const harvestTool = page.locator(".field-tools").getByRole("button", { name: "Harvest" });

  await harvestTool.click();
  await harvestTool.click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "All crops" }).click();
  await dragHarvestSweep(page, wheatPoint, cornPoint);

  await expect
    .poll(() => commands.find((request) => request.command.type === "sweep_harvest")?.command)
    .toMatchObject({
      type: "sweep_harvest",
      harvest_mode: "all_crops",
      plot_ids: ["plot-1", "plot-2"],
    });
});

test("dragging the seed tool across empty fields sends one sweep plant command", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const firstFieldPoint = await fieldTargetPoint(page, "plot-1");
  const secondFieldPoint = await fieldTargetPoint(page, "plot-2");

  await selectSeedTool(page, "Wheat");
  await dragHarvestSweep(page, firstFieldPoint, secondFieldPoint);

  await expect.poll(() => {
    const command = commands.find((request) => request.command.type === "sweep_plant")?.command;
    return command?.type === "sweep_plant"
      ? { ...command, plot_ids: [...command.plot_ids].sort() }
      : command;
  }).toMatchObject({ type: "sweep_plant", crop_id: "wheat", plot_ids: ["plot-1", "plot-2"] });
});

test("seed tool plants when pressed before moving over a field", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const firstFieldPoint = await fieldTargetPoint(page, "plot-1");
  const secondFieldPoint = await fieldTargetPoint(page, "plot-2");
  const groundPoint = { x: firstFieldPoint.x + 180, y: firstFieldPoint.y + 120 };

  await selectSeedTool(page, "Wheat");
  await page.mouse.move(groundPoint.x, groundPoint.y);
  await page.mouse.down();
  await page.mouse.move(firstFieldPoint.x, firstFieldPoint.y, { steps: 8 });
  await page.mouse.move(secondFieldPoint.x, secondFieldPoint.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => {
    const command = commands.find((request) => request.command.type === "sweep_plant")?.command;
    return command?.type === "sweep_plant"
      ? { ...command, plot_ids: [...command.plot_ids].sort() }
      : command;
  }).toMatchObject({ type: "sweep_plant", crop_id: "wheat", plot_ids: ["plot-1", "plot-2"] });
});

test("seed tool finishes a lower row sweep on release and shows selected count", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, sixEmptyFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const plot4 = await fieldTargetPoint(page, "plot-4");
  const plot5 = await fieldTargetPoint(page, "plot-5");
  const plot6 = await fieldTargetPoint(page, "plot-6");

  await selectSeedTool(page, "Wheat");
  await page.mouse.move(plot4.x, plot4.y);
  await page.mouse.down();
  await expect(page.getByText("1 field selected for seeding")).toBeVisible();
  await page.mouse.move(plot5.x, plot5.y, { steps: 2 });
  await page.mouse.move(plot6.x, plot6.y, { steps: 2 });
  await expect(page.getByText("3 fields selected for seeding")).toBeVisible();
  await page.mouse.up();

  await expect
    .poll(() => commands.find((request) => request.command.type === "sweep_plant")?.command)
    .toMatchObject({
      type: "sweep_plant",
      crop_id: "wheat",
      plot_ids: ["plot-4", "plot-5", "plot-6"],
    });
});

test("seed tool visually highlights every swept empty field", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  await mockFarmApi(page, sixEmptyFieldView());
  await openFarm(page);

  const plot4 = await fieldTargetPoint(page, "plot-4");
  const plot5 = await fieldTargetPoint(page, "plot-5");
  const plot6 = await fieldTargetPoint(page, "plot-6");

  await selectSeedTool(page, "Wheat");
  const plot5Before = await canvasRegionAtFieldTarget(page, "plot-5");
  const plot6Before = await canvasRegionAtFieldTarget(page, "plot-6");

  await page.mouse.move(plot4.x, plot4.y);
  await page.mouse.down();
  await page.mouse.move(plot5.x, plot5.y, { steps: 2 });
  await page.mouse.move(plot6.x, plot6.y, { steps: 2 });
  await expect(page.getByText("3 fields selected for seeding")).toBeVisible();

  expect(
    canvasRegionDifference(plot5Before, await canvasRegionAtFieldTarget(page, "plot-5")),
  ).toBeGreaterThan(2_000);
  expect(
    canvasRegionDifference(plot6Before, await canvasRegionAtFieldTarget(page, "plot-6")),
  ).toBeGreaterThan(2_000);

  await page.mouse.up();
});

test("right click cancels a pending seed sweep", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, sixEmptyFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const plot4 = await fieldTargetPoint(page, "plot-4");
  const plot5 = await fieldTargetPoint(page, "plot-5");

  await selectSeedTool(page, "Wheat");
  await page.mouse.move(plot4.x, plot4.y);
  await page.mouse.down();
  await page.mouse.move(plot5.x, plot5.y, { steps: 2 });
  await expect(page.getByText("2 fields selected for seeding")).toBeVisible();
  await page.mouse.click(plot5.x, plot5.y, { button: "right" });
  await page.mouse.up();
  await page.waitForTimeout(150);

  await expect(page.getByText("No fields selected for seeding")).toBeHidden();
  expect(commands.find((request) => request.command.type === "sweep_plant")).toBeUndefined();
});

test("accepted seed sweep does not trigger periodic farm polling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const emptyView = sixEmptyFieldView();
  const plantedView = plantedFieldView(emptyView, ["plot-4", "plot-5", "plot-6"]);
  let farmRequests = 0;

  await installMockGameplayWebSocket(
    page,
    [{ version: 0, view: emptyView, catalog }],
    {
      commandResponses: [{ accepted: true, version: 1, events: [], view: plantedView, error: null }],
    },
  );
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({ json: { catalog } });
  });
  await page.route("**/api/farm", async (route) => {
    farmRequests += 1;
    await route.fulfill({ json: { version: 0, view: emptyView } });
  });
  await page.route("**/api/farm/reset", async (route) => {
    await route.fulfill({ json: { version: 0, view: emptyView } });
  });
  await page.route("**/api/commands", async (route) => {
    throw new Error(`Unexpected REST command call: ${route.request().url()}`);
  });

  await openFarm(page);

  const plot4 = await fieldTargetPoint(page, "plot-4");
  const plot5 = await fieldTargetPoint(page, "plot-5");
  const plot6 = await fieldTargetPoint(page, "plot-6");

  await selectSeedTool(page, "Wheat");
  await page.mouse.move(plot4.x, plot4.y);
  await page.mouse.down();
  await page.mouse.move(plot5.x, plot5.y, { steps: 2 });
  await page.mouse.move(plot6.x, plot6.y, { steps: 2 });
  await expect(page.getByText("3 fields selected for seeding")).toBeVisible();
  await page.waitForTimeout(2600);
  await page.mouse.up();

  await expect(page.getByText(/Wheat - \d+s/)).toBeVisible();
  expect(farmRequests).toBe(0);
  await expect(page.getByText(/Wheat - \d+s/)).toBeVisible();
});

test("seed sweep retries once after a version mismatch", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const emptyView = sixEmptyFieldView();
  const plantedView = plantedFieldView(emptyView, ["plot-4", "plot-5", "plot-6"]);
  let commandAttempts = 0;

  await installMockGameplayWebSocket(
    page,
    [{ version: 0, view: emptyView, catalog }],
    {
      messageHandlerName: "__countStaleRetryCommand",
      commandResponses: [
        {
          accepted: false,
          version: 1,
          events: [],
          view: emptyView,
          error: "version mismatch: expected 0, found 1",
        },
        { accepted: true, version: 2, events: [], view: plantedView, error: null },
      ],
    },
  );
  await page.exposeFunction("__countStaleRetryCommand", (message: import("../../../contracts/generated/ts/my-farm").WebsocketClientMessage) => {
    if (message.type === "submit_command") {
      commandAttempts += 1;
    }
    return null;
  });
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({ json: { catalog } });
  });
  await page.route("**/api/farm", async (route) => {
    await route.fulfill({
      json: { version: commandAttempts >= 2 ? 2 : 0, view: commandAttempts >= 2 ? plantedView : emptyView },
    });
  });
  await page.route("**/api/farm/reset", async (route) => {
    await route.fulfill({ json: { version: 0, view: emptyView } });
  });
  await page.route("**/api/commands", async (route) => {
    throw new Error(`Unexpected REST command call: ${route.request().url()}`);
  });

  await openFarm(page);

  const plot4 = await fieldTargetPoint(page, "plot-4");
  const plot5 = await fieldTargetPoint(page, "plot-5");
  const plot6 = await fieldTargetPoint(page, "plot-6");

  await selectSeedTool(page, "Wheat");
  await page.mouse.move(plot4.x, plot4.y);
  await page.mouse.down();
  await page.mouse.move(plot5.x, plot5.y, { steps: 2 });
  await page.mouse.move(plot6.x, plot6.y, { steps: 2 });
  await expect(page.getByText("3 fields selected for seeding")).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => commandAttempts).toBe(2);
  await expect(page.getByText(/Wheat - \d+s/)).toBeVisible();
});

test("default field tool cancels harvest dragging", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop drag behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, twoReadyWheatFieldView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const firstFieldPoint = await fieldTargetPoint(page, "plot-1");
  const secondFieldPoint = await fieldTargetPoint(page, "plot-2");
  const tools = page.locator(".field-tools");

  await tools.getByRole("button", { name: "Harvest" }).click();
  await tools.getByRole("button", { name: "Default" }).click();
  await dragHarvestSweep(page, firstFieldPoint, secondFieldPoint);
  await page.waitForTimeout(150);

  expect(commands.find((request) => request.command.type === "sweep_harvest")).toBeUndefined();
});

test("right mouse drag on a field opens menu instead of panning canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, readyFieldView());
  await openFarm(page);

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.move(fieldPoint.x, fieldPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(fieldPoint.x + 96, fieldPoint.y + 64);
  await page.mouse.up({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByTestId("field-context-menu")).toContainText("Harvest");
});

test("long press on field opens field menu", async ({ page }) => {
  await mockFarmApi(page, readyFieldView());
  await openFarm(page);

  await touchPress(page.getByLabel("Field Plot plot-1"), 560);

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByTestId("field-context-menu")).toContainText("Harvest");
});

test("empty field menu shows plant options", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, farmView);
  await openFarm(page);

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  const menu = page.getByTestId("field-context-menu");
  await expect(menu).toContainText("Field Plot");
  await expect(menu.getByRole("menuitem", { name: "Wheat" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Corn Need Corn" })).toBeDisabled();
});

test("growing field menu shows timer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, growingFieldView());
  await openFarm(page);

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  const menu = page.getByTestId("field-context-menu");
  await expect(menu).toContainText("Wheat");
  await expect(menu.getByRole("menuitem", { name: /Growing \d+s/ })).toBeDisabled();
});

test("ready harvest is disabled when storage is full", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  await mockFarmApi(page, { ...readyFieldView(), silo_used: 40, silo_capacity: 40 });
  await openFarm(page);

  const fieldPoint = await fieldTargetPoint(page, "plot-1");
  await page.mouse.click(fieldPoint.x, fieldPoint.y, { button: "right" });

  await expect(
    page.getByTestId("field-context-menu").getByRole("menuitem", { name: "Harvest Storage full" }),
  ).toBeDisabled();
});

test("supports long press for structures and cancels moved touch presses", async ({ page }) => {
  await mockFarmApi(page);
  await openFarm(page);

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
  await openFarm(page);

  await expect(
    page.locator(".panel-section").filter({ has: page.getByRole("heading", { name: "Delivery Orders" }) }),
  ).toBeHidden();

  await page.getByLabel("Delivery Board structure").click({ button: "right" });
  await page
    .getByTestId("structure-context-menu")
    .getByRole("menuitem", { name: "View delivery orders" })
    .click();

  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Use delivery orders below.")).toBeVisible();
  const orders = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Delivery Orders" }),
  });
  await expect(resourceAmount(orders, "Wheat", "x1")).toBeVisible();
});

test("farmers market buys and sells items through commands", async ({ page }) => {
  const commands: CommandRequest[] = [];
  let currentView: FarmView = {
    ...farmView,
    coins: 20,
    silo_used: 2,
    inventory: [{ item_id: "wheat", name: "Wheat", quantity: 2, kind: "crop" }],
  };
  await mockMutableFarmApi(page, () => currentView, catalog, (request) => {
    commands.push(request);
    if (request.command.type === "buy_market_item") {
      currentView = {
        ...currentView,
        coins: currentView.coins - 4,
        silo_used: currentView.silo_used + 1,
        inventory: [{ item_id: "wheat", name: "Wheat", quantity: 3, kind: "crop" }],
      };
    }
    if (request.command.type === "sell_market_item") {
      currentView = {
        ...currentView,
        coins: currentView.coins + 2,
        silo_used: currentView.silo_used - 1,
        inventory: [{ item_id: "wheat", name: "Wheat", quantity: 2, kind: "crop" }],
      };
    }
  });
  await openFarm(page);

  const marketLauncher = page.locator(".market-launcher");
  await expect(marketLauncher.getByRole("button", { name: "Open Farmers Market" })).toBeVisible();
  await marketLauncher.getByRole("button", { name: "Open Farmers Market" }).click();

  const market = page.getByRole("region", { name: "Farmers Market" });
  await expect(market).toBeVisible();
  await expect(market.getByText("Select a resource, then choose whether to buy or sell.")).toBeVisible();
  await expect(
    page.locator(".panel-section").filter({ has: page.getByRole("heading", { name: "Delivery Orders" }) }),
  ).toBeHidden();

  const wheat = market.getByTestId("market-item-wheat");
  await expect(wheat).toContainText("Wheat");
  await expect(wheat).toContainText("Owned 2");
  await expect(wheat).toContainText("Buy 4 coins");
  await expect(wheat).toContainText("Sell 2 coins");
  await wheat.click();

  const wheatTrade = market.getByTestId("market-trade-wheat");
  await expect(wheatTrade).toContainText("Owned 2");
  await wheatTrade.getByRole("button", { name: "Buy 1 Wheat" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "buy_market_item",
    item_id: "wheat",
    quantity: 1,
  });
  await expect(page.locator(".top-bar").getByText("16 coins")).toBeVisible();
  await expect(wheat).toContainText("Owned 3");
  await expect(wheatTrade).toContainText("Owned 3");

  await wheatTrade.getByRole("button", { name: "Sell" }).click();
  await wheatTrade.getByRole("button", { name: "Sell 1 Wheat" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "sell_market_item",
    item_id: "wheat",
    quantity: 1,
  });
  await expect(page.locator(".top-bar").getByText("18 coins")).toBeVisible();
  await expect(wheat).toContainText("Owned 2");
  await expect(wheatTrade).toContainText("Owned 2");
});

test("filters inventory to the selected structure materials", async ({ page }) => {
  await mockFarmApi(page, {
    ...farmView,
    owned_farmhouse_upgrades: ["oven"],
  });
  await openFarm(page);

  const inventory = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Inventory" }),
  });

  await openFarmhouseSelection(page);
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

test("machine recipes show required resources and disable missing ingredients", async ({ page }) => {
  const commands: CommandRequest[] = [];
  await mockFarmApi(
    page,
    {
      ...farmView,
      level: 5,
      inventory: [
        { item_id: "wheat", name: "Wheat", quantity: 3, kind: "crop" },
        { item_id: "corn", name: "Corn", quantity: 1, kind: "crop" },
      ],
    },
    catalog,
    (request) => {
      commands.push(request);
    },
  );
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click();
  const chickenFeedRecipe = page.getByTestId("recipe-card-chicken_feed");
  const cowFeedRecipe = page.getByTestId("recipe-card-cow_feed");

  await expect(chickenFeedRecipe).toContainText("Wheat");
  await expect(chickenFeedRecipe).toContainText("3/2");
  await expect(chickenFeedRecipe).toContainText("Corn");
  await expect(chickenFeedRecipe).toContainText("1/1");
  await expect(chickenFeedRecipe.getByRole("button", { name: "Make Chicken Feed" })).toBeEnabled();

  await expect(cowFeedRecipe).toContainText("Soybean");
  await expect(cowFeedRecipe).toContainText("0/2");
  await expect(cowFeedRecipe).toContainText("Corn");
  await expect(cowFeedRecipe).toContainText("1/1");
  await expect(cowFeedRecipe).toContainText("Need 2");
  await expect(cowFeedRecipe.getByRole("button", { name: "Make Cow Feed" })).toBeDisabled();

  await chickenFeedRecipe.getByRole("button", { name: "Make Chicken Feed" }).click();

  expect(commands).toHaveLength(1);
  expect(commands[0].command).toEqual({
    type: "queue_recipe",
    machine_id: "machine-1",
    recipe_id: "chicken_feed",
  });
});

test("moves a structure by choosing move and clicking a destination tile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move" }).click();
  await expect(page.getByTestId("structure-context-menu")).toBeHidden();
  await expect(page.getByText("Moving Feed Mill")).toBeVisible();

  const command = await clickGroundTileUntilCommand(page, commands, { x: 3, y: 3 });
  expect(command.command).toMatchObject({
    type: "move_structure",
    target: { type: "machine", id: "machine-1" },
  });
  expect(command.command).toHaveProperty("tile");
});

test("renders, selects, and moves a built Tool Shed without upgrade actions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  const viewWithToolShed: FarmView = {
    ...farmView,
    tool_shed: { id: "tool-shed-1", tile: { x: 12, y: 12 } },
  };
  await mockFarmApi(page, viewWithToolShed, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const toolShed = page.getByLabel("Tool Shed structure");
  await expect(toolShed).toBeVisible();
  await toolShed.click();
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByRole("heading", { name: "Selection" })).toBeVisible();
  await expect(selection.getByText("Tool Shed")).toBeVisible();
  await expect(selection.getByRole("button", { name: /Upgrade/ })).toHaveCount(0);
  await expect(selection.getByText(/route|travel|timing/i)).toHaveCount(0);

  await toolShed.click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu).toContainText("Tool Shed");
  await expect(menu.getByRole("menuitem", { name: "Move" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /Upgrade/ })).toHaveCount(0);

  await menu.getByRole("menuitem", { name: "Move" }).click();
  await expect(page.getByText("Moving Tool Shed")).toBeVisible();
  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByText("Tile is occupied")).toBeVisible();
  expect(commands).toHaveLength(0);

  const command = await clickGroundTileUntilCommand(page, commands, { x: 13, y: 12 });
  expect(command.command).toEqual({
    type: "move_structure",
    target: { type: "tool_shed", id: "tool-shed-1" },
    tile: { x: 13, y: 12 },
  });
});

test("Farm Shop build tray gates placement to a single road-edge shop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop canvas hit geometry is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, buildableFarmView(), catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const tray = await openBuildMenu(page);
  await tray.getByRole("button", { name: /Farm Shop/ }).click();

  await expect(page.getByTestId("build-detail-strip")).toContainText("Farm Shop");
  await expect(page.getByTestId("build-detail-strip")).toContainText("25 coins");
  await expect(page.getByText("Place Farm Shop")).toBeVisible();

  await page.getByLabel("Ground tile 3,3").click({ force: true });
  await expect(page.getByText("Tile is occupied")).toBeVisible();
  expect(commands).toHaveLength(0);

  const command = await clickGroundTileUntilCommand(page, commands, { x: 3, y: 17 });
  expect(command.command).toEqual({
    type: "buy_structure",
    structure_kind: "farm_shop",
    tile: { x: 3, y: 17 },
  });

  commands.length = 0;
  await page.evaluate((view) => {
    (window as unknown as {
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
    }).__pushLatestGameplayFarmSnapshot({
      version: 2,
      view: {
        ...view,
        farm_shop: {
          id: "farm-shop-1",
          tile: { x: 3, y: 17 },
          stock: [],
          stock_capacity: 6,
          next_customer_visit_at_ms: Date.now() + 60_000,
          visit_count: 0,
        },
      },
    });
  }, buildableFarmView());
  await tray.getByRole("button", { name: /Farm Shop/ }).click();
  await expect(page.getByTestId("build-detail-strip")).toContainText("Already built");
});

test("Farm Shop panel stocks, returns, and shows reserved stock reasons", async ({ page }) => {
  const commands: CommandRequest[] = [];
  const view = farmShopView({
    inventory: [
      { item_id: "wheat", name: "Wheat", quantity: 5, available_quantity: 2, reserved_quantity: 3, kind: "crop" },
      { item_id: "corn", name: "Corn", quantity: 1, kind: "crop" },
    ],
    farm_shop: {
      id: "farm-shop-1",
      tile: { x: 3, y: 17 },
      stock: [
        { item_id: "wheat", name: "Wheat", quantity: 3, available_quantity: 2, reserved_quantity: 1, kind: "crop" },
      ],
      stock_capacity: 5,
      next_customer_visit_at_ms: Date.now() + 60_000,
      visit_count: 0,
    },
    reservations: {
      ...farmView.reservations,
      farm_shop_stock: { wheat: 1 },
    },
  });
  await mockFarmApi(page, view, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await page.getByLabel("Farm Shop structure").click();
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });

  await expect(selection.getByText("Shop Stock storage - 3/5 items")).toBeVisible();
  await expect(selection.getByText("Total stock")).toBeVisible();
  await expect(selection.getByText("Reserved stock")).toBeVisible();
  await expect(selection.getByText("Available stock")).toBeVisible();
  await expect(selection.getByText("2 available, 1 reserved")).toBeVisible();

  await selection.getByLabel("Farm Shop quantity").fill("3");
  await expect(selection.getByRole("button", { name: "Stock" })).toBeDisabled();
  await expect(selection.getByText("Need 1 more in storage")).toBeVisible();

  await selection.getByLabel("Farm Shop quantity").fill("2");
  await selection.getByRole("button", { name: "Stock" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "stock_farm_shop",
    item_id: "wheat",
    quantity: 2,
  });

  await selection.getByRole("button", { name: "Return" }).click();
  await expect.poll(() => commands.at(-1)?.command).toEqual({
    type: "unstock_farm_shop",
    item_id: "wheat",
    quantity: 2,
  });

  await selection.getByLabel("Farm Shop quantity").fill("3");
  await expect(selection.getByRole("button", { name: "Return" })).toBeDisabled();
  await expect(selection.getByText("Not enough available Shop Stock")).toBeVisible();
});

test("Farm Shop move and stock controls respect queued work and sale feedback", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  const now = Date.now();
  const view = withResidentTaskQueues(
    farmShopView({
      farm_shop: {
        id: "farm-shop-1",
        tile: { x: 3, y: 17 },
        stock: [{ item_id: "wheat", name: "Wheat", quantity: 3, available_quantity: 3, reserved_quantity: 0, kind: "crop" }],
        stock_capacity: 4,
        next_customer_visit_at_ms: now + 60_000,
        visit_count: 1,
        current_sale: {
          id: "sale-1",
          item_id: "wheat",
          quantity: 1,
          coins_gained: 2,
          sold_at_ms: now - 500,
          visible_until_ms: now + 60_000,
        },
      },
      inventory: [{ item_id: "wheat", name: "Wheat", quantity: 5, kind: "crop" }],
    }),
    {
      woman: [
        task({
          id: "task-stock-shop",
          kind: { type: "shop_work" },
          started_at_ms: now,
          ready_at_ms: now + 2_000,
          steps: [
            taskStep({
              reserved_work_target: { type: "farm_shop", shop_id: "farm-shop-1" },
              work: { type: "deposit_shop_stock", items: [{ item_id: "wheat", quantity: 1 }] },
              duration_ms: 1_000,
              approach_tile: { x: 3, y: 16 },
            }),
          ],
        }),
      ],
    },
  );
  await mockFarmApi(page, view, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  await expect(page.getByTestId("farm-shop-sale-car")).toBeVisible();
  await page.getByLabel("Farm Shop structure").click();
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Sold Wheat for 2 coins")).toBeVisible();
  await selection.getByLabel("Farm Shop quantity").fill("1");
  await expect(selection.getByRole("button", { name: "Stock" })).toBeDisabled();
  await expect(selection.getByText("Projected Shop Stock capacity is full")).toBeVisible();

  await page.getByLabel("Farm Shop structure").click({ button: "right" });
  const menu = page.getByTestId("structure-context-menu");
  await expect(menu.getByRole("menuitem", { name: "Move Reserved for Mara's task" })).toBeDisabled();
  await menu.getByRole("menuitem", { name: "Move Reserved for Mara's task" }).click({ force: true });
  await expect(page.getByText("Moving Farm Shop")).toHaveCount(0);
  expect(commands).toHaveLength(0);
});

test("farmhouse does not expose move and blocks moved structures", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop right-click behavior is covered in desktop.");
  const commands: CommandRequest[] = [];
  await mockFarmApi(page, farmView, catalog, (request) => {
    commands.push(request);
  });
  await openFarm(page);

  const farmHouse = page.getByLabel("Farmhouse structure");
  await farmHouse.click({ button: "right" });

  await expect(page.getByTestId("structure-context-menu")).toContainText("Farmhouse");
  await expect(page.getByRole("menuitem", { name: "Move" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await touchPress(farmHouse, 560);
  await expect(page.getByText(/Moving Farmhouse/)).toHaveCount(0);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move" }).click();
  await expect(page.getByText("Moving Feed Mill")).toBeVisible();
  await farmHouse.click({ force: true });

  await expect(page.getByText("Tile is occupied")).toBeVisible();
  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
  expect(commands).toHaveLength(0);
});

test("shows a footprint preview while moving a structure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop hover behavior is covered in desktop.");
  await mockFarmApi(page);
  await openFarm(page);

  await page.getByLabel("Feed Mill structure").click({ button: "right" });
  await page.getByTestId("structure-context-menu").getByRole("menuitem", { name: "Move" }).click();
  await expect(page.getByText("Moving Feed Mill")).toBeVisible();

  await expectCanvasToChangeAfterGroundHover(page, { x: 3, y: 3 });
});

const catalog: CatalogDocument = {
  balance: { time_scale: 10, max_orders: 3 },
  items: [
    { id: "wheat", name: "Wheat", kind: "crop", unlock_level: 1 },
    { id: "corn", name: "Corn", kind: "crop", unlock_level: 2 },
    { id: "soybean", name: "Soybean", kind: "crop", unlock_level: 3 },
    { id: "carrot", name: "Carrot", kind: "crop", unlock_level: 5 },
    { id: "potato", name: "Potato", kind: "crop", unlock_level: 6 },
    { id: "tomato", name: "Tomato", kind: "crop", unlock_level: 7 },
    { id: "chicken_feed", name: "Chicken Feed", kind: "feed", unlock_level: 3 },
    { id: "cow_feed", name: "Cow Feed", kind: "feed", unlock_level: 5 },
    { id: "egg", name: "Egg", kind: "animal_product", unlock_level: 3 },
    { id: "milk", name: "Milk", kind: "animal_product", unlock_level: 5 },
    { id: "bread", name: "Bread", kind: "product", unlock_level: 2 },
    { id: "corn_bread", name: "Corn Bread", kind: "product", unlock_level: 4 },
    { id: "potato_bread", name: "Potato Bread", kind: "product", unlock_level: 6 },
    { id: "carrot_cake", name: "Carrot Cake", kind: "product", unlock_level: 6 },
    { id: "tomato_tart", name: "Tomato Tart", kind: "product", unlock_level: 7 },
  ],
  crops: [
    { item_id: "wheat", reference_seconds: 120, harvest_quantity: 2, xp: 1, unlock_level: 1 },
    { item_id: "corn", reference_seconds: 300, harvest_quantity: 2, xp: 2, unlock_level: 2 },
    { item_id: "soybean", reference_seconds: 1200, harvest_quantity: 2, xp: 3, unlock_level: 3 },
    { item_id: "carrot", reference_seconds: 600, harvest_quantity: 2, xp: 3, unlock_level: 5 },
    { item_id: "potato", reference_seconds: 1500, harvest_quantity: 2, xp: 4, unlock_level: 6 },
    { item_id: "tomato", reference_seconds: 1800, harvest_quantity: 2, xp: 5, unlock_level: 7 },
  ],
  recipes: [
    {
      id: "bread",
      name: "Bread",
      target: { type: "oven" },
      inputs: [{ item_id: "wheat", quantity: 3 }],
      outputs: [{ item_id: "bread", quantity: 1 }],
      reference_seconds: 300,
      xp: 4,
      unlock_level: 2,
    },
    {
      id: "corn_bread",
      name: "Corn Bread",
      target: { type: "oven" },
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
      id: "potato_bread",
      name: "Potato Bread",
      target: { type: "oven" },
      inputs: [
        { item_id: "wheat", quantity: 2 },
        { item_id: "potato", quantity: 2 },
      ],
      outputs: [{ item_id: "potato_bread", quantity: 1 }],
      reference_seconds: 2100,
      xp: 9,
      unlock_level: 6,
    },
    {
      id: "carrot_cake",
      name: "Carrot Cake",
      target: { type: "oven" },
      inputs: [
        { item_id: "wheat", quantity: 2 },
        { item_id: "carrot", quantity: 2 },
        { item_id: "milk", quantity: 1 },
      ],
      outputs: [{ item_id: "carrot_cake", quantity: 1 }],
      reference_seconds: 2400,
      xp: 10,
      unlock_level: 6,
    },
    {
      id: "tomato_tart",
      name: "Tomato Tart",
      target: { type: "oven" },
      inputs: [
        { item_id: "wheat", quantity: 2 },
        { item_id: "tomato", quantity: 2 },
        { item_id: "egg", quantity: 1 },
      ],
      outputs: [{ item_id: "tomato_tart", quantity: 1 }],
      reference_seconds: 2700,
      xp: 12,
      unlock_level: 7,
    },
    {
      id: "chicken_feed",
      name: "Chicken Feed",
      target: { type: "machine", machine_kind: "feed_mill" },
      inputs: [
        { item_id: "wheat", quantity: 2 },
        { item_id: "corn", quantity: 1 },
      ],
      outputs: [{ item_id: "chicken_feed", quantity: 3 }],
      reference_seconds: 300,
      xp: 2,
      unlock_level: 3,
    },
    {
      id: "cow_feed",
      name: "Cow Feed",
      target: { type: "machine", machine_kind: "feed_mill" },
      inputs: [
        { item_id: "soybean", quantity: 2 },
        { item_id: "corn", quantity: 1 },
      ],
      outputs: [{ item_id: "cow_feed", quantity: 3 }],
      reference_seconds: 600,
      xp: 3,
      unlock_level: 5,
    },
  ],
  machines: [
    { kind: "feed_mill", name: "Feed Mill", build_cost: 35, unlock_level: 3, queue_limit: 2 },
  ],
  farmhouse_upgrades: [
    { kind: "oven", name: "Oven", cost_coins: 40, unlock_level: 2, queue_limit: 2 },
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
  market_items: [
    { item_id: "wheat", buy_price: 4, sell_price: 2, unlock_level: 1 },
    { item_id: "corn", buy_price: 8, sell_price: 4, unlock_level: 2 },
    { item_id: "soybean", buy_price: 14, sell_price: 7, unlock_level: 3 },
    { item_id: "carrot", buy_price: 18, sell_price: 9, unlock_level: 5 },
    { item_id: "potato", buy_price: 24, sell_price: 12, unlock_level: 6 },
    { item_id: "tomato", buy_price: 28, sell_price: 14, unlock_level: 7 },
    { item_id: "chicken_feed", buy_price: 12, sell_price: null, unlock_level: 3 },
    { item_id: "cow_feed", buy_price: 18, sell_price: null, unlock_level: 5 },
    { item_id: "egg", buy_price: null, sell_price: 10, unlock_level: 3 },
    { item_id: "milk", buy_price: null, sell_price: 16, unlock_level: 5 },
    { item_id: "bread", buy_price: null, sell_price: 18, unlock_level: 2 },
    { item_id: "corn_bread", buy_price: null, sell_price: 28, unlock_level: 4 },
    { item_id: "potato_bread", buy_price: null, sell_price: 34, unlock_level: 6 },
    { item_id: "carrot_cake", buy_price: null, sell_price: 42, unlock_level: 6 },
    { item_id: "tomato_tart", buy_price: null, sell_price: 46, unlock_level: 7 },
  ],
  storage_upgrades: [
    { storage_kind: "silo", tier: 1, unlock_level: 2, cost_coins: 60, capacity: 60 },
    { storage_kind: "silo", tier: 2, unlock_level: 4, cost_coins: 120, capacity: 85 },
    { storage_kind: "silo", tier: 3, unlock_level: 6, cost_coins: 220, capacity: 115 },
    { storage_kind: "barn", tier: 1, unlock_level: 2, cost_coins: 50, capacity: 45 },
    { storage_kind: "barn", tier: 2, unlock_level: 4, cost_coins: 100, capacity: 65 },
    { storage_kind: "barn", tier: 3, unlock_level: 6, cost_coins: 180, capacity: 90 },
  ],
  decorations: [
    { id: "bed", name: "Bed", footprint: { width: 3, height: 2 } },
    { id: "table", name: "Table", footprint: { width: 2, height: 2 } },
    { id: "chair", name: "Chair", footprint: { width: 1, height: 1 } },
    { id: "sofa", name: "Sofa", footprint: { width: 3, height: 1 } },
    { id: "rug", name: "Rug", footprint: { width: 3, height: 2 } },
    { id: "plant", name: "Plant", footprint: { width: 1, height: 1 } },
    { id: "cabinet", name: "Cabinet", footprint: { width: 2, height: 1 } },
    { id: "lamp", name: "Lamp", footprint: { width: 1, height: 1 } },
    { id: "kitchen_counter", name: "Kitchen Counter", footprint: { width: 3, height: 1 } },
  ],
  level_xp: [0, 0, 4, 14, 30, 55, 90, 140],
};

const farmView: FarmView = {
  last_update_ms: Date.now(),
  xp: 14,
  level: 3,
  coins: 120,
  silo_used: 2,
  silo_capacity: 40,
  silo_upgrade_tier: 0,
  silo_tile: { x: 14, y: 2 },
  barn_used: 0,
  barn_capacity: 30,
  barn_upgrade_tier: 0,
  barn_tile: { x: 16, y: 2 },
  inventory: [{ item_id: "wheat", name: "Wheat", quantity: 2, kind: "crop" }],
  field_plots: [
    { id: "plot-1", tile: { x: 0, y: 0 }, crop: null },
    { id: "plot-2", tile: { x: 1, y: 0 }, crop: null },
  ],
  machines: [
    { id: "machine-1", kind: "feed_mill", tile: { x: 8, y: 2 }, queue: [] },
  ],
  owned_farmhouse_upgrades: [],
  oven: { id: "oven", queue: [] },
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
  residents: [
    { id: "woman", display_name: "Mara" },
    { id: "man", display_name: "Jon" },
  ],
  selected_resident_id: "woman",
  resident_locations: {
    woman: { x: 8, y: 10 },
    man: { x: 9, y: 10 },
  },
  resident_work: {},
  reservations: {
    field_plots: {},
    machines: {},
    animals: [],
    farm_shop_stock: {},
    path_tiles: [],
  },
  house_interior: {
    rooms: [
      {
        id: "living_room",
        name: "Living Room",
        width: 8,
        height: 6,
        tiles: [],
        decoration_placements: [
          { id: "living-room-sofa", decoration_id: "sofa", tile: { x: 1, y: 1 } },
          { id: "living-room-rug", decoration_id: "rug", tile: { x: 2, y: 3 } },
          { id: "living-room-plant", decoration_id: "plant", tile: { x: 6, y: 1 } },
        ],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        width: 8,
        height: 6,
        tiles: [],
        decoration_placements: [
          { id: "kitchen-counter", decoration_id: "kitchen_counter", tile: { x: 0, y: 0 } },
          { id: "kitchen-table", decoration_id: "table", tile: { x: 3, y: 2 } },
          { id: "kitchen-chair", decoration_id: "chair", tile: { x: 5, y: 2 } },
        ],
      },
      {
        id: "bedroom",
        name: "Bedroom",
        width: 8,
        height: 6,
        tiles: [],
        decoration_placements: [
          { id: "bedroom-bed", decoration_id: "bed", tile: { x: 1, y: 1 } },
          { id: "bedroom-cabinet", decoration_id: "cabinet", tile: { x: 5, y: 0 } },
          { id: "bedroom-lamp", decoration_id: "lamp", tile: { x: 6, y: 2 } },
        ],
      },
    ],
  },
  unlocks: [],
};

function taskStep(
  step: Omit<
    ResidentTask["steps"][number],
    "walk_path" | "walk_duration_ms" | "work_duration_ms"
  > &
    Partial<Pick<ResidentTask["steps"][number], "walk_path" | "walk_duration_ms" | "work_duration_ms">>,
): ResidentTask["steps"][number] {
  return {
    ...step,
    walk_path: step.walk_path ?? [],
    walk_duration_ms: step.walk_duration_ms ?? 0,
    work_duration_ms: step.work_duration_ms ?? step.duration_ms,
  };
}

function task(task: ResidentTask): ResidentTask {
  return task;
}

function farmShopView(overrides: Partial<FarmView>): FarmView {
  return {
    ...farmView,
    level: 3,
    coins: 120,
    farm_shop: {
      id: "farm-shop-1",
      tile: { x: 3, y: 17 },
      stock: [],
      stock_capacity: 6,
      next_customer_visit_at_ms: Date.now() + 60_000,
      visit_count: 0,
      ...overrides.farm_shop,
    },
    ...overrides,
  };
}

function withResidentTaskQueues(
  view: FarmView,
  queues: Record<string, ResidentTask[]>,
): FarmView {
  const residentWork: FarmView["resident_work"] = Object.fromEntries(
    view.residents.map((resident) => {
      const queue = queues[resident.id] ?? [];
      const currentTask = queue[0] ?? null;
      const currentStep = currentTask?.steps[0] ?? null;
      const currentTile = view.resident_locations[resident.id] ?? { x: 8, y: 10 };
      const path = currentStep?.walk_path.length ? [currentTile, ...currentStep.walk_path] : [];
      const target = currentStep ? targetViewForStep(view, currentStep) : undefined;
      const state = currentTask && currentStep
        ? currentStep.walk_path.length > 0 && Date.now() < currentTask.started_at_ms + currentStep.walk_duration_ms
          ? "walking"
          : "working"
        : "idle";
      const work: ResidentWorkView = {
        resident_id: resident.id,
        display_name: resident.display_name,
        selected: resident.id === view.selected_resident_id,
        state,
        current_task: currentTask ? taskSummary(view, currentTask, "current") : undefined,
        queue: queue.map((task, index) => taskSummary(view, task, index === 0 ? "current" : "queued")),
        current_step: currentStep ? stepView(view, currentStep) : undefined,
        target,
        scene: {
          tile: currentStep?.approach_tile ?? target?.tile ?? currentTile,
          path,
          path_state: path.length ? (state === "walking" ? "walking" : "working") : undefined,
          inside_house: currentStep?.reserved_work_target.type === "oven" && state === "working",
        },
        carry: { items: [], tools: [] },
      };
      return [
        resident.id,
        work,
      ];
    }),
  );
  return {
    ...view,
    resident_work: residentWork,
    reservations: reservationsForQueues(view, queues),
  };
}

function taskSummary(view: FarmView, task: ResidentTask, queueState: "current" | "queued" | "blocked") {
  return {
    id: task.id,
    kind: task.kind,
    label: taskLabelForStep(task.steps.find((step) => !isResourceStep(step)) ?? task.steps[0]),
    step_count: task.steps.length,
    steps: task.steps.map((step) => stepView(view, step)),
    queue_state: queueState,
    started_at_ms: task.started_at_ms,
    ready_at_ms: task.ready_at_ms,
  };
}

function stepView(view: FarmView, step: ResidentTask["steps"][number]) {
  const cue = visualCueForStep(step);
  const target = targetViewForStep(view, step);
  const { quantity, kind } = stepQuantityAndKind(step);
  return {
    label: taskLabelForStep(step),
    activity: cue.activity,
    prop: cue.prop,
    target,
    quantity,
    kind,
    walk_duration_ms: step.walk_duration_ms,
    work_duration_ms: step.work_duration_ms,
    duration_ms: step.duration_ms,
  };
}

function stepQuantityAndKind(step: ResidentTask["steps"][number]) {
  const work = step.work;
  if (work.type === "plant_crop") return { quantity: 1, kind: "crop" as const };
  if (work.type === "harvest_crop") return { quantity: work.quantity, kind: "crop" as const };
  if (work.type === "collect_animal_product") return { quantity: work.quantity, kind: "animal_product" as const };
  if (work.type === "feed_animal") return { quantity: 1, kind: "feed" as const };
  if (
    work.type === "pickup_items" ||
    work.type === "deposit_items" ||
    work.type === "pickup_shop_stock" ||
    work.type === "deposit_shop_stock"
  ) {
    return {
      quantity: work.items.reduce((total, item) => total + item.quantity, 0),
      kind: "product" as const,
    };
  }
  if (work.type === "deposit_inventory") return { quantity: work.quantity, kind: "product" as const };
  if (work.type === "pickup_tools" || work.type === "return_tools") {
    return {
      quantity: work.tools.reduce((total, tool) => total + tool.quantity, 0),
      kind: "product" as const,
    };
  }
  return { quantity: 1, kind: "product" as const };
}

function targetViewForStep(view: FarmView, step: ResidentTask["steps"][number]) {
  const target = step.reserved_work_target;
  const tile = step.approach_tile ?? step.walk_path.at(-1) ?? { x: 8, y: 10 };
  if (target.type === "field_plot") {
    return { kind: "field_plot" as const, id: target.plot_id, label: `Field Plot ${target.plot_id}`, tile };
  }
  if (target.type === "machine") {
    return { kind: "machine" as const, id: target.machine_id, label: "Machine", tile };
  }
  if (target.type === "oven") {
    return { kind: "oven" as const, id: view.oven.id, label: "Oven", tile };
  }
  if (target.type === "animal") {
    return { kind: "animal" as const, id: `${target.shelter_id}:${target.animal_slot}`, label: "Animal", tile };
  }
  if (target.type === "farm_shop") {
    return { kind: "farm_shop" as const, id: target.shop_id, label: "Farm Shop", tile };
  }
  if (target.type === "silo") {
    return { kind: "silo" as const, label: "Silo", tile };
  }
  if (target.type === "barn") {
    return { kind: "barn" as const, label: "Barn", tile };
  }
  return { kind: "tool_source" as const, label: "Farmhouse", tile };
}

function reservationsForQueues(view: FarmView, queues: Record<string, ResidentTask[]>): FarmView["reservations"] {
  const reservations: FarmView["reservations"] = {
    field_plots: {},
    machines: {},
    animals: [],
    farm_shop_stock: {},
    path_tiles: [],
  };
  for (const resident of view.residents) {
    for (const task of queues[resident.id] ?? []) {
      const reason = {
        resident_id: resident.id,
        resident_name: resident.display_name,
        task_id: task.id,
        reason: `Reserved for ${resident.display_name}'s task`,
      };
      for (const step of task.steps) {
        const target = step.reserved_work_target;
        if (target.type === "field_plot") {
          reservations.field_plots[target.plot_id] = reason;
        } else if (target.type === "machine") {
          reservations.machines[target.machine_id] = reason;
        } else if (target.type === "oven") {
          reservations.oven = reason;
        } else if (target.type === "animal") {
          reservations.animals.push([{ shelter_id: target.shelter_id, animal_slot: target.animal_slot }, reason]);
        } else if (target.type === "farm_shop" && step.work.type === "pickup_shop_stock") {
          for (const item of step.work.items) {
            reservations.farm_shop_stock[item.item_id] =
              (reservations.farm_shop_stock[item.item_id] ?? 0) + item.quantity;
          }
        }
        for (const tile of step.walk_path) {
          reservations.path_tiles.push({ tile, resident_id: resident.id, task_id: task.id });
        }
      }
    }
  }
  return reservations;
}

function taskLabelForStep(step: ResidentTask["steps"][number] | undefined): string {
  if (!step) {
    return "Idle";
  }
  const work = step.work;
  if (work.type === "plant_crop") return `Plant ${itemLabel(work.crop_id)}`;
  if (work.type === "harvest_crop") return `Harvest ${itemLabel(work.crop_id)}`;
  if (work.type === "collect_machine_job") return `Collect ${recipeLabel(work.recipe_id)}`;
  if (work.type === "start_oven_recipe") return `Start ${recipeLabel(work.recipe_id)}`;
  if (work.type === "collect_oven_job") return `Collect ${recipeLabel(work.recipe_id)}`;
  if (work.type === "collect_animal_product") return `Collect ${itemLabel(work.item_id)}`;
  if (work.type === "feed_animal") return "Feed animal";
  if (work.type === "pickup_items") return "Pick up items";
  if (work.type === "pickup_shop_stock") return "Return shop stock";
  if (work.type === "pickup_tools") return "Pick up tools";
  if (work.type === "deposit_shop_stock") return "Stock Farm Shop";
  if (work.type === "deposit_items" || work.type === "deposit_inventory") return "Store items";
  return "Return tools";
}

function visualCueForStep(step: ResidentTask["steps"][number]) {
  switch (step.work.type) {
    case "plant_crop":
      return { activity: "planting" as const, prop: "seed_pouch" as const };
    case "harvest_crop":
      return { activity: "harvesting" as const, prop: "basket" as const };
    case "collect_machine_job":
      return { activity: "collecting_machine" as const, prop: "crate" as const };
    case "start_oven_recipe":
      return { activity: "starting_oven" as const, prop: "oven_tray" as const };
    case "collect_oven_job":
      return { activity: "collecting_oven" as const, prop: "oven_tray" as const };
    case "feed_animal":
      return { activity: "feeding_animal" as const, prop: "bucket" as const };
    case "collect_animal_product":
      return { activity: "collecting_animal_product" as const, prop: "basket" as const };
    case "pickup_items":
      return { activity: "picking_up_items" as const, prop: "crate" as const };
    case "pickup_tools":
      return { activity: "picking_up_tools" as const, prop: "tool_bundle" as const };
    case "deposit_inventory":
    case "deposit_items":
    case "deposit_shop_stock":
      return { activity: "depositing_inventory" as const, prop: "crate" as const };
    case "pickup_shop_stock":
      return { activity: "picking_up_items" as const, prop: "crate" as const };
    case "return_tools":
      return { activity: "returning_tools" as const, prop: "tool_bundle" as const };
  }
}

function isResourceStep(step: ResidentTask["steps"][number]) {
  return [
    "pickup_items",
    "pickup_tools",
    "pickup_shop_stock",
    "deposit_inventory",
    "deposit_items",
    "deposit_shop_stock",
    "return_tools",
  ].includes(step.work.type);
}

function itemLabel(itemId: string) {
  return itemId.charAt(0).toUpperCase() + itemId.slice(1).replaceAll("_", " ");
}

function recipeLabel(recipeId: string) {
  return recipeId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
  const handlerName = `__mockFarmCommandResponse_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await page.exposeFunction(handlerName, (message: import("../../../contracts/generated/ts/my-farm").WebsocketClientMessage) => {
    if (message.type === "submit_command") {
      onCommand?.({
        expected_version: message.expected_version,
        command: message.command,
      });
      return {
        accepted: true,
        version: message.expected_version + 1,
        view: getView(),
      };
    }
    return null;
  });
  await installMockGameplayWebSocket(
    page,
    [{ version: 1, view: getView(), catalog: customCatalog }],
    {
      messageHandlerName: handlerName,
      resetResponse: { version: 1, view: getView() },
    },
  );
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({ json: { catalog: customCatalog } });
  });
  await page.route("**/api/farm", async (route) => {
    await route.fulfill({ json: { version: 1, view: getView() } });
  });
  await page.route("**/api/farm/reset", async (route) => {
    await route.fulfill({ json: { version: 1, view: getView() } });
  });
  await page.route("**/api/commands", async (route) => {
    onCommand?.(route.request().postDataJSON() as CommandRequest);
    await route.fulfill({ json: { accepted: true, version: 2, events: [], view: getView(), error: null } });
  });
}

async function installMockGameplayWebSocket(
  page: Page,
  bootstraps: Array<{ version: number; view: FarmView; catalog: CatalogDocument; delayMs?: number }>,
  options: {
    messageHandlerName?: string;
    commandResponses?: Array<Partial<import("../../../contracts/generated/ts/my-farm").CommandResponse>>;
    resetResponse?: Partial<import("../../../contracts/generated/ts/my-farm").FarmResponse>;
  } = {},
) {
  await page.addInitScript(({ bootstraps, options }) => {
    type Listener = (event: { data?: string }) => void;
    type Bootstrap = {
      version: number;
      view: FarmView;
      catalog: CatalogDocument;
      delayMs?: number;
    };
    type ClientMessage = import("../../../contracts/generated/ts/my-farm").WebsocketClientMessage;
    type SubmitCommandMessage = Extract<ClientMessage, { type: "submit_command" }>;
    type CommandResponse = Partial<import("../../../contracts/generated/ts/my-farm").CommandResponse>;
    type FarmResponse = Partial<import("../../../contracts/generated/ts/my-farm").FarmResponse>;
    type MockOptions = {
      messageHandlerName?: string;
      commandResponses?: CommandResponse[];
      resetResponse?: FarmResponse;
    };

    const mockOptions = options as MockOptions;
    let responseVersion = bootstraps[0]?.version ?? 0;
    let responseView = bootstraps[0]?.view as FarmView;
    let commandResponseIndex = 0;

    const NativeWebSocket = window.WebSocket;

    class MockGameplayWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url!: string;
      readyState = MockGameplayWebSocket.CONNECTING;
      private listeners = new Map<string, Listener[]>();

      constructor(url: string) {
        if (!url.includes("/api/gameplay")) {
          return new NativeWebSocket(url) as unknown as MockGameplayWebSocket;
        }
        this.url = url;
        const mockWindow = window as unknown as {
          __gameplayWebSocketUrls: string[];
          __gameplayWebSocketInstances: MockGameplayWebSocket[];
        };
        const bootstrapIndex = Math.max(0, mockWindow.__gameplayWebSocketUrls.length - 1);
        mockWindow.__gameplayWebSocketUrls.push(url);
        const socketIndex = mockWindow.__gameplayWebSocketInstances.push(this) - 1;
        const bootstrap = bootstraps[Math.min(bootstrapIndex, bootstraps.length - 1)] as Bootstrap;

        window.setTimeout(() => {
          if (this.readyState !== MockGameplayWebSocket.CONNECTING) {
            return;
          }
          this.readyState = MockGameplayWebSocket.OPEN;
          this.emit("open", {});
          window.setTimeout(() => {
            if (this.readyState !== MockGameplayWebSocket.OPEN) {
              return;
            }
            this.emit("message", { data: JSON.stringify({ type: "catalog", catalog: bootstrap.catalog }) });
            this.emit("message", {
              data: JSON.stringify({
                type: "farm_snapshot",
                version: bootstrap.version,
                view: bootstrap.view,
              }),
            });
          }, bootstrap.delayMs ?? 0);
        }, 0);
      }

      addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }

      removeEventListener(type: string, listener: Listener) {
        this.listeners.set(
          type,
          (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
        );
      }

      close() {
        this.closeFromServer();
      }

      send(payload: string) {
        const message = JSON.parse(payload) as ClientMessage;
        const handler = mockOptions.messageHandlerName
          ? (window as unknown as Record<string, ((message: ClientMessage) => Promise<CommandResponse | null>) | undefined>)[
              mockOptions.messageHandlerName
            ]
          : undefined;
        window.setTimeout(async () => {
          const handlerResponse = (await handler?.(message)) ?? null;
          this.respondToClientMessage(message, handlerResponse);
        }, 0);
      }

      private respondToClientMessage(message: ClientMessage, handlerResponse: CommandResponse | null) {
        if (message.type === "submit_command") {
          const configured =
            mockOptions.commandResponses?.[commandResponseIndex++] ??
            handlerResponse ??
            {};
          responseVersion = configured.version ?? message.expected_version + 1;
          responseView = configured.view ?? responseView;
          const response = {
            type: "command_response",
            request_id: message.request_id,
            accepted: configured.accepted ?? true,
            version: responseVersion,
            events: configured.events ?? [],
            view: responseView,
            error: configured.error ?? null,
          };
          this.emit("message", { data: JSON.stringify(response) });
          if (response.accepted) {
            this.emit("message", {
              data: JSON.stringify({
                type: "farm_snapshot",
                version: response.version,
                view: response.view,
              }),
            });
          }
          return;
        }
        if (message.type === "reset_farm") {
          const configured = mockOptions.resetResponse ?? {};
          responseVersion = configured.version ?? 0;
          responseView = configured.view ?? responseView;
          const response = {
            type: "command_response",
            request_id: message.request_id,
            accepted: true,
            version: responseVersion,
            events: [],
            view: responseView,
            error: null,
          };
          this.emit("message", { data: JSON.stringify(response) });
          this.emit("message", {
            data: JSON.stringify({
              type: "farm_snapshot",
              version: response.version,
              view: response.view,
            }),
          });
        }
      }

      closeFromServer() {
        if (this.readyState === MockGameplayWebSocket.CLOSED) {
          return;
        }
        this.readyState = MockGameplayWebSocket.CLOSED;
        this.emit("close", {});
      }

      emit(type: string, event: { data?: string }) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event);
        }
      }
    }

    const mockWindow = window as unknown as {
      WebSocket: typeof MockGameplayWebSocket;
      __gameplayWebSocketUrls: string[];
      __gameplayWebSocketInstances: MockGameplayWebSocket[];
      __pushGameplayFarmSnapshot: (index: number, snapshot: { version: number; view: FarmView }) => void;
      __pushLatestGameplayFarmSnapshot: (snapshot: { version: number; view: FarmView }) => void;
      __closeGameplayWebSocket: (index: number) => void;
      __closeLatestGameplayWebSocket: () => void;
    };
    mockWindow.__gameplayWebSocketUrls = [];
    mockWindow.__gameplayWebSocketInstances = [];
    mockWindow.__pushGameplayFarmSnapshot = (index, snapshot) => {
      const socket = mockWindow.__gameplayWebSocketInstances[index];
      if (socket?.readyState !== MockGameplayWebSocket.OPEN) {
        return;
      }
      responseVersion = snapshot.version;
      responseView = snapshot.view;
      socket.emit("message", {
        data: JSON.stringify({
          type: "farm_snapshot",
          version: snapshot.version,
          view: snapshot.view,
        }),
      });
    };
    mockWindow.__pushLatestGameplayFarmSnapshot = (snapshot) => {
      mockWindow.__pushGameplayFarmSnapshot(mockWindow.__gameplayWebSocketInstances.length - 1, snapshot);
    };
    mockWindow.__closeGameplayWebSocket = (index: number) => {
      mockWindow.__gameplayWebSocketInstances[index]?.closeFromServer();
    };
    mockWindow.__closeLatestGameplayWebSocket = () => {
      mockWindow.__gameplayWebSocketInstances.at(-1)?.closeFromServer();
    };
    mockWindow.WebSocket = MockGameplayWebSocket;
  }, { bootstraps, options });
}

async function rejectRestGameplay(page: Page) {
  await page.route("**/api/catalog", async (route) => {
    throw new Error(`Unexpected REST catalog call: ${route.request().url()}`);
  });
  await page.route("**/api/farm", async (route) => {
    throw new Error(`Unexpected REST farm call: ${route.request().url()}`);
  });
  await page.route("**/api/farm/reset", async (route) => {
    throw new Error(`Unexpected REST reset call: ${route.request().url()}`);
  });
  await page.route("**/api/commands", async (route) => {
    throw new Error(`Unexpected REST command call: ${route.request().url()}`);
  });
}

async function openFarm(page: Page) {
  await page.goto("/");
  await startFarm(page);
}

async function startFarm(page: Page) {
  await page.getByRole("button", { name: "Start Farm" }).click();
}

async function closeGuidedTutorial(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Guided Tutorial" });
  for (let step = 0; step < 5; step += 1) {
    await dialog.getByRole("button", { name: "Got it" }).click();
  }
  await expect(dialog).toHaveCount(0);
}

async function openBuildMenu(page: Page) {
  const tools = page.locator(".field-tools");
  await tools.getByRole("button", { name: "Build" }).click();
  return page.getByRole("navigation", { name: "Structures" });
}

async function openFarmhouseSelection(page: Page) {
  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByRole("region", { name: "House Interior" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Farm" }).click();
  await expect(page.getByRole("region", { name: "House Interior" })).toHaveCount(0);
}

async function enterHouseRoom(page: Page, roomName: "Living Room" | "Kitchen" | "Bedroom") {
  await page.getByLabel("Farmhouse structure").click({ force: true });
  await expect(page.getByRole("region", { name: "House Interior" })).toBeVisible();
  await expect(page.getByTestId("house-overview")).toBeVisible();
  await page.getByRole("button", { name: `Enter ${roomName}` }).click();
  await expect(page.getByTestId(`house-room-${roomName === "Living Room" ? "living_room" : roomName.toLowerCase()}`)).toBeVisible();
}

async function clickGroundTileUntilCommand(
  page: Page,
  commands: CommandRequest[],
  tile: { x: number; y: number },
) {
  await page.getByLabel(`Ground tile ${tile.x},${tile.y}`).click({ force: true });
  const command = await waitForLatestCommand(commands);
  if (!command) {
    throw new Error(`Clicking ground tile ${tile.x},${tile.y} did not send a command`);
  }
  return command;
}

async function waitForLatestCommand(commands: CommandRequest[]) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60) {
    const command = commands.at(-1);
    if (command) {
      return command;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
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
  const emptySelection = page.getByText("Select a field, machine, shelter, storage, or order board.");
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
  await page.waitForTimeout(120);
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

async function selectSeedTool(page: Page, seedName: string) {
  const tools = page.locator(".field-tools");
  await tools.getByRole("button", { name: "Seed" }).click();
  await tools.getByRole("menuitemradio", { name: new RegExp(seedName) }).click();
}

async function canvasSnapshot(page: Page) {
  return page.locator("canvas").first().evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

type CanvasRegion = {
  width: number;
  height: number;
  data: number[];
};

async function canvasRegionAtFieldTarget(page: Page, plotId: string): Promise<CanvasRegion> {
  const canvas = page.locator("canvas").first();
  const canvasBox = await canvas.boundingBox();
  const targetBox = await page.getByLabel(`Field Plot ${plotId}`).boundingBox();
  if (!canvasBox || !targetBox) {
    throw new Error(`Could not read canvas region for ${plotId}`);
  }
  return canvas.evaluate(
    (element, box) => {
      const canvasElement = element as HTMLCanvasElement;
      const context = canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
      if (!context) {
        throw new Error("Could not read canvas pixels");
      }
      const scaleX = canvasElement.width / box.canvas.width;
      const scaleY = canvasElement.height / box.canvas.height;
      const x = Math.max(0, Math.floor((box.target.x - box.canvas.x) * scaleX));
      const y = Math.max(0, Math.floor((box.target.y - box.canvas.y) * scaleY));
      const width = Math.min(canvasElement.width - x, Math.ceil(box.target.width * scaleX));
      const height = Math.min(canvasElement.height - y, Math.ceil(box.target.height * scaleY));
      const data = new Uint8Array(width * height * 4);
      context.readPixels(
        x,
        canvasElement.height - y - height,
        width,
        height,
        context.RGBA,
        context.UNSIGNED_BYTE,
        data,
      );
      return { width, height, data: Array.from(data) };
    },
    { canvas: canvasBox, target: targetBox },
  );
}

function canvasRegionDifference(left: CanvasRegion, right: CanvasRegion) {
  expect(right.width).toBe(left.width);
  expect(right.height).toBe(left.height);
  return left.data.reduce((total, value, index) => total + Math.abs(value - right.data[index]), 0);
}

async function expectCanvasToChangeAfterGroundHover(page: Page, tile: { x: number; y: number }) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const before = await canvasSnapshot(page);
  await page.getByLabel(`Ground tile ${tile.x},${tile.y}`).hover({ force: true });
  await expect.poll(async () => await canvasSnapshot(page), { timeout: 2_000 }).not.toBe(before);
}

async function expectCanvasToRenderNonBlank(page: Page) {
  await expect
    .poll(async () => (await canvasSnapshot(page)).length, { timeout: 5_000 })
    .toBeGreaterThan(20_000);
}

async function expectFarmHitTargetsFramed(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Page has no viewport size");
  }
  const targets = [
    page.getByLabel("Field Plot plot-1"),
    page.getByLabel("Silo structure"),
    page.getByLabel("Barn structure"),
    page.getByLabel("Feed Mill structure"),
  ];
  const boxes = await Promise.all(
    targets.map(async (target) => {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      if (!box) {
        throw new Error("Farm hit target has no bounding box");
      }
      return box;
    }),
  );

  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  const farmCenter = boxes.reduce(
    (center, box) => ({
      x: center.x + box.x + box.width / 2,
      y: center.y + box.y + box.height / 2,
    }),
    { x: 0, y: 0 },
  );
  farmCenter.x /= boxes.length;
  farmCenter.y /= boxes.length;

  expect(farmCenter.x).toBeGreaterThan(viewport.width * 0.16);
  expect(farmCenter.y).toBeGreaterThan(viewport.height * 0.12);
}

async function expectElementFramed(page: Page, target: Locator) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Page has no viewport size");
  }
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Scene marker has no bounding box");
  }

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function expectHouseInteriorControlsFramedWithoutOverlap(page: Page) {
  const controls = [
    { name: "title", locator: page.locator(".house-interior__title") },
    { name: "back", locator: page.locator(".house-interior__back") },
    { name: "grid", locator: page.locator(".house-interior__grid-toggle") },
    { name: "decoration status", locator: page.getByTestId("decoration-placement-status") },
    { name: "decorations", locator: page.getByRole("navigation", { name: "Decorations" }) },
  ];

  const boxes: Array<{ name: string; box: SearchBox }> = [];
  for (const control of controls) {
    await expectElementFramed(page, control.locator);
    const box = await control.locator.boundingBox();
    if (!box) {
      throw new Error("House Interior control has no bounding box");
    }
    boxes.push({ name: control.name, box });
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(
        boxesOverlap(boxes[leftIndex].box, boxes[rightIndex].box),
        `${boxes[leftIndex].name} overlaps ${boxes[rightIndex].name}`,
      ).toBe(false);
    }
  }
}

async function expectReadableButtons(buttons: Locator) {
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    await expect(button).toBeVisible();
    const metrics = await button.evaluate((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error("Expected button element");
      }
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  }
}

async function elementCenter(target: Locator) {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Element has no bounding box");
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function distanceBetween(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
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
    [".top-bar", ".side-panel", ".build-dock", ".farm-context-menu"].map(async (selector) => {
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

function boxesOverlap(left: SearchBox, right: SearchBox) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
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

function sixEmptyFieldView(): FarmView {
  return {
    ...farmView,
    inventory: [{ item_id: "wheat", name: "Wheat", quantity: 4, kind: "crop" }],
    field_plots: [
      { id: "plot-1", tile: { x: 0, y: 0 }, crop: null },
      { id: "plot-2", tile: { x: 1, y: 0 }, crop: null },
      { id: "plot-3", tile: { x: 2, y: 0 }, crop: null },
      { id: "plot-4", tile: { x: 0, y: 1 }, crop: null },
      { id: "plot-5", tile: { x: 1, y: 1 }, crop: null },
      { id: "plot-6", tile: { x: 2, y: 1 }, crop: null },
    ],
  };
}

function plantedFieldView(view: FarmView, plotIds: string[]): FarmView {
  const plantedIds = new Set(plotIds);
  return {
    ...view,
    inventory: [],
    field_plots: view.field_plots.map((plot) =>
      plantedIds.has(plot.id)
        ? {
            ...plot,
            crop: {
              item_id: "wheat",
              planted_at_ms: Date.now(),
              ready_at_ms: Date.now() + 60_000,
            },
          }
        : plot,
    ),
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
