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

**Room**:
A named area inside the House Interior, such as the Living Room, Kitchen, or Bedroom. Starter Rooms use fixed Room Tile grids.
_Avoid_: Scene, level, screen

**Room Door**:
A fixed Room exit affordance that returns the player from a Room to the House Overview.
_Avoid_: Back button, tab

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

**Start Oven Recipe**:
A Resident Task step where a Farm Resident stands at the Oven Workstation and turns a pending Oven recipe into an active baking job.
_Avoid_: Instant oven queueing, make cake

**Resident Task Queue**:
The per-resident FIFO list of Resident Tasks saved on the Farm. Later work may enqueue physical production tasks here; empty queues still exist for each Farm Resident.
_Avoid_: Local queue, animation queue

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
The final cleanup step appended to Resident Tasks so the Farm Resident walks back to a Tool Source after completing assigned work and deposits.
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
A harvestable plant stored in the silo.
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

**Tool Source**:
An available place where Farm Residents can source tools before performing Resident Tasks. The Farmhouse is always a Tool Source, and a built Tool Shed can become another Tool Source for future resident travel timing.
_Avoid_: Tool inventory, resource source

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

**Silo**:
Crop storage.
_Avoid_: Crop barn

**Barn**:
Non-crop storage.
_Avoid_: Warehouse

**Command**:
A player intent submitted to the active runtime and applied deterministically.
_Avoid_: Action, mutation

**Sweep Harvest**:
A player gesture that harvests multiple ready Field Plots of the same Crop in the order the player sweeps over them.
_Avoid_: Multi-harvest, mass harvest, grain harvest
