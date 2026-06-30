# Sweep Harvest Is A Single Command

Sweep Harvest is represented as one authoritative core command instead of repeated browser-issued harvest commands.

The browser sends the ordered Field Plot ids touched by the player gesture. The Rust core owns readiness checks, same-Crop filtering, Silo capacity, inventory updates, experience, level changes, and event ordering.

This keeps one player intent as one command journal entry and one save version increment. It also avoids optimistic-version failures and network partial-success cases that would be easy to create if the browser sent one `harvest_crop` command per Field Plot.
