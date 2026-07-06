export type BasicFarmScenario = {
  id: string;
  number: number;
  title: string;
  summary: string;
  teaches: readonly string[];
  farmSetup: readonly string[];
  playerSteps: readonly string[];
  farmChanges: readonly string[];
  modelTerms: readonly string[];
  visualCallouts: readonly string[];
  relatedTerms: readonly string[];
  notCovered: string;
  accuracyNotes?: readonly string[];
};

export const basicFarmScenarios = [
  {
    id: "fresh-farm",
    number: 1,
    title: "Fresh Farm",
    summary:
      "A fresh Demo Farm is a single playable Farm with a Farmhouse, starter storage, starter Crops, and two Farm Residents.",
    teaches: [
      "The Demo Farm runs locally in the browser.",
      "The Farmhouse anchors the household and acts as the built-in Tool Source.",
      "One Farm Resident is the Selected Resident for future work.",
    ],
    farmSetup: [
      "Start the browser demo with Start Farm, or reset it with New Farm.",
      "The Farm begins at level 1 with 180 coins.",
      "Starter inventory contains Wheat x6 and Corn x3.",
      "The Silo can hold 40 Crops.",
      "The Barn can hold 30 non-Crop goods.",
      "Two Farm Residents exist, with saved ids woman and man.",
      "The default Selected Resident is the woman resident.",
    ],
    playerSteps: [
      "Open the Pages demo.",
      "Choose Start Farm.",
      "Scan the top bar, storage structures, and Farm Residents panel.",
      "Optionally open New Farm to reset back to the same baseline.",
    ],
    farmChanges: [
      "Nothing needs to change yet.",
      "This scenario establishes the baseline Farm state before Commands add work, spend coins, or advance production.",
    ],
    modelTerms: [
      "The whole playable place is the Farm.",
      "The browser-local sample runtime is the Demo Farm.",
      "The Farmhouse anchors the household and acts as the built-in Tool Source.",
      "The Silo stores Crop items such as Wheat and Corn.",
      "The Barn stores non-Crop goods such as Bread.",
      "Farm Residents are saved household members, not browser-only avatars.",
      "The Selected Resident is the resident who will receive later work.",
    ],
    visualCallouts: [
      "Top bar level, coins, and inventory.",
      "Farm Residents panel showing the selected resident.",
      "Silo and Barn storage structures.",
    ],
    relatedTerms: [
      "Farm",
      "Demo Farm",
      "Farmhouse",
      "Farm Resident",
      "Selected Resident",
      "Tool Source",
      "Silo",
      "Barn",
      "Crop",
    ],
    notCovered:
      "Later interior, animal, delivery, roadside sale, tool-sourcing, market, and storage-expansion systems.",
  },
  {
    id: "planting-wheat",
    number: 2,
    title: "Planting Wheat",
    summary:
      "A Field Plot holds one planted Crop job. Planting Wheat consumes an existing Wheat Crop from storage.",
    teaches: [
      "A Field Plot holds one planted Crop job.",
      "Planting consumes an existing stored Crop; there is no separate Seed item.",
      "The selected Farm Resident receives the accepted work.",
    ],
    farmSetup: [
      "Start from a fresh Farm or any Farm with an empty Field Plot.",
      "Wheat must be available in storage.",
      "Choose which Farm Resident should do the work by selecting that resident first, if needed.",
    ],
    playerSteps: [
      "Open the field planting tool.",
      "Choose Wheat.",
      "Click an empty Field Plot.",
      "Inspect the Field Plot and the selected resident's card.",
    ],
    farmChanges: [
      "One Wheat becomes reserved for the planting task when the planting Command is accepted.",
      "The Selected Resident receives a Resident Task.",
      "The Field Plot is reserved while the Resident Task is pending or in progress.",
      "The Field Plot becomes planted with Wheat once the resident reaches the plot and finishes planting.",
      "Later Commands cannot use that same Field Plot while the reservation is active.",
    ],
    modelTerms: [
      "The tile that can hold one planted crop job is a Field Plot.",
      "Wheat is a Crop, and planting consumes one stored Crop.",
      "The accepted work is a Resident Task in that resident's Resident Task Queue.",
      "The Field Plot is a Reserved Work Target until the task no longer needs it.",
      "Any Wheat claimed for future pickup is covered by an Item Reservation before the resident physically carries it.",
    ],
    visualCallouts: [
      "Empty Field Plot before planting.",
      "Field Plot after the planting Command is accepted.",
      "Resident card queue count increasing.",
      "UI text showing that the Field Plot is reserved for a resident's task.",
    ],
    relatedTerms: [
      "Field Plot",
      "Crop",
      "Farm Resident",
      "Selected Resident",
      "Resident Task",
      "Resident Task Queue",
      "Reserved Work Target",
      "Item Reservation",
    ],
    notCovered:
      "Sweep harvesting, animals, machine recipes, delivery systems, roadside selling, market trading, and interior systems.",
  },
  {
    id: "resident-work-queue",
    number: 3,
    title: "Resident Work Queue",
    summary:
      "Player intent becomes scheduled resident work, and the movement path is saved Farm state rather than browser-only animation.",
    teaches: [
      "Resident Tasks and Resident Paths are authoritative Farm state.",
      "Resident Details exposes the current step, target, progress, carrying state, and queue.",
      "Tools and carried items belong to Resident Inventory while queued work is active.",
    ],
    farmSetup: [
      "A planting or harvesting task has already been accepted.",
      "The task belongs to one Farm Resident.",
      "The assigned resident is visible in the Farm Residents panel or on the Farm scene.",
    ],
    playerSteps: [
      "Click the assigned Farm Resident.",
      "Open or inspect Resident Details.",
      "Watch the resident move from their saved Resident Location toward the task target.",
      "Check the current task, current step, target, progress, carrying section, and queue.",
    ],
    farmChanges: [
      "Resident Details shows whether the resident is idle, walking, working, or blocked.",
      "The current Resident Task exposes its current step and target.",
      "The scene can show a Resident Path from the resident's saved location to the target.",
      "The resident may carry Crop items, output items, or durable Tools while the task runs.",
      "Completed pickup, work, deposit, and cleanup steps update authoritative Farm state.",
    ],
    modelTerms: [
      "A Resident Task Queue is a per-resident FIFO list of saved Resident Tasks.",
      "A Resident Location is the saved Farm Tile where that resident stands or last finished work.",
      "A Resident Path is the saved sequence of Farm Tiles the resident walks through before work starts.",
      "Resident Inventory is the resident's carried items and Tools while queued work is active.",
      "Tools are durable equipment checked out from a Tool Source and later returned.",
      "The Farmhouse is always a Tool Source in the current Farm.",
    ],
    visualCallouts: [
      "Resident Details panel.",
      "Task progress bar.",
      "Scene path overlay.",
      "Current step and target labels.",
      "Carrying section before and after pickup.",
    ],
    relatedTerms: [
      "Farm Resident",
      "Selected Resident",
      "Resident Details",
      "Resident Task",
      "Resident Task Queue",
      "Resident Location",
      "Resident Path",
      "Resident Inventory",
      "Tool",
      "Tool Source",
      "Return Tools Step",
    ],
    notCovered:
      "Lower-level Command payloads, API response shapes, and alternate Tool Source construction.",
  },
  {
    id: "harvesting-ready-crops",
    number: 4,
    title: "Harvesting Ready Crops",
    summary:
      "Planted Crops become Ready Output after their timer finishes. Harvesting moves Crop output into the Silo and awards XP.",
    teaches: [
      "A planted Crop becomes Ready Output when its timer finishes.",
      "Harvested Crop output belongs in the Silo.",
      "Harvest XP drives early level progression.",
    ],
    farmSetup: [
      "Wheat has been planted on a Field Plot.",
      "Enough Farm time has elapsed for Wheat to become ready.",
      "The Silo has room for the harvested Crop output.",
    ],
    playerSteps: [
      "Wait for a planted Wheat Field Plot to finish its timer.",
      "Use Harvest on the ready Field Plot.",
      "Inspect the Silo storage count after the resident harvest task completes.",
      "Repeat Wheat harvests until the Farm reaches level 2, if needed.",
    ],
    farmChanges: [
      "The Field Plot changes from planted Wheat to ready Wheat before harvest.",
      "Harvesting accepts a Resident Task for the Selected Resident.",
      "Once the harvest task completes, the Field Plot becomes empty again.",
      "Wheat output is deposited into the Silo.",
      "The Farm gains XP from the harvest.",
      "Level 2 unlocks Corn and Oven-related Bread production.",
    ],
    modelTerms: [
      "Finished produced goods waiting to be collected are Ready Output.",
      "Wheat is still a Crop when harvested, so it belongs in the Silo.",
      "The harvest is a Resident Task assigned to a Farm Resident.",
      "The deposit part of the task is a Deposit Step.",
      "XP contributes to the Farm level, which controls progression.",
    ],
    visualCallouts: [
      "Field Plot timer before ready state.",
      "Field Plot ready state.",
      "Silo storage count before and after harvest.",
      "Level display before and after reaching level 2.",
    ],
    relatedTerms: [
      "Field Plot",
      "Crop",
      "Ready Output",
      "Silo",
      "Resident Task",
      "Deposit Step",
      "Farm Resident",
    ],
    notCovered:
      "Sweep harvesting, storage expansion, animals, delivery systems, roadside selling, and market trading.",
    accuracyNotes: [
      "Wheat yields 2 Crop units when harvested.",
      "Wheat harvest grants 1 XP.",
      "The Pages demo uses simplified level thresholds; level 2 is reached at 4 XP.",
    ],
  },
  {
    id: "unlocking-corn-and-oven",
    number: 5,
    title: "Unlocking Corn and Oven",
    summary:
      "At level 2, the demo can show Corn and the Farmhouse Oven path toward Bread production.",
    teaches: [
      "Progression opens new options without changing the core loop.",
      "The Oven is a Farmhouse Upgrade rather than a placed Structure.",
      "Bread production starts from the Farmhouse Baking Surface or Kitchen Oven Workstation.",
    ],
    farmSetup: [
      "The Farm has reached level 2.",
      "The Farm has at least 40 coins available for the Oven.",
      "The player is still in the browser-local Demo Farm.",
    ],
    playerSteps: [
      "Notice that Corn is available as a Crop option.",
      "Select the Farmhouse from the Farm to open the exterior Farmhouse Baking Surface.",
      "Buy the Oven Farmhouse Upgrade from that exterior surface.",
      "Look for Bread production on the Farmhouse Baking Surface or enter the House Interior to inspect the Kitchen Oven Workstation.",
    ],
    farmChanges: [
      "Corn becomes available to plant in the demo.",
      "The Oven is added to owned Farmhouse Upgrades.",
      "The Farmhouse Baking Surface can start and collect Oven recipes from outside the House Interior.",
      "The Oven Workstation remains the Kitchen work target for resident Oven work.",
      "Coins decrease by the Oven cost.",
      "Bread production becomes reachable once Wheat x3 is available.",
    ],
    modelTerms: [
      "The Oven is a Farmhouse Upgrade, not a placed Structure.",
      "The Farmhouse Baking Surface is a command surface, not a placed Structure or Resident Task work target.",
      "The Oven Workstation is the fixed Kitchen surface derived from owning the Oven.",
      "Corn is a Crop stored in the Silo.",
      "Coins are spent on durable progression.",
      "Level-gated progression controls which catalog options are available.",
    ],
    visualCallouts: [
      "Crop picker showing Corn.",
      "Farmhouse Baking Surface showing the Oven purchase action.",
      "Coin count before and after buying the Oven.",
      "Oven Workstation or Oven status after purchase.",
    ],
    relatedTerms: [
      "Crop",
      "Silo",
      "Farmhouse",
      "Farmhouse Baking Surface",
      "Farmhouse Upgrade",
      "Oven",
      "Oven Workstation",
      "Recipe",
    ],
    notCovered:
      "Other bread-family recipes, feed production, animals, delivery systems, roadside selling, storage expansion, and local-server-only production systems.",
    accuracyNotes: [
      "The Oven costs 40 coins.",
      "A fresh Farm starts with 180 coins.",
      "Corn is present in the Pages demo.",
      "Corn-based bread is not part of the Pages demo recipe set.",
    ],
  },
  {
    id: "making-bread",
    number: 6,
    title: "Making Bread",
    summary:
      "Bread production connects storage, resident work, the Farmhouse Oven, and output collection.",
    teaches: [
      "The player starts a Recipe, a Farm Resident starts Oven work, and the Oven produces Bread.",
      "Ready Bread is collected into the Barn because Bread is non-Crop output.",
      "Oven production still goes through resident work and Farm state.",
    ],
    farmSetup: [
      "The Farm is level 2.",
      "The Oven Farmhouse Upgrade is owned.",
      "Wheat x3 is available.",
      "The Barn has room for Bread.",
    ],
    playerSteps: [
      "Open the exterior Farmhouse Baking Surface or enter the Kitchen Oven Workstation.",
      "Choose Make Bread.",
      "Watch the Oven status change through starting and producing states.",
      "Wait until the Oven shows Ready Bread.",
      "Choose Collect Bread.",
      "Inspect Barn storage after collection.",
    ],
    farmChanges: [
      "Starting the Bread Recipe consumes Wheat x3.",
      "A Farm Resident receives a Resident Task to Start Oven Recipe.",
      "The Oven transitions from pending resident start to Producing Bread.",
      "When production finishes, the Oven shows Ready Bread.",
      "Collecting the Ready Output stores Bread in the Barn.",
      "The Farm gains XP from the Bread Recipe.",
    ],
    modelTerms: [
      "Bread is an Oven Recipe in the demo catalog.",
      "The Farmhouse Baking Surface is an outside command surface for starting and collecting Oven recipes.",
      "Start Oven Recipe is a resident work step at the Oven Workstation.",
      "Producing describes an active production job progressing toward output.",
      "Ready Bread is Ready Output waiting to be collected.",
      "Bread is non-Crop output, so it belongs in the Barn.",
      "The collection task deposits the carried Bread through a Deposit Step.",
    ],
    visualCallouts: [
      "Farmhouse Baking Surface or Oven Workstation action showing Bread.",
      "Oven status while producing Bread.",
      "Oven status when Ready Bread is available.",
      "Resident activity at the Farmhouse or inside the kitchen, if visible.",
      "Barn storage after Bread is collected.",
    ],
    relatedTerms: [
      "Farmhouse Oven",
      "Farmhouse Baking Surface",
      "Oven",
      "Oven Workstation",
      "Recipe",
      "Start Oven Recipe",
      "Producing",
      "Ready Output",
      "Farm Resident",
      "Resident Task",
      "Barn",
      "Deposit Step",
    ],
    notCovered:
      "Other bread-family recipes, other Oven recipes, machine recipes, animals, feed production, delivery systems, roadside selling, and market trading.",
    accuracyNotes: [
      "The Pages demo includes only the Bread Recipe.",
      "Bread consumes Wheat x3.",
      "Bread outputs Bread x1.",
      "Bread grants 4 XP.",
      "Bread belongs in the Barn, not the Silo.",
    ],
  },
  {
    id: "blocked-work-and-storage",
    number: 7,
    title: "Blocked Work and Storage",
    summary:
      "The Farm should expose why work cannot proceed. Reserved targets and full storage are explicit states, not silent failures.",
    teaches: [
      "Blocked work is visible state, not a silent skipped action.",
      "Reserved Work Targets reject conflicting work.",
      "Full storage blocks harvest or collection until room exists.",
    ],
    farmSetup: [
      "A Field Plot already has a pending Resident Task reservation.",
      "Or a Farm Resident has a task whose saved execution plan no longer matches required Farm state.",
      "Or the Silo or Barn has no room for the output that a task would deposit.",
    ],
    playerSteps: [
      "Try to interact with a Field Plot that is already reserved by resident work.",
      "Or select a Farm Resident whose Resident Details show blocked work.",
      "Or inspect a ready output whose destination storage is full.",
      "Read the reason shown by the UI before deciding what to do next.",
    ],
    farmChanges: [
      "A reserved Field Plot explains that it is reserved instead of accepting conflicting work.",
      "A blocked resident shows Blocked in Resident Details.",
      "A blocked reason describes the missing invariant, such as missing carried items.",
      "A storage-full state prevents harvest or collection until storage room exists.",
      "The Farm remains deterministic because failed or stalled work is represented in state.",
    ],
    modelTerms: [
      "A Blocked Resident Task is accepted work that cannot currently advance.",
      "A Reserved Work Target is a Farm object claimed by a pending or producing task.",
      "An Item Reservation claims stored item quantities before physical pickup.",
      "A Tool Reservation claims durable Tools before physical pickup.",
      "A Storage Source is the compatible place where item stacks can be picked up or deposited.",
      "Crop outputs use the Silo; non-Crop outputs use the Barn.",
    ],
    visualCallouts: [
      "Resident Details reason for Blocked work.",
      "Field Plot text showing reservation by a resident's task.",
      "Ready output status that includes storage full.",
      "Silo or Barn storage count at capacity.",
    ],
    relatedTerms: [
      "Blocked Resident Task",
      "Resident Details",
      "Resident Task",
      "Resident Task Queue",
      "Reserved Work Target",
      "Item Reservation",
      "Tool Reservation",
      "Storage Source",
      "Silo",
      "Barn",
    ],
    notCovered:
      "Storage expansion, discarding inventory, market trading, delivery systems, roadside selling stock, alternate tool sourcing, animals, and machine output.",
  },
] as const satisfies readonly BasicFarmScenario[];

export type BasicFarmScenarioId = (typeof basicFarmScenarios)[number]["id"];
export type BasicFarmScenarioRecord = Extract<
  (typeof basicFarmScenarios)[number],
  { id: BasicFarmScenarioId }
>;

export function getBasicFarmScenario(id: BasicFarmScenarioId): BasicFarmScenario {
  return basicFarmScenarios.find((scenario) => scenario.id === id) ?? basicFarmScenarios[0];
}

export function nextBasicFarmScenarioId(id: BasicFarmScenarioId): BasicFarmScenarioId | null {
  const index = scenarioIndex(id);
  return basicFarmScenarios[index + 1]?.id ?? null;
}

export function previousBasicFarmScenarioId(id: BasicFarmScenarioId): BasicFarmScenarioId | null {
  const index = scenarioIndex(id);
  return basicFarmScenarios[index - 1]?.id ?? null;
}

function scenarioIndex(id: BasicFarmScenarioId) {
  return Math.max(
    0,
    basicFarmScenarios.findIndex((scenario) => scenario.id === id),
  );
}
