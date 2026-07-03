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
  await expect(page.getByText("Farmers Market")).toHaveCount(0);
  await page.locator(".field-tools").getByRole("button", { name: "Build" }).click();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Field Plot/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Bakery/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Structures" }).getByRole("button", { name: /Feed Mill/ })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test("pages demo persists a bakery production save in localStorage", async ({ page }) => {
  await page.goto("/");
  await seedBreadSave(page);
  await page.reload();

  await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
  await page.getByRole("button", { name: "Start Farm" }).click();

  await expect(page.getByText(/Level 2/)).toBeVisible();
  await expect(page.getByText("Bread")).toBeVisible();
  await expect(page.getByLabel("Bakery structure")).toBeVisible();

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
      ) as { accepted: boolean; error: string | null; version: number; view: { machines: Array<{ id: string; kind: string }> } };
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
    const buildResponse = send({ type: "buy_structure", structure_kind: "bakery", tile: { x: 8, y: 2 } }, 65_000);
    const bakeryId = buildResponse.view.machines.find((machine) => machine.kind === "bakery")?.id;
    if (!bakeryId) {
      throw new Error("bakery was not built");
    }
    send({ type: "queue_recipe", machine_id: bakeryId, recipe_id: "bread" }, 65_000);
    send({ type: "collect_machine_job", machine_id: bakeryId }, 100_000);
    tick(110_000);
    window.localStorage.setItem(key, runtime.save_json());
  }, demoSaveKey);
}
