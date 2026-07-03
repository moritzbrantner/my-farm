# Resident Task Timing Is Queued

Resident Task step durations are snapshotted onto each queued step when the task is created.

The queue owns when each step becomes ready, so timing must stay stable even if the Farm later builds or moves a Tool Shed, rebalance data changes, or a client reconnects. The browser continues to render progress from the authoritative `started_at_ms` and `ready_at_ms` values instead of recomputing task timing locally.

Until Tool Shed distance timing is introduced, new Resident Task steps use the Farmhouse Tool Source baseline and store the previous 2000 ms step duration. Older queued task steps that do not have a stored duration deserialize with the same 2000 ms default so existing saves keep their prior behavior.
