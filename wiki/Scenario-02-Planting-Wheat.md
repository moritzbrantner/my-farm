# Scenario 02: Planting Wheat

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: [[Scenario 01: Fresh Farm|Scenario-01-Fresh-Farm]] | Next: [[Scenario 03: Resident Work Queue|Scenario-03-Resident-Work-Queue]]

## What this teaches

A Field Plot holds one planted Crop job. Planting Wheat consumes an existing Wheat Crop from storage; there is no separate Seed item in the model.

## Farm setup

- Start from a fresh Farm or any Farm with an empty Field Plot.
- Wheat must be available in storage.
- Choose which Farm Resident should do the work by selecting that resident first, if needed.

## Player steps

1. Open the field planting tool.
2. Choose Wheat.
3. Click an empty Field Plot.
4. Inspect the Field Plot and the selected resident's card.

## What changes on the farm

- Wheat inventory decreases by 1 when the planting Command is accepted.
- The Selected Resident receives a Resident Task.
- The Field Plot is reserved while the Resident Task is pending or in progress.
- The Field Plot becomes planted with Wheat once the resident reaches the plot and finishes the planting step.
- Later Commands cannot use that same Field Plot while the reservation is active.

## What the model calls this

- The tile that can hold one planted crop job is a Field Plot.
- Wheat is a Crop, and planting consumes one stored Crop.
- The accepted work is a Resident Task in that resident's Resident Task Queue.
- The Field Plot is a Reserved Work Target until the task no longer needs it.
- Any Wheat claimed for future pickup is covered by an Item Reservation before the resident physically carries it.

## Suggested visual callouts

- Empty Field Plot before planting.
- Field Plot after the planting Command is accepted.
- Resident card queue count increasing.
- Any UI text showing that the Field Plot is reserved for a resident's task.

## Related terms

- Field Plot
- Crop
- Farm Resident
- Selected Resident
- Resident Task
- Resident Task Queue
- Reserved Work Target
- Item Reservation

## Not covered here

This scenario does not cover Sweep Harvest, animals, Machine recipes, Delivery Orders, Farm Shop, market trading, or House Interior.
