# Standalone Mini Engine

Status: Superseded by [ADR 0022: Shared Foundations And CQRS Application Boundary](0022-shared-foundations-cqrs-boundary.md).

## Historical decision

My Farm started as a standalone project with its own small deterministic game core instead of depending on `farm-game-engine`. The core deliberately kept compatible ideas such as commands, view DTOs, generated contracts, and integration-style tests so successful concepts could be upstreamed later without coupling the prototype to engine churn.

That incubation decision served its purpose. The game and the shared foundations have now matured enough that reusable infrastructure should converge behind explicit application/domain seams rather than continue growing independently.
