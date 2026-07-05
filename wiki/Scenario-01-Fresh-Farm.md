# Scenario 01: Fresh Farm

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: none | Next: [[Scenario 02: Planting Wheat|Scenario-02-Planting-Wheat]]

## What this teaches

A fresh Demo Farm is a single playable Farm with a Farmhouse, starter storage, starter Crops, and two Farm Residents. One Farm Resident is the Selected Resident, so future player intent can attach work to a specific household member.

## Farm setup

- Start the browser demo with `Start Farm`, or reset it with `New Farm`.
- The Farm begins at level 1 with 180 coins.
- Starter inventory contains Wheat x6 and Corn x3.
- The Silo can hold 40 Crops.
- The Barn can hold 30 non-Crop goods.
- Two Farm Residents exist. The saved resident ids are `woman` and `man`; display names may be edited later.
- The default Selected Resident is the `woman` resident.

## Player steps

1. Open the Pages demo.
2. Choose `Start Farm`.
3. Scan the top bar, storage structures, and Farm Residents panel.
4. Optionally open `New Farm` to reset back to the same baseline.

## What changes on the farm

Nothing needs to change yet. This scenario establishes the baseline Farm state before any Commands add work, spend coins, or advance production.

## What the model calls this

- The whole playable place is the Farm.
- The browser-local sample runtime is the Demo Farm.
- The Farmhouse anchors the household and acts as the built-in Tool Source.
- The Silo stores Crop items such as Wheat and Corn.
- The Barn stores non-Crop goods such as Bread.
- Farm Residents are saved household members, not browser-only avatars.
- The Selected Resident is the resident who will receive later work.

## Suggested visual callouts

- Top bar: level, coins, and inventory.
- Farm Residents panel: which resident is marked as selected.
- Silo and Barn storage structures, if they are visible in the current viewport.

## Related terms

- Farm
- Demo Farm
- Farmhouse
- Farm Resident
- Selected Resident
- Tool Source
- Silo
- Barn
- Crop

## Not covered here

This scenario does not cover later interior, animal, delivery, roadside sale, tool-sourcing, market, or storage-expansion systems.
