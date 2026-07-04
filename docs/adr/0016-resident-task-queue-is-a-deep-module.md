# Resident Task Queue Is a Deep Module

Resident Task Queue behavior is owned by the authoritative Rust core behind a deeper module interface. Commands submit Farm work intent, while queue planning, resource transfer, Tool checkout, path snapshots, timing, execution, reservations, and browser projection are kept behind that module's implementation.

The saved queue may keep a detailed execution plan so queued timing and Resident Paths remain stable across reloads, but browser-facing FarmView no longer exposes raw queue internals as the main interface. FarmView exposes Resident work projection data for status, scene pose, path, carry summary, typed targets, reservations, and blocked state.

Browser production UI consumes `resident_work` and `reservations` rather than raw Resident Task Queue or Resident Inventory state. The Farm Scene uses that projection for immediate task, movement, target, selected-path, and blocked cues. Resident Details is the full selected-Farm Resident inspection surface for current task state, current step, target, progress, carried Resident Inventory, blocked reason, and expandable queued Resident Tasks.

Current carried Resident Inventory is distinct from projected future inventory and reservations. Resident Details may show what a Farm Resident is carrying now; future resource movement belongs in queued step details and `reservations`.

This intentionally breaks older prototype saves that contain the prior Resident Task Queue contract. Server and browser-local demo adapters reset incompatible saves to a fresh Farm and return a `save_reset` notice instead of attempting a partial migration.

Blocked Resident Tasks are preserved and surfaced when queued work cannot advance. The runtime does not silently skip broken steps or fall back to global storage when Resident Inventory should be authoritative.
