# Basic Farm Scenarios

This page is the reading order for compact scenario cards that explain the playable browser-local Pages demo. The scenarios are written for design readers: each one names what the player sees, what changes on the Farm, and which domain terms from the My Farm glossary apply.

Publication note: these files are staged as copy-ready GitHub Wiki markdown because the wiki remote is not currently reachable. When the wiki is enabled, publish each file as the page with the matching filename stem.

PRD: [PRD: Basic Farm Scenario Wiki Pack](https://github.com/moritzbrantner/my-farm/issues/90)

## Scope

These scenarios cover the early production loop that the Pages demo supports:

- Farm setup, Farm Residents, and the Selected Resident.
- Field Plots, Crops, crop timers, Ready Output, and Silo storage.
- Resident Tasks, Resident Task Queues, Resident Details, walking/working state, carrying, and blocked work.
- Coins, XP, level-gated progression, the Farmhouse Oven, the Oven Workstation, Bread production, and Barn storage.

These scenarios do not cover House Interior, Decoration, animals, Feed Mill, Delivery Orders, Farm Shop, Tool Shed, market trading, storage upgrades, API commands, or implementation details.

## Reading Order

1. [[Scenario 01: Fresh Farm|Scenario-01-Fresh-Farm]]
2. [[Scenario 02: Planting Wheat|Scenario-02-Planting-Wheat]]
3. [[Scenario 03: Resident Work Queue|Scenario-03-Resident-Work-Queue]]
4. [[Scenario 04: Harvesting Ready Crops|Scenario-04-Harvesting-Ready-Crops]]
5. [[Scenario 05: Unlocking Corn and Oven|Scenario-05-Unlocking-Corn-And-Oven]]
6. [[Scenario 06: Making Bread|Scenario-06-Making-Bread]]
7. [[Scenario 07: Blocked Work and Storage|Scenario-07-Blocked-Work-And-Storage]]

## Demo Facts These Scenarios Rely On

- The Demo Farm is browser-local and runs without the local server.
- Demo items are Wheat, Corn, and Bread.
- Demo Crops are Wheat and Corn.
- The demo Recipe set contains Bread only.
- A fresh Farm starts at level 1 with 180 coins, Wheat x6, and Corn x3.
- The Silo starts with capacity for 40 Crops.
- The Barn starts with capacity for 30 non-Crop goods.
- The Oven costs 40 coins.
- Bread consumes Wheat x3 and outputs Bread x1.

## Page Template

Every scenario page uses the same sections:

- What this teaches
- Farm setup
- Player steps
- What changes on the farm
- What the model calls this
- Suggested visual callouts
- Related terms
- Not covered here
