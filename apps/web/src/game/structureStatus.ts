import type {
  AnimalShelterState,
  CatalogDocument,
  FarmView,
  ItemKind,
  ItemStack,
  MachineState,
} from "../types";

export type StructureProductionStatus =
  | { type: "idle" }
  | {
      type: "producing";
      progress: number;
      outputItemId: string;
      outputItemKind?: ItemKind;
    }
  | {
      type: "ready";
      outputItemId: string;
      outputItemKind?: ItemKind;
      blockedByStorage: boolean;
    };

export function machineProductionStatus(
  catalog: CatalogDocument,
  view: FarmView,
  machine: MachineState,
  nowMs: number,
): StructureProductionStatus {
  const firstJob = machine.queue[0];
  if (!firstJob) {
    return { type: "idle" };
  }

  const recipe = catalog.recipes.find((entry) => entry.id === firstJob.recipe_id);
  const output = recipe?.outputs[0];
  if (!output) {
    return { type: "idle" };
  }

  const outputItemKind = itemKind(catalog, output.item_id);
  if (nowMs >= firstJob.ready_at_ms) {
    return {
      type: "ready",
      outputItemId: output.item_id,
      outputItemKind,
      blockedByStorage: !hasStorageRoom(catalog, view, recipe.outputs),
    };
  }

  return {
    type: "producing",
    progress: progressBetween(firstJob.started_at_ms, firstJob.ready_at_ms, nowMs),
    outputItemId: output.item_id,
    outputItemKind,
  };
}

export function shelterProductionStatus(
  catalog: CatalogDocument,
  view: FarmView,
  shelter: AnimalShelterState,
  nowMs: number,
): StructureProductionStatus {
  const shelterDef = catalog.shelters.find((entry) => entry.kind === shelter.kind);
  if (!shelterDef) {
    return { type: "idle" };
  }

  const output = { item_id: shelterDef.product_item_id, quantity: 1 };
  const outputItemKind = itemKind(catalog, output.item_id);
  const readyAnimal = shelter.animals.find((animal) => animal.state.type === "ready");
  if (readyAnimal) {
    return {
      type: "ready",
      outputItemId: output.item_id,
      outputItemKind,
      blockedByStorage: !hasStorageRoom(catalog, view, [output]),
    };
  }

  const producingAnimals = shelter.animals
    .map((animal) => (animal.state.type === "producing" ? animal.state : null))
    .filter((state): state is Extract<(typeof shelter.animals)[number]["state"], { type: "producing" }> => state !== null)
    .sort((left, right) => left.ready_at_ms - right.ready_at_ms);
  const nextProducingAnimal = producingAnimals[0];
  if (!nextProducingAnimal) {
    return { type: "idle" };
  }

  return {
    type: "producing",
    progress: progressBetween(nextProducingAnimal.fed_at_ms, nextProducingAnimal.ready_at_ms, nowMs),
    outputItemId: output.item_id,
    outputItemKind,
  };
}

export function productionStatusLabel(
  structureName: string,
  catalog: CatalogDocument,
  status: StructureProductionStatus,
): string | null {
  if (status.type === "idle") {
    return null;
  }
  const outputName = itemName(catalog, status.outputItemId);
  if (status.type === "producing") {
    return `${structureName} status: Producing ${outputName}`;
  }
  return `${structureName} status: Ready ${outputName}${status.blockedByStorage ? ", storage full" : ""}`;
}

function progressBetween(startMs: number, readyAtMs: number, nowMs: number) {
  const duration = readyAtMs - startMs;
  if (duration <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, (nowMs - startMs) / duration));
}

function hasStorageRoom(catalog: CatalogDocument, view: FarmView, stacks: ItemStack[]) {
  const cropAdd = stacks
    .filter((stack) => itemKind(catalog, stack.item_id) === "crop")
    .reduce((total, stack) => total + stack.quantity, 0);
  const barnAdd = stacks
    .filter((stack) => itemKind(catalog, stack.item_id) !== "crop")
    .reduce((total, stack) => total + stack.quantity, 0);
  return view.silo_used + cropAdd <= view.silo_capacity && view.barn_used + barnAdd <= view.barn_capacity;
}

function itemKind(catalog: CatalogDocument, itemId: string) {
  return catalog.items.find((item) => item.id === itemId)?.kind;
}

function itemName(catalog: CatalogDocument, itemId: string) {
  return catalog.items.find((item) => item.id === itemId)?.name ?? itemId;
}
