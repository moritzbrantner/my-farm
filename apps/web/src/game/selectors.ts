import type {
  AnimalShelterState,
  CatalogDocument,
  FarmView,
  FieldPlot,
  MachineState,
  RecipeDef,
  StructureKind,
  Tile,
} from "../types";

export type Selection =
  | { type: "plot"; id: string }
  | { type: "machine"; id: string }
  | { type: "shelter"; id: string }
  | { type: "delivery_board" }
  | null;

export function selectedPlot(view: FarmView, selection: Selection): FieldPlot | null {
  return selection?.type === "plot"
    ? view.field_plots.find((plot) => plot.id === selection.id) ?? null
    : null;
}

export function selectedMachine(view: FarmView, selection: Selection): MachineState | null {
  return selection?.type === "machine"
    ? view.machines.find((machine) => machine.id === selection.id) ?? null
    : null;
}

export function selectedShelter(view: FarmView, selection: Selection): AnimalShelterState | null {
  return selection?.type === "shelter"
    ? view.shelters.find((shelter) => shelter.id === selection.id) ?? null
    : null;
}

export function itemName(catalog: CatalogDocument | null, itemId: string): string {
  return catalog?.items.find((item) => item.id === itemId)?.name ?? itemId;
}

export function recipeName(catalog: CatalogDocument | null, recipeId: string): string {
  return catalog?.recipes.find((recipe) => recipe.id === recipeId)?.name ?? recipeId;
}

export function structureLabel(kind: StructureKind): string {
  switch (kind) {
    case "bakery":
      return "Bakery";
    case "feed_mill":
      return "Feed Mill";
    case "chicken_coop":
      return "Chicken Coop";
    case "cow_pasture":
      return "Cow Pasture";
    case "delivery_board":
      return "Delivery Board";
  }
}

export function structureTile(kind: StructureKind): Tile {
  switch (kind) {
    case "bakery":
      return { x: 8, y: 2 };
    case "feed_mill":
      return { x: 10, y: 3 };
    case "chicken_coop":
      return { x: 5, y: 7 };
    case "cow_pasture":
      return { x: 9, y: 8 };
    case "delivery_board":
      return { x: 2, y: 7 };
  }
}

export function builtStructureKinds(view: FarmView): Set<StructureKind> {
  const built = new Set<StructureKind>();
  for (const machine of view.machines) {
    built.add(machine.kind === "bakery" ? "bakery" : "feed_mill");
  }
  for (const shelter of view.shelters) {
    built.add(shelter.kind === "chicken_coop" ? "chicken_coop" : "cow_pasture");
  }
  if (view.delivery_board_built) {
    built.add("delivery_board");
  }
  return built;
}

export function availableRecipes(
  catalog: CatalogDocument | null,
  machine: MachineState,
  level: number,
): RecipeDef[] {
  return (
    catalog?.recipes.filter(
      (recipe) => recipe.machine_kind === machine.kind && recipe.unlock_level <= level,
    ) ?? []
  );
}

export function secondsRemaining(readyAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((readyAtMs - nowMs) / 1000));
}

