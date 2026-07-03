import { itemName, recipeName } from "./selectors";
import type {
  CatalogDocument,
  FarmResident,
  FarmView,
  ResidentTask,
  ReservedWorkTarget,
} from "../types";

export type ResidentTaskStatus = {
  currentTask: ResidentTask | null;
  queuedCount: number;
  progress: number;
  label: string;
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
    progress: currentTask ? progressBetween(currentTask.started_at_ms, currentTask.ready_at_ms, nowMs) : 0,
    label: currentTask ? taskLabel(catalog, currentTask) : "Idle",
  };
}

export function reservedFieldReason(view: FarmView, plotId: string): string | null {
  return reservedTargetReason(view, { type: "field_plot", plot_id: plotId });
}

export function reservedMachineReason(view: FarmView, machineId: string): string | null {
  return reservedTargetReason(view, { type: "machine", machine_id: machineId });
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
  return (
    left.type === "animal" &&
    right.type === "animal" &&
    left.shelter_id === right.shelter_id &&
    left.animal_slot === right.animal_slot
  );
}

function taskLabel(catalog: CatalogDocument, task: ResidentTask) {
  const firstWork = task.steps[0]?.work;
  if (!firstWork) {
    return task.kind.type === "field_work" ? "Field work" : "Production work";
  }
  switch (firstWork.type) {
    case "plant_crop":
      return `Plant ${itemName(catalog, firstWork.crop_id)}`;
    case "harvest_crop":
      return `Harvest ${itemName(catalog, firstWork.crop_id)}`;
    case "collect_machine_job":
      return `Collect ${recipeName(catalog, firstWork.recipe_id)}`;
    case "feed_animal":
      return "Feed animal";
    case "collect_animal_product":
      return `Collect ${itemName(catalog, firstWork.item_id)}`;
  }
}

function progressBetween(startMs: number, readyAtMs: number, nowMs: number) {
  const duration = readyAtMs - startMs;
  if (duration <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, (nowMs - startMs) / duration));
}
