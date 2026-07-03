# House Decoration Is Saved Farm State

House Interior decoration belongs to `FarmState` rather than browser-only UI state.

Rooms, Room Tiles, and Decoration Placements are part of the player's Farmhouse progression and should survive reloads, work the same in the local server runtime and browser-local Demo Farm, and be available through generated contracts. The browser may provide decoration editing interactions, but it treats the Farm view as the source of truth.

The starter Decoration catalog is catalog data, while the default Room layout is saved House Interior state created for new Farms and backfilled when old saves omit it.
