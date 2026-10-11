import type { PlantedCrop } from "@my-farm/contracts";

// This is a view-only selection: it cannot advance a crop or authorize harvest.
export type WheatAppearance = "early" | "mature" | "ready";

export function wheatAppearanceForCrop(crop: PlantedCrop | null, nowMs: number): WheatAppearance | null {
  if (!crop || crop.item_id !== "wheat") {
    return null;
  }
  if (nowMs >= crop.ready_at_ms) {
    return "ready";
  }
  const duration = crop.ready_at_ms - crop.planted_at_ms;
  if (duration <= 0) {
    return "ready";
  }
  return (nowMs - crop.planted_at_ms) / duration >= 0.55 ? "mature" : "early";
}
