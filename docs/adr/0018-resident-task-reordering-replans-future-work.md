# Resident Task Reordering Replans Future Work

Farm Residents can now have multiple queued Resident Tasks that the player may want to inspect and reprioritize. Resident Task Queues are authoritative Farm state, and queued tasks include planned paths, resource pickups, tool checkout, deposits, cleanup, and reservations.

Resident Task Reordering is therefore an authoritative Command. The current Resident Task at the head of the queue is locked because it may already be walking, carrying items, or holding tools. Only future queued tasks may move.

When a future task is reordered, the core replans all future tasks for that resident from the fixed current task tail. Replanning preserves task ids but recomputes timings, paths, resource movement, tool handling, and cleanup. The browser waits for the command response and does not treat drag order as local truth.

If the reordered future queue cannot be replanned safely, the command is rejected and the saved queue remains unchanged. The runtime does not convert a failed reorder into a Blocked Resident Task, because the player asked to change priority rather than accept impossible work.

This keeps Resident Task Queue behavior deterministic across server, browser demo, reloads, and future clients while still allowing a concise drag-and-preview UI.
