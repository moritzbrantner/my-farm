# Scenario 04: Harvesting Ready Crops

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: [[Scenario 03: Resident Work Queue|Scenario-03-Resident-Work-Queue]] | Next: [[Scenario 05: Unlocking Corn and Oven|Scenario-05-Unlocking-Corn-And-Oven]]

## What this teaches

Planted Crops become Ready Output after their timer finishes. Harvesting moves Crop output into the Silo and awards XP, which drives early demo progression.

## Farm setup

- Wheat has been planted on a Field Plot.
- Enough Farm time has elapsed for Wheat to become ready.
- The Silo has room for the harvested Crop output.

## Player steps

1. Wait for a planted Wheat Field Plot to finish its timer.
2. Use Harvest on the ready Field Plot.
3. Inspect the Silo storage count after the resident harvest task completes.
4. Repeat Wheat harvests until the Farm reaches level 2, if needed.

## What changes on the farm

- The Field Plot changes from planted Wheat to ready Wheat before harvest.
- Harvesting accepts a Resident Task for the Selected Resident.
- Once the harvest task completes, the Field Plot becomes empty again.
- Wheat output is deposited into the Silo.
- The Farm gains XP from the harvest.
- Level 2 unlocks the next demo slice: Corn and Oven-related Bread production.

## What the model calls this

- Finished produced goods waiting to be collected are Ready Output.
- Wheat is still a Crop when harvested, so it belongs in the Silo.
- The harvest is a Resident Task assigned to a Farm Resident.
- The deposit part of the task is a Deposit Step.
- XP contributes to the Farm level, which controls progression.

## Suggested visual callouts

- Field Plot timer before ready state.
- Field Plot ready state.
- Silo storage count before and after harvest.
- Level display before and after reaching level 2.

## Related terms

- Field Plot
- Crop
- Ready Output
- Silo
- Resident Task
- Deposit Step
- Farm Resident

## Not covered here

This scenario does not cover Sweep Harvest, storage upgrades, animals, Delivery Orders, Farm Shop, or market trading.

## Accuracy notes

- Wheat yields 2 Crop units when harvested.
- Wheat harvest grants 1 XP.
- The Pages demo uses simplified level thresholds; level 2 is reached at 4 XP.
