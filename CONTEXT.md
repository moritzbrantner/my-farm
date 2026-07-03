# My Farm

My Farm is a local farming sim prototype about building an early production chain from crops, animal care, machine queues, and delivery orders. This glossary names the gameplay concepts used across the Rust core, server API, and browser client.

## Language

**Farm**:
The single playable world owned by the active runtime.
_Avoid_: Account, realm, world

**Farmhouse**:
The fixed home base for the Farm household. It anchors the Farm Residents in the playable Farm and is not a player-built production Structure.
_Avoid_: House building, home structure

**Farmhouse Upgrade**:
A durable improvement bought for the Farmhouse rather than placed on the farm grid. Farmhouse Upgrades use catalog-driven level and coin requirements and are saved as owned Farm state.
_Avoid_: Structure upgrade, house building

**Oven**:
The Farmhouse Upgrade that unlocks bread-family production from the Farmhouse kitchen. It keeps the old Bakery balance but is not a placed or movable Structure.
_Avoid_: Bakery, kitchen building

**Farm Resident**:
One of the two saved household members who can perform work on the Farm. Farm Residents have stable ids `woman` and `man` and editable display names.
_Avoid_: Character, avatar, worker

**Selected Resident**:
The currently active Farm Resident for player intent. The active runtime persists this selection so later Commands can attach work to the intended resident.
_Avoid_: Active character, current avatar

**Resident Task**:
A saved unit of Farm work assigned to a Farm Resident and advanced by elapsed Farm time. Resident Tasks are authoritative Farm state, not browser-only animation.
_Avoid_: Animation job, client task

**Resident Task Queue**:
The per-resident FIFO list of Resident Tasks saved on the Farm. Later work may enqueue physical production tasks here; empty queues still exist for each Farm Resident.
_Avoid_: Local queue, animation queue

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
A built, tile-placed farm object that is not a Field Plot. Machines, Animal Shelters, and the Delivery Board are Structures.
_Avoid_: Building, placed object

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
