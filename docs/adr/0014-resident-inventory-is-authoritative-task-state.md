# Resident Inventory Is Authoritative Task State

Farm Residents now carry item stacks and durable tools as saved Farm state while executing Resident Tasks.

Resident Inventory is authoritative, not client animation state. Resident Task planning inserts explicit pickup, work, deposit, and return steps so Commands can reserve resources deterministically while still showing physical resource movement. Stored inventory exposes both reserved and available quantities so later Commands cannot spend items already claimed by queued resident work.

Tools are durable equipment checked out from limited Tool Source Inventory. The Farmhouse starts with one of each tool, and a Tool Shed adds another set. Tools are returned before a Farm Resident becomes idle.

This supports visible resource flow, same-resident chaining through Projected Resident Inventory, and deterministic command acceptance across reloads. The trade-off is a more complex task planner and a client UI that must distinguish stored, reserved, available, and carried quantities.
