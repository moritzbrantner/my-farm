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
  await expect(page.evaluate((key) => window.localStorage.getItem(key), demoSaveKey)).resolves.toContain(
    '"version":0',
  );
});

async function seedBreadSave(page: Page) {
  await page.evaluate(async (key) => {
    type WasmRuntime = {
      command_json(requestJson: string, nowMs: number): string;
      save_json(): string;
    };
    type WasmModule = {
      default(): Promise<unknown>;
      DemoFarmRuntime: new (savedJson: string | undefined, nowMs: number) => WasmRuntime;
    };

    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as WasmModule;
    await wasm.default();
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    const send = (expectedVersion: number, command: unknown, nowMs: number) => {
      const response = JSON.parse(
        runtime.command_json(JSON.stringify({ expected_version: expectedVersion, command }), nowMs),
      ) as { accepted: boolean; error: string | null };
      if (!response.accepted) {
        throw new Error(response.error ?? "command rejected");
      }
    };

    send(
      0,
      {
        type: "sweep_plant",
        crop_id: "wheat",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      1_000,
    );
    send(
      1,
      {
        type: "sweep_harvest",
        plot_ids: ["plot-1", "plot-2", "plot-3", "plot-4"],
      },
      14_000,
    );
    send(2, { type: "buy_structure", structure_kind: "bakery", tile: { x: 8, y: 2 } }, 14_000);
    send(3, { type: "queue_recipe", machine_id: "machine-1", recipe_id: "bread" }, 14_000);
    send(4, { type: "collect_machine_job", machine_id: "machine-1" }, 45_000);
    window.localStorage.setItem(key, runtime.save_json());
  }, demoSaveKey);
}
