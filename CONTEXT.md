# My Farm

My Farm is a local farming sim prototype about building an early production chain from crops, animal care, machine queues, and delivery orders. This glossary names the gameplay concepts used across the Rust core, server API, and browser client.

## Language

**Farm**:
The single playable world owned by the active runtime.
_Avoid_: Account, realm, world

**Farmhouse**:
The fixed home base for the Farm household. It anchors the Farm Residents in the playable Farm and is not a player-built production Structure.
_Avoid_: House building, home structure

**House Interior**:
The saved inside-of-Farmhouse decoration space owned by the Farm. It contains starter Rooms and Decoration Placements that clients can browse and later edit.
_Avoid_: Browser-only room state, UI-only house

**House Overview**:
The whole-Farmhouse navigation view used to enter individual Rooms or exit back to the Farm.
_Avoid_: Room picker, house menu

**Upper Floor**:
The second-story layer in the House Overview that contains the Bedroom House Door and bedroom preview. Players can show or hide the Upper Floor while inspecting the House Overview; this visibility is not saved Farm state.
_Avoid_: Upstairs mode, second-floor state

**Room**:
A named area inside the House Interior, such as the Living Room, Kitchen, or Bedroom. Starter Rooms use fixed Room Tile grids.
_Avoid_: Scene, level, screen

**House Door**:
A visible House Interior navigation affordance that enters a Room, returns from a Room to the House Overview, or exits through the Front Door to the Farm. House Doors are navigation affordances, not Decoration Placements or saved Room state.
_Avoid_: Door button, room tab, back button

**Room Tile**:
A discrete coordinate inside a Room grid used to place Decorations.
_Avoid_: Farm tile, world tile

**Decoration**:
A catalog-defined interior item with a footprint, such as a Bed, Sofa, or Kitchen Counter.
_Avoid_: Furniture item, cosmetic item

**Decoration Placement**:
A saved instance of a Decoration at a Room Tile inside a Room.
_Avoid_: Rendered prop, local layout

**Decoration Editing**:
Player intent to change saved Decoration Placements in the House Interior. Editing changes are authoritative Farm state rather than browser-only presentation.
_Avoid_: Client-only decorating, unsaved layout

**Family Tree**:
A Bedroom surface inside the House Interior for viewing and editing Farm Resident identity.
_Avoid_: Decoration, relationship graph, task queue panel

**Farmhouse Upgrade**:
A durable improvement bought for the Farmhouse rather than placed on the farm grid. Farmhouse Upgrades use catalog-driven level and coin requirements and are saved as owned Farm state.
_Avoid_: Structure upgrade, house building

**Oven**:
The Farmhouse Upgrade that unlocks bread-family production from the Farmhouse kitchen. It keeps the prior bread-production balance but is not a placed or movable Structure.
_Avoid_: placed kitchen Structure

**Farmhouse Baking Surface**:
The exterior Farmhouse management surface where the player can buy the Oven, start Oven recipes, and collect Oven output before entering the House Interior. It is a player Command surface, not the Resident Task work target.
_Avoid_: Bakery, placed baking station, outside Oven Workstation

**Oven Workstation**:
The fixed Kitchen surface for starting and collecting Oven recipes. It is derived from the Oven Farmhouse Upgrade and is not a Decoration.
_Avoid_: Oven decoration, kitchen machine

**Farm Resident**:
One of the two saved household members who can perform work on the Farm. Farm Residents have stable ids `woman` and `man` and editable display names.
_Avoid_: Character, avatar, worker

**Selected Resident**:
The currently active Farm Resident for player intent. The active runtime persists this selection so later Commands can attach work to the intended resident.
_Avoid_: Active character, current avatar

**Resident Task**:
A saved unit of Farm work assigned to a Farm Resident and advanced by elapsed Farm time. Resident Tasks are authoritative Farm state, not browser-only animation.
_Avoid_: Animation job, client task

**Blocked Resident Task**:
An accepted Resident Task that cannot currently advance because its saved execution plan no longer satisfies required Farm state invariants, such as missing carried inventory, missing Tool Source stock, an unreachable target, or a missing Reserved Work Target.
_Avoid_: Silent skip, auto repair, queue error

**Start Oven Recipe**:
A Resident Task step where a Farm Resident stands at the Oven Workstation and turns a pending Oven recipe into an active baking job.
_Avoid_: Instant oven queueing, make cake

**Resident Task Queue**:
The per-resident FIFO list of Resident Tasks saved on the Farm. Later work may enqueue physical production tasks here; empty queues still exist for each Farm Resident.
_Avoid_: Local queue, animation queue

**Resident Task Preview**:
A browser-facing inspection of a Resident Task's planned path, target, and steps. It is derived from authoritative Resident Task Queue state and does not change Farm state by itself.
_Avoid_: Client-only route, speculative task

**Resident Task Reordering**:
A player Command that changes the order of future queued Resident Tasks for one Farm Resident. The current Resident Task stays fixed, future tasks are replanned atomically, and unsafe reorder attempts are rejected without changing the queue.
_Avoid_: Drag-only UI order, task cancellation

**Resident Details**:
The selected-Farm Resident UI surface that shows current Resident Task state, current step, target, progress, carried Resident Inventory, blocked reason, and expandable Resident Task Queue.
_Avoid_: Worker debug panel, task queue modal, character stats

**Resident Inventory**:
The authoritative per-Farm Resident carried inventory used while that resident has queued work. It contains carried item stacks, durable Tools, and each Tool's checkout source; it should be empty when the Resident Task Queue becomes empty unless cleanup is blocked by storage capacity.
_Avoid_: Backpack, global inventory, storage

**Projected Resident Inventory**:
The planner's deterministic view of what a Farm Resident will carry after already queued Resident Tasks complete their future pickup, work, deposit, and return steps.
_Avoid_: Guess, client preview, optimistic inventory

**Resident Location**:
The saved Farm Tile where a Farm Resident currently stands or last finished work. New Resident Tasks start walking from this Tile unless the resident already has queued work.
_Avoid_: Browser avatar position, animation origin

**Resident Path**:
The saved sequence of Farm Tiles a Farm Resident will walk through for a Resident Task step before work starts. Resident Paths avoid Structures, while Field Plots remain walkable.
_Avoid_: Client-only route, visual interpolation path

**Approach Tile**:
The reachable Farm Tile where a Farm Resident stands to perform a Resident Task step. Field work uses the Field Plot Tile; Structure work uses an adjacent Tile outside the Structure footprint.
_Avoid_: Structure center, work target center

**Deposit Step**:
A Resident Task step that walks collected inventory to its storage destination. Crop items deposit at the Silo; non-crop outputs deposit at the Barn.
_Avoid_: Instant payout, work-tile storage

**Return Tools Step**:
The final cleanup step appended to Resident Tasks so the Farm Resident walks back to the Tool Source where carried Tools were checked out after completing assigned work and deposits.
_Avoid_: Teleport home, idle reset

**Reserved Work Target**:
The Farm object reserved by a Resident Task while that task is pending or producing, such as a Field Plot, Machine, or animal slot.
_Avoid_: Client lock, UI reservation

**Demo Farm**:
A browser-local sample Farm used to show an early production slice without requiring the full local Farm setup.
_Avoid_: Mock farm, fake farm

**Guided Tutorial**:
A five-card modal onboarding sequence that opens inside play after starting a New Farm and introduces the fresh Farm, Field Plots and planting, crop timers and harvesting, Silo storage, and coins, experience, and Build progression.
_Avoid_: Tutorial panel, help menu, onboarding page

**Field Plot**:
A tile that can hold one planted crop job.
_Avoid_: Farmland, crop tile

**Crop**:
A harvestable and plantable crop item stored in the Silo. Planting consumes an existing stored Crop item rather than a separate Seed item.
_Avoid_: Seed, plant item

**Animal Shelter**:
A placed structure that holds animals of one type.
_Avoid_: Pen, habitat, stable

**Structure**:
A built, tile-placed farm object that is not a Field Plot. Machines, Animal Shelters, the Delivery Board, and support objects such as the Tool Shed are Structures.
_Avoid_: Building, placed object

**Tool Shed**:
A small player-built support Structure that stores tools for Farm Resident work. It is not a Machine, Animal Shelter, storage, or Farmhouse Upgrade.
_Avoid_: Tool machine, storage shed, second Farmhouse

**Farm Shop**:
A player-built roadside Structure that holds Shop Stock and enables Customer Visits. It must be placed on the road-facing edge of the Farm.
_Avoid_: Market, delivery board, roadside decoration

**Shop Stock**:
Saved sellable Item stacks held by the Farm Shop, separate from Silo and Barn inventory. Shop Stock is moved in and out by Resident Tasks and can be bought by Customer Visits unless reserved.
_Avoid_: Market listing, storage inventory, offer

**Shop Price**:
The saved coin price a Customer Visit pays for one unit of a listed Shop Stock item if the visit buys it.
_Avoid_: Market price, delivery reward, item value

**Customer Visit**:
A scheduled elapsed-time opportunity for a roadside car to stop at the Farm Shop and buy one available unit from Shop Stock.
_Avoid_: Delivery order, market trade, visual-only car

**Customer Rejection**:
A Customer Visit that considers one listed Shop Stock item but buys nothing because the Shop Price demand roll fails.
_Avoid_: Failed delivery, customer cancellation, stock error

**Shop Sale**:
A successful Customer Visit that removes one unreserved Shop Stock unit, pays coins at the current Shop Price, and exposes a short-lived sale window for the client.
_Avoid_: Delivery fulfillment, manual sale

**Tool Source**:
An available place where Farm Residents can source tools before performing Resident Tasks. The Farmhouse is always a Tool Source, and a built Tool Shed can become another Tool Source for future resident travel timing.
_Avoid_: Tool inventory, resource source

**Tool**:
A durable named piece of equipment carried by a Farm Resident while performing work, such as a hoe, sickle, mixing bowl, oven mitt, feed bucket, collection pail, or wrench. Tools are not consumable catalog Items.
_Avoid_: Consumable item, ingredient

**Sickle**:
The canonical harvest Tool used by Farm Residents for crop harvesting.
_Avoid_: Scythe

**Tool Source Inventory**:
The limited stock of durable Tools held by a Tool Source. Farm Residents check Tools out into Resident Inventory and return them before becoming idle.
_Avoid_: Item storage, barn inventory

**Animal Product**:
A good collected from a fed animal and stored in the barn.
_Avoid_: Animal output

**Machine**:
A production building with a FIFO queue of recipes.
_Avoid_: Factory, workstation

**Recipe**:
A machine job definition with inputs, outputs, experience, and duration.
_Avoid_: Craft, formula

**Producing**:
A Machine job or fed animal is actively progressing toward an output.
_Avoid_: Working

**Ready Output**:
A produced good that has finished and is waiting to be collected, unless storage is full.
_Avoid_: Finished product

**Delivery Order**:
A generated request for unlocked goods that pays coins and experience.
_Avoid_: Truck order, shipment

**Storage Upgrade**:
An earned increase to Silo or Barn capacity purchased with coins after reaching its unlock level.
_Avoid_: Storage expansion, capacity boost

**Storage Source**:
A compatible place where Farm Residents can pick up or deposit item stacks. Today the Farm has one Silo for Crops and one Barn for non-Crop items, but Resident Task planning resolves sources through this concept.
_Avoid_: Tool Source, generic warehouse

**Item Reservation**:
An accepted Resident Task claim on stored item quantities that have not yet been physically picked up. Reserved quantities reduce available storage inventory for later Commands.
_Avoid_: Spent item, hidden inventory

**Tool Reservation**:
An accepted Resident Task claim on Tool Source Inventory that has not yet been physically picked up. Reserved Tools are unavailable to other Resident Tasks.
_Avoid_: Client lock, tool cooldown

**Silo**:
Crop storage.
_Avoid_: Crop barn

**Barn**:
Non-crop storage.
_Avoid_: Warehouse

**Command**:
A player intent submitted to the active runtime and applied deterministically.
_Avoid_: Action, mutation

**Interaction Tool**:
A client mode that determines how Farm scene input is interpreted, such as Select, Plant, Harvest, or Build. Interaction Tools prepare or submit Commands but are not durable farm Tools.
_Avoid_: Farm Tool, durable Tool, browser-only tool

**Sweep Harvest**:
A player gesture that harvests multiple ready Field Plots of the same Crop in the order the player sweeps over them.
_Avoid_: Multi-harvest, mass harvest, grain harvest
