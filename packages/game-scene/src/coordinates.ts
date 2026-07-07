import type { Tile } from "@my-farm/contracts";
import type { StructureFootprint } from "@my-farm/game-model/selectors";

export const BOARD_ORIGIN = -7.5;

export function tileToWorld(value: number) {
  return value + BOARD_ORIGIN;
}

export function worldToTile(value: number) {
  return value - BOARD_ORIGIN;
}

export function footprintCenter(tile: Tile, footprint: StructureFootprint): Tile {
  return {
    x: tile.x + (footprint.width - 1) / 2,
    y: tile.y + (footprint.height - 1) / 2,
  };
}
