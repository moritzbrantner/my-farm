import type {
  CatalogDocument,
  FarmResponse,
  FarmView,
  InventoryItemView,
  RoomTile,
  StructureKind,
  StructureTarget,
  Tile,
} from "@my-farm/contracts";
import {
  FARM_GRID_SIZE,
  decorationPlacementStatus,
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  selectedStructureKind,
  structureLabel,
  type Selection,
  type StructureSelection,
} from "@my-farm/game-model";
import type { BuildableKind, BuildableStructureKind } from "../types";

export const buildKinds: BuildableKind[] = [
  "field_plot",
  "feed_mill",
  "chicken_coop",
  "delivery_board",
  "farm_shop",
  "cow_pasture",
  "tool_shed",
];

export function farmVersion(farm: FarmResponse | null): number {
  return farm?.version ?? 0;
}

export function activeResident(view: FarmView) {
  return view.residents.find((resident) => resident.id === view.selected_resident_id) ?? view.residents[0] ?? null;
}

export function inventoryItem(view: FarmView, itemId: string): InventoryItemView | null {
  return view.inventory.find((item) => item.item_id === itemId) ?? null;
}

export function selectedPlotFromSelection(view: FarmView, selection: Selection) {
  return selection?.type === "plot" ? view.field_plots.find((plot) => plot.id === selection.id) ?? null : null;
}

export function structureSelectionFromSelection(selection: Selection): StructureSelection | null {
  if (
    selection?.type === "farmhouse" ||
    selection?.type === "silo" ||
    selection?.type === "barn" ||
    selection?.type === "machine" ||
    selection?.type === "shelter" ||
    selection?.type === "delivery_board" ||
    selection?.type === "tool_shed" ||
    selection?.type === "farm_shop"
  ) {
    return selection;
  }
  return null;
}

export function structureTargetFromSelection(selection: StructureSelection): StructureTarget | null {
  switch (selection.type) {
    case "silo":
      return { type: "silo" };
    case "barn":
      return { type: "barn" };
    case "machine":
      return { type: "machine", id: selection.id };
    case "shelter":
      return { type: "shelter", id: selection.id };
    case "delivery_board":
      return { type: "delivery_board" };
    case "tool_shed":
      return { type: "tool_shed", id: selection.id };
    case "farm_shop":
      return { type: "farm_shop", id: selection.id };
    case "farmhouse":
      return null;
  }
}

export function buildLabel(kind: BuildableKind): string {
  return kind === "field_plot" ? "Field Plot" : structureLabel(kind);
}

export function buildDisabledReason(
  catalog: CatalogDocument,
  view: FarmView,
  kind: BuildableKind,
): string | null {
  if (kind === "field_plot") {
    return view.coins < 12 ? "Need 12 coins" : null;
  }

  const def =
    catalog.machines.find((entry) => entry.kind === kind) ??
    catalog.shelters.find((entry) => entry.kind === kind);
  if (def) {
    if (view.level < def.unlock_level) {
      return `Unlocks at level ${def.unlock_level}`;
    }
    if (view.coins < def.build_cost) {
      return `Need ${def.build_cost - view.coins} coins`;
    }
  }

  if (kind === "delivery_board" && view.delivery_board_built) {
    return "Already built";
  }
  if (kind === "tool_shed" && view.tool_shed) {
    return "Already built";
  }
  if (kind === "farm_shop" && view.farm_shop) {
    return "Already built";
  }
  return null;
}

export function candidateTilesForBuild(view: FarmView, kind: BuildableKind, limit = 8): Tile[] {
  const candidates: Tile[] = [];
  for (let y = 0; y < FARM_GRID_SIZE; y += 1) {
    for (let x = 0; x < FARM_GRID_SIZE; x += 1) {
      const tile = { x, y };
      const available =
        kind === "field_plot"
          ? isTileAvailableForNewFieldPlot(view, tile)
          : isTileAvailableForNewStructure(view, tile, kind);
      if (available) {
        candidates.push(tile);
      }
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }
  return candidates;
}

export function candidateTilesForMove(view: FarmView, moving: StructureSelection, limit = 8): Tile[] {
  if (!selectedStructureKind(view, moving)) {
    return [];
  }
  const candidates: Tile[] = [];
  for (let y = 0; y < FARM_GRID_SIZE; y += 1) {
    for (let x = 0; x < FARM_GRID_SIZE; x += 1) {
      const tile = { x, y };
      if (isTileAvailableForStructure(view, tile, moving)) {
        candidates.push(tile);
      }
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }
  return candidates;
}

export function firstOpenRoomTile(
  catalog: CatalogDocument,
  room: FarmView["house_interior"]["rooms"][number],
  decorationId: string,
  ignorePlacementId?: string | null,
): RoomTile {
  return (
    room.tiles.find((tile) =>
      decorationPlacementStatus(catalog, room, decorationId, tile, { ignorePlacementId }).fits,
    ) ??
    room.tiles[0] ??
    { x: 0, y: 0 }
  );
}

export function formatTile(tile: Tile | RoomTile): string {
  return `${tile.x},${tile.y}`;
}

export function structureKindForBuild(kind: BuildableKind): BuildableStructureKind | null {
  return kind === "field_plot" ? null : kind;
}

export function nextFarmShopPrice(price: number, delta: number, maxPrice: number): number {
  return Math.max(1, Math.min(maxPrice, price + delta));
}

