import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const saveKey = "my-farm.demo.save.v1";
const evidencePath = path.resolve("wheat-evidence");

type DemoRuntime = {
  command_json(request: string, nowMs: number): string;
  farm_json(nowMs: number): string;
  save_json(): string;
};
type DemoModule = {
  default(): Promise<unknown>;
  DemoFarmRuntime: new (save: string | undefined, nowMs: number) => DemoRuntime;
};
declare global {
  interface Window {
    __myFarmWasmModule?: DemoModule;
  }
}

async function loadWasm(page: Page) {
  await page.evaluate(async () => {
    const existing = window.__myFarmWasmModule;
    if (existing) return;
    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as DemoModule;
    await wasm.default();
    window.__myFarmWasmModule = wasm;
  });
}

// Create the crop through the actual WASM command and resident work queue; only
// fixture timestamps are adjusted afterwards to exercise each render selection.
async function seedPlantedWheat(page: Page) {
  await page.goto("/");
  await loadWasm(page);
  await page.evaluate((key) => {
    const wasm = window.__myFarmWasmModule!;
    const runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    const response = JSON.parse(runtime.command_json(JSON.stringify({
      expected_version: 0,
      command: { type: "sweep_plant", crop_id: "wheat", plot_ids: ["plot-1"] },
    }), 1_000)) as { accepted: boolean; error: string | null };
    if (!response.accepted) throw new Error(response.error ?? "Wheat planting rejected");
    runtime.farm_json(1_000_000);
    const save = JSON.parse(runtime.save_json());
    const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
    if (!plot?.crop || plot.crop.item_id !== "wheat") throw new Error("Resident did not plant Wheat");
    const now = Date.now();
    plot.crop.planted_at_ms = now - 1_000;
    plot.crop.ready_at_ms = now + 300_000;
    save.farm.last_update_ms = now;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, saveKey);
}

async function changeWheatProgress(page: Page, fraction: number) {
  await page.evaluate(({ key, fraction }) => {
    const save = JSON.parse(window.localStorage.getItem(key)!);
    const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
    if (!plot?.crop) throw new Error("Expected saved Wheat crop");
    const now = Date.now();
    plot.crop.planted_at_ms = now - Math.round(100_000 * fraction);
    plot.crop.ready_at_ms = now + Math.round(100_000 * (1 - fraction));
    save.farm.last_update_ms = now;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, { key: saveKey, fraction });
}

async function startSavedFarm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Farm" }).click();
  await expect(page.getByLabel("Field Plot plot-1")).toBeVisible();
}

async function screenshot(page: Page, file: string) {
  await mkdir(evidencePath, { recursive: true });
  await page.screenshot({ path: path.join(evidencePath, file), animations: "disabled" });
}

async function waitForGeneratedWheat(page: Page, name: string) {
  await expect.poll(async () => page.evaluate((filename) =>
    performance.getEntriesByType("resource").some((entry) => entry.name.endsWith(filename)),
  name), { timeout: 15_000 }).toBe(true);
}

test("published asset-tooling Wheat and soil are actual pinned web resources", async ({ request }) => {
  const manifest = await request.get("/farm-art/manifest.json");
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.assetToolingCommit).toBe("3e436886f8b8039c1b1034f221166f86c97f5c86");
  for (const [name, metadata] of Object.entries(data.files) as Array<[string, { byteLength: number }]>) {
    const response = await request.get(`/farm-art/${name}`);
    expect(response.ok(), name).toBe(true);
    const bytes = await response.body();
    expect(bytes.length, name).toBe(metadata.byteLength);
    if (name.endsWith(".glb")) {
      expect(bytes.subarray(0, 4).toString("ascii"), name).toBe("glTF");
    } else {
      expect(bytes.subarray(0, 8).toString("hex"), name).toBe("89504e470d0a1a0a");
    }
  }
});

test("Wheat appearance follows planted Crop state through progress, harvest and reload", async ({ page }) => {
  test.setTimeout(90_000);
  await seedPlantedWheat(page);
  await startSavedFarm(page);
  const field = page.getByLabel("Field Plot plot-1");
  await expect(field).toHaveAttribute("data-wheat-appearance", "early");
  await waitForGeneratedWheat(page, "wheat-early.glb");
  await screenshot(page, "01-desktop-early.png");

  await changeWheatProgress(page, 0.7);
  await startSavedFarm(page);
  await expect(field).toHaveAttribute("data-wheat-appearance", "mature");
  await waitForGeneratedWheat(page, "wheat-mature-straw.glb");
  await screenshot(page, "02-desktop-mature.png");

  await changeWheatProgress(page, 1.1);
  await startSavedFarm(page);
  await expect(field).toHaveAttribute("data-wheat-appearance", "ready");
  await expect(page.locator(".resource-icon--wheat img").first())
    .toHaveAttribute("src", /farm-art\/wheat-mature-straw\.png$/);
  await screenshot(page, "03-desktop-ready.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await startSavedFarm(page);
  await expect(field).toHaveAttribute("data-wheat-appearance", "ready");
  await screenshot(page, "04-mobile-ready.png");

  await page.setViewportSize({ width: 1280, height: 800 });
  await startSavedFarm(page);
  await field.click({ force: true });
  const selection = page.locator(".panel-section").filter({
    has: page.getByRole("heading", { name: "Selection" }),
  });
  await expect(selection.getByText("Wheat - ready")).toBeVisible();
  await selection.getByRole("button", { name: "Harvest" }).click();
  await expect(page.getByText("Command accepted")).toBeVisible();
  // A confirmed queued Task does not imply the Crop has already been harvested.
  await expect(field).toHaveAttribute("data-wheat-appearance", "ready");

  await page.evaluate((key) => {
    const wasm = window.__myFarmWasmModule!;
    const now = Date.now();
    const runtime = new wasm.DemoFarmRuntime(window.localStorage.getItem(key) ?? undefined, now);
    const before = JSON.parse(runtime.save_json()).farm.inventory.wheat;
    runtime.farm_json(now + 1_000_000);
    const save = JSON.parse(runtime.save_json());
    const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
    if (plot?.crop) throw new Error("Resident harvest did not complete");
    if (!(save.farm.inventory.wheat > before)) throw new Error("Wheat was not deposited in the Silo");
    window.localStorage.setItem(key, JSON.stringify(save));
  }, saveKey);
  await startSavedFarm(page);
  await expect(field).toHaveAttribute("data-wheat-appearance", "none");
  await screenshot(page, "05-desktop-harvested.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await startSavedFarm(page);
  await expect(field).toHaveAttribute("data-wheat-appearance", "none");
  await screenshot(page, "06-mobile-harvested.png");
});
