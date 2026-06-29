# SQLite Local Authoritative Server

The local Axum server is authoritative for farm state and persists the single farm to SQLite. This adds more setup than a JSON save file, but it gives the prototype durable state, a command journal, and a migration path close to a future server-backed implementation.

