# Scenario 07: Blocked Work and Storage

[[Back to Basic Farm Scenarios|Basic-Farm-Scenarios]] | Previous: [[Scenario 06: Making Bread|Scenario-06-Making-Bread]] | Next: none

## What this teaches

The Farm should expose why work cannot proceed. Reserved targets, missing carried state, and full storage are explicit states, not silent failures.

## Farm setup

Use any one of these setup shapes:

- A Field Plot already has a pending Resident Task reservation.
- A Farm Resident has a task whose saved execution plan no longer matches required Farm state.
- The Silo or Barn has no room for the output that a task would deposit.

## Player steps

1. Try to interact with a Field Plot that is already reserved by resident work.
2. Or select a Farm Resident whose Resident Details show blocked work.
3. Or inspect a ready output whose destination storage is full.
4. Read the reason shown by the UI before deciding what to do next.

## What changes on the farm

- A reserved Field Plot should explain that it is reserved instead of accepting conflicting work.
- A blocked resident should show `Blocked` in Resident Details.
- A blocked reason should describe the missing invariant, such as missing carried items.
- A storage-full state should prevent harvest or collection until storage room exists.
- The Farm remains deterministic because failed or stalled work is represented in state.

## What the model calls this

- A Blocked Resident Task is accepted work that cannot currently advance.
- A Reserved Work Target is a Farm object claimed by a pending or producing task.
- An Item Reservation claims stored item quantities before physical pickup.
- A Tool Reservation claims durable Tools before physical pickup.
- A Storage Source is the compatible place where item stacks can be picked up or deposited.
- Crop outputs use the Silo; non-Crop outputs use the Barn.

## Suggested visual callouts

- Resident Details reason for `Blocked` work.
- Field Plot text showing reservation by a resident's task.
- Ready output status that includes storage full.
- Silo or Barn storage count at capacity.

## Related terms

- Blocked Resident Task
- Resident Details
- Resident Task
- Resident Task Queue
- Reserved Work Target
- Item Reservation
- Tool Reservation
- Storage Source
- Silo
- Barn

## Not covered here

This scenario does not cover storage upgrades, discarding inventory, market trading, Delivery Orders, Farm Shop stock, Tool Shed sourcing, animals, or Machine output.
