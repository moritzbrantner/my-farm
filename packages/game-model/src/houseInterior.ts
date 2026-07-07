import type { CatalogDocument, FarmView } from "@my-farm/contracts";

export type HouseInteriorRoom = FarmView["house_interior"]["rooms"][number];
export type DecorationDefinition = CatalogDocument["decorations"][number];
export type RoomTile = HouseInteriorRoom["decoration_placements"][number]["tile"];

export type DecorationPlacementStatus =
  | { fits: true; reason: null }
  | { fits: false; reason: "out_of_bounds" | "overlap" };

const kitchenOvenTile = { x: 3, y: 0 };
const kitchenOvenFootprint = { width: 2, height: 1 };

export function decorationPlacementStatus(
  catalog: CatalogDocument,
  room: HouseInteriorRoom,
  decorationId: string,
  tile: RoomTile,
  options: { ignorePlacementId?: string | null } = {},
): DecorationPlacementStatus {
  const decoration = catalog.decorations.find((entry) => entry.id === decorationId);
  if (!decoration) {
    return { fits: false, reason: "out_of_bounds" };
  }
  const right = tile.x + decoration.footprint.width;
  const bottom = tile.y + decoration.footprint.height;
  if (right > room.width || bottom > room.height) {
    return { fits: false, reason: "out_of_bounds" };
  }
  if (fixedRoomFeatureOverlaps(room, tile, decoration)) {
    return { fits: false, reason: "overlap" };
  }

  for (const placement of room.decoration_placements) {
    if (placement.id === options.ignorePlacementId) {
      continue;
    }
    const other = catalog.decorations.find((entry) => entry.id === placement.decoration_id);
    if (!other) {
      continue;
    }
    if (footprintsOverlap(tile, decoration, placement.tile, other)) {
      return { fits: false, reason: "overlap" };
    }
  }

  return { fits: true, reason: null };
}

function fixedRoomFeatureOverlaps(
  room: HouseInteriorRoom,
  tile: RoomTile,
  decoration: DecorationDefinition,
) {
  if (room.id !== "kitchen") {
    return false;
  }
  const right = tile.x + decoration.footprint.width;
  const bottom = tile.y + decoration.footprint.height;
  const ovenRight = kitchenOvenTile.x + kitchenOvenFootprint.width;
  const ovenBottom = kitchenOvenTile.y + kitchenOvenFootprint.height;
  return (
    tile.x < ovenRight &&
    right > kitchenOvenTile.x &&
    tile.y < ovenBottom &&
    bottom > kitchenOvenTile.y
  );
}

function footprintsOverlap(
  tile: RoomTile,
  decoration: DecorationDefinition,
  otherTile: RoomTile,
  otherDecoration: DecorationDefinition,
) {
  const right = tile.x + decoration.footprint.width;
  const bottom = tile.y + decoration.footprint.height;
  const otherRight = otherTile.x + otherDecoration.footprint.width;
  const otherBottom = otherTile.y + otherDecoration.footprint.height;

  return (
    tile.x < otherRight &&
    right > otherTile.x &&
    tile.y < otherBottom &&
    bottom > otherTile.y
  );
}
