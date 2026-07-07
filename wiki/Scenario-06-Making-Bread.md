# Scenario 06: Making Bread

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: [[Scenario 05: Unlocking Corn and Oven|Scenario-05-Unlocking-Corn-And-Oven]] | Next: [[Scenario 07: Blocked Work and Storage|Scenario-07-Blocked-Work-And-Storage]]

## What this teaches

Bread production connects storage, resident work, the Farmhouse Oven, and output collection. The player starts a Recipe, a Farm Resident starts the Oven work, the Oven produces Bread, and the completed Bread is collected into the Barn.

## Farm setup

- The Farm is level 2.
- The Oven Farmhouse Upgrade is owned.
- Wheat x3 is available.
- The Barn has room for Bread.

## Player steps

1. Open the exterior Farmhouse Baking Surface or enter the Kitchen Oven Workstation.
2. Choose `Make Bread`.
3. Watch the Oven status change through starting and producing states.
4. Wait until the Oven shows Ready Bread.
5. Choose `Collect Bread`.
6. Inspect Barn storage after collection.

## What changes on the farm

- Starting the Bread Recipe consumes Wheat x3.
- A Farm Resident receives a Resident Task to Start Oven Recipe.
- The Oven transitions from pending resident start to Producing Bread.
- When production finishes, the Oven shows Ready Bread.
- Collecting the Ready Output stores Bread in the Barn.
- The Farm gains XP from the Bread Recipe.

## What the model calls this

- Bread is an Oven Recipe in the demo catalog.
- The Farmhouse Baking Surface is an outside command surface for starting and collecting Oven recipes.
- Start Oven Recipe is a resident work step at the Oven Workstation.
- Producing describes an active production job progressing toward output.
- Ready Bread is Ready Output waiting to be collected.
- Bread is non-Crop output, so it belongs in the Barn.
- The collection task deposits the carried Bread through a Deposit Step.

## Suggested visual callouts

- Farmhouse Baking Surface or Oven Workstation action showing Bread.
- Oven status while producing Bread.
- Oven status when Ready Bread is available.
- Resident activity at the Farmhouse or inside the kitchen, if visible.
- Barn storage after Bread is collected.

## Related terms

- Farmhouse Oven
- Farmhouse Baking Surface
- Oven
- Oven Workstation
- Recipe
- Start Oven Recipe
- Producing
- Ready Output
- Farm Resident
- Resident Task
- Barn
- Deposit Step

## Not covered here

This scenario does not cover other bread-family recipes, other Oven recipes, machine recipes, animals, feed production, delivery systems, roadside selling, or market trading.

## Accuracy notes

- The Pages demo includes only the Bread Recipe.
- Bread consumes Wheat x3.
- Bread outputs Bread x1.
- Bread grants 4 XP.
- Bread belongs in the Barn, not the Silo.
