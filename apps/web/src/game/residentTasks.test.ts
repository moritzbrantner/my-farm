/// <reference types="bun-types/test" />

import { expect, test } from "bun:test";
import type { FarmView, ResidentTask } from "../types";
import { currentResidentScenePose, hasActiveResidentWalk, interpolatePath } from "./residentTasks";

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
    label: "field:plot-1",
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
    label: "field:plot-1",
    state: "working",
  });
});

test("idle resident renders from authoritative resident location", () => {
  const view = farmViewWithTask(null);

  expect(currentResidentScenePose(view, "woman", 1_000)).toEqual({
    tile: { x: 8, y: 10 },
    label: "farmhouse",
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
    label: "farmhouse",
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

function farmViewWithTask(task: ResidentTask | null): FarmView {
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
    resident_locations: {
      woman: { x: 8, y: 10 },
      man: { x: 9, y: 10 },
    },
    resident_task_queues: {
      woman: task ? [task] : [],
      man: [],
    },
    house_interior: { rooms: [] },
    unlocks: [],
  };
}
