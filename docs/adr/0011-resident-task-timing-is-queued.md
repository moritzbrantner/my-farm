# Resident Task Timing Is Queued

Resident Task step durations are snapshotted onto each queued step when the task is created.

The queue owns when each step becomes ready, so timing must stay stable even if the Farm later builds or moves a Tool Shed, rebalance data changes, or a client reconnects. The browser continues to render progress from the authoritative `started_at_ms` and `ready_at_ms` values instead of recomputing task timing locally.

New Resident Task steps use the closest available Tool Source at queue time. The Farmhouse is always available, and a built Tool Shed can become the closer source for future tasks. Each step stores its authoritative duration so already queued work is not affected by later Tool Shed builds or moves.

Distance timing is 1000 ms of base work plus 250 ms per walked tile. Newer queued steps snapshot the actual Resident Path used for walking; see ADR 0012. Multi-step tasks fetch tools once for the first step, then walk between reserved work targets for later steps. Older queued task steps that do not have a stored duration deserialize with the previous 2000 ms default so existing saves keep their prior behavior.
