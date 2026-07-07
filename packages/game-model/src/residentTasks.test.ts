/// <reference types="bun-types/test" />

import { expect, test } from "bun:test";
import type { FarmView, ResidentTask } from "@my-farm/contracts";
import { selectedResident } from "./selectors";
import {
  currentResidentScenePath,
  currentResidentScenePose,
  hasActiveResidentWalk,
  interpolatePath,
  isResidentInsideHouse,
  residentVisualCue,
} from "./residentTasks";

test("interpolates resident walking along stored path", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 3_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [
          { x: 9, y: 10 },
          { x: 10, y: 10 },
        ],
        walk_duration_ms: 1_000,
        work_duration_ms: 1_000,
        duration_ms: 2_000,
      },
    ],
  });

  expect(currentResidentScenePose(view, "woman", 1_500)).toEqual({
    tile: { x: 9, y: 10 },
    label: "Field Plot plot-1",
    state: "walking",
  });
});

test("resident works at approach tile after walking finishes", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 3_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [{ x: 10, y: 10 }],
        walk_duration_ms: 500,
        work_duration_ms: 1_500,
        duration_ms: 2_000,
      },
    ],
  });

  expect(currentResidentScenePose(view, "woman", 1_750)).toEqual({
    tile: { x: 10, y: 10 },
    label: "Field Plot plot-1",
    state: "working",
  });
});

test("idle resident renders from authoritative resident location", () => {
  const view = farmViewWithTask(null);

  expect(currentResidentScenePose(view, "woman", 1_000)).toEqual({
    tile: { x: 8, y: 10 },
    label: "Farmhouse",
    state: "idle",
  });
});

test("idle man renders from his authoritative resident location", () => {
  const view = {
    ...farmViewWithTask(null),
    resident_locations: {
      woman: { x: 8, y: 10 },
      man: { x: 2, y: 4 },
    },
  };

  expect(currentResidentScenePose(view, "man", 1_000)).toEqual({
    tile: { x: 2, y: 4 },
    label: "Farmhouse",
    state: "idle",
  });
});

test("path interpolation clamps to endpoints", () => {
  const path = [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ];

  expect(interpolatePath({ x: 0, y: 0 }, path, -1)).toEqual({ x: 0, y: 0 });
  expect(interpolatePath({ x: 0, y: 0 }, path, 1.5)).toEqual({ x: 2, y: 0 });
});

test("detects active resident walking while a path step is in progress", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [{ x: 10, y: 10 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(hasActiveResidentWalk(view, 1_500)).toBe(true);
});

test("does not report active resident walking after the walk phase ends", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [{ x: 10, y: 10 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(hasActiveResidentWalk(view, 2_000)).toBe(false);
});

test("does not report active resident walking for legacy steps without paths", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        walk_path: [],
        walk_duration_ms: 0,
        work_duration_ms: 3_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(hasActiveResidentWalk(view, 1_500)).toBe(false);
});

test("does not report active resident walking while residents are idle", () => {
  expect(hasActiveResidentWalk(farmViewWithTask(null), 1_500)).toBe(false);
});

test("keeps oven resident outside while walking to the Farmhouse", () => {
  const view = farmViewWithTask({
    id: "task-oven",
    kind: { type: "production_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "oven" },
        work: { type: "start_oven_recipe", job_id: "job-1", recipe_id: "bread" },
        approach_tile: { x: 8, y: 9 },
        walk_path: [{ x: 8, y: 9 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(isResidentInsideHouse(view, "woman", 1_500)).toBe(false);
});

test("treats oven resident as inside the Farmhouse after entry", () => {
  const view = farmViewWithTask({
    id: "task-oven",
    kind: { type: "production_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "oven" },
        work: { type: "start_oven_recipe", job_id: "job-1", recipe_id: "bread" },
        approach_tile: { x: 8, y: 9 },
        walk_path: [{ x: 8, y: 9 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(isResidentInsideHouse(view, "woman", 2_000)).toBe(true);
  expect(residentVisualCue(view, "woman", 2_000)).toEqual({
    activity: "starting_oven",
    prop: "oven_tray",
  });
});

test("selected resident lookup returns selected resident", () => {
  const view = farmViewWithTask(null);

  expect(selectedResident(view, { type: "resident", id: "man" })).toEqual({
    id: "man",
    display_name: "Man",
  });
  expect(selectedResident(view, { type: "resident", id: "missing" })).toBeNull();
  expect(selectedResident(view, { type: "plot", id: "plot-1" })).toBeNull();
});

test("returns visible scene path for a resident current step", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [
          { x: 9, y: 10 },
          { x: 10, y: 10 },
        ],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(currentResidentScenePath(view, "woman", 1_500)).toEqual({
    residentId: "woman",
    tiles: [
      { x: 8, y: 10 },
      { x: 9, y: 10 },
      { x: 10, y: 10 },
    ],
    state: "walking",
  });
});

test("keeps current step path visible during work phase", () => {
  const view = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [{ x: 10, y: 10 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(currentResidentScenePath(view, "woman", 2_000)?.state).toBe("working");
});

test("does not return scene path for idle residents or empty walk paths", () => {
  expect(currentResidentScenePath(farmViewWithTask(null), "woman", 1_500)).toBeNull();
  expect(
    currentResidentScenePath(
      farmViewWithTask({
        id: "task-1",
        kind: { type: "field_work" },
        started_at_ms: 1_000,
        ready_at_ms: 4_000,
        steps: [
          {
            reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
            work: { type: "plant_crop", crop_id: "wheat" },
            walk_path: [],
            walk_duration_ms: 0,
            work_duration_ms: 3_000,
            duration_ms: 3_000,
          },
        ],
      }),
      "woman",
      1_500,
    ),
  ).toBeNull();
});

test("maps resident current task work to a visual activity and prop", () => {
  const cases: Array<{
    work: ResidentTask["steps"][number]["work"];
    activity: ReturnType<typeof residentVisualCue>["activity"];
    prop: ReturnType<typeof residentVisualCue>["prop"];
  }> = [
    { work: { type: "pickup_items", source: { type: "silo" }, items: [{ item_id: "wheat", quantity: 1 }] }, activity: "picking_up_items", prop: "crate" },
    { work: { type: "pickup_tools", source: { type: "farmhouse" }, tools: [{ tool_kind: "hoe", quantity: 1 }] }, activity: "picking_up_tools", prop: "tool_bundle" },
    { work: { type: "plant_crop", crop_id: "wheat" }, activity: "planting", prop: "seed_pouch" },
    { work: { type: "harvest_crop", crop_id: "wheat", quantity: 2 }, activity: "harvesting", prop: "basket" },
    { work: { type: "collect_machine_job", job_id: "job-1", recipe_id: "chicken_feed" }, activity: "collecting_machine", prop: "crate" },
    { work: { type: "start_oven_recipe", job_id: "job-1", recipe_id: "bread" }, activity: "starting_oven", prop: "oven_tray" },
    { work: { type: "collect_oven_job", job_id: "job-1", recipe_id: "bread" }, activity: "collecting_oven", prop: "oven_tray" },
    { work: { type: "feed_animal" }, activity: "feeding_animal", prop: "bucket" },
    { work: { type: "collect_animal_product", item_id: "egg", quantity: 1 }, activity: "collecting_animal_product", prop: "basket" },
    { work: { type: "deposit_inventory", item_id: "wheat", quantity: 1 }, activity: "depositing_inventory", prop: "crate" },
    { work: { type: "deposit_items", destination: { type: "silo" }, items: [{ item_id: "wheat", quantity: 1 }] }, activity: "depositing_inventory", prop: "crate" },
    { work: { type: "return_tools", source: { type: "farmhouse" }, tools: [{ tool_kind: "hoe", quantity: 1 }] }, activity: "returning_tools", prop: "tool_bundle" },
  ];

  for (const { work, activity, prop } of cases) {
    const view = farmViewWithTask({
      id: `task-${work.type}`,
      kind: { type: "production_work" },
      started_at_ms: 1_000,
      ready_at_ms: 3_000,
      steps: [
        {
          reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
          work,
          approach_tile: { x: 10, y: 10 },
          walk_path: [],
          walk_duration_ms: 0,
          work_duration_ms: 2_000,
          duration_ms: 2_000,
        },
      ],
    });

    expect(residentVisualCue(view, "woman", 1_500)).toEqual({ activity, prop });
  }
});

test("uses idle and walking visual cues from authoritative scene state", () => {
  expect(residentVisualCue(farmViewWithTask(null), "woman", 1_500)).toEqual({
    activity: "idle",
    prop: "none",
  });

  const walkingView = farmViewWithTask({
    id: "task-1",
    kind: { type: "field_work" },
    started_at_ms: 1_000,
    ready_at_ms: 4_000,
    steps: [
      {
        reserved_work_target: { type: "field_plot", plot_id: "plot-1" },
        work: { type: "plant_crop", crop_id: "wheat" },
        approach_tile: { x: 10, y: 10 },
        walk_path: [{ x: 10, y: 10 }],
        walk_duration_ms: 1_000,
        work_duration_ms: 2_000,
        duration_ms: 3_000,
      },
    ],
  });

  expect(residentVisualCue(walkingView, "woman", 1_500)).toEqual({
    activity: "walking",
    prop: "none",
  });
});

function farmViewWithTask(task: ResidentTask | null): FarmView {
  const residentLocations = {
    woman: { x: 8, y: 10 },
    man: { x: 9, y: 10 },
  };
  const currentStep = task?.steps[0] ?? null;
  const target = currentStep ? targetViewForStep(currentStep) : undefined;
  const path = currentStep?.walk_path.length
    ? [residentLocations.woman, ...currentStep.walk_path]
    : [];
  return {
    last_update_ms: 0,
    xp: 0,
    level: 1,
    coins: 0,
    silo_used: 0,
    silo_capacity: 40,
    silo_upgrade_tier: 0,
    silo_tile: { x: 14, y: 2 },
    barn_used: 0,
    barn_capacity: 30,
    barn_upgrade_tier: 0,
    barn_tile: { x: 16, y: 2 },
    inventory: [],
    field_plots: [{ id: "plot-1", tile: { x: 10, y: 10 }, crop: null }],
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
    resident_locations: residentLocations,
    resident_work: {
      woman: {
        resident_id: "woman",
        display_name: "Woman",
        selected: true,
        state: task ? "working" : "idle",
        current_task: task
          ? {
              id: task.id,
              kind: task.kind,
              label: currentStep ? taskLabelForStep(currentStep) : "Field work",
              step_count: task.steps.length,
              steps: task.steps.map(stepView),
              queue_state: "current",
              started_at_ms: task.started_at_ms,
              ready_at_ms: task.ready_at_ms,
            }
          : undefined,
        queue: task
          ? [{
              id: task.id,
              kind: task.kind,
              label: currentStep ? taskLabelForStep(currentStep) : "Field work",
              step_count: task.steps.length,
              steps: task.steps.map(stepView),
              queue_state: "current",
              started_at_ms: task.started_at_ms,
              ready_at_ms: task.ready_at_ms,
            }]
          : [],
        current_step: currentStep
          ? {
              label: taskLabelForStep(currentStep),
              ...visualCueForStep(currentStep),
              target,
              ...stepQuantityAndKind(currentStep),
              walk_duration_ms: currentStep.walk_duration_ms,
              work_duration_ms: currentStep.work_duration_ms,
              duration_ms: currentStep.duration_ms,
            }
          : undefined,
        target,
        scene: {
          tile: currentStep?.approach_tile ?? target?.tile ?? residentLocations.woman,
          path,
          path_state: path.length ? "working" : undefined,
          inside_house: currentStep?.reserved_work_target.type === "oven",
        },
        carry: { items: [], tools: [] },
      },
      man: {
        resident_id: "man",
        display_name: "Man",
        selected: false,
        state: "idle",
        queue: [],
        scene: { tile: residentLocations.man, path: [], inside_house: false },
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
  };
}

function targetViewForStep(step: ResidentTask["steps"][number]) {
  const tile = step.approach_tile ?? step.walk_path.at(-1) ?? { x: 8, y: 10 };
  const target = step.reserved_work_target;
  if (target.type === "field_plot") {
    return { kind: "field_plot" as const, id: target.plot_id, label: `Field Plot ${target.plot_id}`, tile };
  }
  if (target.type === "oven") {
    return { kind: "oven" as const, id: "oven", label: "Oven", tile };
  }
  if (target.type === "farm_shop") {
    return { kind: "farm_shop" as const, id: target.shop_id, label: "Farm Shop", tile };
  }
  return { kind: "work" as const, label: "Work target", tile };
}

function stepView(step: ResidentTask["steps"][number]) {
  return {
    label: taskLabelForStep(step),
    ...visualCueForStep(step),
    target: targetViewForStep(step),
    ...stepQuantityAndKind(step),
    walk_duration_ms: step.walk_duration_ms,
    work_duration_ms: step.work_duration_ms,
    duration_ms: step.duration_ms,
  };
}

function stepQuantityAndKind(step: ResidentTask["steps"][number]) {
  const work = step.work;
  if (work.type === "plant_crop") return { quantity: 1, kind: "crop" as const };
  if (work.type === "harvest_crop") return { quantity: work.quantity, kind: "crop" as const };
  if (work.type === "start_oven_recipe" || work.type === "collect_oven_job") {
    return { quantity: 1, kind: "product" as const };
  }
  if (work.type === "deposit_shop_stock" || work.type === "pickup_shop_stock") {
    return { quantity: work.items.reduce((sum, item) => sum + item.quantity, 0), kind: "product" as const };
  }
  return { quantity: 0, kind: "product" as const };
}

function taskLabelForStep(step: ResidentTask["steps"][number]) {
  const work = step.work;
  if (work.type === "plant_crop") return `Plant ${itemLabel(work.crop_id)}`;
  if (work.type === "harvest_crop") return `Harvest ${itemLabel(work.crop_id)}`;
  if (work.type === "start_oven_recipe") return "Start Bread";
  if (work.type === "collect_oven_job") return "Collect Bread";
  return "Resident task";
}

function visualCueForStep(step: ResidentTask["steps"][number]) {
  switch (step.work.type) {
    case "pickup_items":
      return { activity: "picking_up_items" as const, prop: "crate" as const };
    case "pickup_tools":
      return { activity: "picking_up_tools" as const, prop: "tool_bundle" as const };
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

function itemLabel(itemId: string) {
  return itemId.charAt(0).toUpperCase() + itemId.slice(1).replaceAll("_", " ");
}
