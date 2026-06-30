# My Farm

My Farm is a local farming sim prototype about building an early production chain from crops, animal care, machine queues, and delivery orders. This glossary names the gameplay concepts used across the Rust core, server API, and browser client.

## Language

**Farm**:
The single local playable world owned by the local server.
_Avoid_: Account, realm, world

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

**Delivery Order**:
A generated request for unlocked goods that pays coins and experience.
_Avoid_: Truck order, shipment

**Silo**:
Crop storage.
_Avoid_: Crop barn

**Barn**:
Non-crop storage.
_Avoid_: Warehouse

**Command**:
A player intent submitted to the server and applied deterministically.
_Avoid_: Action, mutation
