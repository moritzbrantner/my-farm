# Resident Task Queue Is a Deep Module

Resident Task Queue behavior is owned by the authoritative Rust core behind a deeper module interface. Commands submit Farm work intent, while queue planning, resource transfer, Tool checkout, path snapshots, timing, execution, reservations, and browser projection are kept behind that module's implementation.

The saved queue may keep a detailed execution plan so queued timing and Resident Paths remain stable across reloads, but browser-facing FarmView no longer exposes raw queue internals as the main interface. FarmView exposes Resident work projection data for status, scene pose, path, carry summary, typed targets, reservations, and blocked state.

This intentionally breaks older prototype saves that contain the prior Resident Task Queue contract. Server and browser-local demo adapters reset incompatible saves to a fresh Farm and return a `save_reset` notice instead of attempting a partial migration.

Blocked Resident Tasks are preserved and surfaced when queued work cannot advance. The runtime does not silently skip broken steps or fall back to global storage when Resident Inventory should be authoritative.
