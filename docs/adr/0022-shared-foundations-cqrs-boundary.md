# Shared Foundations And Lightweight CQRS Application Boundary

Status: Accepted

Supersedes ADR 0001's decision to keep a permanently standalone mini-engine.

## Context

`my-farm` started as a prototype with a deliberately independent deterministic core. The game has since grown into a Rust-authoritative simulation consumed by server-backed web, browser-local WASM, and Expo clients. The old core now mixes generic simulation infrastructure with farming-specific rules in a single large engine module.

At the same time, `farm-game-engine` has been split into narrower foundation crates (`farm_catalog`, `farm_engine`, `farm_nav`, `farm_persistence`, and `farm_scenario`). Those crates are the intended home for reusable management-game infrastructure, but they are currently workspace-only (`publish = false`), so `my-farm` must not add a private cross-repository Git dependency that only works with ambient credentials.

## Decision

- `my-farm` owns farming semantics: crops, fields, animals, residents and their work, farmhouse behavior, production recipes, shop/economy rules, deliveries, and progression.
- The core exposes a lightweight CQRS/CQS application boundary for player/business intent. Commands mutate authoritative farm state through the application layer; queries derive read models without mutation.
- Time-driven simulation is explicitly outside CQRS dispatch. Elapsed-time processing, resident work progression, production completion, growth, and similar deterministic simulation work advance directly in the Rust core. They are not represented as commands merely to satisfy an architectural pattern.
- Domain capabilities are extracted from the legacy `engine.rs` incrementally. Field planting and harvesting are the first command family to receive a dedicated domain boundary.
- The existing mini-engine remains a compatibility adapter during migration. A domain slice may delegate to it until that slice's state-transition implementation can move without duplicating validation or changing behavior.
- Generic deterministic simulation, navigation, catalog, scenario, and persistence primitives should move to or be consumed from the matching `farm-game-engine` foundation crates instead of being reimplemented locally.
- A shared foundation dependency may be introduced only when it is reproducibly consumable by CI, for example through a versioned/published artifact or another explicit dependency mechanism that does not require undeclared private-repository credentials.
- The Rust server, WASM Pages runtime, web client, and Expo client are adapters around the same authoritative game semantics. Transport and persistence can differ; gameplay rules cannot.
- SQLite remains authoritative persistence for the local-server game. `FarmEvent` remains a command outcome/integration signal; this decision does not introduce event sourcing.
- Generated contracts remain committed and checked for drift.
- A fail-closed `Validate` workflow must cover Rust tests, formatting, contract drift, mobile logic tests, and both web and Pages builds before architectural migrations are integrated.

## Consequences

The migration is intentionally incremental. New application feature work should prefer explicit command/query and domain boundaries without forcing simulation systems through handlers, mediators, buses, or projections. Hot and time-driven core paths remain ordinary deterministic Rust calls.

The first field slice extracts command ownership and routing without copying the mature resident-task planning logic. Moving the actual field state-transition implementation is a follow-up once the shared simulation/navigation seams are consumable; until then, the compatibility adapter remains the single implementation of those invariants.

CQRS infrastructure is not a portfolio requirement for foundations such as tables, maps, charts, rendering, physics, or runtime/game-server internals. Those components keep the data-oriented, state-oriented, algorithmic, or actor/runtime architecture appropriate to their performance and ownership constraints.
