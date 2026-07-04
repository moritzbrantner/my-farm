# Source-Aware Resident Cleanup

Resident pickup, deposit, and return steps now route to the explicit source or destination encoded on the step, and carried Tools remember the Tool Source where they were checked out. This keeps Silo pickups, Tool Shed checkouts, storage deposits, and tool returns visible and source-correct while preserving same-resident chaining through carried inventory.

Idle Farm Residents with carried items or Tools receive explicit cleanup work instead of being silently normalized. Cleanup is skipped and reported as blocked when storage capacity would be exceeded, because overfilling or discarding carried items would hide a real Farm-state constraint.
