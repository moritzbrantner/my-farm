import { itemName, recipeName } from "./selectors";
import type {
  CatalogDocument,
  FarmResident,
  FarmView,
  ResidentTask,
  ReservedWorkTarget,
} from "../types";
import { structureFootprint } from "./selectors";

export type ResidentTaskStatus = {
  currentTask: ResidentTask | null;
  queuedCount: number;
  progress: number;
  label: string;
};

export type ResidentSceneTarget = {
  tile: { x: number; y: number };
  label: string;
};

export type ResidentSceneState = "idle" | "walking" | "working";

export type ResidentScenePose = {
  tile: { x: number; y: number };
  label: string;
  state: ResidentSceneState;
};

export type ResidentScenePath = {
  residentId: string;
  tiles: Array<{ x: number; y: number }>;
  state: Exclude<ResidentSceneState, "idle">;
};

export function residentTaskStatus(
  catalog: CatalogDocument,
  view: FarmView,
  residentId: string,
  nowMs: number,
): ResidentTaskStatus {
  const queue = view.resident_task_queues[residentId] ?? [];
  const currentTask = queue[0] ?? null;
  return {
    currentTask,
    queuedCount: queue.length,
    progress: currentTask ? residentTaskProgress(currentTask, nowMs) : 0,
    label: currentTask ? taskLabel(catalog, currentTask) : "Idle",
  };
}

export function currentResidentSceneTarget(view: FarmView, residentId: string): ResidentSceneTarget | null {
  const currentTask = view.resident_task_queues[residentId]?.[0] ?? null;
  const currentStep = currentTask?.steps[0] ?? null;
  if (!currentStep) {
    return null;
  }
  const target = sceneTargetForReservedWorkTarget(view, currentStep.reserved_work_target);
  const approachTile = currentStep.approach_tile;
  return approachTile && target ? { ...target, tile: approachTile } : target;
}

export function currentResidentScenePose(
  view: FarmView,
  residentId: string,
  nowMs: number,
): ResidentScenePose {
  const currentTile = view.resident_locations[residentId] ?? { x: 8, y: 10 };
  const currentTask = view.resident_task_queues[residentId]?.[0] ?? null;
  const currentStep = currentTask?.steps[0] ?? null;
  if (!currentTask || !currentStep) {
    return {
      tile: currentTile,
      label: "farmhouse",
      state: "idle",
    };
  }

  const target = currentResidentSceneTarget(view, residentId);
  const approachTile = currentStep.approach_tile ?? currentStep.walk_path.at(-1) ?? target?.tile ?? currentTile;
  const walkEndsAtMs = currentTask.started_at_ms + currentStep.walk_duration_ms;
  if (currentStep.walk_path.length > 0 && nowMs < walkEndsAtMs) {
    return {
      tile: interpolatePath(
        currentTile,
        currentStep.walk_path,
        progressBetween(currentTask.started_at_ms, walkEndsAtMs, nowMs),
      ),
      label: target?.label ?? "work",
      state: "walking",
    };
  }

  return {
    tile: approachTile,
    label: target?.label ?? "work",
    state: "working",
  };
}

export function hasActiveResidentWalk(view: FarmView, nowMs: number): boolean {
  return view.residents.slice(0, 2).some((resident) => {
    const currentTask = view.resident_task_queues[resident.id]?.[0] ?? null;
    const currentStep = currentTask?.steps[0] ?? null;
    if (!currentTask || !currentStep || currentStep.walk_path.length === 0) {
      return false;
    }
    const walkEndsAtMs = currentTask.started_at_ms + currentStep.walk_duration_ms;
    return nowMs < walkEndsAtMs && nowMs < currentTask.ready_at_ms;
  });
}

export function currentResidentScenePath(
  view: FarmView,
  residentId: string,
  nowMs = Date.now(),
): ResidentScenePath | null {
  const currentTile = view.resident_locations[residentId] ?? { x: 8, y: 10 };
  const currentTask = view.resident_task_queues[residentId]?.[0] ?? null;
  const currentStep = currentTask?.steps[0] ?? null;
  if (!currentTask || !currentStep || currentStep.walk_path.length === 0) {
    return null;
  }
  const walkEndsAtMs = currentTask.started_at_ms + currentStep.walk_duration_ms;
  return {
    residentId,
    tiles: [currentTile, ...currentStep.walk_path],
    state: nowMs < walkEndsAtMs ? "walking" : "working",
  };
}

export function residentTaskProgress(task: ResidentTask, nowMs: number) {
  return progressBetween(task.started_at_ms, task.ready_at_ms, nowMs);
}

export function reservedFieldReason(view: FarmView, plotId: string): string | null {
  return reservedTargetReason(view, { type: "field_plot", plot_id: plotId });
}

export function reservedMachineReason(view: FarmView, machineId: string): string | null {
  return reservedTargetReason(view, { type: "machine", machine_id: machineId });
}

export function reservedOvenReason(view: FarmView): string | null {
  return reservedTargetReason(view, { type: "oven" });
}

export function reservedAnimalReason(view: FarmView, shelterId: string, animalSlot: string): string | null {
  return reservedTargetReason(view, { type: "animal", shelter_id: shelterId, animal_slot: animalSlot });
}

export function reservedTargetReason(view: FarmView, target: ReservedWorkTarget): string | null {
  const reservation = findReservation(view, target);
  if (!reservation) {
    return null;
  }
  return `Reserved for ${reservation.resident.display_name}'s task`;
}

function findReservation(view: FarmView, target: ReservedWorkTarget) {
  for (const resident of view.residents) {
    for (const task of view.resident_task_queues[resident.id] ?? []) {
      if (task.steps.some((step) => sameReservedTarget(step.reserved_work_target, target))) {
        return { resident, task };
      }
    }
  }
  return null as { resident: FarmResident; task: ResidentTask } | null;
}

function sceneTargetForReservedWorkTarget(
  view: FarmView,
  target: ReservedWorkTarget,
): ResidentSceneTarget | null {
  if (target.type === "field_plot") {
    const plot = view.field_plots.find((entry) => entry.id === target.plot_id);
    return plot ? { tile: plot.tile, label: `field:${plot.id}` } : null;
  }
  if (target.type === "silo") {
    return {
      tile: footprintCenter(view.silo_tile, structureFootprint("silo")),
      label: "silo",
    };
  }
  if (target.type === "barn") {
    return {
      tile: footprintCenter(view.barn_tile, structureFootprint("barn")),
      label: "barn",
    };
  }
  if (target.type === "tool_source") {
    if (view.tool_shed) {
      return {
        tile: view.tool_shed.tile,
        label: "tool_shed",
      };
    }
    return {
      tile: { x: 8.5, y: 8.5 },
      label: "farmhouse",
    };
  }
  if (target.type === "machine") {
    const machine = view.machines.find((entry) => entry.id === target.machine_id);
    if (!machine) {
      return null;
    }
    return {
      tile: footprintCenter(machine.tile, structureFootprint(machine.kind)),
      label: `machine:${machine.id}`,
    };
  }
  if (target.type === "oven") {
    return {
      tile: { x: 8.5, y: 8.5 },
      label: "oven",
    };
  }
  const shelter = view.shelters.find((entry) => entry.id === target.shelter_id);
  if (!shelter) {
    return null;
  }
  const center = footprintCenter(shelter.tile, structureFootprint(shelter.kind));
  const slotIndex = shelter.animals.findIndex((animal) => animal.id === target.animal_slot);
  const slotOffset = slotIndex >= 0 ? (slotIndex - (shelter.animals.length - 1) / 2) * 0.32 : 0;
  return {
    tile: { x: center.x + slotOffset, y: center.y + 0.18 },
    label: `animal:${shelter.id}:${target.animal_slot}`,
  };
}

function footprintCenter(tile: { x: number; y: number }, footprint: { width: number; height: number }) {
  return {
    x: tile.x + (footprint.width - 1) / 2,
    y: tile.y + (footprint.height - 1) / 2,
  };
}

function sameReservedTarget(left: ReservedWorkTarget, right: ReservedWorkTarget) {
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === "field_plot" && right.type === "field_plot") {
    return left.plot_id === right.plot_id;
  }
  if (left.type === "machine" && right.type === "machine") {
    return left.machine_id === right.machine_id;
  }
  if (left.type === "oven" && right.type === "oven") {
    return true;
  }
  if (
    (left.type === "silo" && right.type === "silo") ||
    (left.type === "barn" && right.type === "barn") ||
    (left.type === "tool_source" && right.type === "tool_source")
  ) {
    return true;
  }
  return (
    left.type === "animal" &&
    right.type === "animal" &&
    left.shelter_id === right.shelter_id &&
    left.animal_slot === right.animal_slot
  );
}

export function taskLabel(catalog: CatalogDocument, task: ResidentTask) {
  const firstWork = task.steps[0]?.work;
  if (!firstWork) {
    return task.kind.type === "field_work" ? "Field work" : "Production work";
  }
  return residentTaskStepLabel(catalog, firstWork);
}

export function residentTaskStepLabel(
  catalog: CatalogDocument,
  work: ResidentTask["steps"][number]["work"],
) {
  switch (work.type) {
    case "plant_crop":
      return `Plant ${itemName(catalog, work.crop_id)}`;
    case "harvest_crop":
      return `Harvest ${itemName(catalog, work.crop_id)}`;
    case "collect_machine_job":
      return `Collect ${recipeName(catalog, work.recipe_id)}`;
    case "start_oven_recipe":
      return `Start ${recipeName(catalog, work.recipe_id)}`;
    case "collect_oven_job":
      return `Collect ${recipeName(catalog, work.recipe_id)}`;
    case "feed_animal":
      return "Feed animal";
    case "collect_animal_product":
      return `Collect ${itemName(catalog, work.item_id)}`;
    case "deposit_inventory":
      return `Store ${itemName(catalog, work.item_id)}`;
    case "return_tools":
      return "Return tools";
  }
}

function progressBetween(startMs: number, readyAtMs: number, nowMs: number) {
  const duration = readyAtMs - startMs;
  if (duration <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, (nowMs - startMs) / duration));
}

export function interpolatePath(
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  progress: number,
) {
  if (path.length === 0) {
    return start;
  }
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped >= 1) {
    return path[path.length - 1];
  }
  const scaled = clamped * path.length;
  const segmentIndex = Math.min(path.length - 1, Math.floor(scaled));
  const segmentProgress = scaled - segmentIndex;
  const from = segmentIndex === 0 ? start : path[segmentIndex - 1];
  const to = path[segmentIndex];
  return {
    x: from.x + (to.x - from.x) * segmentProgress,
    y: from.y + (to.y - from.y) * segmentProgress,
  };
}
