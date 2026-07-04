# Scenario 03: Resident Work Queue

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: [[Scenario 02: Planting Wheat|Scenario-02-Planting-Wheat]] | Next: [[Scenario 04: Harvesting Ready Crops|Scenario-04-Harvesting-Ready-Crops]]

## What this teaches

Player intent becomes scheduled resident work. The visual movement is not just animation: Resident Tasks, Resident Paths, carried items, carried Tools, and Resident Locations are saved Farm state.

## Farm setup

- A planting or harvesting task has already been accepted.
- The task belongs to one Farm Resident.
- The assigned resident is visible in the Farm Residents panel or on the Farm scene.

## Player steps

1. Click the assigned Farm Resident.
2. Open or inspect Resident Details.
3. Watch the resident move from their saved Resident Location toward the task target.
4. Check the current task, current step, target, progress, carrying section, and queue.

## What changes on the farm

- Resident Details shows whether the resident is idle, walking, working, or blocked.
- The current Resident Task exposes its current step and target.
- The scene can show a Resident Path from the resident's saved location to the target.
- The resident may carry Crop items, output items, or durable Tools while the task runs.
- Completed pickup, work, deposit, and cleanup steps update the authoritative Farm state.

## What the model calls this

- A Resident Task Queue is a per-resident FIFO list of saved Resident Tasks.
- A Resident Location is the saved Farm Tile where that resident stands or last finished work.
- A Resident Path is the saved sequence of Farm Tiles the resident walks through before work starts.
- Resident Inventory is the resident's carried items and Tools while queued work is active.
- Tools are durable equipment checked out from a Tool Source and later returned.
- The Farmhouse is always a Tool Source in the current Farm.

## Suggested visual callouts

- Resident Details panel.
- Task progress bar.
- Scene path overlay.
- Current step and target labels.
- Carrying section before and after pickup.

## Related terms

- Farm Resident
- Selected Resident
- Resident Details
- Resident Task
- Resident Task Queue
- Resident Location
- Resident Path
- Resident Inventory
- Tool
- Tool Source
- Return Tools Step

## Not covered here

This scenario does not explain the lower-level Command payloads or API response shapes. It also does not cover Tool Shed behavior, because Tool Shed construction is outside the Pages demo.
