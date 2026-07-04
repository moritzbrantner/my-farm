import type {
  FarmView,
  ReservationReasonView,
  ResidentPathState,
  ResidentTaskSummaryView,
  ResidentVisualActivity,
  ResidentVisualProp,
  ResidentWorkView,
} from "../types";

export type { ResidentVisualActivity, ResidentVisualProp };

export type ResidentTaskStatus = {
  currentTask: ResidentTaskSummaryView | null;
  queuedCount: number;
  progress: number;
  label: string;
};

export type ResidentSceneState = "idle" | "walking" | "working" | "blocked";

export type ResidentScenePose = {
  tile: { x: number; y: number };
  label: string;
  state: ResidentSceneState;
};

export type ResidentScenePath = {
  residentId: string;
  tiles: Array<{ x: number; y: number }>;
  state: ResidentPathState;
};

export type ResidentVisualCue = {
  activity: ResidentVisualActivity;
  prop: ResidentVisualProp;
};

export function residentWork(view: FarmView, residentId: string): ResidentWorkView | null {
  return view.resident_work[residentId] ?? null;
}

export function residentTaskStatus(
  _catalog: unknown,
  view: FarmView,
  residentId: string,
  nowMs: number,
): ResidentTaskStatus {
  const work = residentWork(view, residentId);
  const currentTask = work?.current_task ?? null;
  return {
    currentTask,
    queuedCount: work?.queue.length ?? 0,
    progress: currentTask ? progressBetween(currentTask.started_at_ms, currentTask.ready_at_ms, nowMs) : 0,
    label: currentTask?.label ?? "Idle",
  };
}

export function residentVisualCue(
  view: FarmView,
  residentId: string,
  nowMs: number,
): ResidentVisualCue {
  const pose = currentResidentScenePose(view, residentId, nowMs);
  if (pose.state === "idle") {
    return { activity: "idle", prop: "none" };
  }
  if (pose.state === "walking") {
    return { activity: "walking", prop: "none" };
  }
  const step = residentWork(view, residentId)?.current_step;
  return step ? { activity: step.activity, prop: step.prop } : { activity: "idle", prop: "none" };
}

export function currentResidentScenePose(
  view: FarmView,
  residentId: string,
  nowMs: number,
): ResidentScenePose {
  const work = residentWork(view, residentId);
  const currentTile = view.resident_locations[residentId] ?? { x: 8, y: 10 };
  if (!work || !work.current_task || !work.current_step) {
    return { tile: currentTile, label: "Farmhouse", state: "idle" };
  }

  if (work.state === "blocked") {
    return {
      tile: work.scene.tile,
      label: work.target?.label ?? "Blocked task",
      state: "blocked",
    };
  }

  const walkEndsAtMs = work.current_task.started_at_ms + work.current_step.walk_duration_ms;
  if (work.scene.path.length > 1 && nowMs < walkEndsAtMs) {
    const [start, ...path] = work.scene.path;
    return {
      tile: interpolatePath(start, path, progressBetween(work.current_task.started_at_ms, walkEndsAtMs, nowMs)),
      label: work.target?.label ?? "Work target",
      state: "walking",
    };
  }

  return {
    tile: work.scene.tile,
    label: work.target?.label ?? "Work target",
    state: "working",
  };
}

export function isResidentInsideHouse(view: FarmView, residentId: string, nowMs: number): boolean {
  const work = residentWork(view, residentId);
  if (!work?.scene.inside_house) {
    return false;
  }
  return currentResidentScenePose(view, residentId, nowMs).state !== "walking";
}

export function hasActiveResidentWalk(view: FarmView, nowMs: number): boolean {
  return view.residents.slice(0, 2).some((resident) => {
    const work = residentWork(view, resident.id);
    if (!work?.current_task || !work.current_step || work.scene.path.length <= 1) {
      return false;
    }
    const walkEndsAtMs = work.current_task.started_at_ms + work.current_step.walk_duration_ms;
    return nowMs < walkEndsAtMs && nowMs < work.current_task.ready_at_ms;
  });
}

export function currentResidentScenePath(
  view: FarmView,
  residentId: string,
  nowMs = Date.now(),
): ResidentScenePath | null {
  const work = residentWork(view, residentId);
  if (!work?.current_task || !work.current_step || work.scene.path.length <= 1) {
    return null;
  }
  const walkEndsAtMs = work.current_task.started_at_ms + work.current_step.walk_duration_ms;
  return {
    residentId,
    tiles: work.scene.path,
    state: nowMs < walkEndsAtMs ? "walking" : "working",
  };
}

export function reservedFieldReason(view: FarmView, plotId: string): string | null {
  return reservationReason(view.reservations.field_plots[plotId]);
}

export function reservedMachineReason(view: FarmView, machineId: string): string | null {
  return reservationReason(view.reservations.machines[machineId]);
}

export function reservedOvenReason(view: FarmView): string | null {
  return reservationReason(view.reservations.oven);
}

export function reservedAnimalReason(view: FarmView, shelterId: string, animalSlot: string): string | null {
  const reservation = view.reservations.animals.find(
    ([key]) => key.shelter_id === shelterId && key.animal_slot === animalSlot,
  )?.[1];
  return reservationReason(reservation);
}

export function taskLabel(_catalog: unknown, task: ResidentTaskSummaryView) {
  return task.label;
}

export function residentTaskStepLabel(_catalog: unknown, step: { label: string }) {
  return step.label;
}

function reservationReason(reservation: ReservationReasonView | null | undefined) {
  return reservation?.reason ?? null;
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
