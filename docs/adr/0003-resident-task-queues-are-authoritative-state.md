# Resident Task Queues Are Authoritative State

Farm Residents introduce household identity and per-resident work over elapsed Farm time. Their task queues are saved on `FarmState` and owned by the authoritative runtime instead of being derived from browser-only animation state.

This keeps resident selection, renamed residents, queued work, reserved targets, and elapsed progress deterministic across reloads and across future clients. The browser may animate Resident Tasks, but it treats the server/core view as the source of truth.

This slice only establishes the saved resident identity and queue contract. Physical work Commands continue to behave as they did before and will be converted into Resident Tasks in later slices.
