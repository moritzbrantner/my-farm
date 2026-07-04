# Resident Walking Paths Are Authoritative

Farm Residents physically walk to work before each Resident Task step starts. Their current Farm Tile is saved as authoritative state, and newly queued work snapshots the path they will walk for each step.

Resident Paths use cardinal movement on the Farm grid. Structures block walking across their full footprint; Field Plots are walkable because residents need to work on and cross crop tiles. Structure work targets an adjacent reachable Approach Tile outside the footprint, while Field Plot work uses the Field Plot Tile itself.

Walking time and work time are stored separately on each Resident Task step. The total step `duration_ms` remains available for compatibility and equals `walk_duration_ms + work_duration_ms` for newly queued work. Legacy task steps without path fields continue loading with their previous duration behavior.

Resident Tasks may include post-work storage and cleanup steps. Harvested crops are deposited through explicit Silo steps, non-crop outputs are deposited through explicit Barn steps, and tools are returned through a Tool Source step after the task's work is done. Inventory from harvest and collection work appears when the matching deposit step completes; legacy queued work without deposit steps keeps the previous immediate inventory behavior.

Queued paths reserve their path tiles for placement. Building or moving a Structure onto an uncompleted Resident Path is rejected so a queued resident never walks through a Structure that was placed after the task was accepted.
