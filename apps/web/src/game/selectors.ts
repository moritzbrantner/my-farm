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
  | { type: "silo" }
  | { type: "barn" }
  | { type: "machine"; id: string }
  | { type: "shelter"; id: string }
  | { type: "delivery_board" }
  | null;

export type StructureSelection =
  | { type: "silo" }
  | { type: "barn" }
  | { type: "machine"; id: string }
  | { type: "shelter"; id: string }
  | { type: "delivery_board" };

export type StructureContextMenuState = {
  target: StructureSelection;
  x: number;
  y: number;
} | null;

export type FieldContextMenuState = {
  plotId: string;
  x: number;
  y: number;
} | null;

export type StructureFootprint = {
  width: number;
  height: number;
};

export const FARM_GRID_SIZE = 18;
export const FARM_HOUSE_TILE: Tile = { x: 8, y: 8 };
export const FARM_HOUSE_FOOTPRINT: StructureFootprint = { width: 2, height: 2 };

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
    case "silo":
      return "Silo";
    case "barn":
      return "Barn";
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
    case "silo":
      return { x: 14, y: 2 };
    case "barn":
      return { x: 16, y: 2 };
    case "bakery":
      return { x: 8, y: 2 };
    case "feed_mill":
      return { x: 10, y: 3 };
    case "chicken_coop":
      return { x: 5, y: 7 };
    case "cow_pasture":
      return { x: 11, y: 8 };
    case "delivery_board":
      return { x: 2, y: 7 };
  }
}

export function structureFootprint(kind: StructureKind): StructureFootprint {
  switch (kind) {
    case "silo":
    case "barn":
      return { width: 2, height: 2 };
    case "bakery":
      return { width: 2, height: 2 };
    case "chicken_coop":
      return { width: 2, height: 3 };
    case "cow_pasture":
      return { width: 3, height: 3 };
    case "feed_mill":
    case "delivery_board":
      return { width: 1, height: 1 };
  }
}

export function selectedStructureLabel(view: FarmView, selection: StructureSelection): string {
  if (selection.type === "silo") {
    return "Silo";
  }
  if (selection.type === "barn") {
    return "Barn";
  }
  if (selection.type === "machine") {
    const machine = view.machines.find((entry) => entry.id === selection.id);
    return machine ? structureLabel(machine.kind) : "Structure";
  }
  if (selection.type === "shelter") {
    const shelter = view.shelters.find((entry) => entry.id === selection.id);
    return shelter ? structureLabel(shelter.kind) : "Structure";
  }
  return "Delivery Board";
}

export function selectedStructureKind(view: FarmView, selection: StructureSelection): StructureKind | null {
  if (selection.type === "silo") {
    return "silo";
  }
  if (selection.type === "barn") {
    return "barn";
  }
  if (selection.type === "machine") {
    return view.machines.find((entry) => entry.id === selection.id)?.kind ?? null;
  }
  if (selection.type === "shelter") {
    return view.shelters.find((entry) => entry.id === selection.id)?.kind ?? null;
  }
  return view.delivery_board_built ? "delivery_board" : null;
}

export function structureFootprintForSelection(
  view: FarmView,
  selection: StructureSelection,
): StructureFootprint {
  const kind = selectedStructureKind(view, selection);
  return kind ? structureFootprint(kind) : { width: 1, height: 1 };
}

export function selectedStructureTile(view: FarmView, selection: StructureSelection): Tile | null {
  if (selection.type === "silo") {
    return view.silo_tile;
  }
  if (selection.type === "barn") {
    return view.barn_tile;
  }
  if (selection.type === "machine") {
    return view.machines.find((entry) => entry.id === selection.id)?.tile ?? null;
  }
  if (selection.type === "shelter") {
    return view.shelters.find((entry) => entry.id === selection.id)?.tile ?? null;
  }
  return view.delivery_board_built ? view.delivery_board_tile : null;
}

export function isTileAvailableForStructure(
  view: FarmView,
  tile: Tile,
  moving: StructureSelection | null,
): boolean {
  const footprint = moving ? structureFootprintForSelection(view, moving) : { width: 1, height: 1 };
  return isTileAvailableForFootprint(view, tile, footprint, moving);
}

export function isTileAvailableForNewStructure(
  view: FarmView,
  tile: Tile,
  kind: StructureKind,
): boolean {
  return isTileAvailableForFootprint(view, tile, structureFootprint(kind), null);
}

export function isTileAvailableForNewFieldPlot(view: FarmView, tile: Tile): boolean {
  return isTileAvailableForFootprint(view, tile, { width: 1, height: 1 }, null);
}

export function isTileOccupiedForPlacement(
  view: FarmView,
  tile: Tile,
  moving: StructureSelection | null,
): boolean {
  if (footprintContains(FARM_HOUSE_TILE, FARM_HOUSE_FOOTPRINT, tile)) {
    return true;
  }
  if (view.field_plots.some((plot) => sameTile(plot.tile, tile))) {
    return true;
  }
  if (
    !isSameStructure(moving, { type: "silo" }) &&
    footprintContains(view.silo_tile, structureFootprint("silo"), tile)
  ) {
    return true;
  }
  if (
    !isSameStructure(moving, { type: "barn" }) &&
    footprintContains(view.barn_tile, structureFootprint("barn"), tile)
  ) {
    return true;
  }
  if (
    view.machines.some(
      (machine) =>
        !isSameStructure(moving, { type: "machine", id: machine.id }) &&
        footprintContains(machine.tile, structureFootprint(machine.kind), tile),
    )
  ) {
    return true;
  }
  if (
    view.shelters.some(
      (shelter) =>
        !isSameStructure(moving, { type: "shelter", id: shelter.id }) &&
        footprintContains(shelter.tile, structureFootprint(shelter.kind), tile),
    )
  ) {
    return true;
  }
  return (
    view.delivery_board_built &&
    !isSameStructure(moving, { type: "delivery_board" }) &&
    sameTile(view.delivery_board_tile, tile)
  );
}

function isTileAvailableForFootprint(
  view: FarmView,
  tile: Tile,
  footprint: StructureFootprint,
  moving: StructureSelection | null,
): boolean {
  if (!isFootprintInsideFarm(tile, footprint)) {
    return false;
  }
  if (footprintsOverlap(tile, footprint, FARM_HOUSE_TILE, FARM_HOUSE_FOOTPRINT)) {
    return false;
  }
  if (view.field_plots.some((plot) => footprintContains(tile, footprint, plot.tile))) {
    return false;
  }
  if (
    !isSameStructure(moving, { type: "silo" }) &&
    footprintsOverlap(tile, footprint, view.silo_tile, structureFootprint("silo"))
  ) {
    return false;
  }
  if (
    !isSameStructure(moving, { type: "barn" }) &&
    footprintsOverlap(tile, footprint, view.barn_tile, structureFootprint("barn"))
  ) {
    return false;
  }
  if (
    view.machines.some(
      (machine) =>
        !isSameStructure(moving, { type: "machine", id: machine.id }) &&
        footprintsOverlap(tile, footprint, machine.tile, structureFootprint(machine.kind)),
    )
  ) {
    return false;
  }
  if (
    view.shelters.some(
      (shelter) =>
        !isSameStructure(moving, { type: "shelter", id: shelter.id }) &&
        footprintsOverlap(tile, footprint, shelter.tile, structureFootprint(shelter.kind)),
    )
  ) {
    return false;
  }
  return !(
    view.delivery_board_built &&
    !isSameStructure(moving, { type: "delivery_board" }) &&
    footprintsOverlap(tile, footprint, view.delivery_board_tile, structureFootprint("delivery_board"))
  );
}

export function builtStructureKinds(view: FarmView): Set<StructureKind> {
  const built = new Set<StructureKind>();
  built.add("silo");
  built.add("barn");
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

function isFootprintInsideFarm(tile: Tile, footprint: StructureFootprint): boolean {
  return (
    tile.x >= 0 &&
    tile.y >= 0 &&
    tile.x + footprint.width <= FARM_GRID_SIZE &&
    tile.y + footprint.height <= FARM_GRID_SIZE
  );
}

function footprintContains(origin: Tile, footprint: StructureFootprint, tile: Tile): boolean {
  return (
    tile.x >= origin.x &&
    tile.x < origin.x + footprint.width &&
    tile.y >= origin.y &&
    tile.y < origin.y + footprint.height
  );
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.x === right.x && left.y === right.y;
}

function footprintsOverlap(
  leftOrigin: Tile,
  leftFootprint: StructureFootprint,
  rightOrigin: Tile,
  rightFootprint: StructureFootprint,
): boolean {
  return (
    leftOrigin.x < rightOrigin.x + rightFootprint.width &&
    leftOrigin.x + leftFootprint.width > rightOrigin.x &&
    leftOrigin.y < rightOrigin.y + rightFootprint.height &&
    leftOrigin.y + leftFootprint.height > rightOrigin.y
  );
}

function isSameStructure(left: StructureSelection | null, right: StructureSelection): boolean {
  if (!left || left.type !== right.type) {
    return false;
  }
  switch (left.type) {
    case "silo":
      return true;
    case "barn":
      return true;
    case "delivery_board":
      return true;
    case "machine":
      return right.type === "machine" && left.id === right.id;
    case "shelter":
      return right.type === "shelter" && left.id === right.id;
  }
}
